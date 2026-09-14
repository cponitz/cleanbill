// G-9 parity gate: the TypeScript validator, rendered through the generated rule table, must produce byte-identical
// findings (codes, severity, field, ops sentence, detail, customer sentence, next action) to the Python validator for
// every case in tests/fixtures/cases.json. The snapshot is written by `python -m trd.findings --emit-snapshot`.
import { CODES, makeFinding, render, renderForCustomer, RULES } from "./findings.ts";
import { type Extracted, type PropertyRec, reasonText, validate } from "./validate.ts";

function assertEquals(a: unknown, b: unknown, msg?: string) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(msg ?? `assertEquals failed:\n  got:  ${A}\n  want: ${B}`);
}

const root = new URL("../../../", import.meta.url);
const cases = JSON.parse(await Deno.readTextFile(new URL("tests/fixtures/cases.json", root)));
const snapshot = JSON.parse(await Deno.readTextFile(new URL("tests/fixtures/findings_snapshot.json", root)));
const props: Record<number, PropertyRec> = Object.fromEntries(cases.properties.map((p: PropertyRec) => [p.prop_id, p]));

Deno.test("rule table: every code has a severity, field and both sentences", () => {
  for (const c of CODES) {
    const r = RULES[c];
    if (!["blocking", "warning", "info"].includes(r.severity) || !r.field || !r.ops || !r.customer) throw new Error(`incomplete rule ${c}`);
  }
  assertEquals(CODES.length, 14);
});

Deno.test("render: placeholders from detail, missing keys become empty", () => {
  assertEquals(render("a {x} b {y} c", { x: 1, y: null }), "a 1 b  c");
  assertEquals(render("{missing}", undefined), "");
  assertEquals(makeFinding("over_65", { age: 71 }).message, "Applicant is 71 — eligible for the over-65 exemption (add to 50-114)");
  assertEquals(makeFinding("address_match").detail, undefined);
});

Deno.test("snapshot: every fixture case renders identically to the Python validator", () => {
  assertEquals(Object.keys(snapshot).sort(), cases.validation_cases.map((c: { name: string }) => c.name).sort(), "case names");
  for (const c of cases.validation_cases) {
    const [y, m, d] = String(c.today).split("-").map(Number);
    const v = validate(c.extracted as Extracted, props[c.prop_id], c.typed_name, new Date(Date.UTC(y, m - 1, d)));
    const got = { status: v.status, findings: v.findings.map(renderForCustomer), reason: reasonText(v.findings) };
    assertEquals(got, snapshot[c.name], `case ${c.name}`);
  }
});
