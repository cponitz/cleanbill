// Fill the official Comptroller Form 50-114 (Rev. 02-26/39) with pdf-lib, stamp the typed e-signature, append an audit page,
// and flatten. Mirrors trd/agent/form50114.py — keep the two field maps in sync.
import { LineCapStyle, PDFButton, PDFDocument, PDFSignature, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import type { Extracted, PropertyRec } from "./validate.ts";
import { BRAND_NAME, MARK_PATH, MARK_STROKE, RGB } from "../_shared/brand.ts";   // generated from the design tokens (SPEC-08 Part C)

export const FORM_VERSION = "50-114 (Rev. 02-26/39)";
export const FORM_URL = "https://comptroller.texas.gov/forms/50-114.pdf";
export const FORM_CACHE_PATH = "forms/50-114.pdf"; // in the private `packets` bucket
const COUNTY = "Travis";

export type FillInput = {
  prop: PropertyRec & { situs_city?: string | null; situs_zip?: string | null; deed_date?: string | null; legal_desc?: string | null };
  cust: Record<string, unknown>;
  lead: Record<string, unknown>;
  ex: Extracted;
  over65: boolean;
  dlNumber: string | null; // full number, used only inside the form (Tax Code §11.48 — confidential)
  signedOn?: Date;
};

const mdy = (d: string | Date | null | undefined): string => {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d.slice(0, 10) + "T00:00:00Z") : d;
  if (isNaN(dt.getTime())) return String(d);
  return `${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${String(dt.getUTCDate()).padStart(2, "0")}/${dt.getUTCFullYear()}`;
};
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
// pdf-lib's standard fonts are WinAnsi: strip anything outside Latin-1 so a stray character can't crash the fill.
const ansi = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, (c) => ({ "’": "'", "‘": "'", "“": '"', "”": '"', "—": "-", "–": "-", "≥": ">=" }[c] ?? "?"));

/** The values for the official form: [text fields, checkboxes to tick, radio selections]. */
export function formValues(p: FillInput): { text: Record<string, string>; checks: string[]; radios: Record<string, string> } {
  const signedOn = p.signedOn ?? new Date();
  const years = [...new Set([...((p.lead.refund_years as number[]) ?? []), signedOn.getUTCFullYear()])].sort();
  const name = title([p.ex.first_name, p.ex.middle_name, p.ex.last_name].filter(Boolean).join(" "));
  const household = String(p.cust.household ?? "single");
  const prevHs = Boolean(p.cust.prev_homestead);
  const street = String(p.prop.situs_full).split(",")[0];
  const physical = `${street}, ${p.prop.situs_city || "Austin"}, ${COUNTY} County, ${p.prop.situs_zip || ""}`.replace(/,\s*$/, "");
  const text: Record<string, string> = {
    "Appraisal Districts County Name": COUNTY,
    "Appraisal District Account Number if known": String(p.prop.prop_id),
    "Tax Years for Application": years.join(", "),
    "Name of Property Owner 1": name,
    "Birth Date mmddyyyy": mdy(p.ex.dob),
    "Drivers License or Personal ID Certificate": p.dlNumber ?? "",
    "Primary Phone Number area code and number": String(p.cust.phone ?? ""),
    "Email Address": String(p.cust.email ?? ""),
    "Percent Ownership Interest": household === "other" ? "" : "100",
    "Date you acquired this property": mdy(p.prop.deed_date ?? null),
    "Date you began occupying this property as your principal residence": mdy((p.cust.occupied_since as string) ?? p.prop.deed_date ?? null),
    "Physical Address ie street address not PO Box City County ZIP Code": physical,
    "Legal Description if known": String(p.prop.legal_desc ?? ""),
    "Property OwnerAuthorized Representative Name": name,
    "TitleAuthorization": "Property Owner",
    "Date 1": mdy(signedOn),
    "Additional Information": `Late application under Tax Code Sec. 11.431 for tax years ${years.slice(0, -1).join(", ")}. Prepared with Clean Bill; applicant signed electronically.`,
  };
  if (prevHs && p.cust.prev_homestead_address) text["Previous County"] = String(p.cust.prev_homestead_county ?? "");
  const checks = ["General Residence Homestead Exemption", ...(p.over65 ? ["Person Age 65 or Older or Surviving Spouse"] : [])];
  const radios: Record<string, string> = {
    "Are you filing a late application": years.length > 1 ? "Yes" : "No",
    "Sect1-1": "Yes_2", // lives in the property
    "Sect1-4": "No_4", // cooperative housing
    "Sect1-5": prevHs ? "Yes" : "No", // receiving a homestead exemption on a previous residence
    "Sect1-6": prevHs ? "Yes" : "No", // transferring an exemption
    "Sect1-7": "No", // transferring a tax limitation
    "Sect2-1": household === "married" ? "Married Couple" : household === "other" ? "Other (e.g., individual who owns the property with others)" : "Single Adult",
    "Sect3-1": "Yes", // applicant identified on deed
    "Sect3-2": "No", "Sect3-3": "No", "Sect3-4": "No", // heir property / other heirs / income-producing
  };
  return { text, checks, radios };
}

