"""Mirrors supabase/functions/process-claim/validate_test.ts case for case — if one of these changes, change both."""
from datetime import date

from trd.agent.validate import address_matches, age_on, name_matches, validate

PROP = {"prop_id": 1, "owner_name": "GARCIA RICHARD L", "situs_num": "3675", "situs_street": "DUVAL ST", "situs_city": "AUSTIN",
        "situs_zip": "78721", "situs_full": "3675 DUVAL ST, AUSTIN, TX 78721", "deed_date": "2019-05-14"}
BASE = {"readable": True, "id_type": "driver_license", "issuing_state": "TX", "first_name": "RICHARD", "middle_name": "L", "last_name": "GARCIA",
        "dob": "1963-07-11", "expiry": "2031-09-03", "dl_number": "17912728", "address_line1": "3675 DUVAL ST", "city": "AUSTIN", "state": "TX", "zip": "78721",
        "confidence": {"name": 0.98, "dob": 0.97, "address": 0.95, "dl_number": 0.9, "expiry": 0.95}, "issues": []}
TODAY = date(2026, 9, 7)


def test_address_cases():
    assert address_matches("3675 DUVAL ST", "78721", PROP)
    assert address_matches("3675 duval street", "78721", PROP)
    assert address_matches("3675 DUVAL", "78721", PROP)
    assert not address_matches("3677 DUVAL ST", "78721", PROP)
    assert address_matches("3675 DUVAL CIR", "78721", PROP)
    assert not address_matches("3675 DUVAL ST", "78704", PROP)
    p = {**PROP, "situs_unit": "B", "situs_full": "3675 DUVAL ST UNIT B, AUSTIN, TX 78721"}
    assert not address_matches("3675 DUVAL ST APT A", "78721", p)
    assert address_matches("3675 DUVAL ST APT B", "78721", p)
    assert address_matches("3675 DUVAL ST", "78721", p)
    assert address_matches("1200 Brodie Lane", "78745", {"prop_id": 2, "owner_name": "X", "situs_full": "1200 BRODIE LN, AUSTIN, TX 78745"})


def test_name_cases():
    assert name_matches("RICHARD", "GARCIA", "GARCIA RICHARD L")
    assert name_matches("JANE", "SMITH", "SMITH JOHN & JANE")
    assert not name_matches("RICK", "GARCIA", "GARCIA RICHARD L")
    assert not name_matches("RICHARD", "LOPEZ", "GARCIA RICHARD L")
    assert name_matches("MARIA", "DE LA CRUZ", "DE LA CRUZ MARIA")


def test_age():
    assert age_on("1960-09-10", TODAY) == 65
    assert age_on("1961-09-10", TODAY) == 64


def test_validate_routing():
    assert validate(BASE, PROP, "Richard L Garcia", TODAY).status == "ready_to_submit"
    assert validate({**BASE, "address_line1": "900 CONGRESS AVE", "zip": "78701"}, PROP, "Richard Garcia", TODAY).status == "needs_dl_update"
    assert validate({**BASE, "issuing_state": "CA"}, PROP, "Richard Garcia", TODAY).status == "needs_review"
    assert validate({**BASE, "first_name": "MARIA", "last_name": "LOPEZ"}, PROP, "Maria Lopez", TODAY).status == "needs_review"
    assert validate(BASE, PROP, "Maria Lopez", TODAY).status == "needs_review"
    v = validate({**BASE, "dob": "1955-01-01"}, PROP, "Richard Garcia", TODAY)
    assert v.over65 and any(f["code"] == "over_65" and f["severity"] == "info" for f in v.findings)
    assert validate({**BASE, "confidence": {**BASE["confidence"], "address": 0.3}}, PROP, "Richard Garcia", TODAY).status == "needs_review"


def test_findings_are_structured_and_mirror_the_deno_case():
    from trd.agent.validate import reason_text
    v = validate({**BASE, "address_line1": "900 CONGRESS AVE", "zip": "78701"}, PROP, "Richard Garcia", TODAY)
    assert [f["code"] for f in v.findings] == ["address_mismatch", "name_match"]
    assert v.findings[0]["severity"] == "blocking" and v.findings[0]["detail"]["situs"] == PROP["situs_full"]
    assert reason_text(v.findings).startswith("ID address (900 CONGRESS AVE, 78701) does not match")
    assert reason_text(validate(BASE, PROP, "Richard L Garcia", TODAY).findings) is None
