# ADR 0002: model mix haiku extraction sonnet agent

- **Date:** 2026-08-22
- **Status:** Accepted
- **Handbook ID:** T-02

## Decision

`claude-haiku-4-5` for license extraction and classification; `claude-sonnet-5` for the claims agent.

## Rationale

Extraction costs ≈ $0.004 per license at 96.7% field accuracy on the eval set; reasoning is needed only where the agent decides.

## Revisit when

Revisit when eval accuracy drops below 95%, when a cheaper model matches, or to pursue the 99% target (G-28).
