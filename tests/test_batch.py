"""SPEC-11: the letter batch — guard rails, stratified seeded selection, variant split, resume, the Lob client against a
recorded-response fake (no network), and the live-key refusals. Names here are synthetic."""
from __future__ import annotations

import json
import random
from collections import Counter
from datetime import date
from pathlib import Path

import httpx
import pytest

from cleanbill import brand
from cleanbill.letters import batch as B
from cleanbill.letters.lob import LobClient, LobError, Throttle, Verification, from_address, mode

CITIES = ["AUSTIN", "PFLUGERVILLE", "MANOR", "DEL VALLE"]


def make_rows(n: int, seed: int = 1, tier: int = 1) -> list[dict]:
    rng = random.Random(seed)
    rows = []
    for i in range(n):
        mv = rng.choice([150_000, 250_000, 300_000, 420_000, 600_000, 900_000]) + rng.randint(0, 40_000)
        rows.append({"id": f"lead-{i:05d}", "prop_id": 100_000 + i, "claim_code": f"CB-{i:04d}-ZZZZ", "tier": tier, "status": "new", "mailed_at": None,
                     "estimate_unconfirmed": False, "refund_years": [2024, 2025], "est_refund_total": 1000 + (mv / 200), "est_forward_annual": 900,
                     "est_refund_by_year": {"2024": {"total": 500, "units": {"AISD": 400.0, "CITY": 100.0, "68": 0}}, "2025": {"total": 500, "units": {"AISD": 400.0, "CITY": 100.0}}},
                     "properties": {"owner_name": f"OWNER{i} PAT & LEE", "owner_addr1": f"{i + 1} MAIN ST", "owner_addr2": None, "owner_city": rng.choice(CITIES),
                                    "owner_state": "TX", "owner_zip": "78721", "situs_full": f"{i + 1} MAIN ST, AUSTIN, TX 78721", "market_value": mv,
                                    "hs_exempt": False, "address_suppressed": False}})
    return rows


class FakeStore:
    def __init__(self, rows: list[dict]):
        self.rows = rows
        self.pieces: list[dict] = []
        self.mailed: dict[str, tuple[str, str]] = {}

    def fetch_leads(self, tier: int) -> list[dict]:
        return [r for r in self.rows if r["tier"] == tier and r["status"] == "new" and not r["mailed_at"]]

    def pieces_for_batch(self, batch: str) -> set[str]:
        return {p["lead_id"] for p in self.pieces if p["batch"] == batch}

    def insert_piece(self, row: dict) -> None:
        self.pieces.append(row)

    def mark_mailed(self, lead_id: str, variant: str, at: str) -> None:
        self.mailed[lead_id] = (variant, at)


def fake_lob(calls: list[dict], *, reject_every: int = 0, fail_on: str | None = None, rate_limit_once: bool = False) -> LobClient:
    """A Lob API double: us_verifications answers with standardised components (every reject_every-th undeliverable),
    letters answers ltr_<n> and records the multipart fields, one optional 429 first."""
    state = {"n": 0, "limited": False}

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append({"method": req.method, "path": req.url.path, "headers": dict(req.headers), "content": req.content})
        if req.url.path.endswith("/us_verifications"):
            body = json.loads(req.content)
            state["n"] += 1
            bad = reject_every and state["n"] % reject_every == 0
            return httpx.Response(200, json={"id": f"us_ver_{state['n']}", "deliverability": "undeliverable" if bad else "deliverable",
                                             "primary_line": body["primary_line"].title(), "secondary_line": body.get("secondary_line", ""), "last_line": f"{body['city'].title()} TX {body['zip_code']}-1234",
                                             "components": {"city": body["city"].title(), "state": "TX", "zip_code": body["zip_code"], "zip_code_plus_4": "1234"},
                                             "deliverability_analysis": {"dpv_confirmation": "N" if bad else "Y"}, "lob_confidence_score": {"score": 0 if bad else 99.9}})
        if req.url.path.endswith("/letters"):
            if rate_limit_once and not state["limited"]:
                state["limited"] = True
                return httpx.Response(429, headers={"retry-after": "0"}, json={"error": {"message": "slow down"}})
            key = req.headers.get("idempotency-key", "")
            if fail_on and fail_on in key: return httpx.Response(422, json={"error": {"message": "to.address_zip is invalid"}})
            n = sum(1 for c in calls if c["path"].endswith("/letters"))
            return httpx.Response(200, json={"id": f"ltr_{n:04d}", "expected_delivery_date": "2026-10-09", "url": "https://lob-assets.example/x.pdf", "date_created": "2026-10-05T14:00:00Z", "thumbnails": []})
        return httpx.Response(404, json={"error": {"message": "no"}})
    return LobClient("test_abc", transport=httpx.MockTransport(handler), sleep=lambda s: None, throttle=Throttle(sleep=lambda s: None, clock=lambda: 0.0))


