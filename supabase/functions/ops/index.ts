// ops: password-protected operations page. Lists claims by status, shows extraction/validation, packet links (signed URLs),
// and the agent's drafted messages with approve/discard. Also a funnel summary. GET /ops?key=<OPS_PASSWORD>
// POST /ops?key=... with action=approve|discard&message_id=... (shadow mode: approving marks it ready; sending is a later step).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { BRAND, esc, html, moneyFloor, serviceClient } from "./db.ts";

async function opsKey(sb: ReturnType<typeof serviceClient>): Promise<string> {
  const env = Deno.env.get("OPS_PASSWORD"); if (env) return env;
  const { data } = await sb.from("app_settings").select("value").eq("key", "OPS_PASSWORD").maybeSingle();
  return data?.value ?? "";
}

const CSS = `
:root{--navy:#1F3864;--ink:#1F2733;--grey:#6B7686;--line:#C9D2DF;--tint:#F1F4F9;--amber:#C08A2E;--ok:#2E7D4F}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#fff}
.wrap{max-width:1100px;margin:0 auto;padding:16px}
h1{color:var(--navy);font-size:20px;margin:6px 0 14px}h2{color:var(--navy);font-size:15px;text-transform:uppercase;letter-spacing:.4px;margin:22px 0 8px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
.kpi{background:var(--tint);border:1px solid var(--line);border-radius:8px;padding:10px 12px}.kpi b{display:block;font-size:22px;color:var(--navy)}.kpi span{font-size:12px;color:var(--grey)}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:12px;color:#fff;background:var(--navy);padding:8px}td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;background:var(--tint);border:1px solid var(--line)}
.pill.ready{background:#e6f4ec;border-color:var(--ok)}.pill.dl{background:#fff4e5;border-color:var(--amber)}.pill.rev{background:#fde8e8;border-color:#c0392b}
.find{font-size:12px;color:var(--grey);margin:2px 0}.find.bad{color:#b03a2e}
.draft{background:var(--tint);border:1px solid var(--line);border-radius:8px;padding:10px;margin:6px 0;white-space:pre-wrap;font-size:13px}
button{background:var(--navy);color:#fff;border:0;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;margin-right:6px}button.sec{background:#fff;color:var(--navy);border:1px solid var(--line)}
a{color:var(--navy)}.small{font-size:12px;color:var(--grey)}
`;

function pill(status: string): string {
  const cls = status === "ready_to_submit" ? "ready" : status === "needs_dl_update" ? "dl" : status === "needs_review" ? "rev" : "";
  return `<span class="pill ${cls}">${esc(status)}</span>`;
}

