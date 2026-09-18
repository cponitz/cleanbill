import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { addressKey, ALLOWED_TRANSITIONS, attachmentName, attachmentPlan, canTransition, claimLink, featureFlags, filedDraft, funnelSteps, guardAction, guardSend, isEmail, maskSelftest, MAX_ATTACHMENT_BYTES, parseChannel, parseLimit, resendPayload, scoreMatch, type SendableMessage } from "./logic.ts";

Deno.test("transitions mirror cleanbill/agent/store.py: withdraw from every open status, file only from ready_to_submit", () => {
  for (const s of ["submitted", "processing", "needs_dl_update", "needs_review", "ready_to_submit"]) assert(canTransition(s, "withdrawn"), s);
  assert(!canTransition("filed", "withdrawn"));
  assert(canTransition("ready_to_submit", "filed") && !canTransition("needs_review", "filed"));
  assert(canTransition("approved", "approved"));   // no-op is fine
  assertEquals(Object.keys(ALLOWED_TRANSITIONS).length, 8);
});

Deno.test("mark_filed guard: only from ready_to_submit", () => {
  assertEquals(guardAction("mark_filed", "ready_to_submit"), { ok: true, to: "filed" });
  for (const s of ["submitted", "processing", "needs_review", "filed", "withdrawn"]) {
    const g = guardAction("mark_filed", s);
    assert(!g.ok && g.status === 409 && g.error.startsWith("mark_filed_not_allowed_from_"), s);
  }
});

Deno.test("reprocess guard: only a stuck submitted / processing claim", () => {
  assertEquals(guardAction("reprocess", "submitted"), { ok: true, to: null });
  assertEquals(guardAction("reprocess", "processing"), { ok: true, to: null });
  assert(!guardAction("reprocess", "ready_to_submit").ok && !guardAction("reprocess", "filed").ok);
});

Deno.test("withdraw guard: any open status, never a closed one", () => {
  for (const s of ["submitted", "processing", "needs_dl_update", "needs_review", "ready_to_submit"]) assertEquals(guardAction("withdraw", s), { ok: true, to: "withdrawn" });
  for (const s of ["filed", "approved", "denied", "refunded", "paid", "withdrawn"]) assert(!guardAction("withdraw", s).ok, s);
});

Deno.test("the filed draft is the followups.md sentence with the placeholders filled", () => {
  const d = filedDraft("3675 DUVAL ST, AUSTIN, TX 78721", new Date("2026-10-08T15:00:00Z"), "email");
  assertEquals(d.intent, "filed");
  assertEquals(d.subject, "Submitted to TCAD — what happens next");
  assertStringIncludes(d.body, "Your application for 3675 DUVAL ST, AUSTIN, TX 78721 was submitted to the Travis Central Appraisal District on October 8, 2026 via e-mail.");
  assertStringIncludes(d.body, "Nothing is owed until a refund is actually issued.");
  assertEquals(parseChannel("portal"), "portal");
  assertEquals(parseChannel("fax"), "email");
});

Deno.test("address search: number + first street word, scored by every typed word", () => {
  assertEquals(addressKey("3675 duval st."), { num: "3675", key: "DUVAL", words: ["DUVAL", "ST"] });
  assertEquals(addressKey("800 W 5th St Apt 12").key, "5TH");
  assertEquals(addressKey("Brodie Lane").num, "");
  assert(scoreMatch("3675 DUVAL ST, AUSTIN, TX 78721", ["DUVAL", "ST"]) > scoreMatch("3675 DUVAL CV, AUSTIN, TX 78721", ["DUVAL", "ST"]));
  assertEquals(claimLink("https://cleanbillco.com/", "CB-TEST-0001"), "https://cleanbillco.com/claim/CB-TEST-0001");
});

Deno.test("funnel strip, limit parsing and selftest masking", () => {
  const steps = funnelSteps({ page_views: 200, claimed: 50, ready_to_submit: 25, filed: 0 });
  assertEquals(steps.map((s) => s.pct), [null, 25, 50, 0]);
  assertEquals(parseLimit(null), 200);
  assertEquals(parseLimit("9999"), 500);
  assertEquals(parseLimit("abc"), 200);
  assertEquals(maskSelftest({ pass: true, claim: { signature_ip: "203.0.113.7" } }), { pass: true, claim: { signature_ip: "…" } });
});

// ---- SPEC-10: outbound e-mail ---------------------------------------------------------------------------------------
const approved: SendableMessage = { id: "m1", direction: "outbound", channel: "email", agent_draft: false, sent_at: null, intent: "ready_to_submit", subject: "Your application is ready", body: "Hi Pat,\n\nThe packet is attached." };

Deno.test("send guard: an approved, unsent outbound e-mail to an account with an address goes out", () => {
  assertEquals(guardSend(approved, "pat@example.com", true), { ok: true });
});

Deno.test("send guard: the flag off refuses everything with 409 send_disabled, before any other check", () => {
  const g = guardSend(approved, "pat@example.com", false);
  assert(!g.ok && g.status === 409 && g.error === "send_disabled");
  const g2 = guardSend(null, null, false);
  assert(!g2.ok && g2.error === "send_disabled");
});

