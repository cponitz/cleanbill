# SPEC-03 — Card on file at signature (Stripe)

*Status: approved pending O-04 placement (recommend after inline validation succeeds) · Priority P0 · Phase 1 · Owner: Claude Code; Charlie supplies Stripe keys · Handbook refs: B-05, B-13, G-4, §4.1 customers*

## Problem
Fees are collected 2–5 months after signature; without a stored payment method leakage is modelled at 30–40%.

## Behaviour
1. After the inline validation shows "your license matches" (SPEC-06) — or, until SPEC-06 ships, after the three consents and typed signature — the page mounts Stripe Elements (Payment Element) for a **SetupIntent** (no charge). Copy: "Save a card for the 25% fee. Nothing is charged until we see your refund arrive, and we'll email you 3 business days before."
2. On success the POST includes the SetupIntent id; the API confirms it server-side, creates or reuses the Stripe Customer (`customers.stripe_customer_id` on the account, not the claim), attaches the payment method, sets `customers.card_on_file = true`, logs event `card_saved`.
3. "Skip for now" is allowed during the test (event `card_skipped`, claim proceeds); the agent's follow-up asks for the card before filing. Measure the skip rate; O-04 decides whether to keep it.
4. Feature flag `STRIPE_ENABLED` (function env + `config`), default off; when off the step is hidden and `card_on_file` stays false.
5. Test mode until the entity's Stripe account is activated; keys in function env (`STRIPE_SECRET_KEY`) and the front-end config (`STRIPE_PUBLISHABLE_KEY`).
6. The service agreement text states: card saved now; charged 25% of the refund actually received, only after receipt, with notice; fee cap 1.1 × estimate.

## Data changes
`customers.stripe_customer_id`, `customers.card_on_file` (exist; move to the account table in SPEC-04). `events.kind` += `card_saved`, `card_skipped`. No card data touches our database (Stripe holds it).

## Acceptance
- Stripe test card 4242… completes the flow; `card_on_file = true`; the Stripe dashboard shows the customer and payment method.
- Smoke test passes with the flag on and off.
- A second claim by the same email reuses the Stripe customer.
- No PAN, expiry or CVC appears in logs, database or audit rows (grep test).

## Out of scope
Charging (SPEC-05), refunds of fees, Apple/Google Pay (Payment Element gives them for free — fine if they appear).
