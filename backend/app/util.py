"""Shared helpers: stable ID generation and a tiny passage finder."""
from __future__ import annotations

import uuid


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def find_offset(text: str, needle: str) -> tuple[int | None, int | None]:
    """Return (start,end) char offsets for the first occurrence, or (None,None)."""
    if not needle:
        return None, None
    idx = text.find(needle)
    if idx == -1:
        return None, None
    return idx, idx + len(needle)
