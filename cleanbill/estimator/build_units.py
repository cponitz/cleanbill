"""Build cleanbill/estimator/rates/units.json — one entry per Travis County taxing unit and tax year — from primary sources.

Inputs (all public):
  --rates    Travis County Tax Office truth-in-taxation summary (qryJurisRateWeb<year>.xls): adopted total rate per $100
             for every unit, current year + previous four. Keyed by TCAD entity code (column "TCAD"), the same code as
             PROP_ENT / property_entities.  https://www.traviscountytx.gov/tax-rates
  --listing  TCAD's Exemption Listing Report for a year, as text (`pdftotext -layout <pdf>`): per unit, each exemption
             type's state amount, local-option percent, local-option minimum, local-option amount, freeze ceiling.
             https://traviscad.org/homesteadexemptions -> "list of Travis County taxing entities and their exemptions"
  --db       (optional) the DuckDB roll with appraisal_entity_info loaded: cross-checks each unit's HS rule against
             assessed - taxable on HS-only residential accounts (share of accounts with zero exemption, median percent).

Confirmation rule (what `*_confirmed` means): a figure is confirmed when it comes from a primary source for THAT tax
year, from statute, or is an assumption that can only UNDERSTATE a refund (a unit that shows no exemption in the
listing is assumed to have had none in earlier years — if it did, the homeowner is owed more, never less). A local-
option percentage or amount carried back from the listing year to an earlier year could overstate, so it is
unconfirmed until a source for that year is added to RESEARCHED below. Leads touching any unconfirmed figure get
leads.estimate_unconfirmed = true and are excluded from batch selection (SPEC-01 §4).

Usage:
  python -m cleanbill.estimator.build_units --rates data/raw/qryJurisRateWeb2026.xls --listing data/raw/2026_listing.txt \
      --listing-year 2026 --db data/tcad.duckdb --out cleanbill/estimator/rates/units.json
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path

TAX_YEARS = (2024, 2025, 2026)

# Statutory school-district amounts (Tax Code §11.13(b), (c)): HS $100K for TY2024 (Prop 4, 2023); $140K from TY2025
# (Prop 13, Nov 2025, applies to TY2025); OV65/DP state amount $10K for TY2024, $60K from TY2025 (Prop 11, Nov 2025).
SCHOOL_STATE = {2024: {"hs": 100_000, "ov65": 10_000}, 2025: {"hs": 140_000, "ov65": 60_000}, 2026: {"hs": 140_000, "ov65": 60_000}}

# Figures verified for earlier years against a primary source (carried over from the prototype's rates.py research).
# Keyed by entity code, then tax year. Missing keys fall back to the listing-year rule (unconfirmed where it could overstate).
RESEARCHED = {
    "01": {"alias": "AISD",
           2024: {"hs": {"amount": 100_000, "pct": 0.0, "min": 0}, "hs_confirmed": True, "ov65": 35_000, "ov65_confirmed": False},
           2025: {"hs": {"amount": 140_000, "pct": 0.0, "min": 0}, "hs_confirmed": True, "ov65": 85_000, "ov65_confirmed": False},
           "source": "austinisd.org/budget/taxes-debt; Texas Prop 13 & Prop 11 (Nov 2025); TCAD exemption listing (AISD local OV65 $25K)"},
    "02": {"alias": "CITY",
           2024: {"hs": {"amount": 0, "pct": 0.20, "min": 5_000}, "hs_confirmed": True, "ov65": 154_000, "ov65_confirmed": True},
           2025: {"hs": {"amount": 0, "pct": 0.20, "min": 5_000}, "hs_confirmed": True, "ov65": 192_000, "ov65_confirmed": True},
           "source": "austintexas.gov/page/tax-rates; Community Impact 5/29/2024 ($124K->$154K TY2024); Community Impact 6/3/2026 ($192K->$204K TY2026)"},
    "03": {"alias": "COUNTY",
           2024: {"hs": {"amount": 0, "pct": 0.20, "min": 5_000}, "hs_confirmed": True, "ov65": 135_000, "ov65_confirmed": False},
           2025: {"hs": {"amount": 0, "pct": 0.20, "min": 5_000}, "hs_confirmed": True, "ov65": 143_220, "ov65_confirmed": False},
           "source": "traviscountytx.gov/planning-budget/tc-taxpayer-statement (20% HS; $143,220 OV65 FY26)"},
    "68": {"alias": "ACC",
           2024: {"hs": {"amount": 0, "pct": 0.01, "min": 5_000}, "hs_confirmed": True, "ov65": 75_000, "ov65_confirmed": True},
           2025: {"hs": {"amount": 0, "pct": 0.01, "min": 5_000}, "hs_confirmed": True, "ov65": 75_000, "ov65_confirmed": True},
           "source": "offices.austincc.edu/finance-and-administration/property-taxes/"},
    "2J": {"alias": "CENTRAL_HEALTH",
           2024: {"hs": {"amount": 0, "pct": 0.20, "min": 5_000}, "hs_confirmed": True, "ov65": 150_000, "ov65_confirmed": False},
           2025: {"hs": {"amount": 0, "pct": 0.20, "min": 5_000}, "hs_confirmed": True, "ov65": 185_200, "ov65_confirmed": False},
           "source": "centralhealth.net FY25/FY26 budget books; KUT 9/24/2024"},
}

# Local-option percentages verified for earlier years by a primary source (the listing only covers its own year).
LOCAL_OPTION_SOURCES = {
    "07": {"years": (2024, 2025), "source": "Lake Travis ISD, Overview of the Operating Budget 2025-2026 (2025-04-02): 20% local optional homestead "
                                            "exemption; Community Impact 2024-04-05: FY2024-25 budget keeps the 20% LOHE ($33.8M)"},
    "16": {"years": (2024, 2025), "source": "Lake Travis ISD budget overview 2025-2026 and Community Impact 2024-04-05: Lago Vista ISD is the only other "
                                            "Greater Austin district at the maximum 20% local optional homestead exemption"},
}

TYPE_MAP = [("SCHOOL", "isd"), ("COUNTY", "county"), ("HOSPITAL", "hospital"), ("JUNIOR", "college"), ("EMERGENC", "esd"), ("FIRE", "esd"),
            ("CITY", "city"), ("ROAD", "road"), ("TIF", "tirz"), ("PUBLIC", "pid"), ("APPRAISAL", "appraisal"), ("WATER", "wcid"), ("MUD", "mud")]


def unit_type(listing_type: str, name: str) -> str:
    t = (listing_type or "").upper(); n = name.upper()
    for k, v in TYPE_MAP:
        if t.startswith(k):
            if v == "mud" and ("WCID" in n or "WSID" in n): return "wcid"
            if v == "mud" and ("LIMITED" in n or "LTD" in n): return "limited"
            if v == "city" and "VILLAGE" in n: return "city"
            return v
    if " ISD" in n: return "isd"
    if "PID" in n or "PUB IMP" in n: return "pid"
    if "TIRZ" in n or "TIF" in n or "REINVESTMENT" in n: return "tirz"
    if "ESD" in n: return "esd"
    if "WCID" in n or "WSID" in n: return "wcid"
    if "MUD" in n: return "mud"
    if "CITY OF" in n or "VILLAGE OF" in n: return "city"
    return "other"


def parse_listing(text: str) -> dict[str, dict]:
    """Parse `pdftotext -layout` output of a TCAD Exemption Listing Report. Returns {entity_cd: {...}}."""
    hdr = re.compile(r"^(\d{4,})\s+(\S+)\s+(?:(\d{3}-\d{3}-\d{2})\s+)?(.+?)\s+Type:\s*([A-Za-z]+(?: [A-Za-z]+)?)\s+FrzC:\s*(Yes|No)", re.M)
    row = re.compile(r"^\s+([A-Z0-9-]+)\s+([\d,]+)\s+(\d+)\s+([\d,]+)\s+([\d,]+)\s+(Yes|No)\s*$", re.M)
    out: dict[str, dict] = {}
    cur = None
    for page in text.split("\f"):
        m = hdr.search(page)
        if m:
            _, code, _, name, typ, frz = m.groups()
            cur = out.setdefault(code, {"code": code, "name": " ".join(name.split()), "listing_type": typ.strip(), "freeze_ceiling": frz == "Yes", "exemptions": {}})
        if cur is None:
            continue
        for r in row.finditer(page):
            t, state, pct, mn, amt, fr = r.groups()
            e = cur["exemptions"].setdefault(t, {"state_amt": 0, "local_pct": 0, "local_min": 0, "local_amt": 0, "freeze": False})
            # a unit can list the same type twice (state row + local-option row): merge
            e["state_amt"] += int(state.replace(",", "")); e["local_pct"] = max(e["local_pct"], int(pct))
            e["local_min"] = max(e["local_min"], int(mn.replace(",", ""))); e["local_amt"] += int(amt.replace(",", "")); e["freeze"] = e["freeze"] or fr == "Yes"
    return out


def read_rates(path: Path) -> dict[str, dict]:
    import pandas as pd
    df = pd.read_excel(path)
    df.columns = [c.strip().lower() for c in df.columns]
    out: dict[str, dict] = {}
    for r in df.itertuples(index=False):
        d = r._asdict()
        cd = str(d["tcad"]).strip(); yr = int(d["taxyear"])
        rate = pd.to_numeric(d.get("totalrate"), errors="coerce")
        u = out.setdefault(cd, {"name": str(d["jurisname"]).strip(), "rates": {}})
        if rate == rate and rate is not None:  # not NaN
            u["rates"][yr] = float(rate)
    return out


def roll_check(db: Path) -> dict[str, dict]:
    import duckdb
    con = duckdb.connect(str(db), read_only=True)
    rows = con.execute("""
      with hs_only as (
        select prop_id from appraisal_info
        where prop_type_cd='R' and hs_exempt and not coalesce(ov65_exempt,false) and not coalesce(ov65s_exempt,false)
          and not coalesce(dp_exempt,false) and not coalesce(dv1_exempt,false) and not coalesce(dv2_exempt,false)
          and not coalesce(dv3_exempt,false) and not coalesce(dv4_exempt,false) and not coalesce(dvhs_exempt,false) and not coalesce(ex_exempt,false)
          and coalesce(appraised_val,0) >= 100000),
      j as (select e.entity_cd, e.assessed_val - e.taxable_val as ex, (e.assessed_val - e.taxable_val)/nullif(e.assessed_val,0) as pct
            from appraisal_entity_info e join hs_only using (prop_id) where not e.partial_entity and e.assessed_val > 0)
      select entity_cd, count(*), round(median(pct),4), round(median(ex)), round(avg(case when ex=0 then 1 else 0 end),3) from j group by 1""").fetchall()
    con.close()
    return {r[0]: {"n": r[1], "median_pct": r[2], "median_exemption": r[3], "share_zero": r[4]} for r in rows}


def build(rates: dict, listing: dict, listing_year: int, roll: dict | None, roll_names: dict | None = None) -> dict:
    codes = sorted(set(rates) | set(listing) | set(roll_names or {}))
    units = {}
    for cd in codes:
        lst = listing.get(cd, {}); rt = rates.get(cd, {})
        name = (roll_names or {}).get(cd) or lst.get("name") or rt.get("name") or cd   # the roll has the full name; the listing truncates
        typ = unit_type(lst.get("listing_type", ""), name)
        taxing = bool(rt.get("rates")) and typ not in ("appraisal", "pid", "tirz")
        ex = lst.get("exemptions", {})
        hs_l, ov_l = ex.get("HS", {}), ex.get("OV65", {})
        research = RESEARCHED.get(cd, {})
        years = {}
        for y in TAX_YEARS:
            rate = rt.get("rates", {}).get(y)
            r = research.get(y)
            if typ == "isd":
                hs = {"amount": SCHOOL_STATE[y]["hs"], "pct": hs_l.get("local_pct", 0) / 100.0, "min": hs_l.get("local_min", 0) if hs_l.get("local_pct") else 0}
                ov65 = SCHOOL_STATE[y]["ov65"] + ov_l.get("local_amt", 0)
                lo = LOCAL_OPTION_SOURCES.get(cd)
                sourced = bool(lo and y in lo["years"])
                hs_basis = ("statute" if not hs_l.get("local_pct") else f"statute + local pct: TCAD {listing_year} listing") if y == listing_year \
                    else ("statute" if not hs_l.get("local_pct") else (f"statute + local pct: {lo['source']}" if sourced else "statute + local pct carried from listing"))
                hs_conf = (y == listing_year) or not hs_l.get("local_pct") or sourced
                ov_basis = "statute + local amount from listing" if y == listing_year else "statute + local amount carried from listing"
                ov_conf = y == listing_year
            else:
                hs = {"amount": hs_l.get("local_amt", 0), "pct": hs_l.get("local_pct", 0) / 100.0, "min": hs_l.get("local_min", 0) if hs_l.get("local_pct") else 0}
                ov65 = ov_l.get("local_amt", 0) + ov_l.get("state_amt", 0)
                grants = bool(hs["amount"] or hs["pct"])
                hs_basis = f"TCAD {listing_year} listing" if y == listing_year else ("no exemption in listing; assumed none (can only understate)" if not grants else "carried from listing (could overstate)")
                hs_conf = (y == listing_year) or not grants
                ov_basis = f"TCAD {listing_year} listing" if y == listing_year else ("none in listing; assumed none" if not ov65 else "carried from listing")
                ov_conf = (y == listing_year) or not ov65
            if r:  # researched override for that year
                hs, hs_conf, hs_basis = r["hs"], r["hs_confirmed"], "researched: " + research["source"]
                ov65, ov_conf, ov_basis = r["ov65"], r["ov65_confirmed"], "researched: " + research["source"]
            if not taxing:
                hs = {"amount": 0, "pct": 0.0, "min": 0}; ov65 = 0; hs_conf = ov_conf = True; hs_basis = ov_basis = "not a taxing unit (no ad valorem rate)"
            years[str(y)] = {"rate": rate, "rate_confirmed": rate is not None, "rate_source": "Travis County TNT summary" if rate is not None else None,
                             "hs": hs, "hs_confirmed": bool(hs_conf), "hs_basis": hs_basis,
                             "ov65": ov65, "ov65_confirmed": bool(ov_conf), "ov65_basis": ov_basis,
                             "ceiling": bool(ov_l.get("freeze") or (typ == "isd"))}
        u = {"name": name, "type": typ, "taxing": taxing, "ceiling": bool(lst.get("freeze_ceiling") or typ == "isd"), "years": years}
        if research.get("alias"): u["alias"] = research["alias"]
        if roll and cd in roll: u["roll_check"] = roll[cd]
        units[cd] = u
    return units


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rates", required=True); ap.add_argument("--listing", required=True); ap.add_argument("--listing-year", type=int, default=2026)
    ap.add_argument("--db", default=None); ap.add_argument("--out", default=str(Path(__file__).parent / "rates" / "units.json"))
    ap.add_argument("--rates-url", default="https://www.traviscountytx.gov/images/tax_assessor/truth_in_taxation/qryJurisRateWeb2026.xls")
    ap.add_argument("--listing-url", default="https://traviscad.org/wp-content/uploads/2026_ExemptionListingTravis-07192026.pdf")
    a = ap.parse_args()
    rates = read_rates(Path(a.rates)); listing = parse_listing(Path(a.listing).read_text())
    roll = roll_names = None
    if a.db:
        import duckdb
        roll = roll_check(Path(a.db))
        con = duckdb.connect(a.db, read_only=True)
        roll_names = {r[0]: r[1] for r in con.execute("select entity_cd, any_value(entity_name) from appraisal_entity_info group by 1").fetchall()}
        con.close()
    units = build(rates, listing, a.listing_year, roll, roll_names)
    doc = {"schema": 1, "generated": date.today().isoformat(), "tax_years": list(TAX_YEARS),
           "sources": {"rates": {"url": a.rates_url, "retrieved": date.today().isoformat(), "note": "Travis County Tax Office truth-in-taxation summary: adopted total rate per $100, 2022-2026"},
                       f"exemptions_{a.listing_year}": {"url": a.listing_url, "retrieved": date.today().isoformat(), "note": "TCAD Exemption Listing Report: per-unit state amount, local-option pct/min/amount, freeze ceiling"},
                       "roll_check": {"note": "2026 certified roll PROP_ENT: assessed - taxable on HS-only residential accounts; validates the HS rule"} if roll else None},
           "confirmation_rule": "confirmed = primary source for that year, statute, or an assumption that can only understate a refund",
           "units": units}
    Path(a.out).write_text(json.dumps(doc, indent=1))
    n_tax = sum(1 for u in units.values() if u["taxing"])
    print(f"{len(units)} units ({n_tax} taxing) -> {a.out}")


if __name__ == "__main__":
    main()
