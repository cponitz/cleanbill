import { extFor, followUpMode, isPageEvent, parseTypedFields, precheck, typedExtracted } from "./logic.ts";
import { makeFinding } from "../_shared/findings.ts";
import type { PropertyRec } from "../_shared/validate.ts";

function assertEquals(a: unknown, b: unknown, msg?: string) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(msg ?? `assertEquals failed: ${A} !== ${B}`); }

const prop: PropertyRec = { prop_id: 1, owner_name: "GARCIA RICHARD L", situs_num: "3675", situs_street: "DUVAL ST", situs_zip: "78721", situs_full: "3675 DUVAL ST, AUSTIN, TX 78721" };

Deno.test("precheck: typed address matches / mismatches the situs (SPEC-06 §3)", () => {
  assertEquals(precheck("3675 duval street", "78721", prop), { match: true, id_address: "3675 duval street, 78721", situs: prop.situs_full });
  assertEquals(precheck("900 Congress Ave", "78701", prop).match, false);
  assertEquals(precheck("3675 DUVAL ST", "78704", prop).match, false);   // zip disagrees
  assertEquals(precheck("", "78721", prop).match, false);                // nothing typed is not a match
  assertEquals(precheck("3675 DUVAL ST", "", prop).match, true);         // zip optional
});

Deno.test("follow-up: re-upload only while needs_dl_update, else 409 (SPEC-02)", () => {
  assertEquals(followUpMode({ status: "needs_dl_update", findings: [], hasFront: true, hasTyped: false }), { mode: "reupload" });
  for (const status of ["submitted", "processing", "ready_to_submit", "needs_review", "filed", "withdrawn"]) {
    const r = followUpMode({ status, findings: [], hasFront: true, hasTyped: false });
    assertEquals("error" in r && r.http, 409, status);
  }
});

Deno.test("follow-up: typed confirmation only for needs_review with not_readable/low_confidence (SPEC-06 §4)", () => {
  const low = [makeFinding("address_match"), makeFinding("low_confidence", { confidence: { name: 0.2 } })];
  assertEquals(followUpMode({ status: "needs_review", findings: low, hasFront: false, hasTyped: true }), { mode: "typed_confirm" });
  assertEquals(followUpMode({ status: "needs_review", findings: [makeFinding("not_readable")], hasFront: false, hasTyped: true }), { mode: "typed_confirm" });
  const nm = [makeFinding("name_mismatch", { id: "MARIA LOPEZ", owner: "GARCIA RICHARD L" })];
  assertEquals("error" in followUpMode({ status: "needs_review", findings: nm, hasFront: false, hasTyped: true }), true);
  assertEquals("error" in followUpMode({ status: "needs_dl_update", findings: low, hasFront: false, hasTyped: true }), true);
  assertEquals("error" in followUpMode({ status: "ready_to_submit", findings: [], hasFront: false, hasTyped: false }), true);
});

Deno.test("typed fields: parsed from the form, typed_name split, dob/zip sanitised", () => {
  const form: Record<string, string> = { typed_name: "Richard L Garcia", typed_address: "3675 Duval St", typed_zip: "78721-1234", typed_dob: "07/11/1963" };
  const t = parseTypedFields((k) => form[k] ?? "");
  assertEquals(t, { address_line1: "3675 Duval St", zip: "78721", last_name: "Garcia", first_name: "Richard L" });   // MM/DD dob dropped, zip+4 trimmed
  assertEquals(parseTypedFields(() => ""), null);
  const ex = typedExtracted(t!);
  assertEquals([ex.readable, ex.source, ex.issuing_state, ex.confidence.name, ex.confidence.address, ex.confidence.dob], [true, "typed", "TX", 1, 1, 0]);
  const merged = typedExtracted({ address_line1: "3675 DUVAL ST" }, { first_name: "RICHARD", last_name: "GARCIA", dob: "1963-07-11", confidence: { name: 0.9, dob: 0.9, address: 0.2, dl_number: 0.9, expiry: 0.9 } });
  assertEquals([merged.first_name, merged.dob, merged.confidence.name, merged.confidence.address], ["RICHARD", "1963-07-11", 0.9, 1]);
});

Deno.test("page events allowlist and file extensions", () => {
  assertEquals(["validation_shown", "dl_fix_started", "dl_fix_uploaded", "typed_precheck", "card_saved", "card_skipped", "packet_viewed"].every(isPageEvent), true);
  assertEquals(isPageEvent("view"), false);
  assertEquals(isPageEvent("claim_submitted"), false);
  assertEquals([extFor("image/jpeg"), extFor("image/png"), extFor("application/pdf"), extFor("image/heic")], ["jpg", "png", "pdf", "heic"]);
});
