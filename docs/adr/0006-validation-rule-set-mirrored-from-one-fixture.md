# ADR 0006: validation rule set mirrored from one fixture

- **Date:** 2026-09-07
- **Status:** Accepted
- **Handbook ID:** T-06

## Decision

Validation = ID vs owner-of-record (eligibility) + ID vs typed signature (identity) + normalised address incl. unit + Texas-ID check + expiry warning + age → OV65 flag + low-confidence → review. Implemented in TypeScript (`validate.ts`) and Python (`trd/agent/validate.py`), both generated/tested from one shared fixture (G-9).

## Rationale

Each check maps to a TCAD denial reason. Duplication is the cost of running the same rules inside the edge function and inside the agent.

## Revisit when

Revisit when a validation bug is found in only one copy.
