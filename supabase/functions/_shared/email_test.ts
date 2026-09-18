// SPEC-10 E1 parity gate (ADR 0016 pattern): the Deno renderer must reproduce cleanbill.email.render_email byte for byte
// for every case in tests/fixtures/email_snapshot.json (written by `python -m cleanbill.email --emit-snapshot`), and the
// generated template module must carry the current cleanbill/email/base.html (`python -m cleanbill.brand --sync`).
import { bodyToHtml, escapeHtml, paragraphs, renderEmail } from "./email.ts";
import { DISCLAIMER, EMAIL_BASE_HTML, EMAIL_TEXT_FOOTER, SUPPORT_EMAIL } from "./email_template.ts";

function assertEquals(a: unknown, b: unknown, msg?: string) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(msg ?? `assertEquals failed:\n  got:  ${A}\n  want: ${B}`);
}
function firstDiff(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `at ${i}: got …${JSON.stringify(a.slice(Math.max(0, i - 40), i + 60))} want …${JSON.stringify(b.slice(Math.max(0, i - 40), i + 60))}`;
}

const root = new URL("../../../", import.meta.url);
type Case = { subject: string; body: string; preheader?: string; header_url?: string };
const snap = JSON.parse(await Deno.readTextFile(new URL("tests/fixtures/email_snapshot.json", root))) as { cases: Case[]; rendered: Array<{ html: string; text: string }> };

Deno.test("email_template.ts carries the current base.html", async () => {
  const html = await Deno.readTextFile(new URL("cleanbill/email/base.html", root));
  assertEquals(EMAIL_BASE_HTML, html, "run python -m cleanbill.brand --sync");
  if (!EMAIL_TEXT_FOOTER.startsWith(DISCLAIMER) || !EMAIL_TEXT_FOOTER.includes(SUPPORT_EMAIL)) throw new Error("footer strings");
});

Deno.test("renderEmail matches the Python output byte for byte for every snapshot case", () => {
  if (snap.cases.length < 5 || snap.cases.length !== snap.rendered.length) throw new Error("snapshot shape");
  snap.cases.forEach((c, i) => {
    const got = renderEmail(c.subject, c.body, { headerUrl: c.header_url, preheader: c.preheader });
    const want = snap.rendered[i];
    if (got.html !== want.html) throw new Error(`case ${i} (${c.subject}) html differs ${firstDiff(got.html, want.html)}`);
    if (got.text !== want.text) throw new Error(`case ${i} (${c.subject}) text differs ${firstDiff(got.text, want.text)}`);
  });
});

Deno.test("the helpers behave like the Python ones", () => {
  assertEquals(escapeHtml(`& < > " '`), "&amp; &lt; &gt; &quot; &#x27;");
  assertEquals(paragraphs("\n a \n\n\n b\nc \n"), ["a", "b\nc"]);
  assertEquals(paragraphs("   "), []);
  const h = bodyToHtml("see https://cleanbillco.com/claim/CB-TEST-0001.\nnext");
  if (!h.includes('<a href="https://cleanbillco.com/claim/CB-TEST-0001."') || !h.includes("<br>next")) throw new Error(h);
  if (renderEmail("s", "").html.includes("{{")) throw new Error("placeholder left");
});
