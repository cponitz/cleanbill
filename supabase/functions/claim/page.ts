// HTML for the claim page. Server-rendered, mobile-first, no framework. All copy mirrors copy/claim_page.md.
import { BRAND, SUPPORT_EMAIL, esc, moneyFloor } from "./db.ts";

export const CSS = `
:root{--navy:#1F3864;--ink:#1F2733;--grey:#6B7686;--line:#C9D2DF;--tint:#F1F4F9;--accent:#2E5496;--amber:#C08A2E}
*{box-sizing:border-box}body{margin:0;font:16px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff}
.wrap{max-width:640px;margin:0 auto;padding:16px 18px 60px}
header{border-bottom:1px solid var(--line);padding:10px 0 12px;margin-bottom:8px}
header .b{font-weight:700;color:var(--navy);font-size:20px;letter-spacing:.2px}
header .s{font-size:12px;color:var(--grey)}
h1{font-size:22px;line-height:1.25;margin:16px 0 8px;color:var(--navy)}
h2{font-size:17px;margin:26px 0 8px;color:var(--navy);text-transform:uppercase;letter-spacing:.4px}
.card{background:var(--tint);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:12px 0}
.big{font-size:32px;font-weight:700;color:var(--navy);margin:4px 0}
.note{font-size:13px;color:var(--grey)}
.callout{background:var(--navy);color:#fff;border-radius:10px;padding:14px 16px;margin:14px 0}
.callout a{color:#fff}
label{display:block;font-weight:600;margin:14px 0 6px}
input[type=text],input[type=email],input[type=tel],input[type=month]{width:100%;padding:12px;border:1px solid var(--line);border-radius:8px;font-size:16px}
.radio label{font-weight:400;margin:6px 0;display:flex;gap:10px;align-items:flex-start}
.chk{display:flex;gap:10px;align-items:flex-start;margin:10px 0;font-size:15px}
.chk input{margin-top:4px;flex:0 0 auto}
.file{border:2px dashed var(--line);border-radius:10px;padding:14px;text-align:center;margin:8px 0;background:#fff}
.file input{width:100%}
button{width:100%;background:var(--navy);color:#fff;border:0;border-radius:10px;padding:16px;font-size:18px;font-weight:700;margin-top:18px}
button:disabled{opacity:.5}
.sig{font-family:"Brush Script MT",cursive;font-size:26px}
.err{background:#fff4e5;border:1px solid var(--amber);border-radius:8px;padding:10px 12px;margin:10px 0}
table{width:100%;border-collapse:collapse;font-size:15px}td{padding:6px 0;border-bottom:1px solid var(--line)}td:last-child{text-align:right;font-weight:600}
footer{margin-top:40px;font-size:12px;color:var(--grey);border-top:1px solid var(--line);padding-top:12px}
`;

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} — ${esc(BRAND)}</title><style>${CSS}</style></head><body><div class="wrap">
<header><div class="b">${esc(BRAND)}</div><div class="s">Private company · Not affiliated with any government agency</div></header>
${body}
<footer>${esc(BRAND)} is a private company in Austin, Texas. We are not affiliated with the Travis Central Appraisal District, the Travis County Tax Office, or any government agency. Estimates are based on public appraisal data and current tax rates; the appraisal district decides eligibility. Refunds are issued by the Travis County Tax Office to the person who paid the tax. Not legal or tax advice. Questions: ${esc(SUPPORT_EMAIL)}</footer>
</div></body></html>`;
}

export function renderNotFound(): string {
  return shell("Claim not found", `<h1>We couldn't find that claim code.</h1>
<p>Check the code printed on your letter (it looks like <b>TRD-XXXX-XXXX</b>) and try again, or email ${esc(SUPPORT_EMAIL)} with your property address.</p>`);
}

export function renderClosed(status: string): string {
  return shell("Claim status", `<h1>This claim is already in progress.</h1>
<p>Status: <b>${esc(status)}</b>. We've emailed you the next steps. Questions: ${esc(SUPPORT_EMAIL)}.</p>`);
}

type Lead = {
  claim_code: string; est_refund_total: number; est_refund_by_year: Record<string, { total: number }>;
  est_forward_annual: number; refund_years: number[];
};
type Prop = { prop_id: number; owner_name: string; situs_full: string };

