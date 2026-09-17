# Clean Bill — Runbook

*Operating the prototype: addresses, daily loop, commands, statuses, troubleshooting. Extracted from handbook v2.1 §9 (2026-09-12).*

Section 9

## 9. Operating the prototype — runbook

### 9.1 Addresses

|                        |                                                                                                                                                                                                                |
|------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Landing (enter a code) | Production `https://cleanbillco.com` (attached 2026-09-17, SPEC-08 R2; `texasrefunddesk.com` redirects). Static fallback until cut-over: `https://cponitz.github.io/cleanbill/index.html` (Pages serves `docs/` at the root; the old `homestead-refund` address does not redirect)                                |
| Claim page (test)      | `https://cleanbillco.com/claim/CB-TEST-0001`; a branch preview at `https://cleanbill-<hash>-ponitz-development.vercel.app/claim/CB-TEST-0001`; fallback `…/cleanbill/claim.html?c=CB-TEST-0001`                                                                                                                                                                            |
| Agreement              | `https://cleanbillco.com/agreement/CB-TEST-0001`; fallback `…/cleanbill/agreement.html?c=CB-TEST-0001`                                                                                                                                                                        |
| Ops console            | `https://cleanbillco.com/ops` (SPEC-09; a branch preview + `/ops` works too) — ops password rotated Sep 12 (in your password manager and `app_settings`; update the Mac `.env`). Never in a document. The old `docs/ops.html` is a pointer. |
| Claim API              | `https://letrfpwskjbgnyacesgv.supabase.co/functions/v1/claim?c=CB-TEST-0001`                                                                                                                                  |
| Self-test              | `…/functions/v1/selftest?key=<OPS_PASSWORD>&scenario=match` (or `mismatch`, `mismatch_then_fix`) → expect `"pass": true` in ~10 s                                                                                                    |
| Supabase dashboard     | `https://supabase.com/dashboard/project/letrfpwskjbgnyacesgv` — read-only by convention (§2)                                                                                                                   |
| Actions                | `https://github.com/cponitz/cleanbill/actions` — `claims-agent` schedule **disabled until test data exists** (run it manually with "Run workflow" or `gh workflow run agent.yml`); `tcad-etl` manual; `ci` on every push/PR; `deploy (main)` on merges touching `supabase/**` |
| Vercel                 | Project `cleanbill` (team Ponitz Development, Hobby), Root Directory `apps/web`, production from `main` at `https://cleanbillco.com`; every branch push builds a preview at `https://cleanbill-<hash>-ponitz-development.vercel.app`. Previews fail with "Root Directory does not exist" until `apps/web` is on the branch — expected. |

### 9.2 Daily loop (5 minutes while claims are few — all of it from `/ops`, no SQL, no Mac)

| \#  | Step                                                                                                                                                                                                          | Where             |
|-----|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------|
| 1   | Open `/ops`. **Funnel**: leads, page views, opened, claimed, the three working states, filed / approved / refunded, open inquiries. **Health**: the last deploy, agent run and ETL with their age; red tile = look. | /ops → Funnel, Health |
| 2   | **Claims**, filter `ready_to_submit`: tap the claim → open the packet (signed link, 10 min), check name / address / years, **Approve** the "ready to review" draft, **Copy text** and send it from your mail client. *Task 4 (Resend) adds Send.* | /ops → Claims → drawer |
| 3   | Filter `needs_dl_update`: **Approve** the DPS-instructions draft; copy and send it. The customer re-uploads through the fix screen on the claim page (SPEC-02); the claim then reprocesses itself.             | /ops → Claims     |
| 4   | Filter `needs_review`: read the findings (each has a code and a sentence). Nickname or name order → the agent may already have moved it; otherwise decide: approve its question draft, or **Withdraw** if it is not a real claim. | /ops → Claims     |
| 5   | When a customer replies "go": forward the packet to TCAD (channel per O-01), then **Mark filed** in the drawer (pick the channel). That sets the filing date, moves the claim and lead to `filed`, and drafts the "submitted" e-mail — approve, copy, send. | e-mail + /ops     |
| 6   | **Inquiries**: answer each new address / business form by e-mail, then **Mark handled** with a one-line note.                                                                                                  | /ops → Inquiries  |
| 7   | While the schedule is disabled, run `claims-agent` by hand (Actions → claims-agent → Run workflow) after any new claim; **Health** shows the run's result, claims processed and cost when it finishes.          | GitHub Actions, /ops |
| 8   | Friend / walkthrough test: **New claim** → type the address → **Create** → send the link. (A property outside the published lead list still needs `python -m cleanbill.ops.new_claim` on the Mac.)                  | /ops → New claim  |

