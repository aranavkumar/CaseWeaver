"""Deterministic observation extraction from evidence text.

Every Observation records the exact source passage and (when available) char
offsets, so a finding can always be traced back to its originating evidence.
Nothing here is model-inferred: provenance is 'direct'.
"""
from __future__ import annotations

import re
from datetime import datetime

from ..db import repo
from ..util import new_id, find_offset
from ..schemas import EvidenceItem, Observation

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
URL_RE = re.compile(r"https?://[\w.-]+(?:/[\w./?=&%#-]*)?")
# identifier-like token: uppercase start, contains digits, may be hyphenated.
# NOT IGNORECASE — otherwise the capture class would swallow lowercase word tails.
REF_RE = re.compile(r"\b[A-Z](?:[A-Z0-9-]*\d)[A-Z0-9-]*\b")
AMOUNT_RE = re.compile(r"(?:[$₹€£]\s?\d[\d,]*(?:\.\d{1,2})?|\bUSD\s?\d[\d,]*(?:\.\d{1,2})?)")
# phone: strict grouping so ISO dates/timestamps are not mistaken for numbers
PHONE_RE = re.compile(r"(?<![\d-])\+?\d{1,3}[ .()]?\d{3}[ .()-]?\d{4}(?![\d-])")
# ISO-ish or human dates
DATE_RE = re.compile(
    r"\b(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)"
    r"|\b(\d{1,2}\s+\w+\s+\d{4}(?:,?\s+\d{1,2}:\d{2}\s*[AP]M)?)",
    re.IGNORECASE,
)
LABELLED_NAME_RE = re.compile(
    r"(?:from|seller|buyer|contact|user)\s*[:=]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
)

_FIELD_PATTERNS: list[tuple[str, str]] = [
    ("email", "email address"),
    ("url", "URL"),
    ("amount", "amount"),
    ("transaction_ref", "reference"),
    ("date", "date"),
    ("person", "name"),
]


def extract_for_item(item: EvidenceItem) -> list[Observation]:
    """Extract direct observations from one evidence item's derived text."""
    text = item.derived_text or ""
    if not text.strip():
        return []
    obs: list[Observation] = []
    seen: set[tuple[str, str]] = set()

    def emit(field_type: str, value: str, passage: str = ""):
        value = value.strip()
        key = (field_type, value)
        if not value or key in seen:
            return
        seen.add(key)
        start, end = find_offset(text, passage or value)
        obs.append(
            Observation(
                id=new_id("obs"),
                case_id=item.case_id,
                evidence_id=item.id,
                field_type=field_type,
                value=value,
                source_passage=(passage or value)[:300],
                extraction_method="regex",
                provenance="direct",
                confidence=1.0,
                char_start=start,
                char_end=end,
            )
        )

    for m in EMAIL_RE.finditer(text):
        emit("email", m.group(0))
    for m in URL_RE.finditer(text):
        emit("url", m.group(0))
    for m in AMOUNT_RE.finditer(text):
        emit("amount", m.group(0))
    for m in REF_RE.finditer(text):
        emit("transaction_ref", m.group(0))
    for m in DATE_RE.finditer(text):
        val = m.group(1) or m.group(2)
        if val:
            emit("date", val)
    for m in PHONE_RE.finditer(text):
        # avoid swallowing amounts; require it not look like a bare number phrase
        if len(re.sub(r"\D", "", m.group(0))) >= 9:
            emit("phone", m.group(0))
    for m in LABELLED_NAME_RE.finditer(text):
        emit("person", m.group(1))

    return obs


def run_extraction(items: list[EvidenceItem]) -> list[Observation]:
    """Extract across items and persist. Idempotent per evidence item.

    Only prior deterministic (regex) extractions are replaced, so seeded
    fixtures, simulated-OCR fields and reviewer corrections are preserved.
    """
    all_obs: list[Observation] = []
    for item in items:
        existing = repo.list("observations", item.case_id)
        for old in existing:
            is_derived = old.extraction_method in ("regex", "deterministic")
            if old.evidence_id == item.id and is_derived and old.review_status != "corrected":
                repo.delete("observations", old.id)
        extracted = extract_for_item(item)
        for o in extracted:
            repo.put("observations", o)
        all_obs.extend(extracted)
    return all_obs


# alias used by the orchestrator
run = run_extraction
