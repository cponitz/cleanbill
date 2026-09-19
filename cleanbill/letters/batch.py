"""Letter batch: pick leads, verify addresses, render letters, hand them to Lob, record what was mailed (SPEC-11 §3–§4).

    python -m cleanbill.letters.batch --batch 2026-10-05-t1 --tier 1 --n 1000 --variant-split 50 --seed 20261005 --dry-run
    python -m cleanbill.letters.batch --batch proof-2026-09-25 --n 5 --to-override "Name|Line 1|Line 2|City|TX|78701" \\
        --send --confirm-footer "Clean Bill Co."                               # five live proof letters to Charlie
    python -m cleanbill.letters.batch --batch 2026-10-05-t1 --tier 1 --n 1000 --seed 20261005 --send --confirm-footer "Clean Bill Co."
    python -m cleanbill.letters.batch --window-check                            # one test-mode letter; download Lob's render

Runs on the Mac from the repo folder (like cleanbill.etl.publish). Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
LOB_API_KEY (test_… or live_…), LOB_ENABLED (must be "true" for --send with a live key). Everything with a real name —
the CSV, the PDFs — goes under data/out/batches/<batch>/ (git-ignored); the summary prints counts only.

Guard rails no flag can switch off (§3.5): never an estimate_unconfirmed lead (B-18), never a lead that is not `new`
with mailed_at null, never hs_exempt, never address_suppressed, never the synthetic account, never a `CB-TEST-` code,
never an incomplete Texas mailing address, never a prop_id in --exclude-file; and never a live send unless LOB_ENABLED=true,
--send, --confirm-footer equal to brand.LEGAL_NAME, and brand.RETURN_ADDRESS no longer the placeholder.

Resumable: a lead that already has a mail_pieces row for this --batch is skipped, and Lob's Idempotency-Key
(<batch>:<claim_code>) makes a repeated create return the first letter. The mail_pieces row is inserted only after Lob's
200, then the lead is marked mailed — nothing is half-written; on an error after the retries the run stops and prints
the resume command. With --to-override the leads are never touched (mail_pieces.to_override=true).
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import random
import re
import statistics
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable, Protocol

from cleanbill import brand
from cleanbill.estimator.rates import units as rate_units
from cleanbill.letters.generate import LetterData, render_letter
from cleanbill.letters.lob import LetterOptions, LobClient, LobError, Verification, from_address, mode as lob_mode, pdf_sha256

TEST_PROP_ID = 999000001
TEST_CODE_PREFIX = "CB-TEST-"
SITE_BASE = os.environ.get("SITE_BASE", brand.SITE)
BANDS: list[tuple[str, float, float]] = [("100-200k", 100_000, 200_000), ("200-350k", 200_000, 350_000), ("350-500k", 350_000, 500_000),
                                         ("500-750k", 500_000, 750_000), ("750k+", 750_000, float("inf"))]
DEFAULT_EXCLUDE = Path("data/out/exclude.csv")
DEFAULT_OUT = Path("data/out/batches")
PAGE = 1000


# ---- rows -------------------------------------------------------------------------------------------------------------
@dataclass
class Lead:
    """One leads row joined to its property — only the columns the batch needs. Built by `from_row`."""
    id: str
    prop_id: int
    claim_code: str
    tier: int
    status: str
    mailed_at: str | None
    estimate_unconfirmed: bool
    refund_years: list[int]
    est_refund_total: float
    est_refund_by_year: dict
    est_forward_annual: float
    owner_name: str
    owner_addr1: str
    owner_addr2: str
    owner_city: str
    owner_state: str
    owner_zip: str
    situs_full: str
    market_value: float | None
    hs_exempt: bool
    address_suppressed: bool
    # filled by the batch
    band: str = ""
    variant: str = ""
    verification: Verification | None = None

    @classmethod
    def from_row(cls, r: dict) -> "Lead":
        p = r.get("properties") or {}
        z = str(p.get("owner_zip") or "").strip()
        return cls(id=r["id"], prop_id=int(r["prop_id"]), claim_code=r["claim_code"], tier=int(r.get("tier") or 0), status=r.get("status") or "",
                   mailed_at=r.get("mailed_at"), estimate_unconfirmed=bool(r.get("estimate_unconfirmed")), refund_years=list(r.get("refund_years") or []),
                   est_refund_total=float(r.get("est_refund_total") or 0), est_refund_by_year=r.get("est_refund_by_year") or {},
                   est_forward_annual=float(r.get("est_forward_annual") or 0), owner_name=str(p.get("owner_name") or "").strip(),
                   owner_addr1=str(p.get("owner_addr1") or "").strip(), owner_addr2=str(p.get("owner_addr2") or "").strip(),
                   owner_city=str(p.get("owner_city") or "").strip(), owner_state=str(p.get("owner_state") or "").strip().upper(), owner_zip=z,
                   situs_full=str(p.get("situs_full") or ""), market_value=float(p["market_value"]) if p.get("market_value") is not None else None,
                   hs_exempt=bool(p.get("hs_exempt")), address_suppressed=bool(p.get("address_suppressed")))

    @property
    def zip5(self) -> str:
        m = re.match(r"^(\d{5})(?:-?\d{4})?$", self.owner_zip)
        return m.group(1) if m else ""

    def raw_mail_lines(self) -> list[str]:
        return [ln for ln in (self.owner_addr1, self.owner_addr2, f"{self.owner_city} {self.owner_state} {self.zip5}".strip()) if ln]

    def mail_lines(self) -> list[str]:
        return self.verification.mail_lines() if self.verification and self.verification.ok else self.raw_mail_lines()


LEAD_SELECT = ("id, prop_id, claim_code, tier, status, mailed_at, estimate_unconfirmed, refund_years, est_refund_total, est_refund_by_year, "
               "est_forward_annual, properties(owner_name, owner_addr1, owner_addr2, owner_city, owner_state, owner_zip, situs_full, market_value, hs_exempt, address_suppressed)")


# ---- selection (pure, tested) ------------------------------------------------------------------------------------------
def band_of(market_value: float | None) -> str | None:
    if market_value is None: return None
    for name, lo, hi in BANDS:
        if lo <= market_value < hi: return name
    return "<100k"


def exclusion_reason(l: Lead, tier: int, excluded_ids: set[int]) -> str | None:
    """The guard rails of §3.5 — the first reason a lead may not be mailed, or None. No flag switches these off."""
    if l.prop_id == TEST_PROP_ID or l.claim_code.startswith(TEST_CODE_PREFIX): return "test_account"
    if l.tier != tier: return "other_tier"
    if l.status != "new": return f"status_{l.status}"
    if l.mailed_at: return "already_mailed"
    if l.estimate_unconfirmed: return "estimate_unconfirmed"
    if l.hs_exempt: return "hs_exempt"
    if l.address_suppressed: return "address_suppressed"
    if l.prop_id in excluded_ids: return "exclude_file"
    if not (l.owner_addr1 and l.owner_city and l.owner_state == "TX" and l.zip5): return "address_incomplete"
    if not l.owner_name: return "no_owner_name"
    if band_of(l.market_value) is None: return "no_market_value"
    return None


def eligible(rows: Iterable[Lead], tier: int, excluded_ids: set[int]) -> tuple[list[Lead], Counter]:
    kept, why = [], Counter()
    for l in rows:
        r = exclusion_reason(l, tier, excluded_ids)
        if r: why[r] += 1
        else:
            l.band = band_of(l.market_value) or ""
            kept.append(l)
    return kept, why


def allocate(population: Counter, n: int, cap: int | None = None) -> dict[str, int]:
    """Per-band sample sizes proportional to the eligible population (largest-remainder rounding), each ≤ cap and ≤ the band."""
    total = sum(population.values())
    if total == 0 or n <= 0: return {b: 0 for b in population}
    n = min(n, total)
    exact = {b: n * c / total for b, c in population.items()}
    out = {b: int(exact[b]) for b in population}
    for b, _ in sorted(((b, exact[b] - out[b]) for b in population), key=lambda x: (-x[1], x[0])):
        if sum(out.values()) >= n: break
        out[b] += 1
    for b in out:
        out[b] = min(out[b], population[b], cap if cap else out[b])
    return out


def stratified_sample(kept: list[Lead], n: int, seed: int, cap_per_band: int | None = None) -> list[Lead]:
    """A seeded draw whose value-band shares match the eligible population's (±rounding). Input order does not matter:
    leads are sorted by claim code before the shuffle, so the same seed over the same rows gives the same set."""
    by_band: dict[str, list[Lead]] = defaultdict(list)
    for l in kept: by_band[l.band].append(l)
    sizes = allocate(Counter({b: len(v) for b, v in by_band.items()}), n, cap_per_band)
    rng = random.Random(seed)
    out: list[Lead] = []
    for band in sorted(by_band):
        pool = sorted(by_band[band], key=lambda l: l.claim_code)
        rng.shuffle(pool)
        out.extend(pool[:sizes[band]])
    return out


def assign_variants(sample: list[Lead], split_a_pct: int) -> list[Lead]:
    """Interleave A and B along the band-ordered sample so that A's share is split_a_pct (50 → strict alternation);
    because the sample is contiguous by band, every band's own split is within one letter of the target."""
    for i, l in enumerate(sample):
        l.variant = "A" if (i + 1) * split_a_pct // 100 > i * split_a_pct // 100 else "B"
    return sample


