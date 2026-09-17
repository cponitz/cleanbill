"""Clean Bill brand adapter for print and e-mail (SPEC-08 Part C, C5; ADR 0019).

The design system's single source of truth is apps/web/src/styles/tokens.css plus the default theme file
(apps/web/src/styles/theme-<name>.css, the name being DEFAULT_THEME in apps/web/src/app/layout.tsx). This module
reads those files and generates three files that other surfaces import, so no colour or font is typed twice:

  trd/brand_tokens.py                        constants for reportlab (letters, packet data sheet, audit page) and Pillow
  supabase/functions/_shared/brand.ts        the same colours for pdf-lib (the Form 50-114 audit page in process-claim)
  apps/web/src/styles/brand.generated.ts     the few values the web app needs outside CSS (theme colour for the browser UI)

    python -m trd.brand --sync              regenerate the three files
    python -m trd.brand --sync --check      exit 1 when any generated file is stale (CI)
    python -m trd.brand --assets            render apps/web/public/brand/* (wordmark, mark, favicons, OG image, e-mail header)
    python -m trd.brand --contrast          print the WCAG contrast table for both themes (pasted into docs/DESIGN-SYSTEM.md)

Also exported for the print adapters: the vendored DM Sans font files (trd/fonts/, OFL), `register_fonts()` for
reportlab, the mark geometry (`MARK`, `mark_svg_path()`) and `draw_mark()` / `draw_wordmark()` for a reportlab canvas.
The mark is an original line drawing per the brand brief §10: a bill / receipt outline with a check.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STYLES = ROOT / "apps" / "web" / "src" / "styles"
TOKENS_CSS = STYLES / "tokens.css"
LAYOUT_TSX = ROOT / "apps" / "web" / "src" / "app" / "layout.tsx"
FONTS_DIR = Path(__file__).resolve().parent / "fonts"
FONT_FILES = {"regular": "DMSans-Regular.ttf", "medium": "DMSans-Medium.ttf", "semibold": "DMSans-SemiBold.ttf", "bold": "DMSans-Bold.ttf"}
GENERATED = {
    "py": Path(__file__).resolve().parent / "brand_tokens.py",
    "ts": ROOT / "supabase" / "functions" / "_shared" / "brand.ts",
    "web": STYLES / "brand.generated.ts",
}
BRAND_NAME = "Clean Bill"
LEGAL_NAME = "Clean Bill Co."
SUPPORT_EMAIL = "hello@cleanbillco.com"
SITE = "https://cleanbillco.com"
DISCLAIMER = "THIS DOCUMENT IS AN ADVERTISEMENT OF SERVICES. IT IS NOT AN OFFICIAL DOCUMENT OF THE STATE OF TEXAS."

# The semantic colour tokens the adapters expose (tokens.css defines these; every theme must resolve them).
SEMANTIC_COLORS = [
    "bg", "surface", "ink", "body", "muted", "placeholder", "primary", "primary-strong", "primary-tint", "primary-soft",
    "on-primary", "dark", "on-dark", "on-dark-strong", "accent", "accent-text", "accent-body", "amount", "line", "hairline",
    "row-tint", "success", "success-bg", "error", "error-bg", "disabled",
]

# ---- the mark: a receipt outline with a check, in a 100 × 100 box, stroke width 8, round caps and joins -------------
# Polylines in user units (y down, as in SVG). Every renderer (SVG, Pillow, reportlab, pdf-lib) draws these same points.
MARK_STROKE = 8
MARK = {
    # receipt body: top-left → top-right → down the right edge → serrated bottom edge → up the left edge (closed)
    "outline": [(22, 8), (78, 8), (78, 92), (69, 84), (60, 92), (51, 84), (42, 92), (33, 84), (22, 92), (22, 8)],
    # two short "line items"
    "line1": [(34, 30), (54, 30)],
    "line2": [(34, 44), (48, 44)],
    # the check
    "check": [(38, 64), (48, 74), (68, 52)],
}


# ---- token parsing --------------------------------------------------------------------------------------------------
def default_theme() -> str:
    m = re.search(r'DEFAULT_THEME:\s*ThemeName\s*=\s*"([a-z]+)"', LAYOUT_TSX.read_text())
    if not m:
        raise SystemExit("DEFAULT_THEME not found in apps/web/src/app/layout.tsx")
    return m.group(1)


def theme_file(name: str) -> Path:
    return STYLES / f"theme-{name}.css"


def theme_names() -> list[str]:
    return sorted(p.stem.removeprefix("theme-") for p in STYLES.glob("theme-*.css"))


_DECL = re.compile(r"(--[a-z0-9-]+)\s*:\s*([^;]+);")


def parse_declarations(css: str) -> dict[str, str]:
    """Every `--name: value;` in the file, comments stripped, in order (later wins)."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    return {k: " ".join(v.split()) for k, v in _DECL.findall(css)}


