# ADR 0003: supabase for postgres storage functions

- **Date:** 2026-08-22
- **Status:** Accepted
- **Handbook ID:** T-03

## Decision

Supabase hosts Postgres, private storage buckets and the four edge functions.

## Rationale

Already connected to Cowork; free tier; row-level security; the Supabase MCP and CLI make deploys reproducible.

## Revisit when

Revisit at free-tier limits (500 MB DB, 1 GB storage).