def owner_first(owner_name: str) -> str:
    """TCAD's 'DOE JANE & JOHN' → 'Jane'; falls back to 'Homeowner'."""
    first_party = re.split(r"\s*(?:&|\bAND\b)\s*", owner_name.upper(), maxsplit=1)[0]
    tokens = [t for t in re.split(r"[\s,]+", first_party) if t]
    skip = {"JR", "SR", "II", "III", "IV", "MR", "MRS", "MS", "DR", "ET", "AL", "ETAL", "ETUX", "ETVIR", "TRUSTEE", "LIFE", "ESTATE"}
    for t in tokens[1:]:
        t2 = t.strip(".")
        if len(t2) > 1 and t2 not in skip and t2.isalpha(): return t2.capitalize()
    return "Homeowner"


_ALIAS_TO_NAME: dict[str, str] | None = None


def unit_names_for(l: Lead) -> list[str] | None:
    """Display names of the units that owe the refund, from est_refund_by_year's per-unit savings (keys are the entity
    code or its alias). None when the estimate carries no unit breakdown (the letter then names the five Austin units)."""
    global _ALIAS_TO_NAME
    if _ALIAS_TO_NAME is None:
        _ALIAS_TO_NAME = {}
        for cd, u in rate_units().items():
            _ALIAS_TO_NAME[cd] = u.get("name") or cd
            if u.get("alias"): _ALIAS_TO_NAME[u["alias"]] = u.get("name") or cd
    seen: list[str] = []
    for y in sorted(l.est_refund_by_year):
        for k, v in (l.est_refund_by_year[y].get("units") or {}).items():
            if (v or 0) > 0:
                name = _ALIAS_TO_NAME.get(k, k)
                if name not in seen: seen.append(name)
    return seen or None


