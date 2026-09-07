"""Data access for the agent: one interface, two backends.

  FixtureStore  — JSON fixtures on disk (tests/fixtures/cases.json). Used for local dry runs and tests; no network.
  SupabaseStore — the real database via supabase-py (service-role key). Used on GitHub Actions / any host with network.

Both expose the same small set of operations the tools need. Keeping the surface tiny is deliberate: the agent should
only be able to read a claim, record extraction/validation, write a draft, and move status along allowed transitions.
"""
from __future__ import annotations

import copy
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

ALLOWED_TRANSITIONS = {
    "submitted": {"processing", "needs_review"},
    "processing": {"ready_to_submit", "needs_dl_update", "needs_review"},
    "needs_dl_update": {"processing", "ready_to_submit", "needs_review", "withdrawn"},
    "needs_review": {"processing", "ready_to_submit", "needs_dl_update", "withdrawn"},
    "ready_to_submit": {"filed", "needs_review", "withdrawn"},
    "filed": {"approved", "denied", "needs_review"},
    "approved": {"refunded"},
    "refunded": {"paid"},
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Store(Protocol):
    def get_claim(self, customer_id: str) -> dict: ...
    def get_image(self, storage_path: str) -> tuple[str, bytes]: ...
    def record_extraction(self, document_id: str, extracted: dict, model: str, cost: float, validation: dict) -> None: ...
    def add_filing(self, customer_id: str, form_version: str, tax_years: list[int], packet_bytes: bytes, sha256: str) -> str: ...
    def add_message(self, customer_id: str, intent: str, subject: str, body: str) -> str: ...
    def set_status(self, customer_id: str, status: str, reason: str | None) -> None: ...
    def audit(self, action: str, entity_id: str, detail: dict) -> None: ...
    def list_customers(self, statuses: list[str]) -> list[dict]: ...


class FixtureStore:
    """In-memory store seeded from a JSON file. Writes are kept in memory and exposed via .writes for assertions."""

    def __init__(self, path: Path | str):
        self.data = json.loads(Path(path).read_text())
        self.writes: list[dict] = []

    def _cust(self, cid: str) -> dict:
        for c in self.data["customers"]:
            if c["id"] == cid:
                return c
        raise KeyError(cid)

    def get_claim(self, customer_id: str) -> dict:
        c = self._cust(customer_id)
        lead = next(l for l in self.data["leads"] if l["id"] == c["lead_id"])
        prop = next(p for p in self.data["properties"] if p["prop_id"] == lead["prop_id"])
        docs = [d for d in self.data["documents"] if d["customer_id"] == customer_id]
        msgs = [m for m in self.data.get("messages", []) if m["customer_id"] == customer_id]
        filings = [f for f in self.data.get("filings", []) if f["customer_id"] == customer_id]
        return copy.deepcopy({"customer": c, "lead": lead, "property": prop, "documents": docs, "messages": msgs, "filings": filings})

    def get_image(self, storage_path: str) -> tuple[str, bytes]:
        p = Path(self.data.get("image_root", ".")) / storage_path
        return ("image/jpeg", p.read_bytes())

    def record_extraction(self, document_id: str, extracted: dict, model: str, cost: float, validation: dict) -> None:
        for d in self.data["documents"]:
            if d["id"] == document_id:
                d.update({"extracted": extracted, "extraction_model": model, "extraction_cost_usd": cost, "validation": validation})
        self.writes.append({"op": "record_extraction", "document_id": document_id})

    def add_filing(self, customer_id, form_version, tax_years, packet_bytes, sha256) -> str:
        fid = f"filing-{len(self.data.setdefault('filings', [])) + 1}"
        self.data["filings"].append({"id": fid, "customer_id": customer_id, "form_version": form_version, "tax_years": tax_years,
                                     "packet_sha256": sha256, "generated_at": now_iso(), "bytes": len(packet_bytes)})
        self.writes.append({"op": "add_filing", "id": fid})
        return fid

    def add_message(self, customer_id, intent, subject, body) -> str:
        mid = f"msg-{len(self.data.setdefault('messages', [])) + 1}"
        self.data["messages"].append({"id": mid, "customer_id": customer_id, "direction": "outbound", "channel": "email",
                                      "intent": intent, "subject": subject, "body": body, "agent_draft": True, "created_at": now_iso()})
        self.writes.append({"op": "add_message", "id": mid, "intent": intent})
        return mid

    def set_status(self, customer_id, status, reason) -> None:
        c = self._cust(customer_id)
        if status not in ALLOWED_TRANSITIONS.get(c["status"], set()) and status != c["status"]:
            raise ValueError(f"transition {c['status']} -> {status} not allowed")
        c["status"], c["status_reason"] = status, reason
        self.writes.append({"op": "set_status", "customer_id": customer_id, "status": status})

    def audit(self, action, entity_id, detail) -> None:
        self.writes.append({"op": "audit", "action": action, "entity_id": entity_id, "detail": detail})

    def list_customers(self, statuses) -> list[dict]:
        return [copy.deepcopy(c) for c in self.data["customers"] if c["status"] in statuses]


class SupabaseStore:
    def __init__(self, url: str | None = None, key: str | None = None):
        from supabase import create_client
        self.sb = create_client(url or os.environ["SUPABASE_URL"], key or os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    def get_claim(self, customer_id: str) -> dict:
        c = self.sb.table("customers").select("*").eq("id", customer_id).single().execute().data
        lead = self.sb.table("leads").select("*").eq("id", c["lead_id"]).single().execute().data
        prop = self.sb.table("properties").select("*").eq("prop_id", lead["prop_id"]).single().execute().data
        docs = self.sb.table("documents").select("*").eq("customer_id", customer_id).execute().data
        msgs = self.sb.table("messages").select("*").eq("customer_id", customer_id).order("created_at").execute().data
        filings = self.sb.table("filings").select("*").eq("customer_id", customer_id).order("generated_at").execute().data
        return {"customer": c, "lead": lead, "property": prop, "documents": docs, "messages": msgs, "filings": filings}

    def get_image(self, storage_path: str) -> tuple[str, bytes]:
        data = self.sb.storage.from_("ids").download(storage_path)
        mime = "application/pdf" if storage_path.endswith(".pdf") else "image/png" if storage_path.endswith(".png") else "image/jpeg"
        return (mime, data)

    def record_extraction(self, document_id, extracted, model, cost, validation) -> None:
        self.sb.table("documents").update({"extracted": extracted, "extraction_model": model, "extraction_cost_usd": cost, "validation": validation}).eq("id", document_id).execute()

    def add_filing(self, customer_id, form_version, tax_years, packet_bytes, sha256) -> str:
        path = f"{customer_id}/packet-{int(datetime.now().timestamp())}.pdf"
        self.sb.storage.from_("packets").upload(path, packet_bytes, {"content-type": "application/pdf"})
        row = self.sb.table("filings").insert({"customer_id": customer_id, "form_version": form_version, "tax_years": tax_years,
                                               "packet_path": path, "packet_sha256": sha256}).execute().data[0]
        return row["id"]

    def add_message(self, customer_id, intent, subject, body) -> str:
        row = self.sb.table("messages").insert({"customer_id": customer_id, "direction": "outbound", "channel": "email", "intent": intent,
                                                "subject": subject, "body": body, "agent_draft": True}).execute().data[0]
        return row["id"]

    def set_status(self, customer_id, status, reason) -> None:
        cur = self.sb.table("customers").select("status").eq("id", customer_id).single().execute().data["status"]
        if status not in ALLOWED_TRANSITIONS.get(cur, set()) and status != cur:
            raise ValueError(f"transition {cur} -> {status} not allowed")
        self.sb.table("customers").update({"status": status, "status_reason": reason}).eq("id", customer_id).execute()

    def audit(self, action, entity_id, detail) -> None:
        self.sb.table("audit_log").insert({"actor": "agent", "action": action, "entity": "customers", "entity_id": entity_id, "detail": detail}).execute()

    def list_customers(self, statuses) -> list[dict]:
        return self.sb.table("customers").select("*").in_("status", statuses).order("created_at").execute().data
