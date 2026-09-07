from datetime import date

import pytest

from trd.estimator import estimate_refund, refundable_tax_years, savings_by_entity
from trd.estimator.rates import TCAD_AVG_HS_SAVINGS_2025
from trd.estimator.refund import conservative_display, late_filing_deadline


def test_late_filing_deadline_two_years_after_delinquency():
    # TY2024 delinquent Feb 1 2025 -> late filing accepted through Feb 1 2027
    assert late_filing_deadline(2024) == date(2027, 2, 1)


def test_refundable_years_sept_2026():
    assert refundable_tax_years(date(2026, 9, 7)) == [2024, 2025]


def test_refundable_years_after_feb_2027_cliff():
    # Feb 1 2027 is the last day for TY2024; the day after, 2024 is gone and 2026 (now a prior year) is in
    assert refundable_tax_years(date(2027, 2, 2)) == [2025, 2026]
    assert refundable_tax_years(date(2027, 2, 1)) == [2024, 2025, 2026]


def test_ownership_on_jan_1_gates_years():
    # bought mid-2024 -> not owner on Jan 1 2024 -> only 2025 refundable
    assert refundable_tax_years(date(2026, 9, 7), owned_since=date(2024, 6, 15)) == [2025]


def test_worked_example_600k_2025_matches_research_within_2pct():
    # Research worked example: $600K home, TY2025 HS savings ≈ $2,523
    s = savings_by_entity(600_000, 2025)
    assert abs(s["total"] - 2_523) / 2_523 < 0.02
    assert s["entities"]["AISD"]["hs_savings"] == pytest.approx(140_000 * 0.9252 / 100, rel=1e-6)
    assert s["entities"]["CITY"]["hs_exemption"] == 120_000


def test_worked_example_600k_2024():
    # Research worked example: TY2024 ≈ $2,073
    s = savings_by_entity(600_000, 2024)
    assert abs(s["total"] - 2_073) / 2_073 < 0.02


def test_two_year_refund_600k_about_4600():
    est = estimate_refund(600_000, date(2026, 9, 7))
    assert est.refund_years == [2024, 2025]
    assert 4_500 <= est.refund_total <= 4_700
    assert est.forward_annual == savings_by_entity(600_000, 2025)["total"]


def test_five_thousand_minimum_applies_on_cheap_home():
    s = savings_by_entity(20_000, 2025)
    assert s["entities"]["CITY"]["hs_exemption"] == 5_000  # 20% of 20K = 4K < 5K minimum
    assert s["entities"]["AISD"]["hs_exemption"] == 20_000  # capped at value


def test_ov65_stacks_after_hs():
    s = savings_by_entity(600_000, 2025, over65=True)
    assert s["entities"]["AISD"]["ov65_exemption"] == 85_000
    assert s["total"] > savings_by_entity(600_000, 2025)["total"] + 2_000
    assert "COUNTY" in s["unconfirmed_entities"]


def test_exemption_only_savings_sit_below_tcad_all_in_average():
    # TCAD: median homestead market value 2025 = $519,677; TCAD's "$3,663 average savings" figure
    # includes the 10% appraisal-cap benefit on long-held homes, which a late filer does not get.
    # Exemption-only savings at the median value come to ~$2,360 (≈64% of TCAD's all-in number).
    # This test pins that relationship so a rate/exemption typo can't silently inflate letters.
    s = savings_by_entity(519_677, 2025)
    assert 2_250 <= s["total"] <= 2_450
    assert s["total"] < TCAD_AVG_HS_SAVINGS_2025


def test_conservative_display_rounds_down():
    assert conservative_display(4_596.4) == 4_500
    assert conservative_display(4_600) == 4_600
