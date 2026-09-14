-- Applied to the hosted project on 2026-09-07 (recovered from supabase_migrations.schema_migrations on 2026-09-13; SPEC-04).
-- Public bucket for static site files (claim page shell, ops shell). Superseded by GitHub Pages (ADR 0005) but still live.
-- Anon may read; a temporary anon-insert policy was used for the initial upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 5242880, array['text/html','text/css','application/javascript','image/png','image/svg+xml','application/pdf'])
on conflict (id) do nothing;
drop policy if exists "site_anon_insert_tmp" on storage.objects;
create policy "site_anon_insert_tmp" on storage.objects for insert to anon with check (bucket_id = 'site');
drop policy if exists "site_anon_update_tmp" on storage.objects;
create policy "site_anon_update_tmp" on storage.objects for update to anon using (bucket_id = 'site') with check (bucket_id = 'site');
drop policy if exists "site_public_read" on storage.objects;
create policy "site_public_read" on storage.objects for select to anon, authenticated using (bucket_id = 'site');
