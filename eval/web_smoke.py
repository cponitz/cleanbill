"""Browser smoke test for the Next.js customer front-end (apps/web) against the LIVE claim API (SPEC-04b acceptance).

Drives headless Chromium (phone viewport) through:
  A. happy path   index -> code -> /claim/<code> estimate -> eligibility -> typed pre-check (match) -> license photo -> contact
                  -> sign -> inline result (poll) -> ready_to_submit with packet link -> card step skipped (flag off) or
                  "Skip for now" (flag on) -> done -> /claim/<code>/status shows "ready for your review"
  B. fix screen   property situs moved to Brodie Ln so the same ID mismatches -> needs_dl_update -> the fix screen shows both
                  addresses -> situs restored -> re-upload through the fix screen -> inline result ready_to_submit
  C. agreement    /agreement/<code> fills the situs from the API
  D. site         every SPEC-07 marketing page renders without a page error; /claim opens a code into the confirm state;
                  the home hero's address form posts an inquiry (skipped with --skip-inquiry until the API is deployed)
Scenario E (SPEC-09) drives /ops with OPS_PASSWORD from .env (skipped without it).
Only ever touches the synthetic lead CB-TEST-0001 / property 999000001 (reset here with the service-role key, mirroring
eval/reset_test_lead.sql). Screenshots land in eval/out/web/.

Run:  python eval/web_smoke.py --base http://localhost:3000            (after `npm run build && npm start` in apps/web)
      python eval/web_smoke.py --base https://cleanbill-<hash>-ponitz-development.vercel.app   (or https://cleanbillco.com)
Needs .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Exit 0 = PASS.
Vercel previews with Deployment Protection (Vercel Authentication) redirect to a Vercel login; either turn it off for
previews (Vercel → Settings → Deployment Protection) or set VERCEL_AUTOMATION_BYPASS_SECRET in .env — it is sent as the
x-vercel-protection-bypass header on every request.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "eval" / "out" / "web"
TEST_CODE = "CB-TEST-0001"
TEST_PROP = 999000001
ID_IMG = ROOT / "eval" / "ids" / "id_03.jpg"   # Richard L Garcia, 3675 DUVAL ST 78721 — matches the synthetic property
DUVAL = {"situs_num": "3675", "situs_street": "DUVAL ST", "situs_zip": "78721", "situs_full": "3675 DUVAL ST, AUSTIN, TX 78721"}
BRODIE = {"situs_num": "1200", "situs_street": "BRODIE LN", "situs_zip": "78745", "situs_full": "1200 BRODIE LN, AUSTIN, TX 78745"}


def load_env() -> None:
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


class TestData:
    """Resets the synthetic lead the way selftest and eval/reset_test_lead.sql do; sets the property's situs per scenario."""

    def __init__(self):
        from supabase import create_client
        self.sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    def reset(self, situs: dict) -> None:
        lead = self.sb.table("leads").select("id").eq("claim_code", TEST_CODE).single().execute().data
        claims = self.sb.table("claims").select("id").eq("lead_id", lead["id"]).execute().data
        for c in claims:
            fil = self.sb.table("filings").select("id").eq("claim_id", c["id"]).execute().data
            if fil:
                ids = [f["id"] for f in fil]
                self.sb.table("refunds").delete().in_("filing_id", ids).execute()
                self.sb.table("record_checks").delete().in_("filing_id", ids).execute()
            for t in ("messages", "filings", "documents"):
                self.sb.table(t).delete().eq("claim_id", c["id"]).execute()
            objs = self.sb.storage.from_("ids").list(c["id"]) or []
            if objs:
                self.sb.storage.from_("ids").remove([f"{c['id']}/{o['name']}" for o in objs])
        if claims:
            self.sb.table("customers").update({"created_from_claim_id": None}).in_("created_from_claim_id", [c["id"] for c in claims]).execute()
        self.sb.table("claims").delete().eq("lead_id", lead["id"]).execute()
        self.sb.table("leads").update({"status": "new", "opened_at": None}).eq("id", lead["id"]).execute()
        self.set_situs(situs)

    def set_situs(self, situs: dict) -> None:
        self.sb.table("properties").update(situs).eq("prop_id", TEST_PROP).execute()


