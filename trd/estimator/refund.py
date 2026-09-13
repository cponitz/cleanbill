"""Refund math for a late (retroactive) homestead exemption filing, per taxing unit.

Rules encoded (Texas Tax Code):
  §11.431 — a late homestead application is accepted up to two years after the delinquency date
            (Feb 1 of the year after the tax year). Filing in Sep 2026 reaches tax years 2024 and 2025
            as refunds; 2026 is reduced on the bill rather than refunded.
  §11.13   — school HS is a flat state amount (plus any local-option percentage); local units may adopt a
            percentage exemption with a $5,000 minimum, or none at all.
  §11.26/§11.261 — tax ceilings for 65+ (school always; some local units). Ceilings are noted, not modeled.
  §23.23   — the 10% appraisal cap starts the year *after* the first qualifying year; excluded here
            because it adds nothing for a late filer in a flat market and would overstate refunds.

A property's taxing units come from TCAD's PROP_ENT file (property_entities); when the caller does not pass them,
the five Austin units are assumed and the estimate is flagged unconfirmed (SPEC-01).
Everything returns plain dicts so the results can be stored as JSON on the lead row.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Iterable, Sequence

from .rates import DEFAULT_UNITS, TAX_YEARS, taxing_units, unit_key, unit_name, year_rule


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


def hs_exemption(rule: dict, value: float) -> float:
    """HS exemption for a unit-year rule {"amount", "pct", "min"} on appraised value `value`."""
    amt = float(rule.get("amount", 0) or 0)
    if rule.get("pct"):
        amt += max(rule["pct"] * value, float(rule.get("min", 0) or 0))
    return min(amt, value)


def savings_by_entity(value: float, year: int, over65: bool = False, units: Sequence[str] | None = None) -> dict:
    """Annual tax savings from HS (and optionally OV65) for one tax year, by taxing unit.

    `value` is the appraised (market) value for that year; `units` the property's TCAD entity codes (None = the
    five Austin units, flagged unconfirmed). Returns {"entities": {key: {...}}, "total", "unconfirmed_entities", ...}
    where key is the unit's alias (AISD, CITY, COUNTY, ACC, CENTRAL_HEALTH) or its entity code.
    Exemption stacking: OV65 applies to the value remaining after HS. Units with no rule for the year, or with
    a rate but no data, are listed in `unconfirmed_entities` and contribute $0 (never overstate).
    """
    assumed = units is None
    codes = taxing_units(list(DEFAULT_UNITS) if assumed else list(units))
    out, total, unconfirmed = {}, 0.0, []
    for cd in codes:
        rule = year_rule(cd, year)
        key = unit_key(cd)
        if not rule or rule.get("rate") is None:
            unconfirmed.append(key)
            out[key] = {"name": unit_name(cd), "entity_cd": cd, "rate_per_100": None, "hs_exemption": 0.0, "hs_savings": 0.0,
                        "ov65_exemption": 0.0, "ov65_savings": 0.0, "savings": 0.0, "ceiling": None, "confirmed": False}
            continue
        rate = rule["rate"] / 100.0
        hs_amt = hs_exemption(rule["hs"], value)
        ov_amt = min(float(rule.get("ov65") or 0), max(value - hs_amt, 0.0)) if over65 else 0.0
        hs_sav, ov_sav = round(hs_amt * rate, 2), round(ov_amt * rate, 2)
        confirmed = bool(rule.get("rate_confirmed") and rule.get("hs_confirmed") and (not over65 or rule.get("ov65_confirmed")))
        out[key] = {"name": unit_name(cd), "entity_cd": cd, "rate_per_100": rule["rate"], "hs_exemption": round(hs_amt, 2), "hs_savings": hs_sav,
                    "ov65_exemption": round(ov_amt, 2), "ov65_savings": ov_sav, "savings": round(hs_sav + ov_sav, 2),
                    "ceiling": rule.get("ceiling"), "confirmed": confirmed}
        total += hs_sav + ov_sav
        if not confirmed:
            unconfirmed.append(key)
    if assumed:
        unconfirmed.append("units_assumed")
    return {"year": year, "value": value, "over65": over65, "entities": out, "total": round(total, 2), "unconfirmed_entities": unconfirmed}


@dataclass
class RefundEstimate:
    filing_date: date
    value: float
    over65: bool
    refund_years: list[int]
    units: list[str] | None = None
    by_year: dict = field(default_factory=dict)
    refund_total: float = 0.0
    forward_annual: float = 0.0
    unconfirmed: bool = False

    def units_by_year(self) -> dict:
        """The compact per-year, per-unit breakdown stored on leads.est_refund_by_year (SPEC-01 §5)."""
        return {str(y): {"total": s["total"], "units": {k: e["savings"] for k, e in s["entities"].items()}} for y, s in self.by_year.items()}

    def unit_names(self) -> list[str]:
        """Display names of the units that actually contribute HS savings (for the letter's §41.0051(b) block)."""
        seen: list[str] = []
        for s in self.by_year.values():
            for e in s["entities"].values():
                if e["savings"] > 0 and e["name"] not in seen:
                    seen.append(e["name"])
        return seen

    def as_dict(self) -> dict:
        return {"filing_date": self.filing_date.isoformat(), "value": self.value, "over65": self.over65, "refund_years": self.refund_years,
                "units": self.units, "by_year": self.by_year, "refund_total": self.refund_total, "forward_annual": self.forward_annual,
                "unconfirmed": self.unconfirmed}


def estimate_refund(value: float, filing_date: date, owned_since: date | None = None, over65: bool = False,
                    values_by_year: dict[int, float] | None = None, units: Sequence[str] | None = None) -> RefundEstimate:
    """Total retroactive refund plus forward annual savings for a never-filed homestead.

    `units` are the property's TCAD entity codes from PROP_ENT; None assumes the five Austin units and flags the
    estimate unconfirmed. `values_by_year` lets you pass the actual appraised value for each prior year when you have
    it (property_values); otherwise the current value is used for every year (the letter rounds down anyway).
    """
    years = refundable_tax_years(filing_date, owned_since)
    est = RefundEstimate(filing_date=filing_date, value=value, over65=over65, refund_years=years, units=list(units) if units is not None else None)
    for y in years:
        v = (values_by_year or {}).get(y, value)
        s = savings_by_entity(v, y, over65, units)
        est.by_year[y] = s
        est.refund_total += s["total"]
        est.unconfirmed = est.unconfirmed or bool(s["unconfirmed_entities"])
    est.refund_total = round(est.refund_total, 2)
    est.unconfirmed = est.unconfirmed or units is None   # units unknown -> the forward figure is assumed too
    latest = max(TAX_YEARS)  # forward-looking annual savings at the latest rate table we have
    est.forward_annual = savings_by_entity(value, latest, over65, units)["total"]
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
    return {"n": n, "mean": round(sum(totals) / n, 2), "p25": pct(0.25), "median": pct(0.5), "p75": pct(0.75), "min": totals[0], "max": totals[-1]}
