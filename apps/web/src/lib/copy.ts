// Customer-facing wording. Every string here is transcribed from the compliance-reviewed copy files in /copy — the source
// section is named next to each block. Strings marked NEW are not in copy/*.md and are listed in the PR for review
// (SPEC-04b §5: "no new claims in copy without review").
//   copy/claim_page.md      → HEADER, ESTIMATE, ELIGIBILITY, LICENSE, CONTACT, SIGN, DONE
//   copy/followups.md       → FIX (needs_dl_update paragraph)
//   copy/service_agreement.md → the agreement page (components/Agreement.tsx)
//   docs/index.html (live prototype wording) → LANDING, FOOTER; docs/claim.html → the two eligibility questions the
//   claim_page.md three-question list does not cover (previous homestead, household)

export const BRAND = "Texas Refund Desk";
export const SUPPORT_EMAIL = "hello@texasrefunddesk.com";
export const DPS_URL = "https://www.dps.texas.gov/section/driver-license/change-your-address";
export const TCAD_URL = "https://traviscad.org/homesteadexemptions";
export const TAXING_UNITS = "Austin ISD, the City of Austin, Travis County, Austin Community College, and Central Health";

// copy/claim_page.md — Header
export const HEADER = { brand: BRAND, sub: "Private company · Not affiliated with any government agency" };

// docs/index.html (prototype landing, live since 2026-09-08)
export const LANDING = {
  h1: "Got a letter from us? Enter your claim code to see your estimated refund.",
  codeLabel: "Claim code (printed on your letter)",
  codePlaceholder: "TRD-XXXX-XXXX",
  open: "Open my claim",
  what: "What this is.",
  whatBody: "We review the Travis Central Appraisal District's public records for owner-occupied homes with no homestead exemption and help owners claim the exemption retroactively — a refund of taxes already paid for up to two prior years, plus lower bills going forward.",
  free: "You can always file yourself, free,",
  freeBody: "If you'd rather we handle it: our fee is 25% of the refund you actually receive, and $0 otherwise.",
  // NEW (landing "the math" block, SPEC-04b §2 — figures come from the letter/claim page, this explains the mechanism)
  mathTitle: "How the refund works",
  math: [
    "Texas law lets a homeowner file the residence homestead exemption up to two years late (Tax Code §11.431).",
    "When the Travis Central Appraisal District approves a late application, the Travis County Tax Office refunds the tax you overpaid for those years.",
    "Your bill also goes down every year after that. You keep 100% of that part.",
  ],
  badCode: "Check the code printed on your letter (it looks like TRD-XXXX-XXXX) and try again.",
};

// docs/index.html + docs/claim.html footer (live prototype wording)
export const FOOTER = `${BRAND} is a private company in Austin, Texas. We are not affiliated with the Travis Central Appraisal District, the Travis County Tax Office, or any government agency. Estimates are based on public appraisal data and current tax rates; the appraisal district decides eligibility. Refunds are issued by the Travis County Tax Office to the person who paid the tax. Not legal or tax advice. Questions: ${SUPPORT_EMAIL}`;

// copy/claim_page.md — Step 1
export const ESTIMATE = {
  account: (propId: number, owner: string) => `Travis Central Appraisal District account ${propId} · Owner of record: ${owner}`,
  refundLabel: "Estimated refund:",
  yearLine: (year: number, amount: string) => `Tax year ${year}: about ${amount}`,
  forward: (amount: string) => `Plus an estimated ${amount} lower tax bill every year going forward`,
  forwardNote: "(you keep 100% of that).",
  disclaimer: `These are estimates from public appraisal data and current tax rates. The Travis Central Appraisal District decides eligibility; the Travis County Tax Office pays approved refunds on behalf of ${TAXING_UNITS}.`,
  free: "You can file this yourself for free",
  freeTail: "(Form 50-114). If you'd like us to handle it, continue.",
  timing: (earliest: number, deadline: string) => `Timing: the ${earliest} tax year can only be claimed until ${deadline}; after that, the oldest refund year is gone for good.`, // docs/claim.html
  cta: "Continue →",
};

// copy/claim_page.md — Step 2 (questions 1–3) · docs/claim.html (questions 4–5, live prototype wording)
export const ELIGIBILITY = {
  title: "Confirm eligibility",
  q1: (earliest: number) => `Did you own and live in this home on January 1, ${earliest}?`,
  q1no: "No — I moved in later:",
  q2: "Is this your primary residence today?",
  q3: "Do you (or your spouse) claim a homestead exemption on any other property, in Texas or elsewhere?",
  q4: "Did you have a homestead exemption on a previous home?",
  q4yes: "Yes — previous address:",
  q5: "Who owns the home?",
  q5opts: { single: "Just me", married: "My spouse and me", other: "Me with other co-owners" },
  note: 'Texas allows one homestead per family. If you answer "Yes" to another homestead, we\'ll pause and email you before doing anything.',
  yes: "Yes", no: "No",
};

