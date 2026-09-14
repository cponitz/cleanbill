-- SPEC-06 §3/§4 — typed license entry (ADR 0016). A `documents` row of kind `typed_id` holds what the homeowner typed
-- (pre-check before the photo, or the confirmation after an unreadable/low-confidence extraction). It has no file, so
-- storage_path becomes nullable for that kind only. Tax Code §11.43(j) still requires the photo for filing.
-- Applied by the deploy workflow from main (supabase db push); never by hand.
alter table documents drop constraint documents_kind_check;
alter table documents add constraint documents_kind_check check (kind in ('dl_front','dl_back','other','typed_id'));
alter table documents alter column storage_path drop not null;
alter table documents add constraint documents_storage_path_required check (kind = 'typed_id' or storage_path is not null);
