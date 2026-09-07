"""Outreach letter PDF generator (Lob-ready: US Letter, 0.75in margins, first page only).

Compliance baked in:
  • Texas Property Code §41.0051(a): 14-pt bold "THIS DOCUMENT IS AN ADVERTISEMENT OF SERVICES..." at the top.
  • §41.0051(b): names the appraisal district / taxing units that would owe the refund.
  • Voluntary: "you can file yourself for free" line; no government look-alike elements; not-affiliated footer.
Dollar figures shown to homeowners are rounded DOWN to the nearest $100 (estimator.conservative_display).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from io import BytesIO
from pathlib import Path

import qrcode
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

from trd.estimator.refund import conservative_display, late_filing_deadline

BRAND = "Texas Refund Desk"
SUPPORT = "hello@texasrefunddesk.com"
DISCLAIMER = "THIS DOCUMENT IS AN ADVERTISEMENT OF SERVICES. IT IS NOT AN OFFICIAL DOCUMENT OF THE STATE OF TEXAS."
NAVY = (0x1F / 255, 0x38 / 255, 0x64 / 255)
GREY = (0x6B / 255, 0x76 / 255, 0x86 / 255)


@dataclass
class LetterData:
    owner_name: str
    owner_first: str
    situs_address: str          # "3675 DUVAL ST, AUSTIN, TX 78721"
    mail_lines: list[str]       # address block lines for the envelope/window
    refund_total: float
    forward_annual: float
    refund_years: list[int]
    claim_code: str
    claim_url: str
    variant: str = "A"
    mail_date: date | None = None


def years_text(years: list[int]) -> str:
    y = sorted(years)
    return str(y[0]) if len(y) == 1 else ", ".join(map(str, y[:-1])) + " and " + str(y[-1])


def _qr_png(url: str) -> BytesIO:
    img = qrcode.make(url, box_size=6, border=1)
    buf = BytesIO(); img.save(buf, format="PNG"); buf.seek(0)
    return buf


def render_letter(d: LetterData, out_path: Path) -> Path:
    c = canvas.Canvas(str(out_path), pagesize=LETTER)
    W, H = LETTER
    m = 0.75 * inch
    y = H - m

    # §41.0051(a) disclaimer — 14-pt bold, conspicuous, top of page
    c.setFont("Helvetica-Bold", 14)
    c.setFillColorRGB(0, 0, 0)
    for line in _wrap(c, DISCLAIMER, "Helvetica-Bold", 14, W - 2 * m):
        c.drawString(m, y, line); y -= 17
    y -= 6
    c.setStrokeColorRGB(*GREY); c.setLineWidth(0.5); c.line(m, y, W - m, y); y -= 18

    # letterhead + date
    c.setFont("Helvetica-Bold", 13); c.setFillColorRGB(*NAVY); c.drawString(m, y, BRAND)
    c.setFont("Helvetica", 9); c.setFillColorRGB(*GREY)
    c.drawRightString(W - m, y, (d.mail_date or date.today()).strftime("%B %d, %Y"))
    y -= 12; c.drawString(m, y, "Private company · Austin, Texas · Not affiliated with any government agency"); y -= 26

    # recipient block (window-envelope position)
    c.setFillColorRGB(0, 0, 0); c.setFont("Helvetica", 10.5)
    for line in [d.owner_name] + d.mail_lines:
        c.drawString(m, y, line); y -= 13
    y -= 14

    refund = conservative_display(d.refund_total)
    forward = conservative_display(d.forward_annual)
    earliest = min(d.refund_years)
    deadline = late_filing_deadline(earliest).strftime("%B %-d, %Y")
    yt = years_text(d.refund_years)

    if d.variant == "B":
        headline = f"Your home is missing the exemption most of your neighbors have — and it's costing about ${forward:,} a year."
        opening = (f"According to the Travis Central Appraisal District's public records, {d.situs_address} has no residence "
                   f"homestead exemption. That single form is why two similar houses on the same street can have very different tax bills. "
                   f"The good news: Texas lets you claim it late. Filing now covers {yt} — a refund of tax you already paid, "
                   f"estimated at <b>${refund:,}</b> for your home — plus lower bills every year going forward.")
    else:
        headline = f"Our review of public records shows {d.situs_address} may be owed an estimated ${refund:,} property-tax refund."
        opening = (f"The Travis Central Appraisal District's public appraisal roll lists no homestead exemption on your home. Most "
                   f"owner-occupied homes in Austin have one — it lowers the taxable value for Austin ISD, the City of Austin, Travis County, "
                   f"Austin Community College, and Central Health. Texas law lets you claim the exemption <b>retroactively</b> for {yt}. "
                   f"If the appraisal district approves it, the Travis County Tax Office refunds the tax you already overpaid for those years — "
                   f"our estimate for your home is <b>${refund:,}</b> — and your bill drops by roughly <b>${forward:,} every year</b> from here on.")

    body = [
        ("Helvetica-Bold", 12.5, NAVY, headline),
        ("Helvetica", 10.5, (0, 0, 0), f"Dear {d.owner_first},"),
        ("Helvetica", 10.5, (0, 0, 0), opening),
        ("Helvetica-Bold", 10.5, (0, 0, 0), "Two ways to claim it:"),
        ("Helvetica", 10.5, (0, 0, 0), "<b>1. Do it yourself, free.</b> File Form 50-114 with the Travis Central Appraisal District at traviscad.org or by mail. "
                                        "There is no fee, and you do not need anyone's help to do it."),
        ("Helvetica", 10.5, (0, 0, 0), "<b>2. Let us handle it.</b> We prepare the complete application and refund paperwork; you review and sign on your phone "
                                        "in about five minutes. Our fee is <b>25% of the refund you actually receive — nothing if there is no refund</b>, and nothing "
                                        "on your future annual savings."),
        ("Helvetica-Bold", 11, NAVY, f"Start here: {d.claim_url}   ·   Your claim code: {d.claim_code}"),
        ("Helvetica", 10.5, (0, 0, 0), f"<b>Timing matters.</b> The {earliest} tax year can only be claimed until <b>{deadline}</b>. After that, the oldest year of refund is gone for good."),
        ("Helvetica", 10.5, (0, 0, 0), "Sincerely,"),
        ("Helvetica", 10.5, (0, 0, 0), f"Charlie Ponitz<br/>{BRAND} · Austin, Texas · {SUPPORT}"),
    ]
    text_w = W - 2 * m - 1.35 * inch  # leave room for the QR block on the right
    for font, size, color, txt in body:
        style = ParagraphStyle("p", fontName=font, fontSize=size, leading=size * 1.32, textColor=color, alignment=TA_LEFT, spaceAfter=0)
        p = Paragraph(txt, style)
        _, ph = p.wrap(text_w, y)
        p.drawOn(c, m, y - ph)
        y -= ph + 7

    # QR block, right side, aligned with the "Start here" area
    qr = _qr_png(d.claim_url)
    from reportlab.lib.utils import ImageReader
    qx, qy, qs = W - m - 1.15 * inch, H - m - 4.9 * inch, 1.15 * inch
    c.drawImage(ImageReader(qr), qx, qy, qs, qs)
    c.setFont("Helvetica", 7.5); c.setFillColorRGB(*GREY)
    c.drawCentredString(qx + qs / 2, qy - 10, "Scan to open your claim")

    # footer disclosures (§41.0051(b) + not-affiliated + opt-out)
    foot = (f"{BRAND} is a private company. We are not affiliated with the Travis Central Appraisal District, the Travis County Tax Office, "
            f"or any government agency. The refund described here would be paid by the Travis County Tax Office on behalf of Austin ISD, the City of Austin, "
            f"Travis County, Austin Community College District, and Central Health, after approval by the Travis Central Appraisal District. Estimates are based "
            f"on public appraisal data and current tax rates; the appraisal district makes all eligibility decisions. Refunds are issued to the person who paid the tax. "
            f"This is not legal or tax advice. To stop receiving mail from us, email {SUPPORT} with \"remove\" and your address.")
    style = ParagraphStyle("f", fontName="Helvetica", fontSize=7.5, leading=9.5, textColor=GREY)
    p = Paragraph(foot, style); _, ph = p.wrap(W - 2 * m, 2 * inch); p.drawOn(c, m, m - 0.25 * inch + ph - ph)  # sits at bottom margin
    c.showPage(); c.save()
    return out_path


def _wrap(c: canvas.Canvas, text: str, font: str, size: float, width: float) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if c.stringWidth(t, font, size) <= width: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines
