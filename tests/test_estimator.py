from datetime import date

import pytest

from cleanbill.estimator import estimate_refund, refundable_tax_years, savings_by_entity
from cleanbill.estimator.rates import TCAD_AVG_HS_SAVINGS_2025
from cleanbill.estimator.refund import conservative_display, late_filing_deadline


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


# ---- SPEC-01: taxing-unit-aware estimates -----------------------------------------------------------

def test_units_default_is_flagged_unconfirmed():
    s = savings_by_entity(600_000, 2025)
    assert "units_assumed" in s["unconfirmed_entities"]
    est = estimate_refund(600_000, date(2026, 9, 7))
    assert est.unconfirmed and est.units is None


def test_explicit_austin_units_match_default_and_are_confirmed():
    from cleanbill.estimator.rates import DEFAULT_UNITS
    a = savings_by_entity(600_000, 2025); b = savings_by_entity(600_000, 2025, units=list(DEFAULT_UNITS))
    assert a["total"] == b["total"] and set(a["entities"]) == {"AISD", "CITY", "COUNTY", "ACC", "CENTRAL_HEALTH"}
    assert b["unconfirmed_entities"] == []
    est = estimate_refund(600_000, date(2026, 9, 7), units=list(DEFAULT_UNITS))
    assert 4_500 <= est.refund_total <= 4_700 and not est.unconfirmed


def test_pflugerville_property_uses_its_own_units():
    # Pflugerville ISD (19) + City of Pflugerville (20, no HS exemption) + County + ACC + Central Health + ESD 2 (no HS)
    units = ["19", "20", "03", "68", "2J", "9B"]
    s = savings_by_entity(400_000, 2025, units=units)
    e = s["entities"]
    assert e["19"]["hs_exemption"] == 140_000 and e["19"]["hs_savings"] == pytest.approx(140_000 * 1.1069 / 100, abs=0.01)
    assert e["20"]["hs_savings"] == 0 and e["9B"]["hs_savings"] == 0            # units with no HS exemption contribute nothing
    assert e["COUNTY"]["hs_exemption"] == 80_000 and e["ACC"]["hs_exemption"] == 5_000
    hand = 140_000 * 1.1069 / 100 + 80_000 * 0.375845 / 100 + 5_000 * 0.1034 / 100 + 80_000 * 0.118023 / 100
    assert s["total"] == pytest.approx(hand, abs=0.05)
    assert s["total"] != savings_by_entity(400_000, 2025)["total"]             # differs from the Austin default
    assert s["unconfirmed_entities"] == []                                       # every figure here is sourced or can only understate


def test_school_state_amount_plus_local_pct_and_unconfirmed_when_carried_back():
    # Lake Travis ISD (07): $140K state + 20% local option (min $5K) in the 2026 listing
    s26 = savings_by_entity(500_000, 2026, units=["07"])
    assert s26["entities"]["07"]["hs_exemption"] == 140_000 + 100_000
    s25 = savings_by_entity(500_000, 2025, units=["07"])
    assert s25["entities"]["07"]["hs_exemption"] == 240_000
    assert "07" not in s25["unconfirmed_entities"]   # the 20% for 2025 is sourced (LTISD budget overview), so confirmed
    s24w = savings_by_entity(500_000, 2024, units=["57"])                    # ESD 4: 20% carried back from 2026, unsourced
    assert "57" in s24w["unconfirmed_entities"]


def test_unit_missing_year_is_unconfirmed_and_contributes_zero():
    # Creedmoor MUD (11R) has a 2025 rate but no 2024 rate in the county file
    s24 = savings_by_entity(300_000, 2024, units=["11R", "03"])
    assert "11R" in s24["unconfirmed_entities"] and s24["entities"]["11R"]["savings"] == 0
    est = estimate_refund(300_000, date(2026, 9, 7), units=["11R", "03"])
    assert est.unconfirmed


def test_ov65_stacks_per_unit():
    s = savings_by_entity(600_000, 2025, over65=True, units=["19", "03"])
    e = s["entities"]
    assert e["19"]["ov65_exemption"] == 69_100        # $60K state + $9,100 Pflugerville ISD local
    assert e["COUNTY"]["ov65_exemption"] == 143_220
    assert e["19"]["savings"] == pytest.approx((140_000 + 69_100) * 1.1069 / 100, abs=0.01)


