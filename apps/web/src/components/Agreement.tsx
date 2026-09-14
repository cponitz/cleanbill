"use client";
// /agreement/[code] — copy/service_agreement.md v0.1 verbatim, with the property and years filled from the claim API.
// SPEC-03 amendment 2026-09-14: the fee-timing wording (§5) is replaced from copy/service_agreement.md after the copy review.
import { useEffect, useState } from "react";
import { type ClaimLookup, getClaim } from "@/lib/api";
import { SUPPORT_EMAIL } from "@/lib/copy";
import { yearsText } from "@/lib/format";

export function Agreement({ code }: { code: string }) {
  const [situs, setSitus] = useState("the property on your claim page");
  const [years, setYears] = useState("shown on your claim page");
  useEffect(() => {
    getClaim(code).then((j: ClaimLookup) => {
      const prop = "property" in j ? j.property : null;
      const lead = "lead" in j ? j.lead : null;
      if (prop?.situs_full) setSitus(prop.situs_full);
      if (lead?.refund_years?.length) setYears(yearsText(lead.refund_years));
    }).catch(() => {});
  }, [code]);
  return (
    <article className="space-y-3">
      <h1>Texas Refund Desk — Service Agreement (v0.1)</h1>
      <p className="note">Plain-English agreement. Glossary: TCAD = Travis Central Appraisal District; Tax Office = Travis County Tax Assessor-Collector; Form 50-114 = the Texas residence homestead exemption application.</p>
      <p><b>Parties.</b> This agreement is between you, the owner of the property at <b data-testid="agreement-situs">{situs}</b> (&quot;you&quot;), and Texas Refund Desk, a private company based in Austin, Texas (&quot;we&quot;). We are not affiliated with TCAD, the Tax Office, or any government agency.</p>
      <p><b>1. What we do.</b> We prepare your Form 50-114 residence homestead exemption application, including the late-application request for tax years <b>{years}</b> under Texas Tax Code §11.431, using the information and identification you provide. We assemble the application for your signature, submit it to TCAD as you direct (or provide it to you to submit), monitor its status, and respond to routine document requests from TCAD on your behalf. We do not represent you in a protest or hearing; if TCAD denies your application, we will tell you your options, and any protest representation would be a separate written engagement with a registered property tax consultant or attorney.</p>
      <p><b>2. What you do.</b> You confirm that the information you give us is accurate; that the property is your principal residence; that you owned and occupied it on January 1 of each tax year claimed; and that you and your spouse do not claim a homestead exemption on any other property. You provide a Texas driver&apos;s license or DPS ID whose address matches the property, and you sign the application yourself.</p>
      <p><b>3. You can do this for free.</b> Filing Form 50-114 with TCAD is free, and you do not need anyone&apos;s help to do it. You are choosing to pay for our preparation and follow-through.</p>
      <p><b>4. Fee.</b> Our fee is <b>25% of the property-tax refund you actually receive</b> for the tax years above, as a result of the exemption we prepared. <b>If no refund is issued, you owe nothing.</b> No fee applies to the lower tax bills you receive in future years, to any current-year bill reduction, or to any exemption you already had. Refund amounts are determined solely by TCAD and the Tax Office.</p>
      <p><b>5. When and how you pay.</b> After the Tax Office issues your refund (typically within 60 days of TCAD&apos;s approval), we send you an itemized invoice showing each taxing unit&apos;s refund and our 25%. Payment is due 14 days after the invoice. You may provide a card at signup; if you do, we charge it on the due date and email a receipt. We never charge before a refund is issued.</p>
      <p><b>6. Refund disclosure.</b> The refund, if any, is owed by the taxing units the Tax Office collects for — Austin Independent School District, City of Austin, Travis County, Austin Community College District, and Central Health — after TCAD approves the late application. Refunds are paid by the Tax Office to the person who paid the tax; if part of a year&apos;s tax was paid by a prior owner or by a mortgage servicer, the Tax Office decides who receives it.</p>
      <p><b>7. No guarantee.</b> Our refund figures are estimates from public appraisal data and current tax rates. We do not guarantee approval, timing, or amount. TCAD may request additional documents or deny the application; a common reason is an ID address that does not match the property.</p>
      <p><b>8. Your information.</b> We use your ID and personal information only to prepare and track your application. ID images are stored encrypted and deleted 30 days after your application is filed. We do not sell your information. ID numbers are confidential under Texas Tax Code §11.48.</p>
      <p><b>9. Cancellation.</b> You may cancel at no cost at any time before your application is submitted to TCAD, by email to {SUPPORT_EMAIL}. After submission, the fee in §4 still applies to any refund that results from the application we prepared.</p>
      <p><b>10. Electronic signature.</b> You agree that typing your name on our claim page is your electronic signature on this agreement and on Form 50-114, with the same effect as a handwritten signature (federal ESIGN Act; Texas Business &amp; Commerce Code ch. 322). We record the date, time, IP address, and device used.</p>
      <p><b>11. Not legal or tax advice.</b> We are a preparation and follow-through service. Nothing here is legal or tax advice.</p>
      <p><b>12. Disputes.</b> Texas law governs. If we have a disagreement, we will first try to resolve it directly within 30 days; either party may then pursue it in a court of competent jurisdiction in Travis County, Texas.</p>
    </article>
  );
}
