# SPEC-02 — License re-upload for `needs_dl_update`

*Status: approved · Priority P0 · Phase 1 · Owner: Claude Code · Handbook refs: §5.3, G-6, G-30, O-10*

## Problem
A customer whose license address did not match the property is told to update it at DPS, but has no way to send the new license except email. The claim dies silently. This is the #1 predicted drop-off.

## Behaviour
1. Opening the claim link (`?c=CODE`) for a claim whose status is `needs_dl_update` shows a "fix" state instead of the form: what did not match (from `claims.findings`, code `address_mismatch`, with the ID address and the property address side by side), the DPS online change link (`https://www.dps.texas.gov/section/driver-license/change-your-address`), what DPS will ask for (DL number, audit number, last-4 SSN, card), expected time (~10 minutes), and one file input: "upload your updated license (or the DPS confirmation)".
2. POST to the claim API with `c`, `dl_front` (and optional `dl_back`) for a claim in `needs_dl_update`: store a new `documents` row (kind `dl_front`, new storage path), set claim status `processing`, re-kick `process-claim`. The old image stays for the purge job.
3. `process-claim` uses the newest `dl_front` document. If the new address matches → `ready_to_submit`, packet regenerated, "ready to review" draft; if not → stays `needs_dl_update`, findings updated, draft explains again.
4. Agent (`trd/agent/system_prompt.md`) already handles "newer document exists → re-extract"; verify the store returns documents newest-first.
5. Events: `dl_fix_started` (page shown), `dl_fix_uploaded`.
6. In the Vercel front-end (SPEC-04b) the same state is the "fix" screen; with inline validation (SPEC-06) the result shows immediately.

## Data changes
None beyond `documents` rows; `events.kind` values added.

## Acceptance
- Selftest gains scenario `mismatch_then_fix`: mismatch ID → `needs_dl_update` → matching ID uploaded via the new path → `ready_to_submit` with a new packet; `"pass": true`.
- Browser smoke test covers the fix screen.
- A claim not in `needs_dl_update` posting to the fix path gets 409.

## Out of scope
Any other status; email-attachment intake (G-17); performing the DPS change for the customer (O-10 decided against).
