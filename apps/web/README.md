# apps/web — the customer front-end (Next.js on Vercel)

SPEC-04 Part B (ADR 0012, ADR 0017). Landing, claim flow with inline validation (SPEC-06b) and the license fix screen
(SPEC-02), status and agreement pages. It talks only to the public claim API (`docs/ARCHITECTURE.md` §5.8); the claim code
is the credential and there is no server-side secret anywhere in this app.

## Routes

| Route | What |
|---|---|
| `/` | Landing: enter the claim code from the letter; what this is; filing is free at TCAD; the math. |
| `/claim/[code]` | Estimate → eligibility (5 questions) → typed pre-check + license photo → contact → review & sign → inline result (polls every 2 s, max 30 s) → card step (only with `NEXT_PUBLIC_STRIPE_ENABLED=true`) → done. A code whose claim is `needs_dl_update` opens the fix screen (both addresses, DPS link, one upload). |
| `/claim/[code]/status` | Plain-English state, packet download when ready. |
| `/agreement/[code]` | Service agreement v0.1 with the property and years filled in. |

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
synthetic lead `TRD-TEST-0001`): `python eval/web_smoke.py --base http://localhost:3000` (or a Vercel preview URL; add
`--stripe-on` when that deployment has the card step enabled).

Lighthouse (mobile, production build): `npx lighthouse http://localhost:3000/claim/TRD-TEST-0001 --preset=perf --form-factor=mobile --only-categories=performance,accessibility --chrome-flags="--headless" --output=json --output-path=eval/out/web/lighthouse.json`. Scores are recorded in the PR that changes the page.

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
Domain `texasrefunddesk.com` is attached at cut-over (Task 6 of the Phase 1 plan). Builds on branches without `apps/web`
fail with "Root Directory does not exist" — expected.

## Where the words come from

Every customer-facing string is in `src/lib/copy.ts`, transcribed from `copy/*.md` (compliance-reviewed) with the source
section named; strings marked `NEW` there are not yet in the copy files and are listed in the PR for review. Validation
findings are rendered by the API from the shared rule table (`trd/findings.py`), so the page never carries its own wording
for them.

## HEIC

iPhone photos chosen from the library can be HEIC. The API rejects HEIC (the extraction model does not read it), so
`src/lib/heic.ts` converts to JPEG in the browser with `heic2any`, loaded only when such a file is picked.
