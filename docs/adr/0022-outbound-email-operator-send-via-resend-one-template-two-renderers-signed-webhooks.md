# ADR 0022: outbound e-mail — operator-initiated Resend send from the ops API, one template rendered identically in Python and TypeScript, delivery state by signed webhook, root domain verified with Return-Path on `send.`

- **Date:** 2026-09-18
- **Status:** Accepted
- **Handbook ID:** SPEC-10 (G-5; B-10 shadow mode; B-19 `hello@cleanbillco.com`; O-07, O-08; SPEC-08 Part C item C5; ADR 0016, ADR 0019, ADR 0020)

## Decision

1. **The only thing that e-mails a customer is an operator's click.** `POST /ops {action: "send", message_id}` sends one
   approved (`agent_draft=false`), unsent (`sent_at is null`), outbound e-mail to the claim's account address through
   Resend, and only while the function secret `RESEND_ENABLED` is `"true"` (otherwise 409 `send_disabled` and the console
   hides Send). Drafts cannot be sent — Approve first, two clicks on purpose. The agent keeps no send tool (ADR 0020 §1
   stands); the `send` action is the single Resend call site in the repo, which a grep can prove.
2. **Double sends are impossible by construction, not by UI.** The row is claimed with `update … set sent_at … where
   sent_at is null` and the row count checked (the loser answers `already_sent`), and every request carries
   `Idempotency-Key: msg-<message_id>`, which Resend honours for 24 hours — so two concurrent clicks produce one e-mail
   and one provider id. `provider_message_id` is unique.
3. **One template, two renderers, one parity test.** `cleanbill/email/base.html` stays the template. `python -m
   cleanbill.brand --sync` now also emits `supabase/functions/_shared/email_template.ts` (the template text and the footer
   strings), and `_shared/email.ts` is a line-for-line port of `cleanbill.email.render_email`. The fixture
   `tests/fixtures/email_snapshot.json` (`python -m cleanbill.email --emit-snapshot`) holds inputs and Python's output;
   `tests/test_brand.py` and `_shared/email_test.ts` both assert byte equality, and `--check` modes fail CI when either the
   generated module or the snapshot is stale (the ADR 0016 pattern). The send does no personalisation: the approved body
   is what goes out.
4. **Delivery state arrives by signed webhook, never by polling.** A new edge function `webhooks` (`verify_jwt=false`;
   providers cannot send a Supabase JWT) verifies Resend's Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`;
   HMAC-SHA256 over `id.timestamp.body` with `RESEND_WEBHOOK_SECRET`; five-minute skew) in `_shared/webhook_sig.ts`, then
   moves `messages.delivery_status` (`sent | delivered | delayed | bounced | complained`), appends `{type, at, detail}` to
   `messages.delivery_detail`, writes `events` of kind `email_bounced` / `email_complained` with the claim code, and records
   every accepted event in `system_status.resend_webhook`. Unknown ids answer 200 (Resend retries on non-2xx). A bad
   signature answers 401 and is logged. The endpoint is registered through Resend's API, not the dashboard.
5. **No open or click tracking on customer mail.** Tracking stays off in Resend; `email.opened` / `email.clicked` would be
   appended to the detail but never change the status. Customers are homeowners we solicit under §41.0051; we do not
   watch them read.
6. **Sending domain.** The root `cleanbillco.com` is verified in Resend so the visible sender is exactly
   `Clean Bill <hello@cleanbillco.com>` (B-19), with the Return-Path on Resend's default `send.` subdomain: DKIM and SPF
   for Resend live on `send.`, the root's MX and SPF stay free for the human mailbox (O-07). DMARC starts at `p=none`
   and tightens after the test. `reply_to` is the same `hello@` inbox (O-08); inbound parsing is out of scope.
7. **The packet rides two intents.** For `ready_to_submit` and `filed` the claim's latest `filings.packet_path` is
   downloaded with the service client and attached as `Form-50-114-<code>.pdf`; above 20 MB the send is refused
   (`packet_too_large`) rather than truncated.

## Rationale

Copying every message into a mail client loses `sent_at`, so neither the funnel nor the agent knows what the customer has
seen, and it cannot attach the packet. Putting the send behind the existing password-gated ops action keeps one audit
trail (`message_send` / `message_send_failed`) and one place for guards, and keeps shadow mode literal: the agent drafts,
a person approves, the same person sends. Rendering in Deno was unavoidable (the function is the sender) and rendering
twice is only safe with a parity gate — the findings rule table already proved that pattern. Webhooks rather than polling
because Resend's API rate limits are for sending, and because a bounce is a fact the operator needs on the row, not in a
log. The signature check is small enough to write and test ourselves; a dependency on the Svix SDK would be the only
npm import in the function for 40 lines of HMAC.

## Consequences

- Charlie's part is DNS and an account (SPEC-10 §7): three records from Resend plus DMARC, and a mailbox for `hello@`.
  Until `RESEND_ENABLED=true` is set nothing changes for the operator — Send is hidden and Copy remains.
- The secrets `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `RESEND_ENABLED` live in Supabase function secrets (and the Mac
  `.env` for the smoke); `RESEND_BASE_URL` exists only so a test can point the function at a fake.
- `deploy.yml` deploys five functions; `config.toml` carries `webhooks` with `verify_jwt=false`.
- SPEC-11 (Lob) reuses the `webhooks` function with its own route and signature scheme; SPEC-03 (Stripe) fills
  `features.stripe`.

## Revisit when

Inbound e-mail is parsed (O-08) — the same function would receive `email.received`; a second operator needs per-person
identity on `message_send` (O-05, Supabase Auth); DMARC moves to `p=quarantine` after the test shows only Resend and the
mailbox provider sending.
