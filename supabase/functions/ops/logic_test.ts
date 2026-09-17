import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { addressKey, ALLOWED_TRANSITIONS, canTransition, claimLink, filedDraft, funnelSteps, guardAction, maskSelftest, parseChannel, parseLimit, scoreMatch } from "./logic.ts";

Deno.test("transitions mirror trd/agent/store.py: withdraw from every open status, file only from ready_to_submit", () => {
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
