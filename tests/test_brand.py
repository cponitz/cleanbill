"""SPEC-08 Part C: the design system's print and e-mail adapters are generated from tokens.css and stay current."""
from __future__ import annotations

import re
from datetime import date

import pytest
from pypdf import PdfReader

from cleanbill import brand
from cleanbill import brand_tokens as T


def test_generated_files_are_current():
    for key, content in brand.generated_contents().items():
        assert brand.GENERATED[key].read_text() == content, f"{brand.GENERATED[key].name} is stale — run python -m cleanbill.brand --sync"


def test_default_theme_matches_tokens():
    theme = brand.default_theme()
    assert T.THEME == theme
    colors = brand.colors_for(theme)
    assert set(colors) == set(brand.SEMANTIC_COLORS)
    for k, v in colors.items():
        assert re.fullmatch(r"#[0-9A-F]{6}", v), (k, v)
        assert T.HEX[k] == v


@pytest.mark.parametrize("theme", brand.theme_names())
def test_every_theme_resolves_and_passes_contrast(theme):
    colors = brand.colors_for(theme)   # raises if a semantic token does not resolve in this theme
    assert len(colors) == len(brand.SEMANTIC_COLORS)
    failing = [(fg, bg, f"{ratio:.2f}", minimum) for fg, bg, _, _, ratio, minimum, ok in brand.contrast_rows(theme) if not ok]
    assert not failing, f"theme {theme} fails WCAG AA on: {failing}"


def test_both_themes_have_the_same_primitives():
    names = {t: set(brand.parse_declarations(brand.theme_file(t).read_text())) for t in brand.theme_names()}
    assert len(names) >= 2
    first = next(iter(names.values()))
    for t, n in names.items():
        assert n == first, f"theme {t} differs: {n ^ first}"


def test_fonts_are_vendored_with_licence():
    for w in brand.FONT_FILES:
        assert brand.font_path(w).exists()
    assert "SIL Open Font License" in (brand.FONTS_DIR / "OFL.txt").read_text()
    names = brand.register_fonts()
    assert names["bold"] == "DMSans-Bold"


def test_email_template_wraps_a_message():
    from cleanbill.email import render_email
    html, text = render_email("Your application is ready", "Hi Pat,\n\nThe packet is attached. See https://cleanbillco.com/claim/CB-TEST-0001\n\nClean Bill")
    assert "{{" not in html                                   # every placeholder filled
    assert T.HEX["primary"] in html and T.HEX["bg"] in html   # colours come from the tokens
    assert brand.DISCLAIMER in html and brand.DISCLAIMER in text
    assert "hello@cleanbillco.com" in html and "hello@cleanbillco.com" in text
    assert '<a href="https://cleanbillco.com/claim/CB-TEST-0001"' in html
    assert text.startswith("Your application is ready\n\nHi Pat,")


def test_letter_carries_the_wordmark_and_theme_colour(tmp_path):
    from cleanbill.letters.generate import DISCLAIMER, LetterData, render_letter
    out = tmp_path / "a.pdf"
    render_letter(LetterData(owner_name="PAT OWNER", owner_first="Pat", situs_address="3675 DUVAL ST, AUSTIN, TX 78721",
                             mail_lines=["3675 DUVAL ST", "AUSTIN TX 78721"], refund_total=3712.4, forward_annual=1850,
                             refund_years=[2024, 2025], claim_code="CB-TEST-0001", claim_url="https://cleanbillco.com/claim/CB-TEST-0001",
                             mail_date=date(2026, 10, 5)), out)
    reader = PdfReader(str(out))
    page = reader.pages[0]
    text = page.extract_text()
    assert "Clean Bill" in text and "https://cleanbillco.com/claim/CB-TEST-0001" in text
    assert DISCLAIMER.split(".")[0] in text                   # the §41.0051 line is untouched
    fonts = {f.get("/BaseFont", "") for f in (page["/Resources"]["/Font"][k].get_object() for k in page["/Resources"]["/Font"])}
    assert any("DMSans" in str(f) for f in fonts), fonts       # DM Sans embedded
    assert any("Helvetica-Bold" in str(f) for f in fonts)      # the disclaimer's font is unchanged
    content = page.get_contents().get_data().decode("latin-1")
    strokes = [tuple(float(x) for x in m.groups()) for m in re.finditer(r"([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+RG", content)]
    assert any(all(abs(a - b) < 0.01 for a, b in zip(s, T.PRIMARY)) for s in strokes), f"wordmark stroke in the primary colour; strokes seen: {strokes[:5]}"


def test_mark_geometry_is_one_definition():
    path = brand.mark_svg_path()
    assert path.count("M ") == len(brand.MARK)
    assert path in brand.GENERATED["ts"].read_text() and path in brand.GENERATED["web"].read_text()


def test_email_parity_snapshot_is_current():
    """SPEC-10 E1: the fixture the Deno renderer (_shared/email_test.ts) is checked against is what Python renders today."""
    from cleanbill import email
    assert email.SNAPSHOT.exists()
    assert email.SNAPSHOT.read_text() == email.snapshot_text(), "run python -m cleanbill.email --emit-snapshot"
    snap = email.snapshot()
    assert len(snap["cases"]) == len(snap["rendered"]) >= 5
    for r in snap["rendered"]:
        assert "{{" not in r["html"] and brand.DISCLAIMER in r["text"]
