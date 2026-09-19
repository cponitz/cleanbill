-- SPEC-11 (letter batch and Lob send; ADR 0023): one row per letter Lob was asked to print, plus the two SQL
-- functions /ops reads. Written by cleanbill/letters/batch.py (the Mac) after Lob's 200 — never before — and moved by the
-- webhooks function (POST /webhooks/lob, Lob-Signature verified). leads.status='mailed', mailed_at and letter_variant are
-- denormalised onto the lead by the batch for the funnel and the claim page; this table is the record.
-- address_rejected rows (Lob's verification said undeliverable) keep the verdict and never get a lob_id; to_override
-- rows are the proof letters mailed to Charlie (the leads used for their content are not marked mailed).
-- events.kind gains `mail_returned` (no constraint to change). Service role only, like every other table.
create table mail_pieces (
  id                     uuid primary key default gen_random_uuid(),
  lead_id                uuid references leads(id),
  claim_code             text,
  batch                  text not null,
  variant                text check (variant in ('A','B')),
  lob_id                 text unique,
  status                 text not null check (status in ('address_rejected','created','rendered','mailed','in_transit','in_local_area',
                                                         'processed_for_delivery','re_routed','returned_to_sender','deleted')),
  to_override            boolean not null default false,
  to_address             jsonb,
  address_verification   jsonb,
  pdf_sha256             text,
  expected_delivery_date date,
  delivered_at           timestamptz,
  events                 jsonb not null default '[]'::jsonb,
  last_event_at          timestamptz,
  created_at             timestamptz not null default now()
);
create index on mail_pieces (lead_id);
create index on mail_pieces (batch);
alter table mail_pieces enable row level security;

-- The /ops tiles: mailed (a letter Lob accepted, not a rejected address, not a proof, not deleted), delivered
-- (processed_for_delivery seen), returned (returned_to_sender). PostgREST has no group-by, so both are SQL functions.
create or replace function ops_mail_kpis()
returns table (mailed bigint, delivered bigint, returned bigint, rejected bigint)
language sql stable as $$
  select count(*) filter (where status not in ('address_rejected','deleted') and not to_override)::bigint as mailed,
         count(*) filter (where delivered_at is not null and not to_override)::bigint as delivered,
         count(*) filter (where status = 'returned_to_sender' and not to_override)::bigint as returned,
         count(*) filter (where status = 'address_rejected')::bigint as rejected
  from mail_pieces;
$$;

create or replace function ops_mail_by_batch()
returns table (batch text, n bigint, sent_at timestamptz, delivered bigint, returned bigint, rejected bigint, proof boolean)
language sql stable as $$
  select batch,
         count(*) filter (where status not in ('address_rejected','deleted'))::bigint as n,
         min(created_at) as sent_at,
         count(*) filter (where delivered_at is not null)::bigint as delivered,
         count(*) filter (where status = 'returned_to_sender')::bigint as returned,
         count(*) filter (where status = 'address_rejected')::bigint as rejected,
         bool_or(to_override) as proof
  from mail_pieces group by batch order by min(created_at) desc;
$$;