Deno.test("send guard: a draft is not sendable (approve first — two clicks on purpose, B-10)", () => {
  const g = guardSend({ ...approved, agent_draft: true }, "pat@example.com", true);
  assert(!g.ok && g.status === 409 && g.error === "draft_not_approved");
  const g2 = guardSend({ ...approved, agent_draft: null }, "pat@example.com", true);
  assert(!g2.ok && g2.error === "draft_not_approved");
});

Deno.test("send guard: already sent, inbound, non-e-mail channel, missing message", () => {
  const sent = guardSend({ ...approved, sent_at: "2026-10-08T15:00:00Z" }, "pat@example.com", true);
  assert(!sent.ok && sent.error === "already_sent" && sent.status === 409);
  const inbound = guardSend({ ...approved, direction: "inbound" }, "pat@example.com", true);
  assert(!inbound.ok && inbound.error === "not_outbound");
  const portal = guardSend({ ...approved, channel: "portal" }, "pat@example.com", true);
  assert(!portal.ok && portal.error === "not_email");
  const missing = guardSend(null, "pat@example.com", true);
  assert(!missing.ok && missing.status === 404 && missing.error === "not_found");
});

Deno.test("send guard: no e-mail on the account, or an empty subject / body", () => {
  for (const e of [null, undefined, "", "   ", "not-an-address", "a@b"]) { const g = guardSend(approved, e, true); assert(!g.ok && g.error === "no_email", String(e)); }
  assert(isEmail(" pat@example.com ") && !isEmail("pat@example"));
  const empty = guardSend({ ...approved, body: "  " }, "pat@example.com", true);
  assert(!empty.ok && empty.error === "empty_message");
  const noSubject = guardSend({ ...approved, subject: null }, "pat@example.com", true);
  assert(!noSubject.ok && noSubject.error === "empty_message");
});

Deno.test("attachment: the packet rides ready_to_submit and filed only, named after the claim code; 20 MB cap", () => {
  assertEquals(attachmentPlan("ready_to_submit", "CB-TEST-0001/packet.pdf", "CB-TEST-0001"), { path: "CB-TEST-0001/packet.pdf", filename: "Form-50-114-CB-TEST-0001.pdf" });
  assertEquals(attachmentPlan("filed", "x.pdf", "CB-AB12-CD34")?.filename, "Form-50-114-CB-AB12-CD34.pdf");
  assertEquals(attachmentPlan("needs_dl_update", "x.pdf", "CB-TEST-0001"), null);
  assertEquals(attachmentPlan("ready_to_submit", null, "CB-TEST-0001"), null);
  assertEquals(attachmentPlan(null, "x.pdf", "CB-TEST-0001"), null);
  assertEquals(attachmentName(null), "Form-50-114-packet.pdf");
  assertEquals(attachmentName("../etc"), "Form-50-114-___etc.pdf");
  assertEquals(MAX_ATTACHMENT_BYTES, 20 * 1024 * 1024);
});

Deno.test("resend payload: from the brand's support address, reply_to the same inbox, tags and the entity header", () => {
  const p = resendPayload({ brand: "Clean Bill", supportEmail: "hello@cleanbillco.com", to: " pat@example.com ", subject: "S", html: "<p>h</p>", text: "t", intent: "ready_to_submit", claimCode: "CB-TEST-0001", messageId: "m1", attachment: { filename: "Form-50-114-CB-TEST-0001.pdf", content: "JVBERi0=" } });
  assertEquals(p.from, "Clean Bill <hello@cleanbillco.com>");
  assertEquals(p.to, ["pat@example.com"]);
  assertEquals(p.reply_to, "hello@cleanbillco.com");
  assertEquals(p.tags, [{ name: "intent", value: "ready_to_submit" }, { name: "claim_code", value: "CB-TEST-0001" }]);
  assertEquals(p.headers, { "X-Entity-Ref-ID": "m1" });
  assertEquals(p.attachments?.length, 1);
  const bare = resendPayload({ brand: "Clean Bill", supportEmail: "hello@cleanbillco.com", to: "a@b.co", subject: "S", html: "h", text: "t", intent: null, claimCode: undefined, messageId: "m2" });
  assert(!("attachments" in bare));
  assertEquals(bare.tags[0].value, "none");
  assert(!JSON.stringify(p).includes("track"));   // no open / click tracking on customer mail (ADR 0022)
});

Deno.test("feature flags read the vendor switches from the secrets; anything but the string true is off", () => {
  const env = (m: Record<string, string>) => (k: string) => m[k];
  assertEquals(featureFlags(env({ RESEND_ENABLED: "true" })), { resend: true, stripe: false, lob: false });
  assertEquals(featureFlags(env({ RESEND_ENABLED: "1", STRIPE_ENABLED: "TRUE", LOB_ENABLED: "true" })), { resend: false, stripe: false, lob: true });
  assertEquals(featureFlags(env({})), { resend: false, stripe: false, lob: false });
});