### 9.3 Commands (from the repo folder on the Mac)

    pip install -e .[dev] && python -m pytest -q                                     # Python tests (49 on main at 2026-09-17)
    deno test --no-check --allow-read supabase/functions/process-claim/validate_test.ts supabase/functions/_shared/findings_test.ts supabase/functions/claim/logic_test.ts supabase/functions/ops/logic_test.ts   # Deno tests (40)
    python -m cleanbill.findings --emit-ts --emit-snapshot            # regenerate _shared/findings.ts + the G-9 snapshot after editing cleanbill/findings.py (CI checks with --check)
    python -m cleanbill.brand --sync                                    # regenerate brand_tokens.py / _shared/brand.ts / brand.generated.ts from apps/web/src/styles/tokens.css (CI checks with --check)
    python -m cleanbill.brand --assets                                  # re-render apps/web/public/brand/* after a token change (needs `pip install fonttools` for the wordmark SVG)
    python -m cleanbill.brand --contrast                                # the WCAG contrast table for both themes (paste into docs/DESIGN-SYSTEM.md)
    (cd apps/web && npm run lint:design)                          # design-system lint: no colour/font literal outside src/styles, every token resolves in every theme
    python -m cleanbill.etl.load --export data/raw/PROP_slim.txt --layout cleanbill/etl/layouts/pacs_8_0_33_slim.json \
        --entities data/raw/PROP_ENT_slim.txt.gz --db data/tcad.duckdb        # roll + each property's taxing units (SPEC-01)
    python -m cleanbill.estimator.build_units --rates data/raw/qryJurisRateWeb2026.xls --listing data/raw/2026_listing.txt \
        --db data/tcad.duckdb                                                  # regenerate cleanbill/estimator/rates/units.json (rates + exemptions)
    python -m cleanbill.etl.leads --db data/tcad.duckdb --as-of 2026-09-09 --out data/out/leads.csv   # prints summary JSON
    python -m cleanbill.etl.publish --leads data/out/leads.csv --dry-run                    # then without --dry-run
    python -m cleanbill.ops.new_claim --address "3675 DUVAL ST"        # preview; add --create to mint a code + link
    python -m cleanbill.agent.run --store supabase --claim <uuid>      # run the agent on one claim, see the trace
    python -m cleanbill.agent.run --store fixtures                      # dry run over 5 fixture claims (needs API key)
    ANTHROPIC_API_KEY=… python eval/run_extraction_eval.py        # 30-image eval, ≥ 95% gate
    python eval/browser_smoke.py                                  # Playwright end-to-end against the static fallback pages
    python eval/web_smoke.py --base http://localhost:3000        # Playwright end-to-end against apps/web (local `npm run build && npm start`, or a Vercel preview URL)
    (cd apps/web && npm install && npm run build && npm start)   # the customer app locally; see apps/web/README.md
    psql/SQL: eval/reset_test_lead.sql                            # reset CB-TEST-0001 to a clean state
    curl -s -H "x-ops-key: $OPS_PASSWORD" "https://letrfpwskjbgnyacesgv.supabase.co/functions/v1/ops?limit=20" | jq '.kpis, .system'   # the console's data (SPEC-09 D1)
    curl -s -H "x-ops-key: $OPS_PASSWORD" -H 'content-type: application/json' -d '{"action":"mark_filed","claim_id":"<uuid>","channel":"email"}' https://letrfpwskjbgnyacesgv.supabase.co/functions/v1/ops   # until /ops (D2) ships
    supabase functions deploy --use-api --project-ref letrfpwskjbgnyacesgv   # manual fallback only; per-function verify_jwt in supabase/config.toml
    # schema + functions normally deploy from main via .github/workflows/deploy.yml (db push, functions deploy, db diff must be empty)
    supabase link --project-ref letrfpwskjbgnyacesgv                           # once per machine (needs the DB password)
    supabase db diff --linked --schema public                                  # must print nothing (needs Docker for the shadow DB)
    supabase secrets set NAME=value --project-ref letrfpwskjbgnyacesgv         # function secrets; never echo the value
    gh run list -R cponitz/cleanbill --limit 5                          # recent CI / deploy / agent runs
    gh run view <run-id> --log                                                 # step logs (check "no drift" and "selftest passed" after a deploy)
    gh workflow run agent.yml && gh run watch                                  # run the claims agent by hand and wait for it

### 9.4 What each status means and what to do

| Status                               | Meaning                                                                                             | Your action                                                                                                             |
|--------------------------------------|-----------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| `submitted`                          | Form saved, processing not yet run (should last seconds).                                           | If it persists \> 1 min, process-claim failed silently — run it via the agent (`--claim <uuid>`) and check `audit_log`.     |
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
| Claim stuck in `submitted`                  | process-claim kick failed (service key, or Anthropic error) | **Reprocess** in `/ops` (drawer); if it sticks again, function logs and `audit_log` for `error`.               |
| Wrong name or address on the packet         | Extraction error (glare/blur) — confidence should be low    | Compare with the image in `ids/`; if the model was confident and wrong, add the image to the eval set (G-22). |
| Agent run red                               | Tests failed (run blocks on pytest) or a store error        | Actions log; run the same command locally.                                                                    |
| Self-test fails                             | The real path is broken                                     | Treat as an outage; **Run selftest** in `/ops` → Health, or the URL in §9.1; the response JSON names the step. |
| `/ops` shows the login again                | Three wrong passwords in a row (or the tab was closed)      | Type the password again; 20 failures per hour from one connection → wait an hour (429).                      |
| Health tile red or stale                    | The workflow failed, or `OPS_PASSWORD` is missing in Actions | Open the run from the tile's details; the row is written by the workflow's last step.                        |
