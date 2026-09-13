-- Minimal stand-in for what a hosted Supabase project provides before our migrations run, so the migration chain can be
-- applied to a plain Postgres in CI (.github/workflows/ci.yml) without Docker-in-Docker or the full local stack.
-- Only what our migrations touch: the three API roles and the storage schema's buckets/objects tables.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text
);
alter table storage.objects enable row level security;
