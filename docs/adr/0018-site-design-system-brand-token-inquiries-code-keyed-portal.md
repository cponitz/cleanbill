# ADR 0018: the SPEC-07 site — design tokens in CSS, one brand token, lead capture instead of address lookup, a code-keyed portal

- **Date:** 2026-09-16
- **Status:** Accepted
- **Handbook ID:** SPEC-07 (T-12 follow-through; ADR 0012, ADR 0017)

## Decision

The Ownwell-inspired redesign (SPEC-07, the "Clean Bill" handoff) is built inside `apps/web` on the existing stack with
four technical choices:

1. **The design system is plain CSS on top of Tailwind, not a component library.** Every token of the handoff (colour,
   type scale, radii, shadows, gutters) is a custom property on `:root` in `src/app/globals.css`; the component sheet
   (buttons, inputs, choice buttons, cards, pills, progress, nav, footer, accordion, the signup-flow chrome) is a set of
   named classes in `@layer components`, so Tailwind utilities still win for one-off layout. DM Sans is self-hosted by
   `next/font/google` at build time (variable weight, optical-size axis); nothing loads from Google Fonts at runtime.
   Page files therefore read as the handoff's screen descriptions, and the whole look can be re-tuned in one file.
2. **The customer-facing brand is one token.** `BRAND` and `SUPPORT_EMAIL` in `src/lib/copy.ts` feed every page,
   the footer, the sign-step checkbox and the agreement. The repo, Supabase project and Vercel project keep their
   `texas-refund-desk` names (B-12); the claim-code prefix stays `TRD` because it is printed on letters and stored on
   every lead (`CODE_PREFIX` in `src/lib/api.ts`). Switching the brand back, or forward, is a two-line change.
3. **Address forms are lead capture, not lookup.** The handoff's "address → estimate" hero would need a public
   address→claim-code lookup, which would turn a public fact (an address) into the credential ADR 0008 makes
   unguessable. Instead every address / business form takes the address (or company) plus an e-mail and posts
   `POST /claim/inquiry`, which stores an `inquiries` row (new table, migration `20260916150000_inquiries`) and an
   `events` row of kind `inquiry`; a person answers by e-mail (B-04). No property data is returned to the page. Only the
   claim-code path is instant.
4. **The "portal" is the claim-code status page, not a login.** SPEC-07 §10's `/app` needs customer accounts, which
   ADR 0017 defers until Supabase Auth exists. `/claim/[code]/status` renders the portal layout (status card with the
   six-stage progress row, documents, messages, estimate, billing, other properties) from an extended closed-lead
   response: `lead` gains the estimate fields and `claim` gains `first_name`, `card_on_file`, a dated `timeline` and the
   real (sent or received) `messages`, never agent drafts and never the DL. "Sign in" and `/app` go to `/claim`, the
   claim-code entry, because the code is the credential. The claim status enum is unchanged; `src/lib/status.ts` maps
   it onto the handoff's pill vocabulary and stages, mirrored by `stageIndex` in `supabase/functions/claim/logic.ts`.

## Rationale

The existing app already met ADR 0017's constraints (browser-only client, secret-free, one wording file, the smoke
test's selectors); the redesign is a presentation change plus two small, reversible API additions. A component library
would have fought the handoff's exact values; a lookup endpoint would have changed the security model; a login would
have been a spec of its own. Copy discipline is kept by splitting wording into `copy.ts` (claim flow, status, agreement
— compliance-reviewed sentences from `copy/*.md`, brand-tokenised) and `site.ts` (marketing pages, verbatim from the
handoff, with the few new sentences marked `NEW`).

## Consequences

- `inquiries` has no reader yet: the operator sees rows only in the database until `ops` (or the agent, in shadow mode)
  lists them. The rate limit is 30 posts per IP per hour, counted like page events.
- `packet_url` is now returned for every status from `ready_to_submit` onward, so the portal can show "Form 50-114 (as
  submitted)"; it is still a 10-minute signed link behind the claim code.
- The eligibility questions, the sign-step disclosure (§41.0051), the done-screen steps and the agreement keep the
  compliance-reviewed wording rather than the handoff's shortened versions; the handoff's titles, labels and hints are
  used around them. Listed in SPEC-07's implementation notes.

## Revisit when

Customer accounts arrive (then `/app` becomes real and the status page becomes one claim of many); an address→estimate
product decision is recorded in `claude/decisions.md` (then `/claim/inquiry` gains a lookup path); the letters are
reprinted with a new code prefix.