def resolve(value: str, table: dict[str, str], depth: int = 0) -> str:
    """Replace var(--x) references with their values, recursively; unresolved references raise."""
    if depth > 12:
        raise ValueError(f"token reference cycle in {value!r}")
    def sub(m: re.Match) -> str:
        name = m.group(1)
        if name not in table:
            raise KeyError(name)
        return resolve(table[name], table, depth + 1)
    return re.sub(r"var\((--[a-z0-9-]+)\)", sub, value)


def load_theme(name: str) -> dict[str, str]:
    """Primitives + semantics for one theme, every semantic resolved to a literal value."""
    table = parse_declarations(theme_file(name).read_text())
    table.update(parse_declarations(TOKENS_CSS.read_text()))
    # the font variables come from next/font at runtime; give them a print-side fallback so the family resolves
    table.setdefault("--font-dm", '"DM Sans"')
    table.setdefault("--font-inter-tight", '"Inter Tight"')
    table.setdefault("--font-source-serif", '"Source Serif 4"')
    out = {}
    for k, v in table.items():
        try:
            out[k] = resolve(v, table)
        except KeyError as e:
            raise SystemExit(f"theme {name}: {k} references undefined token {e.args[0]}") from None
    return out


def hex_of(value: str) -> str:
    v = value.strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", v):
        return v.upper()
    raise ValueError(f"not a 6-digit hex colour: {value!r}")


def rgb_of(hex6: str) -> tuple[float, float, float]:
    h = hex6.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def colors_for(theme: str) -> dict[str, str]:
    t = load_theme(theme)
    missing = [c for c in SEMANTIC_COLORS if f"--color-{c}" not in t]
    if missing:
        raise SystemExit(f"theme {theme}: tokens.css does not define --color-{{{', '.join(missing)}}}")
    return {c: hex_of(t[f"--color-{c}"]) for c in SEMANTIC_COLORS}


# ---- generated files ------------------------------------------------------------------------------------------------
HEADER = "GENERATED by `python -m trd.brand --sync` from apps/web/src/styles/tokens.css + theme-{theme}.css — do not edit."


def render_py(theme: str, colors: dict[str, str]) -> str:
    lines = [f'"""{HEADER.format(theme=theme)}\n\nBrand constants for reportlab and Pillow. Import `trd.brand` for the helpers.\n"""',
             "from __future__ import annotations", "", f'THEME = "{theme}"', f'BRAND_NAME = "{BRAND_NAME}"', f'LEGAL_NAME = "{LEGAL_NAME}"',
             f'SUPPORT_EMAIL = "{SUPPORT_EMAIL}"', f'SITE = "{SITE}"', "", "# semantic colours, hex"]
    lines.append("HEX = {")
    for k, v in colors.items():
        lines.append(f'    "{k}": "{v}",')
    lines.append("}")
    lines.append("")
    lines.append("# the same colours as 0–1 RGB tuples (reportlab setFillColorRGB / setStrokeColorRGB)")
    lines.append("RGB = {")
    for k, v in colors.items():
        r, g, b = rgb_of(v)
        lines.append(f'    "{k}": ({r:.4f}, {g:.4f}, {b:.4f}),')
    lines.append("}")
    lines.append("")
    for k in colors:
        const = k.upper().replace("-", "_")
        lines.append(f'{const} = RGB["{k}"]')
    lines.append("")
    return "\n".join(lines)


def render_ts(theme: str, colors: dict[str, str]) -> str:
    lines = [f"// {HEADER.format(theme=theme)}", "// Brand colours for pdf-lib (the Form 50-114 audit page). Values are 0–1 RGB triples.", "",
             f'export const THEME = "{theme}";', f'export const BRAND_NAME = "{BRAND_NAME}";', f'export const SITE = "{SITE}";', "",
             "export const HEX = {"]
    for k, v in colors.items():
        lines.append(f'  "{k}": "{v}",')
    lines.append("} as const;")
    lines.append("")
    lines.append("export const RGB: Record<keyof typeof HEX, [number, number, number]> = {")
    for k, v in colors.items():
        r, g, b = rgb_of(v)
        lines.append(f'  "{k}": [{r:.4f}, {g:.4f}, {b:.4f}],')
    lines.append("};")
    lines.append("")
    lines.append("/** The mark (a receipt outline with a check) as SVG path data in a 100 × 100 box; stroke it, do not fill it. */")
    lines.append(f'export const MARK_PATH = "{mark_svg_path()}";')
    lines.append(f"export const MARK_STROKE = {MARK_STROKE};")
    lines.append("")
    return "\n".join(lines)


