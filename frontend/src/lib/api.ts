import type * as T from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const jpost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: () => req<{ status: string; mode: string }>("/api/health"),
  settings: () => req<T.Settings>("/api/settings"),
  overview: () => req<T.Overview>("/api/overview"),
  listCases: () => req<T.Case[]>("/api/cases"),
  createCase: (c: {
    title: string; description?: string; category?: string; incident_date?: string | null;
    time_zone?: string | null; priority?: string; internal_reference?: string | null;
    objective?: string; use_sample?: boolean;
  }) => req<T.Case>("/api/cases", jpost(c)),
  loadSample: (force = false) => req<T.Case>(`/api/sample?force=${force}`, { method: "POST" }),
  getCase: (id: string) => req<T.Case>(`/api/cases/${id}`),
  workspace: (id: string) => req<T.Workspace>(`/api/cases/${id}/workspace`),
  deleteCase: (id: string) => req(`/api/cases/${id}`, { method: "DELETE" }),

  listEvidence: (id: string) => req<T.EvidenceItem[]>(`/api/cases/${id}/evidence`),
  uploadEvidence: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<T.EvidenceItem>(`/api/cases/${id}/evidence`, { method: "POST", body: fd });
  },
  getEvidence: (evId: string) => req<T.EvidenceDetail>(`/api/evidence/${evId}`),
  deleteEvidence: (evId: string) => req(`/api/evidence/${evId}`, { method: "DELETE" }),

  runCase: (id: string) => req<{ run_id: string }>(`/api/cases/${id}/run`, { method: "POST" }),
  getRun: (runId: string) => req<T.RunDetail>(`/api/runs/${runId}`),
  pauseRun: (runId: string) => req(`/api/runs/${runId}/pause`, { method: "POST" }),
  resumeRun: (runId: string) => req(`/api/runs/${runId}/resume`, { method: "POST" }),
  cancelRun: (runId: string) => req(`/api/runs/${runId}/cancel`, { method: "POST" }),
  retryStage: (runId: string, stage: string) =>
    req(`/api/runs/${runId}/retry/${stage}`, { method: "POST" }),

  graph: (id: string) => req<T.GraphData>(`/api/cases/${id}/graph`),
  timeline: (id: string) => req<T.TimelineEvent[]>(`/api/cases/${id}/timeline`),
  research: (id: string) =>
    req<{ queries: T.ResearchQuery[]; results: T.ResearchResult[]; live_mode: boolean }>(
      `/api/cases/${id}/research`,
    ),
  findings: (id: string) => req<T.Finding[]>(`/api/cases/${id}/findings`),

  review: (id: string, body: {
    target_kind: string; target_id: string; action: string; new_value?: string; comment?: string;
  }) => req(`/api/cases/${id}/review`, jpost(body)),

  generateReport: (id: string, execSummary?: string, notes?: string) => {
    const p = new URLSearchParams();
    if (execSummary) p.set("exec_summary", execSummary);
    if (notes) p.set("notes", notes);
    const qs = p.toString();
    return req<T.ReportVersion>(`/api/cases/${id}/report${qs ? `?${qs}` : ""}`, { method: "POST" });
  },
  listReports: (id: string) => req<T.ReportVersion[]>(`/api/cases/${id}/reports`),
  getReport: (rid: string) => req<T.ReportVersion>(`/api/reports/${rid}`),
  approveReport: (rid: string, note: string) =>
    req<T.ReportVersion>(`/api/reports/${rid}/approve?note=${encodeURIComponent(note)}`, { method: "POST" }),
  exportUrl: (rid: string, format: "pdf" | "json" | "docx" | "md") =>
    `${API_BASE}/api/reports/${rid}/export?format=${format}`,

  audit: (caseId?: string, q?: string) => {
    const p = new URLSearchParams();
    if (caseId) p.set("case_id", caseId);
    if (q) p.set("q", q);
    const qs = p.toString();
    return req<T.AuditEvent[]>(`/api/audit${qs ? `?${qs}` : ""}`);
  },
};
