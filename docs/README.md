# docs/

| File / folder | What it is | Source of truth |
|---|---|---|
| `ARCHITECTURE.md` | Module reference, data model v2, process flows, glossary — the technical half of the handbook | This repo; update in the same PR as any structural change |
| `RUNBOOK.md` | Operating the prototype: URLs, daily loop, commands, statuses, troubleshooting | This repo |
| `specs/SPEC-01…06.md` | Feature handoffs from the Cowork project (copied here when work starts) | Cowork project `claude/specs/` until copied; then this repo |
| `adr/` | Architecture decision records (T-nn) | This repo |
| `figures/*.svg` | The handbook's diagrams (architecture, ER, state machines, claim sequence, validation, agent loop, post-filing, timeline) | Regenerated from the handbook; editable here |
| `*.html`, `config.js` | The static prototype pages served by GitHub Pages until the Vercel front-end (SPEC-04b) cuts over | This repo |

The full handbook (business + technical, with the review dispositions) and Charlie's setup checklist live outside the repo in `../artifacts/` and in the Cowork project (`claude/handbook-v2.md`).
