-- Applied to the hosted project on 2026-09-07 (recovered from supabase_migrations.schema_migrations on 2026-09-13 so the
-- repo's migration history matches the live one; SPEC-04). The function was later dropped by hand after the initial load;
-- that drop is declared in 20260913_data_model_v2.
-- Bulk loader callable through PostgREST with the anon key, gated by the ops secret. Used once for the initial lead load
-- from a runtime that has the anon key but not the service-role key. Idempotent on prop_id / claim_code.
create or replace function bulk_load_leads(secret text, props jsonb, leads_in jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_props int; n_leads int;
begin
  if secret is distinct from (select value from app_settings where key = 'OPS_PASSWORD') then
    raise exception 'forbidden';
  end if;
  insert into properties (prop_id, tax_year, owner_name, owner_addr1, owner_addr2, owner_city, owner_state, owner_zip,
                          situs_num, situs_street, situs_unit, situs_city, situs_zip, situs_full, state_cd, prop_type,
                          market_value, appraised_value, deed_date, hs_exempt)
  select (p->>'prop_id')::bigint, coalesce((p->>'tax_year')::int, 2026), p->>'owner_name', p->>'owner_addr1', p->>'owner_addr2',
         p->>'owner_city', p->>'owner_state', p->>'owner_zip', p->>'situs_num', p->>'situs_street', p->>'situs_unit',
         p->>'situs_city', p->>'situs_zip', p->>'situs_full', p->>'state_cd', p->>'prop_type',
         (p->>'market_value')::numeric, (p->>'appraised_value')::numeric, (p->>'deed_date')::date, false
  from jsonb_array_elements(props) p
  on conflict (prop_id) do nothing;
  get diagnostics n_props = row_count;
  insert into leads (prop_id, claim_code, tier, refund_years, est_refund_total, est_refund_by_year, est_forward_annual, estimate_unconfirmed, status)
  select (l->>'prop_id')::bigint, l->>'claim_code', (l->>'tier')::smallint,
         (select array_agg(x::int) from jsonb_array_elements_text(l->'refund_years') x),
         (l->>'est_refund_total')::numeric, l->'est_refund_by_year', (l->>'est_forward_annual')::numeric,
         coalesce((l->>'estimate_unconfirmed')::boolean, false), 'new'
  from jsonb_array_elements(leads_in) l
  where not exists (select 1 from leads x where x.prop_id = (l->>'prop_id')::bigint)
  on conflict (claim_code) do nothing;
  get diagnostics n_leads = row_count;
  return jsonb_build_object('properties', n_props, 'leads', n_leads);
end $$;
revoke all on function bulk_load_leads(text, jsonb, jsonb) from public;
grant execute on function bulk_load_leads(text, jsonb, jsonb) to anon, service_role;
