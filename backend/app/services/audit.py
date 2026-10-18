"""Append-oriented audit trail. Client-side prototype: not tamper-proof."""
from __future__ import annotations

from typing import Optional

from ..db import repo
from ..util import new_id
from ..schemas import AuditEvent


def log(
    action: str,
    *,
    case_id: Optional[str] = None,
    actor: str = "system",
    related_record_kind: str = "",
    related_record_id: str = "",
    previous_value: Optional[str] = None,
    new_value: Optional[str] = None,
    outcome: str = "success",
) -> AuditEvent:
    evt = AuditEvent(
        id=new_id("aud"),
        case_id=case_id,
        actor=actor,
        action=action,
        related_record_kind=related_record_kind,
        related_record_id=related_record_id,
        previous_value=previous_value,
        new_value=new_value,
        outcome=outcome,
    )
    repo.put("audit_events", evt)
    return evt


def list_events(case_id: Optional[str] = None) -> list[AuditEvent]:
    events = repo.list("audit_events", case_id)
    return sorted(events, key=lambda e: e.timestamp, reverse=True)