def run(store, lob=None, **kw):
    args = dict(batch="2026-10-05-t1", tier=1, n=200, seed=20261005, split=50, cap=None, exclude_ids=set(), dry_run=True, send=False, verify=True,
                to_override=None, out_dir=kw.pop("out_dir"), samples=2, unit_cost=1.05, mail_date=date(2026, 10, 5), log=lambda *a: None)
    args.update(kw)
    return B.run(store, lob, **args)


# ---- guard rails ------------------------------------------------------------------------------------------------------
def test_exclusions_are_hard_rules():
    rows = make_rows(12)
    p = lambda i: rows[i]["properties"]
    rows[0]["estimate_unconfirmed"] = True
    rows[1]["status"] = "mailed"; rows[1]["mailed_at"] = "2026-10-05T00:00:00Z"
    rows[2]["status"] = "opened"
    p(3)["hs_exempt"] = True
    p(4)["address_suppressed"] = True
    rows[5]["prop_id"] = B.TEST_PROP_ID
    rows[6]["claim_code"] = "CB-TEST-0002"
    p(7)["owner_zip"] = "ABCDE"
    p(8)["owner_state"] = "CA"
    rows[9]["tier"] = 2
    p(10)["market_value"] = None
    kept, why = B.eligible([B.Lead.from_row(r) for r in rows], tier=1, excluded_ids={100_011})
    assert [l.claim_code for l in kept] == []
    assert why == Counter({"estimate_unconfirmed": 1, "status_mailed": 1, "status_opened": 1, "hs_exempt": 1, "address_suppressed": 1, "test_account": 2,
                           "address_incomplete": 2, "other_tier": 1, "no_market_value": 1, "exclude_file": 1})


def test_zip_forms_and_owner_first():
    l = B.Lead.from_row(make_rows(1)[0])
    for z, want in [("78721", "78721"), ("78721-1234", "78721"), ("787211234", "78721"), ("7872", ""), ("", "")]:
        l.owner_zip = z; assert l.zip5 == want, z
    assert B.owner_first("DOE JANE & JOHN") == "Jane"
    assert B.owner_first("SMITH JR ROBERT") == "Robert"
    assert B.owner_first("GARCIA MARIA ET AL") == "Maria"
    assert B.owner_first("LOPEZ") == "Homeowner"
    assert B.owner_first("NGUYEN T ANH") == "Anh"


# ---- selection --------------------------------------------------------------------------------------------------------
def test_stratified_sample_matches_population_shares_and_is_seed_deterministic():
    rows = make_rows(3000, seed=7)
    kept, _ = B.eligible([B.Lead.from_row(r) for r in rows], 1, set())
    pop = Counter(l.band for l in kept)
    s1 = B.stratified_sample(kept, 1000, 20261005)
    s2 = B.stratified_sample(list(reversed(kept)), 1000, 20261005)     # input order must not matter
    s3 = B.stratified_sample(kept, 1000, 1)
    assert len(s1) == 1000 and [l.claim_code for l in s1] == [l.claim_code for l in s2]
    assert {l.claim_code for l in s3} != {l.claim_code for l in s1}
    smp = Counter(l.band for l in s1)
    for band, c in pop.items():
        assert abs(100 * smp[band] / 1000 - 100 * c / len(kept)) <= 2, band     # ±2 points per band (acceptance 2)
    assert set(smp) == set(pop) and all(b in {n for n, _, _ in B.BANDS} for b in smp)


