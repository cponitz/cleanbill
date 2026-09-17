# ADR 0020: the operator console moves into the web app; a password gate until O-05; every system reports its status through the ops API

- **Date:** 2026-09-17
- **Status:** Accepted
- **Handbook ID:** SPEC-09 (SPEC-04b §2 deferred `/ops`, SPEC-05 task 1, O-05, ADR 0012, ADR 0017)

## Decision

1. **One operator API, the `ops` edge function, is the only write path for an operator.** `GET /ops` returns everything the
   console shows (KPIs, funnel, claims with filters, inquiries, system status); `POST /ops {action, …}` performs the
   daily loop's actions — `approve` / `discard` a draft, `mark_filed`, `reprocess`, `withdraw`, `inquiry_handled`,
   `new_claim` (preview / confirm over the published properties), `run_selftest`, `system_status`. Every mutating action
   writes an `audit_log` row with `actor = 'ops'`. The status transitions an operator may trigger are the agent's
   (`ALLOWED_TRANSITIONS` in `trd/agent/store.py`, mirrored in `supabase/functions/ops/logic.ts`, both extended so
   `withdrawn` is reachable from every open status); the guards live in `logic.ts` with Deno tests. Nothing sends
   (Task 4), nothing charges (B-13).
2. **The funnel is aggregated in SQL.** Two plain SQL functions (`ops_events_by_kind`, `ops_events_by_day`) group the
   `events` table; the edge function never pulls event rows. Packet links are signed in one batch.
3. **Workflows report through the same API.** `deploy.yml`, `agent.yml` and `etl.yml` end with one `curl` that posts
   `{action: "system_status", key, value}` with the ops password (a secret every workflow already may read), into the
   new `system_status` table (`key`, `value jsonb`, `updated_at`). The console's Health section reads it. This avoids
   giving the deploy workflow the service-role key or a direct database connection.
4. **The console is a page in `apps/web` (`/ops`, SPEC-09 D2), behind the shared ops password until Supabase Auth
   (O-05, Phase 2).** The password lives in `sessionStorage` for the tab and travels as `x-ops-key`; the app stays a
   browser-only client with no server route and no secret in Vercel (ADR 0017). Failed keys are counted per IP as
   `events` of kind `ops_auth_fail` (20 per hour → 429), like the claim API's limiter. The GitHub Pages `docs/ops.html`
   is retired once the page ships (D3).

## Rationale

The daily loop still needed SQL (mark filed), the Mac (new claim) and the database UI (inquiries). Putting the actions
behind the existing password-gated function keeps one audit trail and one place for status guards, and lets the
console be built on the design system (ADR 0019) without a second backend. Reporting run status through the API rather
than a direct connection keeps secrets where they already are.

## Consequences

- `system_status` is written by workflows only; a manual deploy from the Mac leaves the `deploy` row stale (the row
  carries its `updated_at`, so the console shows the age).
- `new_claim` from the console works only for the 16,776 published properties (which is what the walkthrough needs);
  a property outside the lead list still needs `python -m trd.ops.new_claim` on the Mac and the roll.
- Function versions are not reported (the CLI does not expose them without a management-API call); the deploy row
  records the commit and the step outcomes instead.

## Revisit when

Supabase Auth replaces the shared password (O-05: operator identity in `audit_log`); the agent gains send (Task 4) or
charge tools (SPEC-05), which must not be reachable from this API without their own decision IDs.
