-- Run after every migration in supabase/migrations has been applied to the scratch database (ci.yml).
-- Fails loudly if the v2 data model is not what the code expects.
do $$
declare missing text[];
begin
  select array_agg(x) into missing from unnest(array[
    'claims.customer_id', 'claims.findings', 'claims.service_type', 'customers.email', 'customers.card_on_file',
    'documents.claim_id', 'filings.claim_id', 'messages.claim_id', 'property_entities.entity_cd',
    'property_values.tax_year', 'record_checks.source', 'refunds.dispute_status', 'refunds.record_check_id'
  ]) x
  where not exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = split_part(x, '.', 1) and c.column_name = split_part(x, '.', 2));
  if missing is not null then raise exception 'schema check failed, missing: %', missing; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and column_name='customer_id' and table_name in ('documents','filings','messages')) then
    raise exception 'customer_id still present on a child table';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='bulk_load_leads') then
    raise exception 'bulk_load_leads should be dropped';
  end if;
  raise notice 'schema check passed';
end $$;
