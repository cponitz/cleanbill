# ADR 0008: claim code as credential

- **Date:** 2026-09-07
- **Status:** Accepted
- **Handbook ID:** T-08

## Decision

Random `TRD-XXXX-XXXX` codes (32-symbol alphabet, no 0/O/1/I) are the only credential to a claim page; 120 views per IP per hour.

## Rationale

Unguessable (~1.1 × 10^12), human-typeable from a letter, no login for a one-time customer.

## Revisit when

Revisit on evidence of enumeration in `events.view_miss`.

## Note (SPEC-08, 2026-09-17)

The prefix changed from `TRD-` to `CB-` with the Clean Bill rebrand (B-19). Format, alphabet and entropy are unchanged; migration `20260917190625_cb_claim_codes.sql` rewrote every existing code (and `events.claim_code`) with the body preserved, and the API rejects `TRD-` codes (nothing had been printed or mailed).
