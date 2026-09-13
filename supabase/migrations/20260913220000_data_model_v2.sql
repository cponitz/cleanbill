-- SPEC-04 Part A — data model v2 (handbook §4; ADR 0013, ADR 0015).
--   * the prototype's `customers` table was the engagement; it becomes `claims`, and every customer_id FK becomes claim_id
--   * a new `customers` table is the person/account, matched by e-mail (case-insensitive), backfilled one per e-mail
--   * claims gain customer_id, service_type, structured `findings`; the card fields move to the account
--   * SPEC-05's tables/columns land now so nothing is migrated twice: record_checks, refunds v2 columns, property_values
-- Applied by the deploy workflow from main (supabase db push); never by hand.

-- The bulk loader was dropped by hand after the initial lead load (2026-09-07); declare it so migrations == live schema.
drop function if exists bulk_load_leads(text, jsonb, jsonb);

create extension if not exists citext;

-- 1. engagement: customers -> claims (keep every row; rename the auto-named constraints/indexes/trigger to match)
alter table customers rename to claims;
alter table claims rename constraint customers_pkey to claims_pkey;
alter table claims rename constraint customers_lead_id_fkey to claims_lead_id_fkey;
alter table claims rename constraint customers_household_check to claims_household_check;
alter index customers_lead_id_idx rename to claims_lead_id_idx;
alter index customers_status_idx rename to claims_status_idx;
alter trigger customers_updated_at on claims rename to claims_updated_at;

-- 2. foreign keys: customer_id -> claim_id
alter table documents rename column customer_id to claim_id;
alter table documents rename constraint documents_customer_id_fkey to documents_claim_id_fkey;
alter index documents_customer_id_idx rename to documents_claim_id_idx;
alter table filings rename column customer_id to claim_id;
alter table filings rename constraint filings_customer_id_fkey to filings_claim_id_fkey;
alter index filings_customer_id_idx rename to filings_claim_id_idx;
alter table messages rename column customer_id to claim_id;
alter table messages rename constraint messages_customer_id_fkey to messages_claim_id_fkey;
alter index messages_customer_id_idx rename to messages_claim_id_idx;
update audit_log set entity = 'claims' where entity = 'customers';

-- 3. account: the person. No password, no signup; created from the first signed claim, matched by e-mail.
create table customers (
  id                    uuid primary key default gen_random_uuid(),
  email                 citext unique,                 -- case-insensitive matching key (null only for legacy rows without one)
  full_name             text,                          -- latest values as typed; the claim keeps its own signed copy
  phone                 text,
  stripe_customer_id    text,                          -- SPEC-03: lives on the account so a later claim reuses the card
  card_on_file          boolean not null default false,
  created_from_claim_id uuid references claims(id),
  auth_user_id          uuid,                          -- Supabase Auth user once a portal exists (SPEC-04b, later)
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
create trigger customers_updated_at before update on customers for each row execute function set_updated_at();
alter table customers enable row level security;

-- 4. backfill one account per e-mail (earliest claim wins the name/phone), then link every claim
insert into customers (email, full_name, phone, stripe_customer_id, card_on_file, created_from_claim_id, created_at)
select distinct on (lower(email)) email, full_name, phone, stripe_customer_id, coalesce(card_on_file, false), id, created_at
from claims where email is not null
order by lower(email), created_at;
insert into customers (email, full_name, phone, stripe_customer_id, card_on_file, created_from_claim_id, created_at)
select null, full_name, phone, stripe_customer_id, coalesce(card_on_file, false), id, created_at
from claims where email is null;

alter table claims add column customer_id uuid references customers(id);
update claims c set customer_id = a.id from customers a where c.email is not null and a.email = c.email::citext;
update claims c set customer_id = a.id from customers a where c.email is null and a.created_from_claim_id = c.id;
alter table claims alter column customer_id set not null;
create index claims_customer_id_idx on claims (customer_id);

alter table claims
  drop column stripe_customer_id,
  drop column card_on_file,
  add column service_type text not null default 'homestead_refund',
  add column findings jsonb not null default '[]'::jsonb;   -- [{code, severity, field, message, detail}] (ADR 0013)
-- status_reason stays as a generated display string for now (dropped in a later migration).

-- 5. SPEC-05 schema, created now (no writer until SPEC-05 ships)
create table property_values (
  prop_id         bigint not null references properties(prop_id),
  tax_year        int    not null,
  market_value    numeric,
  appraised_value numeric,
  hs_exempt       boolean,
  owner_name      text,
  deed_date       date,
  loaded_at       timestamptz default now(),
  primary key (prop_id, tax_year)
);
alter table property_values enable row level security;

create table record_checks (
  id            bigserial primary key,
  filing_id     uuid not null references filings(id),
  source        text not null check (source in ('roll_supplement','tcad_portal','tax_office','customer')),
  checked_at    timestamptz default now(),
  observed      jsonb,
  changed       boolean not null default false,
  evidence_path text                                   -- screenshot/extract in the private evidence bucket (SPEC-05)
);
create index record_checks_filing_id_idx on record_checks (filing_id);
alter table record_checks enable row level security;

alter table refunds
  add column evidence_path   text,
  add column record_check_id bigint references record_checks(id),
  add column notice_sent_at  timestamptz,
  add column dispute_status  text not null default 'none' check (dispute_status in ('none','open','resolved')),
  add column charged_at      timestamptz;
