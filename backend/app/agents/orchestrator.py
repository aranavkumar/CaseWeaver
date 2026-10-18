"""CaseWeaver investigation orchestrator.

A real state machine (not a scripted animation). Each stage performs actual
deterministic work and creates/updates records in the repository. Statuses:
pending | running | completed | needs_review | failed | skipped.

Supports start / pause(when safe) / resume / cancel / retry-failed-stage and
prevents duplicate concurrent runs for a case.
"""
from __future__ import annotations

import threading
import time
import traceback

from ..db import repo
from ..util import new_id
from ..schemas import (
    AgentRun,
    AgentStage,
    CaseStatus,
    ProcessingStatus,
    STAGE_ORDER,
)
from ..services import (
    audit,
    entity_resolution,
    extraction,
    report as report_svc,
    research,
    timeline as timeline_svc,
    verification,
)

STAGE_META = {
    "planning": ("planner", "Determine required stages from case objective and available evidence."),
    "extraction": ("extraction_agent", "Extract structured observations from each evidence item."),
    "research": ("research_agent", "Formulate research questions and answer via mock/live adapter."),
    "entity_resolution": ("correlation_agent", "Normalise entities and build corroborated relationships."),
    "timeline": ("timeline_agent", "Reconstruct a contradiction-preserving chronological timeline."),
    "verification": ("verifier", "Check each finding against the evidence ledger deterministically."),
    "human_review": ("review_gate", "Queue uncertain items; await human decisions."),
    "report": ("reporter", "Generate the evidence-linked investigation report."),
}

# ordered human-readable console lines for stage 1..N (mirrors spec's sample sequence)
STAGE_ACTION = {
    "planning": "Initializing the case and planning steps",
    "extraction": "Loading evidence and extracting observations",
    "entity_resolution": "Normalizing entities, searching repeated identifiers, constructing relationships",
    "research": "Answering research questions (simulated adapter)",
    "timeline": "Reconstructing the timeline",
    "verification": "Verifying report claims against the ledger",
    "report": "Preparing the report",
    "human_review": "Waiting for human approval",
}

_lock = threading.Lock()


def _active_run_id(case_id: str) -> str | None:
    for r in repo.list("agent_runs", case_id):
        if r.status == ProcessingStatus.running:
            return r.id
    return None


def start_run(case_id: str, *, is_sample: bool = False) -> str:
    """Create a run + its stages (idempotent) and execute in a worker thread.
    Refuses to launch a duplicate concurrent run for the same case."""
    with _lock:
        if _active_run_id(case_id):
            raise RuntimeError("An investigation run is already in progress for this case.")
        run = AgentRun(id=new_id("run"), case_id=case_id, status=ProcessingStatus.running)
        repo.put("agent_runs", run)
        # each run gets its own fresh set of stage rows
        for idx, name in enumerate(STAGE_ORDER):
            agent, action = STAGE_META[name]
            repo.put("agent_stages", AgentStage(
                id=new_id("stg"), run_id=run.id, case_id=case_id,
                name=name, order=idx, agent=agent, action=action,
            ))
        audit.log("Investigation run started", case_id=case_id, actor="orchestrator",
                  related_record_kind="agent_run", related_record_id=run.id)
    threading.Thread(target=_drive, args=(run.id, case_id), daemon=True).start()
    return run.id


def get_run(run_id: str) -> dict:
    run = repo.get("agent_runs", run_id)
    stages = sorted([s for s in repo.list("agent_stages", run.case_id) if s.run_id == run_id],
                    key=lambda s: s.order)
    return {"run": run.model_dump(mode="json"), "stages": [s.model_dump(mode="json") for s in stages]}


def request_pause(run_id: str) -> None:
    run = repo.get("agent_runs", run_id)
    run.pause_requested = True
    repo.put("agent_runs", run)


def request_resume(run_id: str) -> None:
    run = repo.get("agent_runs", run_id)
    run.pause_requested = False
    if run.status in (ProcessingStatus.pending,):
        run.status = ProcessingStatus.running
        repo.put("agent_runs", run)
        threading.Thread(target=_drive, args=(run.id, run.case_id), daemon=True).start()
    else:
        repo.put("agent_runs", run)


def request_cancel(run_id: str) -> None:
    run = repo.get("agent_runs", run_id)
    run.cancel_requested = True
    repo.put("agent_runs", run)


def retry_stage(run_id: str, stage_name: str) -> None:
    """Re-run a single (failed) stage and continue the rest."""
    run = repo.get("agent_runs", run_id)
    if _active_run_id(run.case_id):
        raise RuntimeError("Another run is active; wait for it to finish.")
    for s in repo.list("agent_stages", run.case_id):
        if s.name == stage_name and s.status == ProcessingStatus.failed:
            s.status = ProcessingStatus.pending
            s.error = ""
            repo.put("agent_stages", s)
    run.status = ProcessingStatus.running
    run.cancel_requested = False
    repo.put("agent_runs", run)
    threading.Thread(target=_drive, args=(run.id, run.case_id, stage_name), daemon=True).start()


