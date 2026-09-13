# Texas Refund Desk — instructions for Claude Code

## What this is
Finds Travis County homeowners who never claimed the residence homestead exemption, tells them
what refund they are owed (Tax Code §11.431 two-year look-back), and prepares the owner-signed
Form 50-114. Fee: 25% of the refund actually received, $0 otherwise. Read docs/ARCHITECTURE.md
before touching anything; it defines every module, table, column and flow.

## Sources of truth
- Code, schema, deploys, technical decisions: THIS REPO (docs/ARCHITECTURE.md, docs/adr/, CHANGELOG.md).
- Naming: the product, repo, Supabase project, Vercel project and Mac folder are all `texas-refund-desk`;
  the Python package is `trd`. Do not introduce other names.
- Business decisions, specs, plans, research: the Cowork project "Texas Refund Desk"
  (claude/decisions.md, claude/specs/). Never make a business decision here — if a task needs one
  and no decision exists, stop and ask; do not guess.
- Copy in copy/*.md is compliance-reviewed; change wording only from an approved spec.

## Hard rules
- Supabase is deployed only from main. Never edit the dashboard by hand. Every schema change is a
  migration file in supabase/migrations/ AND an update to docs/ARCHITECTURE.md §4 in the same PR.
- The agent (trd/agent) stays in shadow mode: no tool may send, file, charge or delete. Adding such a
  tool requires a decision ID from claude/decisions.md in the PR description.
- Fees: a charge happens only after an observed refund in an official record + notice (B-13, SPEC-05).
  Never write code that charges on approval or on a customer's reply.
- Data model v2 (SPEC-04): `customers` = person/account, `claims` = engagement, `filings` = packet.
  Findings are structured (`claims.findings` jsonb); never build prose status strings.
- Never log, print or store an unmasked driver's-license number. Images live only in the private
  `ids` bucket and are purged by trd/jobs/purge_ids.py.
- Refund figures shown to a homeowner are rounded DOWN (estimator.conservative_display). Letters keep
  the §41.0051 14-pt bold disclaimer and name the taxing units. Do not touch those lines.
- Validation rules exist twice (supabase/functions/process-claim/validate.ts and trd/agent/validate.py);
  change both from the shared fixture, run both test suites.
- Secrets: .env (git-ignored), GitHub Actions secrets, app_settings. Never in code or docs.

## Workflow
1. Start from a spec in claude/specs/ (copy it to docs/specs/ in the branch). One branch per spec.
2. Tests: `python -m pytest -q` (Python), `deno test supabase/functions/` (TS), `python eval/browser_smoke.py`
   (end-to-end, needs network). CI must be green before merge.
3. Deploy: `supabase functions deploy <name> --use-api --project-ref letrfpwskjbgnyacesgv` for each changed function
   (per-function `verify_jwt` is in supabase/config.toml; `--use-api` bundles server-side, no Docker); `supabase db push` for migrations.
4. Every PR: entry in CHANGELOG.md (what shipped; data-model changes called out); ADR in docs/adr/ for any
   technical decision; ARCHITECTURE.md updated if a module, table, flow or status changed.
5. The ETL (trd/etl) runs on Charlie's Mac only (17 GB export). Do not schedule it on hosted runners.

## Environment
Supabase project texas-refund-desk (ref letrfpwskjbgnyacesgv). Front-end: Next.js on Vercel (apps/web) once SPEC-04b
lands; docs/ static pages are the fallback until cut-over. Batch: GitHub Actions (agent.yml schedule disabled until
test data exists — run manually; etl.yml manual). Models: claude-haiku-4-5 (extraction), claude-sonnet-5 (agent).
Sandbox cannot reach traviscad.org or api.supabase.com; use the Supabase MCP or CLI for deploys.

## Glossary
TCAD Travis Central Appraisal District · roll the certified property list · situs the property's address ·
HS/OV65/DP/DVHS exemption flags · DL driver's license · Form 50-114 the homestead application ·
claim = one claims row (v2) + its documents/filings/messages · customer = the person/account · shadow mode = agent drafts, human sends.
