# ADR 0011: github actions as batch runtime

- **Date:** 2026-09-07
- **Status:** Accepted
- **Handbook ID:** T-11

## Decision

GitHub Actions runs the claims agent and (SPEC-05) the record monitors. The agent schedule is disabled until test data exists; run with `workflow_dispatch`.

## Rationale

Free, scheduled, secrets management, artifacts for traces; no server to run.

## Revisit when

Revisit if sub-30-minute latency or > 2,000 minutes/month is needed.
