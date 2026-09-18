"""Lob client for the letter batch (SPEC-11 §4.1): address verification, letter creation, letter lookup.

Two calls, both plain HTTPS with the API key as the Basic-auth user name:

  POST https://api.lob.com/v1/us_verifications   {primary_line, secondary_line, city, state, zip_code}
       -> {deliverability, primary_line, secondary_line, last_line, components{city, state, zip_code, zip_code_plus_4, …}}
  POST https://api.lob.com/v1/letters             multipart: file (the PDF) + to[…] / from[…] inline + options
       header Idempotency-Key: <batch>:<claim_code>   -> {id: "ltr_…", url, expected_delivery_date, thumbnails[], …}

Mode comes from the key prefix: `test_…` renders and charges nothing (letters are viewable in the dashboard, never
printed); `live_…` prints and mails. `mode()` is printed on the batch's first line and drives the guard rails in batch.py.
Throttle: at most REQUESTS_PER_SECOND calls per second; 429 honours Retry-After; 5xx and connection errors retry with
backoff up to RETRIES times, then LobError stops the run (batch.py prints the resume command). No real name or address
is ever logged: errors carry Lob's message and the claim code only.

Tests use a `FakeTransport` (tests/test_batch.py) — no network in CI.
"""
from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import httpx

BASE_URL = "https://api.lob.com/v1"
REQUESTS_PER_SECOND = 5
RETRIES = 3
TIMEOUT_S = 30.0
DELIVERABLE = ("deliverable", "deliverable_unnecessary_unit")
REJECTED = ("deliverable_incorrect_unit", "deliverable_missing_unit", "undeliverable")


class LobError(RuntimeError):
    def __init__(self, message: str, status: int = 0, body: Any = None):
        super().__init__(message)
        self.status = status
        self.body = body


def mode(api_key: str | None) -> str:
    """'live' | 'test' | 'none' from the key prefix."""
    if not api_key: return "none"
    if api_key.startswith("live_"): return "live"
    if api_key.startswith("test_"): return "test"
    return "unknown"


def pdf_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@dataclass
class Verification:
    """The parts of Lob's us_verifications response the batch keeps."""
    deliverability: str
    primary_line: str
    secondary_line: str
    last_line: str
    city: str
    state: str
    zip_code: str
    zip_plus_4: str
    raw: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.deliverability in DELIVERABLE

    def mail_lines(self) -> list[str]:
        """The envelope lines under the owner name (Lob's standardised components)."""
        return [ln for ln in (self.primary_line, self.secondary_line, self.last_line) if ln]

    def to_address(self, name: str) -> dict:
        """Lob's inline `to` object, built from the verified components (never from the roll's raw address)."""
        z = f"{self.zip_code}-{self.zip_plus_4}" if self.zip_plus_4 else self.zip_code
        d = {"name": name[:40], "address_line1": self.primary_line, "address_city": self.city, "address_state": self.state, "address_zip": z, "address_country": "US"}
        if self.secondary_line: d["address_line2"] = self.secondary_line
        return d

    @classmethod
    def from_response(cls, r: dict) -> "Verification":
        comp = r.get("components") or {}
        return cls(deliverability=str(r.get("deliverability") or "undeliverable"), primary_line=str(r.get("primary_line") or ""),
                   secondary_line=str(r.get("secondary_line") or ""), last_line=str(r.get("last_line") or ""),
                   city=str(comp.get("city") or ""), state=str(comp.get("state") or ""), zip_code=str(comp.get("zip_code") or ""),
                   zip_plus_4=str(comp.get("zip_code_plus_4") or ""), raw=r)

    def stored(self) -> dict:
        """What goes into mail_pieces.address_verification: the verdict and Lob's analysis, not the raw input echo."""
        return {"deliverability": self.deliverability, "deliverability_analysis": self.raw.get("deliverability_analysis"),
                "lob_confidence_score": self.raw.get("lob_confidence_score"), "id": self.raw.get("id")}


@dataclass
class LetterOptions:
    color: bool = False
    double_sided: bool = False
    address_placement: str = "top_first_page"     # or insert_blank_page (an extra sheet — only if the layout cannot fit)
    mail_type: str = "usps_first_class"
    use_type: str = "marketing"                    # §41.0051: an advertisement