def test_non_taxing_and_unknown_codes_are_dropped():
    s = savings_by_entity(600_000, 2025, units=["0A", "5T", "ZZZZ", "01"])   # appraisal district, a PID, unknown, AISD
    assert list(s["entities"]) == ["AISD"] and s["unconfirmed_entities"] == []


def test_units_by_year_breakdown_and_unit_names():
    est = estimate_refund(400_000, date(2026, 9, 7), units=["19", "20", "03", "68", "2J", "9B"])
    by = est.units_by_year()
    assert set(by) == {"2024", "2025"} and by["2025"]["units"]["19"] > 0 and by["2025"]["units"]["20"] == 0
    assert est.unit_names() == ["PFLUGERVILLE ISD", "TRAVIS COUNTY", "AUSTIN COMM COLL DIST", "TRAVIS COUNTY HEALTHCARE DISTRICT"]


def test_every_unit_with_a_rate_has_a_rule_and_the_five_are_confirmed():
    from cleanbill.estimator.rates import load_units
    units = load_units()["units"]
    assert len(units) > 200 and sum(u["taxing"] for u in units.values()) > 130
    for cd in ("01", "02", "03", "68", "2J"):
        for y in ("2024", "2025"):
            assert units[cd]["years"][y]["rate_confirmed"] and units[cd]["years"][y]["hs_confirmed"], (cd, y)


def test_letter_names_the_property_units():
    from cleanbill.letters.generate import unit_display, units_text
    assert unit_display("CITY OF PFLUGERVILLE") == "the City of Pflugerville"
    assert unit_display("PFLUGERVILLE ISD") == "Pflugerville ISD"
    assert unit_display("TRAVIS CO ESD NO 2") == "Travis County ESD No. 2"
    assert units_text(None) == "Austin ISD, the City of Austin, Travis County, Austin Community College, and Central Health"
    assert units_text(["PFLUGERVILLE ISD", "TRAVIS COUNTY"]) == "Pflugerville ISD and Travis County"


def test_build_units_parses_listing_and_merges_duplicate_rows():
    from cleanbill.estimator.build_units import build, parse_listing
    text = """ID #   Code    PTD Number      Name & Address
1038   38      105-904-02      DRIPPING SPRINGS ISD             Type: School      FrzC: Yes
                               EXEMPTIONS: Type              State Amt    Local Option Pct   Local Opt Min    Local Opt Amt   Freeze Ceiling
                                             HS               140,000                    0              0                0               No
                                             OV65              60,000                    0              0                0              Yes
                                             HS                     0                  20           5,000                0               No
\f
1020   20      227-105-03      CITY OF PFLUGERVILLE Type: City          FrzC: No
                                             OV65                   0                    0              0           50,000               No
"""
    lst = parse_listing(text)
    assert lst["38"]["exemptions"]["HS"] == {"state_amt": 140_000, "local_pct": 20, "local_min": 5_000, "local_amt": 0, "freeze": False}
    assert "HS" not in lst["20"]["exemptions"] and lst["20"]["exemptions"]["OV65"]["local_amt"] == 50_000
    rates = {"38": {"name": "Dripping Springs ISD", "rates": {2024: 1.0576, 2025: 1.0397}}, "20": {"name": "Pflugerville", "rates": {2025: 0.4753}}}
    u = build(rates, lst, 2026, None)
    y = u["38"]["years"]
    assert y["2024"]["hs"] == {"amount": 100_000, "pct": 0.2, "min": 5_000} and not y["2024"]["hs_confirmed"]   # carried-back pct
    assert y["2026"]["hs"]["amount"] == 140_000 and y["2026"]["hs_confirmed"] and y["2026"]["rate"] is None
    z = u["20"]["years"]
    assert z["2025"]["hs"] == {"amount": 0, "pct": 0.0, "min": 0} and z["2025"]["hs_confirmed"]   # no exemption -> can only understate
    assert not z["2024"]["rate_confirmed"] and u["20"]["type"] == "city" and u["38"]["type"] == "isd"
