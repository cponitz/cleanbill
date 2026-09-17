"""Publisher: CSV -> properties / leads / property_entities rows and the batched-SQL path (no network)."""
import json
from pathlib import Path

import pandas as pd

from cleanbill.etl.publish import rows_from_csv, to_sql


def _csv(tmp_path: Path) -> Path:
    ents = [{"entity_cd": "19", "entity_name": "PFLUGERVILLE ISD", "taxable_val": 400000.0, "assessed_val": 400000.0, "partial": False},
            {"entity_cd": "20", "entity_name": "CITY OF PFLUGERVILLE", "taxable_val": 400000.0, "assessed_val": 400000.0, "partial": False}]
    df = pd.DataFrame([{
        "prop_id": 123, "owner_name": "DOE JANE", "owner_addr1": "1 A ST", "owner_addr2": None, "owner_city": "PFLUGERVILLE", "owner_state": "TX", "owner_zip": "78660",
        "situs_num": "1", "situs_line": "1 A ST", "situs_unit": None, "situs_city": "PFLUGERVILLE", "situs_zip": "78660", "situs_full": "1 A ST, PFLUGERVILLE, TX 78660",
        "state_cd": "A1", "prop_type": "R", "appraised_val": 400000.0, "market_value": 400000.0, "deed_date": "2019-01-01",
        "claim_code": "CB-AAAA-BBBB", "tier": 1, "refund_years": "[2024, 2025]", "est_refund_total": 3000.5,
        "est_refund_by_year": json.dumps({"2024": {"total": 1400.0, "units": {"19": 1100.0, "20": 0}}, "2025": {"total": 1600.5, "units": {"19": 1550.0, "20": 0}}}),
        "est_forward_annual": 1600.5, "estimate_unconfirmed": False, "taxing_units": json.dumps(["19", "20"]), "unit_names": json.dumps(["PFLUGERVILLE ISD"]),
        "entities": json.dumps(ents),
    }])
    p = tmp_path / "leads.csv"; df.to_csv(p, index=False); return p


def test_rows_include_property_entities_with_types(tmp_path):
    props, leads, ents = rows_from_csv(_csv(tmp_path))
    assert len(props) == 1 and len(leads) == 1 and len(ents) == 2
    assert leads[0]["est_refund_by_year"]["2025"]["units"]["19"] == 1550.0 and leads[0]["refund_years"] == [2024, 2025]
    assert ents[0] == {"prop_id": 123, "entity_cd": "19", "entity_name": "PFLUGERVILLE ISD", "entity_type": "isd", "taxable_value": 400000.0, "assessed_value": 400000.0, "partial": False}
    assert ents[1]["entity_type"] == "city"


def test_sql_path_upserts_entities_and_optionally_refreshes_estimates(tmp_path):
    props, leads, ents = rows_from_csv(_csv(tmp_path))
    sql = "\n".join(to_sql(props, leads, ents))
    assert "insert into property_entities (prop_id,entity_cd,entity_name,entity_type,taxable_value,assessed_value,partial)" in sql
    assert "on conflict (prop_id, entity_cd) do update set" in sql and "update leads set" not in sql
    sql2 = "\n".join(to_sql(props, leads, ents, update_estimates=True))
    assert "update leads set refund_years = array[2024,2025], est_refund_total = 3000.5" in sql2 and "where prop_id = 123;" in sql2
    assert "claim_code" not in sql2.split("update leads")[1]   # the refresh never touches the code or status


def test_tier_3_is_never_published_by_default(tmp_path):
    p = _csv(tmp_path)
    df = pd.read_csv(p); df.loc[len(df)] = df.iloc[0]; df.loc[len(df) - 1, ["prop_id", "tier", "claim_code"]] = [124, 3, "CB-CCCC-DDDD"]
    df.to_csv(p, index=False)
    props, leads, ents = rows_from_csv(p)
    assert [l["prop_id"] for l in leads] == [123] and [e["prop_id"] for e in ents] == [123, 123]
    props3, leads3, _ = rows_from_csv(p, tiers=(1, 2, 3))
    assert sorted(l["prop_id"] for l in leads3) == [123, 124]
