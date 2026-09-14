# ADR 0012: customer front end nextjs on vercel

- **Date:** 2026-09-12
- **Status:** Accepted
- **Handbook ID:** T-12

## Decision

The customer front-end is a Next.js app on Vercel at texasrefunddesk.com (landing, claim flow, status, agreement; ops later behind auth). GitHub Pages is retired after cut-over. The Supabase JSON APIs are unchanged.

## Rationale

Charlie's call (handbook T-12): a front-end that beats Ownwell's. Vercel over Netlify because Next.js is Vercel's own framework (zero-config, preview deploys per PR); otherwise equal. $0 on Hobby for the test.

## Revisit when

See SPEC-04b.
