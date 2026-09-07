"""Tax rates and exemption amounts for the five taxing units on a City-of-Austin / Austin ISD tax bill.

All rates are per $100 of taxable value. Amounts are dollars.
`confirmed` marks figures verified against a primary source (see `source`); unconfirmed
figures are best estimates and are flagged in the estimator output so the letter can round
conservatively. Update this file once TCAD's per-entity exemption listing for each year is in hand.

Glossary:
  HS    — general residence homestead exemption
  OV65  — additional exemption for owners age 65+ (disabled-person exemption uses the same local amounts)
  pct   — a percentage-of-value exemption (Tax Code §11.13(n)), subject to a $5,000 minimum
  ceiling — the taxing unit freezes the 65+ owner's tax at the qualifying-year amount (school districts always; ACC adopted one)
"""

TAX_YEARS = (2024, 2025)

ENTITIES = {
    "AISD": {
        "name": "Austin Independent School District",
        "rate": {2024: 0.9505, 2025: 0.9252},
        "hs": {"type": "amount", 2024: 100_000, 2025: 140_000},
        "ov65": {2024: 35_000, 2025: 85_000},  # state $10K→$60K (Prop 11, 2025) + AISD local $25K
        "ceiling": True,
        "confirmed": {"rate": True, "hs": True, "ov65": False},
        "source": "austinisd.org/budget/taxes-debt; Texas Prop 13 & Prop 11 (Nov 2025); TCAD 2026 exemption listing (AISD local $25K)",
    },
    "CITY": {
        "name": "City of Austin",
        "rate": {2024: 0.4776, 2025: 0.524017},
        "hs": {"type": "pct", "pct": 0.20, "min": 5_000},
        "ov65": {2024: 154_000, 2025: 192_000},
        "ceiling": False,
        "confirmed": {"rate": True, "hs": True, "ov65": True},
        "source": "austintexas.gov/page/tax-rates; Community Impact 5/29/2024 ($124K→$154K for TY2024); Community Impact 6/3/2026 ($192K→$204K for TY2026)",
    },
    "COUNTY": {
        "name": "Travis County",
        "rate": {2024: 0.344445, 2025: 0.375845},
        "hs": {"type": "pct", "pct": 0.20, "min": 5_000},
        "ov65": {2024: 135_000, 2025: 143_220},  # 2024 figure is an estimate; 2025 from TCAD listing
        "ceiling": False,
        "confirmed": {"rate": True, "hs": True, "ov65": False},
        "source": "traviscountytx.gov/planning-budget/tc-taxpayer-statement; TCAD 2026 exemption listing",
    },
    "ACC": {
        "name": "Austin Community College District",
        "rate": {2024: 0.1013, 2025: 0.1034},
        "hs": {"type": "pct", "pct": 0.01, "min": 5_000},
        "ov65": {2024: 75_000, 2025: 75_000},
        "ceiling": True,
        "confirmed": {"rate": True, "hs": True, "ov65": True},
        "source": "offices.austincc.edu/finance-and-administration/property-taxes/",
    },
    "CENTRAL_HEALTH": {
        "name": "Central Health (Travis County Healthcare District)",
        "rate": {2024: 0.107969, 2025: 0.118023},
        "hs": {"type": "pct", "pct": 0.20, "min": 5_000},
        "ov65": {2024: 150_000, 2025: 185_200},  # both flagged; confirm against TCAD listing
        "ceiling": False,
        "confirmed": {"rate": True, "hs": True, "ov65": False},
        "source": "centralhealth.net FY25/FY26 budget books; KUT 9/24/2024 (~10.8¢ rate)",
    },
}

# TCAD's published benchmark used as a sanity check in tests:
# "In 2025, having a homestead exemption saved the average Travis County property owner $3,663."
# (traviscad.org news, Jan 2026). Note: that figure includes the 10% appraisal-cap effect on
# long-held homes, which this estimator deliberately excludes for late filers.
TCAD_AVG_HS_SAVINGS_2025 = 3_663