def render_web(theme: str, colors: dict[str, str]) -> str:
    return "\n".join([
        f"// {HEADER.format(theme=theme)}",
        "// The few brand values the web app needs outside CSS. Everything else is a CSS token (src/styles/tokens.css).",
        "",
        f'export const THEME = "{theme}";',
        f'export const THEME_COLOR = "{colors["bg"]}";   // <meta name="theme-color">: the page background of the default theme',
        f'export const BRAND_HEX = {{ primary: "{colors["primary"]}", ink: "{colors["ink"]}", bg: "{colors["bg"]}" }} as const;',
        "/** The mark (a receipt outline with a check) as SVG path data in a 100 × 100 box; stroke it with currentColor. */",
        f'export const MARK_PATH = "{mark_svg_path()}";',
        f"export const MARK_STROKE = {MARK_STROKE};",
        "",
    ])


def generated_contents() -> dict[str, str]:
    theme = default_theme()
    colors = colors_for(theme)
    return {"py": render_py(theme, colors), "ts": render_ts(theme, colors), "web": render_web(theme, colors)}


def sync(check: bool) -> int:
    stale = []
    for key, content in generated_contents().items():
        path = GENERATED[key]
        if not path.exists() or path.read_text() != content:
            stale.append(path)
            if not check:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
    if check:
        if stale:
            print("stale generated brand files (run `python -m trd.brand --sync`):\n  " + "\n  ".join(str(p.relative_to(ROOT)) for p in stale))
            return 1
        print("generated brand files are current")
        return 0
    print("wrote " + ", ".join(str(GENERATED[k].relative_to(ROOT)) for k in GENERATED) if stale else "generated brand files already current")
    return 0


