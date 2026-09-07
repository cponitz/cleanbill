// process-claim: after a homeowner submits, extract the ID fields with Claude (vision + forced JSON schema),
// validate them against the appraisal record, decide the next status, build the packet PDF, and draft the follow-up.
// Called by the claim page with the service-role key (verify_jwt = true). Body: { "customer_id": "<uuid>" }.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { serviceClient } from "./db.ts";
import { validate, type Extracted, type PropertyRec } from "./validate.ts";

const MODEL = Deno.env.get("EXTRACTION_MODEL") ?? "claude-haiku-4-5";
const PRICE_IN = 1.0, PRICE_OUT = 5.0; // $/Mtok, Haiku 4.5 (update if the model changes)

const ID_SCHEMA = {
  type: "object",
  properties: {
    readable: { type: "boolean", description: "false if the image is not a legible government ID" },
    id_type: { type: "string", enum: ["driver_license", "id_card", "other"] },
    issuing_state: { type: "string", description: "Two-letter state code printed on the card, e.g. TX" },
    first_name: { type: "string" }, middle_name: { type: "string" }, last_name: { type: "string" },
    dob: { type: "string", description: "Date of birth as YYYY-MM-DD" },
    expiry: { type: "string", description: "Expiration date as YYYY-MM-DD" },
    dl_number: { type: "string" },
    address_line1: { type: "string", description: "Street line exactly as printed, including unit" },
    city: { type: "string" }, state: { type: "string" }, zip: { type: "string" },
    confidence: {
      type: "object",
      description: "0-1 confidence per field",
      properties: { name: { type: "number" }, dob: { type: "number" }, address: { type: "number" }, dl_number: { type: "number" }, expiry: { type: "number" } },
      required: ["name", "dob", "address", "dl_number", "expiry"],
    },
    issues: { type: "array", items: { type: "string" }, description: "Glare, blur, crop, or anything that made a field uncertain" },
  },
  required: ["readable", "id_type", "issuing_state", "first_name", "last_name", "dob", "expiry", "dl_number", "address_line1", "city", "state", "zip", "confidence", "issues"],
};

