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

// ---- Lob (SPEC-11) ---------------------------------------------------------------------------------------------------
import { lobTimestampSeconds, signLob, verifyLob } from "./webhook_sig.ts";

const LOB_SECRET = "a-lob-webhook-secret-from-the-dashboard";
const LOB_BODY = JSON.stringify({ id: "evt_1", reference_id: "ltr_1", event_type: { id: "letter.mailed" }, body: { name: "Mailed", time: "2026-10-06T14:00:00.000Z" } });

Deno.test("a good Lob signature verifies with a seconds or a milliseconds timestamp", async () => {
  const sig = await signLob(LOB_SECRET, NOW, LOB_BODY);
  assertEquals(await verifyLob(h({ "lob-signature-timestamp": String(NOW), "lob-signature": sig }), LOB_BODY, LOB_SECRET, NOW), { ok: true, timestamp: NOW });
  assert(/^[0-9a-f]{64}$/.test(sig));
  const ms = `${NOW}123`;
  const sigMs = await signLob(LOB_SECRET, ms, LOB_BODY);
  assertEquals(await verifyLob(h({ "lob-signature-timestamp": ms, "lob-signature": sigMs.toUpperCase() }), LOB_BODY, LOB_SECRET, NOW), { ok: true, timestamp: NOW });
  assertEquals(lobTimestampSeconds("1791000000000"), 1791000000);
  assertEquals(lobTimestampSeconds("1791000000"), 1791000000);
  assertEquals(lobTimestampSeconds("soon"), null);
});

Deno.test("a forged, tampered, stale or header-less Lob delivery is rejected", async () => {
  const sig = await signLob(LOB_SECRET, NOW, LOB_BODY);
  const headers = h({ "lob-signature-timestamp": String(NOW), "lob-signature": sig });
  assertEquals(await verifyLob(headers, LOB_BODY.replace("mailed", "returned_to_sender"), LOB_SECRET, NOW), { ok: false, error: "bad_signature" });
  assertEquals(await verifyLob(headers, LOB_BODY, "another-secret", NOW), { ok: false, error: "bad_signature" });
  assertEquals(await verifyLob(h({ "lob-signature-timestamp": String(NOW + 1), "lob-signature": sig }), LOB_BODY, LOB_SECRET, NOW), { ok: false, error: "bad_signature" });
  assertEquals(await verifyLob(headers, LOB_BODY, LOB_SECRET, NOW + TOLERANCE_SECONDS + 1), { ok: false, error: "stale_timestamp" });
  assertEquals(await verifyLob(h({ "lob-signature": sig }), LOB_BODY, LOB_SECRET, NOW), { ok: false, error: "missing_headers" });
  assertEquals(await verifyLob(h({ "lob-signature-timestamp": "yesterday", "lob-signature": sig }), LOB_BODY, LOB_SECRET, NOW), { ok: false, error: "bad_timestamp" });
});
