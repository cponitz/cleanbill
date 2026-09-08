"""Create a claim code for ANY Travis County property (test walkthroughs, friend tests, inbound requests).

Searches the full TCAD roll in the local DuckDB (all 493K accounts, not just the lead list), builds the refund estimate,
inserts the property + lead into Supabase, and prints the claim link. Works even if the property already has a
homestead exemption (it is flagged, so ops knows the "refund" is a test).

  python -m trd.ops.new_claim --address "3675 DUVAL ST"                 # search by street address (partial ok)
  python -m trd.ops.new_claim --prop-id 381397                          # by TCAD account number
  python -m trd.ops.new_claim --address "9209 BRADNER" --create         # actually create the lead (default: preview only)
  python -m trd.ops.new_claim --address "..." --create --owner-override "Jane Q Owner"   # if the roll owner differs (recent sale)
Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Site base via SITE_BASE (default GitHub Pages URL).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

import duckdb

from trd.estimator.refund import conservative_display, estimate_refund
from trd.etl.leads import new_claim_code

DB = Path(os.environ.get("TCAD_DB", "data/tcad.duckdb"))
SITE_BASE = os.environ.get("SITE_BASE", "https://cponitz.github.io/homestead-refund/docs")


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").upper().replace(".", "").replace(",", " ")).strip()


def search(con: duckdb.DuckDBPyConnection, address: str | None, prop_id: int | None, limit: int = 8) -> list[dict]:
    base = """select prop_id, py_owner_name as owner_name, py_addr_line1 as owner_addr1, py_addr_line2 as owner_addr2,
                     py_addr_city as owner_city, py_addr_state as owner_state, py_addr_zip as owner_zip,
                     situs_num, trim(coalesce(situs_street_prefx,'') || ' ' || coalesce(situs_street,'') || ' ' || coalesce(situs_street_suffix,'')) as street,
                     coalesce(situs_unit,'') as situs_unit, situs_city, situs_zip, legal_desc,
                     imprv_state_cd as state_cd, prop_type_cd as prop_type, appraised_val, market_value, deed_dt as deed_date,
                     coalesce(hs_exempt,false) as hs_exempt, coalesce(ov65_exempt,false) as ov65_exempt
              from appraisal_info"""
    if prop_id:
        rows = con.execute(base + " where prop_id = ?", [prop_id]).df()
    else:
        a = _norm(address or "")
        m = re.match(r"^(\d+[A-Z]?)\s+(.+)$", a)
        num, rest = (m.group(1), m.group(2)) if m else ("", a)
        # first street word after the number (drop a leading direction like N/S/E/W for matching)
        words = [w for w in rest.split(" ") if w]
        if words and words[0] in ("N", "S", "E", "W", "NORTH", "SOUTH", "EAST", "WEST") and len(words) > 1:
            words = words[1:]
        key = words[0] if words else ""
        q = base + " where upper(coalesce(situs_street,'')) like ? " + ("and situs_num = ? " if num else "") + " order by situs_num, situs_unit limit ?"
        params = [f"%{key}%"] + ([num] if num else []) + [limit * 5]
        rows = con.execute(q, params).df()
        # rank by how many of the typed words appear in the full street name
        def score(r):
            s = _norm(f"{r['situs_num']} {r['street']}")
            return sum(1 for w in words if w in s)
        if len(rows):
            rows["score"] = rows.apply(score, axis=1)
            rows = rows.sort_values(["score", "situs_num"], ascending=[False, True]).head(limit)
    out = []
    for r in rows.to_dict("records"):
        r = {k: (None if (isinstance(v, float) and v != v) else v) for k, v in r.items()}
        street = re.sub(r"\s+", " ", str(r["street"] or "")).strip()
        unit = f" UNIT {r['situs_unit']}" if r.get("situs_unit") else ""
        city = r.get("situs_city") or r.get("owner_city") or "AUSTIN"
        r["situs_street"] = street
        r["situs_full"] = f"{r['situs_num']} {street}{unit}, {city}, TX {str(r.get('situs_zip') or '')[:5]}".replace("  ", " ")
        dd = r.get("deed_date")
        r["deed_date"] = None if dd is None or str(dd) in ("NaT", "None", "nan") else (dd.date().isoformat() if hasattr(dd, "date") else str(dd)[:10])
        out.append(r)
    return out


def create_lead(prop: dict, as_of: date, owner_override: str | None = None) -> dict:
    from supabase import create_client
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    owned = date.fromisoformat(prop["deed_date"]) if prop.get("deed_date") else None
    est = estimate_refund(float(prop["appraised_val"] or 0), as_of, owned_since=owned)
    earliest, latest = min(est.refund_years) if est.refund_years else as_of.year, max(est.refund_years) if est.refund_years else as_of.year
    tier = 1 if (owned is None or owned <= date(earliest, 1, 1)) else 2 if owned <= date(latest, 1, 1) else 3
    prow = {
        "prop_id": int(prop["prop_id"]), "tax_year": 2026, "owner_name": owner_override or prop["owner_name"],
        "owner_addr1": prop.get("owner_addr1"), "owner_addr2": prop.get("owner_addr2"), "owner_city": prop.get("owner_city"),
        "owner_state": prop.get("owner_state"), "owner_zip": prop.get("owner_zip"),
        "situs_num": str(prop["situs_num"]), "situs_street": prop["situs_street"], "situs_unit": prop.get("situs_unit") or None,
        "situs_city": prop.get("situs_city"), "situs_zip": str(prop.get("situs_zip") or "")[:5] or None, "situs_full": prop["situs_full"],
        "legal_desc": prop.get("legal_desc"), "state_cd": prop.get("state_cd"), "prop_type": prop.get("prop_type"),
        "market_value": prop.get("market_value"), "appraised_value": prop.get("appraised_val"), "deed_date": prop.get("deed_date"),
        "hs_exempt": bool(prop.get("hs_exempt")), "ov65_exempt": bool(prop.get("ov65_exempt")),
    }
    sb.table("properties").upsert(prow, on_conflict="prop_id").execute()
    existing = sb.table("leads").select("claim_code, status").eq("prop_id", int(prop["prop_id"])).execute().data
    if existing:
        return {"claim_code": existing[0]["claim_code"], "status": existing[0]["status"], "existing": True, "est": est}
    code = new_claim_code()
    lrow = {
        "prop_id": int(prop["prop_id"]), "claim_code": code, "tier": tier, "refund_years": est.refund_years,
        "est_refund_total": est.refund_total, "est_refund_by_year": {str(y): {"total": s["total"]} for y, s in est.by_year.items()},
        "est_forward_annual": est.forward_annual, "estimate_unconfirmed": est.unconfirmed or bool(prop.get("hs_exempt")), "status": "new",
    }
    sb.table("leads").insert(lrow).execute()
    sb.table("audit_log").insert({"actor": "ops-cli", "action": "lead_created_manually", "entity": "leads", "entity_id": code,
                                  "detail": {"prop_id": int(prop["prop_id"]), "hs_exempt": bool(prop.get("hs_exempt")), "owner_override": owner_override}}).execute()
    return {"claim_code": code, "status": "new", "existing": False, "est": est}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--address", help="street address, e.g. '3675 DUVAL ST' (partial street name ok)")
    ap.add_argument("--prop-id", type=int, help="TCAD account number")
    ap.add_argument("--create", action="store_true", help="create the lead (default: preview matches only)")
    ap.add_argument("--pick", type=int, default=1, help="which search result to use (1-based) when creating")
    ap.add_argument("--owner-override", default=None, help="owner name to store if the roll is stale (e.g., recent purchase)")
    ap.add_argument("--as-of", default=date.today().isoformat())
    a = ap.parse_args()
    if not a.address and not a.prop_id:
        ap.error("--address or --prop-id required")
    con = duckdb.connect(str(DB), read_only=True)
    hits = search(con, a.address, a.prop_id)
    if not hits:
        print("No match in the roll. Try fewer words (house number + first street word), or the TCAD account number."); return 1
    for i, h in enumerate(hits, 1):
        flags = " ".join(f for f, on in (("HS", h["hs_exempt"]), ("OV65", h["ov65_exempt"])) if on) or "no exemptions"
        print(f"{i}. #{h['prop_id']}  {h['situs_full']}  | {h['owner_name']} | ${float(h['appraised_val'] or 0):,.0f} | deed {h['deed_date']} | {flags} | state {h['state_cd']}")
    if not a.create:
        print("\nPreview only. Re-run with --create [--pick N] to make a claim code."); return 0
    prop = hits[a.pick - 1]
    res = create_lead(prop, date.fromisoformat(a.as_of), a.owner_override)
    est = res["est"]
    print(f"\n{'Existing' if res['existing'] else 'Created'} claim {res['claim_code']} (status {res['status']}) for #{prop['prop_id']} {prop['situs_full']}")
    print(f"Estimate: ${conservative_display(est.refund_total):,} shown (raw ${est.refund_total:,.2f}) for {est.refund_years}; forward ${est.forward_annual:,.0f}/yr"
          + ("  ** property already has a homestead exemption — test only **" if prop["hs_exempt"] else ""))
    print(f"Link: {SITE_BASE}/claim.html?c={res['claim_code']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
