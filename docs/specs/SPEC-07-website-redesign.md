# SPEC-07 — Website redesign (Clean Bill, Ownwell-inspired)

*Status: implemented on branch `website-redesign` (2026-09-16) · Source: the design handoff bundle "Website redesign inspired by Ownwell.zip" (`Clean Bill Final.dc.html`, `Clean Bill Wireframes.dc.html`, `screenshots/`, `README.md`) supplied by Charlie on 2026-09-16 · Owner: Claude Code · Related: SPEC-04b, SPEC-06b, SPEC-02, ADR 0012, ADR 0017, ADR 0018.*

The handoff README is reproduced verbatim below; the implementation notes at the end record what was built, what was mapped onto the existing backend, and what needs a business decision.

---

# Handoff: Clean Bill website redesign

## Overview
Full redesign of cleanbillco.com: a Texas (Travis County) property-tax refund service. Clean Bill finds homeowners taxed without their homestead exemption, files the late application (Form 50-114, Tax Code §11.431 two-year look-back), tracks it, and charges 25% of the refund only after the Travis County Tax Office issues it. The redesign covers the marketing site, the claim-code landing, the 5-step signup flow, and the logged-in customer portal.

Target repo: `cponitz/texas-refund-desk` (see `github.md` in the project). Existing routes to preserve: `/claim/[code]`, status enums, HEIC upload handling, compliance copy.

## About the design files
Files in this bundle are **design references built in HTML** (`.dc.html`). They show intended look and behavior; they are not production code. Recreate them in the target codebase using its existing framework, component patterns and libraries. If no frontend framework is established, choose one appropriate for a Next.js-style marketing site + authenticated portal. No framework is mandated by this spec.

- `Clean Bill Final.dc.html` — hi-fi source of truth. Desktop (1280) pages 01–11, component sheet, mobile (390) M01–M11. Open in a browser; pan/zoom canvas.
- `Clean Bill Wireframes.dc.html` — low-fi structure with inline `// dev notes` (API hooks, states, validation).
- `screenshots/` — PNG of each desktop page, component sheet, and mobile set.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and copy are final. Recreate pixel-close. Dollar figures ($2,300, $1,100, $1,200, $575, $1,725, ~$1,300/yr) and the sample address/account (1207 Wildcat Hollow, TCAD 0412xxxx, J. Rivera, code CB-7Q2K-91MA) are **illustrative placeholders**; bind to real data. Hatched boxes labelled `[ photo … ]` are image slots awaiting real photography.

## Design tokens

### Color
| Token | Hex | Use |
|---|---|---|
| teal | #157A8A | primary buttons, links, active nav, eyebrows, step markers |
| teal-deep | #0E5661 | hover on primary, text on teal tint, estimate amounts |
| navy | #0F3A44 | dark bands (fee section, "what you'll need", done screen, "File yourself" card) |
| teal-tint | #E6F3F5 | callouts, selected choice bg, success pills, estimate box |
| teal-soft | #7FC4CF | eyebrow/step numbers on navy |
| teal-text-on-dark | #C7DCE0 | body text on navy |
| sand | #F2E9DA | secondary tint (businesses "coming next", "other properties") — text #6B4E1E / #5A4A33 |
| page | #F7FAFA | page background |
| card | #FFFFFF | cards, inputs |
| ink | #172026 | headings, primary text, phone bezels |
| body | #33454D | body/lead text, nav links |
| muted | #5A6B72 | secondary text, labels, footer |
| placeholder | #8A9AA1 | input placeholders, inactive steps |
| border | #D4E0E3 | card and input borders |
| hairline | #E1EAEC | dividers, nav bottom border |
| row-tint | #F1F6F7 | table headers, neutral pills |
| success | #1E7B4F | address-match check, approved/refund_issued pill (bg #E3F3EA) |
| error | #B4453A | invalid input border/text; bg #FBF3F2 |
| disabled | #9FC7CE | disabled primary button, dashed upload border |
| canvas (design file only) | #E9EEF0 | not part of the site |

