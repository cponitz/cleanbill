"""Python mirror of supabase/functions/_shared/validate.ts — same rules, same outputs.
Keep the two in sync: both read tests/fixtures/cases.json and tests/fixtures/findings_snapshot.json pins identical rendered
findings (G-9). Validators emit CODES + facts; every sentence comes from the rule table in cleanbill/findings.py (ADR 0016).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from cleanbill.findings import blocking, make_finding, reason_text  # noqa: F401  (re-exported for callers)

SUFFIX = {
    "STREET": "ST", "ST": "ST", "AVENUE": "AVE", "AV": "AVE", "AVE": "AVE", "BOULEVARD": "BLVD", "BLVD": "BLVD", "DRIVE": "DR", "DR": "DR",
    "ROAD": "RD", "RD": "RD", "LANE": "LN", "LN": "LN", "COURT": "CT", "CT": "CT", "CIRCLE": "CIR", "CIR": "CIR", "PLACE": "PL", "PL": "PL",
    "TRAIL": "TRL", "TRL": "TRL", "PARKWAY": "PKWY", "PKWY": "PKWY", "WAY": "WAY", "TERRACE": "TER", "TER": "TER", "COVE": "CV", "CV": "CV",
    "LOOP": "LOOP", "PASS": "PASS", "PATH": "PATH", "RUN": "RUN", "HIGHWAY": "HWY", "HWY": "HWY", "NORTH": "N", "N": "N", "SOUTH": "S", "S": "S",
    "EAST": "E", "E": "E", "WEST": "W", "W": "W",
}
UNIT_WORDS = {"APT", "UNIT", "STE", "SUITE", "#", "BLDG", "LOT"}
SUFFIX_VALUES = set(SUFFIX.values())


def normalize_street(s: str) -> tuple[str, list[str], str]:
    raw = re.sub(r"\s+", " ", (s or "").upper().replace(".", " ").replace(",", " ").replace("#", " # ")).strip()
    parts = [p for p in raw.split(" ") if p]
    num, unit, tokens = "", "", []
    i = 0
    while i < len(parts):
        p = parts[i]
        if not num and re.fullmatch(r"\d+[A-Z]?", p):
            num = re.sub(r"[A-Z]$", "", p); i += 1; continue
        if p in UNIT_WORDS:
            unit = (parts[i + 1] if i + 1 < len(parts) else "").lstrip("#"); i += 2; continue
        tokens.append(SUFFIX.get(p, p)); i += 1
    return num, tokens, unit


def address_matches(id_line1: str, id_zip: str, prop: dict) -> bool:
    a_num, a_tok, a_unit = normalize_street(id_line1)
    if prop.get("situs_num"):
        situs_line = f"{prop['situs_num']} {prop.get('situs_street') or ''} {('UNIT ' + prop['situs_unit']) if prop.get('situs_unit') else ''}"
    else:
        situs_line = prop["situs_full"].split(",")[0]
    b_num, b_tok, b_unit = normalize_street(situs_line)
    if not a_num or a_num != b_num:
        return False
    an = [t for t in a_tok if t not in SUFFIX_VALUES or len(t) > 2]
    bn = [t for t in b_tok if t not in SUFFIX_VALUES or len(t) > 2]
    if not an or not bn or an[0] != bn[0]:
        return False
    zip_a = (id_zip or "")[:5]
    zip_b = (prop.get("situs_zip") or "")[:5] or (re.search(r"\b(\d{5})\b", prop["situs_full"] or "") or [None, ""])[1]
    if zip_a and zip_b and zip_a != zip_b:
        return False
    if b_unit and a_unit and a_unit != b_unit:
        return False
    return True


def _name_tokens(s: str) -> list[str]:
    return [t for t in re.sub(r"[^A-Z &]", " ", (s or "").upper()).split() if t and t != "&" and len(t) > 1]


def name_matches(first: str, last: str, owner_name: str) -> bool:
    toks = _name_tokens(owner_name)
    L = re.sub(r"[^A-Z]", "", (last or "").upper()); F = re.sub(r"[^A-Z]", "", (first or "").upper())
    if not L or not F:
        return False
    last_ok = any(re.sub(r"[^A-Z]", "", t) == L for t in toks) or L in "".join(toks)
    first_ok = any(re.sub(r"[^A-Z]", "", t) == F or (len(t) >= 3 and F.startswith(t)) or (len(F) >= 3 and t.startswith(F)) for t in toks)
    return last_ok and first_ok


def age_on(dob: str, on: date | None = None) -> int | None:
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", dob or "")
    if not m:
        return None
    on = on or date.today()
    b = date(int(m[1]), int(m[2]), int(m[3]))
    a = on.year - b.year - ((on.month, on.day) < (b.month, b.day))
    return a


@dataclass
class Validation:
    status: str
    address_match: bool
    name_match: bool
    texas_id: bool
    expired: bool
    age: int | None
    over65: bool
    findings: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return self.__dict__.copy()


def validate(ex: dict, prop: dict, typed_name: str, today: date | None = None) -> Validation:
    today = today or date.today()
    texas = (ex.get("issuing_state") or "").upper() == "TX" and ex.get("id_type") != "other"
    addr = address_matches(ex.get("address_line1", ""), ex.get("zip", ""), prop)
    nm = name_matches(ex.get("first_name", ""), ex.get("last_name", ""), prop["owner_name"])
    signer_ok = name_matches(ex.get("first_name", ""), ex.get("last_name", ""), typed_name)
    age = age_on(ex.get("dob", ""), today)
    expired = bool(ex.get("expiry")) and ex["expiry"] < today.isoformat()
    conf = ex.get("confidence") or {}
    low_conf = min(conf.get("name", 0), conf.get("address", 0), conf.get("dob", 0)) < 0.6

    id_name = f"{ex.get('first_name') or ''} {ex.get('last_name') or ''}"
    id_address = f"{ex.get('address_line1') or ''}, {ex.get('city') or ''} {ex.get('zip') or ''}"

    findings: list[dict] = []
    add = lambda code, detail=None: findings.append(make_finding(code, detail))  # noqa: E731
    if not ex.get("readable", True): add("not_readable")
    if not texas: add("not_texas_id", {"issuing_state": ex.get("issuing_state"), "id_type": ex.get("id_type")})
    if not addr: add("address_mismatch", {"id": id_address, "situs": prop["situs_full"]})
    else: add("address_match")
    if not nm: add("name_mismatch", {"id": id_name, "owner": prop["owner_name"]})
    else: add("name_match")
    if not signer_ok: add("signer_mismatch", {"id": id_name, "typed": typed_name})
    if expired: add("expired", {"expiry": ex.get("expiry")})
    if low_conf: add("low_confidence", {"confidence": conf})
    if age is not None and age >= 65: add("over_65", {"age": age})
    if age is not None and age < 18: add("under_18", {"age": age})

    status = "ready_to_submit"
    if not ex.get("readable", True) or not texas or not nm or not signer_ok or low_conf or (age is not None and age < 18):
        status = "needs_review"
    elif not addr:
        status = "needs_dl_update"
    return Validation(status, addr, nm, texas, expired, age, age is not None and age >= 65, findings)
