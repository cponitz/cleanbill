# Changelog

All notable changes to Texas Refund Desk. Dates are the commit dates on `main`.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions are git tags.

## [Unreleased]

### Changed
- Consolidation: the project is named `texas-refund-desk` everywhere. Replaced the last
  `homestead-refund` references (samples/system-map.html links, samples/README.md, the
  `SITE_BASE` default in `trd/ops/new_claim.py`). The public site is
  `https://cponitz.github.io/texas-refund-desk/` (GitHub Pages serves the `docs/` folder at the root).
- Redeployed all four Supabase edge functions (`claim`, `process-claim`, `ops`, `selftest`) from this tree.

### Added
- `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/adr/` (architecture decision records), this changelog.

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
