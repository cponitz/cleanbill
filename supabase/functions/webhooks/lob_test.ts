import { assert, assertEquals } from "jsr:@std/assert@1";
import { appendPieceEvent, HANDLED_EVENTS, nextPieceStatus, parseLobEvent, pieceEffects } from "./lob.ts";

const tracking = (type: string, name: string, extra: Record<string, unknown> = {}) => ({
  id: "evt_1", reference_id: "ltr_abc", event_type: { id: type, resource: "letters", object: "event_type" }, date_created: "2026-10-06T14:00:00.000Z",
  body: { id: "evnt_1", name, time: "2026-10-06T13:59:00.000Z", location: "78721", details: { event: "Arrived at USPS", action_required: false }, object: "tracking_event", ...extra },
});

Deno.test("lob event types map to the piece statuses; milestones only move forward, terminal states always apply", () => {
  assertEquals(HANDLED_EVENTS.length, 10);
  assertEquals(nextPieceStatus("created", "letter.rendered_pdf"), "rendered");
  assertEquals(nextPieceStatus("created", "letter.mailed"), "mailed");
  assertEquals(nextPieceStatus("in_transit", "letter.mailed"), null);                       // late-arriving earlier milestone
  assertEquals(nextPieceStatus("processed_for_delivery", "letter.in_local_area"), null);
  assertEquals(nextPieceStatus("mailed", "letter.processed_for_delivery"), "processed_for_delivery");
  assertEquals(nextPieceStatus("processed_for_delivery", "letter.returned_to_sender"), "returned_to_sender");
  assertEquals(nextPieceStatus("returned_to_sender", "letter.in_transit"), null);            // terminal stays
  assertEquals(nextPieceStatus("created", "letter.deleted"), "deleted");
  assertEquals(nextPieceStatus("created", "letter.rendered_thumbnails"), null);
  assertEquals(nextPieceStatus("created", "letter.something_new"), null);
  assertEquals(nextPieceStatus(null, "letter.created"), "created");
  assertEquals(nextPieceStatus("address_rejected", "letter.mailed"), null);
});

Deno.test("a tracking event parses to an entry with the letter id, time and a small detail; the address never rides along", () => {
  const ev = parseLobEvent(tracking("letter.in_transit", "In Transit"));
  assert(ev);
  assertEquals(ev.lobId, "ltr_abc");
  assertEquals(ev.entry.type, "letter.in_transit");
  assertEquals(ev.entry.at, "2026-10-06T13:59:00.000Z");                                       // the tracking time, not the envelope's
  assertEquals(ev.entry.detail, { name: "In Transit", location: "78721", details: { event: "Arrived at USPS", action_required: false } });
  const created = parseLobEvent({ id: "evt_2", reference_id: "ltr_abc", event_type: { id: "letter.created" }, date_created: "2026-10-05T14:00:00.000Z", body: { id: "ltr_abc", object: "letter", to: { name: "PAT OWNER", address_line1: "3675 DUVAL ST" }, expected_delivery_date: "2026-10-09", carrier: "USPS" } });
  assert(created);
  assertEquals(created.entry.at, "2026-10-05T14:00:00.000Z");
  assertEquals(created.entry.detail, { expected_delivery_date: "2026-10-09", carrier: "USPS" });
  assert(!JSON.stringify(created.entry).includes("DUVAL"));
  assertEquals(parseLobEvent({ event_type: { id: "letter.deleted" }, body: { id: "ltr_zzz", object: "letter" } })?.lobId, "ltr_zzz");   // reference_id missing → body.id
  assertEquals(parseLobEvent({ body: {} }), null);
  assertEquals(parseLobEvent("nope"), null);
  assertEquals(parseLobEvent({ event_type: { id: "letter.mailed" } })?.lobId, null);
  const many = appendPieceEvent(Array.from({ length: 50 }, (_, i) => ({ type: "letter.in_transit", at: String(i), detail: null })), ev.entry);
  assertEquals(many.length, 50);
  assertEquals(many.at(-1)?.type, "letter.in_transit");
  assertEquals(appendPieceEvent("garbage", ev.entry).length, 1);
});

Deno.test("processed_for_delivery stamps delivered_at once; returned_to_sender suppresses the lead and writes mail_returned; a proof piece never touches a lead", () => {
  const delivered = parseLobEvent(tracking("letter.processed_for_delivery", "Processed for Delivery"))!;
  assertEquals(pieceEffects({ status: "in_local_area", delivered_at: null, to_override: false }, delivered), { status: "processed_for_delivery", delivered_at: "2026-10-06T13:59:00.000Z", suppress_lead: false, event_kind: null });
  assertEquals(pieceEffects({ status: "processed_for_delivery", delivered_at: "2026-10-06T13:59:00.000Z", to_override: false }, delivered).delivered_at, null);
  const returned = parseLobEvent(tracking("letter.returned_to_sender", "Returned to Sender"))!;
  assertEquals(pieceEffects({ status: "processed_for_delivery", delivered_at: "x", to_override: false }, returned), { status: "returned_to_sender", delivered_at: null, suppress_lead: true, event_kind: "mail_returned" });
  assertEquals(pieceEffects({ status: "mailed", delivered_at: null, to_override: true }, returned).suppress_lead, false);
  const mailed = parseLobEvent(tracking("letter.mailed", "Mailed"))!;
  assertEquals(pieceEffects({ status: "rendered", delivered_at: null, to_override: false }, mailed), { status: "mailed", delivered_at: null, suppress_lead: false, event_kind: null });
});
