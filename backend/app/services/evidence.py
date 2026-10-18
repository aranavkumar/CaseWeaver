"""Evidence ingestion: validation, SHA-256 hashing of original bytes, safe text
extraction, and storage that keeps originals separate from derived data.

Uploaded content is treated as untrusted DATA, never as instructions. We never
execute macros/scripts/embedded active content.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
from pathlib import Path

from ..config import settings
from ..util import new_id
from ..schemas import EvidenceItem, ProcessingStatus, SourceType

_EXT_TO_SOURCE = {
    "png": SourceType.image, "jpg": SourceType.image, "jpeg": SourceType.image,
    "pdf": SourceType.pdf, "txt": SourceType.text, "csv": SourceType.csv,
    "json": SourceType.json, "eml": SourceType.email,
}


class ValidationError(Exception):
    pass


def validate_and_hash(data: bytes, filename: str) -> tuple[str, int]:
    """Validate extension + size, then SHA-256 over the actual uploaded bytes."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in settings.allowed_extensions:
        raise ValidationError(
            f"Unsupported file type '.{ext}'. Allowed: "
            f"{', '.join(sorted(settings.allowed_extensions))}"
        )
    if len(data) == 0:
        raise ValidationError("Uploaded file is empty.")
    if len(data) > settings.max_upload_bytes:
        raise ValidationError(
            f"File exceeds the {settings.max_upload_bytes // (1024 * 1024)} MiB size limit."
        )
    return hashlib.sha256(data).hexdigest(), len(data)


def store_original(case_id: str, item_id: str, data: bytes, ext: str) -> str:
    """Persist the ORIGINAL bytes untouched; returns the stored path."""
    dir_ = Path(settings.storage_dir) / case_id
    dir_.mkdir(parents=True, exist_ok=True)
    path = dir_ / f"{item_id}.{ext}"
    path.write_bytes(data)
    return str(path)


def extract_text(data: bytes, ext: str) -> tuple[str, str, str]:
    """Return (text, extraction_method, honesty_note).

    Real deterministic parsing for text-like formats. For images (png/jpeg) and
    PDFs without a text layer we do NOT fake OCR — we return a clearly-labelled
    demo note instead.
    """
    if ext in ("txt",):
        return data.decode("utf-8", errors="replace"), "utf8_text", ""
    if ext == "csv":
        try:
            rows = list(csv.reader(io.StringIO(data.decode("utf-8", errors="replace"))))
            text = "\n".join(" | ".join(r) for r in rows)
            return text, "csv_parser", ""
        except Exception as exc:  # noqa: BLE001
            return "", "csv_parser", f"CSV parse failed: {exc}"
    if ext == "json":
        try:
            return json.dumps(json.loads(data.decode("utf-8")), indent=2), "json_parser", ""
        except Exception as exc:  # noqa: BLE001
            return "", "json_parser", f"JSON parse failed: {exc}"
    if ext == "eml":
        return _extract_eml(data)
    if ext == "pdf":
        return _extract_pdf(data)
    # images
    return "", "none", (
        "OCR / vision extraction not available in this environment. "
        "No text was extracted; nothing is being claimed as observed."
    )


def _extract_eml(data: bytes) -> tuple[str, str, str]:
    import email
    from email import policy

    msg = email.message_from_bytes(data, policy=policy.default)
    parts = []
    for h in ("From", "To", "Subject", "Date"):
        if msg.get(h):
            parts.append(f"{h}: {msg.get(h)}")
    body = ""
    if msg.is_multipart():  # safe: only read text parts
        for p in msg.walk():
            if p.get_content_type() == "text/plain":
                body = p.get_content()
                break
    else:
        try:
            body = msg.get_content()
        except Exception:  # noqa: BLE001
            body = data.decode("utf-8", errors="replace")
    parts.append("\n" + str(body))
    return "\n".join(parts), "email_parser", ""


def _extract_pdf(data: bytes) -> tuple[str, str, str]:
    """Best-effort PDF text extraction without heavy deps. If no text layer,
    disclose honestly rather than fabricating OCR output."""
    text = _rough_pdf_text(data)
    if text.strip():
        return text, "pdf_text_layer", ""
    return "", "pdf_text_layer", (
        "This PDF has no extractable text layer and OCR is unavailable. "
        "No text was fabricated."
    )


def _rough_pdf_text(data: bytes) -> str:
    """Minimal, dependency-free text harvest from uncompressed PDF streams."""
    out: list[str] = []
    try:
        raw = data.decode("latin-1", errors="ignore")
        import re
        for m in re.finditer(r"\(([^()\n]{1,200})\)\s*Tj", raw):
            out.append(m.group(1))
    except Exception:  # noqa: BLE001
        return ""
    return " ".join(out)


def new_evidence(
    case_id: str,
    original_filename: str,
    *,
    source_type: SourceType = SourceType.text,
    evidence_label: str = "",
    is_synthetic: bool = False,
    derived_text: str = "",
    extraction_method: str = "manual_fixture",
    notes: str = "",
) -> EvidenceItem:
    return EvidenceItem(
        id=new_id("ev"),
        case_id=case_id,
        original_filename=original_filename,
        evidence_label=evidence_label,
        source_type=source_type,
        is_synthetic=is_synthetic,
        derived_text=derived_text,
        extraction_method=extraction_method,
        notes=notes,
    )
