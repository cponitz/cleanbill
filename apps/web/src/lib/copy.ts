// Customer-facing wording for the claim flow, status page and agreement. Every string here is transcribed from the
// compliance-reviewed copy files in /copy — the source section is named next to each block. Strings marked NEW are not
// in copy/*.md and are listed in the PR for review (SPEC-04b §5: "no new claims in copy without review"). Strings marked
// SPEC-07 come from the design handoff (docs/specs/SPEC-07-website-redesign.md), whose copy the handoff calls final.
// Marketing-page copy (home, pricing, how it works, FAQ, exemptions, appeals, businesses, about) lives in lib/site.ts.
//   copy/claim_page.md      → HEADER, ESTIMATE, ELIGIBILITY, LICENSE, CONTACT, SIGN, DONE
//   copy/followups.md       → FIX (needs_dl_update paragraph)
//   copy/service_agreement.md → the agreement page (components/Agreement.tsx)
//   docs/claim.html → the two eligibility questions the claim_page.md three-question list does not cover (previous homestead, household)

// The brand is one token (B-19 / SPEC-08: Clean Bill everywhere; the repo, Supabase and Vercel slugs become `cleanbill` in
// SPEC-08 Part B). Flip these two lines and the whole site follows.
export const BRAND = "Clean Bill";
export const SUPPORT_EMAIL = "hello@cleanbillco.com";

export const DPS_URL = "https://www.dps.texas.gov/section/driver-license/change-your-address";
export const TCAD_URL = "https://traviscad.org/homesteadexemptions";
export const TCAD_SEARCH_URL = "https://traviscad.org/property-search";
export const TAXING_UNITS = "Austin ISD, the City of Austin, Travis County, Austin Community College, and Central Health";
export const META_DESCRIPTION = `Travis County homeowners who missed the residence homestead exemption can claim a refund for up to two prior years (Tax Code §11.431). Filing is free at TCAD; ${BRAND}'s fee is 25% of the refund you actually receive, $0 otherwise.`;

// copy/claim_page.md — Header
export const HEADER = { brand: BRAND, sub: "Private company · Not affiliated with any government agency" };

// SPEC-07 footer (verbatim from the handoff, "Footer")
export const FOOTER = {
  disclaimer: `${BRAND} is a private company in Austin, Texas, not affiliated with any government agency. Estimates come from public appraisal data; the appraisal district decides eligibility. Not legal or tax advice.`,
  links: [["Pricing", "/pricing"], ["FAQ", "/faq"], ["Service agreement", "/agreement"]] as Array<[string, string]>,
};

// SPEC-07 §02 — the step chrome
export const FLOW = {
  step: (n: number, name: string) => `Step ${n} of 5 · ${name}`,
  names: ["Estimate", "Eligibility", "Your Texas ID", "Contact", "Review and sign"],
  continueCta: "Continue",
  back: "Back",
  loading: "Loading your claim…",
};

// copy/claim_page.md — Step 1 · SPEC-07 §02 screen 1 for the line shapes
export const ESTIMATE = {
  account: (propId: number, owner: string) => `TCAD account ${propId} · Owner of record: ${owner}`,
  refundLabel: "Estimated refund",
  yearLine: (year: number, amount: string) => `Tax year ${year} · about ${amount}`,
  forward: (amount: string) => `Plus ~${amount} lower bill every year (100% yours)`,
  deadline: (earliest: number, deadline: string) => `The ${earliest} year can only be claimed until ${deadline}.`,   // the only urgency sentence allowed (SPEC-07 copy rules)
  disclaimer: `These are estimates from public appraisal data and current tax rates. The Travis Central Appraisal District decides eligibility; the Travis County Tax Office pays approved refunds on behalf of ${TAXING_UNITS}.`,
  free: "You can file this yourself for free at traviscad.org (Form 50-114). If you'd rather we handle it, continue.",
};

// copy/claim_page.md — Step 2 (questions 1–3) · docs/claim.html (questions 4–5) · SPEC-07 §02 for the title and short labels
export const ELIGIBILITY = {
  title: "Five quick questions",
  q1: (earliest: number) => `Did you own and live in this home on January 1, ${earliest}?`,
  q1no: "No, moved in later",
  q1when: "Month you moved in",
  q2: "Is this your primary residence today?",
  q3: "Do you (or your spouse) claim a homestead exemption on any other property, in Texas or elsewhere?",
  q4: "Did you have a homestead exemption on a previous home?",
  q4yes: "Yes",
  q4where: "Previous address",
  q5: "Who owns the home?",
  q5opts: { single: "Just me", married: "My spouse and me", other: "Me with other co-owners" },
  note: 'Texas allows one homestead per family. If you answer "Yes" to another homestead, we\'ll pause and email you before doing anything.',
  yes: "Yes", no: "No",
};

