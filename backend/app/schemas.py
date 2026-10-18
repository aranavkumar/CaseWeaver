"""Pydantic schemas defining CaseWeaver's data model and provenance rules.

Every important finding traces to observations; every observation traces to an
evidence item or external source. Typed schemas (not arbitrary dicts) are used
for all important application data.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


def now() -> datetime:
    return datetime.utcnow()


# --------------------------------------------------------------------------- #
# Enumerations
# --------------------------------------------------------------------------- #
class Priority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class IncidentCategory(str, Enum):
    suspected_online_scam = "Suspected online scam"
    suspicious_communication = "Suspicious communication"
    payment_dispute = "Payment dispute"
    phishing_incident = "Phishing incident"
    suspicious_website = "Suspicious website"
    other_digital_incident = "Other digital incident"


class CaseStatus(str, Enum):
    draft = "draft"
    processing = "processing"
    needs_review = "needs_review"
    ready = "ready"
    approved = "approved"


class ProcessingStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    needs_review = "needs_review"
    failed = "failed"
    skipped = "skipped"


class SourceType(str, Enum):
    image = "image"
    pdf = "pdf"
    text = "text"
    csv = "csv"
    json = "json"
    email = "email"
    website_record = "website_record"
    note = "note"


# --------------------------------------------------------------------------- #
# Case
# --------------------------------------------------------------------------- #
class Case(BaseModel):
    id: str
    title: str
    description: str = ""
    category: IncidentCategory = IncidentCategory.other_digital_incident
    incident_date: Optional[str] = None          # kept as free text to preserve uncertainty
    time_zone: Optional[str] = None
    priority: Priority = Priority.medium
    internal_reference: Optional[str] = None
    objective: str = ""
    status: CaseStatus = CaseStatus.draft
    is_sample: bool = False
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


# --------------------------------------------------------------------------- #
# Evidence
# --------------------------------------------------------------------------- #
class EvidenceItem(BaseModel):
    id: str
    case_id: str
    original_filename: str
    evidence_label: str = ""                      # e.g. "A — Messaging screenshot"
    file_type: str = ""                           # mime or extension
    source_type: SourceType = SourceType.text
    size_bytes: int = 0
    sha256: str = ""
    uploaded_at: datetime = Field(default_factory=now)
    processing_status: ProcessingStatus = ProcessingStatus.pending
    extraction_status: ProcessingStatus = ProcessingStatus.pending
    review_status: str = "unreviewed"             # unreviewed | accepted | rejected | corrected
    stored_path: Optional[str] = None             # path to preserved ORIGINAL bytes
    derived_text: str = ""                        # extracted text (derived, never overwrites original)
    is_synthetic: bool = False                    # sample/demo fixture vs real upload
    extraction_method: str = "manual_fixture"
    notes: str = ""


# --------------------------------------------------------------------------- #
# Observations (the atomic provenance unit)
# --------------------------------------------------------------------------- #
class Observation(BaseModel):
    id: str
    case_id: str
    evidence_id: str
    field_type: str                               # email | url | amount | transaction_ref | ...
    value: str
    source_passage: str = ""                      # the extracted text that supports it
    extraction_method: str = "regex"              # regex | deterministic | vision_ocr | model_inferred | manual_fixture
    provenance: str = "direct"                    # direct (extracted) | inferred (model)
    confidence: float = 1.0
    review_status: str = "unreviewed"             # unreviewed | accepted | rejected | corrected
    ambiguity: str = ""
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    created_at: datetime = Field(default_factory=now)


# --------------------------------------------------------------------------- #
# Entities
# --------------------------------------------------------------------------- #
class Entity(BaseModel):
    id: str
    case_id: str
    entity_type: str                              # person | organization | email | phone | url | transaction | listing | event
    normalized_value: str
    display_label: str = ""
    observation_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=now)


class Relationship(BaseModel):
    id: str
    case_id: str
    source_entity_id: str
    target_entity_id: str
    relationship_type: str                        # appears_in | references_transaction | contradicts | supports | ...
    supporting_observation_ids: list[str] = Field(default_factory=list)
    match_method: str = "exact"                   # exact | ambiguous | inferred
    confidence: float = 1.0
    review_status: str = "needs_review"           # needs_review | accepted | rejected
    explanation: str = ""
    contradicting_evidence: str = ""
    is_inferred: bool = False
    created_at: datetime = Field(default_factory=now)


# --------------------------------------------------------------------------- #
# Timeline
# --------------------------------------------------------------------------- #
class TimelineEvent(BaseModel):
    id: str
    case_id: str
    description: str
    timestamp_raw: str = ""                       # preserve original string
    timestamp_iso: Optional[str] = None           # normalised if parseable
    time_zone: Optional[str] = None
    is_approximate: bool = False
    timestamp_origin: str = "observed"            # observed | inferred
    evidence_ids: list[str] = Field(default_factory=list)
    observation_ids: list[str] = Field(default_factory=list)
    source_reliability: str = "direct"            # direct | secondary | uncertain
    conflicting_event_ids: list[str] = Field(default_factory=list)
    unresolved_question: str = ""
    created_at: datetime = Field(default_factory=now)


# --------------------------------------------------------------------------- #
# Research
# --------------------------------------------------------------------------- #
class ResearchQuery(BaseModel):
    id: str
    case_id: str
    question: str
    tool: str = "mock_adapter"                    # mock_adapter | search_api | url_scan
    query_input: str = ""
    status: ProcessingStatus = ProcessingStatus.pending
    created_at: datetime = Field(default_factory=now)


class ResearchResult(BaseModel):
    id: str
    case_id: str
    query_id: str
    source_url: Optional[str] = None
    retrieval_time: datetime = Field(default_factory=now)
    returned_observation: str = ""
    is_simulated: bool = True                     # honest disclosure flag
    source_kind: str = "fixture"                  # fixture | live | user_document
    limitations: str = ""
    linked_observation_ids: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Findings + review
# --------------------------------------------------------------------------- #
class Finding(BaseModel):
    id: str
    case_id: str
    statement: str
    claim_type: str = "observation"               # observation | corroborated | inference | unresolved
    supporting_observation_ids: list[str] = Field(default_factory=list)
    supporting_relationship_ids: list[str] = Field(default_factory=list)
    supporting_evidence_ids: list[str] = Field(default_factory=list)
    contradicted_by: str = ""
    review_status: str = "needs_review"           # needs_review | accepted | rejected
    requires_human_review: bool = True
    verified: bool = False
    created_at: datetime = Field(default_factory=now)


class ReviewAction(BaseModel):
    id: str
    case_id: str
    target_kind: str                              # finding | relationship | observation | question | report
    target_id: str
    action: str                                   # accept | reject | correct | note | request_reanalysis | approve_report
    actor: str = "reviewer"
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    comment: str = ""
    created_at: datetime = Field(default_factory=now)


# --------------------------------------------------------------------------- #
# Agent run console
# --------------------------------------------------------------------------- #
STAGE_ORDER: list[str] = [
    "planning",
    "extraction",
    "research",
    "entity_resolution",
    "timeline",
    "verification",
    "human_review",
    "report",
]


class AgentStage(BaseModel):
    id: str
    run_id: str
    case_id: str
    name: str
    order: int
    agent: str = "orchestrator"
    action: str = ""
    status: ProcessingStatus = ProcessingStatus.pending
    tool_calls: list[str] = Field(default_factory=list)
    inputs: str = ""
    outputs: str = ""
    records_created: int = 0
    records_updated: int = 0
    duration_ms: Optional[int] = None             # measured only when actually run
    error: str = ""
    data_source: str = "live_compute"             # live_compute | sample_dataset
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class AgentRun(BaseModel):
    id: str
    case_id: str
    status: ProcessingStatus = ProcessingStatus.pending
    started_at: datetime = Field(default_factory=now)
    finished_at: Optional[datetime] = None
    pause_requested: bool = False
    cancel_requested: bool = False
    error: str = ""


# --------------------------------------------------------------------------- #
# Audit
# --------------------------------------------------------------------------- #
class AuditEvent(BaseModel):
    id: str
    case_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=now)
    actor: str = "system"
    action: str = ""
    related_record_kind: str = ""
    related_record_id: str = ""
    previous_value: Optional[str] = None
    new_value: Optional[str] = None
    outcome: str = "success"


# --------------------------------------------------------------------------- #
# Reports
# --------------------------------------------------------------------------- #
class ReportVersion(BaseModel):
    id: str
    case_id: str
    version: int = 1
    generated_at: datetime = Field(default_factory=now)
    executive_summary: str = ""
    body_markdown: str = ""
    review_status: str = "draft"                  # draft | approved
    approval_note: str = ""
    disclaimer: str = "Demonstration Report — Not a Certified Forensic Report"


# --------------------------------------------------------------------------- #
# API composite payloads
# --------------------------------------------------------------------------- #
class CaseWorkspace(BaseModel):
    case: Case
    evidence: list[EvidenceItem] = Field(default_factory=list)
    observations: list[Observation] = Field(default_factory=list)
    entities: list[Entity] = Field(default_factory=list)
    relationships: list[Relationship] = Field(default_factory=list)
    timeline: list[TimelineEvent] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    research_queries: list[ResearchQuery] = Field(default_factory=list)
    research_results: list[ResearchResult] = Field(default_factory=list)


class CreateCaseRequest(BaseModel):
    title: str = Field(min_length=1)
    description: str = ""
    category: IncidentCategory = IncidentCategory.other_digital_incident
    incident_date: Optional[str] = None
    time_zone: Optional[str] = None
    priority: Priority = Priority.medium
    internal_reference: Optional[str] = None
    objective: str = ""
    use_sample: bool = False


class ReviewDecisionRequest(BaseModel):
    target_kind: str
    target_id: str
    action: str
    new_value: Optional[str] = None
    comment: str = ""
