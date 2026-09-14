# ADR 0007: license data minimisation

- **Date:** 2026-09-07
- **Status:** Accepted
- **Handbook ID:** T-07

## Decision

DL numbers stored masked (`***1234`); license images only in the private `ids` bucket; purged 30 days after filing / 7 days after withdrawal / 180 days stale; 10-minute signed URLs for packets.

## Rationale

Tax Code §11.48 makes license numbers on applications confidential; least data.

## Revisit when

—
