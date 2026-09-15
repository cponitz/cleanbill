// The only way the app talks to the backend: the public claim API (Supabase edge function `claim`, contract in
// docs/ARCHITECTURE.md §5.8). The claim code is the credential; there is no service-role key anywhere in this app.
// Only NEXT_PUBLIC_* environment variables are read (SPEC-04b amendment 2026-09-14).

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "https://letrfpwskjbgnyacesgv.supabase.co/functions/v1").replace(/\/$/, "");
export const STRIPE_ENABLED = process.env.NEXT_PUBLIC_STRIPE_ENABLED === "true";

export type Severity = "blocking" | "warning" | "info";
export type Finding = {
  code: string; severity: Severity; field: string; message: string; detail?: Record<string, unknown>;
  customer_message: string; next_action: string | null;
};
export type ClaimSummary = {
  id: string; status: string; findings: Finding[]; packet_url: string | null; typed_prefill?: Record<string, string> | null;
};
export type LeadInfo = {
  ok: true;
  lead: { claim_code: string; refund_years: number[]; est_refund_total: number; est_refund_by_year: Record<string, { total: number }> | null; est_forward_annual: number; tier: number };
  property: { prop_id: number; owner_name: string; situs_full: string };
  earliest_year: number; deadline: string;
};
export type ClosedInfo = { ok: false; error: "closed"; status: string; property: { situs_full: string }; lead: { refund_years: number[] }; claim: ClaimSummary | null };
export type ApiError = { ok: false; error: string; errors?: string[]; reason?: string; status?: string };
export type ClaimLookup = LeadInfo | ClosedInfo | ApiError;

export type SubmitResult = { ok: true; claim_id: string; status: string; mode?: string; first_name?: string } | ApiError;

export const PAGE_EVENTS = ["validation_shown", "dl_fix_started", "dl_fix_uploaded", "typed_precheck", "card_saved", "card_skipped", "packet_viewed"] as const;
export type PageEvent = typeof PAGE_EVENTS[number];

async function asJson<T>(r: Response): Promise<T> {
  return await r.json().catch(() => ({ ok: false, error: `http_${r.status}` })) as T;
}

/** GET /claim?c=CODE — the lead + property for an open code, or the closed state with the current claim. Throws on network failure. */
export async function getClaim(code: string): Promise<ClaimLookup> {
  const r = await fetch(`${API_BASE}/claim?c=${encodeURIComponent(code)}`, { cache: "no-store" });
  return asJson<ClaimLookup>(r);
}

/** GET /claim?c=CODE&claim=<id> — the inline-validation poll. */
export async function pollClaim(code: string, claimId: string): Promise<(ClaimSummary & { ok: true }) | ApiError> {
  const r = await fetch(`${API_BASE}/claim?c=${encodeURIComponent(code)}&claim=${encodeURIComponent(claimId)}`, { cache: "no-store" });
  return asJson(r);
}

/** Poll every 2 s until the status leaves submitted/processing or `maxMs` passes (SPEC-06 §2). Returns null on timeout. */
export async function waitForResult(code: string, claimId: string, maxMs = 30_000, everyMs = 2_000): Promise<ClaimSummary | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const j = await pollClaim(code, claimId).catch(() => null);
    if (j && j.ok && !["submitted", "processing"].includes(j.status)) return j;
    await new Promise((res) => setTimeout(res, everyMs));
  }
  return null;
}

/** GET /claim/precheck — addressMatches only (SPEC-06 §3). */
export async function precheck(code: string, address: string, zip: string): Promise<{ ok: true; match: boolean; id_address: string; situs: string } | ApiError> {
  const q = new URLSearchParams({ c: code, address, zip });
  const r = await fetch(`${API_BASE}/claim/precheck?${q}`, { cache: "no-store" });
  return asJson(r);
}

/** POST /claim/events — funnel telemetry; fire-and-forget, never blocks the UI. */
export function postEvent(code: string, kind: PageEvent, detail: Record<string, unknown> = {}): void {
  try {
    void fetch(`${API_BASE}/claim/events`, {
      method: "POST", keepalive: true, headers: { "content-type": "application/json" },
      body: JSON.stringify({ c: code, kind, detail }),
    }).catch(() => {});
  } catch { /* telemetry must never break the page */ }
}

/** POST /claim multipart — a new claim, a SPEC-02 re-upload, or a SPEC-06 §4 typed confirmation (the API decides by state). */
export async function submitClaim(form: FormData): Promise<SubmitResult> {
  const r = await fetch(`${API_BASE}/claim`, { method: "POST", body: form });
  return asJson<SubmitResult>(r);
}

/** POST /claim/reply — the customer's answer to a needs_review question (an inbound message for the operator/agent). */
export async function sendReply(code: string, claimId: string, body: string): Promise<{ ok: true; message_id: string } | ApiError> {
  const r = await fetch(`${API_BASE}/claim/reply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ c: code, claim: claimId, body }) });
  return asJson(r);
}

/** Codes look like TRD-XXXX-XXXX; accept what people type (lowercase, no dashes) and normalise. */
export function normalizeCode(raw: string): string | null {
  const c = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== 11 || !c.startsWith("TRD")) return null;
  return `TRD-${c.slice(3, 7)}-${c.slice(7, 11)}`;
}