def letter_data(l: Lead, mail_date: date, to_override: dict | None = None) -> LetterData:
    name = to_override["name"] if to_override else l.owner_name
    lines = ([to_override["line1"]] + ([to_override["line2"]] if to_override.get("line2") else []) + [f"{to_override['city']} {to_override['state']} {to_override['zip']}"]) if to_override else l.mail_lines()
    return LetterData(owner_name=name, owner_first=owner_first(l.owner_name), situs_address=l.situs_full, mail_lines=lines,
                      refund_total=l.est_refund_total, forward_annual=l.est_forward_annual, refund_years=l.refund_years or [date.today().year - 1],
                      claim_code=l.claim_code, claim_url=f"{SITE_BASE}/claim/{l.claim_code}", variant=l.variant or "A", mail_date=mail_date,
                      taxing_units=unit_names_for(l))


# ---- summary (counts only) ---------------------------------------------------------------------------------------------
def summarize(kept: list[Lead], sample: list[Lead], excluded: Counter, unit_cost: float | None) -> dict:
    pop_bands = Counter(l.band for l in kept)
    s_bands = Counter(l.band for l in sample)
    rejected = sum(1 for l in sample if l.verification and not l.verification.ok)
    verified = sum(1 for l in sample if l.verification)
    def shares(c: Counter, total: int, top: int | None = None) -> list[tuple[str, int, float]]:
        items = sorted(c.items(), key=lambda x: (-x[1], x[0]))[:top]
        return [(k, v, round(100 * v / total, 1) if total else 0.0) for k, v in items]
    def unit_counter(ls: list[Lead]) -> Counter:
        c: Counter = Counter()
        for l in ls:
            for u in unit_names_for(l) or ["(five Austin units assumed)"]: c[u] += 1
        return c
    band_rows = []
    for name, _, _ in [("<100k", 0, 0)] + BANDS:
        if pop_bands[name] or s_bands[name]:
            in_band = [l for l in sample if l.band == name]
            band_rows.append({"band": name, "eligible": pop_bands[name], "eligible_pct": round(100 * pop_bands[name] / len(kept), 1) if kept else 0.0,
                              "sample": s_bands[name], "sample_pct": round(100 * s_bands[name] / len(sample), 1) if sample else 0.0,
                              "A": sum(1 for l in in_band if l.variant == "A"), "B": sum(1 for l in in_band if l.variant == "B"),
                              "median_estimate": statistics.median(l.est_refund_total for l in in_band) if in_band else 0.0})
    mailable = len(sample) - rejected
    return {
        "eligible": len(kept), "sample": len(sample), "excluded": dict(sorted(excluded.items())),
        "variants": dict(Counter(l.variant for l in sample)), "bands": band_rows,
        "median_estimate": statistics.median(l.est_refund_total for l in sample) if sample else 0.0,
        "total_estimate": sum(l.est_refund_total for l in sample),
        "cities": shares(Counter(l.owner_city.upper() for l in sample), len(sample), 10),
        "units_sample": shares(unit_counter(sample), len(sample)), "units_eligible": shares(unit_counter(kept), len(kept)),
        "verified": verified, "address_rejected": rejected, "mailable": mailable,
        "estimated_cost": round(mailable * unit_cost, 2) if unit_cost else None,
    }


