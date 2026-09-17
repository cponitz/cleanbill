# Clean Bill — Design system

*SPEC-08 Part C (2026-09-17), ADR 0019. The living version is `/design-system` in the web app (`?theme=brief` for the
alternate palette); this file is the written guide. Brand voice, palette proposal and motif come from
`docs/brand/brand-brief.md`; the default palette and component sheet from `docs/specs/SPEC-07-website-redesign.md`.*

## 1. Principles

From the brand brief (§3, §6, §10). The customer is **prudent**, **in control** and **fair-minded**; the design confirms
that self-image rather than selling to it.

- **Facts, not adjectives.** Every trust claim on a surface is a fact (an address, a statute, a dollar figure). No
  "trusted", "reliable", "expert"; no badges or shields — trust facts are a plain list with hairline rules.
- **No urgency devices.** No countdown, no red, no urgency yellow, no exclamation points, no gradients. The one real
  deadline is stated once, as a date.
- **Lead with the number.** The refund figure (rounded down, `estimator.conservative_display`) is the most prominent
  element on a page that has one; it uses `--color-amount` and tabular figures (in the brief theme).
- **The DIY path has the same weight as the CTA.** "You can do this yourself, for free" is never greyed or buried.
- **Quiet confidence.** Closer to a well-run credit union than a fintech app: white or paper ground, one accent used once
  per screen, generous spacing, no photography until real photography exists (the hatched placeholder stays).
- **The §41.0051 line** lives in the footer of every page and at the top of every letter, bold and legible.

## 2. Tokens — how to use them

Two layers, one file each side:

| Layer | Where | What |
|---|---|---|
| Primitives (theme-independent) | `apps/web/src/styles/tokens.css` | spacing `--space-1…8` (4/8/12/16/24/32/48/64), `--gutter`, radii `--radius-*`, motion `--duration-*`, type scale `--text-*`, `--leading-*`, `--tracking-*`, breakpoints (documentation only), `--font-mono` |
| Primitives (per theme) | `apps/web/src/styles/theme-handoff.css`, `theme-brief.css` | colours (`--brand`, `--brand-deep`, `--brand-dark`, `--brand-tint`, `--brand-soft`, `--brand-on-dark`, `--accent`, `--accent-ink`, `--accent-body`, `--amount`, `--ground`, `--surface`, `--panel`, `--ink`, `--body`, `--muted`, `--placeholder`, `--line`, `--hairline`, `--white`, `--success[-bg]`, `--error[-bg]`, `--disabled`, `--scrim`, `--line-on-dark`, `--photo-a/b`, `--elevation-*`, `--ring-color`) and the type pairing (`--font-sans`, `--font-display`, `--numeric`) |
| Semantics | `tokens.css` | `--color-bg`, `--color-surface`, `--color-ink`, `--color-body`, `--color-muted`, `--color-placeholder`, `--color-primary`, `--color-primary-strong`, `--color-primary-tint`, `--color-primary-soft`, `--color-on-primary`, `--color-dark`, `--color-on-dark`, `--color-on-dark-strong`, `--color-accent`, `--color-accent-text`, `--color-accent-body`, `--color-amount`, `--color-line`, `--color-hairline`, `--color-row-tint`, `--color-success[-bg]`, `--color-error[-bg]`, `--color-disabled`, `--color-scrim`, `--color-line-on-dark`, `--color-photo-a/b`, `--shadow-hero`, `--shadow-pill`, `--ring`, `--font-body`, `--font-heading`, `--font-code`, `--numeric-amount` |

Rules:

1. **Components and JSX read semantic tokens only** — `var(--color-primary)`, never `var(--brand)` and never a hex.
   The lint (`npm run lint:design`, CI job `design-system`) fails the build otherwise, and also fails if a semantic
   token does not resolve in every theme.
2. **Adding a colour** = a primitive in *both* theme files + a semantic alias in `tokens.css` + `python -m trd.brand --sync`
   (the print and e-mail adapters are generated; CI fails when they are stale) + a swatch appears on `/design-system`
   automatically if you add the name to `COLOR_TOKENS` in `components/DesignSystem.tsx`.
3. **Tailwind utilities** (`text-body`, `bg-navy`, `border-teal` …) are aliases of the same semantics, declared in the
   `@theme inline reference` block of `globals.css`. Prefer the component classes; use utilities for one-off layout.
4. **SPEC-07 name → primitive:** teal → `--brand`, teal-deep → `--brand-deep`, navy → `--brand-dark`, teal-tint →
   `--brand-tint`, teal-soft → `--brand-soft`, teal-text-on-dark → `--brand-on-dark`, sand / sand-text → `--accent` /
   `--accent-ink`, page → `--ground`, card → `--surface`, row-tint → `--panel`, border → `--line`.

## 3. Themes (O-13)

