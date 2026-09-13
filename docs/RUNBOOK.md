# Texas Refund Desk — Runbook

*Operating the prototype: addresses, daily loop, commands, statuses, troubleshooting. Extracted from handbook v2.1 §9 (2026-09-12).*

Section 9

## 9. Operating the prototype — runbook

### 9.1 Addresses

|                        |                                                                                                                                                                                                                |
|------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Landing (enter a code) | `https://cponitz.github.io/texas-refund-desk/index.html` (Pages serves `docs/` at the root; the old `homestead-refund` address does not redirect); after T-12: `https://texasrefunddesk.com`                                |
| Claim page (test)      | `…/texas-refund-desk/claim.html?c=TRD-TEST-0001`                                                                                                                                                                            |
| Agreement              | `…/texas-refund-desk/agreement.html?c=TRD-TEST-0001`                                                                                                                                                                        |
| Ops dashboard          | `…/texas-refund-desk/ops.html` — password rotated Sep 12 (in your password manager and `app_settings`; update the Mac `.env`). Never in a document.                                                                         |
| Claim API              | `https://letrfpwskjbgnyacesgv.supabase.co/functions/v1/claim?c=TRD-TEST-0001`                                                                                                                                  |
| Self-test              | `…/functions/v1/selftest?key=<OPS_PASSWORD>&scenario=match` (or `mismatch`) → expect `"pass": true` in ~8 s                                                                                                    |
| Supabase dashboard     | `https://supabase.com/dashboard/project/letrfpwskjbgnyacesgv` — read-only by convention (§2)                                                                                                                   |
| Actions                | `https://github.com/cponitz/texas-refund-desk/actions` — `claims-agent` schedule **disabled until test data exists** (run it manually with "Run workflow"); `tcad-etl` manual |

### 9.2 Daily loop (5 minutes while claims are few)

| \#  | Step                                                                                                                                                                                                          | Where             |
|-----|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------|
| 1   | Open ops. Check KPIs: leads, page views, opened, claimed, and the three working states.                                                                                                                       | ops.html          |
| 2   | For each claim in **ready_to_submit**: open the packet (signed link, 10 min), check name/address/years, approve the "ready to review" draft. *Until G-5 ships, copy the approved text into your mail client.* | ops.html → packet |
| 3   | For each claim in **needs_dl_update**: approve the DPS-instructions draft. *Until G-6 ships, ask them to reply with a photo and attach it yourself via Supabase storage (or re-run `new_claim`).*             | ops.html          |
| 4   | For each claim in **needs_review**: read `status_reason`. Name-order or nickname → the agent may already have moved it; otherwise decide, and either approve its question draft or fix the record.            | ops.html          |
| 5   | When a customer replies "go": forward the packet to TCAD (channel per O-01), then *until G-10 ships* set `filings.submitted_at`, `channel`, and `customers.status = 'filed'` in SQL.                          | email + SQL       |
| 6   | While the schedule is disabled, run `claims-agent` by hand (Actions → claims-agent → Run workflow) after any new claim; check it is green and the trace artifact shows the claims you expected.               | GitHub Actions    |

### 9.3 Commands (from the repo folder on the Mac)

    pip install -e . pytest && python -m pytest -q                                   # 28 tests (23 until the purge job is pushed)
    python -m trd.etl.load --export data/raw/PROP_slim.txt --layout trd/etl/layouts/pacs_8_0_33_slim.json \
        --entities data/raw/PROP_ENT_slim.txt.gz --db data/tcad.duckdb        # roll + each property's taxing units (SPEC-01)
    python -m trd.estimator.build_units --rates data/raw/qryJurisRateWeb2026.xls --listing data/raw/2026_listing.txt \
        --db data/tcad.duckdb                                                  # regenerate trd/estimator/rates/units.json (rates + exemptions)
    python -m trd.etl.leads --db data/tcad.duckdb --as-of 2026-09-09 --out data/out/leads.csv   # prints summary JSON
    python -m trd.etl.publish --leads data/out/leads.csv --dry-run                    # then without --dry-run
    python -m trd.ops.new_claim --address "3675 DUVAL ST"        # preview; add --create to mint a code + link
    python -m trd.agent.run --store supabase --customer <uuid>   # run the agent on one claim, see the trace
    python -m trd.agent.run --store fixtures                      # dry run over 5 fixture claims (needs API key)
    ANTHROPIC_API_KEY=… python eval/run_extraction_eval.py        # 30-image eval, ≥ 95% gate
    python eval/browser_smoke.py                                  # Playwright end-to-end against the live pages
    psql/SQL: eval/reset_test_lead.sql                            # reset TRD-TEST-0001 to a clean state
    supabase functions deploy --use-api --project-ref letrfpwskjbgnyacesgv   # all four; per-function verify_jwt in supabase/config.toml

### 9.4 What each status means and what to do

| Status                               | Meaning                                                                                             | Your action                                                                                                             |
|--------------------------------------|-----------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| `submitted`                          | Form saved, processing not yet run (should last seconds).                                           | If it persists \> 1 min, process-claim failed silently — run it via the agent (`--customer`) and check `audit_log`.     |
| `processing`                         | Extraction/validation in flight.                                                                    | Wait.                                                                                                                   |
| `ready_to_submit`                    | Clean validation, packet built, draft waiting.                                                      | Review packet; approve draft; on "go", file and mark filed.                                                             |
| `needs_dl_update`                    | License address ≠ property. Everything else fine.                                                   | Approve DPS draft; wait for the new photo (1–2 weeks typical); agent reminds at 5 days, max two.                        |
| `needs_review`                       | Name mismatch, low confidence, non-Texas ID, under 18, ineligibility answer, or a processing error. | Read the reason. Fixable (nickname, joint owner) → set forward. Not eligible → `withdrawn` with reason and a kind note. |
| `withdrawn`                          | Stopped by customer or you.                                                                         | Nothing; images purge in 7 days.                                                                                        |
| `filed → approved → refunded → paid` | Post-filing states — automated by SPEC-05 (§5.7).                                                   | Until SPEC-05 ships: "Mark filed" by hand; never charge without an observed refund and notice.                          |

### 9.5 When something breaks

| Symptom                                     | Likely cause                                                | Check                                                                                                         |
|---------------------------------------------|-------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| Claim page says "couldn't connect"          | Function down or CORS                                       | Open the claim API URL directly; Supabase function logs.                                                      |
| Claim page says "not found" for a real code | Code typo, or lead not in `new/mailed/opened`               | `select status from leads where claim_code=…`; `view_miss` events.                                            |
| Claim stuck in `submitted`                  | process-claim kick failed (service key, or Anthropic error) | `audit_log` for `error`; function logs; re-run via agent.                                                     |
| Wrong name or address on the packet         | Extraction error (glare/blur) — confidence should be low    | Compare with the image in `ids/`; if the model was confident and wrong, add the image to the eval set (G-22). |
| Agent run red                               | Tests failed (run blocks on pytest) or a store error        | Actions log; run the same command locally.                                                                    |
| Self-test fails                             | The real path is broken                                     | Treat as an outage; the response JSON names the step.                                                         |
