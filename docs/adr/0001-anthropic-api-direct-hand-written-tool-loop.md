# ADR 0001: anthropic api direct hand written tool loop

- **Date:** 2026-08-22
- **Status:** Accepted
- **Handbook ID:** T-01

## Decision

Use the Anthropic Messages API directly with a hand-written ~60-line tool loop (`trd/agent/loop.py`); no agent framework, no Managed Agents.

## Rationale

Learning objective of the project; native tool use, structured output, vision and prompt caching are all first-class in the API; a fixed tool set has a smaller blast radius than a general-purpose agent harness for a business workflow.

## Revisit when

Revisit when multi-agent orchestration is needed or volume exceeds ~1K claims/week.