| | `handoff` (default) | `brief` |
|---|---|---|
| Source | SPEC-07 design handoff, as built | Brand brief §10 (2026-09-16) |
| Ground / panel | #F7FAFA / #F1F6F7 | #FFFFFF / #F3F6F4 |
| Ink | #172026 | #12261F |
| Primary | teal #157A8A (deep #0E5661) | forest #1E5B45 (deep #164536) |
| Dark band | navy #0F3A44 | the primary green (brief: "full-width panel in the primary green with white text") |
| Accent | sand #F2E9DA | amber tint #F8EEDC; the refund number in amber #9A6B12 (darkened from #C9922E so 48 px text passes 3:1) |
| Type | DM Sans everywhere | Source Serif 4 headings, Inter Tight body / UI, tabular figures on amounts |

`DEFAULT_THEME` in `apps/web/src/app/layout.tsx` is the one-line switch. Every page honours `?theme=handoff|brief`
(remembered in the browser, `localStorage` key `cb-theme`) and the toggle on `/design-system`, so the whole site can be
reviewed in either palette before the decision. Both themes define the same primitive names and both pass the contrast
table in §7; the toggle causes no layout shift (only custom properties change; fonts are pre-hosted by `next/font`).

## 4. Components — when to add one

The component sheet is `apps/web/src/app/globals.css` (`@layer components`), rendered in every state on `/design-system`.
Add a class there when a pattern appears on a second page or has more than one state; a one-off layout stays as
utilities in the page. Every component documents its **anatomy** (in a comment above the class) and its **states**:
default, hover, focus-visible (the `--ring`), disabled / `aria-disabled`, error (`aria-invalid`), loading (`aria-busy`).

| Class | Anatomy | Used by |
|---|---|---|
| `.btn` (+ `-l`, `-sm`, `-block`, `-outline`, `-neutral`, `-bad`, `-white`), `.link-arrow` | pill, 1.5px border, 15/600 label, 44px minimum target (36px for `-sm` in dense ops tables) | everywhere |
| `.label`, `.input` (+ `-sm`, `-mono`, `-code`, `-sig`), `.field-error`, `.banner-error`, `.banner-ok`, `.search-pill` | label above, 1px line field radius 12, hint / error below | forms |
| `.choices` / `.choice`, `.chk`, `.upload` (+ `-done`, `-slim`) | radio kept for semantics; 18px checkbox; dashed upload zone | signup flow |
| `.card` (+ `-sm`, `-elevated`, `-highlight`, `-tint`, `-dark`, `-sand`), `.callout`, `.photo`, `.ledger` / `.ledger-row` | surface, 1px line, radius 20, padding 28, gap 12 | site, portal |
| `.pill` (+ tones), `.badge` (+ tones), `.progress` | tones from the one map in `src/lib/status.ts` (`StatusPill`, `StatusBadge` in `components/ui.tsx`) | portal, ops |
| `.table-wrap` / `.table` (+ `-dense`, `td.num`, `tr[aria-selected]`, `.table-empty`) | scrolling wrapper, sticky row-tint header, hairline rows | ops (SPEC-09) |
| `.kpis` / `.kpi` (+ `-accent`, `-warn`, `-empty`, `aria-busy`) | label 13/600 muted, value 28/700 tabular, sub 12 | ops funnel |
| `.toolbar` (+ `-title`, `-spacer`) | wrapping flex row of `.input-sm` and `.btn-sm` | ops filters |
| `.drawer` (+ `-bg`, `-panel`, `-head`, `-body`, `-close`) | right sheet min(560px, 100vw), scrim, sticky head with a 44px close | ops claim detail |
| `.nav`, `.logo` / `.logo-mark`, `.nav-sheet`, `.footer`, `.acc`, `.faq-*`, `.flow-*`, `.timeline`, `.step-row`, `.compare` | as built in SPEC-07 | site |

Status colours: `submitted` / `processing` → neutral · `ready_to_submit`, `filed` → primary tint · `needs_dl_update`,
`needs_review` → accent · `approved`, `refunded`, `paid` → success · `denied` → error · `withdrawn` → off.

## 5. Accessibility rules (WCAG 2.2 AA)

- Text contrast ≥ 4.5:1; large text (≥ 24px, or ≥ 19px bold) and UI components ≥ 3:1 — checked by `python -m trd.brand
  --contrast` for every theme (§7) and by `tests/test_brand.py`. Placeholder text is supplementary (every field has a
  visible label); disabled controls are inactive components and exempt.
- Focus is always visible: the 4px `--ring` on every interactive element (`:focus-visible`), never `outline: none`
  without it.
- Targets ≥ 44 × 44px for every primary action (`.btn`, `.nav-burger`, `.drawer-close`); `.btn-sm` (36px) only inside
  dense operator tables.
