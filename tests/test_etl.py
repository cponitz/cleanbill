"""ETL end-to-end on a synthetic fixed-width export built from a mini layout spec (same code path as the real 8.0.33 spec)."""
import json
import zipfile
from datetime import date
from pathlib import Path

from trd.etl.leads import build_leads, new_claim_code, norm_addr, summary
from trd.etl.load import load_export

MINI = [  # name, length, type — starts computed below
    ("prop_id", 12, "int"), ("prop_type_cd", 5, "str"), ("py_owner_name", 70, "str"),
    ("py_addr_line1", 60, "str"), ("py_addr_line2", 60, "str"), ("py_addr_city", 50, "str"), ("py_addr_state", 50, "str"), ("py_addr_zip", 5, "str"),
    ("py_address_suppress_flag", 1, "bool"), ("py_confidential_flag", 1, "bool"),
    ("situs_num", 15, "str"), ("situs_street_prefx", 10, "str"), ("situs_street", 50, "str"), ("situs_street_sufix", 10, "str"), ("situs_unit", 5, "str"),
    ("situs_city", 30, "str"), ("situs_zip", 10, "str"), ("imprv_state_cd", 5, "str"), ("appraised_val", 15, "num"), ("market_value", 15, "num"),
    ("deed_dt", 10, "date"), ("hs_exempt", 1, "bool"), ("ov65_exempt", 1, "bool"), ("dp_exempt", 1, "bool"), ("dvhs_exempt", 1, "bool"),
]


def spec():
    out, pos = [], 1
    for n, l, t in MINI:
        out.append({"name": n, "start": pos, "length": l, "type": t}); pos += l
    return {"APPRAISAL_INFO": out}


def row(**kw) -> str:
    vals = {"prop_type_cd": "R", "py_addr_city": "AUSTIN", "py_addr_state": "TX", "situs_city": "AUSTIN", "imprv_state_cd": "A1",
            "py_address_suppress_flag": "F", "py_confidential_flag": "F", "hs_exempt": "F", "ov65_exempt": "F", "dp_exempt": "F", "dvhs_exempt": "F",
            "py_addr_line2": "", "situs_street_prefx": "", "situs_unit": "", "market_value": kw.get("appraised_val", "")}
    vals.update(kw)
    return "".join(str(vals.get(n, "")).ljust(l)[:l] for n, l, _ in MINI)


