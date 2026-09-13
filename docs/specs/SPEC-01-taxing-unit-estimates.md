# SPEC-01 — Taxing-unit-aware refund estimates

*Status: approved (O-03, B-18) · Priority P0 · Phase 0 · Owner: Claude Code · Handbook refs: §3.1 module 4, §4.1 property_entities, G-2, G-31*

## Problem
`trd/estimator/rates.py` hard-codes five City-of-Austin / Austin ISD taxing units and applies them to every lead. Only ~5,700 of 14,366 Tier-1 leads are inside the City of Austin (Pflugerville 988, Manor 406, Del Valle 203, Lakeway, Lago Vista, …). A refund figure in a §41.0051-regulated advertisement must be right for the property it is printed on.

## Behaviour
1. Every property carries its own list of taxing units from TCAD's `PROP_ENT` file (already cut to `PROP_ENT_slim.txt.gz` on Charlie's Mac: prop_id, entity_cd, entity name, assessed/taxable value, appraised value, partial flag; 3.13M rows).
2. The estimate for a lead sums savings only over that property's units.
3. The rate table becomes data (`trd/estimator/rates/*.json` or a single table): one entry per Travis County taxing unit and tax year with `rate_per_100`, `hs` (type amount|pct, amount, min), `ov65`, `ceiling`, `confirmed` (bool per figure), `source` (URL + date). Cover tax years 2024, 2025 and — as units adopt them in Sep–Oct — 2026 (G-31).
4. `leads.estimate_unconfirmed = true` when any unit on the property lacks a confirmed rate or exemption for any refund year. Batch selection (G-7) excludes unconfirmed leads.
5. `leads.est_refund_by_year` gains a per-unit breakdown: `{"2024": {"total": 2073.4, "units": {"AISD": 950.5, "CITY": …}}}`.
6. Letters (`trd/letters/generate.py`) name the property's actual units in the §41.0051(b) block and in the refund math.
7. The Gate-1 report is re-run: lead counts and median estimate by unit; share unconfirmed; the $58.6M unclaimed figure restated.

## Data changes
- New table `property_entities (prop_id bigint fk, entity_cd text, entity_name text, entity_type text, taxable_value numeric, assessed_value numeric, primary key (prop_id, entity_cd))`, migration `0004_property_entities.sql` (0003 is SPEC-04).
- ETL: `trd/etl/load.py` gains a `--entities` input; `publish.py` upserts property_entities for published leads only (~16.8K × ~6 units).

## Acceptance
- The existing test `$600K Austin home → $4,596` still passes with the property's units resolved to AISD + City + County + ACC + Central Health.
- A Pflugerville ISD / City of Pflugerville property yields a different figure that reconciles to a hand calculation in the PR description (rates cited).
- 5 leads from `verification_pack_25_leads.xlsx` reconcile within 5% of a manual calculation.
- Report in the PR: leads by school district and city, median estimate per group, count and share of unconfirmed leads, before/after totals.
- Unit tests for: pct-with-minimum exemptions, OV65 stacking per unit, a unit missing a year → unconfirmed.

## Out of scope
Prior-year values (G-15 / G-27), OV65 targeting, ESD/MUD partial-year proration beyond what PROP_ENT's partial flag gives.
