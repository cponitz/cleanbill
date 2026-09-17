"""The findings rule table — the ONE place that maps a finding code to its severity, field, sentences and next action
(ADR 0013, ADR 0016, SPEC-06 §1). Validators emit a code plus facts (`detail`); everything a person reads is rendered here.

  * `supabase/functions/_shared/findings.ts` is GENERATED from this file:  python -m cleanbill.findings --emit-ts
    CI fails when it is stale:                                             python -m cleanbill.findings --emit-ts --check
  * `tests/fixtures/findings_snapshot.json` pins the rendered output of both validators for the shared cases (G-9):
                                                                            python -m cleanbill.findings --emit-snapshot

Two sentences per code: `ops` is what the operator and the agent see (facts first, terse); `customer` is what the homeowner
sees on the page and in drafts (plain English, no urgency). `next_action` tells the page which control to show.
Templates use `{key}` placeholders filled from `detail`; a missing key renders as an empty string on both sides.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TS_PATH = REPO / "supabase" / "functions" / "_shared" / "findings.ts"
SNAPSHOT_PATH = REPO / "tests" / "fixtures" / "findings_snapshot.json"
CASES_PATH = REPO / "tests" / "fixtures" / "cases.json"

SEVERITIES = ("blocking", "warning", "info")


@dataclass(frozen=True)
class Rule:
    severity: str
    field: str
    ops: str
    customer: str
    next_action: str | None


# Order matters only for readability; the validators decide the order findings appear in.
RULES: dict[str, Rule] = {
    "not_readable": Rule(
        "blocking", "image",
        "ID image not legible — ask for a clearer photo",
        "We couldn't read your license photo. Please take a new photo in good light with the whole card in the frame.",
        "retake_photo"),
    "not_texas_id": Rule(
        "blocking", "issuing_state",
        "Not a Texas DL/ID (state {issuing_state}) — Tax Code §11.43(j) requires a Texas driver's license or DPS ID",
        "Texas law requires a Texas driver's license or DPS ID with the application, and the card we read is from {issuing_state}. If you have a Texas ID, please upload that instead.",
        "upload_texas_id"),
    "address_mismatch": Rule(
        "blocking", "address",
        "ID address ({id}) does not match situs ({situs}) — DPS address update required",
        "The address on your license ({id}) doesn't match the property ({situs}). TCAD requires them to match before it will approve a homestead exemption. Update your address with the Texas DPS online, then upload your updated license here.",
        "dps_update"),
    "address_match": Rule(
        "info", "address",
        "ID address matches the property",
        "The address on your license matches the property.",
        None),
    "name_mismatch": Rule(
        "blocking", "name",
        "Name on ID ({id}) not found in owner of record ({owner}) — confirm ownership/deed",
        "The name on the license is {id}; the appraisal roll lists the owner as {owner}. Are you on the deed? Reply below and we'll sort it out.",
        "reply"),
    "name_match": Rule(
        "info", "name",
        "Name matches owner of record",
        "The name on your license matches the owner of record.",
        None),
    "signer_mismatch": Rule(
        "blocking", "signature",
        "Name on ID ({id}) differs from the typed signature ({typed}) — confirm identity",
        "The name on the license is {id}, but you signed as {typed}. The application has to be signed by the person on the license. Reply below if this is you — for example a nickname or a married name.",
        "reply"),
    "expired": Rule(
        "warning", "expiry",
        "ID is expired ({expiry}) — TCAD may accept; flag for reviewer",
        "Your license expired on {expiry}. TCAD usually still accepts it; we'll flag it for review.",
        None),
    "low_confidence": Rule(
        "blocking", "confidence",
        "Low extraction confidence on a key field — reviewer to confirm against the image",
        "We couldn't read part of your license clearly. Please confirm the details below so we can check them against the appraisal record.",
        "confirm_typed"),
    "over_65": Rule(
        "info", "dob",
        "Applicant is {age} — eligible for the over-65 exemption (add to 50-114)",
        "You're {age}, so you also qualify for the over-65 exemption. We'll include it on your application.",
        None),
    "under_18": Rule(
        "blocking", "dob",
        "Applicant under 18 ({age}) — review",
        "The date of birth on the license makes you under 18. The homestead exemption is claimed by the adult owner of the home, so we'll review this by hand.",
        "review"),
    "not_primary": Rule(
        "blocking", "primary",
        "Not primary residence per applicant",
        "You told us this isn't your primary residence. The homestead exemption applies only to your primary residence, so we've paused your claim and will email you before doing anything else.",
        "review"),
    "other_homestead": Rule(
        "blocking", "other_hs",
        "Applicant reports another homestead exemption",
        "You told us you claim a homestead exemption on another property. Texas allows one per family, so we've paused your claim and will email you before doing anything else.",
        "review"),
    "processing_error": Rule(
        "blocking", "processing",
        "processing error: {error}",
        "We hit a snag processing your application. We'll email you within one business day; nothing has been filed and you owe nothing.",
        "wait"),
}

CODES = tuple(RULES)
_PLACEHOLDER = re.compile(r"\{(\w+)\}")


def render(template: str, detail: dict | None) -> str:
    """Fill `{key}` placeholders from detail; missing/None -> ''. Mirrored byte-for-byte in findings.ts."""
    d = detail or {}

    def sub(m: re.Match) -> str:
        v = d.get(m.group(1))
        return "" if v is None else str(v)

    return _PLACEHOLDER.sub(sub, template)


def make_finding(code: str, detail: dict | None = None) -> dict:
    """A structured finding {code, severity, field, message, detail?}. `message` is the rendered ops sentence."""
    rule = RULES[code]
    f = {"code": code, "severity": rule.severity, "field": rule.field, "message": render(rule.ops, detail)}
    if detail:
        f["detail"] = detail
    return f


def customer_message(f: dict) -> str:
    rule = RULES.get(f["code"])
    return render(rule.customer, f.get("detail")) if rule else f.get("message", "")


def next_action(f: dict) -> str | None:
    rule = RULES.get(f["code"])
    return rule.next_action if rule else None


def render_for_customer(f: dict) -> dict:
    """What the claim API returns to the page: the stored finding plus the customer sentence and the next action."""
    return {**f, "customer_message": customer_message(f), "next_action": next_action(f)}


def blocking(findings: list[dict]) -> list[dict]:
    return [f for f in findings if f.get("severity") == "blocking"]


def reason_text(findings: list[dict]) -> str | None:
    """The legacy one-line display string (claims.status_reason) — generated from the findings, never the source of truth."""
    return "; ".join(f["message"] for f in blocking(findings)) or None


# ---------------------------------------------------------------------------------------------------------------------
# Generators

def emit_ts() -> str:
    rules_json = json.dumps({c: asdict(r) for c, r in RULES.items()}, indent=2, ensure_ascii=False)
    codes_union = " | ".join(f'"{c}"' for c in CODES)
    return f'''// GENERATED FILE — do not edit. Source: cleanbill/findings.py (python -m cleanbill.findings --emit-ts); CI fails if this is stale.
// The findings rule table (ADR 0013 / ADR 0016 / SPEC-06 §1): code -> severity, field, ops sentence, customer sentence, next action.

export type Severity = "blocking" | "warning" | "info";
export type Code = {codes_union};
export type Rule = {{ severity: Severity; field: string; ops: string; customer: string; next_action: string | null }};

export const RULES: Record<Code, Rule> = {rules_json};

export const CODES = Object.keys(RULES) as Code[];

/** A structured finding: code is the contract; message is the rendered ops sentence; detail holds the facts. */
export type Finding = {{ code: Code; severity: Severity; field: string; message: string; detail?: Record<string, unknown> }};

/** Fill `{{key}}` placeholders from detail; missing/null -> "". Mirrors cleanbill.findings.render byte-for-byte. */
export function render(template: string, detail?: Record<string, unknown> | null): string {{
  const d = detail ?? {{}};
  return template.replace(/\\{{(\\w+)\\}}/g, (_m, k: string) => {{ const v = d[k]; return v == null ? "" : String(v); }});
}}

export function makeFinding(code: Code, detail?: Record<string, unknown>): Finding {{
  const rule = RULES[code];
  const f: Finding = {{ code, severity: rule.severity, field: rule.field, message: render(rule.ops, detail) }};
  if (detail && Object.keys(detail).length) f.detail = detail;
  return f;
}}

export function customerMessage(f: Finding): string {{
  const rule = RULES[f.code];
  return rule ? render(rule.customer, f.detail) : f.message;
}}

export function nextAction(f: Finding): string | null {{
  return RULES[f.code]?.next_action ?? null;
}}

/** What the claim API returns to the page: the stored finding plus the customer sentence and the next action. */
export function renderForCustomer(f: Finding): Finding & {{ customer_message: string; next_action: string | null }} {{
  return {{ ...f, customer_message: customerMessage(f), next_action: nextAction(f) }};
}}

export const blocking = (fs: Finding[]): Finding[] => fs.filter((f) => f.severity === "blocking");
/** The legacy one-line display string (claims.status_reason) — generated, never stored as the source of truth. */
export const reasonText = (fs: Finding[]): string | null => blocking(fs).map((f) => f.message).join("; ") || null;
'''


def emit_snapshot() -> dict:
    """Render every validation case in tests/fixtures/cases.json through the Python validator (G-9 snapshot)."""
    from datetime import date

    from cleanbill.agent.validate import validate

    cases = json.loads(CASES_PATH.read_text())
    props = {p["prop_id"]: p for p in cases["properties"]}
    out: dict[str, dict] = {}
    for case in cases["validation_cases"]:
        today = date.fromisoformat(case["today"])
        v = validate(case["extracted"], props[case["prop_id"]], case["typed_name"], today)
        out[case["name"]] = {"status": v.status, "findings": [render_for_customer(f) for f in v.findings], "reason": reason_text(v.findings)}
    return out


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Findings rule table: generate findings.ts and the G-9 snapshot.")
    ap.add_argument("--emit-ts", action="store_true", help=f"write {TS_PATH.relative_to(REPO)}")
    ap.add_argument("--emit-snapshot", action="store_true", help=f"write {SNAPSHOT_PATH.relative_to(REPO)}")
    ap.add_argument("--check", action="store_true", help="do not write; exit 1 if the generated file(s) differ from disk")
    a = ap.parse_args(argv)
    if not (a.emit_ts or a.emit_snapshot):
        ap.error("nothing to do: pass --emit-ts and/or --emit-snapshot")
    stale = []
    if a.emit_ts:
        want = emit_ts()
        if a.check:
            if not TS_PATH.exists() or TS_PATH.read_text() != want: stale.append(str(TS_PATH.relative_to(REPO)))
        else:
            TS_PATH.write_text(want); print(f"wrote {TS_PATH.relative_to(REPO)}")
    if a.emit_snapshot:
        want_s = json.dumps(emit_snapshot(), indent=1, ensure_ascii=False) + "\n"
        if a.check:
            if not SNAPSHOT_PATH.exists() or SNAPSHOT_PATH.read_text() != want_s: stale.append(str(SNAPSHOT_PATH.relative_to(REPO)))
        else:
            SNAPSHOT_PATH.write_text(want_s); print(f"wrote {SNAPSHOT_PATH.relative_to(REPO)}")
    if stale:
        print("STALE — regenerate with: python -m cleanbill.findings --emit-ts --emit-snapshot\n  " + "\n  ".join(stale), file=sys.stderr)
        return 1
    if a.check: print("generated files are current")
    return 0


if __name__ == "__main__":
    sys.exit(main())