ROWS = [
    # 1: perfect lead, long-held -> tier 1
    row(prop_id=1, py_owner_name="GARCIA RICHARD L", py_addr_line1="3675 DUVAL ST", py_addr_zip="78721", situs_num="3675", situs_street="DUVAL", situs_street_sufix="ST", situs_zip="78721", appraised_val="600000", deed_dt="05/14/2019"),
    # 2: has HS -> excluded
    row(prop_id=2, py_owner_name="SMITH JOHN", py_addr_line1="100 MAIN ST", py_addr_zip="78704", situs_num="100", situs_street="MAIN", situs_street_sufix="ST", situs_zip="78704", appraised_val="500000", deed_dt="01/01/2015", hs_exempt="T"),
    # 3: mailing differs (absentee owner) -> excluded
    row(prop_id=3, py_owner_name="LEE ANNA", py_addr_line1="99 OTHER RD", py_addr_zip="78759", situs_num="200", situs_street="OAK", situs_street_sufix="LN", situs_zip="78745", appraised_val="450000", deed_dt="01/01/2015"),
    # 4: LLC -> excluded
    row(prop_id=4, py_owner_name="BLUE OAK HOLDINGS LLC", py_addr_line1="300 PINE ST", py_addr_zip="78702", situs_num="300", situs_street="PINE", situs_street_sufix="ST", situs_zip="78702", appraised_val="700000", deed_dt="01/01/2015"),
    # 5: bought mid-2024 -> tier 2 (2025 only)
    row(prop_id=5, py_owner_name="NGUYEN THU & MINH", py_addr_line1="1200 BRODIE LANE", py_addr_zip="78745", situs_num="1200", situs_street="BRODIE", situs_street_sufix="LN", situs_zip="78745", appraised_val="520000", deed_dt="06/15/2024"),
    # 6: suppressed address -> excluded
    row(prop_id=6, py_owner_name="DOE JANE", py_addr_line1="400 ELM ST", py_addr_zip="78704", situs_num="400", situs_street="ELM", situs_street_sufix="ST", situs_zip="78704", appraised_val="400000", deed_dt="01/01/2015", py_address_suppress_flag="T"),
    # 7: PO box -> excluded
    row(prop_id=7, py_owner_name="ROE RICHARD", py_addr_line1="PO BOX 123", py_addr_zip="78767", situs_num="500", situs_street="ASH", situs_street_sufix="DR", situs_zip="78704", appraised_val="400000", deed_dt="01/01/2015"),
    # 8: condo A3 with unit, mailing uses APT -> tier 1
    row(prop_id=8, py_owner_name="PATEL PRIYA", py_addr_line1="800 W 5TH ST APT 12", py_addr_zip="78703", situs_num="800", situs_street_prefx="W", situs_street="5TH", situs_street_sufix="ST", situs_unit="12", situs_zip="78703", imprv_state_cd="A3", appraised_val="350000", deed_dt="03/03/2018"),
    # 9: bought 2026 -> tier 3
    row(prop_id=9, py_owner_name="KIM SOO", py_addr_line1="900 CEDAR ST", py_addr_zip="78704", situs_num="900", situs_street="CEDAR", situs_street_sufix="ST", situs_zip="78704", appraised_val="650000", deed_dt="02/02/2026"),
    # 10: commercial -> excluded
    row(prop_id=10, py_owner_name="JONES BOB", py_addr_line1="1 SHOP RD", py_addr_zip="78704", situs_num="1", situs_street="SHOP", situs_street_sufix="RD", situs_zip="78704", imprv_state_cd="F1", appraised_val="900000", deed_dt="01/01/2015"),
]


def test_etl_pipeline(tmp_path: Path):
    z = tmp_path / "export.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("APPRAISAL_INFO.TXT", "\n".join(ROWS) + "\n")
    layout = spec(); (tmp_path / "layout.json").write_text(json.dumps(layout))
    db = tmp_path / "t.duckdb"
    counts = load_export(z, layout, db)
    assert counts["APPRAISAL_INFO"] == 10

    leads = build_leads(db, date(2026, 9, 7))
    ids = set(leads["prop_id"].tolist())
    assert ids == {1, 5, 8, 9}, ids
    t = dict(zip(leads["prop_id"], leads["tier"]))
    assert t[1] == 1 and t[8] == 1 and t[5] == 2 and t[9] == 3
    r1 = leads[leads["prop_id"] == 1].iloc[0]
    assert r1["refund_years"] == [2024, 2025] and 4500 <= r1["est_refund_total"] <= 4700
    r5 = leads[leads["prop_id"] == 5].iloc[0]
    assert r5["refund_years"] == [2025]
    assert r1["situs_full"] == "3675 DUVAL ST, AUSTIN, TX 78721"
    assert leads[leads["prop_id"] == 8].iloc[0]["situs_full"] == "800 W 5TH ST UNIT 12, AUSTIN, TX 78703"
    assert all(leads["claim_code"].str.match(r"^TRD-[A-Z2-9]{4}-[A-Z2-9]{4}$"))
    s = summary(leads)
    assert s["n"] == 4 and s["by_tier"][1] == 2


def test_norm_addr_and_codes():
    assert norm_addr("3675 Duval Street") == norm_addr("3675 DUVAL ST")
    assert norm_addr("800 W 5th St Apt 12") == "800 W 5TH ST UNIT 12"
    c = new_claim_code(); assert len(c) == 13 and "O" not in c and "0" not in c
