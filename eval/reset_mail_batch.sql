-- Reset a TEST-MODE mail batch (SPEC-11 acceptance 3): delete its mail_pieces rows and put the leads it marked back to
-- `new`. Run in the Supabase SQL editor / MCP with the batch name substituted. Never run this on a live batch — those
-- letters were printed; the rows are the record.
--   \set batch 'test-2026-09-25'
with b as (select id, lead_id from mail_pieces where batch = :'batch' and not to_override)
, l as (update leads set status = 'new', mailed_at = null, letter_variant = null
        where id in (select lead_id from b) and status = 'mailed' returning id)
, e as (delete from events where kind = 'mail_returned' and detail->>'batch' = :'batch')
delete from mail_pieces where batch = :'batch';
