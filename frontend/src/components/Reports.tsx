"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Download, Check, X, ShieldCheck, RefreshCw, PenLine } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Finding, ReportVersion } from "@/lib/types";
import { Card, Button, Tag, Badge, Tabs, Spinner, EmptyState, Textarea, ConfirmDialog } from "./ui";

type Tone = "default" | "info" | "warn" | "ok" | "danger" | "accent";
const CLAIM_TONE: Record<string, Tone> = {
  observation: "info", corroborated: "ok", inference: "warn", unresolved: "danger",
};

export function Reports() {
  const { currentCase, toast, refreshCases, setSection } = useStore();
  const [tab, setTab] = useState("review");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [reports, setReports] = useState<ReportVersion[]>([]);
  const [report, setReport] = useState<ReportVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exec, setExec] = useState("");
  const [notes, setNotes] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);

  const load = useCallback(async () => {
    if (!currentCase) { setLoading(false); return; }
    setLoading(true);
    try {
      const [f, r] = await Promise.all([api.findings(currentCase.id), api.listReports(currentCase.id)]);
      setFindings(f); setReports(r);
      if (r.length) { setReport(r[0]); setExec(r[0].executive_summary); setNotes(""); }
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  }, [currentCase, toast]);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => findings.filter((f) => f.review_status === "needs_review"), [findings]);

  const decide = async (f: Finding, action: "accept" | "reject") => {
    try {
      await api.review(currentCase!.id, { target_kind: "finding", target_id: f.id, action, comment: action === "reject" ? "Reviewer rejected claim" : "Reviewer accepted claim" });
      toast(`Finding ${action === "accept" ? "accepted" : "rejected"}`, "success");
      load();
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api.generateReport(currentCase!.id, exec || undefined, notes || undefined);
      setReport(r); toast("Report generated from current case state", "success");
      load();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };

  const approve = async () => {
    if (!report) return;
    try {
      await api.approveReport(report.id, "Reviewed and approved in demo");
      toast("Report approved", "success");
      await refreshCases(); load(); setApproveOpen(false);
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const download = (fmt: "pdf" | "json" | "docx" | "md") => {
    if (!report) return;
    if (fmt === "docx") { toast("DOCX requires python-docx on the backend; PDF/JSON/MD are available", "info"); }
    window.open(api.exportUrl(report.id, fmt), "_blank");
  };

  if (!currentCase) return <EmptyState title="No case selected" message="Select an investigation to review findings and generate its report." action={<Button onClick={() => setSection("investigations")}>Go to Investigations</Button>} />;
  if (loading) return <div className="flex items-center gap-3 text-[var(--fg-muted)]"><Spinner /> Loading…</div>;

  const noRun = findings.length === 0;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Reports & Review</h1>
        <p className="mt-1 text-[13px] text-[var(--fg-muted)]">Generate the report only from reviewed, structured records. Findings can be corrected, accepted or rejected before export.</p>
      </header>

      {noRun && (
        <Card className="flex items-center justify-between gap-3 border-[var(--warn)]/30 bg-[var(--warn)]/6 p-4">
          <span className="text-[13px] text-[var(--fg-muted)]">No findings yet — run the investigation to extract, correlate and verify.</span>
          <Button variant="primary" onClick={() => setSection("evidence")}><RefreshCw size={14} /> Open workspace to run</Button>
        </Card>
      )}

      <Tabs tabs={[{ id: "review", label: `Review queue (${pending.length})` }, { id: "report", label: "Report preview" }]} active={tab} onChange={setTab} />

      {tab === "review" && (
        <div className="space-y-2.5">
          {findings.length === 0 ? <EmptyState title="Nothing to review" message="Run an investigation to produce findings." /> :
            findings.map((f) => (
              <Card key={f.id} className={`p-4 ${f.review_status === "needs_review" ? "" : "opacity-80"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <Tag tone={CLAIM_TONE[f.claim_type] || "default"}>{f.claim_type}</Tag>
                      <Tag tone={f.verified ? "ok" : "danger"}>{f.verified ? "provenance-linked" : "unverified"}</Tag>
                      <Badge status={f.review_status} />
                    </div>
                    <p className="text-[13.5px] text-[var(--fg)]">{f.statement}</p>
                    {f.contradicted_by && <p className="mt-1 text-[12px] text-[var(--danger)]">Contradicted by: {f.contradicted_by}</p>}
                    {f.supporting_evidence_ids.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(f.evidence_labels || []).map((l, i) => <Tag key={i}>{l}</Tag>)}
                      </div>
                    )}
                  </div>
                  {f.review_status === "needs_review" && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="primary" onClick={() => decide(f, "accept")}><Check size={13} /></Button>
                      <Button size="sm" variant="danger" onClick={() => decide(f, "reject")}><X size={13} /></Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
        </div>
      )}

      {tab === "report" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-1">
            <Card className="p-4">
              <div className="mb-2 text-[13px] font-semibold">Editorial controls</div>
              <label className="mb-1 block text-[11.5px] text-[var(--fg-dim)]">Executive summary (editable)</label>
              <Textarea rows={4} value={exec} onChange={(e) => setExec(e.target.value)} placeholder="If empty, an auto summary is generated from case records." />
              <label className="mb-1 mt-3 block text-[11.5px] text-[var(--fg-dim)]">Reviewer notes</label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add context that should appear in the report." />
              <div className="mt-3 flex gap-2">
                <Button variant="primary" loading={busy} onClick={generate}><PenLine size={14} /> {report ? "Regenerate" : "Generate report"}</Button>
              </div>
              {report && (
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => download("pdf")}><Download size={13} /> PDF</Button>
                  <Button size="sm" variant="outline" onClick={() => download("json")}><Download size={13} /> JSON</Button>
                  <Button size="sm" variant="outline" onClick={() => download("md")}><Download size={13} /> Markdown</Button>
                  <Button size="sm" variant="outline" onClick={() => download("docx")}><Download size={13} /> DOCX</Button>
                </div>
              )}
              {report && report.review_status !== "approved" && (
                <Button className="mt-3 w-full" variant="subtle" onClick={() => setApproveOpen(true)}><ShieldCheck size={14} /> Request approval</Button>
              )}
            </Card>
            {report && (
              <Card className="p-4 text-[12px] text-[var(--fg-muted)]">
                <div className="mb-1 flex items-center justify-between"><span>Version</span><span className="font-mono text-[var(--fg)]">v{report.version}</span></div>
                <div className="mb-1 flex items-center justify-between"><span>Generated</span><span>{new Date(report.generated_at).toLocaleString()}</span></div>
                <div className="mb-2 flex items-center justify-between"><span>Status</span><Badge status={report.review_status} /></div>
                <div className="rounded border border-[var(--warn)]/30 bg-[var(--warn)]/8 p-2 text-[11.5px] text-[var(--warn)]">{report.disclaimer}</div>
              </Card>
            )}
          </div>

          <Card className="lg:col-span-2 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[var(--border-soft)] px-5 py-3">
              <FileText size={16} className="text-[var(--accent)]" /><span className="text-[13px] font-semibold">Report preview</span>
              {report && <span className="ml-auto text-[11px] text-[var(--fg-dim)]">{report.body_markdown.length.toLocaleString()} chars · built from {findings.length} findings</span>}
            </div>
            {report ? (
              <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                <ReportMarkdown text={report.body_markdown} />
              </div>
            ) : (
              <div className="p-10 text-center text-[13px] text-[var(--fg-dim)]">No report yet. Use “Generate report”.</div>
            )}
          </Card>
        </div>
      )}

      <ConfirmDialog open={approveOpen} onCancel={() => setApproveOpen(false)} onConfirm={approve}
        title="Approve report?"
        message="This records an approval decision in the audit trail and marks the case approved. The report remains a demonstration document, not a certified forensic report."
        confirmLabel="Approve" />
    </div>
  );
}

function ReportMarkdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = text.split("\n");
    let out = "";
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (/^# /.test(line)) out += `<h1 class="text-[19px] font-bold mt-4 mb-2">${esc(line.slice(2))}</h1>`;
      else if (/^## /.test(line)) out += `<h2 class="text-[14px] font-semibold mt-4 mb-1.5 text-[var(--accent)]">${esc(line.slice(3))}</h2>`;
      else if (/^\s*- /.test(line)) out += `<div class="ml-3 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">• ${esc(line.replace(/^\s*- /, ""))}</div>`;
      else if (!line.trim()) out += `<div class="h-2"></div>`;
      else out += `<p class="text-[12.5px] leading-relaxed text-[var(--fg-muted)]">${esc(line)}</p>`;
    }
    return out;
  }, [text]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
