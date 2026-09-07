// Public claim page: GET renders a lead's personalized page; POST accepts the claim (ID upload, consent, signature).
// Auth is the unguessable claim code (random, stored on the lead) — verify_jwt is off for this function.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { clientIp, html, serviceClient } from "./db.ts";
import { renderAgreement, renderClaim, renderClosed, renderNotFound, renderThanks } from "./page.ts";

const CODE_RE = /^TRD-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const MAX_BYTES = 15 * 1024 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function normCode(raw: string | null): string | null {
  if (!raw) return null;
  const c = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== 11 || !c.startsWith("TRD")) return null;
  const code = `TRD-${c.slice(3, 7)}-${c.slice(7, 11)}`;
  return CODE_RE.test(code) ? code : null;
}

async function loadLead(sb: ReturnType<typeof serviceClient>, code: string) {
  const { data: lead } = await sb.from("leads").select("*").eq("claim_code", code).maybeSingle();
  if (!lead) return null;
  const { data: prop } = await sb.from("properties").select("prop_id, owner_name, situs_full").eq("prop_id", lead.prop_id).single();
  if (!prop) return null;
  return { lead, prop };
}

async function rateLimited(sb: ReturnType<typeof serviceClient>, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sb.from("events").select("id", { count: "exact", head: true })
    .eq("kind", "view").gte("at", since).contains("detail", { ip });
  return (count ?? 0) > 120;
}

function yearsText(years: number[]): string {
  const y = (years ?? []).slice().sort();
  return y.length <= 1 ? String(y[0] ?? "") : y.slice(0, -1).join(", ") + " and " + y[y.length - 1];
}

Deno.serve(async (req: Request) => {
  const sb = serviceClient();
  const url = new URL(req.url);
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const isAgreement = url.pathname.endsWith("/agreement");

  if (req.method === "GET") {
    const code = normCode(url.searchParams.get("c"));
    if (!code) return html(renderNotFound(), 404);
    if (await rateLimited(sb, ip)) return new Response("Too many requests", { status: 429 });
    const found = await loadLead(sb, code);
    if (!found) {
      await sb.from("events").insert({ claim_code: code, kind: "view_miss", detail: { ip, ua } });
      return html(renderNotFound(), 404);
    }
    const { lead, prop } = found;
    if (isAgreement) return html(renderAgreement(prop, yearsText(lead.refund_years)));
    await sb.from("events").insert({ claim_code: code, kind: "view", detail: { ip, ua } });
    if (lead.status === "new" || lead.status === "mailed") {
      await sb.from("leads").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", lead.id).in("status", ["new", "mailed"]);
    }
    if (!["new", "mailed", "opened"].includes(lead.status)) return html(renderClosed(lead.status));
    return html(renderClaim(lead, prop));
  }

  if (req.method === "POST") {
    let form: FormData;
    try { form = await req.formData(); } catch { return new Response("Bad form", { status: 400 }); }
    const code = normCode(String(form.get("c") ?? ""));
    if (!code) return html(renderNotFound(), 404);
    const found = await loadLead(sb, code);
    if (!found) return html(renderNotFound(), 404);
    const { lead, prop } = found;
    if (!["new", "mailed", "opened"].includes(lead.status)) return html(renderClosed(lead.status));

    const get = (k: string) => String(form.get(k) ?? "").trim();
    const fullName = get("full_name"), email = get("email"), phone = get("phone"), sig = get("signature_name");
    const ownedJan1 = get("owned_jan1"), primary = get("primary"), otherHs = get("other_hs"), movedIn = get("moved_in");
    const front = form.get("dl_front"), back = form.get("dl_back");
    const consents = ["agree_terms", "agree_esign", "agree_free"].every((k) => form.get(k) != null);

    const problems: string[] = [];
    if (!fullName || !email || !sig) problems.push("Name, email, and typed signature are required.");
    if (!consents) problems.push("Please check all three agreement boxes.");
    if (!(front instanceof File) || front.size === 0) problems.push("Please add a photo of the front of your license.");
    else if (front.size > MAX_BYTES || !MIMES.has(front.type)) problems.push("License photo must be a JPEG/PNG/WebP/PDF under 15 MB.");
    if (sig && fullName && sig.toLowerCase().replace(/\s+/g, " ") !== fullName.toLowerCase().replace(/\s+/g, " ")) {
      problems.push("Your typed signature must match your full name exactly.");
    }
    if (problems.length) return html(renderClaim(lead, prop, problems.join(" ")), 400);

    // status routing from eligibility answers
    let status = "submitted", reason: string | null = null;
    if (primary === "no") { status = "needs_review"; reason = "Not primary residence per applicant"; }
    else if (otherHs === "yes") { status = "needs_review"; reason = "Applicant reports another homestead exemption"; }
    let occupiedSince: string | null = null;
    if (ownedJan1 === "no" && /^\d{4}-\d{2}$/.test(movedIn)) occupiedSince = movedIn + "-01";

    const { data: cust, error: cErr } = await sb.from("customers").insert({
      lead_id: lead.id, full_name: fullName, email, phone: phone || null,
      occupied_since: occupiedSince, owns_other_homestead: otherHs === "yes",
      agreement_version: "v0.1", agreement_signed_at: new Date().toISOString(),
      signature_name: sig, signature_ip: ip, signature_ua: ua, status, status_reason: reason,
    }).select("id").single();
    if (cErr || !cust) return html(renderClaim(lead, prop, "Something went wrong saving your claim. Please try again."), 500);

    const uploads: Array<{ kind: string; file: File }> = [{ kind: "dl_front", file: front as File }];
    if (back instanceof File && back.size > 0 && back.size <= MAX_BYTES && MIMES.has(back.type)) uploads.push({ kind: "dl_back", file: back });
    for (const u of uploads) {
      const ext = u.file.type === "image/png" ? "png" : u.file.type === "image/webp" ? "webp" : u.file.type === "application/pdf" ? "pdf" : "jpg";
      const path = `${cust.id}/${u.kind}.${ext}`;
      const { error: upErr } = await sb.storage.from("ids").upload(path, u.file, { contentType: u.file.type, upsert: true });
      if (upErr) return html(renderClaim(lead, prop, "Upload failed: " + upErr.message), 500);
      await sb.from("documents").insert({ customer_id: cust.id, kind: u.kind, storage_path: path, mime: u.file.type, bytes: u.file.size });
    }

    await sb.from("leads").update({ status: "claimed" }).eq("id", lead.id);
    await sb.from("events").insert({ claim_code: code, kind: "claim_submitted", detail: { ip, ua, customer_id: cust.id, status } });
    await sb.from("audit_log").insert({ actor: "claim-page", action: "claim_submitted", entity: "customers", entity_id: cust.id, detail: { code, status, reason } });

    // Kick off extraction + validation + packet generation without blocking the homeowner's confirmation.
    const kick = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/process-claim`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ customer_id: cust.id }),
    }).catch((e) => console.error("process-claim kick failed", e));
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(kick);

    return html(renderThanks(fullName.split(" ")[0]));
  }

  return new Response("Method not allowed", { status: 405 });
});
