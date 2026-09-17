-- SPEC-08 A2 (B-19): claim codes move from TRD-XXXX-XXXX to CB-XXXX-XXXX. The random 8-character body is preserved, so
-- the walkthrough code TRD-TEST-0001 becomes CB-TEST-0001. claims, filings, documents and messages reference lead_id, not
-- the code; events.claim_code is the one other column that stores it (funnel telemetry) and is rewritten the same way.
-- Nothing had been printed or mailed, so there is no grace period: the API rejects TRD- codes after this migration.
update leads  set claim_code = 'CB-' || substr(claim_code, 5) where claim_code like 'TRD-%';
update events set claim_code = 'CB-' || substr(claim_code, 5) where claim_code like 'TRD-%';

do $$
begin
  if exists (select 1 from leads  where claim_code like 'TRD-%') then raise exception 'leads still carry TRD- claim codes'; end if;
  if exists (select 1 from events where claim_code like 'TRD-%') then raise exception 'events still carry TRD- claim codes'; end if;
end $$;
