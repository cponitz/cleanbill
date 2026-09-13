# ADR 0010: etl runs on the mac

- **Date:** 2026-09-07
- **Status:** Accepted
- **Handbook ID:** T-10

## Decision

The TCAD ETL runs on Charlie's Mac, manually; the `tcad-etl` workflow is `workflow_dispatch` only.

## Rationale

The export is ~17 GB unzipped — too big for a hosted runner; traviscad.org is blocked from the Cowork sandbox.

## Revisit when

Revisit if a slim server-side cut or a TCAD API appears.