def format_summary(s: dict, batch: str, mode: str) -> str:
    out = [f"batch {batch} — Lob mode: {mode}", f"eligible {s['eligible']:,} · sample {s['sample']:,} · mailable {s['mailable']:,} · address rejected {s['address_rejected']:,} (verified {s['verified']:,})",
           f"variants: " + ", ".join(f"{k} {v}" for k, v in sorted(s["variants"].items())),
           f"estimate: median ${s['median_estimate']:,.0f} · total ${s['total_estimate']:,.0f}",
           "excluded: " + (", ".join(f"{k} {v:,}" for k, v in s["excluded"].items()) or "none"), "",
           f"{'band':<10}{'eligible':>10}{'%':>7}{'sample':>9}{'%':>7}{'A':>6}{'B':>6}{'median $':>10}"]
    for b in s["bands"]:
        out.append(f"{b['band']:<10}{b['eligible']:>10,}{b['eligible_pct']:>7}{b['sample']:>9,}{b['sample_pct']:>7}{b['A']:>6}{b['B']:>6}{b['median_estimate']:>10,.0f}")
    out += ["", "cities (sample): " + ", ".join(f"{k} {n} ({p}%)" for k, n, p in s["cities"]),
            "taxing units (sample): " + ", ".join(f"{k} {p}%" for k, _, p in s["units_sample"]),
            "taxing units (eligible): " + ", ".join(f"{k} {p}%" for k, _, p in s["units_eligible"]),
            f"estimated cost: " + (f"${s['estimated_cost']:,.2f}" if s["estimated_cost"] is not None else "set --unit-cost from the Lob price list")]
    return "\n".join(out)


# ---- guards (pure, tested) ----------------------------------------------------------------------------------------------
def check_guards(send: bool, dry_run: bool, api_key: str | None, lob_enabled: str | None, confirm_footer: str | None,
                 return_address: dict | None = None) -> str | None:
    """Why the run may not proceed, or None. §3.5: a live key mails only with LOB_ENABLED=true, --send, a matching
    --confirm-footer and a real return address; a test key needs only --send (nothing is printed)."""
    if send and dry_run: return "--send and --dry-run are exclusive"
    if not send: return None
    m = lob_mode(api_key)
    if m == "none": return "--send needs LOB_API_KEY in .env"
    if m == "unknown": return "LOB_API_KEY must start with test_ or live_"
    if m == "live":
        if (lob_enabled or "").strip().lower() != "true": return "live key: LOB_ENABLED must be 'true' in .env"
        if confirm_footer != brand.LEGAL_NAME: return f"live key: --confirm-footer must equal brand.LEGAL_NAME ({brand.LEGAL_NAME!r})"
        if brand.return_address_is_placeholder(return_address): return "live key: brand.RETURN_ADDRESS is still the placeholder (SPEC-11 §7 step 2)"
    return None