// copy/claim_page.md — Step 3 · SPEC-06 §3 (pre-check sentences) · SPEC-07 §02 screen 3 for the title and hints
export const LICENSE = {
  title: "Texas driver's license or DPS ID",
  intro: (situs: string) => `Texas law requires a copy with the application, and the address on it must match ${situs}.`,
  precheckTitle: "Quick check (optional)",
  precheckHelp: "Type the address exactly as it appears on your license and we'll tell you right away whether it matches the property.", // NEW
  nameLabel: "Name as on your license",
  addressLabel: "Address as printed on your license",
  zipLabel: "ZIP",
  precheckMatch: "Matches the property.",
  precheckMismatch: "Doesn't match — you'll need to update it at DPS before TCAD will approve. You can still continue and fix it after.",
  front: "Take a photo of the front",
  back: "Back (optional)",
  cameraHint: "Lay the card flat in good light. HEIC converted automatically.", // SPEC-07
  privacy: "Stored encrypted, deleted 30 days after filing. ID numbers confidential under Tax Code §11.48.", // SPEC-07 (short form of claim_page.md's privacy line)
  mismatchCallout: "Address on your license doesn't match? No problem — you can update it online at the Texas DPS in about 10 minutes (we'll send you the link). We'll hold your claim until it's updated; nothing is filed until then.",
  fileTooBig: "License photo must be a JPEG/PNG/WebP/PDF under 15 MB.", // API error wording
  converting: "Converting photo…", // NEW
  chosen: (name: string) => `Photo added · ${name}`, // NEW
  retake: "Retake", // NEW
};

// copy/claim_page.md — Step 4 · SPEC-07 §02 screen 4
export const CONTACT = {
  title: "Where should we send updates?",
  name: "Name (as on your ID)",
  namePlaceholder: "Full name",
  email: "Email",
  emailPlaceholder: "you@example.com",
  phone: "Mobile (optional, for status texts)",
  phonePlaceholder: "(512) 555-0100",
  note: "We only use this to send status updates and your completed application. No marketing.",
};

// copy/claim_page.md — Step 5 (the disclosure block is compliance copy and stays verbatim; SPEC-07 supplies the title)
export const SIGN = {
  title: "What we do, what you pay",
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
  agreeFree: `I understand I can file for free myself and am choosing ${BRAND}.`,
  sigLabel: "Type your full legal name to sign",
  sigPlaceholder: "Type your full legal name",
  submit: "Sign and submit",
  sending: "Sending…",
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
  replyFailed: "Couldn't send. Please try again.", // NEW
  confirmTitle: "Please confirm what's on your license", // NEW
  confirmHelp: "We couldn't read part of your photo clearly. Correct anything that's wrong, then confirm. The photo stays on file — Texas law requires a copy of the license with the application.", // NEW (SPEC-06 §4)
  confirm: "Confirm and re-check",
  errorTitle: "We hit a snag", // rule table processing_error (customer sentence supplies the body)
  continue: "Continue",
  status: "Claim status",
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
  uploading: "Uploading…",
  failed: "Upload failed. Please try again.",
};

// SPEC-03 §1 — the card step is rendered only when NEXT_PUBLIC_STRIPE_ENABLED=true (implemented in Task 3)
export const CARD = {
  title: "Save a card for the 25% fee",
  body: "Nothing is charged until we see your refund arrive, and we'll email you 3 business days before.",
  skip: "Skip for now",
};

// copy/claim_page.md — Confirmation screen · SPEC-07 §02 screen 6 for the title shape
export const DONE = {
  eyebrow: "Done",
  title: (first: string | null) => first ? `We have everything, ${first}.` : "We have everything.",
  intro: "Here's what happens next:",
  steps: [
    "Within minutes we check your ID against the appraisal record and prepare your application. You'll get an email with a copy to review.",
    'Once you say "go," we submit it to the Travis Central Appraisal District. They typically take 30–90 days.',
    "If approved, the Travis County Tax Office mails your refund check (or applies it to your account) within about 60 days. We invoice 25% then — never before.",
  ],
  questions: `Questions? Reply to any of our emails or write ${SUPPORT_EMAIL}.`,
  status: "See my claim status", // SPEC-07
};