### Typography — DM Sans (Google Fonts, weights 400/500/600/700, opsz axis)
| Style | Size/line | Weight | Tracking | Color |
|---|---|---|---|---|
| Display (home H1) | 68/1.0 | 700 | -0.03em | ink |
| H1 (inner pages) | 52/1.05 | 700 | -0.025em | ink |
| H2 | 36/1.15 (40 on centered home sections, 30–32 in callouts) | 700 | -0.02em | ink (teal-deep in tint callouts) |
| H3 | 20/1.3 | 600 | 0 | ink |
| Lead | 19/1.5 (20 on home) | 400 | 0 | body |
| Body | 15/1.5 | 400 | 0 | muted or body |
| Body-lg | 16–17/1.55 | 400 | 0 | body |
| Nav link | 15 | 500 | 0 | body; active teal |
| Eyebrow | 14 (12 in cards) | 600–700 | 0.08em, uppercase | teal (sand-text for businesses) |
| Stat number | 32 (26 in home hero) | 700 | -0.02em | ink |
| Estimate amount | 48 / 40 (mobile) | 700 | -0.03em | teal-deep |
| Fine print / footer | 13/1.55 | 400 | 0 | muted |
| Mono (claim codes) | ui-monospace, Menlo | 400 | 0.12em when large | ink |

Headline text uses `text-wrap: balance` (H1) or `text-wrap: pretty` (paragraphs). Body uses `-webkit-font-smoothing: antialiased`.

### Spacing, radius, shadow
- Page gutter: 64px desktop, 24px mobile. Section vertical padding: 80–88px desktop, 40–56px mobile.
- Content grid gaps: 64px between hero columns; 20px between cards; 12–14px inside cards.
- Radius: buttons/pills 999px; inputs 12px; small cards 16px; standard cards 20px; section callouts 24px; phone bezel 52px outer / 40px screen.
- Borders: 1px `border` on cards/inputs; 1.5px teal on outline buttons, focused inputs, selected choices, highlighted card.
- Shadows: elevated hero card `0 20px 60px rgba(15,58,68,.10)`; search pill `0 12px 40px rgba(21,122,138,.12)`; focus ring `0 0 0 4px #E6F3F5`; no shadow on standard cards.
- Nav: padding 20px 64px, hairline bottom. Footer: padding 40px 64px, 13px, hairline top.

## Shared components (see component sheet in the hi-fi file)

**Nav** — logo (28px teal circle + "Clean Bill" 19/700 -0.01em) · links: Homeowners ▾, Businesses, Pricing, FAQ, About (15/500 body; active = teal) · right: "Sign in" text link + "Get started" outline button. Homeowners dropdown: How it works, Homestead refunds, Exemptions, Appeals. Mobile (<768): logo + 2-line menu button (44px hit target); links + Get started inside the sheet. Portal nav swaps links for My claims / Documents / Messages / Billing and shows an avatar (32px teal-tint circle, initials 13/700 teal-deep).

**Buttons** — Primary: teal bg, white, 600, radius 999. L = 16px/16×28 padding; M = 15px/11×20. Hover teal-deep; disabled #9FC7CE; focus ring as above. Outline: 1.5px teal border, teal text, 10×20. Neutral outline: 1.5px `border` color, body text. On navy: white bg, navy text, 13×22. Inline link: 14/600 teal with "→".

**Inputs** — 1px border, radius 12, padding 14×16, 15px, placeholder #8A9AA1, bg white. Label above: 13/600 muted, 6px gap. Focus: 1.5px teal + ring. Error: 1.5px #B4453A, bg #FBF3F2, message below 13/600 #B4453A. Search pill: white, 1px border, radius 999, padding 8px 8px 8px 24px, button inside right.

**Choice buttons** (signup) — flex row, gap 8; each 1px border radius 12 padding 12 center 14px; selected = 1.5px teal border + teal-tint bg + 600.

**Checkbox** — 18px, 1.5px teal border, radius 5; checked = teal fill, white check.

**Cards** — Standard: white, 1px border, radius 20, padding 28, gap 12, no shadow. Elevated: + hero shadow. Tint callout: teal-tint bg, no border, radius 20–24, padding 28–56. Dark: navy bg, white text, secondary text #C7DCE0. Sand: #F2E9DA bg.

**Status pill** — 14/600, radius 999, padding 8×14. Map claim status enum: received, id_checked → row-tint/body · ready_to_review, submitted_to_tcad → teal-tint/teal-deep · needs_attention → sand/#6B4E1E · approved, refund_issued → #E3F3EA/#1E7B4F · denied → #FBF3F2/#B4453A · cancelled → row-tint/#8A9AA1.

**Progress** — 6 equal segments, 6px tall, radius 3, gap 8; complete = teal, pending = border color. Signup uses 5 segments at 3px.

