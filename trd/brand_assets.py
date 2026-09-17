"""Brand assets rendered from the tokens (SPEC-08 Part C, C4): `python -m trd.brand --assets`.

Writes apps/web/public/brand/:
  wordmark.svg           the mark + "Clean Bill" as glyph outlines from the vendored DM Sans Bold (needs fontTools, dev only)
  wordmark-dark.svg      the same in the on-dark colour, for dark bands
  mark.svg               the mark alone (currentColor, so CSS decides the colour)
  favicon.svg            the mark on the primary colour, rounded square
  favicon.ico            32 px + 16 px raster of the same (Pillow)
  apple-touch-icon.png   180 px
  og.png                 1200 × 630 Open Graph image: wordmark, the promise line, the domain
  email-header.png       600 × 96 e-mail header: wordmark on the page colour
  email-sample.html      the e-mail template rendered with sample text, for the /design-system iframe
Every colour comes from trd/brand_tokens.py (generated from tokens.css); the geometry from trd.brand.MARK.
"""
from __future__ import annotations

from pathlib import Path

from trd import brand
from trd import brand_tokens as T

OUT = brand.ROOT / "apps" / "web" / "public" / "brand"


# ---- SVG --------------------------------------------------------------------------------------------------------------
def _mark_svg_body(color: str, x: float = 0, y: float = 0, size: float = 100) -> str:
    s = size / 100
    w = brand.MARK_STROKE * s
    parts = []
    for pts in brand.MARK.values():
        d = "M " + " L ".join(f"{x + px * s:.2f} {y + py * s:.2f}" for px, py in pts)
        parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w:.2f}" stroke-linecap="round" stroke-linejoin="round"/>')
    return "".join(parts)


def mark_svg() -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="{T.BRAND_NAME} mark">'
            f'{_mark_svg_body("currentColor")}</svg>\n')


def favicon_svg() -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="{T.HEX["primary"]}"/>'
            f'{_mark_svg_body(T.HEX["on-primary"], 14, 14, 72)}</svg>\n')


def _text_paths(text: str, font_file: Path, size: float, x: float, baseline: float) -> tuple[str, float]:
    """Glyph outlines for `text` as SVG path elements (fontTools), returns (svg, advance width)."""
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.ttLib import TTFont
    f = TTFont(str(font_file))
    glyphs = f.getGlyphSet(); cmap = f.getBestCmap(); upem = f["head"].unitsPerEm
    kern = _kern_table(f)
    scale = size / upem
    out = []; pen_x = x; prev = None
    for ch in text:
        gname = cmap.get(ord(ch))
        if gname is None:
            pen_x += size * 0.3; prev = None; continue
        if prev is not None:
            pen_x += kern.get((prev, gname), 0) * scale
        pen = SVGPathPen(glyphs)
        glyphs[gname].draw(TransformPen(pen, (scale, 0, 0, -scale, pen_x, baseline)))
        d = pen.getCommands()
        if d:
            out.append(f'<path d="{d}"/>')
        pen_x += glyphs[gname].width * scale
        prev = gname
    return "".join(out), pen_x - x


def _kern_table(f) -> dict[tuple[str, str], float]:
    """Pair kerning from the GPOS 'kern' feature (format 1 and 2 pair-pos), enough for a wordmark."""
    table: dict[tuple[str, str], float] = {}
    if "GPOS" not in f:
        return table
    try:
        for lookup in f["GPOS"].table.LookupList.Lookup:
            for st in lookup.SubTable:
                if getattr(st, "LookupType", lookup.LookupType) != 2:
                    continue
                if st.Format == 1:
                    for first, ps in zip(st.Coverage.glyphs, st.PairSet):
                        for pvr in ps.PairValueRecord:
                            adv = getattr(pvr.Value1, "XAdvance", 0) if pvr.Value1 else 0
                            if adv:
                                table[(first, pvr.SecondGlyph)] = adv
                elif st.Format == 2:
                    c1 = st.ClassDef1.classDefs; c2 = st.ClassDef2.classDefs
                    for first in st.Coverage.glyphs:
                        k1 = c1.get(first, 0)
                        for second, k2 in c2.items():
                            rec = st.Class1Record[k1].Class2Record[k2]
                            adv = getattr(rec.Value1, "XAdvance", 0) if rec.Value1 else 0
                            if adv:
                                table[(first, second)] = adv
    except Exception:  # a kerning miss only nudges letter spacing; never fail the build on it
        pass
    return table


def wordmark_svg(color: str, bg: str | None = None) -> str:
    """Mark (height 100) + name as outlines; total viewBox computed from the text advance."""
    size = 78.0
    text, adv = _text_paths(T.BRAND_NAME, brand.font_path("bold"), size, 118, 84)
    width = 118 + adv + 6
    rect = f'<rect width="{width:.0f}" height="100" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} 100" role="img" aria-label="{T.BRAND_NAME}">'
            f'{rect}{_mark_svg_body(color)}<g fill="{color}">{text}</g></svg>\n')