/** Load the blank form: `packets/forms/50-114.pdf` if cached, else the Comptroller's canonical PDF (then cache it). */
export async function loadBlankForm(sb: { storage: { from: (b: string) => { download: (p: string) => Promise<{ data: Blob | null; error: unknown }>; upload: (p: string, b: Uint8Array, o: Record<string, unknown>) => Promise<{ error: unknown }> } } }): Promise<Uint8Array> {
  const { data } = await sb.storage.from("packets").download(FORM_CACHE_PATH);
  if (data) return new Uint8Array(await data.arrayBuffer());
  const res = await fetch(FORM_URL);
  if (!res.ok) throw new Error(`blank 50-114 fetch failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  await sb.storage.from("packets").upload(FORM_CACHE_PATH, bytes, { contentType: "application/pdf", upsert: true });
  return bytes;
}

export async function fill50114(blank: Uint8Array, p: FillInput): Promise<Uint8Array> {
  const { text, checks, radios } = formValues(p);
  const doc = await PDFDocument.load(blank);
  const form = doc.getForm();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvB = await doc.embedFont(StandardFonts.HelveticaBold);
  const timesI = await doc.embedFont(StandardFonts.TimesRomanItalic);

  for (const [k, v] of Object.entries(text)) if (v) form.getTextField(k).setText(ansi(v));
  for (const k of checks) form.getCheckBox(k).check();
  for (const [k, v] of Object.entries(radios)) form.getRadioGroup(k).select(v);

  // Typed e-signature on the "Signature of Property Owner/Applicant" line (page 2), placed from the widget's own rectangle.
  const sigField = form.getField("Signature of Property OwnerApplicant or Authorized Representative");
  const rect = sigField.acroField.getWidgets()[0].getRectangle();
  const page2 = doc.getPage(1);
  const sigName = ansi(String(p.cust.signature_name ?? ""));
  page2.drawText(`/s/ ${sigName}`, { x: rect.x + 6, y: rect.y + 3, size: 13, font: timesI, color: rgb(0.1, 0.1, 0.35) });
  page2.drawText(ansi(`Electronically signed ${String(p.cust.agreement_signed_at ?? "")} from IP ${String(p.cust.signature_ip ?? "")} (see attached record)`),
    { x: rect.x + 6, y: rect.y + rect.height + 2, size: 5.5, font: helv, color: rgb(0.3, 0.3, 0.3) });

  // Signature fields have no appearance and push buttons would print — drop them, then flatten the rest.
  for (const f of form.getFields()) if (f instanceof PDFButton || f instanceof PDFSignature) form.removeField(f);
  form.updateFieldAppearances(helv);
  form.flatten();

  // Audit page (attachment) — wordmark and theme colours from _shared/brand.ts (SPEC-08 Part C).
  const page = doc.addPage([612, 792]);
  let y = 740;
  const ink = rgb(...RGB.ink), primary = rgb(...RGB.primary), primaryStrong = rgb(...RGB["primary-strong"]);
  const markSize = 16;
  page.drawSvgPath(MARK_PATH, { x: 54, y: y + markSize - 2, scale: markSize / 100, borderColor: primary, borderWidth: MARK_STROKE * markSize / 100, borderLineCap: LineCapStyle.Round });
  page.drawText(BRAND_NAME, { x: 54 + markSize * 1.18, y: y - 1, size: markSize * 0.78, font: helvB, color: primary });
  y -= 30;
  const line = (t: string, bold = false, size = 10.5, color = ink) => {
    page.drawText(ansi(t), { x: 54, y, size, font: bold ? helvB : helv, color, maxWidth: 504, lineHeight: size + 2 });
    y -= size + 6 + (t.length > 110 ? size + 2 : 0);
  };
  const yearsTxt = text["Tax Years for Application"];
  line("Electronic Signature and Preparation Record - attachment to Form 50-114", true, 13, primaryStrong);
  line(`Property: TCAD account ${p.prop.prop_id} - ${p.prop.situs_full}`);
  line(`Applicant: ${text["Name of Property Owner 1"]}    Exemptions requested: General residence homestead${p.over65 ? " + Age 65 or older" : ""}`);
  line(`Tax years: ${yearsTxt} (late application under Tax Code Sec. 11.431)`);
  y -= 6; line("SIGNATURE RECORD", true);
  line(`Signed by (typed): ${sigName}    At: ${String(p.cust.agreement_signed_at ?? "")}    IP: ${String(p.cust.signature_ip ?? "")}`);
  line(`Device: ${String(p.cust.signature_ua ?? "").slice(0, 100)}`, false, 9);
  line("The applicant consented to sign electronically (ESIGN; Tex. Bus. & Com. Code ch. 322) and typed their name as their signature on this application.", false, 9);
  line("A copy of the applicant's Texas driver's license/ID accompanies this application (Tax Code Sec. 11.43(j)).", false, 9);
  y -= 6; line("PREPARER", true);
  line("Prepared by Clean Bill (a private company; not affiliated with any government agency) at the applicant's direction.", false, 9);
  line(`Generated ${new Date().toISOString().slice(0, 19)}Z`, false, 8);

  return await doc.save();
}
