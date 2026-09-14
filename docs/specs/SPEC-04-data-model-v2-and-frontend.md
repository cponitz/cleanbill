# SPEC-04 — Data model v2 and migrations · SPEC-04b — Customer front-end on Vercel

*Status: approved (B-12, B-14, T-12, T-13) · Priority P0 · Phase 0 (04) and Phase 1 (04b) · Owner: Claude Code; Charlie approves the front-end design once · Handbook refs: §4, §6, G-3, G-24, G-26, G-29*

## Part A — Data model v2 (Phase 0)

### Problem
The prototype's `customers` table is both the person and the engagement; four live columns have no migration file; findings are a concatenated string.

### Behaviour / changes (migration `0003_data_model_v2.sql`)
1. Declare the four live-only columns (`customers.household`, `prev_homestead`, `prev_homestead_address`, `properties.legal_desc`) so migrations = live schema.
2. Rename `customers` → `claims`; rename every `customer_id` FK to `claim_id` (documents, filings, messages, audit rows' entity names).
3. New `customers` (account): `id uuid pk, email citext unique, full_name, phone, stripe_customer_id, card_on_file bool default false, created_from_claim_id uuid, auth_user_id uuid null, created_at, updated_at`. Backfill one account per existing claim by email.
4. `claims.customer_id uuid fk not null`; `claims.service_type text not null default 'homestead_refund'`; `claims.findings jsonb not null default '[]'`; keep `status_reason` as a generated display string for now (drop in a later migration).
5. New `record_checks` and `refunds` v2 columns per handbook §4.1; new `property_values (prop_id, tax_year, market_value, appraised_value, hs_exempt, owner_name, deed_date, pk (prop_id, tax_year))` (populated by G-27 later; table created now).
6. Claim API: on POST, look up `customers` by email (case-insensitive); attach or create; write the claim with `customer_id`.
7. Update `process-claim`, `ops`, `selftest`, `trd/agent/store.py`, fixtures, tests, `docs/ARCHITECTURE.md` §4.
8. CI: a job that applies migrations to a scratch database (`supabase db reset` locally or a Supabase branch) and diffs against the live schema; fails on drift.
9. Naming sweep (G-29): replace `homestead-refund` / `austin-refund` everywhere in the repo.

### Acceptance
- `supabase db diff` against live is empty after `db push`.
- Two claims submitted with the same email (different leads) share one `customers` row; different emails create two.
- Selftest and browser smoke pass; 28 Python + 22 Deno tests pass after renames.
- `claims.findings` populated by process-claim with structured objects; ops renders them from codes.

### Out of scope
Customer login / portal (auth_user_id stays null); dropping `status_reason`.

## Part B — Customer front-end on Vercel (Phase 1)

### Problem
The static prototype pages work but are not a product. The mail test must measure a claim experience that is clearer and faster than Ownwell's.

### Behaviour
1. New `apps/web` Next.js (App Router, TypeScript, Tailwind) deployed on Vercel; domain `texasrefunddesk.com`; preview deploys per PR.
2. Pages: `/` landing (what this is, who we are, "filing is free at TCAD — here is what you pay us for", the math, trust signals: LLC name, address, §41.0051 language, no urgency tricks); `/claim/[code]` the claim flow (estimate → 5 questions → license photo or typed pre-check → inline result (SPEC-06) → card (SPEC-03) → done); `/claim/[code]/status` (what happens next, current state in plain English, packet download when ready); `/agreement/[code]`; `/ops` (phase 2: moves behind Supabase Auth magic link; until then ops stays on the static page).
3. Reads/writes only the existing Supabase JSON APIs (`claim`, `process-claim` via the API, `ops`); no service-role key in the app; API base in env.
4. Mobile-first (most opens are phone + QR); camera capture hint; HEIC accepted (convert client-side or server-side); Lighthouse ≥ 90 mobile on `/claim/[code]`.
5. Copy from `copy/*.md` (approved); no new claims in copy without review.
6. Analytics: the SPEC-06 funnel events via the API; no third-party trackers for the test.
7. Cut-over: `docs/` static pages remain until the Vercel site passes the smoke test; letters/QR point at texasrefunddesk.com from the first batch.

### Acceptance
- Preview URL reviewed by Charlie (one pass) before the mail test; happy-path walkthrough on the live domain produces `ready_to_submit` with a card saved.
- Playwright smoke test ported to the new site (index → claim → upload → result → card → status).
- Lighthouse mobile ≥ 90 performance/accessibility on the claim page.

### Out of scope
Customer accounts/login, Spanish (G-23), the prospect portal (G-27), SEO beyond basics.

## Amendment 2026-09-14 (Part B)
- Provisioned: Vercel project `texas-refund-desk` (Hobby), Root Directory `apps/web`, preset Next.js, production branch `main`, preview per branch push, env `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_STRIPE_ENABLED`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Domain `texasrefunddesk.com` purchased; attached at cut-over (Task 6) if not already.
- The app reads only `NEXT_PUBLIC_*` variables. The seven variables Vercel "detected" from `.env.example` must never be set in Vercel (service-role key, ops password).
- Inline validation (SPEC-06 §2) and the fix screen (SPEC-02 §1) are part of this app's `/claim/[code]` page — SPEC-06b.
- Acceptance adds: `apps/web/README.md`; Lighthouse scores recorded in the PR; the ported smoke test runs against the Vercel preview URL.
- `docs/` static pages are frozen (bug fixes only) until cut-over, then retired per ADR 0012.
