# Changelog

All notable changes to Clean Bill (named Texas Refund Desk until SPEC-08, 2026-09-17; earlier entries keep that name). Dates are the commit dates on `main`.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions are git tags.

## [Unreleased]

### Changed
- **SPEC-08 Part A: rebrand to Clean Bill** (R1; B-19; `docs/specs/SPEC-08-rebrand-clean-bill.md`, `SPEC-09-admin-dashboard.md`,
  `docs/brand/brand-brief.md` and `docs/plans/phase1-v3.2.md` copied in). "Texas Refund Desk" → "Clean Bill" (legal Parties
  line: "Clean Bill Co."), `hello@texasrefunddesk.com` → `hello@cleanbillco.com`, `texasrefunddesk.com` → `cleanbillco.com`
  in the compliance copy (name / e-mail / domain substitution only), the letters (`trd/letters/generate.py`), the packet data
  sheet and the Form 50-114 audit page (Python and TS), the agent system prompt, the edge-function `BRAND` / `SUPPORT_EMAIL`
  defaults, the frozen `docs/` pages and `config.js`, `apps/web` (`notFoundHelp`, README; `metadataBase` / canonical
  `https://cleanbillco.com`), README, CLAUDE.md naming rule, ARCHITECTURE, RUNBOOK (also the stale test counts → 49 / 33),
  `.env.example`, `pyproject.toml` description, `samples/README.md` (`samples/system-map.html` removed — the Cowork project
  keeps the system map). **Claim codes are `CB-XXXX-XXXX`:** generator (`trd/etl/leads.py`), `CODE_RE` and the normaliser in
  `claim/index.ts`, `CODE_PREFIX` / `normalizeCode` / `maskCode` in `apps/web/src/lib/api.ts` (prefix-length aware), the
  selftest and smoke-test code `CB-TEST-0001`, fixtures, eval scripts, figures; the API rejects `TRD-` codes. `SITE_BASE` in
  `trd/ops/new_claim.py` defaults to `https://cleanbillco.com` and links `/claim/<code>`. **Data model:** migration
  `20260917190625_cb_claim_codes.sql` rewrites `leads.claim_code` and `events.claim_code` from `TRD-` to `CB-` (body
  preserved; asserts none remain). ADR 0008 gains a note; no other schema change. Infrastructure slugs
  (`texas-refund-desk`, `trd`) are unchanged until Parts B1–B3.

### Added
- **SPEC-07: the website redesign ("Clean Bill", Ownwell-inspired)** (branch `website-redesign`; ADR 0018; the design
  handoff is copied to `docs/specs/SPEC-07-website-redesign.md`). `apps/web` rebuilt on the handoff's design system: DM Sans
  (self-hosted by `next/font`), the teal/navy token set and the component sheet as CSS in `globals.css`, one `BRAND` /
  `SUPPORT_EMAIL` token (`Clean Bill`, `hello@cleanbillco.com`; repo, Supabase and Vercel names unchanged per B-12; claim
  codes stay `TRD-…`). New pages: `/` (editorial hero, "Start with either" address-or-code card, timeline, fee band, DIY
  callout, "Also from"), `/pricing`, `/how-it-works`, `/faq` (category rail / chips, accordion), `/exemptions`, `/appeals`,
  `/businesses` (portfolio-review form), `/about`, `/claim` (claim-code entry: default → not found → confirm the property;
  "Sign in" and `/app` land here), `/agreement`. `/claim/[code]` restyled as the mobile-first five-step flow (progress
  bar, step eyebrow, choice buttons, upload zone, pinned CTA, navy done screen with the customer's first name; the
  eligibility questions, the §41.0051 sign-step disclosure, the done steps and the agreement keep the compliance-reviewed
  wording). `/claim/[code]/status` is now the portal view: status card with the six-stage progress row and dates,
  documents (Form 50-114, agreement, license purge note), messages with a reply box, estimate, billing, other
  properties. Address / business forms are **lead capture**, not lookup (ADR 0018): they post `POST /claim/inquiry` and we
  answer by e-mail. **Claim API:** `POST /claim/inquiry` (validated by `parseInquiry`, rate-limited 30/IP/h); the closed-lead
  `GET /claim?c` response gains the lead's estimate fields and `claim.{first_name, card_on_file, timeline, messages}`;
  `packet_url` is returned from `ready_to_submit` onward. **Data model:** migration `20260916150000_inquiries.sql` — new
  `inquiries` table (kind, address, email, company, properties, bills, source_path, ip, ua, handled_at, notes); `events.kind`
  gains `inquiry`. Tests: Deno +2 (`parseInquiry`, `stageIndex` / `timelineFrom`; 33 total), Python unchanged (49);
  `eval/web_smoke.py` gains scenario D (every page renders, the FAQ accordion, `/claim` states, the home inquiry form;
  `--skip-inquiry` for a branch run before the deploy). `apps/web/README.md`, `docs/ARCHITECTURE.md` §3.1 / §4.1 / §5.8.
  Not built (needs a decision or a later spec): instant address→estimate lookup, customer accounts / `/app` login, a
  reader for `inquiries` in `ops`, real photography for the `[ photo ]` slots, a `CB-` code prefix.
