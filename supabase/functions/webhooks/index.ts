// webhooks — inbound provider callbacks (SPEC-10 §4.3; shared with SPEC-11's Lob later). No Supabase JWT (providers
// cannot send one; verify_jwt=false in config.toml): the provider's signature is the credential.
//   POST /webhooks/resend   Svix-signed Resend events (email.sent|delivered|delivery_delayed|bounced|complained|opened)
//                           -> messages.delivery_status / delivery_detail by provider_message_id; bounced / complained also
//                              write an `events` row (kind email_bounced / email_complained) with the claim code, and a
//                              system_status row `resend_webhook` records every accepted event for the /ops Health line.
// Unknown message ids answer 200 (Resend retries on non-2xx; a stray event is logged, not an error). A bad or missing
// signature answers 401 and is logged. Nothing here sends anything.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serviceClient } from "../_shared/db.ts";
import { verifySvix } from "../_shared/webhook_sig.ts";
import { appendDetail, EVENT_KIND, nextStatus, parseEvent, reasonOf } from "./logic.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function resend(req: Request): Promise<Response> {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) { console.error("webhooks/resend: RESEND_WEBHOOK_SECRET not set"); return json({ ok: false, error: "webhook_not_configured" }, 503); }
  const body = await req.text();
  const v = await verifySvix(req.headers, body, secret);
  if (!v.ok) { console.warn("webhooks/resend: rejected", v.error, req.headers.get("svix-id") ?? "-"); return json({ ok: false, error: v.error }, 401); }
  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return json({ ok: false, error: "bad_json" }, 400); }
  const ev = parseEvent(raw);
  if (!ev) return json({ ok: false, error: "bad_event" }, 400);

  const sb = serviceClient();
  const now = new Date().toISOString();
  const { data: msg } = ev.emailId
    ? await sb.from("messages").select("id, claim_id, delivery_status, delivery_detail").eq("provider_message_id", ev.emailId).maybeSingle()
    : { data: null };
  const status = nextStatus(ev.type);
  await sb.from("system_status").upsert({ key: "resend_webhook", value: { type: ev.type, at: ev.entry.at, received_at: now, svix_id: v.id, email_id: ev.emailId, known: !!msg, status }, updated_at: now }, { onConflict: "key" });
  if (!msg) { console.log("webhooks/resend: no message for", ev.type, ev.emailId ?? "-"); return json({ ok: true, known: false }); }

  const patch: Record<string, unknown> = { delivery_detail: appendDetail(msg.delivery_detail, ev.entry) };
  if (status) patch.delivery_status = status;
  await sb.from("messages").update(patch).eq("id", msg.id);
  const kind = status ? EVENT_KIND[status] : undefined;
  if (kind) {
    const { data: c } = await sb.from("claims").select("id, leads(claim_code)").eq("id", msg.claim_id).maybeSingle();
    const code = (c as { leads?: { claim_code?: string } } | null)?.leads?.claim_code ?? null;
    await sb.from("events").insert({ claim_code: code, kind, detail: { message_id: msg.id, email_id: ev.emailId, reason: reasonOf(ev.entry) } });
  }
  return json({ ok: true, known: true, status: status ?? msg.delivery_status ?? null });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (path.endsWith("/resend")) return resend(req);
  return json({ ok: false, error: "not_found" }, 404);
});
