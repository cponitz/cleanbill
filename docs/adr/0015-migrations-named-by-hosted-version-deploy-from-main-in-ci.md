# ADR 0015: migrations named by the hosted version; deploy from main in CI

- **Date:** 2026-09-13
- **Status:** Accepted
- **Handbook ID:** (SPEC-04 §8; CLAUDE.md "Supabase is deployed only from main")

## Decision

Migration files in `supabase/migrations/` are named `<version>_<name>.sql` where `<version>` is exactly the value in the
hosted project's `supabase_migrations.schema_migrations` (a `YYYYMMDDHHMMSS` timestamp), and every migration that has
ever been applied to the hosted project is a file in the repo — including ones first applied through the dashboard or
the MCP connector. New migrations take the current UTC timestamp as their version. Schema changes reach the hosted
project only through `deploy.yml` on `main` (`supabase db push`, then `supabase functions deploy`), and that workflow
fails if `supabase db diff --linked` is not empty afterwards. Pull requests prove the chain applies cleanly by running
it against a scratch Postgres in `ci.yml`.

## Rationale

The prototype's `0001…` names could never be pushed (the CLI would try to re-apply them) and three server-only
migrations meant "migrations = live schema" was false. Keying files by the hosted version is the only way the CLI's
push/diff/repair commands line up, and it makes drift a CI failure instead of a discovery. Deploying from `main` only
keeps a branch from changing production before review (the SPEC-01 table was applied from a branch through the MCP
on 2026-09-13 — the last time that should happen).

## Revisit when

Supabase branching is adopted for preview databases, or the project moves off the hosted CLI workflow.