export function renderClaim(lead: Lead, prop: Prop, error?: string): string {
  const years = (lead.refund_years ?? []).slice().sort();
  const earliest = years[0] ?? new Date().getFullYear() - 2;
  const deadline = `February 1, ${earliest + 3}`; // 2 years after the Feb 1 delinquency date (Tax Code §11.431)
  const rows = years.map((y) => {
    const t = lead.est_refund_by_year?.[String(y)]?.total ?? 0;
    return `<tr><td>Tax year ${y} (already paid)</td><td>${moneyFloor(t)}</td></tr>`;
  }).join("");
  const body = `
${error ? `<div class="err">${esc(error)}</div>` : ""}
<h1>${esc(prop.situs_full)}</h1>
<div class="note">Travis Central Appraisal District account ${esc(prop.prop_id)} · Owner of record: ${esc(prop.owner_name)}</div>

<div class="card">
  <div class="note">Estimated refund of tax already paid</div>
  <div class="big">${moneyFloor(lead.est_refund_total)}</div>
  <table>${rows}<tr><td>Estimated lower bill, every year going forward (100% yours)</td><td>${moneyFloor(lead.est_forward_annual)}/yr</td></tr></table>
  <p class="note"><b>Timing:</b> the ${earliest} tax year can only be claimed until <b>${deadline}</b>; after that, the oldest refund year is gone for good.</p>
  <p class="note" style="margin-bottom:0">Estimates from public appraisal data and current tax rates. The Travis Central Appraisal District decides eligibility; the Travis County Tax Office pays approved refunds on behalf of Austin ISD, the City of Austin, Travis County, Austin Community College, and Central Health.</p>
</div>

<div class="callout"><b>You can file this yourself for free</b> at <a href="https://traviscad.org/homesteadexemptions" target="_blank" rel="noopener">traviscad.org</a> (Form 50-114). If you'd rather we handle it, continue below — our fee is 25% of the refund you actually receive, and $0 otherwise.</div>

<form method="post" enctype="multipart/form-data" id="f">
<input type="hidden" name="c" value="${esc(lead.claim_code)}">

<h2>1 · Eligibility</h2>
<label>Did you own <u>and live in</u> this home on January 1, ${earliest}?</label>
<div class="radio">
  <label><input type="radio" name="owned_jan1" value="yes" required> Yes</label>
  <label><input type="radio" name="owned_jan1" value="no"> No — I moved in later: <input type="month" name="moved_in" style="width:auto;padding:6px;margin-left:6px"></label>
</div>
<label>Is this your primary residence today?</label>
<div class="radio">
  <label><input type="radio" name="primary" value="yes" required> Yes</label>
  <label><input type="radio" name="primary" value="no"> No</label>
</div>
<label>Do you or your spouse claim a homestead exemption on any other property, in Texas or elsewhere?</label>
<div class="radio">
  <label><input type="radio" name="other_hs" value="no" required> No</label>
  <label><input type="radio" name="other_hs" value="yes"> Yes</label>
</div>
<p class="note">Texas allows one homestead per family. If you answer "Yes", we'll pause and email you before doing anything.</p>

<h2>2 · Your Texas driver's license or ID</h2>
<p>Texas law requires a copy of your Texas driver's license or DPS ID with the application, and <b>the address on it must match ${esc(prop.situs_full)}</b>.</p>
<div class="file"><div>📷 Front of your license</div><input type="file" name="dl_front" accept="image/jpeg,image/png,image/webp" capture="environment" required></div>
<div class="file"><div>Back (optional)</div><input type="file" name="dl_back" accept="image/jpeg,image/png,image/webp" capture="environment"></div>
<p class="note">Your ID is used only to prepare your application, stored encrypted, and deleted 30 days after filing. ID numbers are confidential under Texas Tax Code §11.48. <b>Address on your license doesn't match?</b> You can update it online with the Texas DPS in about 10 minutes — we'll send the link and hold your claim until then.</p>

<h2>3 · Contact</h2>
<label>Full name (as on your ID)</label><input type="text" name="full_name" required autocomplete="name">
<label>Email</label><input type="email" name="email" required autocomplete="email">
<label>Mobile (optional, for status updates)</label><input type="tel" name="phone" autocomplete="tel">

<h2>4 · Review and sign</h2>
<div class="card">
<p><b>What we do:</b> prepare your Form 50-114 residence homestead exemption application (including the late-application years above) and related refund paperwork, submit it as you direct, track it with the Travis Central Appraisal District, and handle routine follow-up from the district.</p>
<p><b>What you pay:</b> <b>25% of any refund you actually receive</b> for the tax years above, invoiced after the Travis County Tax Office issues the refund. <b>$0 if no refund is issued.</b> No fee on your future annual savings. Cancel at no cost any time before submission.</p>
<p class="note"><b>Refund disclosure (Texas Property Code §41.0051):</b> the refund, if approved, is owed by the taxing units served by the Travis County Tax Office — Austin ISD, City of Austin, Travis County, Austin Community College District, and Central Health — following approval by the Travis Central Appraisal District.</p>
</div>
<div class="chk"><input type="checkbox" name="agree_terms" required><span>I have read the <a href="/functions/v1/claim/agreement?c=${esc(lead.claim_code)}" target="_blank">Service Agreement</a> and agree to it.</span></div>
<div class="chk"><input type="checkbox" name="agree_esign" required><span>I agree to sign electronically. My typed name below is my legal signature on the Service Agreement <b>and</b> on my Form 50-114 application, and I am the property owner named above.</span></div>
<div class="chk"><input type="checkbox" name="agree_free" required><span>I understand I can file for free myself and am choosing to use ${esc(BRAND)}.</span></div>
<label>Type your full legal name to sign</label>
<input type="text" name="signature_name" class="sig" required autocomplete="off" placeholder="Your full name">
<p class="note">Signature record: name, date/time, IP address, and device are recorded and stamped on your application.</p>
<button type="submit" id="btn">Sign and submit</button>
</form>
<script>document.getElementById('f').addEventListener('submit',()=>{const b=document.getElementById('btn');b.disabled=true;b.textContent='Uploading…'});</script>`;
  return shell("Your property-tax refund claim", body);
}

