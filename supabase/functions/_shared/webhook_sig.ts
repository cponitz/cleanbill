// Svix signature verification (SPEC-10 §4.3). Resend delivers webhooks through Svix: headers svix-id, svix-timestamp
// (unix seconds) and svix-signature ("v1,<base64> v1,<base64> …" — several during a secret rotation); the signature is
// HMAC-SHA256 over `${id}.${timestamp}.${rawBody}` keyed with the secret's bytes (the `whsec_` prefix stripped, the rest
// base64-decoded). A payload older or newer than TOLERANCE_SECONDS is rejected (replay). Constant-time comparison.
export const TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = { get(name: string): string | null };
export type Verification = { ok: true; id: string; timestamp: number } | { ok: false; error: "missing_headers" | "bad_timestamp" | "stale_timestamp" | "bad_signature" | "bad_secret" };

function secretBytes(secret: string): Uint8Array<ArrayBuffer> | null {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  try {
    const s = atob(raw);
    const u = new Uint8Array(new ArrayBuffer(s.length));
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  } catch { return null; }
}

export function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function signSvix(secret: string, id: string, timestamp: number | string, body: string): Promise<string> {
  const key = secretBytes(secret);
  if (!key) throw new Error("bad secret");
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return `v1,${b64(mac)}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Verifies a Svix-signed request. `now` (unix seconds) is injectable for tests. */
export async function verifySvix(headers: SvixHeaders, body: string, secret: string, now: number = Math.floor(Date.now() / 1000)): Promise<Verification> {
  const id = headers.get("svix-id"), ts = headers.get("svix-timestamp"), sig = headers.get("svix-signature");
  if (!id || !ts || !sig) return { ok: false, error: "missing_headers" };
  if (!/^\d+$/.test(ts)) return { ok: false, error: "bad_timestamp" };
  const timestamp = Number(ts);
  if (Math.abs(now - timestamp) > TOLERANCE_SECONDS) return { ok: false, error: "stale_timestamp" };
  if (!secretBytes(secret)) return { ok: false, error: "bad_secret" };
  const expected = await signSvix(secret, id, ts, body);
  const offered = sig.split(/\s+/).filter((s) => s.startsWith("v1,"));
  return offered.some((s) => constantTimeEqual(s, expected)) ? { ok: true, id, timestamp } : { ok: false, error: "bad_signature" };
}
