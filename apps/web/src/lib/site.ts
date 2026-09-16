// Marketing-site copy, verbatim from the SPEC-07 design handoff (docs/specs/SPEC-07-website-redesign.md — the hi-fi
// file `Clean Bill Final.dc.html`, whose copy the handoff calls final). Dollar figures are the handoff's illustrative
// placeholders (a worked example, labelled as such on the page), never a live estimate. Anything not in the handoff is
// marked NEW. The copy rules at the end of SPEC-07 apply to every string here.
import { BRAND, SUPPORT_EMAIL } from "./copy";

export const NAV = {
  homeowners: "Homeowners",
  homeownersMenu: [["How it works", "/how-it-works"], ["Homestead refunds", "/"], ["Exemptions", "/exemptions"], ["Appeals", "/appeals"]] as Array<[string, string]>,
  links: [["Businesses", "/businesses"], ["Pricing", "/pricing"], ["FAQ", "/faq"], ["About", "/about"]] as Array<[string, string]>,
  signIn: "Sign in",
  getStarted: "Get started",
  menu: "Menu",
  close: "Close",
};

export const HOME = {
  eyebrow: "Property-tax refunds · Travis County",
  h1: "Money you're already owed. We go get it.",
  lead: "Missed your homestead exemption? Texas allows a two-year look-back. We prepare and file the late application, track it, and charge 25% only once the refund is in your hands.",
  stats: [["2 years", "of refund available"], ["$0", "if no refund is issued"], ["100%", "of future savings stay yours"]] as Array<[string, string]>,
  card: {
    title: "Start with either",
    address: "Home address",
    addressPlaceholder: "Street, city, ZIP",
    or: "or",
    code: "Claim code from your letter",
    cta: "See my estimate",
    fine: "Free to check · Nothing is filed until you sign",
  },
  photo: "[ photo: Austin neighborhood street, warm late light — or product screenshot of the estimate ]",
  howTitle: "From address to refund check",
  howSub: "You handle ten minutes on your phone. We handle the appraisal district.",
  steps: [
    ["Check", "We read the public appraisal record and estimate your refund, rounded down."],
    ["Confirm", "Five eligibility questions, a photo of your Texas license, and an e-signature."],
    ["File", "We prepare Form 50-114 with the late years, you say go, we submit and track it with TCAD."],
    ["Refund", "The Tax Office pays you. We invoice 25% afterward — never before."],
  ] as Array<[string, string]>,
  fee: {
    title: "One fee. Charged once. Only after you're paid.",
    body: "25% of the refund you actually receive, invoiced after the Travis County Tax Office issues it. Nothing up front, nothing if the application isn't approved, and nothing on the lower bills you'll get every year afterward.",
    cta: "See pricing",
    rows: [["Refund issued by Tax Office", "$2,300"], [`${BRAND} fee (25%)`, "$575"], ["You keep", "$1,725"], ["Future annual savings — our fee", "$0"]] as Array<[string, string]>,
  },
  diy: {
    title: "You can do this yourself, for free.",
    body: "Form 50-114 is on traviscad.org. What you pay us for is the finding, the paperwork, the address-match check, the follow-up with the district, and the tracking until the money lands. Choose whichever you prefer.",
    us: [BRAND, "25% of refund, after it's paid", "We do everything; you sign"],
    self: ["File yourself", "Free", "Find the form, gather documents, track it"],
  },
  alsoTitle: `Also from ${BRAND}`,
  also: [
    { eyebrow: "Homeowners", title: "Property-tax appeals", body: "We protest overassessed values with comparable-sales evidence. Pay only if your bill goes down.", href: "/appeals", sand: false },
    { eyebrow: "Homeowners", title: "Other exemptions", body: "Over-65, disabled person, and disabled veteran exemptions you may already qualify for.", href: "/exemptions", sand: false },
    { eyebrow: "Businesses", title: "Operate your business with a clean bill of health", body: "Portfolio tax reviews and bill audits, line by line, for overcharges and unclaimed credits.", href: "/businesses", sand: true },
  ],
};

