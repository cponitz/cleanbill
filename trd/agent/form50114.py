"""Fill the official Comptroller Form 50-114 (Rev. 02-26/39) and stamp the applicant's electronic signature + audit page.

Field names are the PDF's AcroForm names (see `forms/50-114.pdf`). The same mapping lives in the edge function
(supabase/functions/process-claim/form50114.ts) — keep them in sync.
"""
from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas

FORM_PATH = Path(__file__).parents[2] / "forms" / "50-114.pdf"
SIG_RECT = (64, 149, 364, 162)      # page 2, "Signature of Property Owner/Applicant" widget
COUNTY = "Travis"


def _mdy(d) -> str:
    if not d: return ""
    if isinstance(d, str):
        try: d = date.fromisoformat(d[:10])
        except ValueError: return d
    return d.strftime("%m/%d/%Y")


def form_values(claim: dict, ex: dict, over65: bool, signed_on: date, dl_number: str | None = None) -> tuple[dict, dict]:
    """Return (text_fields, button_fields) for the official form from a claim record + extracted ID."""
    cust, lead, prop = claim["claim"], claim["lead"], claim["property"]   # v2: the signed claim row
    years = sorted(set((lead.get("refund_years") or []) + [signed_on.year]))
    name = " ".join(x for x in (ex.get("first_name"), ex.get("middle_name"), ex.get("last_name")) if x).title()
    physical = f"{prop['situs_full'].split(',')[0]}, {prop.get('situs_city') or 'Austin'}, {COUNTY} County, {prop.get('situs_zip') or ''}".replace(" ,", ",")
    text = {
        "Appraisal Districts County Name": COUNTY,
        "Appraisal District Account Number if known": str(prop["prop_id"]),
        "Tax Years for Application": ", ".join(map(str, years)),
        "Name of Property Owner 1": name,
        "Birth Date mmddyyyy": _mdy(ex.get("dob")),
        "Drivers License or Personal ID Certificate": dl_number or "",
        "Primary Phone Number area code and number": cust.get("phone") or "",
        "Email Address": cust.get("email") or "",
        "Percent Ownership Interest": "100" if (cust.get("household") or "single") != "other" else "",
        "Date you acquired this property": _mdy(prop.get("deed_date")),
        "Date you began occupying this property as your principal residence": _mdy(cust.get("occupied_since") or prop.get("deed_date")),
        "Physical Address ie street address not PO Box City County ZIP Code": physical,
        "Legal Description if known": prop.get("legal_desc") or "",
        "Property OwnerAuthorized Representative Name": name,
        "TitleAuthorization": "Property Owner",
        "Date 1": _mdy(signed_on),
        "Additional Information": f"Late application under Tax Code §11.431 for tax years {', '.join(map(str, years[:-1]))}. Prepared with Clean Bill; applicant signed electronically.",
    }
    if cust.get("prev_homestead_address"):
        text["Previous County"] = cust.get("prev_homestead_county") or ""
    buttons = {
        "General Residence Homestead Exemption": "/On",
        "Are you filing a late application": "/Yes" if len(years) > 1 else "/No",
        "Sect1-1": "/Yes_2",                                   # lives in the property            (page 1, y≈616)
        # Sect1-3 = disabled-veteran permanent-disability question — left blank (not claimed)      (y≈563)
        "Sect1-4": "/No_4",                                    # cooperative housing                (y≈434)
        "Sect1-5": "/Yes" if cust.get("prev_homestead") else "/No",   # receiving HS on previous residence (y≈403)
        "Sect1-6": "/Yes" if cust.get("prev_homestead") else "/No",   # transferring an exemption          (y≈384)
        "Sect1-7": "/No",                                      # transferring a tax limitation      (y≈366)
        "Sect2-1": {"married": "/Married Couple", "other": "/Other (e.g., individual who owns the property with others)"}.get(cust.get("household") or "single", "/Single Adult"),
        "Sect3-1": "/Yes",                                     # applicant on deed
        "Sect3-2": "/No", "Sect3-3": "/No", "Sect3-4": "/No",  # heir property / other heirs / income producing
    }
    if over65:
        buttons["Person Age 65 or Older or Surviving Spouse"] = "/On"
    return text, buttons


def fill_50114(claim: dict, ex: dict, over65: bool = False, signed_on: date | None = None, dl_number: str | None = None,
               form_path: Path = FORM_PATH) -> bytes:
    signed_on = signed_on or date.today()
    text, buttons = form_values(claim, ex, over65, signed_on, dl_number)
    reader = PdfReader(str(form_path))
    writer = PdfWriter()
    writer.append(reader)
    for page in writer.pages:
        writer.update_page_form_field_values(page, text, auto_regenerate=True)
        writer.update_page_form_field_values(page, buttons, auto_regenerate=True)
    writer.set_need_appearances_writer(True)

    # typed e-signature overlay on the signature line (page 2) + audit page
    cust = claim["claim"]
    overlay = BytesIO(); c = canvas.Canvas(overlay, pagesize=LETTER)
    c.setFont("Times-Italic", 13); c.drawString(SIG_RECT[0] + 6, SIG_RECT[1] + 3, f"/s/ {cust.get('signature_name', '')}")
    c.setFont("Helvetica", 5.5); c.drawString(SIG_RECT[0] + 6, SIG_RECT[1] - 11, f"Electronically signed {cust.get('agreement_signed_at', '')} · IP {cust.get('signature_ip', '')}")
    c.showPage(); c.save(); overlay.seek(0)
    writer.pages[1].merge_page(PdfReader(overlay).pages[0])

    audit = BytesIO(); c = canvas.Canvas(audit, pagesize=LETTER); y = 740
    def line(t, bold=False, size=10.5):
        nonlocal y; c.setFont("Helvetica-Bold" if bold else "Helvetica", size); c.drawString(54, y, t); y -= size + 6
    line("Electronic Signature and Preparation Record — attachment to Form 50-114", True, 13)
    line(f"Property: TCAD account {claim['property']['prop_id']} — {claim['property']['situs_full']}")
    line(f"Applicant: {text['Name of Property Owner 1']}    Exemptions requested: General residence homestead{' + Age 65 or older' if over65 else ''}")
    line(f"Tax years: {text['Tax Years for Application']} (late application under Tax Code §11.431)")
    y -= 6; line("SIGNATURE RECORD", True)
    line(f"Signed by (typed): {cust.get('signature_name')}    At: {cust.get('agreement_signed_at')}    IP: {cust.get('signature_ip')}")
    line(f"Device: {str(cust.get('signature_ua') or '')[:100]}", False, 9)
    line("The applicant consented to sign electronically (ESIGN; Tex. Bus. & Com. Code ch. 322) and typed their name as their signature on this application.", False, 9)
    line("A copy of the applicant's Texas driver's license/ID accompanies this application (Tax Code §11.43(j)).", False, 9)
    y -= 6; line("PREPARER", True)
    line("Prepared by Clean Bill (a private company; not affiliated with any government agency) at the applicant's direction.", False, 9)
    line(f"Generated {datetime.utcnow().isoformat(timespec='seconds')}Z", False, 8)
    c.showPage(); c.save(); audit.seek(0)
    writer.append(PdfReader(audit))
    out = BytesIO(); writer.write(out)
    return out.getvalue()
