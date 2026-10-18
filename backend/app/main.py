"""CaseWeaver FastAPI application.

REST API over the SQLite repository. CORS enabled for the Next.js dev server.
In demo mode no external API key is required.
"""
from __future__ import annotations

from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import settings
from .db import repo
from .util import new_id
from .schemas import (
    Case,
    CaseStatus,
    CreateCaseRequest,
    EvidenceItem,
    Finding,
    Observation,
    ProcessingStatus,
    Relationship,
    ReviewDecisionRequest,
)
from .services import audit, evidence as ev_svc, export as export_svc
from .services import entity_resolution, extraction, report as report_svc, research, timeline as timeline_svc, verification
from .agents import orchestrator
from .data import silverline

app = FastAPI(title="CaseWeaver API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000",
                   "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_case(case_id: str) -> Case:
    case = repo.get("cases", case_id)
    if not case:
        raise HTTPException(404, "Case not found")
    return case


def recompute_downstream(case_id: str) -> None:
    """Re-run deterministic correlation/timeline/verification after a human edit so
    the graph, findings and report stay consistent with corrected records."""
    observations = repo.list("observations", case_id)
    entity_resolution.run(case_id, observations)
    timeline_svc.run(case_id, observations)
    verification.build_findings(case_id)
    # preserve any accepted/rejected finding statuses by re-applying review decisions
    for rv in repo.list("review_actions", case_id):
        if rv.target_kind == "finding":
            f = repo.get("findings", rv.target_id)
            if f:
                f.review_status = {"accept": "accepted", "reject": "rejected"}.get(rv.action, f.review_status)
                repo.put("findings", f)


# --------------------------------------------------------------------------- #
# Health + settings
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health():
    return {"status": "ok", "mode": settings.mode}


@app.get("/api/settings")
def get_settings():
    return {
        "mode": settings.mode,
        "allowed_extensions": sorted(settings.allowed_extensions),
        "max_upload_bytes": settings.max_upload_bytes,
        "integrations": {
            "llm": {"configured": settings.llm_configured,
                    "note": "Not configured — model interpretation/report drafting uses the "
                            "deterministic local path; nothing is claimed as AI-verified."},
            "web_search": {"configured": settings.search_configured,
                           "note": "Not configured — Research Center uses the local mock adapter "
                                   "and labels every result 'Simulated research result'."},
        },
        "privacy": "Uploaded evidence is stored locally and treated as untrusted data. "
                   "Files are never executed. This prototype is not a certified forensic system.",
    }


# --------------------------------------------------------------------------- #
# Overview
# --------------------------------------------------------------------------- #
@app.get("/api/overview")
def overview():
    cases = repo.list("cases")
    evidence = repo.list("evidence")
    findings = repo.list("findings")
    reports = repo.list("report_versions")
    awaiting = [f for f in findings if f.review_status == "needs_review"]
    by_status: dict[str, int] = {}
    for c in cases:
        by_status[c.status.value] = by_status.get(c.status.value, 0) + 1
    recent_cases = sorted(cases, key=lambda c: c.updated_at, reverse=True)[:6]
    activity = audit.list_events()[:8]
    return {
        "totals": {
            "investigations": len(cases),
            "evidence_processed": sum(1 for e in evidence if e.extraction_status == ProcessingStatus.completed),
            "findings_awaiting_review": len(awaiting),
            "reports_generated": len(reports),
        },
        "status_distribution": by_status,
        "recent_investigations": [c.model_dump(mode="json") for c in recent_cases],
        "recent_activity": [a.model_dump(mode="json") for a in activity],
    }


# --------------------------------------------------------------------------- #
# Cases
# --------------------------------------------------------------------------- #
@app.get("/api/cases")
def list_cases():
    return [c.model_dump(mode="json") for c in sorted(repo.list("cases"), key=lambda c: c.updated_at, reverse=True)]


@app.post("/api/cases")
def create_case(req: CreateCaseRequest):
    if req.use_sample:
        case = silverline.load_sample()
        audit.log("Sample investigation loaded", case_id=case.id, actor="user")
        return case.model_dump(mode="json")
    if not req.title.strip():
        raise HTTPException(422, "Investigation title is required")
    case = Case(
        id=new_id("case"),
        title=req.title.strip(),
        description=req.description,
        category=req.category,
        incident_date=req.incident_date,
        time_zone=req.time_zone,
        priority=req.priority,
        internal_reference=req.internal_reference,
        objective=req.objective,
        status=CaseStatus.draft,
    )
    repo.put("cases", case)
    audit.log("Case created", case_id=case.id, actor="user",
              related_record_kind="case", related_record_id=case.id)
    return case.model_dump(mode="json")


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    case = _require_case(case_id)
    return case.model_dump(mode="json")


@app.get("/api/cases/{case_id}/workspace")
def get_workspace(case_id: str):
    _require_case(case_id)
    return export_svc.workspace(case_id).model_dump(mode="json")


@app.delete("/api/cases/{case_id}")
def delete_case(case_id: str):
    _require_case(case_id)
    n = repo.cascade_delete_case(case_id)
    audit.log("Case deleted", actor="user", related_record_id=case_id,
              new_value=f"{n} related records removed")
    return {"deleted": case_id}


@app.post("/api/sample")
def load_sample_endpoint(force: bool = False):
    case = silverline.load_sample(force=force)
    audit.log("Sample investigation loaded", case_id=case.id, actor="user")
    return case.model_dump(mode="json")


# --------------------------------------------------------------------------- #
# Evidence
# --------------------------------------------------------------------------- #
@app.get("/api/cases/{case_id}/evidence")
def list_evidence(case_id: str):
    _require_case(case_id)
    return [e.model_dump(mode="json") for e in repo.list("evidence", case_id)]


@app.post("/api/cases/{case_id}/evidence")
async def upload_evidence(case_id: str, file: UploadFile = File(...)):
    _require_case(case_id)
    data = await file.read()
    filename = file.filename or "upload.bin"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    try:
        sha, size = ev_svc.validate_and_hash(data, filename)
    except ev_svc.ValidationError as exc:
        audit.log("Evidence upload rejected", case_id=case_id, actor="user",
                  outcome=str(exc))
        raise HTTPException(422, str(exc))
    item = EvidenceItem(
        id=new_id("ev"), case_id=case_id, original_filename=filename,
        file_type=ext, source_type=_source_for_ext(ext), size_bytes=size, sha256=sha,
        processing_status=ProcessingStatus.completed,
        extraction_status=ProcessingStatus.pending,
        is_synthetic=False,
    )
    item.stored_path = ev_svc.store_original(case_id, item.id, data, ext)
    text, method, note = ev_svc.extract_text(data, ext)
    item.derived_text = text
    item.extraction_method = method
    if note:
        item.notes = note
        item.extraction_status = ProcessingStatus.needs_review
    else:
        item.extraction_status = ProcessingStatus.completed
    repo.put("evidence", item)
    extraction.run([item])
    audit.log("Evidence uploaded", case_id=case_id, actor="user",
              related_record_kind="evidence", related_record_id=item.id,
              new_value=f"sha256={sha[:16]}… ({size} bytes)")
    return item.model_dump(mode="json")


def _source_for_ext(ext: str):
    from .schemas import SourceType
    return {
        "png": SourceType.image, "jpg": SourceType.image, "jpeg": SourceType.image,
        "pdf": SourceType.pdf, "csv": SourceType.csv, "json": SourceType.json,
        "eml": SourceType.email,
    }.get(ext, SourceType.text)


@app.get("/api/evidence/{evidence_id}")
def get_evidence(evidence_id: str):
    item = repo.get("evidence", evidence_id)
    if not item:
        raise HTTPException(404, "Evidence not found")
    observations = [o.model_dump(mode="json") for o in repo.list("observations", item.case_id)
                    if o.evidence_id == evidence_id]
    linked_events = [t.model_dump(mode="json") for t in repo.list("timeline_events", item.case_id)
                     if evidence_id in t.evidence_ids]
    return {"item": item.model_dump(mode="json"), "observations": observations,
            "timeline_events": linked_events, "hash_note":
                "The SHA-256 is computed over the actual uploaded bytes. It helps detect later "
                "changes but does NOT prove the document was authentic or truthful."}


@app.delete("/api/evidence/{evidence_id}")
def delete_evidence(evidence_id: str):
    item = repo.get("evidence", evidence_id)
    if not item:
        raise HTTPException(404, "Evidence not found")
    case_id = item.case_id
    for o in repo.list("observations", case_id):
        if o.evidence_id == evidence_id:
            repo.delete("observations", o.id)
    repo.delete("evidence", evidence_id)
    recompute_downstream(case_id)
    audit.log("Evidence deleted", case_id=case_id, actor="user",
              related_record_kind="evidence", related_record_id=evidence_id)
    return {"deleted": evidence_id}


# --------------------------------------------------------------------------- #
# Investigation runs
# --------------------------------------------------------------------------- #
@app.post("/api/cases/{case_id}/run")
def run_case(case_id: str):
    _require_case(case_id)
    try:
        run_id = orchestrator.start_run(case_id)
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    return {"run_id": run_id}


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    try:
        return orchestrator.get_run(run_id)
    except Exception:  # noqa: BLE001
        raise HTTPException(404, "Run not found")


@app.post("/api/runs/{run_id}/pause")
def pause(run_id: str):
    orchestrator.request_pause(run_id)
    return {"paused": True}


@app.post("/api/runs/{run_id}/resume")
def resume(run_id: str):
    orchestrator.request_resume(run_id)
    return {"resumed": True}


@app.post("/api/runs/{run_id}/cancel")
def cancel(run_id: str):
    orchestrator.request_cancel(run_id)
    return {"cancelled": True}


@app.post("/api/runs/{run_id}/retry/{stage}")
def retry(run_id: str, stage: str):
    try:
        orchestrator.retry_stage(run_id, stage)
    except RuntimeError as exc:
        raise HTTPException(409, str(exc))
    return {"retrying": stage}


# --------------------------------------------------------------------------- #
# Intelligence graph
# --------------------------------------------------------------------------- #
@app.get("/api/cases/{case_id}/graph")
def graph(case_id: str):
    _require_case(case_id)
    entities = repo.list("entities", case_id)
    rels = repo.list("relationships", case_id)
    evidence = {e.id: e for e in repo.list("evidence", case_id)}
    obs_by_id = {o.id: o for o in repo.list("observations", case_id)}

    nodes = []
    for e in entities:
        nodes.append({
            "id": e.id, "type": e.entity_type, "label": e.display_label,
            "normalized": e.normalized_value,
            "observation_ids": e.observation_ids,
            "evidence_ids": sorted({obs_by_id[o].evidence_id for o in e.observation_ids if o in obs_by_id}),
        })
    for ev_id, ev in evidence.items():
        nodes.append({"id": ev_id, "type": "evidence", "label": ev.evidence_label or ev.original_filename,
                      "normalized": ev.sha256, "observation_ids": [], "evidence_ids": [ev_id]})

    edges = []
    for r in rels:
        # skip self-corroboration edges for the graph but expose as annotation on node
        if r.source_entity_id == r.target_entity_id:
            continue
        edges.append({
            "id": r.id, "source": r.source_entity_id, "target": r.target_entity_id,
            "relationship_type": r.relationship_type, "match_method": r.match_method,
            "confidence": r.confidence, "review_status": r.review_status,
            "explanation": r.explanation, "contradicting_evidence": r.contradicting_evidence,
            "is_inferred": r.is_inferred,
            "supporting_observation_ids": r.supporting_observation_ids,
            "supporting_evidence_ids": sorted({obs_by_id[o].evidence_id for o in r.supporting_observation_ids if o in obs_by_id}),
        })
    return {"nodes": nodes, "edges": edges,
            "corroborations": [
                {"entity_id": r.source_entity_id, "explanation": r.explanation,
                 "review_status": r.review_status, "supporting_observation_ids": r.supporting_observation_ids}
                for r in rels if r.source_entity_id == r.target_entity_id
            ]}


# --------------------------------------------------------------------------- #
# Timeline / research / findings
# --------------------------------------------------------------------------- #
@app.get("/api/cases/{case_id}/timeline")
def timeline(case_id: str):
    _require_case(case_id)
    return [t.model_dump(mode="json") for t in
            sorted(repo.list("timeline_events", case_id),
                   key=lambda t: (t.timestamp_iso is None, t.timestamp_iso or "9999"))]


@app.get("/api/cases/{case_id}/research")
def research_endpoint(case_id: str):
    _require_case(case_id)
    return {
        "queries": [q.model_dump(mode="json") for q in repo.list("research_queries", case_id)],
        "results": [r.model_dump(mode="json") for r in repo.list("research_results", case_id)],
        "live_mode": settings.search_configured,
    }


@app.get("/api/cases/{case_id}/findings")
def findings(case_id: str):
    _require_case(case_id)
    out = []
    obs_by_id = {o.id: o for o in repo.list("observations", case_id)}
    ev_by_id = {e.id: e for e in repo.list("evidence", case_id)}
    for f in repo.list("findings", case_id):
        d = f.model_dump(mode="json")
        d["evidence_labels"] = [ev_by_id[e].evidence_label or ev_by_id[e].original_filename
                                for e in f.supporting_evidence_ids if e in ev_by_id]
        out.append(d)
    return out


# --------------------------------------------------------------------------- #
# Review
# --------------------------------------------------------------------------- #
@app.post("/api/cases/{case_id}/review")
def review(case_id: str, req: ReviewDecisionRequest):
    _require_case(case_id)
    from .schemas import ReviewAction
    ra = ReviewAction(
        id=new_id("rv"), case_id=case_id, target_kind=req.target_kind,
        target_id=req.target_id, action=req.action, new_value=req.new_value,
        comment=req.comment,
    )
    repo.put("review_actions", ra)

    if req.target_kind == "observation":
        o = repo.get("observations", req.target_id)
        if not o:
            raise HTTPException(404, "Observation not found")
        old_value = o.value
        if req.action == "correct" and req.new_value is not None:
            o.value = req.new_value
            o.review_status = "corrected"
            o.provenance = "direct"
        elif req.action == "accept":
            o.review_status = "accepted"
        elif req.action == "reject":
            o.review_status = "rejected"
        repo.put("observations", o)
        recompute_downstream(case_id)
        audit.log(f"Observation {req.action}", case_id=case_id, actor="reviewer",
                  related_record_kind="observation", related_record_id=o.id,
                  previous_value=old_value, new_value=o.value)
    elif req.target_kind == "relationship":
        r = repo.get("relationships", req.target_id)
        if not r:
            raise HTTPException(404, "Relationship not found")
        prev = r.review_status
        r.review_status = {"accept": "accepted", "reject": "rejected"}.get(req.action, "needs_review")
        repo.put("relationships", r)
        audit.log(f"Relationship {req.action}", case_id=case_id, actor="reviewer",
                  related_record_kind="relationship", related_record_id=r.id,
                  previous_value=prev, new_value=r.review_status)
    elif req.target_kind == "finding":
        f = repo.get("findings", req.target_id)
        if not f:
            raise HTTPException(404, "Finding not found")
        prev = f.review_status
        f.review_status = {"accept": "accepted", "reject": "rejected"}.get(req.action, "needs_review")
        repo.put("findings", f)
        audit.log(f"Finding {req.action}", case_id=case_id, actor="reviewer",
                  related_record_kind="finding", related_record_id=f.id,
                  previous_value=prev, new_value=f.review_status)
    return {"recorded": ra.model_dump(mode="json")}


# --------------------------------------------------------------------------- #
# Reports + exports
# --------------------------------------------------------------------------- #
@app.post("/api/cases/{case_id}/report")
def generate_report(case_id: str, exec_summary: str | None = None, notes: str | None = None):
    _require_case(case_id)
    rep = report_svc.build(case_id, exec_summary_override=exec_summary, notes_override=notes)
    audit.log("Report generated", case_id=case_id, actor="reporter",
              related_record_kind="report_version", related_record_id=rep.id,
              new_value=f"v{rep.version}")
    return rep.model_dump(mode="json")


@app.get("/api/cases/{case_id}/reports")
def list_reports(case_id: str):
    _require_case(case_id)
    return [r.model_dump(mode="json") for r in sorted(repo.list("report_versions", case_id),
                                                      key=lambda r: r.version, reverse=True)]


@app.get("/api/reports/{report_id}")
def get_report(report_id: str):
    rep = repo.get("report_versions", report_id)
    if not rep:
        raise HTTPException(404, "Report not found")
    return rep.model_dump(mode="json")


@app.post("/api/reports/{report_id}/approve")
def approve_report(report_id: str, note: str = ""):
    rep = repo.get("report_versions", report_id)
    if not rep:
        raise HTTPException(404, "Report not found")
    rep.review_status = "approved"
    rep.approval_note = note
    repo.put("report_versions", rep)
    case = repo.get("cases", rep.case_id)
    case.status = CaseStatus.approved
    repo.put("cases", case)
    audit.log("Report approved", case_id=rep.case_id, actor="reviewer",
              related_record_kind="report_version", related_record_id=rep.id)
    return rep.model_dump(mode="json")


@app.get("/api/reports/{report_id}/export")
def export_report(report_id: str, format: str = Query("json", pattern="^(pdf|json|docx|md)$")):
    rep = repo.get("report_versions", report_id)
    if not rep:
        raise HTTPException(404, "Report not found")
    case_id = rep.case_id
    safe = repo.get("cases", case_id).title.replace(" ", "_").replace("—", "-")[:60]
    if format == "json":
        return Response(export_svc.to_json(case_id, report_id), media_type="application/json",
                        headers={"Content-Disposition": f'attachment; filename="{safe}.json"'})
    if format == "md":
        return Response(export_svc.to_markdown(case_id, report_id), media_type="text/markdown",
                        headers={"Content-Disposition": f'attachment; filename="{safe}.md"'})
    if format == "docx":
        data = export_svc.to_docx(case_id, report_id)
        if data is None:
            raise HTTPException(501, "DOCX export unavailable: install python-docx. PDF and JSON are supported.")
        return Response(data,
                        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        headers={"Content-Disposition": f'attachment; filename="{safe}.docx"'})
    return Response(export_svc.to_pdf(case_id, report_id), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{safe}.pdf"'})


# --------------------------------------------------------------------------- #
# Audit
# --------------------------------------------------------------------------- #
@app.get("/api/audit")
def audit_endpoint(case_id: str | None = None, q: str | None = None):
    events = audit.list_events(case_id)
    if q:
        ql = q.lower()
        events = [e for e in events if ql in (e.action + e.actor + (e.related_record_id or "")).lower()]
    return [e.model_dump(mode="json") for e in events]
