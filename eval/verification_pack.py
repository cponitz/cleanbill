"""Verification pack: N random Tier-1 leads with one-click lookup links, for a human spot-check of the lead heuristic.

For each lead: owner, situs, mailing address (should equal situs), deed date, appraised value, our refund estimate, the
claim code, a TCAD property-search link (account number), and a Google Maps link. Output: an .xlsx and a .md checklist.
Usage: python eval/verification_pack.py --n 25 --seed 7 --out data/out/verification_pack
Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
from __future__ import annotations

import argparse
import os
import random
from pathlib import Path
from urllib.parse import quote_plus

TCAD_SEARCH = "https://travis.prodigycad.com/property-search"  # TCAD's public property search (enter the account number)
TCAD_DETAIL = "https://travis.prodigycad.com/property-detail/{pid}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=25)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="data/out/verification_pack")
    a = ap.parse_args()
    from supabase import create_client
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    # Sample by random offsets over the Tier-1 population (ordered by prop_id for a stable frame).
    total = sb.table("leads").select("id", count="exact").eq("tier", 1).neq("claim_code", "CB-TEST-0001").execute().count
    rnd = random.Random(a.seed)
    offsets = sorted(rnd.sample(range(total), a.n))
    rows = []
    for off in offsets:
        lead = sb.table("leads").select("*").eq("tier", 1).neq("claim_code", "CB-TEST-0001").order("prop_id").range(off, off).execute().data[0]
        p = sb.table("properties").select("*").eq("prop_id", lead["prop_id"]).single().execute().data
        mail = ", ".join(x for x in [p.get("owner_addr1"), p.get("owner_addr2"), f"{p.get('owner_city') or ''} {p.get('owner_state') or ''} {p.get('owner_zip') or ''}".strip()] if x)
        rows.append({
            "#": len(rows) + 1, "TCAD account": p["prop_id"], "Owner of record": p["owner_name"], "Situs (property)": p["situs_full"],
            "Mailing address (should match situs)": mail, "Deed date": p.get("deed_date"), "Appraised value": p.get("appraised_value"),
            "HS flag": p.get("hs_exempt"), "Est. 2-yr refund": round(float(lead["est_refund_total"])), "Claim code": lead["claim_code"],
            "TCAD detail": TCAD_DETAIL.format(pid=p["prop_id"]), "TCAD search": TCAD_SEARCH,
            "Google Maps": "https://www.google.com/maps/search/?api=1&query=" + quote_plus(p["situs_full"]),
            "Looks right? (Y/N)": "", "Notes": "",
        })

    out = Path(a.out); out.parent.mkdir(parents=True, exist_ok=True)
    wb = Workbook(); ws = wb.active; ws.title = "Verification"
    heads = list(rows[0].keys()); ws.append(heads)
    for r in rows: ws.append([r[h] for h in heads])
    navy = PatternFill("solid", fgColor="1F3864")
    for c in ws[1]: c.font = Font(name="Times New Roman", bold=True, color="FFFFFF", size=10); c.fill = navy; c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    widths = {"#": 4, "TCAD account": 12, "Owner of record": 30, "Situs (property)": 36, "Mailing address (should match situs)": 36, "Deed date": 11,
              "Appraised value": 14, "HS flag": 8, "Est. 2-yr refund": 13, "Claim code": 15, "TCAD detail": 44, "TCAD search": 40, "Google Maps": 44, "Looks right? (Y/N)": 16, "Notes": 30}
    for i, h in enumerate(heads, 1):
        ws.column_dimensions[get_column_letter(i)].width = widths.get(h, 14)
        for cell in ws[get_column_letter(i)][1:]:
            cell.font = Font(name="Times New Roman", size=10)
            if h in ("TCAD detail", "TCAD search", "Google Maps"): cell.hyperlink = cell.value; cell.font = Font(name="Times New Roman", size=10, color="2E5496", underline="single")
            if h == "Appraised value": cell.number_format = '$#,##0;($#,##0);-'
            if h == "Est. 2-yr refund": cell.number_format = '$#,##0;($#,##0);-'
    ws.freeze_panes = "A2"
    readme = wb.create_sheet("Read Me", 0)
    for line in [
        "Clean Bill — Lead verification pack", "",
        f"{a.n} Tier-1 leads sampled at random (seed {a.seed}) from {total:,} Tier-1 leads in Supabase.",
        "Tier 1 = owner-occupied residential (state code A1/A3/A4), no homestead/over-65/disability flags on the 2026 roll, mailing address = property address, not an entity, appraised value >= $100K, deed dated on/before Jan 1, 2024 (both refund years available).",
        "For each row: open the TCAD detail link (or paste the account number into TCAD search) and confirm (1) no homestead exemption shown, (2) the owner name and situs match, (3) the deed date is plausible. Open Google Maps to confirm it is a house/condo, not a lot or a business.",
        "Mark Y/N in 'Looks right?' and add notes. Anything marked N is a heuristic bug to fix before the mail test.",
        "Glossary: TCAD = Travis Central Appraisal District; situs = the property's physical address; HS = homestead exemption flag; deed date = date of the most recent recorded deed; Tier 1 = owned before Jan 1 of the earliest refundable year.",
    ]:
        readme.append([line])
    readme.column_dimensions["A"].width = 140
    readme["A1"].font = Font(name="Times New Roman", size=12, bold=True)
    for row in readme.iter_rows(min_row=2):
        for c in row: c.font = Font(name="Times New Roman", size=10); c.alignment = Alignment(wrap_text=True, vertical="top")
    wb.save(str(out) + ".xlsx")

    md = ["# Lead verification pack — 25 random Tier-1 leads", "", f"Sampled from {total:,} Tier-1 leads (seed {a.seed}). Check each on TCAD and Maps; mark ✅/❌.", "",
          "| # | TCAD account | Owner | Situs | Deed | Value | Est. refund | Code | Links |", "|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        md.append(f"| {r['#']} | {r['TCAD account']} | {r['Owner of record']} | {r['Situs (property)']} | {r['Deed date']} | ${r['Appraised value']:,.0f} | ${r['Est. 2-yr refund']:,} | {r['Claim code']} | [TCAD]({r['TCAD detail']}) · [Map]({r['Google Maps']}) |")
    Path(str(out) + ".md").write_text("\n".join(md) + "\n")
    print(f"wrote {out}.xlsx and {out}.md ({len(rows)} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
