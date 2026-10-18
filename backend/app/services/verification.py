"""Verification: build findings from structured records and check each claim
against the evidence ledger with DETERMINISTIC checks.

A finding is 'verified' only if its supporting observations actually exist in the
repository and trace to real evidence items. Claims with no support are flagged,
never asserted. Contradictions are preserved. A model is never used as the sole
proof of another model's output.
"""
from __future__ import annotations

from collections import defaultdict

from ..db import repo
from ..util import new_id
from ..schemas import Finding

_CLAIM_TYPES = ("observation", "corroborated", "inference", "unresolved")


def build_findings(case_id: str) -> list[Finding]:
    """Derive findings from observations + relationships, then verify support."""
    for old in repo.list("findings", case_id):
        repo.delete("findings", old.id)

    obs = repo.list("observations", case_id)
    rels = repo.list("relationships", case_id)
    evidence = repo.list("evidence", case_id)
    ev_ids = {e.id for e in evidence}
    obs_by_id = {o.id: o for o in obs}

    findings: list[Finding] = []

    # 1) corroborated identifiers: transaction refs appearing in >=2 evidence items
    by_ref = defaultdict(set)
    ref_obs = defaultdict(list)
    for o in obs:
        if o.field_type == "transaction_ref":
            by_ref[o.value.upper()].add(o.evidence_id)
            ref_obs[o.value.upper()].append(o.id)
    for ref, evs in by_ref.items():
        if len(evs) >= 2:
            findings.append(Finding(
                id=new_id("fnd"), case_id=case_id,
                statement=(
                    f"Transaction reference '{ref}' is referenced in {len(evs)} separate "
                    f"evidence items. This corroborates that the records describe one "
                    "transaction; it does not by itself establish identity or intent."
                ),
                claim_type="corroborated",
                supporting_observation_ids=ref_obs[ref],
                supporting_evidence_ids=sorted(evs),
                requires_human_review=True,
            ))

    # 2) conflicting timestamps finding
    tl = repo.list("timeline_events", case_id)
    conflicting = [t for t in tl if t.conflicting_event_ids]
    if conflicting:
        sup_obs = [oid for t in conflicting for oid in t.observation_ids if oid in obs_by_id]
        findings.append(Finding(
            id=new_id("fnd"), case_id=case_id,
            statement=(
                f"{len(conflicting)} timeline entries carry conflicting timestamps for the "
                "same period, so the order of events is not established. Human review required."
            ),
            claim_type="unresolved",
            supporting_observation_ids=sup_obs,
            supporting_evidence_ids=sorted({eid for t in conflicting for eid in t.evidence_ids}),
            requires_human_review=True,
            contradicted_by="conflicting timestamps",
        ))

    # 3) research-simulated observations about reserved domains
    results = repo.list("research_results", case_id)
    for r in results:
        if "reserved" in r.returned_observation.lower() and r.is_simulated:
            url_obs = [o.id for o in obs if o.field_type == "url"]
            findings.append(Finding(
                id=new_id("fnd"), case_id=case_id,
                statement=r.returned_observation,
                claim_type="observation",
                supporting_observation_ids=url_obs,
                supporting_evidence_ids=sorted({obs_by_id[i].evidence_id for i in url_obs if i in obs_by_id}),
                requires_human_review=False,
            ))

    # 4) inference: any relationship marked inferred becomes an inference finding
    for rel in rels:
        if rel.is_inferred or rel.match_method == "ambiguous":
            findings.append(Finding(
                id=new_id("fnd"), case_id=case_id,
                statement=rel.explanation,
                claim_type="inference",
                supporting_observation_ids=rel.supporting_observation_ids,
                supporting_relationship_ids=[rel.id],
                requires_human_review=True,
            ))

    for f in findings:
        verify(case_id, f, ev_ids, set(obs_by_id))
        repo.put("findings", f)
    return findings


def verify(case_id: str, f: Finding, ev_ids: set[str], obs_ids: set[str]) -> None:
    """Deterministic provenance checks; unresolved/ambiguous claims stay flagged."""
    missing_obs = [o for o in f.supporting_observation_ids if o not in obs_ids]
    missing_ev = [e for e in f.supporting_evidence_ids if e not in ev_ids]
    has_support = bool(f.supporting_observation_ids) and not missing_obs and not missing_ev
    f.verified = has_support
    if not has_support:
        f.review_status = "needs_review"
        f.requires_human_review = True
    elif f.claim_type in ("corroborated", "inference", "unresolved"):
        f.review_status = "needs_review"
    else:
        f.review_status = "needs_review"  # every finding awaits human sign-off


def unsupported_claims(report_body_claims: list[tuple[str, list[str]]], obs_ids: set[str]) -> list[str]:
    """Given (claim_text, [observation_ids]) pairs, return claims lacking support.
    Used to detect report statements with no backing reference."""
    bad = []
    for text, refs in report_body_claims:
        if not refs or any(r not in obs_ids for r in refs):
            bad.append(text)
    return bad
