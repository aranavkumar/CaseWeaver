"""Built-in synthetic investigation: "Operation Silverline".

Fictional educational demonstration ONLY. All names, identifiers, URLs and
references are synthetic and do not correspond to real people or accusations.
Reserved domains (example.com) are used deliberately.

Deliberate, explainable overlaps + at least two inconsistencies:
  * SLV-2024-8842 appears in the chat, email and receipt (3 files).
  * The $450.00 amount appears in chat and receipt.
  * The email is stamped 09:15 but refers to a 14:32 chat "earlier today"
    -> the described order of events is internally inconsistent.
  * The website record lists a delivery ETA that is never confirmed anywhere
    -> a missing expected detail.
  * A seeded simulated-OCR observation mis-reads the amount as $5,400.00
    (clearly labelled inferred) so a reviewer can correct it.
"""
from __future__ import annotations

from datetime import datetime

from ..db import repo
from ..util import new_id
from ..schemas import (
    Case,
    CaseStatus,
    EvidenceItem,
    IncidentCategory,
    Observation,
    Priority,
    ProcessingStatus,
    SourceType,
)

CHAT_TEXT = """[Silverline Market chat — screenshot]
Seller (alex.morgan@example.com): Great choice on the Lenovo ThinkPad!
Seller: I just need an advance payment of $450.00 to reserve it.
Buyer: Sure, sending now.
Seller: Perfect. Payment reference SLV-2024-8842.
Seller: I'll ship it today, delivery within 2-3 days.
Timestamp: 2024-06-11 14:32
"""

EMAIL_TEXT = """From: Alex Morgan <alex.morgan@example.com>
To: buyer@example.com
Subject: Re: ThinkPad reservation
Date: 2024-06-11 09:15

Hi! Following up on our earlier conversation today at 14:32.
Your advance payment under reference SLV-2024-8842 is noted.
I confirm the laptop will be dispatched with delivery in 2-3 days.
Best, Alex Morgan
"""

RECEIPT_TEXT = """PAYMENT RECEIPT
Payment gateway: QuickPay (synthetic)
Payment identifier: PAY-QP-5569
Amount: USD 450.00
Reference: SLV-2024-8842
Date: 2024-06-11 15:02
Status: Completed
"""

WEBSITE_TEXT = """CAPTURED WEB RECORD (synthetic)
URL: https://silverline-market.example.com/listing/SLV-8842
Page title: Lenovo ThinkPad — Silverline Market
Listing identifier: SLV-8842
Seller contact: alex.morgan@example.com
Captured at: 2024-06-12 08:40
Note on page: "Delivery within 2-3 days" (no dispatch confirmation shown)
"""

NOTES_TEXT = """INCIDENT NOTES (reporter's recollection)
I bought a laptop from Silverline Market. I believe I paid around June 10 or 11.
The seller promised delivery but I never received a dispatch confirmation.
Amount paid: $450.00
Open question: was the laptop ever actually shipped?
Uncertain date: approximately 2024-06-10 or 2024-06-11
"""

EVIDENCE_FIXTURES = [
    dict(label="A — Messaging screenshot", filename="chat_screenshot.png",
         source_type=SourceType.image, text=CHAT_TEXT,
         method="vision_ocr_simulated",
         note="Synthetic OCR transcript of a fictional chat screenshot."),
    dict(label="B — Email message", filename="reservation_email.eml",
         source_type=SourceType.email, text=EMAIL_TEXT,
         method="email_parser",
         note="Synthetic email; sender uses reserved example.com domain."),
    dict(label="C — Payment receipt", filename="payment_receipt.pdf",
         source_type=SourceType.pdf, text=RECEIPT_TEXT,
         method="pdf_text_layer",
         note="Synthetic receipt fixture."),
    dict(label="D — Website information", filename="listing_record.json",
         source_type=SourceType.json, text=WEBSITE_TEXT,
         method="json_parser",
         note="Synthetic captured web record; reserved example.com domain."),
    dict(label="E — Incident notes", filename="incident_notes.txt",
         source_type=SourceType.text, text=NOTES_TEXT,
         method="utf8_text",
         note="Reporter's own recollection; contains an uncertain date."),
]


def sample_exists() -> Case | None:
    for c in repo.list("cases"):
        if c.is_sample:
            return c
    return None


def load_sample(*, force: bool = False) -> Case:
    """Idempotently initialise the sample investigation. Repeated clicks do NOT
    duplicate records unless force=True (which wipes and rebuilds)."""
    existing = sample_exists()
    if existing and not force:
        return existing
    if existing and force:
        repo.cascade_delete_case(existing.id)

    case = Case(
        id=new_id("case"),
        title="Operation Silverline — Suspected Online Marketplace Scam",
        description=(
            "Fictional educational demonstration. A buyer paid an advance for a "
            "second-hand laptop on the fictional 'Silverline Market' from a fictional "
            "participant 'Alex Morgan'; delivery was promised but never confirmed."
        ),
        category=IncidentCategory.suspected_online_scam,
        incident_date="2024-06-10 / 2024-06-11 (uncertain)",
        time_zone="UTC (assumed)",
        priority=Priority.high,
        internal_reference="DEMO-SILVERLINE",
        objective=(
            "Correlate the scattered artifacts, reconstruct the incident timeline, "
            "surface inconsistencies, and produce an evidence-linked report without "
            "asserting guilt."
        ),
        status=CaseStatus.draft,
        is_sample=True,
    )
    repo.put("cases", case)

    receipt_id = None
    for fx in EVIDENCE_FIXTURES:
        item = EvidenceItem(
            id=new_id("ev"),
            case_id=case.id,
            original_filename=fx["filename"],
            evidence_label=fx["label"],
            file_type=fx["filename"].rsplit(".", 1)[-1],
            source_type=fx["source_type"],
            size_bytes=len(fx["text"].encode("utf-8")),
            sha256=_synthetic_hash(fx["filename"] + fx["text"]),
            processing_status=ProcessingStatus.completed,
            extraction_status=ProcessingStatus.completed,
            is_synthetic=True,
            extraction_method=fx["method"],
            derived_text=fx["text"],
            notes=fx["note"],
        )
        repo.put("evidence", item)
        if fx["label"].startswith("C"):
            receipt_id = item.id

    # Seed the deliberate incorrect extraction: a simulated-OCR mis-read of the amount
    wrong = Observation(
        id=new_id("obs"),
        case_id=case.id,
        evidence_id=receipt_id,
        field_type="amount",
        value="$5,400.00",
        source_passage="Amount: USD 450.00  [OCR misread the digit '4' as '5,4']",
        extraction_method="vision_ocr",
        provenance="inferred",
        confidence=0.55,
        review_status="needs_review",
        ambiguity=(
            "DELIBERATELY INCORRECT demo field. The receipt text says USD 450.00 but this "
            "simulated OCR pass read $5,400.00. Reviewer should correct it to $450.00."
        ),
    )
    repo.put("observations", wrong)

    return case


def _synthetic_hash(seed: str) -> str:
    import hashlib
    return hashlib.sha256(("SYNTHETIC::" + seed).encode("utf-8")).hexdigest()
