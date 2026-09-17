from datetime import datetime, timedelta, timezone

from cleanbill.jobs.purge_ids import select_purgeable

NOW = datetime(2026, 9, 8, tzinfo=timezone.utc)


def _doc(cid, days_old, kind="dl_front", purged=None):
    return {"id": f"d-{cid}", "claim_id": cid, "kind": kind, "storage_path": f"{cid}/{kind}.jpg",
            "created_at": (NOW - timedelta(days=days_old)).isoformat(), "purged_at": purged}


def test_filed_30_days_ago_is_purged():
    docs = [_doc("a", 40)]
    filings = {"a": [{"claim_id": "a", "submitted_at": (NOW - timedelta(days=31)).isoformat()}]}
    out = select_purgeable(docs, {"a": {"status": "filed"}}, filings, NOW)
    assert [(d["id"], r) for d, r in out] == [("d-a", "filed 30+ days ago")]


def test_filed_recently_is_kept():
    docs = [_doc("a", 40)]
    filings = {"a": [{"claim_id": "a", "submitted_at": (NOW - timedelta(days=10)).isoformat()}]}
    assert select_purgeable(docs, {"a": {"status": "filed"}}, filings, NOW) == []


def test_open_claim_is_kept_until_stale():
    docs = [_doc("b", 100)]
    assert select_purgeable(docs, {"b": {"status": "needs_dl_update"}}, {}, NOW) == []
    docs = [_doc("b", 181)]
    assert [r for _, r in select_purgeable(docs, {"b": {"status": "needs_dl_update"}}, {}, NOW)] == ["stale claim (180+ days, never filed)"]


def test_withdrawn_after_a_week():
    assert select_purgeable([_doc("c", 3)], {"c": {"status": "withdrawn"}}, {}, NOW) == []
    assert len(select_purgeable([_doc("c", 8)], {"c": {"status": "withdrawn"}}, {}, NOW)) == 1


def test_already_purged_and_other_kinds_skipped():
    docs = [_doc("a", 400, purged="2026-01-01T00:00:00+00:00"), _doc("a", 400, kind="other")]
    filings = {"a": [{"claim_id": "a", "submitted_at": (NOW - timedelta(days=300)).isoformat()}]}
    assert select_purgeable(docs, {"a": {"status": "filed"}}, filings, NOW) == []
