"""Packet builder (Python side). Interim: a data sheet + signature/audit block that accompanies Form 50-114.
When the official Comptroller PDF is on hand, `fill_official_50114()` fills its fields and this data sheet becomes page 2.
"""
from __future__ import annotations

from datetime import date
from io import BytesIO

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas


def build_packet(claim: dict, extracted: dict, over65: bool = False, today: date | None = None) -> bytes:
    c, cust, lead, prop = claim, claim["claim"], claim["lead"], claim["property"]   # v2: the signed claim row
    buf = BytesIO()
    pdf = canvas.Canvas(buf, pagesize=LETTER)
    W, H = LETTER
    y = H - 0.9 * inch
    def line(t: str, bold=False, size=10.5):
        nonlocal y
        pdf.setFont("Helvetica-Bold" if bold else "Helvetica", size); pdf.drawString(0.9 * inch, y, t); y -= size + 6
    line("Texas Refund Desk — Residence Homestead Exemption Application Packet (data sheet)", True, 13)
    line("Accompanies Comptroller Form 50-114. Prepared for the applicant's electronic signature.", False, 9)
    y -= 8; line("PROPERTY", True)
    line(f"TCAD account: {prop['prop_id']}    Situs: {prop['situs_full']}")
    line(f"Owner of record: {prop['owner_name']}    Deed date: {prop.get('deed_date') or 'n/a'}")
    line(f"Late-application tax years requested (Tax Code §11.431): {', '.join(map(str, lead.get('refund_years') or []))}")
    line(f"Exemptions requested: General residence homestead{' + Age 65 or older (§11.13(c))' if over65 else ''}")
    y -= 8; line("APPLICANT (from Texas ID)", True)
    name = " ".join(x for x in (extracted.get("first_name"), extracted.get("middle_name"), extracted.get("last_name")) if x)
    line(f"Name: {name}    DOB: {extracted.get('dob')}    ID exp: {extracted.get('expiry')}")
    line(f"ID address: {extracted.get('address_line1')}, {extracted.get('city')}, {extracted.get('state')} {extracted.get('zip')}    ID #: on file (confidential, Tax Code §11.48)")
    line(f"Email: {cust.get('email')}    Phone: {cust.get('phone') or '—'}    Occupied since: {cust.get('occupied_since') or 'on/before Jan 1 of earliest year'}")
    y -= 8; line("ELECTRONIC SIGNATURE RECORD", True)
    line(f"Signed by: {cust.get('signature_name')}    At: {cust.get('agreement_signed_at')}    IP: {cust.get('signature_ip')}")
    line(f"Device: {str(cust.get('signature_ua') or '')[:90]}", False, 9)
    line("The applicant typed their name as an electronic signature after consenting to ESIGN; this record is stamped on the application.", False, 9)
    line(f"Generated {(today or date.today()).isoformat()} by the Texas Refund Desk agent.", False, 8)
    pdf.showPage(); pdf.save()
    return buf.getvalue()
