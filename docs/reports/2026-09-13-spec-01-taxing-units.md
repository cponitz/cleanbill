# SPEC-01 report — taxing-unit-aware estimates (Gate-1 re-run)

*Generated 2026-09-13 from the 2026 certified roll (Supp 0, 2026-07-18) with `PROP_ENT_slim` loaded; as-of date 2026-09-13; same lead heuristic as before (22,889 leads: 14,366 Tier 1, 2,409 Tier 2, 6,114 Tier 3). Aggregates only — no owner data.*

## Before / after

| Figure | Before (five Austin units for every lead) | After (each property's own units) |
|---|---|---|
| Tier-1 median estimate | $3,701 | $3,646 |
| Tier-1 mean estimate | $4,076 | $4,037 |
| Tier-1 total ("unclaimed") | $58,556,021 | $58,000,261 |
| Tier 1+2 total | $64,363,386 | $63,747,465 |
| Leads whose estimate changed | — | 9,456 of 16,775 (5,808 down, 3,648 up) |
| Leads flagged `estimate_unconfirmed` (Tier 1+2) | 0 (flag never set) | 1,856 (11.1%) |
| Leads with no PROP_ENT rows | — | 0 |

The headline number barely moves because two effects cancel: leads outside the City of Austin lose the city's 20% exemption (down), while leads in school districts with higher rates than Austin ISD (Pflugerville, Del Valle, Manor, Lake Travis, Lago Vista, Elgin, Hays) gain (up).

## Leads by school district (Tier 1+2)

| School district | Leads | Median estimate | Unconfirmed |
|---|---:|---:|---:|
| AUSTIN ISD | 7,757 | $3,695 | 68 |
| PFLUGERVILLE ISD | 2,645 | $3,377 | 274 |
| DEL VALLE ISD | 1,786 | $2,928 | 396 |
| MANOR ISD | 1,712 | $3,228 | 39 |
| LAKE TRAVIS ISD | 821 | $6,016 | 262 |
| LEANDER ISD | 551 | $3,786 | 415 |
| ROUND ROCK ISD | 509 | $3,307 | 129 |
| ELGIN ISD | 322 | $3,391 | 0 |
| EANES ISD | 293 | $4,353 | 0 |
| LAGO VISTA ISD | 287 | $5,105 | 275 |
| HAYS CONSOLIDATED ISD | 91 | $2,210 | 0 |
| MARBLE FALLS ISD | 21 | $3,318 | 0 |

## Leads by city (Tier 1+2)

| City | Leads | Median estimate | Unconfirmed |
|---|---:|---:|---:|
| CITY OF AUSTIN | 9,689 | $3,785 | 56 |
| CITY OF PFLUGERVILLE | 1,028 | $3,283 | 0 |
| CITY OF MANOR | 521 | $3,112 | 0 |
| CITY OF LAKEWAY | 219 | $6,319 | 67 |
| CITY OF LAGO VISTA | 215 | $5,007 | 215 |
| CITY OF LEANDER | 152 | $3,768 | 152 |
| CITY OF ELGIN | 136 | $3,412 | 0 |
| CITY OF MUSTANG RIDGE | 97 | $1,643 | 0 |
| CITY OF CEDAR PARK | 69 | $3,731 | 69 |
| CITY OF BEE CAVE | 49 | $6,954 | 49 |
| CITY OF JONESTOWN | 46 | $5,086 | 46 |
| VILLAGE OF BRIARCLIFF | 35 | $5,021 | 0 |
| VILLAGE OF THE HILLS | 28 | $7,662 | 28 |
| CITY OF WEST LAKE HILLS | 27 | $4,581 | 0 |
| VILLAGE OF POINT VENTURE | 27 | $4,699 | 27 |
| VILLAGE OF VOLENTE | 15 | $4,790 | 0 |
| CITY OF ROLLINGWOOD | 11 | $6,154 | 0 |
| CITY OF ROUND ROCK | 10 | $3,279 | 0 |
| CITY OF SUNSET VALLEY | 10 | $3,407 | 0 |
| VILLAGE OF SAN LEANNA | 6 | $3,272 | 0 |
| CITY OF CREEDMOOR | 4 | $3,681 | 0 |
| VILLAGE OF WEBBERVILLE | 3 | $2,849 | 3 |
| *(unincorporated — no city or village)* | 4,378 | | |

## Why leads are unconfirmed

A lead is unconfirmed when any of its units has a 2024 or 2025 figure carried back from TCAD's 2026 exemption listing that could overstate the refund (a local-option percentage or amount with no source for that year). Units driving the flag:

| Unit | Unconfirmed leads touching it | 2024/2025 basis |
|---|---:|---|
| 57 TRAVIS CO ESD NO 4 | 523 | carried from listing (could overstate) |
| 17 TRAVIS CO WCID NO 17 | 317 | carried from listing (could overstate) |
| 84 NORTHTOWN MUD | 243 | carried from listing (could overstate) |
| 49 CITY OF LAGO VISTA | 215 | carried from listing (could overstate) |
| 6F CITY OF LEANDER | 152 | carried from listing (could overstate) |
| 32 WELLS BRANCH MUD | 117 | carried from listing (could overstate) |
| 3F CITY OF CEDAR PARK | 69 | carried from listing (could overstate) |

Lake Travis ISD and Lago Vista ISD (20% local option) were confirmed for 2024 and 2025 from LTISD's 2025-26 budget overview and a 2024 Community Impact report, which took the unconfirmed share from 14.5% to the figure above. To confirm the rest: add the unit's 2024/2025 local-option figure with a source to `LOCAL_OPTION_SOURCES` / `RESEARCHED` in `trd/estimator/build_units.py` and regenerate. TCAD's 2024 and 2025 exemption listings are no longer online (404).

## Rate table provenance

- Rates: Travis County Tax Office truth-in-taxation summary (`qryJurisRateWeb2026.xls`, retrieved 2026-09-13): 146 taxing units, adopted total rate 2022–2025 (2026 adopted for 30 so far). The five units the prototype hard-coded match to six decimals.
- Exemption rules: TCAD 2026 Exemption Listing Report (`2026_ExemptionListingTravis-07192026.pdf`, 129 entities). School state amounts by statute: HS $100K (2024) / $140K (2025+), OV65 $10K (2024) / $60K (2025+).
- Cross-check: assessed − taxable on homestead-only residential accounts in the 2026 roll agrees with the listing for every unit with ≥ 30 such accounts (no mismatches), e.g. Travis County 20%, ACC 1% with $5K floor, Lake Travis ISD $140K + 20%, City of Pflugerville none, every ESD/MUD except ESD 4 and a few MUDs none.
- Roll codes with no rate in the county file are all non-taxing (the appraisal district, PIDs, TIRZs, BCCP) or tiny new MUDs; they are dropped from estimates.

## Verification-pack reconciliation (6 leads, account numbers only)

Hand calculation = Σ over the property's units of (HS exemption × rate ÷ 100) for 2024 and 2025, using `units.json`. The estimator agrees to the cent on all six. The last row is the bug this spec fixes: a mailing address in "Austin" that is outside the city limits (North Austin MUD 1 + ESD 4 + Round Rock ISD), which the old five-unit table overstated by $760.

| TCAD account | Value | Units | Hand | Estimator | Old five-unit |
|---|---:|---|---:|---:|---:|
| 139898 | $543,198 | 07 21 03 2J 52 26 | $5,836.41 | $5,836.41 | $4,373 |
| 151810 | $909,688 | 01 02 03 68 2J | $5,808.36 | $5,808.36 | $5,808 |
| 162492 | $350,027 | 16 49 03 2J 1B 41 | $5,116.99 | $5,116.97 | $3,620 |
| 163726 | $495,880 | 5A 02 03 68 2J | $4,085.52 | $4,085.53 | $4,188 |
| 174057 | $327,886 | 5A 02 03 68 2J | $3,431.05 | $3,431.07 | $3,533 |
| 176077 | $393,690 | 5A 03 68 2J 57 2N | $3,030.15 | $3,030.15 | $3,790 |