// copy/claim_page.md — Step 3 · SPEC-06 §3 (pre-check sentences, approved spec wording)
export const LICENSE = {
  title: "Your Texas driver's license or ID",
  intro: (situs: string) => `Texas law requires a copy of your Texas driver's license or DPS ID with the application, and the address on it must match ${situs}.`,
  // SPEC-06 §3 — typed pre-check
  precheckTitle: "First, a quick check (optional)",
  precheckHelp: "Type the address exactly as it appears on your license and we'll tell you right away whether it matches the property.", // NEW
  nameLabel: "Name as on your license",
  addressLabel: "Address as on your license",
  zipLabel: "ZIP",
  precheckMatch: "Matches the property.",
  precheckMismatch: "Doesn't match — you'll need to update it at DPS before TCAD will approve. You can still continue and fix it after.",
  front: "Take a photo of the front",
  back: "Back (optional)",
  cameraHint: "Lay the card flat in good light and fill the frame. iPhone photos (HEIC) are converted automatically.", // NEW
  privacy: "Your ID is used only to prepare your application. It is stored encrypted and deleted 30 days after your application is filed. ID numbers are confidential under Texas Tax Code §11.48.",
  mismatchCallout: "Address on your license doesn't match? No problem — you can update it online at the Texas DPS in about 10 minutes (we'll send you the link). We'll hold your claim until it's updated; nothing is filed until then.",
  fileTooBig: "License photo must be a JPEG/PNG/WebP/PDF under 15 MB.", // API error wording
  converting: "Converting photo…", // NEW
};

// copy/claim_page.md — Step 4
export const CONTACT = {
  title: "Contact",
  name: "Name (as it appears on your ID)",
  email: "Email",
  phone: "Mobile (optional, for status updates)",
};

// copy/claim_page.md — Step 5
export const SIGN = {
  title: "Review and sign",
  whatWeDo: "What we do:",
  whatWeDoBody: "prepare your Form 50-114 residence homestead exemption application (including the late-application years listed above) and the related refund paperwork, submit it as you direct, track it with the Travis Central Appraisal District, and handle any follow-up questions from the district.",
  whatYouPay: "What you pay:",
  whatYouPayBody1: "25% of any refund you actually receive",
  whatYouPayBody2: "for the tax years above, invoiced after the Travis County Tax Office issues the refund.",
  whatYouPayBody3: "$0 if no refund is issued.",
  whatYouPayBody4: "No fee on your future annual savings. You may cancel at no cost any time before your application is submitted.",
  disclosure: "Refund disclosure (Texas Property Code §41.0051):",
  disclosureBody: "the refund, if approved, is owed by the taxing units served by the Travis County Tax Office — Austin ISD, City of Austin, Travis County, Austin Community College District, and Central Health — following approval by the Travis Central Appraisal District.",
  agreeTerms1: "I have read the ", agreeTermsLink: "Service Agreement", agreeTerms2: " and agree to it.",
  agreeEsign: "I agree to sign electronically. I understand my typed name below is my legal signature on the Service Agreement and on my Form 50-114 application, and that I am the property owner named above.",
  agreeFree: "I understand I can file for free myself and am choosing to use Texas Refund Desk.",
  sigLabel: "Type your full legal name to sign",
  submit: "Sign and submit",
  record: "Signature record: name, date/time, IP address, and device are recorded and stamped on your application.",
  sigMismatch: "Your typed signature must match your full name exactly.", // API error wording
};

// SPEC-06 §2 (inline result) — approved spec wording where quoted; NEW where marked
export const RESULT = {
  checking: "Checking your license against the appraisal record…", // NEW
  checkingSub: "This usually takes about ten seconds. Please keep this page open.", // NEW
  timeout: "This is taking longer than usual. We're still working on it — your status page will show the result, and we'll email you as well.", // NEW
  readyTitle: "Your license matches.",
  readyBody: "Here is your Form 50-114 — please check your name, address, and the dates.", // copy/followups.md (ready_to_submit)
  viewPacket: "Open my Form 50-114 (PDF)", // NEW
  readyNext: 'Reply "go" to our email and we\'ll submit it to the Travis Central Appraisal District, or tell us what to change. TCAD typically takes 30–90 days; nothing is owed until a refund is actually issued.', // copy/followups.md
  reviewTitle: "One quick question before we prepare anything", // NEW
  replyLabel: "Your reply",
  replySend: "Send reply",
  replySent: "Thanks — we'll read this and email you. Nothing has been filed, and you owe nothing.", // NEW (mirrors followups needs_review)
  confirmTitle: "Please confirm what's on your license", // NEW
  confirmHelp: "We couldn't read part of your photo clearly. Correct anything that's wrong, then confirm. The photo stays on file — Texas law requires a copy of the license with the application.", // NEW (SPEC-06 §4)
  confirm: "Confirm and re-check",
  errorTitle: "We hit a snag", // rule table processing_error (customer sentence supplies the body)
  continue: "Continue →",
};