def shot(page: Page, name: str) -> None:
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)


def fill_and_sign(page: Page, base: str, results: dict, tag: str, email: str) -> None:
    """From the landing page through to the inline result."""
    page.goto(f"{base}/")
    page.fill("#code", TEST_CODE.lower())
    page.click("button[type=submit]")
    page.wait_for_url(f"**/claim/{TEST_CODE}")
    page.wait_for_selector("[data-testid=estimate]", timeout=20000)
    results[f"{tag}_refund"] = page.text_content("[data-testid=refund]")
    shot(page, f"{tag}_01_estimate")
    page.click("[data-testid=btn-continue]")

    for name, value in (("owned_jan1", "yes"), ("primary", "yes"), ("other_hs", "no"), ("prev_homestead", "no"), ("household", "single")):
        page.check(f"input[name={name}][value={value}]")
    shot(page, f"{tag}_02_eligibility")
    page.click("[data-testid=btn-continue]")

    # typed pre-check (SPEC-06 §3): blur triggers GET /claim/precheck
    page.fill("#typed_name", "Richard L Garcia")
    page.fill("#typed_address", "3675 Duval St")
    page.fill("#typed_zip", "78721")
    page.locator("#typed_zip").blur()
    page.wait_for_function("document.querySelector('[data-testid=precheck-result]').innerText.trim().length > 0 && !document.querySelector('[data-testid=precheck-result]').innerText.includes('Checking')", timeout=15000)
    results[f"{tag}_precheck"] = page.inner_text("[data-testid=precheck-result]")
    page.set_input_files("#dl_front", str(ID_IMG))
    page.wait_for_selector("[data-testid=btn-continue]:not([disabled])", timeout=10000)
    shot(page, f"{tag}_03_license")
    page.click("[data-testid=btn-continue]")

    page.wait_for_selector("#email")
    page.fill("#full_name", "Richard L Garcia")
    page.fill("#email", email)
    page.click("[data-testid=btn-continue]")

    for k in ("agree_terms", "agree_esign", "agree_free"):
        page.check(f"#{k}")
    page.fill("#signature_name", "Richard L Garcia")
    shot(page, f"{tag}_04_sign")
    page.click("[data-testid=btn-submit]")
    page.wait_for_selector("[data-testid=checking], [data-testid=errors]", timeout=30000)
    if page.is_visible("[data-testid=errors]"):
        results[f"{tag}_errors"] = page.inner_text("[data-testid=errors]")
        shot(page, f"{tag}_05_errors")
        return
    page.wait_for_selector("[data-testid=result-ready], [data-testid=result-review], [data-testid=result-error], [data-testid=fix-screen]", timeout=45000)


