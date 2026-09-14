# ADR 0005: functions are json apis no html from supabase

- **Date:** 2026-09-07
- **Status:** Accepted
- **Handbook ID:** T-05

## Decision

Supabase edge functions serve JSON only (CORS-enabled); no HTML is ever served from `*.supabase.co`.

## Rationale

Supabase forces `content-type: text/plain` and a sandbox CSP on every response from its domain, so HTML renders as raw text. Keeping the back end API-only is what lets the front-end move hosts (ADR 0012) without touching it.

## Revisit when

—
