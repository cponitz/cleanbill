# ADR 0013: structured findings

- **Date:** 2026-09-12
- **Status:** Accepted
- **Handbook ID:** T-13

## Decision

Validation findings are structured data (`claims.findings` jsonb: `{code, severity, field, message, detail}` with an enum of codes); prose is generated at render time from one rule table shared by page, ops and agent.

## Rationale

A concatenated string cannot be filtered, counted or translated, and three renderers would drift.

## Revisit when

See SPEC-06.
