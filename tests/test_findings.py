"""The findings rule table (trd/findings.py): completeness, rendering, and the two generated artefacts — findings.ts for
the edge functions and the G-9 snapshot both validators are pinned to. Mirrors supabase/functions/_shared/findings_test.ts."""
import json
from datetime import date
from pathlib import Path

from trd import findings as F
from trd.agent.store import FixtureStore
from trd.agent.validate import validate

FIX = Path(__file__).parent / "fixtures" / "cases.json"


def test_every_code_has_a_complete_rule():
    assert len(F.CODES) == 14
    for code, rule in F.RULES.items():
        assert rule.severity in F.SEVERITIES and rule.field and rule.ops and rule.customer, code
    assert set(F.CODES) >= {"not_readable", "not_texas_id", "name_mismatch", "signer_mismatch", "low_confidence", "under_18",
                            "address_mismatch", "expired", "over_65", "not_primary", "other_homestead", "processing_error"}


def test_render_and_make_finding():
    assert F.render("a {x} b {y} c", {"x": 1, "y": None}) == "a 1 b  c"
    assert F.render("{missing}", None) == ""
    f = F.make_finding("over_65", {"age": 71})
    assert f == {"code": "over_65", "severity": "info", "field": "dob", "message": "Applicant is 71 — eligible for the over-65 exemption (add to 50-114)", "detail": {"age": 71}}
    assert "detail" not in F.make_finding("address_match")
    r = F.render_for_customer(F.make_finding("address_mismatch", {"id": "900 CONGRESS AVE, AUSTIN 78701", "situs": "3675 DUVAL ST, AUSTIN, TX 78721"}))
    assert r["customer_message"].startswith("The address on your license (900 CONGRESS AVE, AUSTIN 78701) doesn't match the property (3675 DUVAL ST")
    assert r["next_action"] == "dps_update"
    assert F.reason_text([F.make_finding("address_match"), F.make_finding("expired", {"expiry": "2024-01-01"})]) is None


def test_generated_findings_ts_is_current():
    assert F.TS_PATH.read_text() == F.emit_ts(), "run: python -m trd.findings --emit-ts"


def test_snapshot_is_current_and_matches_the_python_validator():
    assert json.loads(F.SNAPSHOT_PATH.read_text()) == F.emit_snapshot(), "run: python -m trd.findings --emit-snapshot"


def test_validators_emit_codes_only_and_sentences_come_from_the_table():
    cases = json.loads(FIX.read_text())
    props = {p["prop_id"]: p for p in cases["properties"]}
    for c in cases["validation_cases"]:
        v = validate(c["extracted"], props[c["prop_id"]], c["typed_name"], date.fromisoformat(c["today"]))
        for f in v.findings:
            rule = F.RULES[f["code"]]
            assert f["severity"] == rule.severity and f["field"] == rule.field
            assert f["message"] == F.render(rule.ops, f.get("detail"))


def test_fixture_store_returns_documents_newest_first():
    """SPEC-02 §4: the agent re-extracts the newest upload; cust-3 has the original and a later fixed license."""
    docs = FixtureStore(FIX).get_claim("cust-3")["documents"]
    assert [d["id"] for d in docs] == ["doc-3b", "doc-3"]
    assert docs[0]["created_at"] > docs[1]["created_at"]
