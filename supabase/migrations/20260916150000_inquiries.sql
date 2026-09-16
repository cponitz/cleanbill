-- SPEC-07 (website redesign) — inbound inquiries from the public site's address-check and business forms.
-- There is no address→estimate lookup API (a claim code stays the only credential, ADR 0008); the site collects the
-- address / work e-mail and we answer by e-mail (B-04: mail + e-mail only). One row per submitted form.
create table inquiries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('address', 'exemption', 'appeal', 'business')),
  address     text,            -- the property the visitor typed (homeowner forms)
  email       text,            -- where to answer; work e-mail on the business form
  company     text,            -- business form
  properties  int,             -- business form: number of properties
  bills       text[],          -- business form: subset of {property_tax, utilities, insurance, telecom}
  source_path text,            -- the page the form was on (/, /exemptions, /appeals, /businesses)
  ip          inet,
  ua          text,
  handled_at  timestamptz,     -- set by the operator when answered (no writer yet)
  notes       text
);
create index on inquiries (created_at desc);
create index on inquiries (email);
alter table inquiries enable row level security;   -- service role only, like every other table
