# docs/

| File / folder | What it is | Source of truth |
|---|---|---|
| `ARCHITECTURE.md` | Module reference, data model v2, process flows, glossary — the technical half of the handbook | This repo; update in the same PR as any structural change |
| `RUNBOOK.md` | Operating the prototype: URLs, daily loop, commands, statuses, troubleshooting | This repo |
| `DESIGN-SYSTEM.md` | The Clean Bill design system: principles, tokens, themes, components, accessibility / print / e-mail rules, the contrast table | This repo (SPEC-08 Part C); rendered live at `/design-system` |
| `specs/SPEC-01…10.md` | Feature handoffs from the Cowork project (copied here when work starts) | Cowork project `claude/specs/` until copied; then this repo |
| `brand/brand-brief.md` | The Clean Bill brand and copy brief (voice, palette proposal, motif) — input to SPEC-08 Part C | Cowork project `claude/`; copied here by SPEC-08 |
| `plans/` | Development plans as handed to Claude Code (`phase1-v3.2.md`) | Cowork project; copied here when work starts |
| `adr/` | Architecture decision records (T-nn) | This repo |
| `figures/*.svg` | The handbook's diagrams (architecture, ER, state machines, claim sequence, validation, agent loop, post-filing, timeline) | Regenerated from the handbook; editable here |
| `*.html`, `config.js` | The static prototype pages served by GitHub Pages until the Vercel front-end (SPEC-04b) cuts over; `ops.html` is a pointer to `/ops` since SPEC-09 D3 | This repo |

The full handbook (business + technical, with the review dispositions) and Charlie's setup checklist live outside the repo in `../artifacts/` and in the Cowork project (`claude/handbook-v2.md`).
