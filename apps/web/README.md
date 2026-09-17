# apps/web — the customer front-end (Next.js on Vercel)

SPEC-04 Part B (ADR 0012, ADR 0017) with the SPEC-07 redesign (ADR 0018): the marketing site, the claim-code entry, the
claim flow with inline validation (SPEC-06b) and the license fix screen (SPEC-02), the portal-style status page and the
agreement. It talks only to the public claim API (`docs/ARCHITECTURE.md` §5.8); the claim code is the credential and there
is no server-side secret anywhere in this app.

## Design system (SPEC-07)

`src/app/globals.css` holds every token of the handoff (`docs/specs/SPEC-07-website-redesign.md`) as a custom property and
the component sheet as named classes in `@layer components` (`.btn`, `.input`, `.choice`, `.card`, `.pill`, `.progress`,
`.nav`, `.footer`, `.acc`, `.flow-*`). Tailwind utilities are used for one-off layout and win over the component classes.
DM Sans is self-hosted by `next/font/google` (variable weight, optical-size axis). The brand is one token: `BRAND` and
`SUPPORT_EMAIL` in `src/lib/copy.ts`.

## Routes

| Route | Group | What |
|---|---|---|
| `/` | site | Home: editorial hero with the "Start with either" card (address → inquiry, claim code → `/claim/[code]`), photo slot, four-step timeline, fee band, "You can do this yourself" callout, "Also from" cards. |
| `/pricing`, `/how-it-works`, `/faq`, `/exemptions`, `/appeals`, `/businesses`, `/about` | site | The SPEC-07 marketing pages, copy verbatim from `src/lib/site.ts`. The address forms (exemptions, appeals) and the portfolio-review form post `POST /claim/inquiry`. |
| `/claim` | site | Claim-code entry from the letter: default → not found → "Is this your property?" → `/claim/[code]`. "Sign in" and `/app` redirect here — the code is the credential. |
| `/claim/[code]` | flow | Mobile-first five steps: estimate → eligibility (5 questions) → typed pre-check + license photo → contact → review & sign → inline result (polls every 2 s, max 30 s) → card step (only with `NEXT_PUBLIC_STRIPE_ENABLED=true`) → done. A code whose claim is `needs_dl_update` opens the fix screen. |
| `/claim/[code]/status` | portal | The portal view of the claim: status card with the six-stage progress row and dates, documents, messages (reply box), estimate, billing, other properties. |
| `/agreement/[code]`, `/agreement` | site | Service agreement v0.1 with the property and years filled in (or as placeholders). |

Wording: `src/lib/copy.ts` (claim flow, status, portal, agreement — from `copy/*.md`, `NEW` where not yet reviewed) and
`src/lib/site.ts` (marketing pages — from the SPEC-07 handoff). The claim status enum is mapped onto the portal's pills
and stages in `src/lib/status.ts`.

## Run

```bash
cd apps/web
npm install
cp .env.example .env.local      # NEXT_PUBLIC_* only
npm run dev                     # http://localhost:3000
npm run build && npm start      # production build (what Lighthouse and the smoke test run against)
# stop it with: lsof -ti :3000 | xargs kill   (the process is named next-server, so `pkill next` misses it;
# a stale server after a rebuild serves broken chunk URLs)
npm run lint && npx tsc --noEmit
```

Smoke test (Playwright, from the repo root; needs `.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to reset the
synthetic lead `CB-TEST-0001`): `python eval/web_smoke.py --base http://localhost:3000` (or a Vercel preview URL; add
`--stripe-on` when that deployment has the card step enabled, `--skip-inquiry` while the claim API it talks to predates
`POST /claim/inquiry`).

Lighthouse (mobile, production build): `npx lighthouse http://localhost:3000/claim/CB-TEST-0001 --preset=perf --form-factor=mobile --only-categories=performance,accessibility --chrome-flags="--headless" --output=json --output-path=eval/out/web/lighthouse.json`. Scores are recorded in the PR that changes the page.

## Environment (the app reads only `NEXT_PUBLIC_*`)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_BASE` | `https://letrfpwskjbgnyacesgv.supabase.co/functions/v1` |
| `NEXT_PUBLIC_STRIPE_ENABLED` | `false` until SPEC-03 is ready to test; `true` renders the card step |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` (Stripe test mode) |

Never set the service-role key, the ops password or any other server secret in Vercel — the seven variables Vercel
"detected" from the repo's `.env.example` must stay unset (SPEC-04b amendment 2026-09-14).

## Vercel

Project `texas-refund-desk` (team Ponitz Development, Hobby). Root Directory `apps/web`, framework preset Next.js,
production branch `main`, a preview per branch push (`https://texas-refund-desk-<hash>-ponitz-development.vercel.app`).
Domain `cleanbillco.com` is attached at cut-over (Task 6 of the Phase 1 plan). Builds on branches without `apps/web`
fail with "Root Directory does not exist" — expected.

## Where the words come from

Every customer-facing string is in `src/lib/copy.ts`, transcribed from `copy/*.md` (compliance-reviewed) with the source
section named; strings marked `NEW` there are not yet in the copy files and are listed in the PR for review. Validation
findings are rendered by the API from the shared rule table (`trd/findings.py`), so the page never carries its own wording
for them.

## HEIC

iPhone photos chosen from the library can be HEIC. The API rejects HEIC (the extraction model does not read it), so
`src/lib/heic.ts` converts to JPEG in the browser with `heic2any`, loaded only when such a file is picked.