# ---- raster (Pillow) ----------------------------------------------------------------------------------------------------
def _draw_mark(draw, x: float, y: float, size: float, color: str) -> None:
    w = max(1, round(brand.MARK_STROKE * size / 100))
    for pts in brand.mark_polylines(x, y, size):
        draw.line(pts, fill=color, width=w, joint="curve")
        r = w / 2 - 0.5
        for px, py in (pts[0], pts[-1]):   # round caps
            draw.ellipse([px - r, py - r, px + r, py + r], fill=color)


def _font(weight: str, px: int):
    from PIL import ImageFont
    return ImageFont.truetype(str(brand.font_path(weight)), px)


def _wordmark_png(draw, x: int, y: int, height: int, color: str) -> int:
    """Mark + name in DM Sans Bold on a Pillow draw; returns the right edge."""
    _draw_mark(draw, x, y, height, color)
    font = _font("bold", round(height * 0.78))
    tx = x + round(height * 1.18)
    ascent, _ = font.getmetrics()
    draw.text((tx, y + height * 0.5 - ascent * 0.62), T.BRAND_NAME, font=font, fill=color)
    return tx + round(draw.textlength(T.BRAND_NAME, font=font))


def favicon_ico(path: Path) -> None:
    from PIL import Image, ImageDraw
    frames = []
    for px in (16, 32, 48):
        scale = 4
        img = Image.new("RGBA", (px * scale, px * scale), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, px * scale - 1, px * scale - 1], radius=round(px * scale * 0.22), fill=T.HEX["primary"])
        _draw_mark(d, px * scale * 0.14, px * scale * 0.14, px * scale * 0.72, T.HEX["on-primary"])
        frames.append(img.resize((px, px), Image.LANCZOS))
    frames[-1].save(path, format="ICO", sizes=[(f.width, f.height) for f in frames], append_images=frames[:-1])


def apple_touch(path: Path) -> None:
    from PIL import Image, ImageDraw
    px = 180
    img = Image.new("RGB", (px, px), T.HEX["primary"])
    d = ImageDraw.Draw(img)
    _draw_mark(d, px * 0.17, px * 0.17, px * 0.66, T.HEX["on-primary"])
    img.save(path, format="PNG", optimize=True)


def og_png(path: Path) -> None:
    from PIL import Image, ImageDraw
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), T.HEX["bg"])
    d = ImageDraw.Draw(img)
    d.rectangle([0, H - 14, W, H], fill=T.HEX["primary"])
    _wordmark_png(d, 96, 96, 84, T.HEX["primary"])
    d.text((96, 262), "Pay what you should.", font=_font("bold", 64), fill=T.HEX["ink"])
    d.text((96, 340), "Not a dollar more.", font=_font("bold", 64), fill=T.HEX["primary"])
    d.text((96, 456), "Property-tax refunds for Travis County homeowners. 25% of the refund you receive, $0 otherwise.",
           font=_font("regular", 26), fill=T.HEX["body"])
    d.text((96, 520), "cleanbillco.com", font=_font("medium", 28), fill=T.HEX["muted"])
    img.save(path, format="PNG", optimize=True)


def email_header_png(path: Path) -> None:
    from PIL import Image, ImageDraw
    W, H = 600, 96
    img = Image.new("RGB", (W, H), T.HEX["bg"])
    d = ImageDraw.Draw(img)
    _wordmark_png(d, 24, 24, 48, T.HEX["primary"])
    d.rectangle([0, H - 3, W, H], fill=T.HEX["hairline"])
    img.save(path, format="PNG", optimize=True)


def email_sample_html() -> str:
    from trd.email import render_email
    body = ("Hi Richard,\n\nYour Form 50-114 is prepared and attached for your review. It lists the 2024 and 2025 tax years as "
            "late applications under Tax Code §11.431 and carries your typed signature.\n\nReply \"go\" and we submit it to the "
            "Travis Central Appraisal District the same day. Nothing is filed until you say so.\n\nClean Bill")
    return render_email("Your application is ready to review", body, header_url="email-header.png")[0]


def build_all() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "mark.svg").write_text(mark_svg())
    (OUT / "favicon.svg").write_text(favicon_svg())
    (OUT / "wordmark.svg").write_text(wordmark_svg(T.HEX["primary"]))
    (OUT / "wordmark-dark.svg").write_text(wordmark_svg(T.HEX["on-dark-strong"], bg=T.HEX["dark"]))
    favicon_ico(OUT / "favicon.ico")
    apple_touch(OUT / "apple-touch-icon.png")
    og_png(OUT / "og.png")
    email_header_png(OUT / "email-header.png")
    (OUT / "email-sample.html").write_text(email_sample_html())
    print("wrote " + ", ".join(sorted(p.name for p in OUT.iterdir())))
    return 0