# ---- contrast (WCAG 2.2) ---------------------------------------------------------------------------------------------
def luminance(hex6: str) -> float:
    def ch(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(x) for x in rgb_of(hex6))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg: str, bg: str) -> float:
    a, b = luminance(fg), luminance(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


# (foreground, background, what it is, minimum ratio — 4.5 body text, 3 large text / UI components)
PAIRS = [
    ("ink", "bg", "headings and primary text on the page", 4.5),
    ("body", "bg", "body text on the page", 4.5),
    ("muted", "bg", "secondary text, labels, footer", 4.5),
    ("ink", "surface", "text on cards and inputs", 4.5),
    ("body", "surface", "body text on cards", 4.5),
    ("muted", "surface", "labels on cards", 4.5),
    ("placeholder", "surface", "input placeholder — supplementary; every field has a visible label (informational)", 0),
    ("primary", "bg", "links, eyebrows, active nav", 4.5),
    ("primary", "surface", "links on cards", 4.5),
    ("on-primary", "primary", "primary button label", 4.5),
    ("primary-strong", "primary-tint", "text on tint callouts and teal pills", 4.5),
    ("amount", "surface", "the refund number (48px: 3:1)", 3.0),
    ("on-dark-strong", "dark", "headings on dark bands", 4.5),
    ("on-dark", "dark", "body text on dark bands", 4.5),
    ("primary-soft", "dark", "eyebrows on dark bands (large / UI: 3:1)", 3.0),
    ("accent-text", "accent", "text on accent (sand / amber) tint", 4.5),
    ("accent-body", "accent", "body text on accent tint", 4.5),
    ("success", "success-bg", "success pill", 4.5),
    ("error", "error-bg", "error pill / invalid input", 4.5),
    ("error", "surface", "field error text", 4.5),
    ("on-primary", "disabled", "disabled button label — inactive components are exempt (WCAG 1.4.3); informational", 0),
    ("line", "surface", "card and input borders (UI: 3:1 — informational only)", 0),
    ("primary", "surface", "focus ring vs. field (UI: 3:1)", 3.0),
]


def contrast_rows(theme: str) -> list[tuple[str, str, str, str, float, float, bool]]:
    c = colors_for(theme)
    rows = []
    for fg, bg, what, minimum in PAIRS:
        ratio = contrast(c[fg], c[bg])
        rows.append((fg, bg, c[fg], c[bg], ratio, minimum, minimum == 0 or ratio >= minimum))
    return rows


def contrast_table() -> str:
    out = []
    for theme in theme_names():
        out.append(f"### Theme `{theme}`\n")
        out.append("| Foreground | Background | Hex | Ratio | Minimum | Result | Where |")
        out.append("|---|---|---|---:|---:|---|---|")
        for (fg, bg, fh, bh, ratio, minimum, ok), (_, _, what, _) in zip(contrast_rows(theme), PAIRS):
            out.append(f"| `{fg}` | `{bg}` | {fh} on {bh} | {ratio:.2f}:1 | {minimum or '—'} | {'pass' if ok else '**FAIL**'} | {what} |")
        out.append("")
    return "\n".join(out)


def contrast_ok(theme: str) -> bool:
    return all(r[-1] for r in contrast_rows(theme))


# ---- print helpers (reportlab) ---------------------------------------------------------------------------------------
def font_path(weight: str = "regular") -> Path:
    return FONTS_DIR / FONT_FILES[weight]


_registered = False


def register_fonts() -> dict[str, str]:
    """Register the vendored DM Sans weights with reportlab once; returns {weight: reportlab font name}."""
    global _registered
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    names = {w: f"DMSans-{w.capitalize()}" for w in FONT_FILES}
    if not _registered:
        for w, n in names.items():
            pdfmetrics.registerFont(TTFont(n, str(font_path(w))))
        pdfmetrics.registerFontFamily("DMSans-Regular", normal="DMSans-Regular", bold="DMSans-Bold", italic="DMSans-Regular", boldItalic="DMSans-Bold")
        _registered = True
    return names


def mark_svg_path() -> str:
    parts = []
    for pts in MARK.values():
        parts.append("M " + " L ".join(f"{x} {y}" for x, y in pts))
    return " ".join(parts)


def mark_polylines(x: float, y: float, size: float, flip_y: bool = False) -> list[list[tuple[float, float]]]:
    """The mark's polylines scaled into a `size` box at (x, y). flip_y for PDF coordinates (origin bottom-left)."""
    s = size / 100
    out = []
    for pts in MARK.values():
        out.append([(x + px * s, (y + (100 - py) * s) if flip_y else (y + py * s)) for px, py in pts])
    return out


def draw_mark(c, x: float, y: float, size: float, rgb: tuple[float, float, float]) -> None:
    """Stroke the mark on a reportlab canvas with its bottom-left corner at (x, y)."""
    c.saveState()
    c.setStrokeColorRGB(*rgb); c.setLineWidth(MARK_STROKE * size / 100); c.setLineCap(1); c.setLineJoin(1)
    for pts in mark_polylines(x, y, size, flip_y=True):
        p = c.beginPath(); p.moveTo(*pts[0])
        for pt in pts[1:]:
            p.lineTo(*pt)
        c.drawPath(p, stroke=1, fill=0)
    c.restoreState()


def draw_wordmark(c, x: float, y: float, height: float, rgb: tuple[float, float, float], text: str = BRAND_NAME) -> float:
    """Mark + the brand name in DM Sans Bold, baseline-aligned, at (x, y); returns the total width drawn."""
    from reportlab.pdfbase import pdfmetrics
    names = register_fonts()
    draw_mark(c, x, y - height * 0.12, height, rgb)
    size = height * 0.78
    c.saveState(); c.setFillColorRGB(*rgb); c.setFont(names["bold"], size)
    tx = x + height * 1.18
    c.drawString(tx, y + height * 0.08, text)
    c.restoreState()
    return tx + pdfmetrics.stringWidth(text, names["bold"], size) - x


# ---- assets (SVG + Pillow) ------------------------------------------------------------------------------------------
def assets() -> int:
    from trd import brand_assets
    return brand_assets.build_all()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--sync", action="store_true", help="regenerate brand_tokens.py, _shared/brand.ts, brand.generated.ts")
    ap.add_argument("--check", action="store_true", help="with --sync: fail if any generated file is stale")
    ap.add_argument("--assets", action="store_true", help="render apps/web/public/brand/*")
    ap.add_argument("--contrast", action="store_true", help="print the contrast table for every theme")
    a = ap.parse_args(argv)
    rc = 0
    if a.sync:
        rc = sync(check=a.check)
    if a.contrast:
        print(contrast_table())
        rc = rc or (0 if all(contrast_ok(t) for t in theme_names()) else 1)
    if a.assets:
        rc = rc or assets()
    if not (a.sync or a.assets or a.contrast):
        ap.print_help()
    return rc


if __name__ == "__main__":
    sys.exit(main())
