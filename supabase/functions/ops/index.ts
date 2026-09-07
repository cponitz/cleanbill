// ops API (JSON). The dashboard page is static (docs/ops.html). Password-gated via ?key= or x-ops-key header.
//   GET  /ops                       -> funnel KPIs + claims with extraction/validation, signed packet URLs, drafts
//   POST /ops {action, message_id}  -> approve | discard a draft (shadow mode: approving marks it ready; sending is a later step)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient } from "./db.ts";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, x-ops-key", "cache-control": "no-store" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });

async function opsKey(sb: ReturnType<typeof serviceClient>): Promise<string> {
  const env = Deno.env.get("OPS_PASSWORD"); if (env) return env;
  const { data } = await sb.from("app_settings").select("value").eq("key", "OPS_PASSWORD").maybeSingle();
  return data?.value ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const sb = serviceClient();
  const url = new URL(req.url);
  const want = await opsKey(sb);
  const key = req.headers.get("x-ops-key") ?? url.searchParams.get("key") ?? "";
  if (!want || key !== want) return json({ ok: false, error: "forbidden" }, 403);

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? ""), mid = String(body.message_id ?? "");
    if (!mid || !["approve", "discard"].includes(action)) return json({ ok: false, error: "bad_request" }, 400);
    if (action === "approve") await sb.from("messages").update({ agent_draft: false, approved_by: "ops", approved_at: new Date().toISOString() }).eq("id", mid);
    if (action === "discard") await sb.from("messages").delete().eq("id", mid);
    await sb.from("audit_log").insert({ actor: "ops", action: `message_${action}`, entity: "messages", entity_id: mid });
    return json({ ok: true });
  }

  // Per-status counts via head queries (a plain select is capped at 1,000 rows by PostgREST).
  const counts: Record<string, number> = {};
  let leadsTotal = 0;
  for (const st of ["new", "mailed", "opened", "claimed", "filed", "approved", "refunded", "closed", "suppressed"]) {
    const { count } = await sb.from("leads").select("id", { count: "exact", head: true }).eq("status", st);
    counts[st] = count ?? 0; leadsTotal += count ?? 0;
  }
  const { count: views } = await sb.from("events").select("id", { count: "exact", head: true }).eq("kind", "view");
  const { data: custs } = await sb.from("customers").select("*, leads(claim_code, est_refund_total, prop_id, properties(situs_full, owner_name))").order("created_at", { ascending: false }).limit(200);
  const ids = (custs ?? []).map((c) => c.id);
  const { data: docs } = ids.length ? await sb.from("documents").select("customer_id, kind, extracted, validation, extraction_cost_usd").in("customer_id", ids) : { data: [] };
  const { data: filings } = ids.length ? await sb.from("filings").select("customer_id, packet_path, generated_at, form_version").in("customer_id", ids) : { data: [] };
  const { data: msgs } = ids.length ? await sb.from("messages").select("*").in("customer_id", ids).order("created_at", { ascending: false }) : { data: [] };

  const claims = [];
  for (const c of custs ?? []) {
    const lead = c.leads ?? {}; const prop = lead.properties ?? {};
    const d = (docs ?? []).find((x) => x.customer_id === c.id && x.kind === "dl_front");
    const fil = (filings ?? []).filter((x) => x.customer_id === c.id).sort((a, b) => (a.generated_at < b.generated_at ? 1 : -1))[0];
    let packetUrl: string | null = null;
    if (fil?.packet_path) {
      const { data: s } = await sb.storage.from("packets").createSignedUrl(fil.packet_path, 600);
      packetUrl = s?.signedUrl ?? null;
    }
    claims.push({
      id: c.id, status: c.status, status_reason: c.status_reason, full_name: c.full_name, email: c.email, phone: c.phone,
      signed_at: c.agreement_signed_at, signature_ip: c.signature_ip, created_at: c.created_at,
      claim_code: lead.claim_code, est_refund_total: lead.est_refund_total, situs_full: prop.situs_full, owner_name: prop.owner_name,
      extracted: d?.extracted ?? null, findings: (d?.validation as { findings?: string[] } | null)?.findings ?? [], extraction_cost_usd: d?.extraction_cost_usd ?? null,
      packet: fil ? { url: packetUrl, form_version: fil.form_version, generated_at: fil.generated_at } : null,
      messages: (msgs ?? []).filter((m) => m.customer_id === c.id).map((m) => ({ id: m.id, subject: m.subject, body: m.body, intent: m.intent, agent_draft: m.agent_draft, direction: m.direction, created_at: m.created_at })),
    });
  }
  const kpis = {
    leads_loaded: leadsTotal, mailed: counts.mailed ?? 0, page_views: views ?? 0,
    opened: (counts.opened ?? 0) + (counts.claimed ?? 0), claimed: counts.claimed ?? 0,
    ready_to_submit: claims.filter((c) => c.status === "ready_to_submit").length,
    needs_dl_update: claims.filter((c) => c.status === "needs_dl_update").length,
    needs_review: claims.filter((c) => c.status === "needs_review").length,
  };
  return json({ ok: true, kpis, claims });
});