def test_allocation_rounds_to_n_and_respects_caps_and_small_bands():
    assert sum(B.allocate(Counter({"a": 10, "b": 10, "c": 10}), 10).values()) == 10
    assert B.allocate(Counter({"a": 3, "b": 1000}), 100) == {"a": 0, "b": 100}      # largest remainder: b's .7 beats a's .3
    assert B.allocate(Counter({"a": 30, "b": 1000}), 100) == {"a": 3, "b": 97}
    assert B.allocate(Counter({"a": 500, "b": 500}), 100, cap=30) == {"a": 30, "b": 30}
    assert B.allocate(Counter({"a": 5}), 100) == {"a": 5}
    assert B.allocate(Counter(), 100) == {}


def test_variant_split_alternates_within_bands():
    rows = make_rows(1000, seed=3)
    kept, _ = B.eligible([B.Lead.from_row(r) for r in rows], 1, set())
    sample = B.assign_variants(B.stratified_sample(kept, 400, 5), 50)
    c = Counter(l.variant for l in sample)
    assert abs(c["A"] - c["B"]) <= len(set(l.band for l in sample))       # ≤ 1 per band
    per_band = Counter((l.band, l.variant) for l in sample)
    for band in {l.band for l in sample}:
        assert abs(per_band[(band, "A")] - per_band[(band, "B")]) <= 1, band
    seventy = Counter(l.variant for l in B.assign_variants(B.stratified_sample(kept, 400, 5), 70))
    assert 0.66 <= seventy["A"] / 400 <= 0.74


def test_unit_names_come_from_the_per_unit_estimate():
    l = B.Lead.from_row(make_rows(1)[0])
    assert B.unit_names_for(l) == ["AUSTIN ISD", "CITY OF AUSTIN"]     # 68 had zero savings; aliases resolve to names
    l.est_refund_by_year = {}
    assert B.unit_names_for(l) is None


# ---- dry run, send, resume --------------------------------------------------------------------------------------------
def test_dry_run_writes_csv_and_samples_only_and_never_touches_the_store(tmp_path):
    store = FakeStore(make_rows(300))
    calls: list[dict] = []
    res = run(store, fake_lob(calls, reject_every=10), out_dir=tmp_path, n=100)
    s = res.summary
    assert s["sample"] == 100 and s["verified"] == 100 and s["address_rejected"] == 10 and s["mailable"] == 90
    assert s["estimated_cost"] == 94.5 and s["variants"] == {"A": 50, "B": 50} or abs(s["variants"]["A"] - 50) <= 3
    assert res.rendered == 2 and res.created == 0 and store.pieces == [] and store.mailed == {}
    pdfs = sorted(tmp_path.glob("2026-10-05-t1/*.pdf"))
    assert len(pdfs) == 2
    csv_text = (tmp_path / "2026-10-05-t1" / "2026-10-05-t1.csv").read_text()
    assert csv_text.count("\n") == 101 and "deliverability" in csv_text and "MAIN ST" not in csv_text   # no street address in the CSV
    text = B.format_summary(s, "2026-10-05-t1", "test")
    assert "OWNER" not in text and "MAIN ST" not in text and "eligible 300" in text and "excluded: none" in text
    assert all(c["path"].endswith("/us_verifications") for c in calls)         # no letter was created