- **SPEC-04b + SPEC-06b + SPEC-02 UI: the customer web app `apps/web`** (branch `spec-04b-web`; ADR 0017). Next.js 16 App
  Router, TypeScript, Tailwind, deployed by Vercel (Root Directory `apps/web`, preview per branch, production from `main`).
  Routes: `/` landing (code entry, what this is, filing is free at TCAD, the math); `/claim/[code]` — estimate → five
  eligibility questions → typed pre-check (`GET /claim/precheck` on blur) + license photo with camera hint and browser-side
  HEIC→JPEG conversion → contact → review & sign → inline result polling `GET /claim?c&claim` every 2 s (max 30 s) →
  card step (rendered only when `NEXT_PUBLIC_STRIPE_ENABLED=true`; Task 3 fills it) → done; a claimed code opens the
  SPEC-02 fix screen (both addresses side by side, DPS link, what DPS asks for, one upload → re-upload path), the review
  question with a reply box, the SPEC-06 §4 typed-confirmation form (pre-filled), or the ready screen with the 10-minute
  packet link; `/claim/[code]/status`; `/agreement/[code]`. Only `NEXT_PUBLIC_*` env is read; every string is in
  `src/lib/copy.ts` with its `copy/*.md` source named (unreviewed strings marked `NEW`). Funnel events posted:
  `validation_shown, dl_fix_started, dl_fix_uploaded, card_skipped, packet_viewed`. **Claim API additions:**
  `POST /claim/reply {c, claim, body}` stores the customer's answer as an inbound `messages` row (`channel=portal`,
  `intent=reply`); the poll/claim summary gains `typed_prefill` (name, DOB, address — never the DL number) for the typed
  fallback. `eval/web_smoke.py --base <url>`: Playwright, phone viewport, happy path + fix-screen path + agreement, resets
  the synthetic lead itself; passes against the local production build. Lighthouse mobile on `/claim/[code]` (production
  build): performance 99, accessibility 100, best practices 96. `apps/web/README.md`.
  No data-model change. `docs/` static pages untouched (frozen until cut-over).
