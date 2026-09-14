// Claim API (JSON). The page itself is static (docs/claim.html, served by GitHub Pages / texasrefunddesk.com) because
// Supabase forces text/plain + a sandbox CSP on anything served from *.supabase.co.
//   GET  /claim?c=CODE           -> lead + property JSON (logs a view, marks the lead opened)
//   POST /claim (multipart)      -> accepts the claim: eligibility answers, ID upload(s), contact, consent, typed signature.
//                                   Data model v2 (SPEC-04): the person is a `customers` account matched by e-mail
//                                   (case-insensitive, citext); the engagement is a `claims` row with customer_id.
// Auth is the unguessable claim code; CORS is open (the code is the secret). verify_jwt is off.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { clientIp, serviceClient } from "./db.ts";

const CODE_RE = /^TRD-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const MAX_BYTES = 15 * 1024 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });
}

export function normCode(raw: string | null): string | null {
  if (!raw) return null;
  const c = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== 11 || !c.startsWith("TRD")) return null;
  const code = `TRD-${c.slice(3, 7)}-${c.slice(7, 11)}`;
  return CODE_RE.test(code) ? code : null;
}

async function loadLead(sb: ReturnType<typeof serviceClient>, code: string) {
  const { data: lead } = await sb.from("leads").select("*").eq("claim_code", code).maybeSingle();
  if (!lead) return null;
  const { data: prop } = await sb.from("properties").select("prop_id, owner_name, situs_full, situs_zip").eq("prop_id", lead.prop_id).single();
  if (!prop) return null;
  return { lead, prop };
}

async function rateLimited(sb: ReturnType<typeof serviceClient>, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sb.from("events").select("id", { count: "exact", head: true })
    .eq("kind", "view").gte("at", since).contains("detail", { ip });
  return (count ?? 0) > 120;
}