// The address forms have no instant lookup behind them (ADR 0018): we take the address and an e-mail and answer by
// e-mail. These sentences are NEW (not in the handoff), written to the SPEC-07 copy rules.
export const INQUIRY = {
  emailLabel: "Where should we send what we find?",
  emailPlaceholder: "you@example.com",
  addressLabel: "Home address",
  send: "Send",
  sending: "Sending…",
  doneTitle: "Got it.",
  doneBody: (address: string) => `We'll look up ${address || "your property"} in the public appraisal record and email you what we find. Nothing is filed, and there's nothing to pay. You can also check for yourself at traviscad.org/property-search.`,
  doneBusiness: "Thanks. We'll reply by email within a few business days to set up the review.",
  errorAddress: "Please enter the property's street address.",
  errorEmail: "Please enter a valid email address.",
  errorCompany: "Please enter your company name.",
  errorNetwork: "We couldn't send that. Please check your connection and try again.",
  errorRate: "Too many requests from your connection. Please try again in an hour.",
  fine: `Private company, Austin, Texas. Not affiliated with any government agency. Questions: ${SUPPORT_EMAIL}.`,
};

export const PRICING = {
  h1: "25% of the refund. Nothing else.",
  lead: "No sign-up fee, no minimum, no charge for a denied application, and no cut of the lower bills you'll get every year afterward.",
  exampleEyebrow: "Worked example",
  example: [
    { label: "Refund, tax year 2024", value: "$1,100" },
    { label: "Refund, tax year 2025", value: "$1,200" },
    { label: "Refund issued by Tax Office", value: "$2,300", bold: true },
    { label: `${BRAND} fee, 25%`, value: "−$575", teal: true },
    { label: "You keep", value: "$1,725", keep: true },
    { label: "Lower bill every year going forward", value: "~$1,300/yr · 100% yours", muted: true },
  ],
  exampleNote: "Illustrative. Your figures come from your appraisal record and current tax rates, rounded down.",
  cards: [
    ["When you're invoiced", "After the Travis County Tax Office issues the refund, we email an itemized invoice due within 30 days."],
    ["Card on file (optional)", "Save a card during signup and we charge it once we see the refund arrive, with an email three business days before."],
    ["Cancel any time before submission", "No cost. Nothing is filed until you review the completed form and say go."],
  ] as Array<[string, string]>,
  free: ["Filing yourself is free", "Form 50-114 at traviscad.org. We'll always tell you so."],
  compareTitle: "Compare",
  compareHead: ["File yourself", "Typical flat-fee service", BRAND],
  compare: [
    ["Upfront cost", "$0", "Paid regardless of outcome", "$0"],
    ["If no refund is issued", "Your time", "Fee still owed", "$0"],
    ["Paperwork, address check, TCAD follow-up", "You", "Varies", "Us"],
    ["Fee on future annual savings", "—", "Sometimes", "Never"],
  ],
};

export const HOW = {
  h1: "How a missed exemption turns into a refund check",
  lead: "Texas Tax Code §11.431 lets a homeowner file the residence homestead exemption up to two years late. When TCAD approves it, the Tax Office refunds what you overpaid for those years. Here's our part.",
  steps: [
    { n: 1, title: "Check", timing: "2 minutes · you", body: "Enter your address or the claim code from our letter. We read the public appraisal record, confirm no homestead exemption is on file, and estimate the refund per taxing unit (Austin ISD, City of Austin, Travis County, ACC, Central Health). Figures are rounded down.", shot: "[ screenshot: estimate card ]" },
    { n: 2, title: "Confirm", timing: "~8 minutes · you", body: "Answer five eligibility questions, photograph your Texas driver's license (the address must match the property; we tell you instantly if it doesn't and how to fix it at DPS), add contact details, and sign electronically. The fee is disclosed before you sign.", shot: "[ screenshot: license step ]" },
    { n: 3, title: "Review and file", timing: "Same day · us, then you", body: "We check your ID against the appraisal record and prepare Form 50-114 with the late-application years. You get the PDF by email; reply “go” and we submit it to TCAD and handle any follow-up from the district. Nothing is filed without your go.", shot: "[ screenshot: ready-to-review email ]" },
    { n: 4, title: "Refund, then invoice", timing: "30–90 days TCAD · ~60 days Tax Office", body: "TCAD approves, the Travis County Tax Office issues the refund to the person who paid the tax, and your bill drops every year after. We invoice 25% of the refund once we see it issued. If it's denied, you owe nothing and we email your options.", shot: "[ screenshot: status timeline ]" },
  ],
};

