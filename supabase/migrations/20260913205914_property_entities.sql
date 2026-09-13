-- SPEC-01: one row per property × taxing unit, from TCAD's PROP_ENT file (APPRAISAL_ENTITY_INFO in the PACS export).
-- Populated by trd/etl/publish.py for published leads only (~16.8K properties × ~6 units). entity_cd is TCAD's own code
-- (e.g. 01 = Austin ISD, 02 = City of Austin, 03 = Travis County, 68 = ACC, 2J = Central Health); the same codes key
-- trd/estimator/rates/units.json. Applied to the hosted project 2026-09-13 (version 20260913205914).
create table if not exists property_entities (
  prop_id        bigint  not null references properties(prop_id),
  entity_cd      text    not null,
  entity_name    text,
  entity_type    text,                -- isd | city | county | college | hospital | esd | mud | wcid | road | limited | pid | tirz | other
  taxable_value  numeric,             -- the unit's own taxable value for the roll year (units differ because exemptions differ)
  assessed_value numeric,
  partial        boolean default false,  -- PROP_ENT partial_entity flag: only part of the property is inside the unit
  loaded_at      timestamptz default now(),
  primary key (prop_id, entity_cd)
);
create index if not exists property_entities_entity_cd_idx on property_entities (entity_cd);
alter table property_entities enable row level security;   -- service role only, like every other table
