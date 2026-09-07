-- Texas Refund Desk — initial schema
-- Glossary: TCAD = Travis Central Appraisal District; HS = homestead exemption; OV65 = over-65 exemption;
-- DL = driver's license; RLS = row-level security; packet = the filled, signed Form 50-114 PDF.

create extension if not exists pgcrypto;

create type lead_status as enum
  ('new','mailed','opened','claimed','filed','approved','refunded','closed','suppressed');
create type claim_status as enum
  ('submitted','processing','ready_to_submit','needs_dl_update','needs_review',
   'filed','approved','denied','refunded','paid','withdrawn');

-- One row per TCAD account (single-family residential subset is what we load).
create table properties (
  prop_id            bigint primary key,
  tax_year           int not null,
  owner_name         text,
  owner_addr1        text,
  owner_addr2        text,
  owner_city         text,
  owner_state        text,
  owner_zip          text,
  situs_num          text,
  situs_street       text,
  situs_unit         text,
  situs_city         text,
  situs_zip          text,
  situs_full         text,
  legal_desc         text,
  state_cd           text,
  prop_type          text,
  market_value       numeric,
  appraised_value    numeric,
  assessed_value     numeric,
  deed_date          date,
  hs_exempt          boolean,
  ov65_exempt        boolean,
  dp_exempt          boolean,
  dv_exempt          boolean,
  address_suppressed boolean default false,
  raw                jsonb,
  loaded_at          timestamptz default now()
);
create index on properties (hs_exempt, state_cd);

-- A lead is a property we believe is owed a refund. claim_code is the unguessable key printed on the letter.
create table leads (
  id                  uuid primary key default gen_random_uuid(),
  prop_id             bigint not null references properties(prop_id),
  claim_code          text not null unique,
  tier                smallint,               -- 1 = owned ≥ 2 yrs (full refund), 2 = 1–2 yrs, 3 = other
  score               numeric,
  refund_years        int[],
  est_refund_total    numeric,
  est_refund_by_year  jsonb,
  est_forward_annual  numeric,
  estimate_unconfirmed boolean default false,
  status              lead_status not null default 'new',
  letter_variant      text,
  mailed_at           timestamptz,
  opened_at           timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create index on leads (status);
create index on leads (prop_id);

-- A customer is a lead who claimed: identity, consent, signature, payment method, workflow status.
create table customers (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid not null references leads(id),
  full_name            text,
  email                text,
  phone                text,
  occupied_since       date,
  owns_other_homestead boolean default false,
  agreement_version    text,
  agreement_signed_at  timestamptz,
  signature_name       text,
  signature_ip         inet,
  signature_ua         text,
  stripe_customer_id   text,
  card_on_file         boolean default false,
  status               claim_status not null default 'submitted',
  status_reason        text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);
create index on customers (lead_id);
create index on customers (status);

-- Uploaded files (DL images) and what Claude extracted from them. DL numbers are confidential (Tax Code §11.48):
-- images live in the private `ids` bucket and are purged after filing (see retention job).
create table documents (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references customers(id),
  kind                text not null check (kind in ('dl_front','dl_back','other')),
  storage_path        text not null,
  mime                text,
  bytes               int,
  extracted           jsonb,
  extraction_model    text,
  extraction_cost_usd numeric,
  validation          jsonb,
  purged_at           timestamptz,
  created_at          timestamptz default now()
);
create index on documents (customer_id);

-- The filled, signed Form 50-114 packet and its life at TCAD.
create table filings (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers(id),
  form_version   text,
  tax_years      int[],
  packet_path    text,
  packet_sha256  text,
  generated_at   timestamptz default now(),
  submitted_at   timestamptz,
  channel        text check (channel in ('portal','email','mail')),
  tcad_status    text,
  tcad_checked_at timestamptz,
  approved_at    timestamptz,
  denied_at      timestamptz,
  denial_reason  text
);
create index on filings (customer_id);

-- Refunds observed per taxing unit and tax year, and our 25% fee against each.
create table refunds (
  id                uuid primary key default gen_random_uuid(),
  filing_id         uuid not null references filings(id),
  taxing_unit       text,
  tax_year          int,
  amount            numeric,
  observed_at       timestamptz,
  source            text,
  fee_amount        numeric,
  invoiced_at       timestamptz,
  paid_at           timestamptz,
  stripe_payment_id text
);

-- Every message in or out. The agent writes drafts (agent_draft = true); a human approves before send.
create table messages (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid references customers(id),
  direction    text not null check (direction in ('inbound','outbound')),
  channel      text not null check (channel in ('email','sms','letter','portal','note')),
  subject      text,
  body         text,
  intent       text,
  agent_draft  boolean default true,
  approved_by  text,
  approved_at  timestamptz,
  sent_at      timestamptz,
  created_at   timestamptz default now()
);
create index on messages (customer_id);

-- Page views, QR scans, and other funnel events keyed by claim code.
create table events (
  id         bigserial primary key,
  at         timestamptz default now(),
  claim_code text,
  kind       text not null,
  detail     jsonb
);
create index on events (claim_code);

create table audit_log (
  id        bigserial primary key,
  at        timestamptz default now(),
  actor     text,
  action    text not null,
  entity    text,
  entity_id text,
  detail    jsonb
);

-- updated_at maintenance
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger leads_updated_at before update on leads for each row execute function set_updated_at();
create trigger customers_updated_at before update on customers for each row execute function set_updated_at();

-- RLS: everything locked to the service role (edge functions + batch jobs). No anon/authenticated policies.
alter table properties enable row level security;
alter table leads enable row level security;
alter table customers enable row level security;
alter table documents enable row level security;
alter table filings enable row level security;
alter table refunds enable row level security;
alter table messages enable row level security;
alter table events enable row level security;
alter table audit_log enable row level security;

-- Private storage buckets: DL images and filled packets.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ids', 'ids', false, 15728640, array['image/jpeg','image/png','image/heic','image/webp','application/pdf'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('packets', 'packets', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;
