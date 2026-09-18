// webhooks logic (SPEC-10 §4.3): the pure part of the inbound Resend webhook, tested in logic_test.ts — which event
// types move messages.delivery_status where, and the {type, at, detail} entry appended to messages.delivery_detail.
export const DELIVERY_STATUSES = ["sent", "delivered", "delayed", "bounced", "complained"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Resend event type → delivery_status. `email.opened` / `email.clicked` never change the status (tracking is off; if it
 *  were on, an open is not a delivery fact) — they are only appended to the detail. */
export const EVENT_STATUS: Record<string, DeliveryStatus | null> = {
  "email.sent": "sent", "email.delivered": "delivered", "email.delivery_delayed": "delayed", "email.bounced": "bounced", "email.complained": "complained",
  "email.opened": null, "email.clicked": null,
};
export const HANDLED_EVENTS = Object.keys(EVENT_STATUS);
/** Event kinds written to `events` (with the claim code) so the funnel and the claim list badge see them. */
export const EVENT_KIND: Partial<Record<DeliveryStatus, "email_bounced" | "email_complained">> = { bounced: "email_bounced", complained: "email_complained" };

export type ResendEvent = { type?: unknown; created_at?: unknown; data?: { email_id?: unknown; bounce?: unknown; complaint?: unknown; failed?: unknown; to?: unknown; subject?: unknown } | null };
export type DetailEntry = { type: string; at: string; detail: Record<string, unknown> | null };

export function parseEvent(raw: unknown): { type: string; emailId: string | null; entry: DetailEntry } | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as ResendEvent;
  const type = typeof e.type === "string" ? e.type : "";
  if (!type) return null;
  const emailId = typeof e.data?.email_id === "string" && e.data.email_id ? e.data.email_id : null;
  const at = typeof e.created_at === "string" && e.created_at ? e.created_at : new Date().toISOString();
  return { type, emailId, entry: { type, at, detail: detailOf(e) } };
}

/** The provider's reason, small enough to store and show on hover: the bounce / complaint / failure object only. */
export function detailOf(e: ResendEvent): Record<string, unknown> | null {
  const d = e.data ?? {};
  const pick = d?.bounce ?? d?.complaint ?? d?.failed ?? null;
  if (!pick || typeof pick !== "object") return null;
  return JSON.parse(JSON.stringify(pick).slice(0, 4000)) as Record<string, unknown>;
}

/** The one-line reason for the /ops hover: bounce.message, or the type / subType, or nothing. */
export function reasonOf(entry: DetailEntry): string | null {
  const d = entry.detail ?? {};
  const msg = d.message ?? d.reason ?? null;
  if (typeof msg === "string" && msg) return msg.slice(0, 500);
  const parts = [d.type, d.subType].filter((x) => typeof x === "string" && x);
  return parts.length ? parts.join(" / ") : null;
}

/** The new delivery_status after this event, or null when the event does not change it (unknown types included). */
export function nextStatus(type: string): DeliveryStatus | null {
  return EVENT_STATUS[type] ?? null;
}

export function appendDetail(existing: unknown, entry: DetailEntry, max = 50): DetailEntry[] {
  const arr = Array.isArray(existing) ? (existing as DetailEntry[]) : [];
  return [...arr, entry].slice(-max);
}