class Throttle:
    def __init__(self, per_second: float = REQUESTS_PER_SECOND, sleep: Callable[[float], None] = time.sleep, clock: Callable[[], float] = time.monotonic):
        self.interval = 1.0 / per_second
        self.sleep = sleep
        self.clock = clock
        self._last: float | None = None

    def wait(self) -> None:
        now = self.clock()
        gap = (self._last + self.interval - now) if self._last is not None else 0.0
        if gap > 0:
            self.sleep(gap)
            now = self.clock()
        self._last = now


class LobClient:
    def __init__(self, api_key: str, base_url: str = BASE_URL, transport: httpx.BaseTransport | None = None, sleep: Callable[[float], None] = time.sleep,
                 throttle: Throttle | None = None):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.sleep = sleep
        self.throttle = throttle or Throttle(sleep=sleep)
        self._client = httpx.Client(auth=(api_key, ""), timeout=TIMEOUT_S, transport=transport)
        self.calls = 0

    @property
    def mode(self) -> str:
        return mode(self.api_key)

    def close(self) -> None:
        self._client.close()

    # ---- transport with throttle + retries --------------------------------------------------------------------------
    def _request(self, method: str, path: str, **kw) -> dict:
        url = f"{self.base_url}/{path.lstrip('/')}"
        last: LobError | None = None
        for attempt in range(RETRIES + 1):
            self.throttle.wait()
            self.calls += 1
            try:
                r = self._client.request(method, url, **kw)
            except (httpx.TransportError, httpx.TimeoutException) as e:
                last = LobError(f"{method} {path}: {type(e).__name__}")
                self.sleep(2 ** attempt); continue
            if r.status_code == 429:
                ra = r.headers.get("retry-after")
                self.sleep(float(ra) if ra and ra.replace(".", "", 1).isdigit() else 2 ** attempt)
                last = LobError(f"{method} {path}: rate limited (429)", 429); continue
            if r.status_code >= 500:
                last = LobError(f"{method} {path}: http {r.status_code}", r.status_code); self.sleep(2 ** attempt); continue
            body = r.json() if r.content else {}
            if r.status_code >= 400:
                msg = (body.get("error") or {}).get("message") if isinstance(body, dict) else None
                raise LobError(f"{method} {path}: http {r.status_code} — {msg or 'error'}", r.status_code, body)
            return body
        raise last or LobError(f"{method} {path}: gave up")

    # ---- endpoints ------------------------------------------------------------------------------------------------------
    def verify(self, addr1: str, addr2: str | None, city: str, state: str, zip_code: str) -> Verification:
        body = {"primary_line": addr1, "city": city, "state": state, "zip_code": zip_code[:5]}
        if addr2: body["secondary_line"] = addr2
        return Verification.from_response(self._request("POST", "/us_verifications", json=body))

    def create_letter(self, pdf: Path, to: dict, from_addr: dict, idempotency_key: str, description: str, metadata: dict[str, str],
                      options: LetterOptions | None = None) -> dict:
        o = options or LetterOptions()
        data: dict[str, str] = {"description": description[:255], "color": _b(o.color), "double_sided": _b(o.double_sided),
                                "address_placement": o.address_placement, "mail_type": o.mail_type, "use_type": o.use_type}
        for k, v in to.items(): data[f"to[{k}]"] = str(v)
        for k, v in from_addr.items(): data[f"from[{k}]"] = str(v)
        for k, v in metadata.items(): data[f"metadata[{k}]"] = str(v)[:500]
        with pdf.open("rb") as fh:
            return self._request("POST", "/letters", data=data, files={"file": (pdf.name, fh, "application/pdf")},
                                 headers={"Idempotency-Key": idempotency_key[:256]})

    def get_letter(self, lob_id: str) -> dict:
        return self._request("GET", f"/letters/{lob_id}")

    def download(self, url: str, out: Path) -> Path:
        """Fetch a signed Lob URL (the rendered PDF or a thumbnail) to disk — the address-window check."""
        r = httpx.get(url, timeout=TIMEOUT_S, follow_redirects=True)
        r.raise_for_status()
        out.write_bytes(r.content)
        return out


def from_address(ret: dict) -> dict:
    """brand.RETURN_ADDRESS -> Lob's inline `from` object."""
    d = {"name": ret["name"][:40], "address_line1": ret["line1"], "address_city": ret["city"], "address_state": ret["state"], "address_zip": ret["zip"], "address_country": "US"}
    if ret.get("line2"): d["address_line2"] = ret["line2"]
    return d


def _b(v: bool) -> str:
    return "true" if v else "false"
