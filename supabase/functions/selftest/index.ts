// selftest: end-to-end regression that runs inside Supabase's network (Claude's sandbox can't reach supabase.co directly).
// GET /selftest?key=<OPS_PASSWORD>&scenario=match|mismatch
//   -> resets the synthetic lead, generates a synthetic Texas-style ID as a PDF (pdf-lib, no binary transport needed),
//      submits it through the REAL claim endpoint, waits for process-claim, and returns the resulting rows.
// Only ever touches the synthetic lead TRD-TEST-0001 / property 999000001. The photo-quality vision eval runs separately
// from the repo (eval/run_extraction_eval.py) against 30 synthetic JPEG photos.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { serviceClient } from "./db.ts";

const TEST_CODE = "TRD-TEST-0001";
const TEST_PROP = 999000001;

async function opsKey(sb: ReturnType<typeof serviceClient>): Promise<string> {
  const env = Deno.env.get("OPS_PASSWORD"); if (env) return env;
  const { data } = await sb.from("app_settings").select("value").eq("key", "OPS_PASSWORD").maybeSingle();
  return data?.value ?? "";
}

/** A generic ID-card layout as a one-page PDF: the same fields the JPEG eval set carries. */
async function syntheticIdPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([340, 214]); // ID-1 card proportions in points
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 0, y: 184, width: 340, height: 30, color: rgb(0.16, 0.36, 0.24) });
  page.drawText("TEXAS  DRIVER LICENSE", { x: 12, y: 194, size: 13, font: fb, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 12, y: 60, width: 80, height: 110, color: rgb(0.78, 0.8, 0.84), borderColor: rgb(0.5, 0.5, 0.55), borderWidth: 1 });
  const rows: Array<[string, string, boolean]> = [
    ["DL", "17912728", false], ["EXP", "09/03/2031", false], ["DOB", "07/11/1963", false],
    ["1", "GARCIA", true], ["2", "RICHARD L", true], ["8", "3675 DUVAL ST", false], ["", "AUSTIN, TX 78721", false],
  ];
  let y = 165;
  for (const [k, v, bold] of rows) {
    page.drawText(k, { x: 104, y, size: 7, font: f, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(v, { x: 122, y: y - 1, size: bold ? 12 : 10, font: bold ? fb : f, color: rgb(0.1, 0.1, 0.1) });
    y -= 15;
  }
  page.drawText("SEX M   HGT 5'-11\"   EYES BRO", { x: 104, y: 42, size: 7, font: f, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("ISS 02/04/2023", { x: 12, y: 44, size: 7, font: f, color: rgb(0.3, 0.3, 0.3) });
  page.drawText("Garcia Richard", { x: 12, y: 18, size: 9, font: f, color: rgb(0.15, 0.15, 0.4) });
  return await doc.save();
}

Deno.serve(async (req: Request) => {
  const sb = serviceClient();
  const url = new URL(req.url);
  const want = await opsKey(sb);
  if (!want || url.searchParams.get("key") !== want) return new Response("forbidden", { status: 403 });
  const scenario = url.searchParams.get("scenario") ?? "match";
  const base = Deno.env.get("SUPABASE_URL")!;
  const t0 = Date.now();

  // 1. reset the synthetic lead + property for the scenario
  const { data: lead } = await sb.from("leads").select("id").eq("claim_code", TEST_CODE).single();
  if (!lead) return Response.json({ error: "test lead missing" }, { status: 500 });
  const { data: custs } = await sb.from("customers").select("id").eq("lead_id", lead.id);
  for (const c of custs ?? []) {
    const { data: fil } = await sb.from("filings").select("id").eq("customer_id", c.id);
    if (fil?.length) await sb.from("refunds").delete().in("filing_id", fil.map((x) => x.id));
    await sb.from("messages").delete().eq("customer_id", c.id);
    await sb.from("filings").delete().eq("customer_id", c.id);
    await sb.from("documents").delete().eq("customer_id", c.id);
    await sb.storage.from("ids").remove([`${c.id}/dl_front.pdf`, `${c.id}/dl_front.jpg`, `${c.id}/dl_back.jpg`]);
  }
  await sb.from("customers").delete().eq("lead_id", lead.id);
  await sb.from("leads").update({ status: "new" }).eq("id", lead.id);
  const situs = scenario === "mismatch"
    ? { situs_num: "1200", situs_street: "BRODIE LN", situs_zip: "78745", situs_full: "1200 BRODIE LN, AUSTIN, TX 78745" }
    : { situs_num: "3675", situs_street: "DUVAL ST", situs_zip: "78721", situs_full: "3675 DUVAL ST, AUSTIN, TX 78721" };
  await sb.from("properties").update(situs).eq("prop_id", TEST_PROP);

  // 2. submit through the real claim endpoint
  const fd = new FormData();
  fd.set("c", TEST_CODE); fd.set("owned_jan1", "yes"); fd.set("primary", "yes"); fd.set("other_hs", "no");
  fd.set("full_name", "Richard L Garcia"); fd.set("email", "selftest@example.com"); fd.set("phone", ""); fd.set("household", "single"); fd.set("prev_homestead", "no");
  fd.set("agree_terms", "on"); fd.set("agree_esign", "on"); fd.set("agree_free", "on"); fd.set("signature_name", "Richard L Garcia");
  const pdfBytes = await syntheticIdPdf();
  fd.set("dl_front", new File([pdfBytes.slice().buffer as ArrayBuffer], "front.pdf", { type: "application/pdf" }));
  const res = await fetch(`${base}/functions/v1/claim`, { method: "POST", body: fd, headers: { "x-forwarded-for": "203.0.113.7", "user-agent": "selftest" } });
  const claimJson = await res.json().catch(() => ({ ok: false })) as { ok?: boolean; errors?: string[] };

  // 3. wait for process-claim (kicked in the background by the claim page) — poll up to ~45 s
  let cust: Record<string, unknown> | null = null;
  for (let i = 0; i < 45; i++) {
    const { data } = await sb.from("customers").select("*").eq("lead_id", lead.id).maybeSingle();
    cust = data;
    if (cust && !["submitted", "processing"].includes(String(cust.status))) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const cid = cust?.id as string | undefined;
  const { data: docs } = cid ? await sb.from("documents").select("kind, mime, extracted, validation, extraction_cost_usd").eq("customer_id", cid) : { data: null };
  const { data: filings } = cid ? await sb.from("filings").select("packet_path, packet_sha256, form_version").eq("customer_id", cid) : { data: null };
  const { data: msgs } = cid ? await sb.from("messages").select("intent, subject").eq("customer_id", cid) : { data: null };
  const { data: audit } = cid ? await sb.from("audit_log").select("action, detail").eq("entity_id", cid).order("id", { ascending: false }).limit(3) : { data: null };
  const expected = scenario === "mismatch" ? "needs_dl_update" : "ready_to_submit";
  return Response.json({
    scenario, expected_status: expected, pass: cust?.status === expected,
    claim_http: res.status, claim_api_ok: claimJson.ok === true, claim_errors: claimJson.errors ?? null, elapsed_ms: Date.now() - t0,
    customer: cust && { status: cust.status, status_reason: cust.status_reason, signature_ip: cust.signature_ip },
    documents: docs, filings, messages: msgs, audit,
  }, { headers: { "cache-control": "no-store" } });
});
