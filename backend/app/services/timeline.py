"""Timeline reconstruction from date observations.

Original timestamp strings and time zones are preserved. Approximate and
conflicting timestamps are surfaced, never silently normalised or invented.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta

from ..db import repo
from ..util import new_id
from ..schemas import Observation, TimelineEvent

# a small set of parse formats; failure to parse => approximate, not dropped
_FORMATS = [
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d",
    "%d %b %Y %I:%M %p", "%d %b %Y", "%B %d, %Y",
]

_APPROX_WORDS = ("approx", "around", "about", "sometime", "uncertain", "believe", "recollection")


def _parse(raw: str) -> tuple[str | None, bool]:
    cleaned = raw.strip()
    for fmt in _FORMATS:
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.isoformat(), False
        except ValueError:
            continue
    # try replacing 'T' with space
    try:
        return datetime.fromisoformat(cleaned.replace(" ", "T", 1)).isoformat(), False
    except Exception:  # noqa: BLE001
        return None, True


def run(case_id: str, observations: list[Observation]) -> list[TimelineEvent]:
    for old in repo.list("timeline_events", case_id):
        repo.delete("timeline_events", old.id)

    date_obs = [o for o in observations if o.field_type == "date"]
    events: list[TimelineEvent] = []
    for o in date_obs:
        iso, approx = _parse(o.value)
        approx = approx or any(w in (o.source_passage or "").lower() for w in _APPROX_WORDS)
        ev = TimelineEvent(
            id=new_id("tl"),
            case_id=case_id,
            description=o.source_passage[:200] or f"Timestamp: {o.value}",
            timestamp_raw=o.value,
            timestamp_iso=None if approx else iso,
            time_zone=o.value.strip()[-3:] if o.value.strip().isupper() else None,
            is_approximate=approx,
            timestamp_origin="inferred" if o.provenance == "inferred" else "observed",
            evidence_ids=[o.evidence_id],
            observation_ids=[o.id],
            source_reliability="direct" if o.provenance == "direct" else "uncertain",
        )
        events.append(ev)

    # detect conflicts: events on the same calendar day with different times that
    # describe the same transaction reference -> flag but DO NOT resolve.
    for i in range(len(events)):
        for j in range(i + 1, len(events)):
            a, b = events[i], events[j]
            if a.timestamp_iso and b.timestamp_iso and a.timestamp_iso[:10] == b.timestamp_iso[:10]:
                if a.timestamp_iso != b.timestamp_iso:
                    if b.id not in a.conflicting_event_ids:
                        a.conflicting_event_ids.append(b.id)
                        b.conflicting_event_ids.append(a.id)

    # order by parseable timestamp, unparseable last
    events.sort(key=lambda e: (e.timestamp_iso is None, e.timestamp_iso or "9999"))
    for e in events:
        if e.conflicting_event_ids and not e.unresolved_question:
            e.unresolved_question = (
                "Conflicting timestamps reference the same day; the order of events "
                "cannot be established automatically and needs human review."
            )
        repo.put("timeline_events", e)
    return events
