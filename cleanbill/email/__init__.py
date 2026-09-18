"""E-mail adapter (SPEC-08 Part C, C5; SPEC-10 E1): wrap a plain-text message in the Clean Bill template.

    html, text = render_email(subject, body_text)

`body_text` is the agent's or operator's plain-text draft (paragraphs separated by blank lines). The HTML comes from
base.html with the brand colours from cleanbill/brand_tokens.py inlined; the text alternative is generated from the same body
with the same footer, so the two never drift. Nothing in this module sends anything.

The send itself happens in the ops edge function (Deno), so supabase/functions/_shared/email.ts is a line-for-line port of
this file and must produce byte-identical output. The parity fixture tests/fixtures/email_snapshot.json holds the inputs and
this module's output; tests/test_brand.py and _shared/email_test.ts both check it (ADR 0016 pattern).

    python -m cleanbill.email --emit-snapshot            rewrite the fixture after a template or renderer change
    python -m cleanbill.email --emit-snapshot --check    exit 1 when the fixture is stale (CI)
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from urllib.parse import urlparse

from cleanbill import brand
from cleanbill import brand_tokens as T

TEMPLATE = brand.EMAIL_TEMPLATE
DEFAULT_HEADER_URL = brand.EMAIL_HEADER_URL
SNAPSHOT = brand.ROOT / "tests" / "fixtures" / "email_snapshot.json"
_URL = re.compile(r"(https?://[^\s<>\"]+)")


def _paragraphs(body: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", body.strip()) if p.strip()]


def body_to_html(body: str) -> str:
    out = []
    for para in _paragraphs(body):
        esc = html.escape(para).replace("\n", "<br>")
        esc = _URL.sub(lambda m: f'<a href="{m.group(1)}" style="color:{T.HEX["primary"]};text-decoration:none;">{m.group(1)}</a>', esc)
        out.append(f'<p style="margin:0 0 14px 0;">{esc}</p>')
    return "\n".join(out)


def text_alternative(subject: str, body: str) -> str:
    return f"{subject}\n\n{body.strip()}\n\n--\n{brand.EMAIL_TEXT_FOOTER}\n"


def render_email(subject: str, body: str, header_url: str = DEFAULT_HEADER_URL, preheader: str | None = None) -> tuple[str, str]:
    """Returns (html, text). `preheader` defaults to the first sentence of the body."""
    first = _paragraphs(body)[0] if _paragraphs(body) else ""
    pre = preheader if preheader is not None else first[:120]
    values = {
        "subject": html.escape(subject), "preheader": html.escape(pre), "body_html": body_to_html(body),
        "brand": html.escape(T.BRAND_NAME), "support_email": T.SUPPORT_EMAIL, "site": T.SITE, "site_host": urlparse(T.SITE).netloc,
        "disclaimer": html.escape(brand.DISCLAIMER), "header_url": header_url,
        "color_bg": T.HEX["bg"], "color_surface": T.HEX["surface"], "color_line": T.HEX["line"], "color_ink": T.HEX["ink"],
        "color_body": T.HEX["body"], "color_muted": T.HEX["muted"], "color_primary": T.HEX["primary"],
    }
    tpl = TEMPLATE.read_text()
    out = re.sub(r"\{\{(\w+)\}\}", lambda m: values[m.group(1)], tpl)
    return out, text_alternative(subject, body)


# ---- parity snapshot (SPEC-10 E1) ------------------------------------------------------------------------------------
# The cases cover what a draft can contain: several paragraphs, a single newline inside a paragraph, a URL, every
# HTML-special character, leading / trailing whitespace, an empty body, a long first paragraph (the preheader cut), an
# explicit preheader and header URL, and non-ASCII text (names, dashes, the middle dot).
SNAPSHOT_CASES: list[dict[str, str]] = [
    {"subject": "Your application is ready", "body": "Hi Pat,\n\nThe packet is attached. See https://cleanbillco.com/claim/CB-TEST-0001\n\nClean Bill"},
    {"subject": "Submitted to TCAD — what happens next",
     "body": "Your application for 3675 DUVAL ST, AUSTIN, TX 78721 was submitted to the Travis Central Appraisal District on October 8, 2026 via e-mail. They may take up to 90 days. If they ask for anything else, we'll handle it and let you know. Nothing is owed until a refund is actually issued."},
    {"subject": "One more step: your ID address", "body": "Hi Ana,\n\nThe address on your license reads 1200 BRODIE LN;\nthe property is 3675 DUVAL ST.\n\nUpdate it here: https://www.dps.texas.gov/section/driver-license/change-your-address?x=1&y=2\n\nThen upload the new photo at https://cleanbillco.com/claim/CB-TEST-0001.\n\n— Clean Bill"},
    {"subject": "Tags & \"quotes\" <b>are</b> text, not markup", "body": "A & B < C > D \"quoted\" 'single' — and a <script>alert(1)</script> line.\n\n\n\nThree blank lines above, then a tab\there."},
    {"subject": "  Padded subject  ", "body": "\n\n   Leading and trailing whitespace is trimmed.   \n\n\n"},
    {"subject": "Empty body", "body": ""},
    {"subject": "Long first paragraph", "body": "The preheader is the first paragraph cut at one hundred and twenty characters, so a long opening line like this one, which keeps going well past that mark, is truncated in the hidden preview text but not in the body itself.\n\nSecond paragraph."},
    {"subject": "Explicit preheader and header", "body": "Body paragraph.", "preheader": "A custom preview line", "header_url": "https://cleanbillco.com/brand/email-header@2x.png"},
    {"subject": "José Núñez-García · CB-AB12-CD34", "body": "Bonjour José,\n\nÀ bientôt — the refund is $1,300 (rounded down). Curly “quotes” and an ellipsis… stay as they are.\n\nClean Bill · Austin, Texas"},
]


def render_case(case: dict[str, str]) -> dict[str, str]:
    kwargs: dict[str, str] = {}
    if "header_url" in case:
        kwargs["header_url"] = case["header_url"]
    if "preheader" in case:
        kwargs["preheader"] = case["preheader"]
    h, t = render_email(case["subject"], case["body"], **kwargs)
    return {"html": h, "text": t}


def snapshot() -> dict:
    return {
        "_": "GENERATED by `python -m cleanbill.email --emit-snapshot`. Inputs and cleanbill.email.render_email's output; "
             "supabase/functions/_shared/email_test.ts must reproduce `rendered` byte for byte (SPEC-10 E1).",
        "cases": SNAPSHOT_CASES,
        "rendered": [render_case(c) for c in SNAPSHOT_CASES],
    }


def snapshot_text() -> str:
    return json.dumps(snapshot(), indent=1, ensure_ascii=False) + "\n"


def emit_snapshot(check: bool) -> int:
    text = snapshot_text()
    current = SNAPSHOT.read_text() if SNAPSHOT.exists() else None
    if check:
        if current != text:
            print(f"stale e-mail parity snapshot {SNAPSHOT.relative_to(brand.ROOT)} (run `python -m cleanbill.email --emit-snapshot`)")
            return 1
        print("e-mail parity snapshot is current")
        return 0
    if current != text:
        SNAPSHOT.write_text(text)
        print(f"wrote {SNAPSHOT.relative_to(brand.ROOT)}")
    else:
        print("e-mail parity snapshot already current")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Clean Bill e-mail template: render or maintain the Python/TypeScript parity snapshot.")
    ap.add_argument("--emit-snapshot", action="store_true", help="write tests/fixtures/email_snapshot.json")
    ap.add_argument("--check", action="store_true", help="with --emit-snapshot: fail if the snapshot is stale")
    a = ap.parse_args(argv)
    if a.emit_snapshot:
        return emit_snapshot(check=a.check)
    ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