**Image placeholder** — `repeating-linear-gradient(135deg,#DCE7EA 0 12px,#E6EEF0 12px 24px)`, mono caption. Replace with real imagery.

**Footer** — one line disclaimer (max-width 640) + links Pricing · FAQ · Service agreement · hello@cleanbillco.com. Mobile: stacks. Disclaimer copy (verbatim): "Clean Bill is a private company in Austin, Texas, not affiliated with any government agency. Estimates come from public appraisal data; the appraisal district decides eligibility. Not legal or tax advice."

## Screens

### 01 Home `/` (desktop 1280 · mobile M01)
- Hero grid 1.2fr/.8fr, gap 64, padding 88 64 80, align end. Left: eyebrow "Property-tax refunds · Travis County"; H1 "Money you're already owed. We go get it."; lead (max-width 560): "Missed your homestead exemption? Texas allows a two-year look-back. We prepare and file the late application, track it, and charge 25% only once the refund is in your hands."; stat row (gap 40): 2 years / of refund available · $0 / if no refund is issued · 100% / of future savings stay yours.
- Right: elevated card "Start with either" — Home address input ("Street, city, ZIP"), "or" divider, Claim code input (mono, "CB-XXXX-XXXX"), primary L "See my estimate", fine print "Free to check · Nothing is filed until you sign". Either field filled enables the CTA; address → lookup; code → `/claim/[code]`.
- Photo slot: margin 0 64, height 420, radius 24.
- "From address to refund check" (H2 40 centered) + sub "You handle ten minutes on your phone. We handle the appraisal district." 4-col timeline: 30px teal numbered circles joined by a 2px hairline (left/right 12%); H3 18 + body 15. Copy: Check / Confirm / File / Refund (see file).
- Fee band (navy, padding 80 64, 2-col): H2 "One fee. Charged once. Only after you're paid." + paragraph + white button "See pricing"; right: ledger card (rgba white .06 bg, .14 border, radius 16) rows Refund issued $2,300 · Clean Bill fee (25%) $575 · You keep $1,725 (18/700) · Future annual savings — our fee $0.
- Tint callout (margin 88 64 0, radius 24, padding 56, 2-col): H2 teal-deep "You can do this yourself, for free." + paragraph; right 2 cards: **Clean Bill** (white) "25% of refund, after it's paid / We do everything; you sign" then **File yourself** (navy) "Free / Find the form, gather documents, track it".
- "Also from Clean Bill" (H2 40 centered), 3 cards with eyebrows: Homeowners · Property-tax appeals; Homeowners · Other exemptions; Businesses (sand text) · "Operate your business with a clean bill of health".
- Footer.
- Mobile: single column; hero card under lead; stats 3-col at 22px; timeline becomes 30px marker + text rows; ledger keeps 3 rows; callout cards stack.