def site_pages(page: Page, base: str, results: dict, skip_inquiry: bool) -> bool:
    """SPEC-07: the marketing pages, the claim-code entry and the address inquiry."""
    ok = True
    for path in ("/", "/pricing", "/how-it-works", "/faq", "/exemptions", "/appeals", "/businesses", "/about", "/claim", "/agreement"):
        r = page.goto(f"{base}{path}")
        ok &= bool(r) and r.status == 200
        page.wait_for_selector("footer")
    shot(page, "D_01_home_mobile")
    # the FAQ accordion: one open at a time
    page.goto(f"{base}/faq")
    page.click("#faq-2 .acc-q")
    results["D_faq_open"] = page.evaluate("document.querySelectorAll('.acc[data-open=\"true\"]').length")
    ok &= results["D_faq_open"] == 1
    # /claim: a real code opens the confirm card, a bad one the error
    page.goto(f"{base}/claim")
    page.fill("#code", "cb-nope-0000")
    page.click("button[type=submit]")
    page.wait_for_selector("[data-testid=code-entry] [role=alert]", timeout=15000)
    page.fill("#code", TEST_CODE.lower())
    page.click("button[type=submit]")
    page.wait_for_selector("[data-testid=code-found]", timeout=15000)
    results["D_code_found"] = page.inner_text("[data-testid=code-found]")[:80]
    shot(page, "D_02_code_found")
    if not skip_inquiry:
        page.goto(f"{base}/")
        page.fill("#address", "3675 Duval St, Austin 78721")
        page.click("[data-testid=start-card] button[type=submit]")
        page.wait_for_selector("[data-testid=inquiry-email]", timeout=5000)
        page.fill("#start_email", "web-smoke@example.com")
        page.click("[data-testid=start-card] button[type=submit]")
        page.wait_for_selector("[data-testid=inquiry-done]", timeout=15000)
        results["D_inquiry"] = True
        shot(page, "D_03_inquiry_done")
    return ok


def ops_console(page: Page, base: str, results: dict) -> bool:
    """Scenario E (SPEC-09 D2): the operator console at /ops — login, KPIs, approve a draft on the synthetic claim,
    mark an inquiry handled, preview a walkthrough claim, health renders; and the grep test: no DL number and no card
    data anywhere on the page or in the API response. Needs OPS_PASSWORD in .env; skipped (reported) without it."""
    key = os.environ.get("OPS_PASSWORD")
    if not key:
        results["E_skipped"] = "OPS_PASSWORD not set"
        return True
    ok = True
    page.goto(f"{base}/ops")
    page.wait_for_selector("[data-testid=ops-login]", timeout=20000)
    page.fill("[data-testid=ops-key]", "wrong-password")
    page.click("[data-testid=ops-login] button[type=submit]")
    page.wait_for_selector("[data-testid=ops-login-error]", timeout=20000)
    results["E_wrong_password"] = page.text_content("[data-testid=ops-login-error]")
    page.fill("[data-testid=ops-key]", key)
    page.click("[data-testid=ops-login] button[type=submit]")
    page.wait_for_selector("[data-testid=ops-kpis]", timeout=30000)
    shot(page, "E_01_funnel")
    leads = page.text_content("[data-testid=kpi-leads_loaded] .kpi-value") or "0"
    results["E_leads_loaded"] = leads
    ok &= int(leads.replace(",", "")) > 0
    # the synthetic claim from scenario A carries a draft: open it, approve the draft
    row = page.locator(f"[data-testid=claim-row][data-code={TEST_CODE}]").first
    row.wait_for(timeout=20000)
    row.click()
    page.wait_for_selector("[data-testid=claim-drawer][data-open=true]", timeout=10000)
    shot(page, "E_02_claim")
    results["E_drafts_before"] = page.locator("[data-testid=draft]").count()
    if results["E_drafts_before"]:
        page.click("[data-testid=btn-approve]")
        page.wait_for_function("document.querySelectorAll('[data-testid=draft]').length === " + str(results["E_drafts_before"] - 1), timeout=20000)
    results["E_drafts_after"] = page.locator("[data-testid=draft]").count()
    ok &= results["E_drafts_before"] >= 1 and results["E_drafts_after"] == results["E_drafts_before"] - 1
    page.click("[data-testid=claim-drawer] .drawer-close")
    # inquiries: mark the newest unhandled one handled (scenario D posted one)
    pending = page.locator("[data-testid=inquiry-row][data-handled=false]")
    results["E_inquiries_pending"] = pending.count()
    if pending.count():
        pending.first.locator("[data-testid=btn-inquiry-handled]").click()
        page.fill("[data-testid=inquiry-notes]", "web smoke: answered")
        page.click("[data-testid=btn-inquiry-confirm]")
        page.wait_for_function("document.querySelectorAll('[data-testid=inquiry-row][data-handled=false]').length < " + str(results["E_inquiries_pending"]), timeout=20000)
        shot(page, "E_03_inquiries")
    # new claim: preview the synthetic property
    page.fill("[data-testid=newclaim-q]", "3675 Duval St")
    page.click("[data-testid=btn-newclaim-preview]")
    page.wait_for_selector("[data-testid=newclaim-matches]", timeout=20000)
    results["E_newclaim_has_test"] = TEST_CODE in (page.text_content("[data-testid=newclaim-matches]") or "")
    ok &= bool(results["E_newclaim_has_test"])
    shot(page, "E_04_new_claim")
    # health renders (the rows appear once the workflows have run)
    results["E_health"] = page.is_visible("[data-testid=health]") and page.is_visible("[data-testid=selftest]")
    ok &= bool(results["E_health"])
    # grep test: no DL number (the synthetic ID's is 17912728) and no card data on the page or in the API response
    body = page.inner_text("body")
    api = page.request.get(f"{os.environ.get('NEXT_PUBLIC_API_BASE', 'https://letrfpwskjbgnyacesgv.supabase.co/functions/v1')}/ops?limit=50", headers={"x-ops-key": key}).text()
    results["E_grep_clean"] = not any(x in body or x in api for x in ("17912728", "dl_number", "4242 4242", "card_number", "pan"))
    ok &= bool(results["E_grep_clean"])
    # three wrong keys → login again (sessionStorage cleared by the page)
    page.evaluate("sessionStorage.setItem('cb-ops-key', 'nope')")
    page.reload()
    page.wait_for_selector("[data-testid=ops-login], [data-testid=ops-kpis]", timeout=20000)
    for _ in range(2):
        if page.is_visible("[data-testid=ops-login]"):
            break
        page.click("[data-testid=btn-refresh]")
        page.wait_for_timeout(1500)
    results["E_relogin_after_403s"] = page.is_visible("[data-testid=ops-login]")
    ok &= bool(results["E_relogin_after_403s"])
    return ok