- `prefers-reduced-motion` disables transitions and the skeleton pulse (`globals.css` base layer).
- Semantics before styling: choice buttons wrap a real radio, the checkbox is a real checkbox, status is text in a
  pill or badge (never colour alone), tables are `<table>`s, the drawer is `role="dialog"` with a labelled close.
- Type is never below 12px; body is 15px; line height 1.5 for body copy.
- Lighthouse accessibility target: 100 on `/design-system` and `/claim/[code]` (check on the Vercel preview).

## 6. Print and e-mail rules

**Letters** (`trd/letters/generate.py`): US Letter, 0.75 in margins, first page only (Lob). The §41.0051(a) block is
14 pt Helvetica Bold at the top and is never changed; below it, the letterhead is the wordmark (mark + name in DM Sans
Bold, `--color-primary`), body in DM Sans 10.5 pt `--color-ink`, headline and "Start here" in `--color-primary-strong`,
footer disclosures 7.5 pt `--color-muted`, the QR in black. Taxing units are named (§41.0051(b)).

**Packet data sheet and Form 50-114 audit page** (`trd/agent/packet.py`, `trd/agent/form50114.py`,
`supabase/functions/process-claim/form50114.ts`): wordmark at the top, title in `--color-primary-strong`, text in
`--color-ink`; the Python side embeds DM Sans, the pdf-lib side uses Helvetica (no font embedding without a dependency).
The official form's own appearance is never restyled.

**E-mail** (`trd/email/base.html`, `trd.email.render_email(subject, body)`): a 600px table, every style inline, the
header image `https://cleanbillco.com/brand/email-header.png`, the message in a surface card, the footer with the
§41.0051 line in bold, the not-affiliated sentence and the support address; a text alternative is generated from the
same body. Colours are inlined from `trd/brand_tokens.py` at render time. Test in Gmail and Apple Mail after any change.

**Assets** (`apps/web/public/brand/`, regenerated by `python -m trd.brand --assets`): `wordmark.svg` /
`wordmark-dark.svg` (glyph outlines, no font dependency), `mark.svg` (currentColor), `favicon.svg`, `favicon.ico`,
`apple-touch-icon.png`, `og.png` (1200 × 630), `email-header.png` (600 × 96), `email-sample.html`. The mark's geometry
is `MARK` in `trd/brand.py`; the web reads it from `brand.generated.ts`.

**Voice**: by pointer to `docs/brand/brand-brief.md` §6 — lead with the number, "you're owed" not "you could be
eligible", "the county" not "the government", show the math, short sentences, no urgency we didn't cause. Wording in
`copy/*.md` is compliance-reviewed and changes only from an approved spec.

## 7. Contrast table

Generated by `python -m trd.brand --contrast` (WCAG 2.2 relative luminance). Minimum 4.5 = body text, 3.0 = large text
or UI component, — = informational.

<!-- contrast:begin -->
### Theme `brief`

| Foreground | Background | Hex | Ratio | Minimum | Result | Where |
|---|---|---|---:|---:|---|---|
| `ink` | `bg` | #12261F on #FFFFFF | 15.88:1 | 4.5 | pass | headings and primary text on the page |
| `body` | `bg` | #2F473D on #FFFFFF | 10.05:1 | 4.5 | pass | body text on the page |
| `muted` | `bg` | #5B6F66 on #FFFFFF | 5.37:1 | 4.5 | pass | secondary text, labels, footer |
| `ink` | `surface` | #12261F on #FFFFFF | 15.88:1 | 4.5 | pass | text on cards and inputs |
| `body` | `surface` | #2F473D on #FFFFFF | 10.05:1 | 4.5 | pass | body text on cards |
| `muted` | `surface` | #5B6F66 on #FFFFFF | 5.37:1 | 4.5 | pass | labels on cards |
| `placeholder` | `surface` | #7F908A on #FFFFFF | 3.36:1 | — | pass | input placeholder — supplementary; every field has a visible label (informational) |
| `primary` | `bg` | #1E5B45 on #FFFFFF | 7.96:1 | 4.5 | pass | links, eyebrows, active nav |
| `primary` | `surface` | #1E5B45 on #FFFFFF | 7.96:1 | 4.5 | pass | links on cards |
| `on-primary` | `primary` | #FFFFFF on #1E5B45 | 7.96:1 | 4.5 | pass | primary button label |
| `primary-strong` | `primary-tint` | #164536 on #E7F0EB | 9.32:1 | 4.5 | pass | text on tint callouts and teal pills |
| `amount` | `surface` | #9A6B12 on #FFFFFF | 4.68:1 | 3.0 | pass | the refund number (48px: 3:1) |
| `on-dark-strong` | `dark` | #FFFFFF on #1E5B45 | 7.96:1 | 4.5 | pass | headings on dark bands |
| `on-dark` | `dark` | #D3E4DA on #1E5B45 | 6.02:1 | 4.5 | pass | body text on dark bands |
| `primary-soft` | `dark` | #9CC7B3 on #1E5B45 | 4.26:1 | 3.0 | pass | eyebrows on dark bands (large / UI: 3:1) |
| `accent-text` | `accent` | #7A5410 on #F8EEDC | 5.88:1 | 4.5 | pass | text on accent (sand / amber) tint |
| `accent-body` | `accent` | #5C4620 on #F8EEDC | 7.76:1 | 4.5 | pass | body text on accent tint |
| `success` | `success-bg` | #1E7B4F on #E3F3EA | 4.57:1 | 4.5 | pass | success pill |
| `error` | `error-bg` | #B4453A on #FBF3F2 | 4.98:1 | 4.5 | pass | error pill / invalid input |
| `error` | `surface` | #B4453A on #FFFFFF | 5.45:1 | 4.5 | pass | field error text |
| `on-primary` | `disabled` | #FFFFFF on #A9C6B8 | 1.83:1 | — | pass | disabled button label — inactive components are exempt (WCAG 1.4.3); informational |
| `line` | `surface` | #D7DED9 on #FFFFFF | 1.37:1 | — | pass | card and input borders (UI: 3:1 — informational only) |
| `primary` | `surface` | #1E5B45 on #FFFFFF | 7.96:1 | 3.0 | pass | focus ring vs. field (UI: 3:1) |

