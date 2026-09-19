# ADR 0023: mail batch — stratified seeded selection from the published leads, Lob address verification before render, one `mail_pieces` row per piece, denormalised lead status, signed webhooks

- **Date:** 2026-09-18
- **Status:** Accepted
- **Handbook ID:** SPEC-11 (G-7; B-04 mail + e-mail only; B-07 the 1,000-piece kill test; B-18 confirmed units only; B-19 `CB-` codes; O-06, O-12; SPEC-01; SPEC-10 §4.3; ADR 0007, ADR 0010, ADR 0014, ADR 0022)

## Decision

1. **The batch runs on the Mac, from the published `leads` table, never from the roll.** `python -m cleanbill.letters.batch`
   (like `cleanbill.etl.publish`, ADR 0010) reads `leads` joined to `properties` with the service key, applies the guard
   rails, draws the sample, verifies addresses, renders the PDFs, creates the Lob letters and records them. The lead list
   in Supabase is the thing the funnel counts, so it is the thing we mail from; the roll is not needed. Names and addresses
   stay on the Mac (the CSV and PDFs under `data/out/batches/<batch>/`, git-ignored — the ADR 0007 spirit); the summary
   prints counts only, so nothing with a name enters git, CI logs or Supabase Storage.
2. **Guard rails are code, not flags.** Never an `estimate_unconfirmed` lead (B-18), never a lead that is not `new` with
   `mailed_at` null, never `hs_exempt`, never `address_suppressed`, never the synthetic account or a `CB-TEST-` code,
   never an incomplete Texas mailing address, never a `prop_id` in `data/out/exclude.csv`. A live key mails only with
   `LOB_ENABLED=true`, `--send`, `--confirm-footer` equal to `brand.LEGAL_NAME` and a real `brand.RETURN_ADDRESS` (the
   placeholder's zip is `00000`); a test key needs only `--send`, because test letters are free and never printed.
3. **Stratified, seeded, proportional.** The sample is drawn per market-value band (`100–200k`, `200–350k`, `350–500k`,
   `500–750k`, `750k+`) in proportion to the eligible population (largest-remainder rounding, `--cap-per-band` optional),
   shuffled with `--seed` after a sort by claim code, so a dry run and its send pick the same leads whatever order the
   rows arrive in. Variants A/B interleave along the band-ordered sample, so every band's split is within one letter of
   `--variant-split`. The test measures the whole Tier-1 list's response, so the sample must look like the list.
4. **Verify before render; print the verified address.** Every selected lead goes through Lob's `us_verifications`;
   only `deliverable` / `deliverable_unnecessary_unit` are mailed, and the envelope (the recipient block on the page and
   Lob's `to`) uses Lob's standardised components, not the roll's text. A rejected address becomes a `mail_pieces` row
   with `status='address_rejected'` and the verdict, and the lead stays `new` — visible in the summary, never silently
   dropped, never mailed to a bad address at $1 a piece.
5. **One `mail_pieces` row per piece is the record; the lead is denormalised.** The row is inserted only after Lob's 200
   (`lob_id`, `expected_delivery_date`, the PDF's SHA-256, the `to` address, the verification), and then the lead is set
   `mailed` / `mailed_at` / `letter_variant` — nothing is half-written, and re-running the same `--batch` skips leads that
   already have a row (Lob's `Idempotency-Key: <batch>:<claim_code>` makes the API side safe too). `/ops` counts mailed /
   delivered / returned from `mail_pieces` (SQL functions `ops_mail_kpis`, `ops_mail_by_batch`); the lead count stays as a
   cross-check. Proof letters (`--to-override`) get rows with `to_override=true` and never touch a lead.
6. **Delivery arrives by signed webhook, in the same function as Resend's.** `POST /webhooks/lob` verifies
   `Lob-Signature` (hex HMAC-SHA256 of `<Lob-Signature-Timestamp>.<raw body>` with `LOB_WEBHOOK_SECRET`; five-minute
   skew; constant-time compare — `_shared/webhook_sig.ts` next to the Svix verifier), moves `mail_pieces.status` along
   `created → rendered → mailed → in_transit → in_local_area → processed_for_delivery` (never backwards),
   stamps `delivered_at` on `processed_for_delivery`, and on `returned_to_sender` sets `leads.status='suppressed'` and
   writes `events` kind `mail_returned` — a returned letter is never re-mailed. `system_status.lob_webhook` records every
   accepted event. Unknown ids answer 200.
7. **`top_first_page`, one sheet, no Lob templates.** We send finished PDFs (`use_type=marketing`, `color=false`,
   `double_sided=false`, `mail_type=usps_first_class`). The recipient block sits at a fixed position
   (`RECIPIENT_TOP_IN` / `RECIPIENT_LEFT_IN` in `generate.py`, the one place to move it), the §41.0051 disclaimer above it
   untouched. `insert_blank_page` (an extra sheet on every piece) is a CLI option kept only for the case the layout cannot
   be made to fit Lob's window zone — decided by the test-mode render (`--window-check`), not in advance.

## Rationale

The first mailing is the business's kill test (B-07): the draw has to be reproducible and representative or the response
rate means nothing, and every piece has to be accounted for or the funnel's first number is a guess. Verification before
render costs a few dollars per thousand and removes the one failure Lob cannot fix afterwards. Keeping the record in its
own table (rather than on the lead) lets a lead be mailed once now and again in a second-touch spec later without losing
the first piece's history, and lets proof letters exist without polluting the funnel. Denormalising `mailed` onto the
lead keeps the claim page's `new/mailed → opened` arc and the agent's view unchanged. Signing checks are 30 lines next to
the Svix one; the scheme is pinned from Lob's documentation as read for the spec and confirmed by the first test-mode
event, which the sandbox could not reach (`docs/reports/2026-09-18-lob-proof.md`).

## Consequences

- Charlie's part (SPEC-11 §7): the Lob account and keys, the return address and entity name (O-06) in `brand.py`, the
  exclude file, the webhook registration (Lob has no API for it), O-12 by Oct 1. Until `LOB_ENABLED=true` and a live
  key exist, only test-mode batches are possible and nothing is printed.
- Secrets: `LOB_API_KEY`, `LOB_ENABLED` in the Mac `.env`; `LOB_WEBHOOK_SECRET` and `LOB_ENABLED` as function secrets
  (`features.lob` on `/ops`).
- `leads.status='mailed'` now has a writer; the state-machine figure's "skipped" note is retired.
- The address-window check and the physical proof (L2's check, L5) are the two things this ADR cannot settle from the
  sandbox; the report records what was and was not verified.

## Revisit when

A second-touch mailing needs a lead mailed twice (the table already allows it; the selector's `mailed_at is null` rule
would relax per spec); the batch moves to GitHub Actions (the selector needs only the service key, but names would enter
Actions logs); Lob's per-piece cost is read from the API instead of `--unit-cost`.
