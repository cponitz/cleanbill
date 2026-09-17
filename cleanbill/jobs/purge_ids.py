"""Purge driver's-license images once they are no longer needed (Tax Code §11.48: DL numbers are confidential; we keep
images only as long as an application may need them).

Rules (a document is purged when ANY applies):
  1. Filed:      the customer's filing was submitted to TCAD ≥ RETENTION_DAYS ago (default 30).
  2. Withdrawn:  the customer status is `withdrawn` and the image is ≥ 7 days old.
  3. Stale:      the claim never progressed (status still submitted/processing/needs_dl_update/needs_review) and the image
                 is ≥ STALE_DAYS old (default 180) — nothing will be filed from it.
The extracted fields stay (with the DL number already masked to ***1234); only the image object is deleted and
`documents.purged_at` is stamped. Every purge is written to audit_log.

Usage:
  python -m cleanbill.jobs.purge_ids            # dry run: prints what would be purged
  python -m cleanbill.jobs.purge_ids --apply    # actually delete
Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

RETENTION_DAYS = int(os.environ.get("ID_RETENTION_DAYS", "30"))
STALE_DAYS = int(os.environ.get("ID_STALE_DAYS", "180"))
OPEN_STATUSES = {"submitted", "processing", "needs_dl_update", "needs_review", "ready_to_submit"}


def _dt(s: str | None) -> datetime | None:
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def select_purgeable(docs: list[dict], claims: dict[str, dict], filings: dict[str, list[dict]], now: datetime) -> list[tuple[dict, str]]:
    """Pure decision function (unit-tested). Returns [(document, reason)]."""
    out: list[tuple[dict, str]] = []
    for d in docs:
        if d.get("purged_at") or d.get("kind") not in ("dl_front", "dl_back"):
            continue
        cust = claims.get(d["claim_id"]) or {}
        created = _dt(d.get("created_at")) or now
        age = now - created
        submitted = [_dt(f.get("submitted_at")) for f in filings.get(d["claim_id"], []) if f.get("submitted_at")]
        if submitted and now - max(submitted) >= timedelta(days=RETENTION_DAYS):
            out.append((d, f"filed {RETENTION_DAYS}+ days ago"))
        elif cust.get("status") == "withdrawn" and age >= timedelta(days=7):
            out.append((d, "claim withdrawn"))
        elif cust.get("status") in OPEN_STATUSES and age >= timedelta(days=STALE_DAYS):
            out.append((d, f"stale claim ({STALE_DAYS}+ days, never filed)"))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="delete for real (default: dry run)")
    a = ap.parse_args()
    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    now = datetime.now(timezone.utc)
    docs = sb.table("documents").select("id, claim_id, kind, storage_path, created_at, purged_at").is_("purged_at", "null").execute().data
    ids = sorted({d["claim_id"] for d in docs})
    claims = {c["id"]: c for c in (sb.table("claims").select("id, status").in_("id", ids).execute().data if ids else [])}
    filings: dict[str, list[dict]] = {}
    for f in (sb.table("filings").select("claim_id, submitted_at").in_("claim_id", ids).execute().data if ids else []):
        filings.setdefault(f["claim_id"], []).append(f)

    todo = select_purgeable(docs, claims, filings, now)
    print(f"{len(docs)} un-purged ID images; {len(todo)} due for purge ({'APPLYING' if a.apply else 'dry run'})")
    for d, reason in todo:
        print(f"  {d['storage_path']}  <- {reason}")
        if not a.apply:
            continue
        sb.storage.from_("ids").remove([d["storage_path"]])
        sb.table("documents").update({"purged_at": now.isoformat()}).eq("id", d["id"]).execute()
        sb.table("audit_log").insert({"actor": "purge-ids", "action": "id_image_purged", "entity": "documents", "entity_id": d["id"],
                                      "detail": {"reason": reason, "storage_path": d["storage_path"]}}).execute()
    return 0


if __name__ == "__main__":
    sys.exit(main())