### Theme `handoff`

| Foreground | Background | Hex | Ratio | Minimum | Result | Where |
|---|---|---|---:|---:|---|---|
| `ink` | `bg` | #172026 on #F7FAFA | 15.74:1 | 4.5 | pass | headings and primary text on the page |
| `body` | `bg` | #33454D on #F7FAFA | 9.53:1 | 4.5 | pass | body text on the page |
| `muted` | `bg` | #5A6B72 on #F7FAFA | 5.29:1 | 4.5 | pass | secondary text, labels, footer |
| `ink` | `surface` | #172026 on #FFFFFF | 16.52:1 | 4.5 | pass | text on cards and inputs |
| `body` | `surface` | #33454D on #FFFFFF | 10.00:1 | 4.5 | pass | body text on cards |
| `muted` | `surface` | #5A6B72 on #FFFFFF | 5.55:1 | 4.5 | pass | labels on cards |
| `placeholder` | `surface` | #8A9AA1 on #FFFFFF | 2.91:1 | — | pass | input placeholder — supplementary; every field has a visible label (informational) |
| `primary` | `bg` | #157A8A on #F7FAFA | 4.78:1 | 4.5 | pass | links, eyebrows, active nav |
| `primary` | `surface` | #157A8A on #FFFFFF | 5.02:1 | 4.5 | pass | links on cards |
| `on-primary` | `primary` | #FFFFFF on #157A8A | 5.02:1 | 4.5 | pass | primary button label |
| `primary-strong` | `primary-tint` | #0E5661 on #E6F3F5 | 7.34:1 | 4.5 | pass | text on tint callouts and teal pills |
| `amount` | `surface` | #0E5661 on #FFFFFF | 8.33:1 | 3.0 | pass | the refund number (48px: 3:1) |
| `on-dark-strong` | `dark` | #FFFFFF on #0F3A44 | 12.29:1 | 4.5 | pass | headings on dark bands |
| `on-dark` | `dark` | #C7DCE0 on #0F3A44 | 8.63:1 | 4.5 | pass | body text on dark bands |
| `primary-soft` | `dark` | #7FC4CF on #0F3A44 | 6.26:1 | 3.0 | pass | eyebrows on dark bands (large / UI: 3:1) |
| `accent-text` | `accent` | #6B4E1E on #F2E9DA | 6.38:1 | 4.5 | pass | text on accent (sand / amber) tint |
| `accent-body` | `accent` | #5A4A33 on #F2E9DA | 7.08:1 | 4.5 | pass | body text on accent tint |
| `success` | `success-bg` | #1E7B4F on #E3F3EA | 4.57:1 | 4.5 | pass | success pill |
| `error` | `error-bg` | #B4453A on #FBF3F2 | 4.98:1 | 4.5 | pass | error pill / invalid input |
| `error` | `surface` | #B4453A on #FFFFFF | 5.45:1 | 4.5 | pass | field error text |
| `on-primary` | `disabled` | #FFFFFF on #9FC7CE | 1.82:1 | — | pass | disabled button label — inactive components are exempt (WCAG 1.4.3); informational |
| `line` | `surface` | #D4E0E3 on #FFFFFF | 1.35:1 | — | pass | card and input borders (UI: 3:1 — informational only) |
| `primary` | `surface` | #157A8A on #FFFFFF | 5.02:1 | 3.0 | pass | focus ring vs. field (UI: 3:1) |
<!-- contrast:end -->
