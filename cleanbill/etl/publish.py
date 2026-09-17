"""Publish a leads CSV into Supabase (properties + leads + property_entities). Idempotent on prop_id: existing leads are left alone.

    python -m cleanbill.etl.publish --leads data/out/leads.csv [--limit 500] [--dry-run]
    python -m cleanbill.etl.publish --leads data/out/leads.csv --update-estimates   # also refresh the estimate columns of EXISTING leads
                                                                             # (SPEC-01 re-estimate); never touches claim_code or status

Also used from the sandbox via `--sql-out` to emit batched INSERT statements when direct network access isn't available.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import pandas as pd

from cleanbill.estimator.rates import unit


PUBLISH_TIERS = (1, 2)   # Tier 3 (bought this year: bill reduction only, never mailed) is never published


def rows_from_csv(path: Path, limit: int | None = None, tax_year: int = 2026, tiers: tuple[int, ...] = PUBLISH_TIERS) -> tuple[list[dict], list[dict], list[dict]]:
    """-> (properties, leads, property_entities) rows for the CSV written by cleanbill.etl.leads, restricted to `tiers`."""
    df = pd.read_csv(path, dtype={"situs_zip": str, "owner_zip": str, "situs_num": str, "situs_unit": str})
    if "tier" in df: df = df[df["tier"].astype(int).isin(tiers)]
    if limit: df = df.head(limit)
    props, leads, ents = [], [], []
    for r in df.itertuples(index=False):
        d = r._asdict()
        props.append({
            "prop_id": int(d["prop_id"]), "tax_year": tax_year, "owner_name": d.get("owner_name"),
            "owner_addr1": d.get("owner_addr1"), "owner_addr2": d.get("owner_addr2") if isinstance(d.get("owner_addr2"), str) else None,
            "owner_city": d.get("owner_city"), "owner_state": d.get("owner_state"), "owner_zip": d.get("owner_zip"),
            "situs_num": d.get("situs_num"), "situs_street": " ".join(str(d.get("situs_line", "")).split()[1:]) or None,
            "situs_unit": d.get("situs_unit") if isinstance(d.get("situs_unit"), str) and d.get("situs_unit") else None,
            "situs_city": d.get("situs_city"), "situs_zip": str(d.get("situs_zip"))[:5] if d.get("situs_zip") else None, "situs_full": d.get("situs_full"),
            "state_cd": d.get("state_cd"), "prop_type": d.get("prop_type"), "market_value": d.get("market_value"), "appraised_value": d.get("appraised_val"),
            "deed_date": d.get("deed_date") if isinstance(d.get("deed_date"), str) else None, "hs_exempt": False,
        })
        ry = d.get("refund_years")
        if isinstance(ry, str): ry = json.loads(ry.replace("'", '"'))
        leads.append({
            "prop_id": int(d["prop_id"]), "claim_code": d["claim_code"], "tier": int(d["tier"]), "refund_years": ry,
            "est_refund_total": float(d["est_refund_total"]), "est_refund_by_year": json.loads(d["est_refund_by_year"]) if isinstance(d["est_refund_by_year"], str) else d["est_refund_by_year"],
            "est_forward_annual": float(d["est_forward_annual"]), "estimate_unconfirmed": bool(d.get("estimate_unconfirmed", False)), "status": "new",
        })
        ej = d.get("entities")
        for e in (json.loads(ej) if isinstance(ej, str) and ej else []):
            ents.append({"prop_id": int(d["prop_id"]), "entity_cd": e["entity_cd"], "entity_name": e.get("entity_name"),
                         "entity_type": (unit(e["entity_cd"]) or {}).get("type", "other"),
                         "taxable_value": e.get("taxable_val"), "assessed_value": e.get("assessed_val"), "partial": bool(e.get("partial", False))})
    def clean(d: dict) -> dict:
        return {k: (None if isinstance(v, float) and pd.isna(v) else v) for k, v in d.items()}
    return [clean(p) for p in props], [clean(l) for l in leads], [clean(e) for e in ents]


def sql_literal(v) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)): return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, list): return "array[" + ",".join(str(int(x)) for x in v) + "]"
    if isinstance(v, dict): return "'" + json.dumps(v).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


ESTIMATE_COLS = ("refund_years", "est_refund_total", "est_refund_by_year", "est_forward_annual", "estimate_unconfirmed")


def to_sql(props: list[dict], leads: list[dict], ents: list[dict] | None = None, batch: int = 300, update_estimates: bool = False) -> list[str]:
    stmts = []
    pcols = list(props[0].keys()); lcols = list(leads[0].keys())
    for i in range(0, len(props), batch):
        vals = ",\n".join("(" + ",".join(sql_literal(p[c]) for c in pcols) + ")" for p in props[i:i + batch])
        stmts.append(f"insert into properties ({','.join(pcols)}) values\n{vals}\non conflict (prop_id) do nothing;")
        vals = ",\n".join("(" + ",".join(sql_literal(l[c]) for c in lcols) + ")" for l in leads[i:i + batch])
        stmts.append(f"insert into leads ({','.join(lcols)}) values\n{vals}\non conflict (claim_code) do nothing;")
    if update_estimates:
        for l in leads:
            sets = ", ".join(f"{c} = {sql_literal(l[c])}" for c in ESTIMATE_COLS)
            stmts.append(f"update leads set {sets} where prop_id = {int(l['prop_id'])};")
    ecols = list(ents[0].keys()) if ents else []
    for i in range(0, len(ents or []), batch * 5):
        vals = ",\n".join("(" + ",".join(sql_literal(e[c]) for c in ecols) + ")" for e in ents[i:i + batch * 5])
        stmts.append(f"insert into property_entities ({','.join(ecols)}) values\n{vals}\non conflict (prop_id, entity_cd) do update set "
                     + ", ".join(f"{c} = excluded.{c}" for c in ecols if c not in ("prop_id", "entity_cd")) + ";")
    return stmts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--leads", required=True)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sql-out", default=None, help="write batched SQL to this file instead of using the network")
    ap.add_argument("--update-estimates", action="store_true", help="refresh refund_years/est_* /estimate_unconfirmed on leads that already exist")
    ap.add_argument("--tiers", default=",".join(map(str, PUBLISH_TIERS)), help="tiers to publish (default 1,2; Tier 3 is never mailed)")
    a = ap.parse_args()
    props, leads, ents = rows_from_csv(Path(a.leads), a.limit, tiers=tuple(int(t) for t in a.tiers.split(",")))
    print(f"{len(props)} properties, {len(leads)} leads, {len(ents)} property-unit rows")
    if a.sql_out:
        Path(a.sql_out).write_text("\n\n".join(to_sql(props, leads, ents, update_estimates=a.update_estimates)))
        print(f"wrote {a.sql_out}"); return
    if a.dry_run: return
    from supabase import create_client
    import httpx

    def connect():
        return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    sb = connect()

    def run(build):
        """Execute a PostgREST call; on a dropped connection reconnect and retry (Supabase closes an HTTP/2 connection after ~10K requests)."""
        nonlocal sb
        for attempt in range(4):
            try:
                return build(sb).execute()
            except (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError, httpx.WriteError):
                if attempt == 3: raise
                sb = connect()

    for i in range(0, len(props), 500):
        if i and i % 2000 == 0: sb = connect()   # fresh connection well before the per-connection request cap
        run(lambda c: c.table("properties").upsert(props[i:i + 500], on_conflict="prop_id", ignore_duplicates=True))
        existing = {r["prop_id"] for r in run(lambda c: c.table("leads").select("prop_id").in_("prop_id", [l["prop_id"] for l in leads[i:i + 500]])).data}
        new = [l for l in leads[i:i + 500] if l["prop_id"] not in existing]
        if new: run(lambda c: c.table("leads").insert(new))
        if a.update_estimates:  # SPEC-01 re-estimate of leads already published (claim_code, status, tier untouched)
            for l in leads[i:i + 500]:
                if l["prop_id"] in existing:
                    run(lambda c, l=l: c.table("leads").update({k: l[k] for k in ESTIMATE_COLS}).eq("prop_id", l["prop_id"]))
        print(f"batch {i // 500 + 1}: {len(new)} new leads" + (f", {len(existing)} estimates refreshed" if a.update_estimates else ""), flush=True)
    # property_entities: upsert for every published property (SPEC-01) — units can change between roll supplements
    for i in range(0, len(ents), 1000):
        run(lambda c: c.table("property_entities").upsert(ents[i:i + 1000], on_conflict="prop_id,entity_cd"))
    print(f"{len(ents)} property_entities rows upserted")


if __name__ == "__main__":
    main()