async function anthropicKey(sb: ReturnType<typeof serviceClient>): Promise<string> {
  const env = Deno.env.get("ANTHROPIC_API_KEY");
  if (env) return env;
  const { data } = await sb.from("app_settings").select("value").eq("key", "ANTHROPIC_API_KEY").maybeSingle();
  if (!data?.value) throw new Error("ANTHROPIC_API_KEY not set (env or app_settings)");
  return data.value;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function extractId(key: string, images: Array<{ mime: string; data: Uint8Array }>): Promise<{ fields: Extracted; usage: { input_tokens: number; output_tokens: number }; cost: number }> {
  const content: unknown[] = [];
  for (const im of images) {
    if (im.mime === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(im.data) } });
    else content.push({ type: "image", source: { type: "base64", media_type: im.mime, data: b64(im.data) } });
  }
  content.push({
    type: "text",
    text: "Extract the fields from this government-issued ID exactly as printed. Texas licenses label the fields with numbers: line 1 is the LAST name, line 2 is the FIRST name and middle name — always use the printed line numbers to decide which is which, never guess from how common a name is. Line 8 is the address. Read every digit of DOB, EXP, and the DL number carefully (US dates are MM/DD/YYYY). Dates as YYYY-MM-DD. If the card is not legible, set readable=false and explain in issues. Do not guess a field you cannot read — leave it empty and lower its confidence; report confidence honestly per field.",
  });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 800,
      system: "You are a careful document-extraction service for a Texas property-tax preparation company. You read one identification card and return its fields through the record_id_fields tool. You never invent values.",
      tools: [{ name: "record_id_fields", description: "Record the fields read from the ID card.", input_schema: ID_SCHEMA }],
      tool_choice: { type: "tool", name: "record_id_fields" },
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const tool = (j.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  if (!tool) throw new Error("no tool_use block in response");
  const usage = j.usage ?? { input_tokens: 0, output_tokens: 0 };
  const cost = (usage.input_tokens * PRICE_IN + usage.output_tokens * PRICE_OUT) / 1e6;
  return { fields: tool.input as Extracted, usage, cost };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Interim packet: data sheet + signature/audit block. Replaced by the official Form 50-114 fill once the PDF is on hand. */
async function buildPacket(p: {
  prop: PropertyRec; cust: Record<string, unknown>; lead: Record<string, unknown>; ex: Extracted; status: string; findings: string[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 740;
  const line = (t: string, bold = false, size = 11) => { page.drawText(t, { x: 54, y, size, font: bold ? fb : f, color: rgb(0.12, 0.15, 0.2) }); y -= size + 6; };
  line("Texas Refund Desk — Residence Homestead Exemption Application Packet (data sheet)", true, 13);
  line("Prepared for signature on Comptroller Form 50-114. This sheet accompanies the official form.", false, 9);
  y -= 8;
  line("PROPERTY", true);
  line(`TCAD account: ${p.prop.prop_id}    Situs: ${p.prop.situs_full}`);
  line(`Owner of record: ${p.prop.owner_name}    Deed date: ${p.prop.deed_date ?? "n/a"}`);
  line(`Late-application tax years requested (Tax Code §11.431): ${(p.lead.refund_years as number[] ?? []).join(", ")}`);
  y -= 8;
  line("APPLICANT (from Texas ID)", true);
  line(`Name: ${[p.ex.first_name, p.ex.middle_name, p.ex.last_name].filter(Boolean).join(" ")}    DOB: ${p.ex.dob}    ID exp: ${p.ex.expiry}`);
  line(`ID address: ${p.ex.address_line1}, ${p.ex.city}, ${p.ex.state} ${p.ex.zip}    ID #: ${p.ex.dl_number ? "on file (confidential, Tax Code §11.48)" : "not read"}`);
  line(`Email: ${p.cust.email}    Phone: ${p.cust.phone ?? "—"}    Occupied since: ${p.cust.occupied_since ?? "on/before Jan 1 of earliest year"}`);
  y -= 8;
  line("VALIDATION", true);
  line(`Routing: ${p.status}`);
  for (const s of p.findings) line(`• ${s}`, false, 10);
  y -= 8;
  line("ELECTRONIC SIGNATURE RECORD", true);
  line(`Signed by: ${p.cust.signature_name}    At: ${p.cust.agreement_signed_at}    IP: ${p.cust.signature_ip}`);
  line(`Device: ${String(p.cust.signature_ua ?? "").slice(0, 90)}`, false, 9);
  line("The applicant typed their name as an electronic signature after consenting to ESIGN; this record is stamped on the application.", false, 9);
  return await doc.save();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const sb = serviceClient();
  const { customer_id } = await req.json().catch(() => ({}));
  if (!customer_id) return Response.json({ error: "customer_id required" }, { status: 400 });

  const { data: cust } = await sb.from("customers").select("*").eq("id", customer_id).single();
  if (!cust) return Response.json({ error: "customer not found" }, { status: 404 });
  const { data: lead } = await sb.from("leads").select("*").eq("id", cust.lead_id).single();
  const { data: prop } = await sb.from("properties").select("*").eq("prop_id", lead.prop_id).single();
  const { data: docs } = await sb.from("documents").select("*").eq("customer_id", customer_id).in("kind", ["dl_front", "dl_back"]);
  if (!docs?.length) return Response.json({ error: "no documents" }, { status: 400 });

  await sb.from("customers").update({ status: "processing" }).eq("id", customer_id);
  try {
    const images: Array<{ mime: string; data: Uint8Array }> = [];
    for (const d of docs) {
      const { data: blob, error } = await sb.storage.from("ids").download(d.storage_path);
      if (error || !blob) throw new Error("download failed: " + error?.message);
      images.push({ mime: d.mime, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    const key = await anthropicKey(sb);
    const { fields, usage, cost } = await extractId(key, images);
    const v = validate(fields, prop as PropertyRec, cust.full_name);

    // Persist extraction (front doc carries it) — never store the raw DL number in plain text beyond what the form needs.
    const front = docs.find((d) => d.kind === "dl_front") ?? docs[0];
    await sb.from("documents").update({
      extracted: { ...fields, dl_number: fields.dl_number ? "***" + String(fields.dl_number).slice(-4) : "" },
      extraction_model: MODEL, extraction_cost_usd: cost, validation: v,
    }).eq("id", front.id);

    const status = cust.status === "needs_review" ? "needs_review" : v.status; // eligibility answers already routed to review
    const reason = cust.status === "needs_review" ? cust.status_reason : v.findings.filter((x) => x.startsWith("!")).join("; ") || null;

    const pdf = await buildPacket({ prop: prop as PropertyRec, cust, lead, ex: fields, status, findings: v.findings });
    const packetPath = `${customer_id}/packet-${Date.now()}.pdf`;
    const { error: upErr } = await sb.storage.from("packets").upload(packetPath, pdf, { contentType: "application/pdf" });
    if (upErr) throw new Error("packet upload failed: " + upErr.message);
    await sb.from("filings").insert({
      customer_id, form_version: "50-114 (interim data sheet)", tax_years: lead.refund_years,
      packet_path: packetPath, packet_sha256: await sha256Hex(pdf),
    });

    await sb.from("customers").update({ status, status_reason: reason }).eq("id", customer_id);

    // Draft the follow-up for human approval (shadow mode). The Python agent can later replace these with richer drafts.
    const first = String(cust.full_name).split(" ")[0];
    const drafts: Record<string, { subject: string; body: string; intent: string }> = {
      needs_dl_update: {
        intent: "needs_dl_update", subject: "One quick step before we can file — your license address",
        body: `Hi ${first}, we reviewed your ID and the address on it (${fields.address_line1}, ${fields.city} ${fields.zip}) doesn't match ${prop.situs_full}. TCAD requires them to match before it will approve a homestead exemption.\n\nFastest fix: update your address with the Texas DPS online (about 10 minutes): https://www.dps.texas.gov/section/driver-license/change-your-address — then reply with a photo of the confirmation or updated card and we'll finish your application the same day.\n\nYour claim is on hold until then; nothing has been filed. (You can also file yourself for free at traviscad.org once your address is updated.)`,
      },
      ready_to_submit: {
        intent: "ready_to_submit", subject: "Your homestead application is ready to review",
        body: `Hi ${first}, your Form 50-114 for ${prop.situs_full} is prepared, including the late-application request for ${(lead.refund_years ?? []).join(" and ")}. Please check your name, address, and dates in the attached packet.\n\nReply "go" and we'll submit it to the Travis Central Appraisal District today, or tell us what to change. TCAD typically takes 30–90 days; nothing is owed until a refund is actually issued.`,
      },
      needs_review: {
        intent: "needs_review", subject: "Quick question about your homestead claim",
        body: `Hi ${first}, before we prepare anything we need to check one thing: ${reason ?? "a detail on your ID didn't line up with the appraisal record"}. Could you reply with a note (or a clearer photo of your ID)? Nothing has been filed, and you owe nothing.`,
      },
    };
    const d = drafts[status] ?? drafts.needs_review;
    await sb.from("messages").insert({ customer_id, direction: "outbound", channel: "email", subject: d.subject, body: d.body, intent: d.intent, agent_draft: true });
    await sb.from("audit_log").insert({ actor: "process-claim", action: "processed", entity: "customers", entity_id: customer_id, detail: { status, reason, usage, cost, model: MODEL, findings: v.findings } });
    return Response.json({ ok: true, status, reason, findings: v.findings, cost, usage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("customers").update({ status: "needs_review", status_reason: "processing error: " + msg.slice(0, 200) }).eq("id", customer_id);
    await sb.from("audit_log").insert({ actor: "process-claim", action: "error", entity: "customers", entity_id: customer_id, detail: { error: msg } });
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
