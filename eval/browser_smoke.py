"""Browser smoke test for the static pages in docs/ against the LIVE Supabase API.

Serves docs/ on a local port, drives headless Chromium through:
  1. index.html  -> enter claim code -> claim.html renders refund table from the API
  2. claim.html  -> fill eligibility, upload a synthetic ID, sign -> "thanks" state
  3. ops.html    -> log in with OPS_PASSWORD -> claims table renders, the new claim is listed
  4. agreement.html?c=... -> situs + years filled from the API
Only ever touches the synthetic lead TRD-TEST-0001 (reset it first with eval/reset_test_lead.sql). Screenshots land in eval/out/.
Run: python eval/browser_smoke.py   (needs .env: SUPABASE_URL, OPS_PASSWORD)
"""
from __future__ import annotations

import email.parser
import http.server
import json
import mimetypes
import uuid
import os
import socketserver
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUT = ROOT / "eval" / "out"
TEST_CODE = "TRD-TEST-0001"
RELAY_FILES: dict[str, Path] = {}


def load_env() -> None:
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def serve_docs() -> tuple[socketserver.TCPServer, int]:
    handler = lambda *a, **kw: http.server.SimpleHTTPRequestHandler(*a, directory=str(DOCS), **kw)  # noqa: E731
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def relay(route, request) -> None:
    """Sandbox-only: Chromium here can't reach *.supabase.co directly, so forward API calls through urllib (proxy-aware).
    In a normal environment the browser calls the API itself and this is not installed."""
    if request.method == "OPTIONS":
        route.fulfill(status=204, headers={"access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-ops-key",
                                           "access-control-allow-methods": "GET, POST, OPTIONS"})
        return
    hdrs = {k: v for k, v in request.headers.items() if k.lower() in ("content-type", "x-ops-key", "accept")}
    data = request.post_data_buffer
    if data and hdrs.get("content-type", "").startswith("multipart/form-data"):
        # Chromium's devtools protocol strips file contents from captured multipart bodies, so re-attach the files
        # the test chose (RELAY_FILES: field name -> path) when forwarding.
        msg = email.parser.BytesParser().parsebytes(b"content-type: " + hdrs["content-type"].encode() + b"\r\n\r\n" + data)
        boundary = uuid.uuid4().hex
        out = bytearray()
        for part in msg.get_payload():
            name = part.get_param("name", header="content-disposition")
            if name in RELAY_FILES:
                path = RELAY_FILES[name]
                ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
                out += (f"--{boundary}\r\ncontent-disposition: form-data; name=\"{name}\"; filename=\"{path.name}\"\r\n"
                        f"content-type: {ctype}\r\n\r\n").encode() + path.read_bytes() + b"\r\n"
            elif part.get_filename() is None:
                out += f"--{boundary}\r\ncontent-disposition: form-data; name=\"{name}\"\r\n\r\n".encode() + part.get_payload(decode=True) + b"\r\n"
        out += f"--{boundary}--\r\n".encode()
        data = bytes(out); hdrs["content-type"] = f"multipart/form-data; boundary={boundary}"
    req = urllib.request.Request(request.url, data=data, headers=hdrs, method=request.method)
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            body, status, ct = resp.read(), resp.status, resp.headers.get("content-type", "application/json")
    except urllib.error.HTTPError as e:
        body, status, ct = e.read(), e.code, e.headers.get("content-type", "application/json")
    route.fulfill(status=status, body=body, headers={"content-type": ct, "access-control-allow-origin": "*"})