def parse_override(s: str | None) -> dict | None:
    """'Name|Line 1|Line 2|City|ST|ZIP' (line 2 may be empty) → the proof recipient."""
    if not s: return None
    parts = [p.strip() for p in s.split("|")]
    if len(parts) != 6 or not all(parts[i] for i in (0, 1, 3, 4, 5)): raise SystemExit("--to-override must be 'Name|Line 1|Line 2|City|ST|ZIP' (line 2 may be empty)")
    return {"name": parts[0], "line1": parts[1], "line2": parts[2], "city": parts[3], "state": parts[4].upper(), "zip": parts[5]}


def read_exclude_file(path: Path | None) -> set[int]:
    if not path or not path.exists(): return set()
    out = set()
    with path.open(newline="") as fh:
        for row in csv.reader(fh):
            for cell in row:
                if cell.strip().isdigit(): out.add(int(cell.strip())); break
    return out


# ---- store -------------------------------------------------------------------------------------------------------------
class Store(Protocol):
    def fetch_leads(self, tier: int) -> list[dict]: ...
    def pieces_for_batch(self, batch: str) -> set[str]: ...
    def insert_piece(self, row: dict) -> None: ...
    def mark_mailed(self, lead_id: str, variant: str, at: str) -> None: ...


class SupabaseStore:
    def __init__(self):
        from supabase import create_client
        self.sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    def fetch_leads(self, tier: int) -> list[dict]:
        rows, i = [], 0
        while True:
            page = (self.sb.table("leads").select(LEAD_SELECT).eq("tier", tier).eq("status", "new").is_("mailed_at", "null")
                    .order("claim_code").range(i, i + PAGE - 1).execute().data)
            rows.extend(page)
            if len(page) < PAGE: return rows
            i += PAGE

    def pieces_for_batch(self, batch: str) -> set[str]:
        out, i = set(), 0
        while True:
            page = self.sb.table("mail_pieces").select("lead_id").eq("batch", batch).range(i, i + PAGE - 1).execute().data
            out.update(r["lead_id"] for r in page if r.get("lead_id"))
            if len(page) < PAGE: return out
            i += PAGE

    def insert_piece(self, row: dict) -> None:
        self.sb.table("mail_pieces").insert(row).execute()

    def mark_mailed(self, lead_id: str, variant: str, at: str) -> None:
        self.sb.table("leads").update({"status": "mailed", "mailed_at": at, "letter_variant": variant}).eq("id", lead_id).execute()


# ---- the run --------------------------------------------------------------------------------------------------------------
@dataclass
class RunResult:
    summary: dict
    created: int = 0
    rejected: int = 0
    skipped: int = 0
    rendered: int = 0
    lob_ids: list[str] = field(default_factory=list)
    stopped: str | None = None


def piece_row(l: Lead, batch: str, status: str, to_override: bool, letter: dict | None, pdf_sha: str | None, to_address: dict | None) -> dict:
    return {"lead_id": l.id, "claim_code": l.claim_code, "batch": batch, "variant": l.variant or None, "status": status, "to_override": to_override,
            "to_address": to_address, "address_verification": l.verification.stored() if l.verification else None, "pdf_sha256": pdf_sha,
            "lob_id": (letter or {}).get("id"), "expected_delivery_date": (letter or {}).get("expected_delivery_date"),
            "events": [{"type": "letter.created", "at": (letter or {}).get("date_created"), "detail": None}] if letter else []}


