# SPEC-09 — Admin dashboard (`/ops` in `apps/web`): funnel, claims, inquiries, actions, health

*Status: approved 2026-09-16 (gate order set 2026-09-17: runs immediately after SPEC-08, before any other development) · Priority **P0 — second of the two gating specs; before the friend walkthrough (Oct 1–2)** · Owner: Claude Code · Related: SPEC-04b §2 (deferred `/ops`), SPEC-05 task 1 (mark filed) and task 7 (post-filing view), SPEC-07 (inquiries), G-10, G-13, O-05, ADR 0017 · Glossary at the end.*

## What exists today (verified 2026-09-16 against `main` `bdcfc4a` and the live project)

**There is an admin dashboard.** How to open it:

| | |
|---|---|
| URL | `https://cponitz.github.io/texas-refund-desk/ops.html` (after the SPEC-08 repo rename: `https://cponitz.github.io/cleanbill/ops.html`, until this spec replaces it) |
| Login | The ops password (rotated 2026-09-12; in Charlie's password manager, in `app_settings`, and as `OPS_PASSWORD` in the Mac `.env`). Type it in the "Ops password" box → Open. The page keeps it only in memory for that tab. |
| API behind it | `GET https://letrfpwskjbgnyacesgv.supabase.co/functions/v1/ops` with header `x-ops-key: <password>` → `{ok, kpis, claims}`; `POST` `{action: approve|discard, message_id}`. Function `ops` v8 (deployed 14:47 CDT Sep 16). |
| Health check | `…/functions/v1/selftest?key=<password>&scenario=match` (also `mismatch`, `mismatch_then_fix`) → `"pass": true` in ~10 s. |

What it shows: eight KPIs (leads loaded, mailed, page views, opened, claimed, ready to submit, need DL update, need review) and the latest 200 claims with extraction summary, findings by severity, the 10-minute packet link and the agent's shadow-mode drafts with Approve / Discard.

What it cannot do, and why it is not enough for the test: no view of `inquiries` (three rows are already in the table from the new site's address forms and nobody can see them); no "Mark filed" (RUNBOOK §9.2 still says to set `filings.submitted_at` by SQL); no new-claim creation (CLI only, `trd/ops/new_claim.py`, needs the Mac and the roll); no funnel events (the site posts `typed_precheck`, `validation_shown`, `dl_fix_started`, `dl_fix_uploaded`, `card_skipped`, `packet_viewed` — 174 events so far — and nothing reads them); no post-filing states (`filed`, `approved`, `refunded`); no system health (last deploy, last selftest, last agent run); it is the retired prototype's brand and styling; and it lives on GitHub Pages, which is being retired at cut-over (ADR 0012).

## Goal

One page at **`https://cleanbillco.com/ops`** (route `/ops` in `apps/web`), behind the ops password, that lets one operator run the Oct 8 test from a phone or laptop without SQL or the Mac: watch the funnel, work every claim, answer inquiries, mark filings, create walkthrough claims, and see that the system is healthy. Working version first (password gate, one page, no accounts); Supabase Auth follows in Phase 2 (O-05).

## Design

### Route and auth
- `apps/web/src/app/(ops)/ops/page.tsx`, `robots: noindex`, no link from the marketing site.
- Login card asks for the ops password; stored in `sessionStorage` only (cleared when the tab closes); sent as `x-ops-key` on every call. The app stays a browser-only client (ADR 0017): no server route, no secret in Vercel.
- Three consecutive 403s clear the stored key and show the login again. The `ops` function already rate-limits nothing on 403 — add a 20/IP/hour limiter on failed keys (same pattern as the claim GET limiter).

### Sections (one page, anchored tabs; each is one component)
1. **Funnel.** KPI tiles: leads loaded · mailed · page views · opened · claimed · ready to submit · needs DL update · needs review · filed · approved · refunded. Below: the last 7 days of funnel events by kind (`view`, `typed_precheck`, `validation_shown`, `dl_fix_started`, `dl_fix_uploaded`, `card_saved`, `card_skipped`, `packet_viewed`, `inquiry`) as counts and as a step-conversion strip (view → claimed → ready → filed). Data: `GET /ops` gains `funnel: {by_kind_7d, by_kind_all, by_day_30d}`.
2. **Claims.** The existing list (status, property/customer, extraction summary, findings by severity with the code, packet link, messages and drafts) with filters by status, and per claim the actions: **Approve / Discard** draft (exists), **Mark filed** (SPEC-05 task 1: sets `filings.submitted_at`, `channel` default `email`, claim and lead → `filed`, drafts the "we submitted" message with intent `filed`, `audit_log` row), **Reprocess** (re-kicks `process-claim` for a claim stuck in `submitted`/`processing` — the RUNBOOK §9.5 "stuck" fix), **Withdraw** (claim → `withdrawn`, audit row). Send stays out until Task 4 (Resend) — the approved text is copied with one button until then.
3. **Inquiries.** Every `inquiries` row (kind, address, e-mail, company, properties, bills, source path, created) newest first, unhandled first; **Mark handled** with a note (`handled_at`, `notes`). Data: `GET /ops` gains `inquiries[]`; `POST {action: inquiry_handled, inquiry_id, notes}`.
4. **New claim.** Address or property id → preview (owner, situs, estimate, already-exempt flag) → Create → code and link `https://cleanbillco.com/claim/CB-…`. Same logic as `trd/ops/new_claim.py` but over the published `properties`/`leads` tables (16,776 rows), which is what the walkthrough needs; the Mac CLI keeps the full-roll case. Data: `POST {action: new_claim, prop_id|address, create: bool}`.
5. **Health.** Last deploy (commit, time, parity result, selftest results), last agent run (time, claims processed, result), last ETL/publish, function versions, and a **Run selftest** button per scenario that calls the `selftest` function and shows pass/fail and elapsed. Data: new table `system_status (key text primary key, value jsonb, updated_at)`; `deploy.yml`, `agent.yml` and `etl.yml` write their row at the end of each run with the service key (one `curl` step each); `GET /ops` returns `system: system_status[]`.

### `ops` function changes (`supabase/functions/ops/index.ts`)
- `GET` → `{ok, kpis (+filed, approved, refunded), funnel, claims, inquiries, system}`; claims list gains `?status=` and `?limit=` (default 200).
- `POST` actions: `approve`, `discard` (exist) + `mark_filed {claim_id, channel}`, `reprocess {claim_id}`, `withdraw {claim_id}`, `inquiry_handled {inquiry_id, notes}`, `new_claim {prop_id|address, create}`, `run_selftest {scenario}` (server-side call to `selftest` with the same key; returns its JSON). Every mutating action writes `audit_log` with `actor='ops'` and the action name; allowed status transitions are the ones in `trd/agent/store.py` — `mark_filed` only from `ready_to_submit`, `withdraw` from any open status, `reprocess` only from `submitted`/`processing`.
- Shared logic goes in `supabase/functions/ops/logic.ts` with Deno tests for each transition guard (3–6 tests).

### Data model
- New table `system_status` (migration `2026MMDDHHMMSS_system_status.sql`; RLS on; service role only) and `events.kind` unchanged (`inquiry` already exists). No change to `claims`, `filings`, `inquiries`.
- `docs/ARCHITECTURE.md` §4 (table) and §5 (ops flow, endpoints) updated in the same PR.

### Styling
The Clean Bill design system (SPEC-08 Part C): semantic tokens only, the component sheet (`.card`, `.pill`, `.btn`, plus the `.table`, `.kpi`, `.badge`, `.toolbar`, `.drawer` classes Part C adds for this page), status badges from the one map in `src/lib/status.ts`; every new component appears on `/design-system`. Dense tables, no photography, phone-usable (the walkthrough is watched from a phone). No new dependencies. No hex literal in the page (the Part C lint enforces it).

### Out of scope (later specs)
Supabase Auth and per-operator identity (O-05, Phase 2); sending e-mail (Task 4, Resend); the post-filing monitor view with record checks and evidence (SPEC-05 task 7 — the `filed`/`approved`/`refunded` KPIs and the claim list are the placeholder); the prospect-intelligence map (O-11, G-27); customer accounts.

## Task table (dependency order; AI = Claude Code end to end, C = Charlie, AI→C = Claude does, Charlie approves)

| # | Task · branch | Owner | Depends on | Effort | Done when |
|---|---|---|---|---:|---|
| D1 | `ops-api` — ops function: funnel, inquiries, system rows, the six POST actions, `logic.ts` + tests, `system_status` migration, workflow steps writing status | AI | SPEC-08 R1–R5 merged (plan v3.2 gate) | 0.5 day | CI green; selftest passes; `curl` of `GET /ops` shows the new keys; `mark_filed` on the synthetic claim transitions and writes the audit row; PR open, stop for review |
| D2 | `ops-web` — `/ops` page with the five sections, session key, 403 handling, built on the design system; `eval/web_smoke.py` scenario E (login → KPIs render → approve a draft → inquiry handled → new claim preview → health renders); `apps/web/README.md` route row | AI | D1; SPEC-08 R5 (design system) | 1 day | Smoke E passes on the preview; Lighthouse accessibility ≥ 90 on `/ops`; new components on `/design-system`; PR open, stop for review |
| D3 | Retire `docs/ops.html` (page replaced by a one-line pointer to `/ops`), RUNBOOK §9.1 (ops = `https://cleanbillco.com/ops`), §9.2 daily loop rewritten without SQL, §9.5 | AI | D2 merged, domain attached (SPEC-08 R2) | 1 h | RUNBOOK daily loop has no SQL step; old page redirects |
| D4 | Review on the phone; confirm the walkthrough can be run from `/ops` alone | C | D3 | 20 min | Charlie creates a walkthrough claim from `/ops`, watches it through `ready_to_submit`, marks it filed |
| D5 | Supabase Auth (magic link) replacing the shared password; operator id in `audit_log` | AI | after the test (Phase 2) | 1 day | O-05 closed |

Charlie's manual input: D4 only (and the ops password, which he already has). D1–D3 are AI end to end; D5 is deferred by decision, not by dependency.

## Acceptance
- Everything in RUNBOOK §9.2 (daily loop) is doable from `/ops` with no SQL and no Mac: check KPIs, review a packet, approve a draft, mark filed, answer an inquiry, create a walkthrough claim, run the selftest.
- The three existing inquiries are visible and can be marked handled.
- `GET /ops` p95 under 2 s with 200 claims (count queries as today; events aggregated in SQL, not in the function).
- No driver's-license number (masked or not) and no card data appears on the page or in the API response — grep test in the smoke scenario.
- Wrong password → 403, three times → login shown again, 20 failures/IP/hour → 429.
- `docs/ops.html` retired; `CHANGELOG.md`, `docs/ARCHITECTURE.md` §4/§5, ADR ("ops moves into the web app; password gate until O-05") in the PR.

## Glossary

**ADR** architecture decision record · **Audit row** a line in `audit_log` recording who did what · **CI** continuous integration · **DL** driver's license · **Funnel event** a row in `events` posted by the site as the customer moves through the flow · **G-nn / O-nn** gap-register item / open decision · **KPI** key performance indicator — a count on a tile · **Magic link** e-mail sign-in without a password · **Ops** operations — the operator's (Charlie's) console · **p95** the time within which 95% of requests complete · **Reprocess** re-run `process-claim` on an existing claim · **RLS** row-level security · **Selftest** the one-URL end-to-end health check · **Service key** Supabase's server-only admin key · **sessionStorage** browser storage that lasts until the tab closes · **Shadow mode** the agent drafts, a human approves · **Smoke test** the Playwright script that drives the site end to end (`eval/web_smoke.py`) · **`system_status`** the new table that workflows write their last-run result into · **429** "too many requests" · **403** "forbidden" (wrong password).
