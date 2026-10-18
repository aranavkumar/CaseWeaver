export type Status =
  | "pending" | "running" | "completed" | "needs_review" | "failed" | "skipped";

export interface Case {
  id: string;
  title: string;
  description: string;
  category: string;
  incident_date: string | null;
  time_zone: string | null;
  priority: "low" | "medium" | "high" | "critical";
  internal_reference: string | null;
  objective: string;
  status: "draft" | "processing" | "needs_review" | "ready" | "approved";
  is_sample: boolean;
  created_at: string;
  updated_at: string;
}

export interface EvidenceItem {
  id: string;
  case_id: string;
  original_filename: string;
  evidence_label: string;
  file_type: string;
  source_type: string;
  size_bytes: number;
  sha256: string;
  uploaded_at: string;
  processing_status: Status;
  extraction_status: Status;
  review_status: string;
  stored_path: string | null;
  derived_text: string;
  is_synthetic: boolean;
  extraction_method: string;
  notes: string;
}

export interface Observation {
  id: string;
  case_id: string;
  evidence_id: string;
  field_type: string;
  value: string;
  source_passage: string;
  extraction_method: string;
  provenance: "direct" | "inferred";
  confidence: number;
  review_status: string;
  ambiguity: string;
  char_start: number | null;
  char_end: number | null;
}

export interface Relationship {
  id: string;
  case_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  supporting_observation_ids: string[];
  match_method: string;
  confidence: number;
  review_status: string;
  explanation: string;
  contradicting_evidence: string;
  is_inferred: boolean;
}

export interface TimelineEvent {
  id: string;
  case_id: string;
  description: string;
  timestamp_raw: string;
  timestamp_iso: string | null;
  time_zone: string | null;
  is_approximate: boolean;
  timestamp_origin: string;
  evidence_ids: string[];
  observation_ids: string[];
  source_reliability: string;
  conflicting_event_ids: string[];
  unresolved_question: string;
}

export interface ResearchQuery {
  id: string;
  question: string;
  tool: string;
  query_input: string;
  status: Status;
}

export interface ResearchResult {
  id: string;
  query_id: string;
  source_url: string | null;
  retrieval_time: string;
  returned_observation: string;
  is_simulated: boolean;
  source_kind: string;
  limitations: string;
}

export interface Finding {
  id: string;
  case_id: string;
  statement: string;
  claim_type: string;
  supporting_observation_ids: string[];
  supporting_relationship_ids: string[];
  supporting_evidence_ids: string[];
  evidence_labels?: string[];
  contradicted_by: string;
  review_status: string;
  requires_human_review: boolean;
  verified: boolean;
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  normalized: string;
  observation_ids: string[];
  evidence_ids: string[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship_type: string;
  match_method: string;
  confidence: number;
  review_status: string;
  explanation: string;
  contradicting_evidence: string;
  is_inferred: boolean;
  supporting_observation_ids: string[];
  supporting_evidence_ids: string[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  corroborations: {
    entity_id: string;
    explanation: string;
    review_status: string;
    supporting_observation_ids: string[];
  }[];
}

export interface AgentStage {
  id: string;
  run_id: string;
  name: string;
  order: number;
  agent: string;
  action: string;
  status: Status;
  tool_calls: string[];
  inputs: string;
  outputs: string;
  records_created: number;
  records_updated: number;
  duration_ms: number | null;
  error: string;
  data_source: string;
}

export interface AgentRun {
  id: string;
  case_id: string;
  status: Status;
  error: string;
  started_at: string;
  finished_at: string | null;
}

export interface RunDetail {
  run: AgentRun;
  stages: AgentStage[];
}

export interface AuditEvent {
  id: string;
  case_id: string | null;
  timestamp: string;
  actor: string;
  action: string;
  related_record_kind: string;
  related_record_id: string;
  previous_value: string | null;
  new_value: string | null;
  outcome: string;
}

export interface ReportVersion {
  id: string;
  case_id: string;
  version: number;
  generated_at: string;
  executive_summary: string;
  body_markdown: string;
  review_status: string;
  approval_note: string;
  disclaimer: string;
}

export interface Overview {
  totals: {
    investigations: number;
    evidence_processed: number;
    findings_awaiting_review: number;
    reports_generated: number;
  };
  status_distribution: Record<string, number>;
  recent_investigations: Case[];
  recent_activity: AuditEvent[];
}

export interface Settings {
  mode: string;
  allowed_extensions: string[];
  max_upload_bytes: number;
  integrations: Record<string, { configured: boolean; note: string }>;
  privacy: string;
}

export interface Workspace {
  case: Case;
  evidence: EvidenceItem[];
  observations: Observation[];
  entities: { id: string; entity_type: string; normalized_value: string; display_label: string; observation_ids: string[] }[];
  relationships: Relationship[];
  timeline: TimelineEvent[];
  findings: Finding[];
  research_queries: ResearchQuery[];
  research_results: ResearchResult[];
}

export interface EvidenceDetail {
  item: EvidenceItem;
  observations: Observation[];
  timeline_events: TimelineEvent[];
  hash_note: string;
}
