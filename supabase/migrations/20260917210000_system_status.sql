-- SPEC-09 D1 (admin dashboard): system health for /ops, and the funnel aggregated in SQL.
--
-- system_status: one row per subsystem, written at the end of each GitHub Actions run (deploy.yml, agent.yml, etl.yml)
-- through the ops function (`POST /ops {action: system_status, key, value}` with the ops password), read by `GET /ops`
-- as `system[]`. Keys: deploy, agent_run, etl. Service role only, like every other table.
create table system_status (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table system_status enable row level security;

-- Funnel counts. PostgREST has no group-by, and the function must not pull every events row (SPEC-09: "events
-- aggregated in SQL, not in the function"). Both are plain SQL functions the service role calls via rpc().
create or replace function ops_events_by_kind(since timestamptz default '-infinity')
returns table (kind text, n bigint)
language sql stable as $$
  select kind, count(*)::bigint as n from events where at >= since group by kind order by kind;
$$;

create or replace function ops_events_by_day(since timestamptz)
returns table (day date, kind text, n bigint)
language sql stable as $$
  select (at at time zone 'America/Chicago')::date as day, kind, count(*)::bigint as n
  from events where at >= since group by 1, 2 order by 1, 2;
$$;

-- The ops password gate now counts failed keys per IP (20 / hour → 429) as events of kind `ops_auth_fail`
-- (detail: {ip}); events.kind has no check constraint, so no schema change is needed for the new kind.
