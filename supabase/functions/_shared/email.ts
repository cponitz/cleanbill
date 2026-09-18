// The Clean Bill e-mail renderer for Deno (SPEC-10 E1): a line-for-line port of cleanbill/email/__init__.py.
//   renderEmail(subject, body, opts?) -> {html, text}
// `body` is the approved plain-text draft (paragraphs separated by blank lines; personalisation already filled in). The
// HTML is cleanbill/email/base.html (carried by the generated email_template.ts) with the brand colours from brand.ts
// inlined; the text alternative shares the footer. Python and TypeScript must produce byte-identical output for every
// case in tests/fixtures/email_snapshot.json (email_test.ts) — change both renderers and regenerate the snapshot together.
// Nothing here sends anything; the only Resend call site is the ops function's `send` action.
import { HEX } from "./brand.ts";
import { BRAND_NAME, DISCLAIMER, EMAIL_BASE_HTML, EMAIL_HEADER_URL, EMAIL_TEXT_FOOTER, SITE, SUPPORT_EMAIL } from "./email_template.ts";

export const DEFAULT_HEADER_URL = EMAIL_HEADER_URL;
const URL_RE = /(https?:\/\/[^\s<>"]+)/g;

/** Python's html.escape(s, quote=True): & < > " ' — in that order, the apostrophe as &#x27;. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

export function paragraphs(body: string): string[] {
  return body.trim().split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p);
}

export function bodyToHtml(body: string): string {
  const out: string[] = [];
  for (const para of paragraphs(body)) {
    let esc = escapeHtml(para).replaceAll("\n", "<br>");
    esc = esc.replace(URL_RE, (_m, url: string) => `<a href="${url}" style="color:${HEX.primary};text-decoration:none;">${url}</a>`);
    out.push(`<p style="margin:0 0 14px 0;">${esc}</p>`);
  }
  return out.join("\n");
}

export function textAlternative(subject: string, body: string): string {
  return `${subject}\n\n${body.trim()}\n\n--\n${EMAIL_TEXT_FOOTER}\n`;
}

export type RenderOptions = { headerUrl?: string; preheader?: string | null };

/** Returns {html, text}. `preheader` defaults to the first paragraph cut at 120 characters (code points, as in Python). */
export function renderEmail(subject: string, body: string, opts: RenderOptions = {}): { html: string; text: string } {
  const paras = paragraphs(body);
  const first = paras.length ? paras[0] : "";
  const pre = opts.preheader !== undefined && opts.preheader !== null ? opts.preheader : Array.from(first).slice(0, 120).join("");
  const values: Record<string, string> = {
    subject: escapeHtml(subject), preheader: escapeHtml(pre), body_html: bodyToHtml(body),
    brand: escapeHtml(BRAND_NAME), support_email: SUPPORT_EMAIL, site: SITE, site_host: new URL(SITE).host,
    disclaimer: escapeHtml(DISCLAIMER), header_url: opts.headerUrl ?? DEFAULT_HEADER_URL,
    color_bg: HEX.bg, color_surface: HEX.surface, color_line: HEX.line, color_ink: HEX.ink,
    color_body: HEX.body, color_muted: HEX.muted, color_primary: HEX.primary,
  };
  const html = EMAIL_BASE_HTML.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    if (!(key in values)) throw new Error(`email template: unknown placeholder {{${key}}}`);
    return values[key];
  });
  return { html, text: textAlternative(subject, body) };
}
