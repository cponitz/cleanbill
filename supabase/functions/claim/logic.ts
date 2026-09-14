// Pure decision logic for the claim API (no I/O) so it can be unit-tested in Deno (logic_test.ts):
//   * which follow-up a POST on an existing claim is (SPEC-02 re-upload / SPEC-06 typed confirmation) or 409
//   * the typed address pre-check (SPEC-06 §3)
//   * the shape of a `typed_id` document's `extracted` blob (SPEC-06 §3/§4)
//   * the funnel events the page may post (SPEC-06 §5, SPEC-02 §5)
import type { Finding } from "../_shared/findings.ts";
import { addressMatches, type Extracted, type PropertyRec } from "../_shared/validate.ts";

export const PAGE_EVENTS = ["validation_shown", "dl_fix_started", "dl_fix_uploaded", "typed_precheck", "card_saved", "card_skipped", "packet_viewed"] as const;
export type PageEvent = typeof PAGE_EVENTS[number];
export const isPageEvent = (k: string): k is PageEvent => (PAGE_EVENTS as readonly string[]).includes(k);

/** Findings that let the customer confirm typed values instead of a re-shoot (SPEC-06 §4). */
export const TYPED_FALLBACK_CODES = ["not_readable", "low_confidence"];

export type FollowUp = { mode: "reupload" } | { mode: "typed_confirm" } | { error: "conflict"; http: 409; reason: string };

/** A POST for a code whose lead is already `claimed`: re-upload (needs_dl_update + dl_front), typed confirmation
 *  (needs_review with a fallback code + typed fields), otherwise 409 (SPEC-02 acceptance). */
export function followUpMode(p: { status: string; findings: Finding[] | null | undefined; hasFront: boolean; hasTyped: boolean }): FollowUp {
  if (p.hasFront) {
    if (p.status === "needs_dl_update") return { mode: "reupload" };
    return { error: "conflict", http: 409, reason: `a new license is only accepted while the claim is needs_dl_update (current status: ${p.status})` };
  }
  if (p.hasTyped) {
    const codes = (p.findings ?? []).map((f) => String(f.code));
    if (p.status === "needs_review" && codes.some((c) => TYPED_FALLBACK_CODES.includes(c))) return { mode: "typed_confirm" };
    return { error: "conflict", http: 409, reason: `typed confirmation is only accepted while the claim is needs_review for an unreadable or low-confidence license (current status: ${p.status})` };
  }
  return { error: "conflict", http: 409, reason: "a claim already exists for this code; send dl_front to re-upload a license, or the typed_* fields to confirm one" };
}

/** SPEC-06 §3: `addressMatches` only — the cheap check the page runs on blur before the photo step. */
export function precheck(address: string | null, zip: string | null, prop: PropertyRec): { match: boolean; id_address: string; situs: string } {
  const a = (address ?? "").trim().replace(/\s+/g, " "), z = (zip ?? "").trim().slice(0, 5);
  return { match: !!a && addressMatches(a, z, prop), id_address: [a, z].filter(Boolean).join(", "), situs: prop.situs_full };
}

export type TypedFields = { first_name?: string; last_name?: string; dob?: string; address_line1?: string; city?: string; zip?: string };
const TYPED_KEYS: Array<[keyof TypedFields, string]> = [
  ["first_name", "typed_first_name"], ["last_name", "typed_last_name"], ["dob", "typed_dob"],
  ["address_line1", "typed_address"], ["city", "typed_city"], ["zip", "typed_zip"],
];

/** Reads the typed_* form fields; `typed_name` ("First M Last") is split when first/last are not given. Null when none typed. */
export function parseTypedFields(get: (k: string) => string): TypedFields | null {
  const t: TypedFields = {};
  for (const [k, form] of TYPED_KEYS) { const v = get(form); if (v) t[k] = v; }
  const name = get("typed_name");
  if (name && !t.first_name && !t.last_name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) { t.last_name = parts[parts.length - 1]; t.first_name = parts.slice(0, -1).join(" "); }
    else if (parts.length === 1) t.first_name = parts[0];
  }
  if (t.dob && !/^\d{4}-\d{2}-\d{2}$/.test(t.dob)) delete t.dob;
  if (t.zip) t.zip = t.zip.replace(/\D/g, "").slice(0, 5);
  return Object.keys(t).length ? t : null;
}

/** The `extracted` blob of a `typed_id` document: same 13-field shape, confidence 1.0 on typed fields, source "typed". */
export function typedExtracted(t: TypedFields, base?: Partial<Extracted>): Extracted {
  const has = (k: keyof TypedFields) => !!t[k];
  const c = base?.confidence ?? { name: 0, dob: 0, address: 0, dl_number: 0, expiry: 0 };
  return {
    readable: true, id_type: base?.id_type ?? "driver_license", issuing_state: base?.issuing_state ?? "TX",
    first_name: t.first_name ?? base?.first_name ?? "", middle_name: base?.middle_name ?? "", last_name: t.last_name ?? base?.last_name ?? "",
    dob: t.dob ?? base?.dob ?? "", expiry: base?.expiry ?? "", dl_number: base?.dl_number ?? "",
    address_line1: t.address_line1 ?? base?.address_line1 ?? "", city: t.city ?? base?.city ?? "", state: base?.state ?? "TX", zip: t.zip ?? base?.zip ?? "",
    confidence: {
      name: has("first_name") || has("last_name") ? 1.0 : c.name, dob: has("dob") ? 1.0 : c.dob,
      address: has("address_line1") || has("zip") || has("city") ? 1.0 : c.address, dl_number: c.dl_number, expiry: c.expiry,
    },
    issues: base?.issues ?? [], source: "typed",
  };
}

export function extFor(mime: string): string {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "application/pdf" ? "pdf" : mime === "image/heic" || mime === "image/heif" ? "heic" : "jpg";
}
