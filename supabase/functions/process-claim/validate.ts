// Validation of extracted ID fields against the TCAD property record. Pure functions — unit-tested in Deno and mirrored in Python.

export type Extracted = {
  readable: boolean; id_type: string; issuing_state: string;
  first_name: string; middle_name?: string; last_name: string;
  dob: string; expiry: string; dl_number: string;
  address_line1: string; city: string; state: string; zip: string;
  confidence: { name: number; dob: number; address: number; dl_number: number; expiry: number };
  issues: string[];
};

export type PropertyRec = {
  prop_id: number; owner_name: string; situs_num?: string; situs_street?: string; situs_unit?: string;
  situs_city?: string; situs_zip?: string; situs_full: string; deed_date?: string;
};

/** A structured finding (ADR 0013 / SPEC-06): code is the contract; message is display text generated from the facts. */
export type Finding = {
  code: "not_readable" | "not_texas_id" | "address_mismatch" | "address_match" | "name_mismatch" | "name_match" | "signer_mismatch"
      | "expired" | "low_confidence" | "over_65" | "under_18" | "not_primary" | "other_homestead" | "processing_error";
  severity: "blocking" | "warning" | "info";
  field: string;
  message: string;
  detail?: Record<string, unknown>;
};

export type Validation = {
  status: "ready_to_submit" | "needs_dl_update" | "needs_review";
  address_match: boolean; name_match: boolean; texas_id: boolean; expired: boolean; age: number | null; over65: boolean;
  findings: Finding[];
};

export const blocking = (fs: Finding[]): Finding[] => fs.filter((f) => f.severity === "blocking");
/** The legacy one-line display string (claims.status_reason) — generated, never stored as the source of truth. */
export const reasonText = (fs: Finding[]): string | null => blocking(fs).map((f) => f.message).join("; ") || null;

const SUFFIX: Record<string, string> = {
  STREET: "ST", ST: "ST", AVENUE: "AVE", AV: "AVE", AVE: "AVE", BOULEVARD: "BLVD", BLVD: "BLVD", DRIVE: "DR", DR: "DR",
  ROAD: "RD", RD: "RD", LANE: "LN", LN: "LN", COURT: "CT", CT: "CT", CIRCLE: "CIR", CIR: "CIR", PLACE: "PL", PL: "PL",
  TRAIL: "TRL", TRL: "TRL", PARKWAY: "PKWY", PKWY: "PKWY", WAY: "WAY", TERRACE: "TER", TER: "TER", COVE: "CV", CV: "CV",
  LOOP: "LOOP", PASS: "PASS", PATH: "PATH", RUN: "RUN", HIGHWAY: "HWY", HWY: "HWY", NORTH: "N", N: "N", SOUTH: "S", S: "S",
  EAST: "E", E: "E", WEST: "W", W: "W",
};
const UNIT_WORDS = new Set(["APT", "UNIT", "STE", "SUITE", "#", "BLDG", "LOT"]);

