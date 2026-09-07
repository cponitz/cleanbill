"""Refund math for a late (retroactive) homestead exemption filing.

Rules encoded (Texas Tax Code):
  §11.431 — a late homestead application is accepted up to two years after the delinquency date
            (Feb 1 of the year after the tax year). Filing in Sep 2026 reaches tax years 2024 and 2025
            as refunds; 2026 is reduced on the bill rather than refunded.
  §11.13   — school HS is a flat amount; local units may adopt a percentage exemption with a $5,000 minimum.
  §11.26/§11.261 — tax ceilings for 65+ (school always; ACC adopted). Ceilings are noted, not modeled.
  §23.23   — the 10% appraisal cap starts the year *after* the first qualifying year; excluded here
            because it adds nothing for a late filer in a flat market and would overstate refunds.

Everything returns plain dicts so the results can be stored as JSON on the lead row.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Iterable

from .rates import ENTITIES, TAX_YEARS


def delinquency_date(tax_year: int) -> date:
    """Taxes for a tax year become delinquent Feb 1 of the following year (§31.02)."""
    return date(tax_year + 1, 2, 1)


def late_filing_deadline(tax_year: int) -> date:
    """Last day a late homestead application is accepted for that tax year (§11.431: 2 years after delinquency)."""
    d = delinquency_date(tax_year)
    return date(d.year + 2, d.month, d.day)


def refundable_tax_years(filing_date: date, owned_since: date | None = None) -> list[int]:
    """Prior tax years that would produce a *refund* if the application is filed on `filing_date`.

    A year qualifies when (a) its late-filing deadline has not passed, (b) it is before the filing
    year (the current year is a bill reduction, not a refund), and (c) the owner owned and occupied
    the home on Jan 1 of that year (§11.13 / §11.42 — a Jan-1 ownership test; we use deed date as proxy).
    """
    years = []
    for y in range(filing_date.year - 3, filing_date.year):
        if filing_date > late_filing_deadline(y):
            continue
        if owned_since is not None and owned_since > date(y, 1, 1):
            continue
        years.append(y)
    return years


def _exemption_amount(entity: dict, kind: str, year: int, value: float) -> float:
    if kind == "hs":
        spec = entity["hs"]
        if spec["type"] == "amount":
            return min(spec[year], value)
        return min(max(spec["pct"] * value, spec["min"]), value)
    if kind == "ov65":
        return min(entity["ov65"][year], value)
    raise ValueError(kind)


def savings_by_entity(value: float, year: int, over65: bool = False) -> dict:
    """Annual tax savings from HS (and optionally OV65) for one tax year, by taxing unit.

    `value` is the appraised (market) value for that year. Returns {entity_key: {...}} plus a total.
    Exemption stacking: OV65 applies to the value remaining after HS.
    """
    if year not in TAX_YEARS:
        raise ValueError(f"no rate table for tax year {year}; have {TAX_YEARS}")
    out, total, unconfirmed = {}, 0.0, []
    for key, ent in ENTITIES.items():
        rate = ent["rate"][year] / 100.0
        hs_amt = _exemption_amount(ent, "hs", year, value)
        ov_amt = _exemption_amount(ent, "ov65", year, max(value - hs_amt, 0.0)) if over65 else 0.0
        hs_sav = round(hs_amt * rate, 2)
        ov_sav = round(ov_amt * rate, 2)
        out[key] = {
            "name": ent["name"],
            "rate_per_100": ent["rate"][year],
            "hs_exemption": round(hs_amt, 2),
            "hs_savings": hs_sav,
            "ov65_exemption": round(ov_amt, 2),
            "ov65_savings": ov_sav,
            "savings": round(hs_sav + ov_sav, 2),
            "ceiling": ent["ceiling"],
        }
        total += hs_sav + ov_sav
        if not ent["confirmed"]["hs"] or (over65 and not ent["confirmed"]["ov65"]):
            unconfirmed.append(key)
    return {"year": year, "value": value, "over65": over65, "entities": out,
            "total": round(total, 2), "unconfirmed_entities": unconfirmed}


@dataclass
class RefundEstimate:
    filing_date: date
    value: float
    over65: bool
    refund_years: list[int]
    by_year: dict = field(default_factory=dict)
    refund_total: float = 0.0
    forward_annual: float = 0.0
    unconfirmed: bool = False

    def as_dict(self) -> dict:
        return {
            "filing_date": self.filing_date.isoformat(),
            "value": self.value,
            "over65": self.over65,
            "refund_years": self.refund_years,
            "by_year": self.by_year,
            "refund_total": self.refund_total,
            "forward_annual": self.forward_annual,
            "unconfirmed": self.unconfirmed,
        }


def estimate_refund(value: float, filing_date: date, owned_since: date | None = None,
                    over65: bool = False, values_by_year: dict[int, float] | None = None) -> RefundEstimate:
    """Total retroactive refund plus forward annual savings for a never-filed homestead.

    `values_by_year` lets you pass the actual appraised value for each prior year when you have it
    (TCAD's prior-year EARS files); otherwise the current value is used for every year (flagged
    conservative-ish in a flat market; the letter rounds down anyway).
    """
    years = refundable_tax_years(filing_date, owned_since)
    est = RefundEstimate(filing_date=filing_date, value=value, over65=over65, refund_years=years)
    for y in years:
        v = (values_by_year or {}).get(y, value)
        s = savings_by_entity(v, y, over65)
        est.by_year[y] = s
        est.refund_total += s["total"]
        est.unconfirmed = est.unconfirmed or bool(s["unconfirmed_entities"])
    est.refund_total = round(est.refund_total, 2)
    # forward-looking annual savings at the latest rate table we have
    latest = max(TAX_YEARS)
    est.forward_annual = savings_by_entity(value, latest, over65)["total"]
    return est


def conservative_display(amount: float, floor_to: int = 100) -> int:
    """Round *down* to the nearest $100 for anything shown to a homeowner — never overstate."""
    return int(amount // floor_to * floor_to)


def summarize(values: Iterable[float], filing_date: date) -> dict:
    """Quick distribution summary for a batch of lead values (used in the Gate-1 report)."""
    totals = [estimate_refund(v, filing_date).refund_total for v in values]
    totals.sort()
    n = len(totals)
    if n == 0:
        return {"n": 0}
    pct = lambda p: totals[min(n - 1, int(p * n))]  # noqa: E731
    return {"n": n, "mean": round(sum(totals) / n, 2), "p25": pct(0.25), "median": pct(0.5),
            "p75": pct(0.75), "min": totals[0], "max": totals[-1]}