// SPEC-02 §1 (fix screen) · copy/followups.md (needs_dl_update)
export const FIX = {
  title: "One quick step before we can file — your license address", // followups.md subject
  body: (id: string, situs: string) => `We reviewed your ID and the address on it (${id}) doesn't match ${situs}. TCAD requires them to match before it will approve a homestead exemption.`,
  onId: "On your license", onRoll: "The property", // NEW (labels for the side-by-side)
  fastest: "Fastest fix: update your address with the Texas DPS online — usually about 10 minutes.",
  dpsLink: "Change my address at the Texas DPS", // NEW (link text)
  dpsAsks: "DPS will ask for your driver's license number, the audit number printed on the card, the last four digits of your Social Security number, and a card for the fee.", // NEW (SPEC-02 §1)
  then: "When you have the confirmation (a printed temporary card or the updated card), upload a photo of it here and we'll finish your application the same day.", // followups.md, adapted from "reply here with a photo"
  upload: "Upload your updated license (or the DPS confirmation)", // SPEC-02 §1
  hold: "Your claim is on hold until then — nothing has been filed.",
  free: "(You can also file yourself for free at traviscad.org once your address is updated.)",
  submit: "Upload and re-check",
};

// SPEC-03 §1 — the card step is rendered only when NEXT_PUBLIC_STRIPE_ENABLED=true (implemented in Task 3)
export const CARD = {
  title: "Save a card for the 25% fee",
  body: "Nothing is charged until we see your refund arrive, and we'll email you 3 business days before.",
  skip: "Skip for now",
};

// copy/claim_page.md — Confirmation screen
export const DONE = {
  title: "Done — we have everything.",
  intro: "Here's what happens next:",
  steps: [
    "Within minutes we check your ID against the appraisal record and prepare your application. You'll get an email with a copy to review.",
    'Once you say "go," we submit it to the Travis Central Appraisal District. They typically take 30–90 days.',
    "If approved, the Travis County Tax Office mails your refund check (or applies it to your account) within about 60 days. We invoice 25% then — never before.",
  ],
  questions: `Questions? Reply to any of our emails or write ${SUPPORT_EMAIL}.`,
  status: "See my claim status", // NEW
};

// /claim/[code]/status — plain-English state (SPEC-04b §2). NEW sentences, derived from docs/RUNBOOK.md §9.4 meanings.
export const STATUS: Record<string, { title: string; body: string }> = {
  none: { title: "We haven't received your application yet.", body: "Open your claim page to see your estimate and get started." },
  submitted: { title: "Received — checking now.", body: "We're checking your ID against the appraisal record and preparing your application." },
  processing: { title: "Received — checking now.", body: "We're checking your ID against the appraisal record and preparing your application." },
  ready_to_submit: { title: "Your application is ready for your review.", body: 'Check the PDF, then reply "go" to our email and we\'ll submit it to the Travis Central Appraisal District.' },
  needs_dl_update: { title: "Waiting on your license address.", body: "The address on your license doesn't match the property yet. Update it at the Texas DPS, then upload the new license from your claim page." },
  needs_review: { title: "We're reviewing one detail.", body: "Something on your ID didn't line up with the appraisal record. We'll email you; nothing has been filed and you owe nothing." },
  filed: { title: "Submitted to TCAD.", body: "The Travis Central Appraisal District may take up to 90 days. If they ask for anything else, we'll handle it and let you know." },
  approved: { title: "Approved by TCAD.", body: "The Travis County Tax Office issues refunds within about 60 days of approval. We'll email you when we see it." },
  refunded: { title: "Your refund has been issued.", body: "Check your email for the itemized invoice." },
  paid: { title: "All done.", body: "Thank you. Your bill going forward should be lower every year — that part is all yours." },
  denied: { title: "TCAD did not approve the application.", body: "You owe nothing. We've emailed your options." },
  withdrawn: { title: "This claim was withdrawn.", body: `Nothing was filed and nothing is owed. Questions: ${SUPPORT_EMAIL}.` },
};
export const STATUS_PAGE = { title: "Claim status", back: "Back to my claim", packet: "Download my Form 50-114 (PDF)", notFound: "We couldn't find a claim for that code." };

export const ERRORS = {
  notFound: "We couldn't find that claim code.",
  notFoundHelp: `Check the code printed on your letter (it looks like TRD-XXXX-XXXX) and try again, or email ${SUPPORT_EMAIL} with your property address.`, // docs/claim.html
  offline: "We couldn't connect. Please check your connection and try again.", // docs/claim.html (adapted)
  generic: "Something went wrong saving your claim. Please try again.", // API error wording
  rateLimited: "This page has been opened many times from your connection in the last hour. Please wait a little while and try again.", // NEW
};