def run(base: str, stripe_on: bool, skip_inquiry: bool = False) -> int:
    load_env()
    OUT.mkdir(parents=True, exist_ok=True)
    data = TestData()
    results: dict[str, object] = {"base": base}

    with sync_playwright() as p:
        browser = p.chromium.launch()
        bypass = os.environ.get("VERCEL_AUTOMATION_BYPASS_SECRET")
        headers = {"x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true"} if bypass else {}
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, extra_http_headers=headers)
        page = ctx.new_page()
        console: list[str] = []
        page.on("console", lambda m: console.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: console.append(f"pageerror: {e}"))

        def on_failure(exc: BaseException) -> int:
            shot(page, "ZZ_failure")
            results["failure"] = f"{type(exc).__name__}: {str(exc).splitlines()[0][:200]}"
            results["failure_url"] = page.url
            results["failure_text"] = page.inner_text("body")[:600]
            results["console"] = console
            data.reset(DUVAL)
            print(json.dumps(results, indent=2, default=str)); print("FAIL")
            return 1

        try:
            return _scenarios(page, base, data, results, stripe_on, console, skip_inquiry)
        except Exception as exc:  # noqa: BLE001 — report, screenshot, reset, exit 1
            return on_failure(exc)
        finally:
            browser.close()


def _scenarios(page: Page, base: str, data: TestData, results: dict, stripe_on: bool, console: list[str], skip_inquiry: bool = False) -> int:
    ok = True
    if True:
        # ---- D. the site (SPEC-07) ------------------------------------------------------------------------------------
        data.reset(DUVAL)
        ok &= site_pages(page, base, results, skip_inquiry)

        # ---- A. happy path ------------------------------------------------------------------------------------------
        data.reset(DUVAL)
        fill_and_sign(page, base, results, "A", "web-smoke@example.com")
        results["A_result"] = "ready" if page.is_visible("[data-testid=result-ready]") else "review" if page.is_visible("[data-testid=result-review]") else "other"
        shot(page, "A_06_result")
        ok &= results["A_result"] == "ready"
        results["A_packet_link"] = page.is_visible("[data-testid=packet-link]")
        ok &= bool(results["A_packet_link"])
        if results["A_result"] == "ready":
            page.click("[data-testid=btn-continue]")
            if stripe_on:
                page.wait_for_selector("[data-testid=card-step]", timeout=10000)
                shot(page, "A_07_card")
                page.click("[data-testid=btn-skip-card]")
            page.wait_for_selector("[data-testid=done]", timeout=10000)
            shot(page, "A_08_done")
            results["A_done"] = True
        page.goto(f"{base}/claim/{TEST_CODE}/status")
        page.wait_for_selector("[data-testid=status-title]", timeout=20000)
        results["A_status_title"] = page.text_content("[data-testid=status-title]")
        results["A_status_packet"] = page.is_visible("[data-testid=packet-link]")
        ok &= "ready" in str(results["A_status_title"]).lower()
        shot(page, "A_09_status")

        # ---- E. the operator console (SPEC-09) — after A so the synthetic claim carries a draft --------------------
        ok &= ops_console(page, base, results)

        # ---- B. fix screen (SPEC-02 §1/§2) ---------------------------------------------------------------------------
        data.reset(BRODIE)
        fill_and_sign(page, base, results, "B", "web-smoke-fix@example.com")
        results["B_fix_screen"] = page.is_visible("[data-testid=fix-screen]")
        ok &= bool(results["B_fix_screen"])
        if results["B_fix_screen"]:
            results["B_fix_id_address"] = page.text_content("[data-testid=fix-id-address]")
            results["B_fix_situs"] = page.text_content("[data-testid=fix-situs]")
            ok &= "DUVAL" in str(results["B_fix_id_address"]).upper() and "BRODIE" in str(results["B_fix_situs"]).upper()
            shot(page, "B_06_fix_screen")
            # reopening the link lands on the fix screen too (SPEC-02 §1)
            page.goto(f"{base}/claim/{TEST_CODE}")
            page.wait_for_selector("[data-testid=fix-screen]", timeout=20000)
            # the customer "updated DPS": make the property match the ID again, then re-upload through the fix screen
            data.set_situs(DUVAL)
            page.set_input_files("#fix_front", str(ID_IMG))
            page.click("[data-testid=btn-fix-upload]")
            page.wait_for_selector("[data-testid=checking]", timeout=15000)
            page.wait_for_selector("[data-testid=result-ready], [data-testid=result-review], [data-testid=fix-screen]", timeout=60000)
            results["B_after_fix"] = "ready" if page.is_visible("[data-testid=result-ready]") else "fix" if page.is_visible("[data-testid=fix-screen]") else "review"
            ok &= results["B_after_fix"] == "ready"
            shot(page, "B_07_after_fix")

        # ---- C. agreement ------------------------------------------------------------------------------------------------
        page.goto(f"{base}/agreement/{TEST_CODE}")
        page.wait_for_function("document.querySelector('[data-testid=agreement-situs]').innerText.includes('DUVAL')", timeout=15000)
        results["C_agreement_situs"] = page.text_content("[data-testid=agreement-situs]")
        shot(page, "C_agreement")

        results["console"] = [c for c in console if "favicon" not in c]
        ok &= not [c for c in console if c.startswith("pageerror")]

    data.reset(DUVAL)   # leave the synthetic lead open for the next run / the selftest
    print(json.dumps(results, indent=2, default=str))
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--stripe-on", action="store_true", help="the deployment has NEXT_PUBLIC_STRIPE_ENABLED=true (expect the card step)")
    ap.add_argument("--skip-inquiry", action="store_true", help="the claim API on this deployment has no POST /claim/inquiry yet (branch run before the deploy)")
    a = ap.parse_args()
    sys.exit(run(a.base.rstrip("/"), a.stripe_on, a.skip_inquiry))
