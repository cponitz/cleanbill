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
