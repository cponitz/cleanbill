// GENERATED FILE — do not edit. Source: trd/findings.py (python -m trd.findings --emit-ts); CI fails if this is stale.
// The findings rule table (ADR 0013 / ADR 0016 / SPEC-06 §1): code -> severity, field, ops sentence, customer sentence, next action.

export type Severity = "blocking" | "warning" | "info";
export type Code = "not_readable" | "not_texas_id" | "address_mismatch" | "address_match" | "name_mismatch" | "name_match" | "signer_mismatch" | "expired" | "low_confidence" | "over_65" | "under_18" | "not_primary" | "other_homestead" | "processing_error";
export type Rule = { severity: Severity; field: string; ops: string; customer: string; next_action: string | null };

export const RULES: Record<Code, Rule> = {
  "not_readable": {
    "severity": "blocking",
    "field": "image",
    "ops": "ID image not legible — ask for a clearer photo",
    "customer": "We couldn't read your license photo. Please take a new photo in good light with the whole card in the frame.",
    "next_action": "retake_photo"
  },
  "not_texas_id": {
    "severity": "blocking",
    "field": "issuing_state",
    "ops": "Not a Texas DL/ID (state {issuing_state}) — Tax Code §11.43(j) requires a Texas driver's license or DPS ID",
    "customer": "Texas law requires a Texas driver's license or DPS ID with the application, and the card we read is from {issuing_state}. If you have a Texas ID, please upload that instead.",
    "next_action": "upload_texas_id"
  },
  "address_mismatch": {
    "severity": "blocking",
    "field": "address",
    "ops": "ID address ({id}) does not match situs ({situs}) — DPS address update required",
    "customer": "The address on your license ({id}) doesn't match the property ({situs}). TCAD requires them to match before it will approve a homestead exemption. Update your address with the Texas DPS online, then upload your updated license here.",
    "next_action": "dps_update"
  },
  "address_match": {
    "severity": "info",
    "field": "address",
    "ops": "ID address matches the property",
    "customer": "The address on your license matches the property.",
    "next_action": null
  },
  "name_mismatch": {
    "severity": "blocking",
    "field": "name",
    "ops": "Name on ID ({id}) not found in owner of record ({owner}) — confirm ownership/deed",
    "customer": "The name on the license is {id}; the appraisal roll lists the owner as {owner}. Are you on the deed? Reply below and we'll sort it out.",
    "next_action": "reply"
  },
  "name_match": {
    "severity": "info",
    "field": "name",
    "ops": "Name matches owner of record",
    "customer": "The name on your license matches the owner of record.",
    "next_action": null
  },
  "signer_mismatch": {
    "severity": "blocking",
    "field": "signature",
    "ops": "Name on ID ({id}) differs from the typed signature ({typed}) — confirm identity",
    "customer": "The name on the license is {id}, but you signed as {typed}. The application has to be signed by the person on the license. Reply below if this is you — for example a nickname or a married name.",
    "next_action": "reply"
  },
  "expired": {
    "severity": "warning",
    "field": "expiry",
    "ops": "ID is expired ({expiry}) — TCAD may accept; flag for reviewer",
    "customer": "Your license expired on {expiry}. TCAD usually still accepts it; we'll flag it for review.",
    "next_action": null
  },
  "low_confidence": {
    "severity": "blocking",
    "field": "confidence",
    "ops": "Low extraction confidence on a key field — reviewer to confirm against the image",
    "customer": "We couldn't read part of your license clearly. Please confirm the details below so we can check them against the appraisal record.",
    "next_action": "confirm_typed"
  },
  "over_65": {
    "severity": "info",
    "field": "dob",
    "ops": "Applicant is {age} — eligible for the over-65 exemption (add to 50-114)",
    "customer": "You're {age}, so you also qualify for the over-65 exemption. We'll include it on your application.",
    "next_action": null
  },
  "under_18": {
    "severity": "blocking",
    "field": "dob",
    "ops": "Applicant under 18 ({age}) — review",
    "customer": "The date of birth on the license makes you under 18. The homestead exemption is claimed by the adult owner of the home, so we'll review this by hand.",
    "next_action": "review"
  },
  "not_primary": {
    "severity": "blocking",
    "field": "primary",
    "ops": "Not primary residence per applicant",
    "customer": "You told us this isn't your primary residence. The homestead exemption applies only to your primary residence, so we've paused your claim and will email you before doing anything else.",
    "next_action": "review"
  },
  "other_homestead": {
    "severity": "blocking",
    "field": "other_hs",
    "ops": "Applicant reports another homestead exemption",
    "customer": "You told us you claim a homestead exemption on another property. Texas allows one per family, so we've paused your claim and will email you before doing anything else.",
    "next_action": "review"
  },
  "processing_error": {
    "severity": "blocking",
    "field": "processing",
    "ops": "processing error: {error}",
    "customer": "We hit a snag processing your application. We'll email you within one business day; nothing has been filed and you owe nothing.",
    "next_action": "wait"
  }
};

export const CODES = Object.keys(RULES) as Code[];

/** A structured finding: code is the contract; message is the rendered ops sentence; detail holds the facts. */
export type Finding = { code: Code; severity: Severity; field: string; message: string; detail?: Record<string, unknown> };

/** Fill `{key}` placeholders from detail; missing/null -> "". Mirrors trd.findings.render byte-for-byte. */
export function render(template: string, detail?: Record<string, unknown> | null): string {
  const d = detail ?? {};
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => { const v = d[k]; return v == null ? "" : String(v); });
}

export function makeFinding(code: Code, detail?: Record<string, unknown>): Finding {
  const rule = RULES[code];
  const f: Finding = { code, severity: rule.severity, field: rule.field, message: render(rule.ops, detail) };
  if (detail && Object.keys(detail).length) f.detail = detail;
  return f;
}

export function customerMessage(f: Finding): string {
  const rule = RULES[f.code];
  return rule ? render(rule.customer, f.detail) : f.message;
}

export function nextAction(f: Finding): string | null {
  return RULES[f.code]?.next_action ?? null;
}

/** What the claim API returns to the page: the stored finding plus the customer sentence and the next action. */
export function renderForCustomer(f: Finding): Finding & { customer_message: string; next_action: string | null } {
  return { ...f, customer_message: customerMessage(f), next_action: nextAction(f) };
}

export const blocking = (fs: Finding[]): Finding[] => fs.filter((f) => f.severity === "blocking");
/** The legacy one-line display string (claims.status_reason) — generated, never stored as the source of truth. */
export const reasonText = (fs: Finding[]): string | null => blocking(fs).map((f) => f.message).join("; ") || null;