def run() -> int:
    load_env()
    ops_key = os.environ["OPS_PASSWORD"]
    OUT.mkdir(parents=True, exist_ok=True)
    httpd, port = serve_docs()
    base = f"http://127.0.0.1:{port}"
    results: dict[str, object] = {}

    # The synthetic lead must be 'new'/'opened' for the submit path (reset it with eval/reset_test_lead.sql);
    # if it is already 'claimed' the test exercises the "closed" screen instead and still checks ops.
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 430, "height": 900}, device_scale_factor=2)  # phone-ish
        if os.environ.get("https_proxy") and os.environ.get("BROWSER_RELAY", "1") == "1":
            ctx.route("**/*.supabase.co/**", relay)
        page = ctx.new_page()
        console: list[str] = []
        page.on("console", lambda m: console.append(f"{m.type}: {m.text}"))
        page.on("pageerror", lambda e: console.append(f"pageerror: {e}"))

        # 1. index -> claim
        page.goto(f"{base}/index.html")
        page.fill("#c", TEST_CODE.lower())
        page.click("button[type=submit]")
        page.wait_for_url("**/claim.html?c=*")
        page.wait_for_selector("#claim:not([hidden]), #closed:not([hidden]), #notfound:not([hidden])", timeout=20000)
        state = "claim" if page.is_visible("#claim") else "closed" if page.is_visible("#closed") else "notfound"
        results["claim_page_state"] = state
        page.screenshot(path=str(OUT / "01_claim_top.png"), full_page=False)
        if state == "claim":
            results["situs"] = page.text_content("#situs")
            results["refund_table"] = page.inner_text("#refund")
            results["deadline"] = page.text_content("#deadline")
            page.screenshot(path=str(OUT / "02_claim_full.png"), full_page=True)

            # 2. fill the form and submit (synthetic ID = the eval PNG/JPEG if present, else a tiny PNG)
            id_img = ROOT / "eval" / "ids" / "id_03.jpg"  # Richard L Garcia, 3675 DUVAL ST — matches the synthetic property
            if not id_img.exists():
                from PIL import Image  # noqa: WPS433
                id_img = OUT / "synthetic_id.png"
                Image.new("RGB", (640, 400), (220, 220, 220)).save(id_img)
            page.check("input[name=owned_jan1][value=yes]")
            page.check("input[name=primary][value=yes]")
            page.check("input[name=other_hs][value=no]")
            page.check("input[name=prev_homestead][value=no]")
            page.check("input[name=household][value=single]")
            RELAY_FILES["dl_front"] = Path(id_img)
            page.set_input_files("input[name=dl_front]", str(id_img))
            page.fill("input[name=full_name]", "Richard L Garcia")
            page.fill("input[name=email]", "browser-smoke@example.com")
            page.check("input[name=agree_terms]")
            page.check("input[name=agree_esign]")
            page.check("input[name=agree_free]")
            page.fill("input[name=signature_name]", "Richard L Garcia")
            page.screenshot(path=str(OUT / "03_claim_filled.png"), full_page=True)
            page.click("#btn")
            page.wait_for_selector("#thanks:not([hidden]), #errors:not([hidden])", timeout=30000)
            results["submitted"] = page.is_visible("#thanks")
            results["errors"] = page.inner_text("#errors") if page.is_visible("#errors") else None
            page.screenshot(path=str(OUT / "04_thanks.png"), full_page=True)

        # 3. agreement page fills from API (works even when closed? no — closed returns ok:false; fine)
        page.goto(f"{base}/agreement.html?c={TEST_CODE}")
        page.wait_for_timeout(1500)
        results["agreement_situs"] = page.text_content("#situs")
        page.screenshot(path=str(OUT / "05_agreement.png"), full_page=False)

        # 4. ops login
        ops = ctx.new_page()
        ops.set_viewport_size({"width": 1280, "height": 900})
        ops.goto(f"{base}/ops.html")
        ops.fill("#pw", ops_key)
        ops.click("#go")
        ops.wait_for_selector("#dash:not([hidden])", timeout=20000)
        ops.wait_for_timeout(1500)
        results["ops_kpis"] = ops.inner_text("#kpis").replace("\n", " ")
        rows = ops.locator("#rows tr")
        results["ops_rows"] = rows.count()
        results["ops_first_row"] = rows.first.inner_text()[:300] if rows.count() else None
        ops.screenshot(path=str(OUT / "06_ops.png"), full_page=True)

        # wait for process-claim to finish on the browser-submitted claim, then re-screenshot ops
        if results.get("submitted"):
            for _ in range(30):
                time.sleep(1)
                ops.click("#refresh"); ops.wait_for_timeout(800)
                txt = ops.locator("#rows tr").first.inner_text()
                if "ready_to_submit" in txt or "needs_dl_update" in txt or "needs_review" in txt:
                    break
            results["ops_first_row_after"] = ops.locator("#rows tr").first.inner_text()[:400]
            ops.screenshot(path=str(OUT / "07_ops_after_processing.png"), full_page=True)

        results["console"] = [c for c in console if "favicon" not in c]
        browser.close()
    httpd.shutdown()
    print(json.dumps(results, indent=2, default=str))
    ok = results["claim_page_state"] in ("claim", "closed") and results["ops_rows"] >= 1 and not [c for c in results["console"] if c.startswith("pageerror")]
    if results["claim_page_state"] == "claim":
        ok = ok and bool(results.get("submitted"))
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(run())