- **SPEC-06a + SPEC-02 API + G-9: findings rule table, inline-validation API, typed pre-check, license re-upload**
  (branch `spec-02-06-backend`; ADR 0016). One rule table `trd/findings.py` maps each finding code to severity, field, the
  ops sentence, the customer sentence and a next action; `supabase/functions/_shared/findings.ts` is generated from it
  (`python -m trd.findings --emit-ts`) and CI fails when it is stale. Both validators (`_shared/validate.ts`, `trd/agent/validate.py`)
  now emit codes + facts only; the shared fixture gains 16 `validation_cases` and `tests/fixtures/findings_snapshot.json`
  pins both validators' fully rendered output (G-9 closed). Claim API: `GET /claim?c&claim=<id>` poll → `{status, findings[]
  (with customer_message, next_action), packet_url}` (10-minute signed URL when ready); `GET /claim/precheck?c&address&zip`
  (`addressMatches` only, event `typed_precheck`); `POST /claim/events` for the SPEC-06 funnel events; `GET /claim?c` for a
  claimed lead returns the claim summary so the page can render the fix screen. `POST /claim` on a claimed code is now the
  SPEC-02 re-upload (`needs_dl_update` + `dl_front` → new timestamped document, status `processing`, event `dl_fix_uploaded`,
  re-kick) or the SPEC-06 §4 typed confirmation (`needs_review` for `not_readable`/`low_confidence` + `typed_*` fields →
  `typed_id` document, re-kick with `typed_confirmation`); any other status → 409. `process-claim` uses the newest `dl_front`
  (and a back from the same upload), merges typed confirmations over the model's reading, writes `claims.findings` and
  `status_reason` from the table, and quotes the customer sentences in the `needs_review` draft. Selftest gains
  `mismatch_then_fix` (mismatch → re-upload a matching ID → `ready_to_submit` with a second packet → a further re-upload
  gets 409) and every scenario probes the pre-check and the poll. Agent: `FixtureStore` returns documents newest-first like
  `SupabaseStore`; the system prompt lists the codes and what to do with each. **Data model:** migration
  `20260914181236_typed_id_documents.sql` — `documents.kind` allows `typed_id` and `storage_path` is nullable for that kind
  only; `events.kind` gains `typed_precheck, dl_fix_uploaded, validation_shown, dl_fix_started, card_saved, card_skipped,
  packet_viewed`. CI: generated-file check, three Deno test files, edge-function type-check. Tests: 49 Python (+6), 31 Deno (+8).
  Docs: spec amendments 2026-09-14 appended to SPEC-02/03/04/06; runbook refreshed (`gh`, `supabase db diff`, Vercel, `--claim`).
- **SPEC-04 Part A: data model v2** (migration `20260913220000_data_model_v2.sql`). The prototype's `customers`
  table (the engagement) is renamed `claims`; `customer_id` becomes `claim_id` on documents, filings and messages;
  audit rows say `claims`. A new `customers` table is the person/account, matched by e-mail (case-insensitive,
  `citext`), backfilled one per e-mail and linked from `claims.customer_id`; the card fields move to the account.
  `claims.service_type`, `claims.findings` (structured `{code, severity, field, message, detail}`, ADR 0013). SPEC-05's
  schema lands now: `property_values`, `record_checks`, `refunds` v2 columns. The hand-dropped `bulk_load_leads`
  function is declared dropped. The claim API attaches a claim to the account for its e-mail (or creates one);
  `process-claim`, `ops`, `selftest`, the agent store/tools (`claim_id` everywhere, `--claim`, workflow input
  `claim`), the purge job, fixtures and tests follow. Both validators emit structured findings with codes; the ops
  page renders them by severity with the code shown.
- **Migration history matches the hosted project.** Files are named by Supabase's timestamp versions
  (`20260907145033_init_schema.sql` …) and the three migrations that existed only on the server
  (`bulk_load_rpc`, `site_bucket`, `customers_household_prev_homestead`) are in the repo, so `supabase db push` and
  `supabase db diff --linked` work (ADR 0015).
- **CI.** `ci.yml` runs pytest, the Deno validator tests, and applies the whole migration chain in order to a scratch
  Postgres (with `supabase/ci/shim.sql` standing in for the hosted roles and storage schema) followed by a schema
  check. `deploy.yml` runs on merges to `main`: `supabase db push`, `supabase functions deploy`, then
  `supabase db diff --linked` must be empty (fails on drift); optional selftest. Needs repository secrets
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` (and `OPS_PASSWORD` for the selftest).
- **SPEC-01 taxing-unit-aware estimates.** Every property is estimated on its own taxing units from TCAD's
  `PROP_ENT` file instead of the five Austin units. New table `property_entities` (migration
  `0004_property_entities.sql`; one row per property × unit, upserted by `trd/etl/publish.py`). The rate table is
  now data (`trd/estimator/rates/units.json`: 254 TCAD entity codes × tax years 2024–2026 with rate, HS rule, OV65,
  ceiling, per-figure `confirmed` and basis) generated by `trd/estimator/build_units.py` from the county's
  truth-in-taxation rate summary, TCAD's 2026 exemption listing and a cross-check against the certified roll.
  `leads.est_refund_by_year` carries a per-unit breakdown; leads gain `taxing_units`, `unit_names`, `entities`;
  `estimate_unconfirmed` is true when any unit lacks a confirmed rate or exemption for a refund year (or when the
  property's units are unknown). Letters name the property's actual units in the §41.0051(b) block and footer.
  Loader: `--entities`; layout `pacs_8_0_33_prop_ent_slim.json`. Publisher: `--update-estimates` refreshes the
  estimate columns of leads already in Supabase (codes and statuses untouched). Ops CLI stores the units it used.
  Report: `docs/reports/2026-09-13-spec-01-taxing-units.md`. Migration applied to the hosted project 2026-09-13
  (Supabase MCP, recorded as `property_entities`). 13 new tests (41 total).

### Fixed
- `trd.etl.publish` reconnects and retries when Supabase closes the HTTP/2 connection (about 10K requests per
  connection), so `--update-estimates` completes over 16,775 leads; Tier-3 leads are never published unless `--tiers`
  says so (the prototype loaded Tiers 1–2 only; the SPEC-01 CSV contains all tiers).
- Scheduled `claims-agent` runs failed with `ImportError: cannot import name 'create_client' from 'supabase'`:
  the Python client `supabase` was never a declared dependency, so on a fresh runner the repo's own
  `supabase/` folder (migrations, functions) was imported as an empty namespace package. Added `supabase>=2.0`
  to `pyproject.toml`; the workflow installs `.[dev]`. The cron schedule is removed from `agent.yml`
  (manual `workflow_dispatch` only, per ADR 0011) until there is test data. The agent prompt now says to
  move `submitted → processing` before routing, matching the allowed transitions in `trd/agent/store.py`.

### Changed
- Consolidation: the project is named `texas-refund-desk` everywhere. Replaced the last
  `homestead-refund` references (samples/system-map.html links, samples/README.md, the
  `SITE_BASE` default in `trd/ops/new_claim.py`). The public site is
  `https://cponitz.github.io/texas-refund-desk/` (GitHub Pages serves the `docs/` folder at the root).
- Redeployed all four Supabase edge functions (`claim`, `process-claim`, `ops`, `selftest`) from this tree.

### Added
- `CLAUDE.md` (working rules for Claude Code), `docs/ARCHITECTURE.md` (handbook v2.1 sections 3 to 5: modules,
  data model v2, process flows), `docs/RUNBOOK.md` (handbook section 9), `docs/adr/0001..0013` (the T-01..T-13
  technical decisions), `docs/specs/SPEC-01..06` (feature handoffs), `docs/figures/*.svg` (the eight diagrams),
  `docs/README.md`, this changelog.

## [v0.1-prototype] - 2026-09-08

The working end-to-end prototype, built 2026-09-07 to 2026-09-08.

### Added
- **Estimator** (`trd/estimator`): tax rates and exemption amounts for the five Austin taxing units;
  retroactive refund math under Tax Code §11.431; conservative (round-down) display.
- **ETL + lead engine** (`trd/etl`): spec-driven parser for TCAD's PACS 8.0.33 fixed-width export into
  DuckDB; lead heuristic (no homestead flag, mailing address equals situs) with tiering by deed date;
  publisher to Supabase. Real roll loaded: 493,324 accounts, 16,775 Tier-1/2 leads.
- **Letters** (`trd/letters`): outreach letter PDFs (two variants) with the §41.0051 advertisement block
  and a QR code to the claim page.
- **Static site** (`docs/`): index, claim, agreement, and ops pages on GitHub Pages; the Supabase
  functions are pure JSON APIs because `*.supabase.co` responses carry a sandbox CSP.
- **Edge functions** (`supabase/functions`): `claim` (public API keyed by claim code), `process-claim`
  (Claude Haiku ID extraction, validation against the appraisal record, official Form 50-114 fill with
  pdf-lib, e-signature and audit page, follow-up draft), `ops` (password-gated dashboard API),
  `selftest` (synthetic claim through the real path).
- **Claims agent** (`trd/agent`): Claude tool loop with 7 tools over open claims, fixture and Supabase
  stores, allowed status transitions, shadow mode only. GitHub Actions workflow `agent.yml`.
- **ID purge job** (`trd/jobs/purge_ids.py`): deletes license images 30 days after filing, 7 days after
  withdrawal, or 180 days stale; audit-logged.
- **Ops CLI** (`trd/ops/new_claim.py`): creates a claim code for any property in the roll.
- **Eval**: 30 synthetic license photos with labels; extraction eval runner (96.7% field accuracy);
  Playwright browser smoke test; 25-lead verification pack generator.
- **Schema** (`supabase/migrations`): `0001_init.sql` (properties, leads, customers, documents, filings,
  refunds, messages, events, audit_log; RLS on everything; private `ids` and `packets` buckets),
  `0002_app_settings.sql`.
- Tests: 28 pytest cases (estimator, validation mirror, ETL, agent loop with a scripted model, purge
  rules) and 22 Deno cases for the edge-function validator.

### Known gaps at this tag
- The estimator applies Austin ISD and City of Austin rates to every lead; per-property taxing units are
  not yet loaded (SPEC-01).
- Three migrations applied to the hosted database (`bulk_load_rpc`, `site_bucket`,
  `customers_household_prev_homestead`) are not in `supabase/migrations/` (SPEC-04).
- The scheduled `agent.yml` run fails on import of `supabase` (the Python client is not a declared
  dependency, so the repo's `supabase/` folder shadows it as a namespace package).