export function normalizeStreet(s: string): { num: string; tokens: string[]; unit: string } {
  const raw = (s ?? "").toUpperCase().replace(/[.,]/g, " ").replace(/#/g, " # ").replace(/\s+/g, " ").trim();
  const parts = raw.split(" ").filter(Boolean);
  let num = "", unit = "";
  const tokens: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!num && /^\d+[A-Z]?$/.test(p)) { num = p.replace(/[A-Z]$/, ""); continue; }
    if (UNIT_WORDS.has(p)) { unit = (parts[i + 1] ?? "").replace(/^#/, ""); i++; continue; }
    tokens.push(SUFFIX[p] ?? p);
  }
  return { num, tokens, unit };
}

export function addressMatches(idLine1: string, idZip: string, prop: PropertyRec): boolean {
  const a = normalizeStreet(idLine1);
  const situsLine = prop.situs_num ? `${prop.situs_num} ${prop.situs_street ?? ""} ${prop.situs_unit ? "UNIT " + prop.situs_unit : ""}` : prop.situs_full.split(",")[0];
  const b = normalizeStreet(situsLine);
  if (!a.num || a.num !== b.num) return false;
  // first street-name token must match; suffix/direction may be dropped on the ID
  const an = a.tokens.filter((t) => !Object.values(SUFFIX).includes(t) || t.length > 2);
  const bn = b.tokens.filter((t) => !Object.values(SUFFIX).includes(t) || t.length > 2);
  if (!an.length || !bn.length || an[0] !== bn[0]) return false;
  const zipA = (idZip ?? "").slice(0, 5), zipB = (prop.situs_zip ?? "").slice(0, 5) || (prop.situs_full.match(/\b(\d{5})\b/)?.[1] ?? "");
  if (zipA && zipB && zipA !== zipB) return false;
  if (b.unit && a.unit && a.unit !== b.unit) return false;
  return true;
}

function nameTokens(s: string): string[] {
  return (s ?? "").toUpperCase().replace(/[^A-Z &]/g, " ").split(/\s+/).filter((t) => t && t !== "&" && t.length > 1);
}

/** TCAD owner names look like "GARCIA RICHARD L", "SMITH JOHN & JANE", "DOE JANE R & JOHN". The applicant's last and first names must both appear. */
export function nameMatches(first: string, last: string, ownerName: string): boolean {
  const toks = nameTokens(ownerName);
  const L = (last ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  const F = (first ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!L || !F) return false;
  const lastOk = toks.some((t) => t.replace(/[^A-Z]/g, "") === L) || toks.join("").includes(L);
  const firstOk = toks.some((t) => t.replace(/[^A-Z]/g, "") === F || (t.length >= 3 && F.startsWith(t)) || (F.length >= 3 && t.startsWith(F)));
  return lastOk && firstOk;
}

export function ageOn(dob: string, on = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob ?? "");
  if (!m) return null;
  const b = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  let a = on.getUTCFullYear() - b.getUTCFullYear();
  const before = on.getUTCMonth() < b.getUTCMonth() || (on.getUTCMonth() === b.getUTCMonth() && on.getUTCDate() < b.getUTCDate());
  if (before) a--;
  return a;
}

export function validate(ex: Extracted, prop: PropertyRec, typedName: string): Validation {
  const findings: Finding[] = [];
  const add = (code: Finding["code"], severity: Finding["severity"], field: string, message: string, detail?: Record<string, unknown>) =>
    findings.push({ code, severity, field, message, ...(detail ? { detail } : {}) });
  const texas = (ex.issuing_state ?? "").toUpperCase() === "TX" && ex.id_type !== "other";
  const addr = addressMatches(ex.address_line1, ex.zip, prop);
  const nm = nameMatches(ex.first_name, ex.last_name, prop.owner_name);            // ID vs. owner of record (the eligibility test)
  const signerOk = nameMatches(ex.first_name, ex.last_name, typedName);            // ID vs. the name typed as signature (identity test)
  const age = ageOn(ex.dob);
  const expired = !!ex.expiry && ex.expiry < new Date().toISOString().slice(0, 10);
  const lowConf = Math.min(ex.confidence?.name ?? 0, ex.confidence?.address ?? 0, ex.confidence?.dob ?? 0) < 0.6;

  if (!ex.readable) add("not_readable", "blocking", "image", "ID image not legible — ask for a clearer photo");
  if (!texas) add("not_texas_id", "blocking", "issuing_state", "Not a Texas DL/ID — Tax Code §11.43(j) requires a Texas driver's license or DPS ID", { issuing_state: ex.issuing_state, id_type: ex.id_type });
  if (!addr) add("address_mismatch", "blocking", "address", `ID address (${ex.address_line1}, ${ex.zip}) does not match situs (${prop.situs_full}) — DPS address update required`, { id: `${ex.address_line1}, ${ex.city} ${ex.zip}`, situs: prop.situs_full });
  else add("address_match", "info", "address", "ID address matches the property");
  if (!nm) add("name_mismatch", "blocking", "name", `Name on ID (${ex.first_name} ${ex.last_name}) not found in owner of record (${prop.owner_name}) — confirm ownership/deed`, { id: `${ex.first_name} ${ex.last_name}`, owner: prop.owner_name });
  else add("name_match", "info", "name", "Name matches owner of record");
  if (!signerOk) add("signer_mismatch", "blocking", "signature", `Name on ID (${ex.first_name} ${ex.last_name}) differs from the typed signature (${typedName}) — confirm identity`, { id: `${ex.first_name} ${ex.last_name}`, typed: typedName });
  if (expired) add("expired", "warning", "expiry", "ID is expired — TCAD may accept; flag for reviewer", { expiry: ex.expiry });
  if (lowConf) add("low_confidence", "blocking", "confidence", "Low extraction confidence on a key field — reviewer to confirm against the image", { confidence: ex.confidence });
  if (age != null && age >= 65) add("over_65", "info", "dob", `Applicant is ${age} — eligible for the over-65 exemption (add to 50-114)`, { age });
  if (age != null && age < 18) add("under_18", "blocking", "dob", "Applicant under 18 — review", { age });

  let status: Validation["status"] = "ready_to_submit";
  if (!ex.readable || !texas || !nm || !signerOk || lowConf || (age != null && age < 18)) status = "needs_review";
  else if (!addr) status = "needs_dl_update";
  return { status, address_match: addr, name_match: nm, texas_id: texas, expired, age, over65: age != null && age >= 65, findings };
}
