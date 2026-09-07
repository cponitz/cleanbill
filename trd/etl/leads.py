"""Lead engine: from the loaded appraisal roll, find owner-occupied homes with no homestead exemption and estimate refunds.

Heuristic (the one Williamson CAD itself used in 2020): single-family/condo/townhome parcel, no HS flag, owner mailing
address equals the situs address, owner is a person (not an entity), not address-suppressed. Tiered by deed date:
  Tier 1: owned on Jan 1 of the earliest refundable year  -> full 2-year refund
  Tier 2: owned on Jan 1 of the latest refundable year    -> 1-year refund
  Tier 3: bought this year                                -> bill reduction only (do not mail)

Column names follow PACS Appraisal Export 8.0.x (prop_id, prop_type_cd, py_owner_name, py_addr_line1..3, py_addr_city,
py_addr_state, py_addr_zip, py_address_suppress_flag, py_confidential_flag, situs_num, situs_street_prefx, situs_street,
situs_street_sufix, situs_unit, situs_city, situs_zip, imprv_state_cd, land_state_cd, appraised_val, market_value, deed_dt,
hs_exempt, ov65_exempt, dp_exempt, dv1..dv4_exempt, dvhs_exempt). Adjust in COLS if the 8.0.33 layout differs.
"""
from __future__ import annotations

import argparse
import json
import re
import secrets
from datetime import date
from pathlib import Path

import duckdb
import pandas as pd

from trd.estimator import estimate_refund, refundable_tax_years

ENTITY_RE = re.compile(r"\b(LLC|L\.L\.C|INC|CORP|CORPORATION|LP|LLP|LTD|TRUST|TRUSTEE|TR|ESTATE OF|PARTNERS|PARTNERSHIP|HOLDINGS|PROPERTIES|"
                       r"INVESTMENTS|INVESTMENT|CHURCH|CITY OF|COUNTY|STATE OF|BANK|HOMES|BUILDERS|DEVELOPMENT|ASSOC|ASSOCIATION|FOUNDATION|"
                       r"UNIVERSITY|SCHOOL|HOUSING|AUTHORITY|REALTY|RENTALS|VENTURES|CAPITAL|GROUP|ENTERPRISES|CO\b|COMPANY)\b", re.I)
RES_STATE_CODES = ("A1", "A3", "A4")  # single-family, condo, townhome (A2 mobile homes excluded for MVP)
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I


def new_claim_code() -> str:
    s = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    return f"TRD-{s[:4]}-{s[4:]}"


def norm_addr(s: str) -> str:
    s = re.sub(r"[^A-Z0-9 ]", " ", (s or "").upper())
    s = re.sub(r"\b(STREET)\b", "ST", s); s = re.sub(r"\b(AVENUE)\b", "AVE", s); s = re.sub(r"\b(DRIVE)\b", "DR", s)
    s = re.sub(r"\b(ROAD)\b", "RD", s); s = re.sub(r"\b(LANE)\b", "LN", s); s = re.sub(r"\b(BOULEVARD)\b", "BLVD", s)
    s = re.sub(r"\b(COURT)\b", "CT", s); s = re.sub(r"\b(CIRCLE)\b", "CIR", s); s = re.sub(r"\b(PLACE)\b", "PL", s)
    s = re.sub(r"\b(TRAIL)\b", "TRL", s); s = re.sub(r"\b(COVE)\b", "CV", s); s = re.sub(r"\b(APT|UNIT|STE|#)\b", "UNIT", s)
    return re.sub(r"\s+", " ", s).strip()