Deno.serve(async (req: Request) => {
  const sb = serviceClient();
  const url = new URL(req.url);
  const want = await opsKey(sb);
  const key = url.searchParams.get("key") ?? "";
  if (!want || key !== want) return html(`<p style="font-family:sans-serif">Forbidden.</p>`, 403);

  if (req.method === "POST") {
    const form = await req.formData();
    const action = String(form.get("action") ?? ""), mid = String(form.get("message_id") ?? "");
    if (mid && action === "approve") await sb.from("messages").update({ agent_draft: false, approved_by: "ops", approved_at: new Date().toISOString() }).eq("id", mid);
    if (mid && action === "discard") await sb.from("messages").delete().eq("id", mid);
    await sb.from("audit_log").insert({ actor: "ops", action: `message_${action}`, entity: "messages", entity_id: mid });
    return new Response(null, { status: 303, headers: { location: `/functions/v1/ops?key=${encodeURIComponent(key)}` } });
  }

  // funnel
  const counts: Record<string, number> = {};
  const { data: leadStatuses } = await sb.from("leads").select("status");
  for (const r of leadStatuses ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const { count: views } = await sb.from("events").select("id", { count: "exact", head: true }).eq("kind", "view");

  const { data: custs } = await sb.from("customers").select("*, leads(claim_code, est_refund_total, prop_id, properties(situs_full, owner_name))").order("created_at", { ascending: false }).limit(200);
  const ids = (custs ?? []).map((c) => c.id);
  const { data: docs } = ids.length ? await sb.from("documents").select("customer_id, kind, extracted, validation, extraction_cost_usd").in("customer_id", ids) : { data: [] };
  const { data: filings } = ids.length ? await sb.from("filings").select("customer_id, packet_path, generated_at, form_version").in("customer_id", ids) : { data: [] };
  const { data: msgs } = ids.length ? await sb.from("messages").select("*").in("customer_id", ids).order("created_at", { ascending: false }) : { data: [] };

  const rows: string[] = [];
  for (const c of custs ?? []) {
    const lead = c.leads ?? {}; const prop = lead.properties ?? {};
    const d = (docs ?? []).find((x) => x.customer_id === c.id && x.kind === "dl_front");
    const v = d?.validation as { findings?: string[] } | null;
    const fil = (filings ?? []).filter((x) => x.customer_id === c.id).sort((a, b) => (a.generated_at < b.generated_at ? 1 : -1))[0];
    let packetLink = "";
    if (fil?.packet_path) {
      const { data: s } = await sb.storage.from("packets").createSignedUrl(fil.packet_path, 600);
      if (s?.signedUrl) packetLink = `<a href="${esc(s.signedUrl)}" target="_blank">packet PDF</a> <span class="small">(${esc(fil.form_version)})</span>`;
    }
    const drafts = (msgs ?? []).filter((m) => m.customer_id === c.id).map((m) => `
      <div class="draft"><b>${esc(m.subject)}</b> <span class="small">${m.agent_draft ? "DRAFT (agent)" : "approved"} · ${esc(m.intent ?? "")}</span>\n${esc(m.body)}
      ${m.agent_draft ? `<form method="post" style="margin-top:6px"><input type="hidden" name="message_id" value="${esc(m.id)}"><button name="action" value="approve">Approve</button><button class="sec" name="action" value="discard">Discard</button></form>` : ""}</div>`).join("");
    const ex = d?.extracted as Record<string, unknown> | null;
    rows.push(`<tr>
      <td><b>${esc(prop.situs_full ?? "")}</b><br><span class="small">${esc(prop.owner_name ?? "")} · ${esc(lead.claim_code ?? "")} · est ${moneyFloor(lead.est_refund_total)}</span><br>
          <span class="small">${esc(c.full_name)} · ${esc(c.email)} · ${esc(c.phone ?? "")}</span><br><span class="small">signed ${esc(String(c.agreement_signed_at ?? "").slice(0, 16))} from ${esc(String(c.signature_ip ?? ""))}</span></td>
      <td>${pill(c.status)}<br><span class="small">${esc(c.status_reason ?? "")}</span></td>
      <td>${ex ? `<span class="small">${esc(ex.first_name)} ${esc(ex.last_name)} · DOB ${esc(ex.dob)} · ${esc(ex.address_line1)}, ${esc(ex.city)} ${esc(ex.zip)} · exp ${esc(ex.expiry)} · $${Number(d?.extraction_cost_usd ?? 0).toFixed(4)}</span>` : `<span class="small">not extracted</span>`}
          ${(v?.findings ?? []).map((f) => `<div class="find ${f.startsWith("!") ? "bad" : ""}">${esc(f)}</div>`).join("")}
          ${packetLink}</td>
      <td>${drafts || `<span class="small">—</span>`}</td>
    </tr>`);
  }

  const body = `
<h1>${esc(BRAND)} — Ops</h1>
<div class="kpis">
  <div class="kpi"><b>${(leadStatuses ?? []).length}</b><span>leads loaded</span></div>
  <div class="kpi"><b>${counts.mailed ?? 0}</b><span>mailed</span></div>
  <div class="kpi"><b>${views ?? 0}</b><span>page views</span></div>
  <div class="kpi"><b>${(counts.opened ?? 0) + (counts.claimed ?? 0)}</b><span>opened</span></div>
  <div class="kpi"><b>${counts.claimed ?? 0}</b><span>claimed</span></div>
  <div class="kpi"><b>${(custs ?? []).filter((c) => c.status === "ready_to_submit").length}</b><span>ready to submit</span></div>
  <div class="kpi"><b>${(custs ?? []).filter((c) => c.status === "needs_dl_update").length}</b><span>need DL update</span></div>
  <div class="kpi"><b>${(custs ?? []).filter((c) => c.status === "needs_review").length}</b><span>need review</span></div>
</div>
<h2>Claims</h2>
<table><tr><th>Property / customer</th><th>Status</th><th>ID extraction · validation · packet</th><th>Agent drafts (shadow mode)</th></tr>${rows.join("") || `<tr><td colspan="4" class="small">No claims yet.</td></tr>`}</table>
<p class="small">Shadow mode: nothing is sent to a homeowner until a draft is approved here. Packet links expire after 10 minutes.</p>`;
  return html(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Ops — ${esc(BRAND)}</title><style>${CSS}</style></head><body><div class="wrap">${body}</div></body></html>`);
});