const OPEN = ["new", "mailed", "opened"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const sb = serviceClient();
  const url = new URL(req.url);
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? "";

  if (req.method === "GET") {
    const code = normCode(url.searchParams.get("c"));
    if (!code) return json({ ok: false, error: "not_found" }, 404);
    if (await rateLimited(sb, ip)) return json({ ok: false, error: "rate_limited" }, 429);
    const found = await loadLead(sb, code);
    if (!found) {
      await sb.from("events").insert({ claim_code: code, kind: "view_miss", detail: { ip, ua } });
      return json({ ok: false, error: "not_found" }, 404);
    }
    const { lead, prop } = found;
    await sb.from("events").insert({ claim_code: code, kind: "view", detail: { ip, ua } });
    if (lead.status === "new" || lead.status === "mailed") {
      await sb.from("leads").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", lead.id).in("status", ["new", "mailed"]);
    }
    const years = (lead.refund_years ?? []).slice().sort();
    // Closed claims still return the situs + years so agreement.html can render its parties/years (the code is the secret).
    if (!OPEN.includes(lead.status)) return json({ ok: false, error: "closed", status: lead.status, property: { situs_full: prop.situs_full }, lead: { refund_years: years } });
    const earliest = years[0] ?? new Date().getFullYear() - 2;
    return json({
      ok: true,
      lead: { claim_code: lead.claim_code, refund_years: years, est_refund_total: Number(lead.est_refund_total), est_refund_by_year: lead.est_refund_by_year,
              est_forward_annual: Number(lead.est_forward_annual), tier: lead.tier },
      property: { prop_id: prop.prop_id, owner_name: prop.owner_name, situs_full: prop.situs_full },
      earliest_year: earliest, deadline: `February 1, ${earliest + 3}`,
    });
  }

  if (req.method === "POST") {
    let form: FormData;
    try { form = await req.formData(); } catch { return json({ ok: false, errors: ["Bad form"] }, 400); }
    const code = normCode(String(form.get("c") ?? ""));
    if (!code) return json({ ok: false, error: "not_found" }, 404);
    const found = await loadLead(sb, code);
    if (!found) return json({ ok: false, error: "not_found" }, 404);
    const { lead } = found;
    if (!OPEN.includes(lead.status)) return json({ ok: false, error: "closed", status: lead.status });

    const get = (k: string) => String(form.get(k) ?? "").trim();
    const fullName = get("full_name"), email = get("email"), phone = get("phone"), sig = get("signature_name");
    const ownedJan1 = get("owned_jan1"), primary = get("primary"), otherHs = get("other_hs"), movedIn = get("moved_in");
    const household = ["single", "married", "other"].includes(get("household")) ? get("household") : "single";
    const prevHs = get("prev_homestead") === "yes", prevAddr = get("prev_homestead_address");
    const front = form.get("dl_front"), back = form.get("dl_back");
    const consents = ["agree_terms", "agree_esign", "agree_free"].every((k) => form.get(k) != null);

    const errors: string[] = [];
    if (!fullName || !email || !sig) errors.push("Name, email, and typed signature are required.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("Please enter a valid email address.");
    if (!consents) errors.push("Please check all three agreement boxes.");
    if (!(front instanceof File) || front.size === 0) errors.push("Please add a photo of the front of your license.");
    else if (front.size > MAX_BYTES || !MIMES.has(front.type)) errors.push("License photo must be a JPEG/PNG/WebP/PDF under 15 MB.");
    if (sig && fullName && sig.toLowerCase().replace(/\s+/g, " ") !== fullName.toLowerCase().replace(/\s+/g, " ")) {
      errors.push("Your typed signature must match your full name exactly.");
    }
    if (errors.length) return json({ ok: false, errors }, 400);

    // Eligibility answers that block before any extraction run: structured findings (ADR 0013) + the display string.
    const findings: Array<{ code: string; severity: string; field: string; message: string }> = [];
    if (primary === "no") findings.push({ code: "not_primary", severity: "blocking", field: "primary", message: "Not primary residence per applicant" });
    if (otherHs === "yes") findings.push({ code: "other_homestead", severity: "blocking", field: "other_hs", message: "Applicant reports another homestead exemption" });
    const status = findings.length ? "needs_review" : "submitted";
    const reason = findings.map((f) => f.message).join("; ") || null;
    let occupiedSince: string | null = null;
    if (ownedJan1 === "no" && /^\d{4}-\d{2}$/.test(movedIn)) occupiedSince = movedIn + "-01";

    // The account: look the e-mail up (citext = case-insensitive); attach, or create it from this claim.
    let account = (await sb.from("customers").select("id").eq("email", email).maybeSingle()).data;
    let created = false;
    if (!account) {
      const ins = await sb.from("customers").insert({ email, full_name: fullName, phone: phone || null }).select("id").single();
      if (ins.error) account = (await sb.from("customers").select("id").eq("email", email).maybeSingle()).data; // lost a race: someone inserted it
      else { account = ins.data; created = true; }
    } else {
      await sb.from("customers").update({ full_name: fullName, phone: phone || null }).eq("id", account.id); // latest values as typed
    }
    if (!account) return json({ ok: false, errors: ["Something went wrong saving your claim. Please try again."] }, 500);

    const { data: cust, error: cErr } = await sb.from("claims").insert({
      lead_id: lead.id, customer_id: account.id, service_type: "homestead_refund", full_name: fullName, email, phone: phone || null,
      occupied_since: occupiedSince, owns_other_homestead: otherHs === "yes",
      household, prev_homestead: prevHs, prev_homestead_address: prevHs ? prevAddr || null : null,
      agreement_version: "v0.1", agreement_signed_at: new Date().toISOString(),
      signature_name: sig, signature_ip: ip, signature_ua: ua, status, status_reason: reason, findings,
    }).select("id").single();
    if (cErr || !cust) return json({ ok: false, errors: ["Something went wrong saving your claim. Please try again."] }, 500);
    if (created) await sb.from("customers").update({ created_from_claim_id: cust.id }).eq("id", account.id);

    const uploads: Array<{ kind: string; file: File }> = [{ kind: "dl_front", file: front as File }];
    if (back instanceof File && back.size > 0 && back.size <= MAX_BYTES && MIMES.has(back.type)) uploads.push({ kind: "dl_back", file: back });
    for (const u of uploads) {
      const ext = u.file.type === "image/png" ? "png" : u.file.type === "image/webp" ? "webp" : u.file.type === "application/pdf" ? "pdf" : "jpg";
      const path = `${cust.id}/${u.kind}.${ext}`;
      const { error: upErr } = await sb.storage.from("ids").upload(path, u.file, { contentType: u.file.type, upsert: true });
      if (upErr) return json({ ok: false, errors: ["Upload failed: " + upErr.message] }, 500);
      await sb.from("documents").insert({ claim_id: cust.id, kind: u.kind, storage_path: path, mime: u.file.type, bytes: u.file.size });
    }

    await sb.from("leads").update({ status: "claimed" }).eq("id", lead.id);
    await sb.from("events").insert({ claim_code: code, kind: "claim_submitted", detail: { ip, ua, claim_id: cust.id, customer_id: account.id, status } });
    await sb.from("audit_log").insert({ actor: "claim-api", action: "claim_submitted", entity: "claims", entity_id: cust.id, detail: { code, status, reason, customer_id: account.id, account_created: created } });

    const kick = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/process-claim`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ claim_id: cust.id }),
    }).catch((e) => console.error("process-claim kick failed", e));
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(kick);

    return json({ ok: true, first_name: fullName.split(" ")[0], claim_id: cust.id, customer_id: account.id });
  }

  return json({ ok: false, error: "method_not_allowed" }, 405);
});
