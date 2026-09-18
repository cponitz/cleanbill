import { assert, assertEquals } from "jsr:@std/assert@1";
import { signSvix, TOLERANCE_SECONDS, verifySvix } from "./webhook_sig.ts";

const SECRET = "whsec_" + btoa("a-test-signing-secret-of-32-bytes!");   // the shape Resend / Svix hands out
const BODY = JSON.stringify({ type: "email.delivered", created_at: "2026-10-08T15:00:00.000Z", data: { email_id: "4ef9a417-02e9-4d39-ad75-9611e0fcc33c" } });
const NOW = 1_791_000_000;
const h = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });

Deno.test("a good Svix signature verifies (and so does one of several during a rotation)", async () => {
  const sig = await signSvix(SECRET, "msg_1", NOW, BODY);
  assertEquals(await verifySvix(h({ "svix-id": "msg_1", "svix-timestamp": String(NOW), "svix-signature": sig }), BODY, SECRET, NOW), { ok: true, id: "msg_1", timestamp: NOW });
  const rotated = `v1,${btoa("old-secret-signature-that-does-not-match")} ${sig}`;
  assert((await verifySvix(h({ "svix-id": "msg_1", "svix-timestamp": String(NOW), "svix-signature": rotated }), BODY, SECRET, NOW)).ok);
});

Deno.test("a bad signature, a tampered body, another id or a wrong secret are rejected", async () => {
  const sig = await signSvix(SECRET, "msg_1", NOW, BODY);
  const headers = h({ "svix-id": "msg_1", "svix-timestamp": String(NOW), "svix-signature": sig });
  assertEquals(await verifySvix(headers, BODY.replace("delivered", "bounced"), SECRET, NOW), { ok: false, error: "bad_signature" });
  assertEquals(await verifySvix(h({ "svix-id": "msg_2", "svix-timestamp": String(NOW), "svix-signature": sig }), BODY, SECRET, NOW), { ok: false, error: "bad_signature" });
  assertEquals(await verifySvix(headers, BODY, "whsec_" + btoa("another-secret-entirely-not-this-one"), NOW), { ok: false, error: "bad_signature" });
  assertEquals(await verifySvix(h({ "svix-id": "msg_1", "svix-timestamp": String(NOW), "svix-signature": "v1,not-base64-at-all" }), BODY, SECRET, NOW), { ok: false, error: "bad_signature" });
  assertEquals(await verifySvix(h({ "svix-id": "msg_1", "svix-timestamp": String(NOW) }), BODY, SECRET, NOW), { ok: false, error: "missing_headers" });
  assertEquals(await verifySvix(headers, BODY, "whsec_%%%", NOW), { ok: false, error: "bad_secret" });
});

Deno.test("a stale or future timestamp beyond five minutes is rejected; inside the window it passes", async () => {
  const sig = await signSvix(SECRET, "msg_1", NOW, BODY);
  const headers = h({ "svix-id": "msg_1", "svix-timestamp": String(NOW), "svix-signature": sig });
  assertEquals(await verifySvix(headers, BODY, SECRET, NOW + TOLERANCE_SECONDS + 1), { ok: false, error: "stale_timestamp" });
  assertEquals(await verifySvix(headers, BODY, SECRET, NOW - TOLERANCE_SECONDS - 1), { ok: false, error: "stale_timestamp" });
  assert((await verifySvix(headers, BODY, SECRET, NOW + TOLERANCE_SECONDS)).ok);
  assertEquals(await verifySvix(h({ "svix-id": "msg_1", "svix-timestamp": "yesterday", "svix-signature": sig }), BODY, SECRET, NOW), { ok: false, error: "bad_timestamp" });
});
