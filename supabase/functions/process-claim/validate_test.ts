function assertEquals(a: unknown, b: unknown, msg?: string) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(msg ?? `assertEquals failed: ${A} !== ${B}`); }
import { addressMatches, ageOn, nameMatches, validate, type Extracted, type PropertyRec } from "./validate.ts";

const prop: PropertyRec = {
  prop_id: 1, owner_name: "GARCIA RICHARD L", situs_num: "3675", situs_street: "DUVAL ST", situs_city: "AUSTIN",
  situs_zip: "78721", situs_full: "3675 DUVAL ST, AUSTIN, TX 78721", deed_date: "2019-05-14",
};
const base: Extracted = {
  readable: true, id_type: "driver_license", issuing_state: "TX", first_name: "RICHARD", middle_name: "L", last_name: "GARCIA",
  dob: "1963-07-11", expiry: "2031-09-03", dl_number: "17912728", address_line1: "3675 DUVAL ST", city: "AUSTIN", state: "TX", zip: "78721",
  confidence: { name: 0.98, dob: 0.97, address: 0.95, dl_number: 0.9, expiry: 0.95 }, issues: [],
};

Deno.test("address: exact match", () => assertEquals(addressMatches("3675 DUVAL ST", "78721", prop), true));
Deno.test("address: suffix spelled out and lowercase", () => assertEquals(addressMatches("3675 duval street", "78721", prop), true));
Deno.test("address: missing suffix on ID", () => assertEquals(addressMatches("3675 DUVAL", "78721", prop), true));
Deno.test("address: different house number", () => assertEquals(addressMatches("3677 DUVAL ST", "78721", prop), false));
Deno.test("address: different street", () => assertEquals(addressMatches("3675 DUVAL CIR", "78721", prop), true)); // same name; suffix leniency
Deno.test("address: different zip", () => assertEquals(addressMatches("3675 DUVAL ST", "78704", prop), false));
Deno.test("address: unit mismatch blocks", () => {
  const p = { ...prop, situs_unit: "B", situs_full: "3675 DUVAL ST UNIT B, AUSTIN, TX 78721" };
  assertEquals(addressMatches("3675 DUVAL ST APT A", "78721", p), false);
  assertEquals(addressMatches("3675 DUVAL ST APT B", "78721", p), true);
  assertEquals(addressMatches("3675 DUVAL ST", "78721", p), true); // unit omitted on ID: allow
});
Deno.test("address: falls back to situs_full when parts absent", () => {
  const p: PropertyRec = { prop_id: 2, owner_name: "X", situs_full: "1200 BRODIE LN, AUSTIN, TX 78745" };
  assertEquals(addressMatches("1200 Brodie Lane", "78745", p), true);
});

Deno.test("name: TCAD 'LAST FIRST M' format", () => assertEquals(nameMatches("RICHARD", "GARCIA", "GARCIA RICHARD L"), true));
Deno.test("name: couple with ampersand", () => assertEquals(nameMatches("JANE", "SMITH", "SMITH JOHN & JANE"), true));
Deno.test("name: nickname prefix (RICK vs RICHARD) is not enough", () => assertEquals(nameMatches("RICK", "GARCIA", "GARCIA RICHARD L"), false));
Deno.test("name: wrong last name", () => assertEquals(nameMatches("RICHARD", "LOPEZ", "GARCIA RICHARD L"), false));
Deno.test("name: hyphenated / joined last names", () => assertEquals(nameMatches("MARIA", "DE LA CRUZ", "DE LA CRUZ MARIA"), true));

Deno.test("age on a fixed date", () => assertEquals(ageOn("1960-09-10", new Date(Date.UTC(2026, 8, 7))), 65));
Deno.test("age before birthday", () => assertEquals(ageOn("1961-09-10", new Date(Date.UTC(2026, 8, 7))), 64));

Deno.test("validate: happy path -> ready_to_submit", () => {
  const v = validate(base, prop, "Richard L Garcia");
  assertEquals(v.status, "ready_to_submit");
  assertEquals(v.address_match, true);
  assertEquals(v.name_match, true);
});
Deno.test("validate: address mismatch -> needs_dl_update", () => {
  const v = validate({ ...base, address_line1: "900 CONGRESS AVE", zip: "78701" }, prop, "Richard Garcia");
  assertEquals(v.status, "needs_dl_update");
});
Deno.test("validate: non-Texas ID -> needs_review", () => {
  const v = validate({ ...base, issuing_state: "CA" }, prop, "Richard Garcia");
  assertEquals(v.status, "needs_review");
});
Deno.test("validate: name not on deed -> needs_review even if address matches", () => {
  const v = validate({ ...base, first_name: "MARIA", last_name: "LOPEZ" }, prop, "Maria Lopez");
  assertEquals(v.status, "needs_review");
});
Deno.test("validate: over-65 flagged", () => {
  const v = validate({ ...base, dob: "1955-01-01" }, prop, "Richard Garcia");
  assertEquals(v.over65, true);
  assertEquals(v.findings.some((f) => f.includes("over-65")), true);
});
Deno.test("validate: low confidence -> needs_review", () => {
  const v = validate({ ...base, confidence: { ...base.confidence, address: 0.3 } }, prop, "Richard Garcia");
  assertEquals(v.status, "needs_review");
});
Deno.test("validate: ID name differs from typed signature -> needs_review", () => {
  const v = validate(base, prop, "Maria Lopez");
  assertEquals(v.status, "needs_review");
});