def run(store: Store, lob: LobClient | None, *, batch: str, tier: int, n: int, seed: int, split: int, cap: int | None, exclude_ids: set[int],
        dry_run: bool, send: bool, verify: bool, to_override: dict | None, out_dir: Path, samples: int, unit_cost: float | None,
        mail_date: date, options: LetterOptions | None = None, log=print) -> RunResult:
    rows = [Lead.from_row(r) for r in store.fetch_leads(tier)]
    kept, excluded = eligible(rows, tier, exclude_ids)
    sample = assign_variants(stratified_sample(kept, n, seed, cap), split)
    done = store.pieces_for_batch(batch) if not dry_run else set()
    res = RunResult(summary={})
    bdir = out_dir / batch
    bdir.mkdir(parents=True, exist_ok=True)
    verify_all = verify and lob is not None
    if verify and lob is None: log("note: LOB_API_KEY not set — addresses not verified (the summary's rejected count is 0 for that reason)")

    for i, l in enumerate(sample):
        if l.id in done: res.skipped += 1; continue
        if verify_all and not to_override:
            l.verification = lob.verify(l.owner_addr1, l.owner_addr2 or None, l.owner_city, l.owner_state, l.zip5)
            if not l.verification.ok:
                res.rejected += 1
                if send: store.insert_piece(piece_row(l, batch, "address_rejected", False, None, None, None))
                continue
        render = send or i < samples
        if not render: continue
        pdf = bdir / f"{l.claim_code}.pdf"
        render_letter(letter_data(l, mail_date, to_override), pdf)
        res.rendered += 1
        if not send: continue
        assert lob is not None
        to = {"name": to_override["name"], "address_line1": to_override["line1"], "address_city": to_override["city"], "address_state": to_override["state"], "address_zip": to_override["zip"], "address_country": "US"} if to_override else l.verification.to_address(l.owner_name) if l.verification else _raw_to(l)
        if to_override and to_override.get("line2"): to["address_line2"] = to_override["line2"]
        try:
            letter = lob.create_letter(pdf, to, from_address(brand.RETURN_ADDRESS), idempotency_key=f"{batch}:{l.claim_code}", description=f"{batch}:{l.claim_code}",
                                       metadata={"claim_code": l.claim_code, "batch": batch, "variant": l.variant, "tier": str(l.tier)}, options=options)
        except LobError as e:
            res.stopped = f"Lob error on {l.claim_code}: {e} — fix, then re-run the same command to resume (done: {res.created})"
            log(res.stopped); break
        store.insert_piece(piece_row(l, batch, "created", bool(to_override), letter, pdf_sha256(pdf), to))
        if not to_override: store.mark_mailed(l.id, l.variant, datetime.now(timezone.utc).isoformat())
        res.created += 1; res.lob_ids.append(str(letter.get("id")))
        if res.created % 50 == 0: log(f"  {res.created} letters created")

    res.summary = summarize(kept, sample, excluded, unit_cost)
    write_csv(sample, bdir / f"{batch}.csv")
    return res


def _raw_to(l: Lead) -> dict:
    d = {"name": l.owner_name[:40], "address_line1": l.owner_addr1, "address_city": l.owner_city, "address_state": l.owner_state, "address_zip": l.zip5, "address_country": "US"}
    if l.owner_addr2: d["address_line2"] = l.owner_addr2
    return d


def write_csv(sample: list[Lead], path: Path) -> Path:
    with path.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["prop_id", "claim_code", "tier", "band", "variant", "owner_city", "zip5", "market_value", "est_refund_total", "units", "deliverability"])
        for l in sample:
            w.writerow([l.prop_id, l.claim_code, l.tier, l.band, l.variant, l.owner_city, l.zip5, l.market_value, l.est_refund_total,
                        "; ".join(unit_names_for(l) or []), l.verification.deliverability if l.verification else ""])
    return path


