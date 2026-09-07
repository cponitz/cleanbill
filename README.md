# Texas Refund Desk

Finds Austin homeowners who never claimed their residence homestead exemption, tells them what they're owed, and prepares the late application so they can claim a 2-year retroactive refund. Fee: 25% of the refund actually received, $0 otherwise.

```
TCAD export ─▶ [1] ETL + lead engine ─▶ [2] letters ─▶ [3] claim page ─▶ [4] process-claim ─▶ [5] agent (shadow mode) ─▶ ops
  (free zip)     trd/etl (Python)       trd/letters    supabase/functions   Claude vision +      trd/agent (Python)     supabase/functions
                 DuckDB → Supabase      reportlab+QR   /claim               validation + packet  tool loop, 7 tools     /ops
```

## Layout

| Path | What |
|---|---|
| `trd/estimator/` | Tax rates + exemption amounts per taxing unit; refund math (`estimate_refund`). |
| `trd/etl/` | `load.py` parses TCAD's fixed-width PACS export into DuckDB from a layout spec; `leads.py` runs the lead heuristic + tiering; `publish.py` loads leads into Supabase (or emits batched SQL). |
| `trd/letters/` | Outreach letter PDFs with the §41.0051 compliance block and a QR to the claim page. |
| `trd/agent/` | **The agent.** `loop.py` (the tool loop — read this first), `tools.py` (7 tools), `store.py` (fixtures vs. Supabase), `system_prompt.md`, `validate.py` (mirror of the edge-function rules), `run.py` (CLI). |
| `supabase/migrations/` | Schema. `supabase/functions/` — `claim` (public page), `process-claim` (extraction → validation → packet → draft), `ops` (dashboard), `selftest` (end-to-end regression). |
| `copy/` | Letters (2 variants), claim page copy, service agreement, follow-up templates. |
| `eval/` | Synthetic ID eval set + `run_extraction_eval.py` (≥ 95% field accuracy gate). |
| `tests/` | pytest (estimator, validation, ETL, agent loop with a scripted fake model). Deno tests for the edge-function validator. |
| `.github/workflows/` | `agent.yml` (every 30 min, shadow mode), `etl.yml` (monthly). |

## Run

```
pip install -e . pytest && python -m pytest -q                 # 23 tests
python eval/make_ids.py && ANTHROPIC_API_KEY=... python eval/run_extraction_eval.py
python -m trd.etl.load --export data/raw/export.zip --layout trd/etl/layouts/pacs_8_0_33.json
python -m trd.etl.leads --as-of 2026-09-07
ANTHROPIC_API_KEY=... python -m trd.agent.run --store fixtures   # dry run over 5 fixture claims
```

Edge functions are deployed with the Supabase CLI (`supabase functions deploy <name>`) or the Supabase MCP connector; secrets `ANTHROPIC_API_KEY` and `OPS_PASSWORD` live in the function environment (fallback: `app_settings` table).

## Compliance guardrails baked into the code

- Letter: 14-pt bold "THIS DOCUMENT IS AN ADVERTISEMENT OF SERVICES…" (Prop. Code §41.0051(a)); names the taxing units that owe the refund (§41.0051(b)); "file free yourself" line; no government look-alike elements.
- Claim page: fee disclosure before any signature; ESIGN consent; owner signs personally; DL required and address-checked.
- Agent: shadow mode only; cannot send, file, or charge; refuses drafts that claim un-happened actions; only allowed status transitions.
- Data: DL numbers masked in the database; ID images in a private bucket, purged 30 days after filing; refund estimates rounded down.

## Glossary

TCAD — Travis Central Appraisal District · PACS — the appraisal software whose export we parse · HS / OV65 — homestead / over-65 exemption flags · DL — driver's license · Form 50-114 — Texas homestead exemption application · §41.0051 — Texas Property Code section governing paid homestead-filing solicitations · RLS — row-level security · Shadow mode — the agent drafts, a human approves before anything is sent · Situs — the property's physical address · Tier 1/2/3 — leads by years of eligible refund (2 / 1 / 0).