export function renderThanks(firstName: string): string {
  return shell("Received", `<h1>Done — we have everything, ${esc(firstName)}.</h1>
<div class="card"><ol style="padding-left:20px;margin:0">
<li>Within minutes we check your ID against the appraisal record and prepare your application. You'll get an email with a copy to review.</li>
<li>Once you say "go," we submit it to the Travis Central Appraisal District. They typically take 30–90 days.</li>
<li>If approved, the Travis County Tax Office issues your refund within about 60 days. We invoice 25% then — never before.</li>
</ol></div>
<p>Questions? Reply to any of our emails or write ${esc(SUPPORT_EMAIL)}.</p>`);
}

export function renderAgreement(prop: Prop, yearsText: string): string {
  return shell("Service Agreement", `<h1>${esc(BRAND)} — Service Agreement (v0.1)</h1>
<p class="note">Plain-English agreement. Glossary: TCAD = Travis Central Appraisal District; Tax Office = Travis County Tax Assessor-Collector; Form 50-114 = the Texas residence homestead exemption application.</p>
<p><b>Parties.</b> This agreement is between you, the owner of the property at <b>${esc(prop.situs_full)}</b> ("you"), and ${esc(BRAND)}, a private company based in Austin, Texas ("we"). We are not affiliated with TCAD, the Tax Office, or any government agency.</p>
<p><b>1. What we do.</b> We prepare your Form 50-114 residence homestead exemption application, including the late-application request for tax years <b>${esc(yearsText)}</b> under Texas Tax Code §11.431, using the information and identification you provide. We assemble the application for your signature, submit it to TCAD as you direct (or provide it to you to submit), monitor its status, and respond to routine document requests from TCAD on your behalf. We do not represent you in a protest or hearing; if TCAD denies your application, we will tell you your options, and any protest representation would be a separate written engagement with a registered property tax consultant or attorney.</p>
<p><b>2. What you do.</b> You confirm that the information you give us is accurate; that the property is your principal residence; that you owned and occupied it on January 1 of each tax year claimed; and that you and your spouse do not claim a homestead exemption on any other property. You provide a Texas driver's license or DPS ID whose address matches the property, and you sign the application yourself.</p>
<p><b>3. You can do this for free.</b> Filing Form 50-114 with TCAD is free, and you do not need anyone's help to do it. You are choosing to pay for our preparation and follow-through.</p>
<p><b>4. Fee.</b> Our fee is <b>25% of the property-tax refund you actually receive</b> for the tax years above, as a result of the exemption we prepared. <b>If no refund is issued, you owe nothing.</b> No fee applies to lower tax bills in future years, to any current-year bill reduction, or to any exemption you already had. Refund amounts are determined solely by TCAD and the Tax Office.</p>
<p><b>5. When and how you pay.</b> After the Tax Office issues your refund (typically within 60 days of TCAD's approval), we send an itemized invoice showing each taxing unit's refund and our 25%. Payment is due 14 days after the invoice. If you provided a card, we charge it on the due date and email a receipt. We never charge before a refund is issued.</p>
<p><b>6. Refund disclosure.</b> The refund, if any, is owed by the taxing units the Tax Office collects for — Austin Independent School District, City of Austin, Travis County, Austin Community College District, and Central Health — after TCAD approves the late application. Refunds are paid by the Tax Office to the person who paid the tax; if part of a year's tax was paid by a prior owner or a mortgage servicer, the Tax Office decides who receives it.</p>
<p><b>7. No guarantee.</b> Our refund figures are estimates from public appraisal data and current tax rates. We do not guarantee approval, timing, or amount. TCAD may request additional documents or deny the application; a common reason is an ID address that does not match the property.</p>
<p><b>8. Your information.</b> We use your ID and personal information only to prepare and track your application. ID images are stored encrypted and deleted 30 days after your application is filed. We do not sell your information. ID numbers are confidential under Texas Tax Code §11.48.</p>
<p><b>9. Cancellation.</b> You may cancel at no cost at any time before your application is submitted to TCAD, by email to ${esc(SUPPORT_EMAIL)}. After submission, the fee in §4 still applies to any refund that results from the application we prepared.</p>
<p><b>10. Electronic signature.</b> Typing your name on our claim page is your electronic signature on this agreement and on Form 50-114, with the same effect as a handwritten signature (federal ESIGN Act; Texas Business &amp; Commerce Code ch. 322). We record the date, time, IP address, and device used.</p>
<p><b>11. Not legal or tax advice.</b> We are a preparation and follow-through service. Nothing here is legal or tax advice.</p>
<p><b>12. Disputes.</b> Texas law governs. We will first try to resolve any disagreement directly within 30 days; either party may then pursue it in a court of competent jurisdiction in Travis County, Texas.</p>`);
}
