# ADR 0017: the customer web app is a browser-only client of the claim API

- **Date:** 2026-09-14
- **Status:** Accepted
- **Handbook ID:** SPEC-04b, SPEC-06b, SPEC-02 §1/§6 (T-12 follow-through)

## Decision

`apps/web` (Next.js App Router on Vercel) holds no server-side data access. Every read and write goes from the visitor's
browser to the public `claim` edge function, keyed by the claim code, exactly as the static prototype pages did. The app
reads only `NEXT_PUBLIC_*` environment variables; the route files are thin server components that normalise the code and
render a client component. Consequences that follow:

- **Wording lives in one file** (`src/lib/copy.ts`), transcribed from `copy/*.md` with the source section named; anything
  not yet in the copy files is marked `NEW` and listed in the PR. Validation findings arrive from the API already rendered
  (`customer_message`, `next_action`, ADR 0016), so the page carries no wording for them.
- **The inline result is a poll**, not a push: `GET /claim?c&claim=<id>` every 2 s for at most 30 s, then a hand-off to
  the status page. No websocket, no server component waiting on the backend.
- **HEIC is converted in the browser** (`heic2any`, loaded only when such a file is picked). The API keeps rejecting
  HEIC because the extraction model cannot read it, so conversion has one owner.
- **The customer's answer to a review question** is a new API route, `POST /claim/reply`, that stores an inbound
  `messages` row (`channel = portal`, `intent = reply`) for the operator and the agent — the page never talks to the
  database.
- **The smoke test targets a URL** (`eval/web_smoke.py --base …`) and resets the synthetic lead itself with the
  service-role key from `.env`, so the same script runs against a local production build and a Vercel preview.

## Rationale

Keeping the app secret-free means a compromised Vercel project or a leaked preview URL exposes nothing beyond what a
claim code already grants (ADR 0008), and the security model in `docs/ARCHITECTURE.md` §3.3 stays true: pages call
functions, only functions hold the service-role key. Server components fetching from Supabase would have needed that key
in Vercel — the exact thing the SPEC-04b amendment forbids. Lighthouse confirmed the cost is acceptable (94 performance,
96 accessibility on the claim page, mobile, production build).

## Revisit when

A customer portal with login (Supabase Auth, `customers.auth_user_id`) arrives, or the ops dashboard moves into this app
behind auth — both would justify server-side data access with a per-user session rather than the service-role key.
