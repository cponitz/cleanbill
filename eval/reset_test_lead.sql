-- Reset the synthetic lead TRD-TEST-0001 so the claim page is open again (run in the Supabase SQL editor / MCP).
with l as (select id from leads where claim_code = 'TRD-TEST-0001'),
     c as (select id from customers where lead_id in (select id from l)),
     f as (select id from filings where customer_id in (select id from c))
, d1 as (delete from refunds   where filing_id  in (select id from f))
, d2 as (delete from messages  where customer_id in (select id from c))
, d3 as (delete from filings   where customer_id in (select id from c))
, d4 as (delete from documents where customer_id in (select id from c))
, d5 as (delete from customers where lead_id in (select id from l))
update leads set status = 'new', opened_at = null where claim_code = 'TRD-TEST-0001';
update properties set situs_num='3675', situs_street='DUVAL ST', situs_zip='78721', situs_full='3675 DUVAL ST, AUSTIN, TX 78721' where prop_id = 999000001;
