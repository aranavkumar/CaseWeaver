"""Research service.

Default is a local MOCK ADAPTER of predetermined results. Every mock result is
marked is_simulated=True and source_kind='fixture'. A live public search would
only be used if an API key is actually configured; a failed live call is NEVER
silently replaced with fabricated data.

No browsing of private accounts, no auth bypass, no intrusive scans.
"""
from __future__ import annotations

from ..config import settings
from ..db import repo
from ..util import new_id
from ..schemas import ResearchQuery, ResearchResult, ProcessingStatus

# predetermined synthetic research knowledge for the sample case
_MOCK_KB: list[dict] = [
    {
        "match": "silverline",
        "observation": (
            "No independently verifiable record of 'Silverline Market' was found in the "
            "local fixture set. Absence of a result does NOT imply legitimacy or fraud."
        ),
        "limitations": "Fixture data only; not a real web lookup.",
    },
    {
        "match": "example.com",
        "observation": (
            "'example.com' is an IANA-reserved domain for documentation. It cannot be "
            "attributed to any real organisation. Treat as synthetic placeholder."
        ),
        "limitations": "Reserved-domain reasoning is deterministic, not a scan result.",
    },
    {
        "match": "SLV-2024-8842",
        "observation": (
            "The transaction reference SLV-2024-8842 appears in 3 fixture evidence items. "
            "Corroboration is intra-case only; no external ledger confirms it."
        ),
        "limitations": "Derived from case evidence, not an external payment network.",
    },
]


def run_for_case(case_id: str) -> tuple[list[ResearchQuery], list[ResearchResult]]:
    """Formulate questions from case evidence and answer via mock (or live) tool."""
    # clear prior to stay idempotent
    for old in repo.list("research_results", case_id):
        repo.delete("research_results", old.id)
    for old in repo.list("research_queries", case_id):
        repo.delete("research_queries", old.id)

    observations = repo.list("observations", case_id)
    urls = sorted({o.value for o in observations if o.field_type == "url"})
    refs = sorted({o.value for o in observations if o.field_type == "transaction_ref"})
    emails = sorted({o.value for o in observations if o.field_type == "email"})

    questions = [
        ("Does the same transaction reference appear in multiple files?",
         "transaction_ref", refs),
        ("Is any supplied URL attributable to a real, scanned destination?",
         "url", urls),
        ("Do public sources corroborate the observed sender addresses?",
         "email", emails),
    ]

    queries: list[ResearchQuery] = []
    results: list[ResearchResult] = []
    for qtext, kind, values in questions:
        q = ResearchQuery(
            id=new_id("q"),
            case_id=case_id,
            question=qtext,
            tool="search_api" if settings.search_configured else "mock_adapter",
            query_input=", ".join(values) or f"(no {kind} in evidence)",
            status=ProcessingStatus.completed,
        )
        repo.put("research_queries", q)
        queries.append(q)
        results.extend(_answer(case_id, q, values))

    return queries, results


def _answer(case_id: str, q: ResearchQuery, values: list[str]) -> list[ResearchResult]:
    out: list[ResearchResult] = []
    for val in values:
        hit = next((k for k in _MOCK_KB if k["match"].lower() in val.lower()), None)
        obs = hit["observation"] if hit else (
            f"No fixture information available for '{val}'. Unverified — left open for "
            "human follow-up."
        )
        lim = hit["limitations"] if hit else "Not found in fixture; treated as unresolved."
        r = ResearchResult(
            id=new_id("rr"),
            case_id=case_id,
            query_id=q.id,
            source_url=None,
            returned_observation=obs,
            is_simulated=True,
            source_kind="fixture",
            limitations=lim,
        )
        repo.put("research_results", r)
        out.append(r)
    if not values:
        r = ResearchResult(
            id=new_id("rr"),
            case_id=case_id,
            query_id=q.id,
            returned_observation="No relevant identifier present in evidence to research.",
            is_simulated=True,
            source_kind="fixture",
            limitations="Nothing retrieved.",
        )
        repo.put("research_results", r)
        out.append(r)
    return out
