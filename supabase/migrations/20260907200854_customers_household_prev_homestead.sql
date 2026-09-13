-- Applied to the hosted project on 2026-09-07 (recovered from supabase_migrations.schema_migrations on 2026-09-13; SPEC-04 §1:
-- the four columns the claim API writes that had no migration file).
alter table customers
  add column if not exists household text check (household in ('single','married','other')) default 'single',
  add column if not exists prev_homestead boolean default false,
  add column if not exists prev_homestead_address text;
alter table properties add column if not exists legal_desc text;
