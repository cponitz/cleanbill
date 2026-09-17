"""E-mail adapter (SPEC-08 Part C, C5): wrap a plain-text message in the Clean Bill template.

    html, text = render_email(subject, body_text)

`body_text` is the agent's or operator's plain-text draft (paragraphs separated by blank lines). The HTML comes from
base.html with the brand colours from trd/brand_tokens.py inlined; the text alternative is generated from the same body
with the same footer, so the two never drift. Task 4 (Resend send) calls this for every outbound message; nothing in
this module sends anything.
"""
from __future__ import annotations

import html
import re
from pathlib import Path
from urllib.parse import urlparse

from trd import brand
from trd import brand_tokens as T

TEMPLATE = Path(__file__).with_name("base.html")
DEFAULT_HEADER_URL = f"{T.SITE}/brand/email-header.png"
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
    foot = (f"{brand.DISCLAIMER}\n\n{T.BRAND_NAME} is a private company in Austin, Texas. We are not affiliated with the Travis "
            f"Central Appraisal District, the Travis County Tax Office or any government agency. Filing with TCAD is free, and "
            f"you can do it yourself.\n\nQuestions? Reply to this e-mail or write {T.SUPPORT_EMAIL} · {T.SITE}")
    return f"{subject}\n\n{body.strip()}\n\n--\n{foot}\n"


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
