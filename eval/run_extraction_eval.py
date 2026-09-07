"""Extraction eval: run the DL-extraction prompt over eval/ids/*.jpg and score against labels.json.

Mirrors the schema/prompt in supabase/functions/process-claim/index.ts — keep the two in sync (a drift test lives in tests/).
Usage:  ANTHROPIC_API_KEY=... python eval/run_extraction_eval.py [--model claude-haiku-4-5] [--limit 30]
Writes eval/results/<model>_<timestamp>.json and prints a per-field accuracy table.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import anthropic

HERE = Path(__file__).parent
PRICES = {"claude-haiku-4-5": (1.0, 5.0), "claude-sonnet-5": (2.0, 10.0)}  # $/Mtok in, out

ID_SCHEMA = {
    "type": "object",
    "properties": {
        "readable": {"type": "boolean", "description": "false if the image is not a legible government ID"},
        "id_type": {"type": "string", "enum": ["driver_license", "id_card", "other"]},
        "issuing_state": {"type": "string", "description": "Two-letter state code printed on the card, e.g. TX"},
        "first_name": {"type": "string"}, "middle_name": {"type": "string"}, "last_name": {"type": "string"},
        "dob": {"type": "string", "description": "Date of birth as YYYY-MM-DD"},
        "expiry": {"type": "string", "description": "Expiration date as YYYY-MM-DD"},
        "dl_number": {"type": "string"},
        "address_line1": {"type": "string", "description": "Street line exactly as printed, including unit"},
        "city": {"type": "string"}, "state": {"type": "string"}, "zip": {"type": "string"},
        "confidence": {
            "type": "object", "description": "0-1 confidence per field",
            "properties": {k: {"type": "number"} for k in ("name", "dob", "address", "dl_number", "expiry")},
            "required": ["name", "dob", "address", "dl_number", "expiry"],
        },
        "issues": {"type": "array", "items": {"type": "string"}, "description": "Glare, blur, crop, or anything that made a field uncertain"},
    },
    "required": ["readable", "id_type", "issuing_state", "first_name", "last_name", "dob", "expiry", "dl_number",
                 "address_line1", "city", "state", "zip", "confidence", "issues"],
}
SYSTEM = ("You are a careful document-extraction service for a Texas property-tax preparation company. You read one "
          "identification card and return its fields through the record_id_fields tool. You never invent values.")
USER_TEXT = ('Extract the fields from this government-issued ID exactly as printed. Texas licenses label the fields with numbers: line 1 is the LAST name, line 2 is the FIRST name and middle name — always use the printed line numbers to decide which is which, never guess from how common a name is. Line 8 is the address. Read every digit of DOB, EXP, and the DL number carefully (US dates are MM/DD/YYYY). Dates as YYYY-MM-DD. If the card is not legible, set readable=false and explain in issues. Do not guess a field you cannot read — leave it empty and lower its confidence; report confidence honestly per field.')


def norm(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def extract(client: anthropic.Anthropic, model: str, path: Path) -> tuple[dict, dict]:
    data = base64.b64encode(path.read_bytes()).decode()
    msg = client.messages.create(
        model=model, max_tokens=800, system=SYSTEM,
        tools=[{"name": "record_id_fields", "description": "Record the fields read from the ID card.", "input_schema": ID_SCHEMA}],
        tool_choice={"type": "tool", "name": "record_id_fields"},
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": data}},
            {"type": "text", "text": USER_TEXT},
        ]}],
    )
    tool = next(b for b in msg.content if b.type == "tool_use")
    return tool.input, {"input_tokens": msg.usage.input_tokens, "output_tokens": msg.usage.output_tokens}


FIELDS = ["first_name", "last_name", "dob", "expiry", "dl_number", "address_line1", "zip"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="claude-haiku-4-5")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not set", file=sys.stderr); return 2
    client = anthropic.Anthropic()
    labels = json.loads((HERE / "ids" / "labels.json").read_text())
    if a.limit: labels = labels[: a.limit]
    pin, pout = PRICES.get(a.model, (1.0, 5.0))
    rows, per_field = [], {f: 0 for f in FIELDS}
    tot_in = tot_out = 0
    t0 = time.time()
    for rec in labels:
        got, usage = extract(client, a.model, HERE / "ids" / rec["file"])
        tot_in += usage["input_tokens"]; tot_out += usage["output_tokens"]
        ok = {}
        for f in FIELDS:
            exp = rec[f]; val = got.get(f, "")
            if f == "first_name":  # given names: the model may fold the middle name into first_name — score them together
                ok[f] = norm(str(val) + str(got.get("middle_name", ""))) in (norm(exp + rec.get("middle_name", "")), norm(exp)) or norm(str(val)) == norm(exp + rec.get("middle_name", ""))
            else:
                ok[f] = norm(str(val)) == norm(str(exp))
            per_field[f] += int(ok[f])
        rows.append({"id": rec["id"], "conditions": rec["conditions"], "ok": ok, "all_ok": all(ok.values()),
                     "got": {f: got.get(f) for f in FIELDS + ["middle_name"]}, "expected": {f: rec[f] for f in FIELDS},
                     "confidence": got.get("confidence"), "issues": got.get("issues"), "usage": usage})
        print(f"{rec['id']}  {'PASS' if all(ok.values()) else 'FAIL'}  {[f for f, v in ok.items() if not v]}  {rec['conditions']}")
    n = len(rows)
    cost = (tot_in * pin + tot_out * pout) / 1e6
    summary = {
        "model": a.model, "n": n, "field_accuracy": {f: per_field[f] / n for f in FIELDS},
        "overall_field_accuracy": sum(per_field.values()) / (n * len(FIELDS)),
        "all_fields_correct_rate": sum(r["all_ok"] for r in rows) / n,
        "cost_total_usd": round(cost, 4), "cost_per_image_usd": round(cost / n, 5),
        "avg_input_tokens": tot_in / n, "avg_output_tokens": tot_out / n, "elapsed_s": round(time.time() - t0, 1),
    }
    out = HERE / "results"; out.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    (out / f"{a.model}_{stamp}.json").write_text(json.dumps({"summary": summary, "rows": rows}, indent=2))
    print("\nSUMMARY", json.dumps(summary, indent=2))
    return 0 if summary["overall_field_accuracy"] >= 0.95 else 1


if __name__ == "__main__":
    raise SystemExit(main())
