# SPEC-05 — Post-filing: mark filed, monitor official records, notice, charge

*Status: approved (B-13, B-17) · Priority P1 (tasks 1–3 in Phase 2, 4–6 by Dec 18) · Owner: Claude Code · Handbook refs: §5.7 and Figure 5.4, §4.1 filings/record_checks/refunds, G-10, G-11, G-12*

## Problem
Nothing moves a claim past `ready_to_submit`. Fees must be triggered by official records — never by the customer's say-so — and charged only after an observed refund with notice.

## Records
- **R1** TCAD roll supplement (monthly zip, already loaded by the ETL): `hs_exempt` per account. Authoritative; ~30-day latency.
- **R2** TCAD property portal: `https://travis.prodigycad.com/property-detail/{prop_id}/{year}` — JavaScript app. Task 2 starts by inspecting it with Playwright to confirm the exemption field and capture the underlying JSON request (prefer calling that over rendering). One page per filed claim per week; respect the site's "not for bulk transfer" notice.
- **R3** Travis County Tax Office account: `https://travis.go2gov.net/cart/responsive/search.do` (server-rendered). Task 4 starts by inspecting an account page to confirm whether refunds/adjustments appear as line items and what the per-account URL is. The Tax Office states it refunds automatically within 60 days of a change that lowers a paid bill (§11.431(b): collector pays within 60 days of the chief appraiser's notice).
- **R4** Customer reply — backstop only.

## Tasks
1. **Mark filed** (ops action): sets `filings.submitted_at`, `channel` (`email` default), claim and lead → `filed`, drafts the "we submitted" email (agent intent `filed`), audit row. Charlie forwards the packet to `CSInfo@tcadcentral.org` until Resend attaches it (G-5).
2. **Approval watch — R1 diff**: after each ETL run, for every filing with `submitted_at` and no `approved_at`, compare `hs_exempt`; a flip → `record_checks` row (source `roll_supplement`, changed true), `filings.tcad_status = exemption_shown`, `approved_at`, claim → `approved`, draft the "approved" email.
3. **Approval watch — R2 portal**: weekly GitHub Actions job (`monitor.yml`) using Playwright; same outcome as task 2 with source `tcad_portal` and a screenshot in the private `evidence/` bucket. Denial seen → `denied_at`, `denial_reason`, claim → `denied`, ops alert (G-18).
4. **Refund watch — R3**: weekly for claims in `approved`; parse statements; refund/adjustment lines → `refunds` rows (unit, year, amount, observed_at, source `tax_office`, evidence_path, record_check_id). Claim → `refunded` when the first row lands. If nothing by day 75 after approval → ops task "ask customer" (R4); a customer-reported amount creates a row with source `customer` that requires operator confirmation before task 5 runs.
5. **Notice**: on each new `refunds` row: `fee_amount = floor(amount × 0.25)`, capped so the claim's total fees ≤ 1.1 × `leads.est_refund_total`; email (intent `refund_notice`) with the evidence attached, the fee, and a one-click dispute link (sets `dispute_status = open`, blocks the charge); `notice_sent_at`.
6. **Charge**: 3 business days after notice, if no open dispute: Stripe PaymentIntent on the account's saved payment method for `fee_amount`, `charged_at`, `stripe_payment_id`, receipt email; when all expected units are charged, claim → `paid`, lead → `refunded` → `closed`.
7. Ops: a "post-filing" view listing filed/approved/refunded claims with last check, next check, evidence links, dispute state; manual override buttons audit-logged.
8. Exceptions encoded: escrow-paid accounts (refund to servicer) route to an ops task, never auto-charge; partial refunds charge per row; denial never charges.

## Data changes
Per handbook §4.1: `record_checks` table; `refunds` columns `evidence_path, record_check_id, notice_sent_at, dispute_status, charged_at`; `filings.tcad_status` enum values; new private bucket `evidence/`; `monitor.yml` workflow; secrets `STRIPE_SECRET_KEY`.

## Acceptance
- Fixture test: a filed claim whose roll flag flips becomes `approved` with a `record_checks` row and a draft.
- Live test on the synthetic property is impossible (TCAD has no record) — use a real approved property Charlie designates (his own home, already exempt) to prove R2 and R3 parsing end to end without charging (flag `CHARGE_ENABLED=false`).
- No code path can create a Stripe PaymentIntent without: a `refunds` row with an official source (or customer source + operator confirmation), `notice_sent_at` ≥ 3 business days old, `dispute_status != open`. Unit tests assert each guard.
- Every status change after `filed` has a `record_checks` or `audit_log` row with evidence or an operator id.

## Out of scope
Protest handling (G-18 hand-off only), interest on late refunds (§31.12 — note it, don't compute it), multi-county collectors.
