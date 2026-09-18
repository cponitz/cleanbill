import { assert, assertEquals } from "jsr:@std/assert@1";
import { appendDetail, EVENT_KIND, HANDLED_EVENTS, nextStatus, parseEvent, reasonOf } from "./logic.ts";

Deno.test("resend event types map to the five delivery statuses; opens never change the status", () => {
  assertEquals(nextStatus("email.sent"), "sent");
  assertEquals(nextStatus("email.delivered"), "delivered");
  assertEquals(nextStatus("email.delivery_delayed"), "delayed");
  assertEquals(nextStatus("email.bounced"), "bounced");
  assertEquals(nextStatus("email.complained"), "complained");
  assertEquals(nextStatus("email.opened"), null);
  assertEquals(nextStatus("email.something_new"), null);
  assertEquals(HANDLED_EVENTS.length, 7);
  assertEquals(EVENT_KIND.bounced, "email_bounced");
  assertEquals(EVENT_KIND.complained, "email_complained");
  assertEquals(EVENT_KIND.delivered, undefined);
});

Deno.test("a bounce event parses to an entry with the reason; the detail array is appended and capped", () => {
  const ev = parseEvent({ type: "email.bounced", created_at: "2026-10-08T15:00:00.000Z", data: { email_id: "4ef9a417", to: ["pat@example.com"], subject: "S", bounce: { message: "The recipient's mailbox is full.", type: "Transient", subType: "MailboxFull" } } });
  assert(ev);
  assertEquals(ev.emailId, "4ef9a417");
  assertEquals(ev.entry.type, "email.bounced");
  assertEquals(ev.entry.at, "2026-10-08T15:00:00.000Z");
  assertEquals(reasonOf(ev.entry), "The recipient's mailbox is full.");
  assert(!JSON.stringify(ev.entry).includes("pat@example.com"));   // the address is already on the account; the detail keeps the reason only
  const delivered = parseEvent({ type: "email.delivered", data: { email_id: "x" } });
  assertEquals(delivered?.entry.detail, null);
  assertEquals(reasonOf(delivered!.entry), null);
  const typed = parseEvent({ type: "email.bounced", data: { email_id: "x", bounce: { type: "Permanent", subType: "General" } } });
  assertEquals(reasonOf(typed!.entry), "Permanent / General");
  assertEquals(parseEvent({ data: {} }), null);
  assertEquals(parseEvent("nope"), null);
  assertEquals(parseEvent({ type: "email.sent" })?.emailId, null);
  const many = appendDetail(Array.from({ length: 50 }, (_, i) => ({ type: "email.delivery_delayed", at: String(i), detail: null })), delivered!.entry);
  assertEquals(many.length, 50);
  assertEquals(many.at(-1)?.type, "email.delivered");
  assertEquals(appendDetail(null, delivered!.entry).length, 1);
  assertEquals(appendDetail("garbage", delivered!.entry).length, 1);
});
