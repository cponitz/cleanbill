"""The agent's tools: JSON schemas Claude sees + the Python handlers that run when Claude calls them.

Design rules (worth internalizing — this is where most agent bugs come from):
  • Every tool returns a plain dict. Errors are returned as {"error": "..."} rather than raised, so the model can recover.
  • Tools are narrow. The agent cannot send email, charge cards, or submit to TCAD — it can only draft and route.
  • Anything expensive or irreversible (extraction costs money; status moves state) is logged to the audit trail.
"""
from __future__ import annotations

import base64
import hashlib
import json
from datetime import date
from io import BytesIO
from typing import Any, Callable

from cleanbill.agent.store import Store
from cleanbill.agent.validate import validate

EXTRACTION_MODEL = "claude-haiku-4-5"
PRICE_IN, PRICE_OUT = 1.0, 5.0

ID_SCHEMA = {
    "type": "object",
    "properties": {
        "readable": {"type": "boolean"}, "id_type": {"type": "string", "enum": ["driver_license", "id_card", "other"]},
        "issuing_state": {"type": "string"}, "first_name": {"type": "string"}, "middle_name": {"type": "string"}, "last_name": {"type": "string"},
        "dob": {"type": "string", "description": "YYYY-MM-DD"}, "expiry": {"type": "string", "description": "YYYY-MM-DD"}, "dl_number": {"type": "string"},
        "address_line1": {"type": "string"}, "city": {"type": "string"}, "state": {"type": "string"}, "zip": {"type": "string"},
        "confidence": {"type": "object", "properties": {k: {"type": "number"} for k in ("name", "dob", "address", "dl_number", "expiry")},
                       "required": ["name", "dob", "address", "dl_number", "expiry"]},
        "issues": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["readable", "id_type", "issuing_state", "first_name", "last_name", "dob", "expiry", "dl_number", "address_line1", "city", "state", "zip", "confidence", "issues"],
}


def mask_dl(n: str) -> str:
    return ("***" + str(n)[-4:]) if n else ""


class Tools:
    def __init__(self, store: Store, anthropic_client=None, today: date | None = None):
        self.store = store
        self.client = anthropic_client
        self.today = today or date.today()
        self.calls: list[dict] = []
        self._last_findings: dict[str, list[dict]] = {}   # claim_id -> structured findings from the last validation

    # ---- schemas the model sees -------------------------------------------------
    def schemas(self) -> list[dict]:
        return [
            {"name": "get_claim", "description": "Load everything about one claim: the claim (signed answers, status, findings), the customer account, lead, property record from the appraisal roll, uploaded documents with any extraction/validation, prior messages, and filings.",
             "input_schema": {"type": "object", "properties": {"claim_id": {"type": "string"}}, "required": ["claim_id"]}},
            {"name": "extract_id_fields", "description": "Run vision extraction on the customer's uploaded ID image(s). Costs money — call only if no extraction exists yet or the image was re-uploaded.",
             "input_schema": {"type": "object", "properties": {"claim_id": {"type": "string"}}, "required": ["claim_id"]}},
            {"name": "validate_against_roll", "description": "Compare the extracted ID fields with the appraisal-roll record (address, owner name, Texas ID, expiry, age) and return the recommended routing status with findings.",
             "input_schema": {"type": "object", "properties": {"claim_id": {"type": "string"}}, "required": ["claim_id"]}},
            {"name": "generate_form_50114", "description": "Build the application packet PDF (Form 50-114 data + signature/audit block) for a validated claim. Returns filing id and SHA-256.",
             "input_schema": {"type": "object", "properties": {"claim_id": {"type": "string"}, "over65": {"type": "boolean", "description": "Include the over-65 exemption request"}}, "required": ["claim_id"]}},
            {"name": "lookup_tcad_status", "description": "Check the Travis Central Appraisal District record for the property's current exemption flags (to detect approval). May be unavailable in some runtimes.",
             "input_schema": {"type": "object", "properties": {"prop_id": {"type": "integer"}}, "required": ["prop_id"]}},
            {"name": "draft_message", "description": "Write an outbound email DRAFT for a human to approve (shadow mode). Never claims something was sent or filed unless the record shows it.",
             "input_schema": {"type": "object", "properties": {"claim_id": {"type": "string"}, "intent": {"type": "string", "enum": ["needs_dl_update", "ready_to_submit", "needs_review", "filed", "approved", "denied", "reply", "other"]},
                                                              "subject": {"type": "string"}, "body": {"type": "string"}}, "required": ["claim_id", "intent", "subject", "body"]}},
            {"name": "set_status", "description": "Move the claim to a new status with a one-line reason (the structured findings from the last validation are stored with it). Only allowed transitions succeed.",
             "input_schema": {"type": "object", "properties": {"claim_id": {"type": "string"}, "status": {"type": "string", "enum": ["processing", "ready_to_submit", "needs_dl_update", "needs_review", "withdrawn"]}, "reason": {"type": "string"}}, "required": ["claim_id", "status", "reason"]}},
        ]

    # ---- dispatcher ------------------------------------------------------------
    def call(self, name: str, args: dict) -> dict:
        fn: Callable[..., dict] | None = getattr(self, f"t_{name}", None)
        if fn is None:
            return {"error": f"unknown tool {name}"}
        try:
            out = fn(**args)
        except Exception as e:  # tools never raise into the loop
            out = {"error": f"{type(e).__name__}: {e}"}
        self.calls.append({"tool": name, "args": args, "result": out})
        return out

    # ---- handlers --------------------------------------------------------------
    def t_get_claim(self, claim_id: str) -> dict:
        claim = self.store.get_claim(claim_id)
        for d in claim["documents"]:
            if d.get("extracted"):
                d["extracted"] = {**d["extracted"], "dl_number": mask_dl(d["extracted"].get("dl_number", ""))}
        claim["today"] = self.today.isoformat()
        return claim

    def t_extract_id_fields(self, claim_id: str) -> dict:
        claim = self.store.get_claim(claim_id)
        docs = [d for d in claim["documents"] if d["kind"] in ("dl_front", "dl_back")]
        if not docs:
            return {"error": "no ID documents uploaded"}
        if self.client is None:
            return {"error": "extraction client not configured in this runtime"}
        content: list[dict] = []
        for d in docs:
            mime, data = self.store.get_image(d["storage_path"])
            b64 = base64.b64encode(data).decode()
            if mime == "application/pdf":
                content.append({"type": "document", "source": {"type": "base64", "media_type": mime, "data": b64}})
            else:
                content.append({"type": "image", "source": {"type": "base64", "media_type": mime, "data": b64}})
        content.append({"type": "text", "text": "Extract the fields from this government-issued ID exactly as printed. Texas licenses label the fields with numbers: line 1 is the LAST name, line 2 is the FIRST name and middle name — always use the printed line numbers to decide which is which, never guess from how common a name is. Line 8 is the address. Read every digit of DOB, EXP, and the DL number carefully (US dates are MM/DD/YYYY). Dates as YYYY-MM-DD. If the card is not legible, set readable=false and explain in issues. Do not guess a field you cannot read — leave it empty and lower its confidence; report confidence honestly per field."})
        msg = self.client.messages.create(
            model=EXTRACTION_MODEL, max_tokens=800,
            system="You are a careful document-extraction service for a Texas property-tax preparation company. You read one identification card and return its fields through the record_id_fields tool. You never invent values.",
            tools=[{"name": "record_id_fields", "description": "Record the fields read from the ID card.", "input_schema": ID_SCHEMA}],
            tool_choice={"type": "tool", "name": "record_id_fields"}, messages=[{"role": "user", "content": content}])
        fields = next(b for b in msg.content if b.type == "tool_use").input
        cost = (msg.usage.input_tokens * PRICE_IN + msg.usage.output_tokens * PRICE_OUT) / 1e6
        v = validate(fields, claim["property"], claim["claim"]["full_name"], self.today).as_dict()
        front = next((d for d in docs if d["kind"] == "dl_front"), docs[0])
        self.store.record_extraction(front["id"], {**fields, "dl_number": mask_dl(fields.get("dl_number", ""))}, EXTRACTION_MODEL, cost, v)
        self.store.audit("extracted", claim_id, {"cost": cost, "model": EXTRACTION_MODEL})
        return {"extracted": {**fields, "dl_number": mask_dl(fields.get("dl_number", ""))}, "validation": v, "cost_usd": round(cost, 5)}

    def t_validate_against_roll(self, claim_id: str) -> dict:
        claim = self.store.get_claim(claim_id)
        front = next((d for d in claim["documents"] if d["kind"] == "dl_front" and d.get("extracted")), None)
        if not front:
            return {"error": "no extraction on file — call extract_id_fields first"}
        v = validate(front["extracted"], claim["property"], claim["claim"]["full_name"], self.today)
        self._last_findings[claim_id] = v.findings
        return v.as_dict()

    def t_generate_form_50114(self, claim_id: str, over65: bool = False) -> dict:
        from cleanbill.agent.packet import build_packet  # local import keeps reportlab optional for tests
        claim = self.store.get_claim(claim_id)
        front = next((d for d in claim["documents"] if d["kind"] == "dl_front" and d.get("extracted")), None)
        if not front:
            return {"error": "no extraction on file"}
        pdf = build_packet(claim, front["extracted"], over65=over65, today=self.today)
        sha = hashlib.sha256(pdf).hexdigest()
        fid = self.store.add_filing(claim_id, "50-114 (interim data sheet)" + (" + OV65" if over65 else ""), claim["lead"]["refund_years"], pdf, sha)
        self.store.audit("packet_generated", claim_id, {"filing_id": fid, "sha256": sha, "over65": over65})
        return {"filing_id": fid, "sha256": sha, "bytes": len(pdf)}

    def t_lookup_tcad_status(self, prop_id: int) -> dict:
        # TCAD's site is not reachable from the Claude sandbox; on GitHub Actions this becomes a real lookup.
        return {"available": False, "prop_id": prop_id, "reason": "TCAD lookup not available in this runtime — check traviscad.org/property-search manually or run on the scheduled job"}

    def t_draft_message(self, claim_id: str, intent: str, subject: str, body: str) -> dict:
        bad = [w for w in ("we have submitted", "has been submitted", "we filed", "was approved", "refund has been issued") if w in body.lower()]
        claim = self.store.get_claim(claim_id)
        filed = any(f.get("submitted_at") for f in claim["filings"])
        if bad and not filed:
            return {"error": f"draft claims an action that has not happened ({bad[0]}); rewrite without it"}
        mid = self.store.add_message(claim_id, intent, subject, body)
        return {"message_id": mid, "status": "draft_saved_for_human_approval"}

    def t_set_status(self, claim_id: str, status: str, reason: str) -> dict:
        self.store.set_status(claim_id, status, reason, self._last_findings.get(claim_id))
        self.store.audit("status_set_by_agent", claim_id, {"status": status, "reason": reason})
        return {"ok": True, "status": status}
