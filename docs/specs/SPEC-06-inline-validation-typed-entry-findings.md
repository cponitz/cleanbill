# SPEC-06 — Inline validation, typed license entry, structured findings

*Status: approved (B-15, T-13) · Priority P0 · Phase 1 (with SPEC-04b) · Owner: Claude Code · Handbook refs: §3 panel, §4.1 claims.findings and documents.kind, §5.3, G-25, G-26, G-28*

## Problem
Today the page says "thanks" and the outcome arrives later by email. The customer should learn within seconds whether their license matches and exactly what to fix, while they are still on the page. Findings must be structured so page, ops and agent say the same thing.

## Behaviour
1. **Structured findings.** `claims.findings` is an array of `{code, severity: blocking|warning|info, field, message, detail}`. Codes: `not_readable, not_texas_id, name_mismatch, signer_mismatch, low_confidence, under_18, address_mismatch, expired, over_65, not_primary, other_homestead, processing_error`. One rule table (`trd/findings.py` and a generated `findings.ts`) maps code → severity, customer-facing sentence, ops sentence, next action. `validate.ts` / `validate.py` emit codes, not sentences.
2. **Inline result.** After the POST, the page polls `GET /claim?c=CODE&claim=<id>` every 2 s (max 30 s) until status ≠ `submitted|processing`, then renders: `ready_to_submit` → "Your license matches. Here is your Form 50-114 — check the four highlighted fields" (packet preview via a short-lived signed URL) → card step (SPEC-03) → done; `needs_dl_update` → the fix screen (SPEC-02); `needs_review` → the specific question for the code (e.g. name_mismatch: "The name on the license is X; the appraisal roll lists Y — are you on the deed?") with a text reply box that stores an inbound `messages` row; `processing_error` → "we hit a snag; we'll email you within one business day" (ops alert).
3. **Typed pre-check.** Before the photo step, optional fields: name as on license, address as on license, ZIP. On blur, a lightweight client call to a new `GET /claim/precheck?c=…&address=…&zip=…` runs `addressMatches` only and shows immediately: "matches the property" or "doesn't match — you'll need to update it at DPS before TCAD will approve; you can still continue and fix it after". Stored as a `documents` row with kind `typed_id` (no file), `extracted.source = "typed"`, confidence 1.0.
4. **Typed fallback.** When extraction returns `not_readable` or `low_confidence` on a field, the result screen shows the typed fields pre-filled with what was read, asks the customer to confirm or correct, and re-validates from the confirmed values (extraction row keeps the model output; a `typed_id` row holds the confirmation). The photo remains required for filing (§11.43(j) requires a copy).
5. **Funnel events**: `validation_shown` (with status and codes), `dl_fix_started`, `typed_precheck` (match true/false), `card_saved`, `card_skipped`, `packet_viewed`.
6. Agent prompt updated to read findings by code.

## Data changes
`claims.findings` (SPEC-04); `documents.kind` += `typed_id`; `events.kind` values; `precheck` endpoint (rate-limited like GET).

## Acceptance
- On the selftest `match` scenario the page reaches the packet preview within 12 s without a reload; on `mismatch` the fix screen appears with both addresses.
- Findings rendered on page, ops and in the agent's draft for the same claim use identical wording from the rule table (snapshot test).
- Typed pre-check with the synthetic property's address returns match; with another address returns mismatch; both under 300 ms.
- Deno and Python validators emit identical codes for the shared fixture (G-9).

## Out of scope
Replacing the photo with typed data for filing; OCR quality improvements beyond the fallback (G-28).

## Amendment 2026-09-14
- Split into **06a (API, Task 1)** and **06b (UI in `apps/web`, Task 2)**. API contract for 06a: `GET /claim?c&claim` → `{status, findings[], packet_url?}`; `GET /claim/precheck?c&address&zip` → `{match: bool, id_address, situs}`; `POST /claim` typed-confirmation fields; `POST /claim/events {c, kind, detail}`; all rate-limited like the existing GET.
- Rule table: `trd/findings.py` is the source; `supabase/functions/_shared/findings.ts` is generated (`python -m trd.findings --emit-ts`) and CI fails if it is stale. G-9 closes here: both validator suites read `tests/fixtures/cases.json` and a snapshot test asserts identical rendered sentences.
- Funnel events add `dl_fix_uploaded` (SPEC-02).
