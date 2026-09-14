# ADR 0009: official form 50 114 via pdf lib

- **Date:** 2026-09-07
- **Status:** Accepted
- **Handbook ID:** T-09

## Decision

The packet is the official Comptroller Form 50-114 (Rev. 02-26/39) filled with pdf-lib in `process-claim` (pypdf mirror in Python), `/s/ Name` on the signature widget, flattened, audit page appended; the interim data sheet remains a fallback.

## Rationale

TCAD accepts the Comptroller form; the data sheet was a bridge.

## Revisit when

Revisit when the Comptroller revises the form (field map breaks).