def test_send_creates_letters_records_pieces_marks_leads_and_resumes(tmp_path):
    store = FakeStore(make_rows(60))
    calls: list[dict] = []
    lob = fake_lob(calls, reject_every=7)
    res = run(store, lob, out_dir=tmp_path, n=20, dry_run=False, send=True, samples=0)
    created = [p for p in store.pieces if p["status"] == "created"]
    rejected = [p for p in store.pieces if p["status"] == "address_rejected"]
    assert res.created == len(created) == 18 and len(rejected) == 2 and res.rejected == 2
    assert set(store.mailed) == {p["lead_id"] for p in created} and all(v in ("A", "B") for v, _ in store.mailed.values())
    p = created[0]
    assert p["lob_id"].startswith("ltr_") and p["batch"] == "2026-10-05-t1" and p["to_override"] is False and len(p["pdf_sha256"]) == 64
    assert p["to_address"]["address_zip"] == "78721-1234" and p["to_address"]["address_line1"].endswith("Main St")   # verified components, not the roll
    assert p["address_verification"]["deliverability"] == "deliverable" and p["expected_delivery_date"] == "2026-10-09"
    assert rejected[0]["lob_id"] is None and rejected[0]["address_verification"]["deliverability"] == "undeliverable"
    letter_calls = [c for c in calls if c["path"].endswith("/letters")]
    assert len(letter_calls) == 18
    body = letter_calls[0]["content"].decode("latin-1")
    assert letter_calls[0]["headers"]["idempotency-key"] == f"2026-10-05-t1:{created[0]['claim_code']}"
    for needle in ['name="use_type"\r\n\r\nmarketing', 'name="address_placement"\r\n\r\ntop_first_page', 'name="color"\r\n\r\nfalse', 'name="mail_type"\r\n\r\nusps_first_class',
                   'name="metadata[batch]"\r\n\r\n2026-10-05-t1', 'name="from[name]"\r\n\r\nClean Bill Co.', 'name="file"', "%PDF"]:
        assert needle in body, needle
    # resume: the same command creates nothing more
    calls.clear()
    res2 = run(store, lob, out_dir=tmp_path, n=20, dry_run=False, send=True, samples=0)
    assert res2.created == 0 and res2.skipped == 20 and not [c for c in calls if c["path"].endswith("/letters")]
    assert len(store.pieces) == 20


def test_send_stops_on_a_lob_error_and_leaves_nothing_half_written(tmp_path):
    store = FakeStore(make_rows(40))
    calls: list[dict] = []
    sample = B.assign_variants(B.stratified_sample(B.eligible([B.Lead.from_row(r) for r in store.rows], 1, set())[0], 10, 20261005), 50)
    victim = sample[3].claim_code
    res = run(store, fake_lob(calls, fail_on=victim), out_dir=tmp_path, n=10, dry_run=False, send=True, samples=0)
    assert res.stopped and victim in res.stopped and "re-run" in res.stopped
    assert res.created == 3 and len(store.pieces) == 3 and len(store.mailed) == 3
    assert victim not in {p["claim_code"] for p in store.pieces}


def test_to_override_never_touches_leads(tmp_path):
    store = FakeStore(make_rows(30))
    calls: list[dict] = []
    ov = B.parse_override("Charlie Ponitz|1 Test Ln|Unit 2|Austin|tx|78701")
    res = run(store, fake_lob(calls), out_dir=tmp_path, n=5, dry_run=False, send=True, samples=0, to_override=ov, batch="proof-2026-09-25")
    assert res.created == 5 and store.mailed == {} and all(p["to_override"] and p["batch"] == "proof-2026-09-25" for p in store.pieces)
    assert all(p["to_address"] == {"name": "Charlie Ponitz", "address_line1": "1 Test Ln", "address_line2": "Unit 2", "address_city": "Austin", "address_state": "TX", "address_zip": "78701", "address_country": "US"} for p in store.pieces)
    assert not [c for c in calls if c["path"].endswith("/us_verifications")]     # the proof address is not verified
    assert Counter(p["variant"] for p in store.pieces) in (Counter({"A": 3, "B": 2}), Counter({"A": 2, "B": 3}))
    with pytest.raises(SystemExit):
        B.parse_override("just a name")


