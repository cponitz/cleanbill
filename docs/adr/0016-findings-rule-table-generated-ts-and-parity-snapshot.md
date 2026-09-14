# ADR 0016: one findings rule table in Python, TypeScript generated from it, parity proven by a snapshot

- **Date:** 2026-09-14
- **Status:** Accepted
- **Handbook ID:** SPEC-06 §1 (T-13 follow-through), G-9

## Decision

`trd/findings.py` is the only place a finding code is mapped to its severity, field, operator sentence, customer sentence
and next action. `supabase/functions/_shared/findings.ts` is generated from it (`python -m trd.findings --emit-ts`) and
CI fails when the generated file is stale. Both validators (`trd/agent/validate.py`, `supabase/functions/_shared/validate.ts`)
emit only a code and the facts (`detail`); the sentence stored in `claims.findings[].message` and the `customer_message`
the claim API returns are rendered from the table at write/read time. Parity is proven, not assumed: both test suites run
the shared cases in `tests/fixtures/cases.json` (`validation_cases`) and compare the fully rendered output to
`tests/fixtures/findings_snapshot.json`, which the Python side generates (`--emit-snapshot`) and CI checks.

Two consequences for the claim flow:

- The typed pre-check (SPEC-06 §3) runs before any claim exists, so it is recorded as an `events` row (`typed_precheck`)
  when it happens, and becomes a `documents` row of kind `typed_id` only when the page sends the typed fields along with
  the signed claim (or later, as the typed confirmation of an unreadable photo). `documents.storage_path` is nullable for
  that kind only (migration `20260914181236_typed_id_documents.sql`).
- Follow-ups on an existing claim reuse `POST /claim` (same code, same multipart form): a `dl_front` while the claim is
  `needs_dl_update` is the SPEC-02 re-upload; `typed_*` fields while it is `needs_review` for `not_readable`/`low_confidence`
  are the SPEC-06 §4 confirmation; anything else is 409. The routing decision is a pure function (`claim/logic.ts`) so it is
  unit-tested without the runtime.

## Rationale

Python was chosen as the source because the letters, the agent and the ETL already live there and pytest is the suite
Charlie runs first; TypeScript is the consumer with the smallest surface (render, make, list). Generating rather than
hand-mirroring means a wording change is one edit, one regenerate, and a red CI if either step is forgotten. A snapshot
of the rendered output (rather than of the rule table alone) catches the drift ADR 0006 warned about — different facts in
`detail`, a different finding order, a `today` that is not pinned — because it exercises the validators end to end.
Storing the ops sentence in `message` keeps the ops page and the agent working unchanged; returning `customer_message`
from the API keeps the page free of any copy so wording stays reviewable in one file.

## Revisit when

Findings need a second language (G-23): add a `customer_es` column to the table and a locale argument to `render`, and
extend the snapshot per locale. Or when the page is allowed to import `findings.ts` directly (shared TypeScript package),
in which case the API can stop returning `customer_message`.
