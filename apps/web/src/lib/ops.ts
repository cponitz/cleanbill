// The operator console's client of the ops API (SPEC-09 D2, ADR 0020). The ops password is the credential: kept in
// sessionStorage for this tab only (cleared when the tab closes), sent as x-ops-key on every call. No server route, no
// secret in Vercel (ADR 0017). Contract: docs/ARCHITECTURE.md §5.8 "Ops API endpoints".
import { API_BASE } from "./api";

export const OPS_KEY_STORAGE = "cb-ops-key";
export const MAX_403 = 3;   // three consecutive 403s clear the stored key and show the login again

export type Finding = { code: string; severity: "blocking" | "warning" | "info"; field?: string; message: string; detail?: Record<string, unknown> };
export type OpsMessage = { id: string; subject: string | null; body: string | null; intent: string | null; agent_draft: boolean; direction: "inbound" | "outbound"; channel: string; approved_at: string | null; sent_at: string | null; created_at: string };
export type OpsClaim = {
  id: string; customer_id: string | null; account: { id: string; email: string; card_on_file: boolean } | null;
  status: string; status_reason: string | null; full_name: string | null; email: string | null; phone: string | null;
  signed_at: string | null; created_at: string; updated_at: string | null;
  claim_code: string | null; est_refund_total: number | null; prop_id: number | null; situs_full: string | null; owner_name: string | null;
  extracted: Record<string, unknown> | null; findings: Finding[]; extraction_cost_usd: number | null;
  packet: { url: string | null; form_version: string | null; generated_at: string; submitted_at: string | null; channel: string | null } | null;
  messages: OpsMessage[];
};
export type OpsInquiry = { id: string; created_at: string; kind: string; address: string | null; email: string | null; company: string | null; properties: number | null; bills: string[] | null; source_path: string | null; handled_at: string | null; notes: string | null };
export type OpsSystem = { key: string; value: Record<string, unknown>; updated_at: string };
export type OpsKpis = { leads_loaded: number; mailed: number; page_views: number; opened: number; claimed: number; ready_to_submit: number; needs_dl_update: number; needs_review: number; filed: number; approved: number; refunded: number; inquiries_open: number };
export type OpsData = {
  ok: true; kpis: OpsKpis;
  funnel: { by_kind_7d: Record<string, number>; by_kind_all: Record<string, number>; by_day_30d: Array<{ day: string; kind: string; n: number }>; steps: Array<{ step: string; count: number; pct: number | null }> };
  claims: OpsClaim[]; inquiries: OpsInquiry[]; system: OpsSystem[]; generated_at: string;
};
export type NewClaimMatch = {
  prop_id: number; situs_full: string; owner_name: string | null; hs_exempt: boolean; ov65_exempt: boolean; appraised_value: number | null; deed_date: string | null;
  lead: { claim_code: string; status: string; tier: number; refund_years: number[]; est_refund_total: number; est_forward_annual: number; estimate_unconfirmed: boolean; link: string } | null;
};
export type OpsError = { ok: false; error: string; status?: string; hint?: string; http: number };

export function readKey(): string | null {
  try { return sessionStorage.getItem(OPS_KEY_STORAGE); } catch { return null; }
}
export function storeKey(key: string): void {
  try { sessionStorage.setItem(OPS_KEY_STORAGE, key); } catch { /* private mode: the key lives in memory only */ }
}
export function clearKey(): void {
  try { sessionStorage.removeItem(OPS_KEY_STORAGE); } catch { /* ignore */ }
}

async function asJson<T>(r: Response): Promise<T | OpsError> {
  const j = await r.json().catch(() => ({})) as Record<string, unknown>;
  if (!r.ok || j.ok === false) return { ok: false, error: String(j.error ?? `http_${r.status}`), status: j.status as string | undefined, hint: j.hint as string | undefined, http: r.status };
  return j as T;
}

export async function opsGet(key: string, params: { status?: string; limit?: number } = {}): Promise<OpsData | OpsError> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.limit) q.set("limit", String(params.limit));
  const r = await fetch(`${API_BASE}/ops${q.size ? `?${q}` : ""}`, { headers: { "x-ops-key": key }, cache: "no-store" });
  return asJson<OpsData>(r);
}

export async function opsPost<T = { ok: true }>(key: string, body: Record<string, unknown>): Promise<T | OpsError> {
  const r = await fetch(`${API_BASE}/ops`, { method: "POST", headers: { "x-ops-key": key, "content-type": "application/json" }, body: JSON.stringify(body) });
  return asJson<T>(r);
}

export const isErr = (x: unknown): x is OpsError => !!x && typeof x === "object" && (x as { ok?: boolean }).ok === false;

/** What each operator action needs from the claim's status (mirror of the guards in supabase/functions/ops/logic.ts). */
export const OPEN = ["submitted", "processing", "needs_dl_update", "needs_review", "ready_to_submit"];
export const can = {
  markFiled: (s: string) => s === "ready_to_submit",
  reprocess: (s: string) => s === "submitted" || s === "processing",
  withdraw: (s: string) => OPEN.includes(s),
};

export const CLAIM_STATUSES = ["submitted", "processing", "ready_to_submit", "needs_dl_update", "needs_review", "filed", "approved", "denied", "refunded", "paid", "withdrawn"];
export const FUNNEL_KINDS = ["view", "typed_precheck", "validation_shown", "dl_fix_started", "dl_fix_uploaded", "card_saved", "card_skipped", "packet_viewed", "inquiry"];

/** "3 min ago" / "2 h ago" / "4 d ago" for the health section. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
