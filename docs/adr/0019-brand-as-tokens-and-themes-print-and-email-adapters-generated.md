# ADR 0019: brand as tokens + themes; print and e-mail adapters generated from the same file

- **Date:** 2026-09-17
- **Status:** Accepted
- **Handbook ID:** SPEC-08 Part C (B-19, O-13; ADR 0018 follow-through)

## Decision

The Clean Bill brand is one definition in the repo, versioned with the code, and every surface reads it:

1. **Tokens in CSS, two layers.** `apps/web/src/styles/tokens.css` holds the theme-independent primitives (spacing,
   radii, motion, type scale) and every *semantic* token (`--color-primary`, `--color-line`, `--shadow-hero`, `--ring`,
   `--font-heading` …). The colour and type *primitives* live in theme files, `theme-handoff.css` (the SPEC-07 set, the
   default) and `theme-brief.css` (the brand brief's forest / amber palette with Source Serif 4 + Inter Tight). Both
   files define the same primitive names; a theme is selected by `DEFAULT_THEME` in `layout.tsx` (rendered as
   `data-theme` on `<html>`), and `?theme=` or the toggle on `/design-system` overrides it per browser so the whole
   site can be reviewed in either palette before O-13 is decided. Components (`globals.css`) and JSX read semantic
   tokens only; Tailwind's theme is a `reference` alias of the same names.
2. **Generated adapters, not copies.** `python -m trd.brand --sync` parses tokens.css plus the default theme and writes
   `trd/brand_tokens.py` (reportlab / Pillow), `supabase/functions/_shared/brand.ts` (pdf-lib) and
   `apps/web/src/styles/brand.generated.ts` (the theme colour and the mark path for the web). CI fails when any is
   stale, exactly like `findings.ts` (ADR 0016). Letters, the packet data sheet, both Form 50-114 audit pages and the
   e-mail template (`trd/email/base.html`, inline-styled tables) import from those files; DM Sans is vendored under
   `trd/fonts/` (OFL) so print matches the site.
3. **One mark, one geometry.** The mark (a receipt outline with a check, an original line drawing per the brief §10) is
   a list of polylines in `trd/brand.py`; SVG, Pillow, reportlab and pdf-lib all draw those points. The wordmark SVG
   sets the name as glyph outlines from the vendored DM Sans Bold (fontTools, a dev-only tool), so no viewer needs the
   font.
4. **A lint, a contrast table and a living style guide.** `apps/web/scripts/design-lint.mjs` fails CI on a hex literal,
   `rgb(` or a literal font family outside `src/styles/`, on a primitive referenced from a component, and on a
   semantic token that does not resolve in every theme. `python -m trd.brand --contrast` prints the WCAG 2.2 AA table
   for every theme (pasted into `docs/DESIGN-SYSTEM.md`; `tests/test_brand.py` fails if any pairing drops below its
   minimum). `/design-system` renders every token, component state, status badge, asset and the e-mail template from
   the live CSS, with the theme toggle.

## Rationale

Three surfaces carried the brand with three definitions (CSS, reportlab constants, pdf-lib literals) and SPEC-09 was
about to add a fourth. Generating the print and e-mail constants from the CSS removes the copies without asking
reportlab or pdf-lib to parse CSS at runtime, and keeps the edge function free of new dependencies. Two theme files
with the same primitive names turn the palette decision (O-13) into a one-line change and let the Sep 26 review compare
both on one page. The lint is what keeps the rule true after this PR.

## Consequences

- Adding a colour means adding a primitive to *both* theme files and a semantic alias in tokens.css, then `--sync`.
- The edge function's audit page still sets the wordmark text in Helvetica Bold (pdf-lib needs `fontkit` to embed a
  TTF, a dependency the spec rules out); the mark and the colours are the tokens'. The Python-side packet embeds DM Sans.
- `next/font` self-hosts three families now; the two brief-theme families are not preloaded, so the default theme's
  page weight is unchanged.
- The §41.0051 block on the letter is untouched (Helvetica Bold 14 pt); the rest of the letter is DM Sans.

## Revisit when

O-13 is decided (delete the losing theme file or keep it as the documented alternate); pdf-lib font embedding becomes
worth a dependency; photography replaces the placeholder slots.
