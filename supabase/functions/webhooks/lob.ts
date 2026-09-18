// Lob webhook logic (SPEC-11 §4.2): the pure part of POST /webhooks/lob, tested in lob_test.ts — which event types
// move mail_pieces.status where, which one stamps delivered_at, which one suppresses the lead, and the {type, at,
// detail} entry appended to mail_pieces.events. Lob's event envelope: {id: "evt_…", reference_id: "ltr_…", event_type:
// {id: "letter.mailed", …}, body: <the letter, or a tracking_event {name, time, details, location}>, date_created}.
export const PIECE_STATUSES = ["address_rejected", "created", "rendered", "mailed", "in_transit", "in_local_area", "processed_for_delivery", "re_routed", "returned_to_sender", "deleted"] as const;
export type PieceStatus = (typeof PIECE_STATUSES)[number];

/** Lob event type → mail_pieces.status. Milestones only move forward (RANK); returned / re-routed / deleted are side or
 *  terminal states that always apply. rendered_thumbnails and anything unknown is appended to events but changes nothing. */
export const EVENT_STATUS: Record<string, PieceStatus | null> = {
  "letter.created": "created", "letter.rendered_pdf": "rendered", "letter.rendered_thumbnails": null, "letter.mailed": "mailed",
  "letter.in_transit": "in_transit", "letter.in_local_area": "in_local_area", "letter.processed_for_delivery": "processed_for_delivery",
  "letter.re-routed": "re_routed", "letter.returned_to_sender": "returned_to_sender", "letter.deleted": "deleted",
};
export const HANDLED_EVENTS = Object.keys(EVENT_STATUS);
const RANK: Record<PieceStatus, number> = { address_rejected: -1, created: 0, rendered: 1, mailed: 2, in_transit: 3, in_local_area: 4, processed_for_delivery: 5, re_routed: 6, returned_to_sender: 7, deleted: 8 };
const TERMINAL: PieceStatus[] = ["re_routed", "returned_to_sender", "deleted"];

export type LobEvent = { id?: unknown; reference_id?: unknown; event_type?: { id?: unknown } | null; body?: Record<string, unknown> | null; date_created?: unknown };
export type PieceEntry = { type: string; at: string; detail: Record<string, unknown> | null };

export function parseLobEvent(raw: unknown): { id: string | null; type: string; lobId: string | null; entry: PieceEntry } | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as LobEvent;
  const type = typeof e.event_type?.id === "string" ? e.event_type.id : "";
  if (!type) return null;
  const body = e.body && typeof e.body === "object" ? e.body : null;
  const lobId = typeof e.reference_id === "string" && e.reference_id ? e.reference_id : (typeof body?.id === "string" && String(body.id).startsWith("ltr_") ? String(body.id) : null);
  const at = (typeof body?.time === "string" && body.time) || (typeof e.date_created === "string" && e.date_created) || new Date().toISOString();
  return { id: typeof e.id === "string" ? e.id : null, type, lobId, entry: { type, at, detail: detailOf(type, body) } };
}

/** The part of the body worth keeping: for a tracking event its name / location / details; for the letter events the
 *  render's expected delivery date. Never the `to` address (it is already on the piece) and never the whole letter. */
export function detailOf(type: string, body: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!body) return null;
  if (typeof body.name === "string" && body.object === "tracking_event") {
    const d: Record<string, unknown> = { name: body.name };
    if (typeof body.location === "string" && body.location) d.location = body.location;
    if (body.details && typeof body.details === "object") d.details = JSON.parse(JSON.stringify(body.details).slice(0, 2000));
    return d;
  }
  const d: Record<string, unknown> = {};
  if (typeof body.expected_delivery_date === "string") d.expected_delivery_date = body.expected_delivery_date;
  if (typeof body.carrier === "string") d.carrier = body.carrier;
  if (type === "letter.deleted") d.deleted = true;
  return Object.keys(d).length ? d : null;
}

/** The status after this event: a milestone never moves a piece backwards, a terminal state always applies, and a piece
 *  whose address was rejected is never touched (it has no Lob id, so this cannot happen in practice). */
export function nextPieceStatus(current: string | null, type: string): PieceStatus | null {
  const to = EVENT_STATUS[type] ?? null;
  if (!to) return null;
  const cur = (PIECE_STATUSES as readonly string[]).includes(current ?? "") ? (current as PieceStatus) : null;
  if (cur === "address_rejected") return null;
  if (TERMINAL.includes(to)) return to;
  if (cur && TERMINAL.includes(cur)) return null;
  if (cur && RANK[to] <= RANK[cur]) return null;
  return to;
}

export function appendPieceEvent(existing: unknown, entry: PieceEntry, max = 50): PieceEntry[] {
  const arr = Array.isArray(existing) ? (existing as PieceEntry[]) : [];
  return [...arr, entry].slice(-max);
}

/** What one accepted event does to the piece and the lead. delivered_at is set once, by processed_for_delivery;
 *  returned_to_sender suppresses the lead (never re-mailed) and writes the funnel event `mail_returned`. */
export function pieceEffects(piece: { status: string | null; delivered_at: string | null; to_override: boolean }, ev: { type: string; entry: PieceEntry }): { status: PieceStatus | null; delivered_at: string | null; suppress_lead: boolean; event_kind: "mail_returned" | null } {
  const status = nextPieceStatus(piece.status, ev.type);
  const delivered_at = !piece.delivered_at && ev.type === "letter.processed_for_delivery" ? ev.entry.at : null;
  const returned = ev.type === "letter.returned_to_sender";
  return { status, delivered_at, suppress_lead: returned && !piece.to_override, event_kind: returned ? "mail_returned" : null };
}