def test_live_key_guards():
    ok = dict(send=True, dry_run=False, api_key="live_x", lob_enabled="true", confirm_footer=brand.LEGAL_NAME, return_address={"line1": "1 Main St", "zip": "78701"})
    assert B.check_guards(**ok) is None
    assert "LOB_ENABLED" in B.check_guards(**{**ok, "lob_enabled": None})
    assert "LOB_ENABLED" in B.check_guards(**{**ok, "lob_enabled": "false"})
    assert "confirm-footer" in B.check_guards(**{**ok, "confirm_footer": "Clean Bill"})
    assert "placeholder" in B.check_guards(**{**ok, "return_address": None})        # brand.RETURN_ADDRESS is still the placeholder
    assert "placeholder" in B.check_guards(**{**ok, "return_address": brand.RETURN_ADDRESS})
    assert B.check_guards(send=True, dry_run=False, api_key="test_x", lob_enabled=None, confirm_footer=None) is None   # test key: free, nothing printed
    assert "LOB_API_KEY" in B.check_guards(send=True, dry_run=False, api_key=None, lob_enabled="true", confirm_footer=None)
    assert "test_ or live_" in B.check_guards(send=True, dry_run=False, api_key="sk_x", lob_enabled="true", confirm_footer=None)
    assert "exclusive" in B.check_guards(send=True, dry_run=True, api_key="test_x", lob_enabled=None, confirm_footer=None)
    assert B.check_guards(send=False, dry_run=True, api_key=None, lob_enabled=None, confirm_footer=None) is None
    assert mode("live_1") == "live" and mode("test_1") == "test" and mode(None) == "none" and mode("x") == "unknown"
    assert brand.return_address_is_placeholder() is True


def test_exclude_file_and_from_address(tmp_path):
    f = tmp_path / "exclude.csv"; f.write_text("prop_id,note\n100001,my house\n100002,friend\nnot-a-number,x\n")
    assert B.read_exclude_file(f) == {100001, 100002}
    assert B.read_exclude_file(tmp_path / "missing.csv") == set()
    fa = from_address({"name": "Clean Bill Co.", "line1": "1 Main St", "line2": "", "city": "Austin", "state": "TX", "zip": "78701"})
    assert fa == {"name": "Clean Bill Co.", "address_line1": "1 Main St", "address_city": "Austin", "address_state": "TX", "address_zip": "78701", "address_country": "US"}


# ---- Lob client -------------------------------------------------------------------------------------------------------
def test_lob_client_retries_429_and_raises_on_4xx(tmp_path):
    calls: list[dict] = []
    lob = fake_lob(calls, rate_limit_once=True)
    pdf = tmp_path / "x.pdf"; pdf.write_bytes(b"%PDF-1.4 fake")
    to = {"name": "X", "address_line1": "1 A St", "address_city": "Austin", "address_state": "TX", "address_zip": "78701"}
    r = lob.create_letter(pdf, to, from_address(brand.RETURN_ADDRESS), "b:CB-1", "b:CB-1", {"claim_code": "CB-1"})
    assert r["id"].startswith("ltr_") and len([c for c in calls if c["path"].endswith("/letters")]) == 2
    lob2 = fake_lob(calls, fail_on="CB-9")
    with pytest.raises(LobError) as e:
        lob2.create_letter(pdf, to, from_address(brand.RETURN_ADDRESS), "b:CB-9", "b:CB-9", {})
    assert e.value.status == 422 and "address_zip" in str(e.value)
    v = Verification.from_response({"deliverability": "deliverable_unnecessary_unit", "primary_line": "1 A ST", "secondary_line": "APT 2", "last_line": "AUSTIN TX 78701-1234",
                                    "components": {"city": "AUSTIN", "state": "TX", "zip_code": "78701", "zip_code_plus_4": "1234"}})
    assert v.ok and v.mail_lines() == ["1 A ST", "APT 2", "AUSTIN TX 78701-1234"] and v.to_address("PAT")["address_line2"] == "APT 2"
    assert not Verification.from_response({"deliverability": "deliverable_missing_unit"}).ok
    assert "primary_line" not in v.stored() and v.stored()["deliverability"] == "deliverable_unnecessary_unit"


def test_throttle_spaces_requests():
    slept: list[float] = []
    now = {"t": 0.0}
    t = Throttle(per_second=5, sleep=lambda s: (slept.append(s), now.__setitem__("t", now["t"] + s)), clock=lambda: now["t"])
    for _ in range(3): t.wait()
    assert len(slept) == 2 and all(abs(s - 0.2) < 1e-9 for s in slept)