// /claim/[code]/status — plain-English state. Headlines from SPEC-07 §10 ("Status → copy mapping"); bodies NEW, derived
// from docs/RUNBOOK.md §9.4 meanings (unchanged since SPEC-04b) — the API status enum is the key.
export const STATUS: Record<string, { title: string; body: string }> = {
  none: { title: "We haven't received your application yet.", body: "Open your claim page to see your estimate and get started." },
  submitted: { title: "We have your application.", body: "We're checking your ID against the appraisal record and preparing your application." },
  processing: { title: "We have your application.", body: "We're checking your ID against the appraisal record and preparing your application." },
  ready_to_submit: { title: "Your application is ready to review.", body: 'Check the PDF, then reply "go" to our email and we\'ll submit it to the Travis Central Appraisal District.' },
  needs_dl_update: { title: "We need one thing from you.", body: "The address on your license doesn't match the property yet. Update it at the Texas DPS, then upload the new license from your claim page." },
  needs_review: { title: "We need one thing from you.", body: "Something on your ID didn't line up with the appraisal record. We'll email you; nothing has been filed and you owe nothing." },
  filed: { title: "Submitted to TCAD.", body: "The Travis Central Appraisal District may take up to 90 days. If they ask for anything else, we'll handle it and let you know. Nothing is owed until a refund is actually issued." },
  approved: { title: "Approved by TCAD.", body: "The Travis County Tax Office issues refunds within about 60 days of approval. We'll email you when we see it." },
  refunded: { title: "Your refund has been issued.", body: "Check your email for the itemized invoice." },
  paid: { title: "Your refund has been issued.", body: "Thank you. Your bill going forward should be lower every year — that part is all yours." },
  denied: { title: "TCAD denied the application.", body: "You owe nothing. We've emailed your options." },
  withdrawn: { title: "Cancelled.", body: `Nothing was filed and nothing is owed. Questions: ${SUPPORT_EMAIL}.` },
};

// SPEC-07 §10 — the portal page
export const PORTAL = {
  tabs: [["My claims", "#claim"], ["Documents", "#documents"], ["Messages", "#messages"], ["Billing", "#billing"]] as Array<[string, string]>,
  service: "Homestead refund",
  stages: ["Received", "ID checked", "You approved", "Submitted to TCAD", "TCAD decision", "Refund issued"],
  expected: ["", "", "", "", "30–90 days", "~60 days after"],
  documents: "Documents",
  packet: "Form 50-114 (as submitted)",
  packetReady: "Form 50-114 (ready to review)",
  packetPending: "Form 50-114",
  packetPendingNote: "Prepared after your ID check",
  pdf: "PDF",
  agreement: "Service agreement",
  view: "View",
  license: "Driver's license",
  licenseNote: "Purged 30 days after filing",
  messages: "Messages",
  noMessages: "Nothing yet. We email you at every step.",
  send: "Send a message",
  estimate: "Estimate",
  yearRow: (y: number) => `Tax year ${y}`,
  fee: "Fee if refunded in full (25%)",
  billing: "Billing",
  noCard: "No card on file. Add one and we'll charge the 25% only after the refund is issued, with 3 business days' notice.",
  card: "A card is on file. We charge the 25% only after the refund is issued, with 3 business days' notice.",
  addCard: "Add a card",
  addCardSoon: "Card on file arrives with SPEC-03; until then we invoice by email.", // NEW
  other: "Other properties?",
  otherBody: "Add another Travis County property and we'll check it for missing exemptions.",
  addProperty: "Add a property",
  back: "Back to my claim",
  notFound: "We couldn't find a claim for that code.",
  empty: "No claims yet",
  emptyBody: "Open the link from your letter, or check an address.",
  checkAddress: "Check an address",
  signInTitle: "Your claim code is your sign-in", // NEW
  signInBody: "There is no password. The code printed on your letter opens your claim, your documents and your status.", // NEW
};

// SPEC-07 §11 — claim-code entry
export const CODE_PAGE = {
  title: "Got a letter from us?",
  body: "Enter the claim code printed above your address. It opens the estimate we prepared for your property.",
  label: "Claim code",
  hint: "Letters and numbers only. We'll add the dashes.",
  open: "Open my estimate",
  noLetter: "No letter?",
  byAddress: "Check by address instead",
  notFound: "We can't find that code. Check the letter for O vs 0, or try your address.",
  tryAgain: "Try again",
  foundTitle: "Is this your property?",
  foundAccount: (masked: string, owner: string) => `TCAD account ${masked} · Owner of record: ${owner}`,
  foundEstimate: (amount: string) => `Estimated refund: about ${amount}`,
  yes: "Yes, show my estimate",
  notMine: "Not my property",
  fine: "Nothing is filed until you sign. Filing yourself is free.",
  whyTitle: "Why we sent you a letter",
  whyBody: "Public appraisal records show no homestead exemption on your property. Texas allows a two-year late filing. You can do it yourself for free, or we can.",
  alreadyClaimed: "This code already has a claim. Open it to see the status.", // NEW
  openStatus: "See my claim status",
};

export const ERRORS = {
  notFound: "We couldn't find that claim code.",
  notFoundHelp: `Check the code printed on your letter (it looks like CB-XXXX-XXXX) and try again, or email ${SUPPORT_EMAIL} with your property address.`, // docs/claim.html
  offline: "We couldn't connect. Please check your connection and try again.", // docs/claim.html (adapted)
  generic: "Something went wrong saving your claim. Please try again.", // API error wording
  rateLimited: "This page has been opened many times from your connection in the last hour. Please wait a little while and try again.", // NEW
  retry: "Try again",
};