// FAQ: questions from the handoff; the first answer is the handoff's. The other answers are NEW, assembled from the
// compliance-reviewed sentences in copy/*.md (agreement §3–§5, §8; followups.md; claim_page.md) and listed in the PR.
export const FAQ = {
  h1: "Questions",
  categories: [["legit", "Is this legitimate?", "Legitimacy"], ["fees", "Fees and payment", "Fees"], ["process", "The process", "Process"], ["id", "Your ID and privacy", "ID and privacy"], ["other", "Appeals and other exemptions", "Appeals"]] as Array<[string, string, string]>,
  items: [
    { cat: "legit", q: "Is this a scam?", a: "Fair question. Three things you can verify yourself: look up your address at traviscad.org/property-search and check for a missing “HS” flag; TCAD's site confirms late homestead applications up to two years back; and you can file for free, while we charge only if the Tax Office issues a refund. We're a private company in Austin, not a government agency." },
    { cat: "fees", q: "What happens if I don't get a refund? Do I owe anything?", a: "Nothing. Our fee is 25% of the property-tax refund you actually receive, and if no refund is issued, you owe nothing. We never charge before a refund is issued, and we never charge on approval or on a reply." },
    { cat: "fees", q: "Can I do this myself?", a: "Yes. Filing Form 50-114 with TCAD is free, and you do not need anyone's help to do it. If you'd rather we handle it, what you pay us for is the finding, the paperwork, the address-match check, the follow-up with the district, and the tracking until the money lands." },
    { cat: "fees", q: "What exactly does the 25% cover?", a: "Preparing your Form 50-114 with the late-application years, submitting it as you direct, tracking it with TCAD, and handling any follow-up questions from the district. After the Tax Office issues your refund, we send an itemized invoice showing each taxing unit's refund and our 25%." },
    { cat: "fees", q: "Do you take a cut of my future savings?", a: "No. No fee applies to the lower tax bills you receive in future years, to any current-year bill reduction, or to any exemption you already had. The fee is only on the refund for the late years." },
    { cat: "process", q: "How long does it take?", a: "About ten minutes on your phone to sign. We prepare your application the same day and email it for your review. After you say go, TCAD typically takes 30–90 days, and the Tax Office issues approved refunds within about 60 days after that." },
    { cat: "id", q: "Why do you need my driver's license?", a: "Texas law requires a copy of your Texas driver's license or DPS ID with a homestead application, and the address on it must match the property. Your ID is used only to prepare your application. It is stored encrypted and deleted 30 days after your application is filed. ID numbers are confidential under Texas Tax Code §11.48." },
    { cat: "id", q: "The address on my license doesn't match. Now what?", a: "You can update it online at the Texas DPS in about 10 minutes; we send you the link. We hold your claim until it's updated and nothing is filed until then. When you have the confirmation, upload a photo of it and we finish your application the same day." },
    { cat: "other", q: "How is a property-tax appeal different from an exemption?", a: "An exemption removes value from taxation permanently and can be refunded two years back. An appeal lowers this year's value. If you're missing a homestead exemption, we file that first; it's the bigger, surer win." },
    { cat: "other", q: "Do you work outside Travis County?", a: `Not yet. Today we read the Travis Central Appraisal District's records and file with TCAD. If your home is in another county, write ${SUPPORT_EMAIL} and we'll tell you when we get there. Every appraisal district accepts the free late application under Tax Code §11.431.` },
  ],
};

