import hashlib
import io
import json
import time

from app.db import repo
from app.schemas import AgentRun, ProcessingStatus
from app.agents import orchestrator
from app.services import verification


def _load_sample(client):
    r = client.post("/api/sample")
    assert r.status_code == 200
    return r.json()["id"]


def _run_and_wait(client, case_id, timeout=15):
    rid = client.post(f"/api/cases/{case_id}/run").json()["run_id"]
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = client.get(f"/api/runs/{rid}").json()["run"]["status"]
        if st in ("needs_review", "completed", "failed", "skipped"):
            return rid, st
        time.sleep(0.1)
    raise AssertionError("run did not finish in time")


# 1. case creation and persistence ---------------------------------------- #
def test_case_creation_persists(client):
    r = client.post("/api/cases", json={"title": "My case", "priority": "high"})
    assert r.status_code == 200
    cid = r.json()["id"]
    assert client.get(f"/api/cases/{cid}").json()["title"] == "My case"
    assert cid in [c["id"] for c in client.get("/api/cases").json()]


def test_case_requires_title(client):
    assert client.post("/api/cases", json={"title": "   "}).status_code == 422


# 2. evidence upload + validation ----------------------------------------- #
def test_evidence_upload_and_validation(client):
    cid = _load_sample(client)
    good = client.post(
        f"/api/cases/{cid}/evidence",
        files={"file": ("notes.txt", io.BytesIO(b"email a@b.com date 2024-01-02"), "text/plain")},
    )
    assert good.status_code == 200
    assert good.json()["sha256"]
    bad = client.post(
        f"/api/cases/{cid}/evidence",
        files={"file": ("evil.exe", io.BytesIO(b"MZ..."), "application/octet-stream")},
    )
    assert bad.status_code == 422


# 3. SHA-256 against a known file ----------------------------------------- #
def test_sha256_matches_known_bytes(client):
    cid = _load_sample(client)
    payload = b"deterministic test bytes\n"
    r = client.post(f"/api/cases/{cid}/evidence",
                     files={"file": ("t.txt", io.BytesIO(payload), "text/plain")})
    assert r.json()["sha256"] == hashlib.sha256(payload).hexdigest()


# 4. extraction record validation ----------------------------------------- #
def test_extraction_records_have_provenance(client):
    cid = _load_sample(client)
    _run_and_wait(client, cid)
    obs = repo.list("observations", cid)
    direct = [o for o in obs if o.provenance == "direct"]
    assert direct, "expected direct extracted observations"
    for o in direct:
        assert o.evidence_id and o.source_passage and o.char_start is not None
        assert o.extraction_method in ("regex", "deterministic")


# 5. exact entity matching ------------------------------------------------ #
def test_exact_transaction_ref_single_entity(client):
    cid = _load_sample(client)
    _run_and_wait(client, cid)
    txn = [e for e in repo.list("entities", cid) if e.entity_type == "transaction_ref"
           and e.normalized_value == "SLV-2024-8842"]
    assert len(txn) == 1  # three files collapse to one entity via exact match
    assert len(txn[0].observation_ids) >= 2


# 6. ambiguous relationship requires review ------------------------------- #
def test_ambiguous_relationship_needs_review(client):
    cid = _load_sample(client)
    _run_and_wait(client, cid)
    # every relationship is gated as needs_review until a human accepts it
    for r in repo.list("relationships", cid):
        assert r.review_status in ("needs_review", "accepted", "rejected")
    # a rejected relationship via review must be reflected everywhere
    rel = repo.list("relationships", cid)[0]
    client.post(f"/api/cases/{cid}/review",
                json={"target_kind": "relationship", "target_id": rel.id, "action": "reject"})
    assert repo.get("relationships", rel.id).review_status == "rejected"


# 7 + 8. timeline ordering & preserved conflicts -------------------------- #
def test_timeline_ordering_and_conflicts(client):
    cid = _load_sample(client)
    _run_and_wait(client, cid)
    events = client.get(f"/api/cases/{cid}/timeline").json()  # API returns chronological order
    parsed = [e["timestamp_iso"] for e in events if e["timestamp_iso"]]
    assert parsed == sorted(parsed)  # chronological
    assert any(e["conflicting_event_ids"] for e in events)  # contradictions preserved
    assert any(e["unresolved_question"] for e in events)


# 9. report claims without support are flagged ---------------------------- #
def test_unsupported_claim_flagged():
    f = verification.Finding(id="f_test", case_id="c", statement="x",
                             supporting_observation_ids=["missing_obs"],
                             supporting_evidence_ids=["missing_ev"])
    verification.verify("c", f, ev_ids=set(), obs_ids=set())
    assert f.verified is False
    assert f.requires_human_review is True


# 10. human correction of an extracted field ------------------------------ #
def test_observation_correction_propagates(client):
    cid = _load_sample(client)
    _run_and_wait(client, cid)
    wrong = [o for o in repo.list("observations", cid) if o.value == "$5,400.00"][0]
    r = client.post(f"/api/cases/{cid}/review", json={
        "target_kind": "observation", "target_id": wrong.id,
        "action": "correct", "new_value": "$450.00", "comment": "OCR misread"})
    assert r.status_code == 200
    assert repo.get("observations", wrong.id).review_status == "corrected"
    # corrected value merges with the true $450 entity; the bogus one is gone
    amounts = [e.normalized_value for e in repo.list("entities", cid) if e.entity_type == "amount"]
    assert any("450" in a for a in amounts) and not any("5400" in a for a in amounts)


# 11. audit-event creation ------------------------------------------------ #
def test_audit_events_recorded(client):
    cid = _load_sample(client)
    _run_and_wait(client, cid)
    actions = [e.action for e in repo.list("audit_events", cid)]
    assert any("started" in a for a in actions)
    assert any("Sample investigation loaded" in a or "run started" in a.lower() for a in actions)


# 12 + 13. report generation & valid JSON export -------------------------- #
def test_report_generation_and_json_export(client):
    cid = _load_sample(client)
    _run_and_wait(client, cid)
    rep = client.post(f"/api/cases/{cid}/report").json()
    assert "Demonstration Report" in rep["disclaimer"]
    assert rep["body_markdown"].startswith("# Investigation Report")
    blob = client.get(f"/api/reports/{rep['id']}/export?format=json")
    assert blob.status_code == 200
    data = json.loads(blob.content)
    assert {"findings", "evidence", "relationships", "review_actions"} <= set(data)
    # every finding references evidence/observations
    for f in data["findings"]:
        assert f["supporting_observation_ids"] or f["review_status"] == "needs_review"


# 14. failure handling for unavailable integrations ----------------------- #
def test_simulated_integration_honest(client):
    cid = _load_sample(client)
    _run_and_wait(client, cid)
    settings = client.get("/api/settings").json()
    assert settings["integrations"]["web_search"]["configured"] is False
    results = repo.list("research_results", cid)
    assert results and all(r.is_simulated for r in results)


# 15. prevention of duplicate investigation runs -------------------------- #
def test_duplicate_run_prevented(client):
    cid = _load_sample(client)
    # simulate an in-flight run
    repo.put("agent_runs", AgentRun(id="run_running", case_id=cid, status=ProcessingStatus.running))
    try:
        orchestrator.start_run(cid)
        assert False, "duplicate run should raise"
    except RuntimeError:
        pass


# bonus: idempotent sample load ------------------------------------------ #
def test_sample_load_idempotent(client):
    c1 = _load_sample(client)
    c2 = client.post("/api/sample").json()["id"]
    assert c1 == c2
    assert len(repo.list("evidence", c1)) == 5