### 02 Signup flow `/claim/[code]` (mobile-first, 6 screens at 360×780)
Persistent: status bar, 5-segment progress (3px), eyebrow "STEP n OF 5 · NAME" 12/700 teal 0.06em, title 22/700, content scroll area, pinned CTA (primary L, full width) above home indicator, hairline above CTA.
1. **Estimate** — address, "TCAD account 0412xxxx · Owner of record: J. Rivera", teal-tint box (Estimated refund / $2,300 40px / per-year lines / "Plus ~$1,300 lower bill every year (100% yours)"), deadline note "The 2024 year can only be claimed until Jan 31, 2027.", navy notice "You can file this yourself for free at traviscad.org (Form 50-114). If you'd rather we handle it, continue." CTA Continue.
2. **Eligibility** — five questions, choice buttons: owned & lived on Jan 1, 2024 (Yes / No, moved in later); primary residence today (Yes/No); homestead on other property (No/Yes); homestead on previous home (No/Yes); who owns (Just me / My spouse and me / Me with other co-owners — stacked). CTA disabled until all answered. A "No" on Q1 or Q2 branches to an ineligible screen (copy TBD).
3. **Your Texas ID** — explainer, optional "Quick check" address field with instant match indicator (16px green dot + "Matches the property." in #1E7B4F 600; mismatch = error style + DPS instructions), dashed upload zone (2px dashed #9FC7CE, radius 16) "Take a photo of the front" + "Lay the card flat in good light. HEIC converted automatically.", back optional, privacy line "Stored encrypted, deleted 30 days after filing. ID numbers confidential under Tax Code §11.48." Accept HEIC/JPG/PNG; convert HEIC server- or client-side.
4. **Contact** — Name (as on your ID), Email, Mobile (optional, for status texts); note "We only use this to send status updates and your completed application. No marketing."
5. **Review and sign** — summary box (row-tint): "What we do:" / "What you pay:" copy verbatim from file; three checkboxes (Service Agreement; e-sign consent; "I understand I can file for free myself and am choosing Clean Bill."); signature input (italic 20px placeholder "Type your full legal name"). CTA "Sign and submit" disabled until 3 checks + name ≥ 2 words. Store typed name, timestamp, IP, agreement version.
6. **Done** (navy screen) — 44px teal check circle, eyebrow DONE (#7FC4CF), "We have everything, Jordan." 28/700, three numbered next steps, white CTA "See my claim status" → portal.

### 03 Pricing `/pricing`
H1 "25% of the refund. Nothing else." + lead. 2-col: worked-example ledger card (rows 16px, 12px vertical padding, hairlines; fee row teal "−$575"; "You keep" 20px; forward savings muted) with footnote; right stack of 4 cards (When you're invoiced · Card on file (optional) · Cancel any time before submission · Filing yourself is free [tint]). "Compare" table: grid 1.4fr 1fr 1fr 1fr, header row row-tint, Clean Bill column header teal-tint/teal-deep 700; rows Upfront cost · If no refund is issued · Paperwork, address check, TCAD follow-up · Fee on future annual savings. Mobile: table becomes stacked label + 3-col value rows.

### 04 How it works `/how-it-works`
H1 "How a missed exemption turns into a refund check" + §11.431 lead. Four rows grid 200px / 1fr / 420px, padding 36 0, hairline top; left: STEP n (13/700 teal), title 22/600, timing 13 muted; middle paragraph 16/1.55; right 180px screenshot slot. Mobile: single column, step/timing on one line, screenshot under.

### 05 FAQ `/faq`
Grid 300px / 1fr, gap 64. Left sticky: H1 "Questions" 44 + category list (15/500 muted, active teal): Is this legitimate? · Fees and payment · The process · Your ID and privacy · Appeals and other exemptions. Right: accordion cards (white, radius 16, padding 22 24, question 18/600, "+" muted right); first item expanded. Mobile: horizontal scrolling category chips (selected teal bg white text) replace the rail; use a right-edge fade. Questions listed in file; answers to be provided.

### 06 Exemptions `/exemptions`
Hero 2-col align end: H1 "Exemptions you may already qualify for" + lead; right search pill "Enter your address to check" + "Check". 2×2 cards: Residence homestead (1.5px teal border, pill "Refund available" teal-tint) · Over-65 · Disabled person · Disabled veteran, each with "→" link. Navy callout "What you'll need" list (dash #7FC4CF). Mobile: search stacks under lead; cards single column.

### 07 Appeals `/appeals` (new)
Hero 1.1fr/.9fr: eyebrow "Property-tax appeals · Travis County"; H1 "Think your appraisal is too high? Protest it."; lead; elevated card "Check your appraisal" (address input, primary "See if a protest makes sense", fine print "Free to check · Protest deadline May 15 (or 30 days after your notice)"). 3 cards 01–03 (We pull the evidence / We file and argue / You pay on results only — fee 25% of first-year savings). Tint callout "Appeal or exemption? Often both." with Exemption vs Appeal mini-cards.

### 08 Businesses `/businesses`
Hero 1.1fr/.9fr: eyebrow "Businesses and multi-property owners"; H1 "The tightest, cleanest expense structure possible."; lead. Right card "Request a portfolio review": Company, Work email, Number of properties, bill-type multi-select (Property tax · Utilities · Insurance · Telecom — chips on mobile), primary "Request review" → POST lead. 3 cards: Available now · Portfolio exemption and refund review; Available now · Property-tax appeals; Coming next (sand card) · Bill audits and energy credits (waitlist).

### 09 About `/about`
2-col: H1 "We help people and businesses run the cleanest expense structure possible." + story paragraph; right photo slot 260px + 2×2 principle cards (Private company. / Contingency only. / Data minimalism. / No urgency tricks.) 14px, radius 14, padding 18.

### 10 Customer portal `/app` (authenticated)
Portal nav. Grid 1fr / 360px, gap 32. Left: claim header (13 muted "Homestead refund · CB-7Q2K-91MA", H1 32 address, status pill right); status card (22/600 status sentence + explanatory copy; 6-segment progress with labels Received · ID checked · You approved · Submitted to TCAD · TCAD decision · Refund issued, dates 12px, current label teal, pending #8A9AA1); 2 cards Documents (Form 50-114 PDF, Service agreement PDF, Driver's license "Purged 30 days after filing") and Messages (list + "Send a message →"). Right: Estimate card ($2,300 36px teal-deep, per-year, "Fee if refunded in full (25%) $575"); Billing card (copy + outline "Add a card"); sand card "Other properties?" + "Add a property →". Mobile: horizontal tab row under nav, cards stack in order status → estimate → documents → billing.

Status → copy mapping (status card headline): received "We have your application." · id_checked "ID verified." · ready_to_review "Your application is ready to review." · submitted_to_tcad "Submitted to TCAD." · needs_attention "We need one thing from you." · approved "Approved by TCAD." · refund_issued "Your refund has been issued." · denied "TCAD denied the application." · cancelled "Cancelled."

### 11 Claim-code entry `/claim` (new)
Three states shown side-by-side in the file; one screen in production. Card (elevated, padding 32): H1 30 "Got a letter from us?"; explainer; label "Claim code" + mono input (20px, 0.12em, centered, placeholder "CB-____-____"); primary "Open my estimate"; "No letter? Check by address instead". Error state: 1.5px #B4453A border, #FBF3F2 bg, message "We can't find that code. Check the letter for O vs 0, or try your address." CTA "Try again". Found state: H2 "Is this your property?" + teal-tint box (address, masked account, owner, "Estimated refund: about $2,300"), primary "Yes, show my estimate", neutral outline "Not my property", fine print "Nothing is filed until you sign. Filing yourself is free." Mobile adds a tint card "Why we sent you a letter".

## Interactions & behavior
- Inputs: input mask for claim code (uppercase, auto-dash, normalize O→0 and I→1). Address field: autocomplete against Travis County addresses; on select, fetch appraisal record.
- Buttons: hover teal-deep, 150ms ease; focus ring 4px teal-tint; disabled #9FC7CE, no pointer.
- Accordion (FAQ): one open at a time, 200ms height transition, "+" rotates to "×".
- Nav dropdown: hover/click on Homeowners; mobile sheet slides from right, 250ms.
- Signup: progress persists per step; back navigation allowed; state saved server-side per claim so the user can resume from the emailed link.
- Upload: camera capture on mobile (`capture="environment"`), preview thumbnail, HEIC → JPEG, max 10MB, retry on failure.
- Address-match quick check: debounce 400ms, compare normalized license address to property situs address, show match/mismatch inline.
- Loading: skeleton blocks in card shapes (row-tint bg, radius matching). Empty portal: "No claims yet" card with "Check an address" CTA.
- Errors: inline under field; form-level banner (#FBF3F2 bg, #B4453A text) for network failures.
- Responsive: breakpoints 1280 (design), ≤1024 collapse to 2 columns where 3–4, ≤768 mobile layouts as M01–M11. Never fixed heights on text containers.

## State management
- Claim: `{ code, address, tcadAccount, ownerName, estimate: { total, years: [{year, amount}], forwardSavings }, status: enum, timeline: [{status, at}], eligibility: {q1..q5}, id: {frontUrl, backUrl, addressMatch}, contact, signature: {name, at, ip, agreementVersion}, billing: {cardOnFile} }`.
- Status enum (existing): received · id_checked · ready_to_review · submitted_to_tcad · needs_attention · approved · refund_issued · denied · cancelled.
- Data fetching: `GET /api/claims/:code` (public, rate-limited) · `POST /api/lookup` (address → record + estimate) · `POST /api/claims/:code/eligibility|id|contact|sign` · `GET /api/me/claims` (auth) · `POST /api/leads/portfolio` (businesses form) · `POST /api/billing/card`.

## Copy rules (must survive)
Every page states that filing yourself is free. Fee language is always "25% of the refund you actually receive, invoiced after the Tax Office issues it"; never "savings" for the homestead product. Always "private company … not affiliated with any government agency". Never urgency language other than the factual deadline ("The 2024 year can only be claimed until Jan 31, 2027.").

## Assets
- Font: DM Sans via Google Fonts (`family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700`).
- Logo: placeholder 28px teal circle; replace with final mark.
- Photography: all `[ photo … ]` slots need real imagery (Austin streets, team, product screenshots of the estimate/license/status screens).
- Icons: none required beyond ✓, +, →, hamburger lines; use the codebase's icon set if one exists.

## Files
- `Clean Bill Final.dc.html` (+ `support.js`) — hi-fi, all pages and components
- `Clean Bill Wireframes.dc.html` — low-fi + dev notes
- `screenshots/*.png`

---

## Implementation notes (2026-09-16, branch `website-redesign`, ADR 0018)

**Built as specified.** Tokens, type, spacing, radii, shadows and copy of screens 01, 03–09 and 11, the signup flow (02)
and the component sheet, desktop and mobile. `apps/web/src/app/globals.css` is the token file; `src/lib/site.ts` the
marketing copy; `src/lib/copy.ts` the claim-flow / portal copy. The smoke test (`eval/web_smoke.py`) covers every page,
the accordion, the claim-code states, the inquiry form and the full signup path.

**Mapped onto what exists (no business decision taken).**

| Handoff | Built | Why |
|---|---|---|
| Brand "Clean Bill", hello@cleanbillco.com | `BRAND` / `SUPPORT_EMAIL` tokens set to the handoff's values | The handoff is the newest instruction; B-09 (Texas Refund Desk) is not amended in `claude/decisions.md`. Two lines flip it back. |
| Claim codes `CB-XXXX-XXXX` | `TRD-XXXX-XXXX` (`CODE_PREFIX`); the mask, O→0 / I→1 normalisation and the mono input are as designed | The prefix is generated by `trd/etl/leads.py`, validated by the claim API and printed on letters. Changing it is its own change. |
| Address → `POST /api/lookup` → instant estimate | Address + e-mail → `POST /claim/inquiry`; we answer by e-mail | An address→claim-code lookup would make a public fact the credential (ADR 0008). Needs a decision before it exists. |
| `/app` authenticated portal, "Sign in" | `/claim/[code]/status` renders the portal layout; "Sign in" and `/app` go to `/claim` | No customer accounts yet (ADR 0017). The claim code is the credential. |
| Status enum `received … cancelled` | The real enum, mapped in `src/lib/status.ts` (`submitted/processing → Received`, `ready_to_submit → Ready to review`, `needs_* → Needs attention`, `filed → Submitted to TCAD`, `refunded/paid → Refund issued`, `withdrawn → Cancelled`) | "Status enums (existing) to preserve." |
| Step 2 short question labels, step 5 short summary, done-screen short steps | The compliance-reviewed sentences from `copy/claim_page.md` (questions, the §41.0051 disclosure block, the three done steps); the handoff's titles, labels, hints and layout around them | CLAUDE.md: `copy/*.md` wording changes only from an approved copy spec; the handoff itself says the compliance copy is preserved. |
| Step 3: one "Quick check" address field | Name, address and ZIP (the API's pre-check takes address + ZIP; the name pre-fills step 4) | SPEC-06 §3 contract. |
| FAQ answers "to be provided" | Written from the compliance-reviewed sentences (agreement §3–§5, §8; followups.md; claim_page.md); the first answer is the handoff's | Listed as `NEW` in `site.ts` for review. |
| "Add a card" (billing card) | Shown only when `NEXT_PUBLIC_STRIPE_ENABLED=true`; otherwise the billing card says we invoice by e-mail | SPEC-03 is not built. |
| `[ photo … ]` slots | The hatched placeholder component | Awaiting photography. |
| Exemption "Learn more →" | The Comptroller's exemption guide (external) | No exemption detail pages in the handoff. |

**Backend added.** `POST /claim/inquiry` + `inquiries` table (migration `20260916150000_inquiries`); the closed-lead
`GET /claim?c` response carries the estimate, first name, card flag, dated timeline and real messages for the portal;
`packet_url` from `ready_to_submit` onward. Details in `docs/ARCHITECTURE.md` §4.1 and §5.8.

**Sentences not in `copy/*.md` (for review).** In `site.ts`: `INQUIRY.*` (the e-mail step and confirmations of the
address forms), the FAQ answers 2–10, `EXEMPTIONS.learnMoreUrl`. In `copy.ts`, marked `NEW`: `LICENSE.precheckHelp`,
`LICENSE.converting`, `LICENSE.chosen`, `LICENSE.retake`, `PORTAL.addCardSoon`, `PORTAL.signInTitle`, `PORTAL.signInBody`,
`CODE_PAGE.alreadyClaimed`, the billing sentence when Stripe is off, and the RESULT/FIX/ERRORS strings already listed
in the SPEC-04b PR.
