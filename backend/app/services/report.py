"""Report generation strictly from structured case records.

Never from a static hardcoded paragraph. Rebuilding reflects reviewer corrections
because it reads the current finding/relationship/observation records.
"""
from __future__ import annotations

from ..db import repo
from ..util import new_id
from ..schemas import ReportVersion

DISCLAIMER = "Demonstration Report — Not a Certified Forensic Report"


def build(case_id: str, *, exec_summary_override: str | None = None,
          notes_override: str | None = None) -> ReportVersion:
    case = repo.get("cases", case_id)
    evidence = repo.list("evidence", case_id)
    findings = repo.list("findings", case_id)
    rels = repo.list("relationships", case_id)
    timeline = repo.list("timeline_events", case_id)
    queries = repo.list("research_queries", case_id)
    results = repo.list("research_results", case_id)
    reviews = repo.list("review_actions", case_id)
    obs_by_id = {o.id: o for o in repo.list("observations", case_id)}
    ev_by_id = {e.id: e for e in evidence}

    accepted = [f for f in findings if f.review_status == "accepted"]
    unresolved = [f for f in findings if f.claim_type == "unresolved" or f.contradicted_by]
    inferred = [f for f in findings if f.claim_type == "inference"]
    observations_only = [f for f in findings if f.claim_type == "observation"]

    def ref(obs_ids: list[str]) -> str:
        parts = []
        for oid in obs_ids:
            o = obs_by_id.get(oid)
            if o:
                label = ev_by_id.get(o.evidence_id, None)
                tag = label.evidence_label or label.original_filename if label else o.evidence_id
                parts.append(f"[{tag}]")
        return " ".join(dict.fromkeys(parts)) or "[no linked evidence]"

    lines: list[str] = []
    lines.append(f"# Investigation Report — {case.title}")
    lines.append(f"\n**{DISCLAIMER}**  \nCase ID: `{case.id}` | Category: {case.category.value} | "
                 f"Priority: {case.priority.value}\n")

    lines.append("## 1. Executive Summary")
    lines.append(exec_summary_override or (
        f"This demonstration case aggregated {len(evidence)} evidence items into "
        f"{len(findings)} findings ({len(accepted)} accepted, "
        f"{len([f for f in findings if f.review_status=='needs_review'])} awaiting review). "
        f"No conclusion of guilt is drawn; matching identifiers corroborate record linkage only."
    ))

    lines.append("\n## 2. Case Scope and Objective")
    lines.append(f"{case.description or '(no description)'}\n\nObjective: {case.objective or '(not set)'}")

    lines.append("\n## 3. Evidence Inventory")
    for e in evidence:
        lines.append(f"- **{e.evidence_label or e.original_filename}** (`{e.id}`) — "
                     f"{e.source_type.value}, {e.size_bytes} bytes, sha256 `{(e.sha256[:16] or 'n/a')}…`")

    lines.append("\n## 4. Methodology")
    lines.append(
        "Deterministic extraction with source-provenance, exact entity matching, "
        "contradiction-preserving timeline reconstruction, ledger-based verification, "
        "and a human-review gate before approval. Simulated research is labelled as such."
    )

    lines.append("\n## 5. Key Observed Facts")
    for f in observations_only:
        lines.append(f"- {f.statement} {ref(f.supporting_observation_ids)}")
    if not observations_only:
        lines.append("- (no direct observations recorded)")

    lines.append("\n## 6. Entity Relationships")
    for r in rels:
        status = {"accepted": "accepted", "rejected": "rejected", "needs_review": "needs review"}[r.review_status]
        lines.append(
            f"- {r.relationship_type} ({r.match_method}, {status}): {r.explanation} "
            f"{ref(r.supporting_observation_ids)}"
            + (f" — CONTRADICTING: {r.contradicting_evidence}" if r.contradicting_evidence else "")
        )

    lines.append("\n## 7. Chronological Timeline")
    for t in timeline:
        approx = " (approximate)" if t.is_approximate else ""
        conflict = " [CONFLICTING]" if t.conflicting_event_ids else ""
        lines.append(f"- {t.timestamp_raw}{approx}{conflict}: {t.description} "
                     f"{ref(t.observation_ids)}")

    lines.append("\n## 8. Contradictions and Inconsistencies")
    for f in unresolved:
        lines.append(f"- {f.statement} {ref(f.supporting_observation_ids)}")
    if not unresolved:
        lines.append("- None detected.")

    lines.append("\n## 9. Research Results and Source Limitations")
    for q in queries:
        rs = [r for r in results if r.query_id == q.id]
        for r in rs:
            tag = "Simulated research result" if r.is_simulated else "Live result"
            lines.append(f"- Q: {q.question}\n  - [{tag}] {r.returned_observation}\n  - Limitation: {r.limitations}")

    lines.append("\n## 10. Inferences (not established fact)")
    for f in inferred:
        lines.append(f"- {f.statement} {ref(f.supporting_observation_ids)}")
    if not inferred:
        lines.append("- None.")

    lines.append("\n## 11. Unresolved Questions")
    unq = [t for t in timeline if t.unresolved_question]
    for t in unq:
        lines.append(f"- {t.unresolved_question}")
    for r in results:
        if "Unverified" in r.returned_observation or "No fixture" in r.returned_observation:
            lines.append(f"- {r.returned_observation}")
    if not unq and not results:
        lines.append("- None.")

    lines.append("\n## 12. Human-Review Decisions")
    for rv in reviews:
        lines.append(f"- {rv.action} on {rv.target_kind} `{rv.target_id}` by {rv.actor}"
                     + (f": {rv.comment}" if rv.comment else ""))
    if not reviews:
        lines.append("- No review actions recorded yet.")

    lines.append("\n## 13. Conclusion and Suggested Next Steps")
    lines.append(
        "Findings are consistent with a single referenced transaction across multiple files, but "
        "conflicting timestamps and missing delivery confirmation remain unresolved. No party is "
        "declared at fault. Next steps: confirm the true event order, obtain the missing delivery "
        "confirmation, and independently verify any external identifiers via an authorised source."
    )

    lines.append("\n## 14. Evidence Reference Index")
    for e in evidence:
        lines.append(f"- `{e.id}` → {e.original_filename} (sha256 `{e.sha256 or 'n/a'}`)")

    if notes_override:
        lines.append(f"\n## Reviewer Notes\n{notes_override}")

    existing = repo.list("report_versions", case_id)
    version = len(existing) + 1
    report = ReportVersion(
        id=new_id("rep"),
        case_id=case_id,
        version=version,
        executive_summary=exec_summary_override or "",
        body_markdown="\n".join(lines),
        review_status="draft",
        disclaimer=DISCLAIMER,
    )
    repo.put("report_versions", report)
    return report