export const EXEMPTIONS = {
  h1: "Exemptions you may already qualify for",
  lead: "An exemption removes part of your home's value from taxation. Most are never applied automatically. We check the record and file what's missing.",
  searchPlaceholder: "Enter your address to check",
  search: "Check",
  cards: [
    { title: "Residence homestead", pill: "Refund available", body: "For the home you own and live in on January 1. Removes a portion of value from school and local taxes and caps annual appraisal growth at 10%. Can be filed up to two years late for a refund of tax already paid.", link: "Check my address", highlight: true },
    { title: "Over-65", body: "Additional exemption plus a ceiling on school taxes from the year you turn 65. Requires a homestead exemption on the same property.", link: "Learn more" },
    { title: "Disabled person", body: "For homeowners who meet the Social Security definition of disability. Similar benefits to Over-65; you may claim one or the other, not both.", link: "Learn more" },
    { title: "Disabled veteran", body: "Partial exemption scaled to VA disability rating; a 100% rating can exempt the full homestead value.", link: "Learn more" },
  ],
  needTitle: "What you'll need",
  needSub: "Everything fits on a phone screen.",
  need: ["Texas driver's license or DPS ID with the property address", "The date you moved in", "Whether you or your spouse claim a homestead elsewhere", "About ten minutes"],
  learnMoreUrl: "https://comptroller.texas.gov/taxes/property-tax/exemptions/",   // NEW: the Comptroller's exemption guide, until we write our own pages
};

export const APPEALS = {
  eyebrow: "Property-tax appeals · Travis County",
  h1: "Think your appraisal is too high? Protest it.",
  lead: "Every spring TCAD sets a value for your home. If it's above what the home would actually sell for, you're overpaying. We build the comparable-sales evidence, file the protest, and argue it. You pay only if your bill goes down.",
  card: { title: "Check your appraisal", placeholder: "Home address", cta: "See if a protest makes sense", fine: "Free to check · Protest deadline May 15 (or 30 days after your notice)" },
  steps: [
    ["We pull the evidence", "Recent sales of comparable homes, equity comps from your neighborhood, and any condition issues you tell us about."],
    ["We file and argue", "Protest filed before the deadline, informal review with a TCAD appraiser, then the Appraisal Review Board hearing if needed. You don't attend."],
    ["You pay on results only", "Our fee is 25% of the first-year tax savings from the reduction. No reduction, no fee."],
  ] as Array<[string, string]>,
  both: {
    title: "Appeal or exemption? Often both.",
    body: "An exemption removes value from taxation permanently and can be refunded two years back. An appeal lowers this year's value. If you're missing a homestead exemption, we file that first; it's the bigger, surer win.",
    exemption: ["Exemption", "Two-year refund + lower bill every year", "Fee: 25% of refund"],
    appeal: ["Appeal", "Lower value for this tax year", "Fee: 25% of first-year savings"],
  },
};

export const BUSINESSES = {
  eyebrow: "Businesses and multi-property owners",
  h1: "The tightest, cleanest expense structure possible.",
  lead: "Start with the money you're already owed across your properties. Then let us audit the bills that quietly grow every year: utilities, insurance, telecom.",
  form: { title: "Request a portfolio review", company: "Company", email: "Work email", properties: "Number of properties", bills: "Which bills?", cta: "Request review" },
  bills: [["property_tax", "Property tax"], ["utilities", "Utilities"], ["insurance", "Insurance"], ["telecom", "Telecom"]] as Array<[string, string]>,
  cards: [
    { eyebrow: "Available now", title: "Portfolio exemption and refund review", body: "Every parcel checked for missing exemptions and two-year refunds. Contingency pricing; commercial rates on request.", sand: false },
    { eyebrow: "Available now", title: "Property-tax appeals", body: "Evidence-based protests across a portfolio, filed and argued for you. Pay only on reductions achieved.", sand: false },
    { eyebrow: "Coming next", title: "Bill audits and energy credits", body: "Utility, insurance, and telecom bills audited line by line; energy credits you haven't claimed. Join the waitlist.", sand: true },
  ],
};

export const ABOUT = {
  h1: "We help people and businesses run the cleanest expense structure possible.",
  story: `${BRAND} started in Austin with one observation: thousands of Travis County homeowners pay property tax without the homestead exemption they're entitled to, and nobody tells them. We built the tooling to find them and the process to fix it. Homestead refunds are where we begin. Energy credits and business bill audits come next.`,
  photo: "[ photo: team or Austin office ]",
  principles: [
    ["Private company.", "Austin, Texas. Not affiliated with TCAD, the Tax Office, or any government agency."],
    ["Contingency only.", "We get paid when you get paid. Never on approval, never on a reply."],
    ["Data minimalism.", "ID numbers masked, images purged 30 days after filing."],
    ["No urgency tricks.", "Every letter tells you filing is free, and names who owes the refund."],
  ] as Array<[string, string]>,
};