def _drive(run_id: str, case_id: str, start_from: str | None = None) -> None:
    run = repo.get("agent_runs", run_id)
    stages = {s.name: s for s in repo.list("agent_stages", case_id) if s.run_id == run_id}

    start_idx = 0
    if start_from and start_from in stages:
        start_idx = stages[start_from].order

    if start_idx > 0:
        # mark completed upstream so we skip them on retry
        pass

    for name in STAGE_ORDER[start_idx:]:
        st = stages[name]
        if st.status in (ProcessingStatus.completed, ProcessingStatus.skipped):
            continue
        run = repo.get("agent_runs", run_id)
        if run.cancel_requested:
            _finish(run_id, case_id, ProcessingStatus.skipped, "Cancelled by user.")
            return
        # pause-at-safe-point
        run = repo.get("agent_runs", run_id)
        if run.pause_requested:
            _update_stage(run_id, case_id, name, status=ProcessingStatus.pending)
            _finish(run_id, case_id, ProcessingStatus.pending, "Paused at safe point.")
            return

        _update_stage(run_id, case_id, name, status=ProcessingStatus.running,
                      started_at=time.time())
        t0 = time.perf_counter()
        try:
            created, updated = _execute_stage(name, case_id)
            dur = int((time.perf_counter() - t0) * 1000)  # real measured duration
            new_status = ProcessingStatus.needs_review if name == "human_review" else ProcessingStatus.completed
            _update_stage(run_id, case_id, name, status=new_status,
                          records_created=created, records_updated=updated,
                          duration_ms=dur, finished_at=time.time())
        except Exception as exc:  # noqa: BLE001
            dur = int((time.perf_counter() - t0) * 1000)
            _update_stage(run_id, case_id, name, status=ProcessingStatus.failed,
                          error=f"{exc}", duration_ms=dur, finished_at=time.time())
            traceback.print_exc()
            # preserve completed work; stop the run but keep records
            _finish(run_id, case_id, ProcessingStatus.failed, f"Stage '{name}' failed: {exc}")
            return

    # normal completion
    _finish(run_id, case_id, ProcessingStatus.needs_review,
            "All stages complete; awaiting human review.")


def _execute_stage(name: str, case_id: str) -> tuple[int, int]:
    """Each returns (records_created, records_updated) for the console."""
    if name == "planning":
        evidence = repo.list("evidence", case_id)
        planned = STAGE_ORDER[1:] if evidence else ["report"]
        _set_stage_output(case_id, name, f"Objective: {repo.get('cases', case_id).objective or 'n/a'} | "
                                         f"Planned steps: {', '.join(planned)} | "
                                         f"Evidence available: {len(evidence)} item(s)")
        return 0, len(planned)
    if name == "extraction":
        evidence = repo.list("evidence", case_id)
        obs = extraction.run(evidence)
        return len(obs), 0
    if name == "research":
        q, r = research.run_for_case(case_id)
        return len(q) + len(r), 0
    if name == "entity_resolution":
        observations = repo.list("observations", case_id)
        entities, rels = entity_resolution.run(case_id, observations)
        return len(entities) + len(rels), 0
    if name == "timeline":
        observations = repo.list("observations", case_id)
        events = timeline_svc.run(case_id, observations)
        return len(events), 0
    if name == "verification":
        findings = verification.build_findings(case_id)
        return len(findings), 0
    if name == "human_review":
        # gate: does not auto-approve; case moves to needs_review
        case = repo.get("cases", case_id)
        case.status = CaseStatus.needs_review
        repo.put("cases", case)
        return 0, 1
    if name == "report":
        rep = report_svc.build(case_id)
        return 1, 0
    return 0, 0


def _set_stage_output(case_id: str, name: str, text: str) -> None:
    for s in repo.list("agent_stages", case_id):
        if s.name == name and s.status != ProcessingStatus.completed:
            s.outputs = text
            repo.put("agent_stages", s)
            return


def _update_stage(run_id: str, case_id: str, name: str, **changes) -> None:
    for s in repo.list("agent_stages", case_id):
        if s.run_id == run_id and s.name == name:
            for k, v in changes.items():
                if k == "started_at":
                    from datetime import datetime
                    s.started_at = datetime.fromtimestamp(v)
                elif k == "finished_at":
                    from datetime import datetime
                    s.finished_at = datetime.fromtimestamp(v)
                else:
                    setattr(s, k, v)
            repo.put("agent_stages", s)
            return


def _finish(run_id: str, case_id: str, status: ProcessingStatus, note: str) -> None:
    run = repo.get("agent_runs", run_id)
    run.status = status
    run.finished_at = None if status == ProcessingStatus.running else run.finished_at
    from datetime import datetime
    if status in (ProcessingStatus.completed, ProcessingStatus.needs_review,
                  ProcessingStatus.failed, ProcessingStatus.skipped):
        run.finished_at = datetime.utcnow()
    run.error = note if status == ProcessingStatus.failed else ""
    repo.put("agent_runs", run)
    audit.log(f"Investigation run {status.value}", case_id=case_id, actor="orchestrator",
              related_record_kind="agent_run", related_record_id=run_id, outcome=note)