def build_leads(db_path: Path, as_of: date, min_value: float = 100_000) -> pd.DataFrame:
    con = duckdb.connect(str(db_path), read_only=True)
    cols = {r[1].lower() for r in con.execute("pragma table_info('appraisal_info')").fetchall()}
    def has(c): return c in cols
    situs = " || ' ' || ".join(f"coalesce({c}, '')" for c in ("situs_num", "situs_street_prefx", "situs_street", "situs_street_sufix") if has(c))
    unit = "coalesce(situs_unit,'')" if has("situs_unit") else "''"
    suppress = " or ".join(f"coalesce({c}, false)" for c in ("py_address_suppress_flag", "py_confidential_flag") if has(c)) or "false"
    exempt_flags = " or ".join(f"coalesce({c}, false)" for c in ("hs_exempt", "ov65_exempt", "ov65s_exempt", "dp_exempt", "dvhs_exempt") if has(c))
    sql = f"""
      select prop_id, py_owner_name as owner_name,
             py_addr_line1 as owner_addr1, py_addr_line2 as owner_addr2, py_addr_city as owner_city, py_addr_state as owner_state, py_addr_zip as owner_zip,
             situs_num, {situs} as situs_line, {unit} as situs_unit, situs_city, situs_zip,
             imprv_state_cd as state_cd, prop_type_cd as prop_type, appraised_val, market_value, deed_dt as deed_date,
             hs_exempt
      from appraisal_info
      where prop_type_cd = 'R'
        and substr(coalesce(imprv_state_cd,''),1,2) in {RES_STATE_CODES}
        and not ({exempt_flags})
        and not ({suppress})
        and coalesce(appraised_val, 0) >= {min_value}
        and coalesce(py_addr_state, '') = 'TX'
    """
    df = con.execute(sql).df()
    con.close()
    df["situs_line"] = df["situs_line"].str.replace(r"\s+", " ", regex=True).str.strip()
    # mailing == situs (line 1, or line 2 when line 1 is a c/o) and zip5 match
    m1 = df["owner_addr1"].map(norm_addr); m2 = df["owner_addr2"].map(norm_addr)
    s = (df["situs_line"] + df["situs_unit"].fillna("").map(lambda u: f" UNIT {u}" if u else "")).map(norm_addr)
    zip_ok = df["owner_zip"].fillna("").str[:5] == df["situs_zip"].fillna("").str[:5]
    df["mail_eq_situs"] = ((m1 == s) | (m2 == s)) & zip_ok & (s != "")
    df["po_box"] = df["owner_addr1"].fillna("").str.upper().str.contains(r"P\.?\s*O\.?\s*BOX|PO BOX", regex=True)
    df["entity_owner"] = df["owner_name"].fillna("").map(lambda n: bool(ENTITY_RE.search(n)))
    leads = df[df["mail_eq_situs"] & ~df["po_box"] & ~df["entity_owner"]].copy()

    years = refundable_tax_years(as_of)
    earliest, latest = min(years), max(years)
    def to_date(d):
        if pd.isna(d): return None
        if isinstance(d, pd.Timestamp): return d.date()  # Timestamp subclasses date, so check it first
        return d.date() if hasattr(d, "date") and not isinstance(d, date) else d
    leads["deed_date"] = leads["deed_date"].map(to_date)
    def tier(d):
        if d is None: return 1  # unknown deed date: assume long-held (verify by hand in the sample)
        if d <= date(earliest, 1, 1): return 1
        if d <= date(latest, 1, 1): return 2
        return 3
    leads["tier"] = leads["deed_date"].map(tier)
    ests = leads.apply(lambda r: estimate_refund(float(r["appraised_val"] or 0), as_of, owned_since=r["deed_date"]), axis=1)
    leads["refund_years"] = ests.map(lambda e: e.refund_years)
    leads["est_refund_total"] = ests.map(lambda e: e.refund_total)
    leads["est_refund_by_year"] = ests.map(lambda e: json.dumps({str(y): {"total": s["total"]} for y, s in e.by_year.items()}))
    leads["est_forward_annual"] = ests.map(lambda e: e.forward_annual)
    leads["estimate_unconfirmed"] = ests.map(lambda e: e.unconfirmed)
    leads["claim_code"] = [new_claim_code() for _ in range(len(leads))]
    leads["situs_full"] = (leads["situs_line"] + leads["situs_unit"].map(lambda u: f" UNIT {u}" if u else "") + ", " + leads["situs_city"].fillna("AUSTIN") + ", TX " + leads["situs_zip"].fillna("").str[:5]).str.replace(r"\s+", " ", regex=True)
    return leads.sort_values(["tier", "est_refund_total"], ascending=[True, False]).reset_index(drop=True)


def summary(leads: pd.DataFrame) -> dict:
    out = {"n": int(len(leads)), "by_tier": leads["tier"].value_counts().sort_index().to_dict()}
    bands = pd.cut(leads["appraised_val"], [0, 300e3, 500e3, 750e3, 1e6, 1e9], labels=["<300K", "300-500K", "500-750K", "750K-1M", ">1M"])
    out["by_value_band"] = leads.groupby(bands, observed=True)["est_refund_total"].agg(["count", "median"]).round(0).to_dict("index")
    t1 = leads[leads["tier"] == 1]["est_refund_total"]
    out["tier1_refund"] = {"median": float(t1.median()) if len(t1) else None, "mean": float(t1.mean()) if len(t1) else None, "sum": float(t1.sum()) if len(t1) else None}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="data/tcad.duckdb")
    ap.add_argument("--as-of", default=date.today().isoformat())
    ap.add_argument("--out", default="data/out/leads.csv")
    a = ap.parse_args()
    leads = build_leads(Path(a.db), date.fromisoformat(a.as_of))
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    leads.to_csv(a.out, index=False)
    print(json.dumps(summary(leads), indent=2, default=str))


if __name__ == "__main__":
    main()