# ---- address-window check (Lob test mode) ------------------------------------------------------------------------------------
def window_check(lob: LobClient, out_dir: Path, options: LetterOptions | None = None, log=print) -> dict:
    """Render one synthetic letter through Lob test mode and download the rendered PDF and thumbnails so the recipient
    block can be checked against the top_first_page window zone (SPEC-11 §4.1; docs/reports/2026-09-18-lob-proof.md)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf = out_dir / "window-check.pdf"
    d = LetterData(owner_name="PAT OWNER", owner_first="Pat", situs_address="3675 DUVAL ST, AUSTIN, TX 78721", mail_lines=["3675 DUVAL ST", "AUSTIN TX 78721-1234"],
                   refund_total=3712.4, forward_annual=1850, refund_years=[2024, 2025], claim_code="CB-TEST-0001", claim_url=f"{SITE_BASE}/claim/CB-TEST-0001", mail_date=date.today())
    render_letter(d, pdf)
    to = {"name": "PAT OWNER", "address_line1": "3675 DUVAL ST", "address_city": "AUSTIN", "address_state": "TX", "address_zip": "78721", "address_country": "US"}
    letter = lob.create_letter(pdf, to, from_address(brand.RETURN_ADDRESS), idempotency_key=f"window-check:{datetime.now(timezone.utc).isoformat()}",
                               description="window-check:CB-TEST-0001", metadata={"claim_code": "CB-TEST-0001", "batch": "window-check"}, options=options)
    log(f"test letter {letter.get('id')} created; polling for the render")
    for _ in range(20):
        letter = lob.get_letter(letter["id"])
        if letter.get("url") and letter.get("thumbnails"): break
        lob.sleep(3)
    files = []
    if letter.get("url"): files.append(lob.download(letter["url"], out_dir / "lob-render.pdf"))
    for i, t in enumerate(letter.get("thumbnails") or []):
        if t.get("large"): files.append(lob.download(t["large"], out_dir / f"lob-thumb-{i + 1}.png"))
    log("downloaded: " + ", ".join(str(f) for f in files))
    log("check: the recipient block inside the window zone with nothing else in it; every mark ≥ 1/16 in from the edges. Move RECIPIENT_TOP_IN in generate.py if not.")
    return {"id": letter.get("id"), "files": [str(f) for f in files]}


# ---- CLI -----------------------------------------------------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--batch", help="batch name, e.g. 2026-10-05-t1 (also the Lob Idempotency-Key prefix)")
    ap.add_argument("--tier", type=int, default=1)
    ap.add_argument("--n", type=int, default=1000)
    ap.add_argument("--variant-split", type=int, default=50, help="percent of variant A")
    ap.add_argument("--seed", type=int, default=None, help="draw seed; defaults to the batch's digits")
    ap.add_argument("--cap-per-band", type=int, default=None)
    ap.add_argument("--exclude-file", type=Path, default=DEFAULT_EXCLUDE, help="CSV of prop_ids never to mail")
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--samples", type=int, default=10, help="sample PDFs rendered in a dry run")
    ap.add_argument("--unit-cost", type=float, default=None, help="per-letter price from the Lob account (the summary's cost line)")
    ap.add_argument("--mail-date", type=lambda s: date.fromisoformat(s), default=None, help="date printed on the letter (default today)")
    ap.add_argument("--address-placement", default="top_first_page", choices=["top_first_page", "insert_blank_page"])
    ap.add_argument("--dry-run", action="store_true", help="summary, CSV and sample PDFs; nothing written to the database or Lob")
    ap.add_argument("--no-verify", action="store_true", help="skip Lob address verification (dry runs without a key)")
    ap.add_argument("--send", action="store_true", help="create the letters with Lob and record them")
    ap.add_argument("--to-override", default=None, help="'Name|Line 1|Line 2|City|ST|ZIP': every letter goes here (the proof); leads untouched")
    ap.add_argument("--confirm-footer", default=None, help="must equal brand.LEGAL_NAME for a live send")
    ap.add_argument("--window-check", action="store_true", help="one test-mode letter; download Lob's render for the address-window check")
    a = ap.parse_args(argv)

    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    api_key = os.environ.get("LOB_API_KEY")
    m = lob_mode(api_key)
    options = LetterOptions(address_placement=a.address_placement)

    if a.window_check:
        if m != "test": print("--window-check needs a test_ key in LOB_API_KEY (nothing is printed in test mode)"); return 2
        lob = LobClient(api_key)
        try: window_check(lob, a.out_dir / "window-check", options)
        finally: lob.close()
        return 0

    if not a.batch: ap.error("--batch is required")
    if not a.dry_run and not a.send: ap.error("choose --dry-run or --send")
    err = check_guards(a.send, a.dry_run, api_key, os.environ.get("LOB_ENABLED"), a.confirm_footer)
    if err: print(f"refused: {err}"); return 2
    to_override = parse_override(a.to_override)
    seed = a.seed if a.seed is not None else int(re.sub(r"\D", "", a.batch) or "0")
    print(f"Lob mode: {m}{' (LOB_ENABLED=true)' if m == 'live' else ''} · {'DRY RUN' if a.dry_run else 'SEND'}{' · TO-OVERRIDE (leads untouched)' if to_override else ''} · seed {seed}")

    store = SupabaseStore()
    lob = LobClient(api_key) if api_key and m in ("test", "live") else None
    try:
        res = run(store, lob, batch=a.batch, tier=a.tier, n=a.n, seed=seed, split=a.variant_split, cap=a.cap_per_band, exclude_ids=read_exclude_file(a.exclude_file),
                  dry_run=a.dry_run, send=a.send, verify=not a.no_verify, to_override=to_override, out_dir=a.out_dir, samples=a.samples, unit_cost=a.unit_cost,
                  mail_date=a.mail_date or date.today(), options=options)
    finally:
        if lob: lob.close()
    print(format_summary(res.summary, a.batch, m))
    print(f"rendered {res.rendered} PDFs · created {res.created} Lob letters · skipped {res.skipped} already in this batch · CSV + PDFs in {a.out_dir / a.batch}")
    if res.stopped: return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
