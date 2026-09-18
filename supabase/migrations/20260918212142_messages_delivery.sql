-- SPEC-10 (outbound e-mail from /ops via Resend; ADR 0022): delivery state on messages.
--
-- The ops function's `send` action sets sent_at, provider and provider_message_id after a 2xx from Resend; the webhooks
-- function (POST /webhooks/resend, Svix-signed) moves delivery_status and appends {type, at, detail} to delivery_detail
-- as events arrive. provider_message_id is unique: it is the webhook's lookup key and the second half of the double-send
-- guard (the update `… where sent_at is null` is the first). events.kind gains email_bounced / email_complained (no
-- constraint to change). Service role only, like every other table.
alter table messages
  add column provider            text check (provider in ('resend')),
  add column provider_message_id text unique,
  add column delivery_status     text check (delivery_status in ('sent','delivered','delayed','bounced','complained')),
  add column delivery_detail     jsonb not null default '[]'::jsonb;
create index messages_provider_message_id_idx on messages (provider_message_id);
