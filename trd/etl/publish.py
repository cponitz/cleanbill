"""Publish a leads CSV into Supabase (properties + leads). Idempotent on prop_id: existing leads are left alone.

    python -m trd.etl.publish --leads data/out/leads.csv [--limit 500] [--dry-run]

Also used from the sandbox via `--sql-out` to emit batched INSERT statements when direct network access isn't available.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import pandas as pd


def rows_from_csv(path: Path, limit: int | None = None, tax_year: int = 2026) -> tuple[list[dict], list[dict]]:
    df = pd.read_csv(path, dtype={"situs_zip": str, "owner_zip": str, "situs_num": str, "situs_unit": str})
    if limit: df = df.head(limit)
    props, leads = [], []
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
    def clean(d: dict) -> dict:
        return {k: (None if isinstance(v, float) and pd.isna(v) else v) for k, v in d.items()}
    return [clean(p) for p in props], [clean(l) for l in leads]


def sql_literal(v) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)): return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, list): return "array[" + ",".join(str(int(x)) for x in v) + "]"
    if isinstance(v, dict): return "'" + json.dumps(v).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def to_sql(props: list[dict], leads: list[dict], batch: int = 300) -> list[str]:
    stmts = []
    pcols = list(props[0].keys()); lcols = list(leads[0].keys())
    for i in range(0, len(props), batch):
        vals = ",\n".join("(" + ",".join(sql_literal(p[c]) for c in pcols) + ")" for p in props[i:i + batch])
        stmts.append(f"insert into properties ({','.join(pcols)}) values\n{vals}\non conflict (prop_id) do nothing;")
        vals = ",\n".join("(" + ",".join(sql_literal(l[c]) for c in lcols) + ")" for l in leads[i:i + batch])
        stmts.append(f"insert into leads ({','.join(lcols)}) values\n{vals}\non conflict (claim_code) do nothing;")
    return stmts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--leads", required=True)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sql-out", default=None, help="write batched SQL to this file instead of using the network")
    a = ap.parse_args()
    props, leads = rows_from_csv(Path(a.leads), a.limit)
    print(f"{len(props)} properties, {len(leads)} leads")
    if a.sql_out:
        Path(a.sql_out).write_text("\n\n".join(to_sql(props, leads)))
        print(f"wrote {a.sql_out}"); return
    if a.dry_run: return
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    for i in range(0, len(props), 500):
        sb.table("properties").upsert(props[i:i + 500], on_conflict="prop_id", ignore_duplicates=True).execute()
        existing = {r["prop_id"] for r in sb.table("leads").select("prop_id").in_("prop_id", [l["prop_id"] for l in leads[i:i + 500]]).execute().data}
        new = [l for l in leads[i:i + 500] if l["prop_id"] not in existing]
        if new: sb.table("leads").insert(new).execute()
        print(f"batch {i // 500 + 1}: {len(new)} new leads")


if __name__ == "__main__":
    main()
