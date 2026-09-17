// Shared helpers for edge functions: service-role Supabase client, tiny HTML escaping, money formatting.
import { createClient } from "npm:@supabase/supabase-js@2";

export function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Round DOWN to the nearest $100 and format — never overstate a refund to a homeowner. */
export function moneyFloor(n: number | string | null | undefined, step = 100): string {
  const v = Math.floor(Number(n ?? 0) / step) * step;
  return "$" + v.toLocaleString("en-US");
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for") ?? "";
  return xf.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "0.0.0.0";
}

export function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export const BRAND = Deno.env.get("BRAND_NAME") ?? "Clean Bill";
export const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL") ?? "hello@cleanbillco.com";
