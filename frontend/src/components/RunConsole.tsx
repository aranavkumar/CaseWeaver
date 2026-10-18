"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCw, Square, ChevronDown, Workflow, AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { RunDetail, AgentStage } from "@/lib/types";
import { Card, Button, Badge, ProgressBar, Tag } from "./ui";

const STAGE_LABEL: Record<string, string> = {
  planning: "Initialize & plan", extraction: "Load evidence & extract observations",
  research: "Research questions", entity_resolution: "Normalize entities & build relationships",
  timeline: "Reconstruct timeline", verification: "Verify report claims",
  human_review: "Await human approval", report: "Prepare report",
};

export function RunConsole({ caseId, onCompleted }: { caseId: string; onCompleted?: () => void }) {
  const { toast } = useStore();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const poll = useCallback(async (runId: string) => {
    try {
      const d = await api.getRun(runId);
      setRun(d);
      const terminal = ["needs_review", "completed", "failed", "skipped"].includes(d.run.status);
      if (terminal) { stopPolling(); if (d.run.status !== "pending" && d.run.status !== "running") onCompleted?.(); }
    } catch { stopPolling(); }
  }, [onCompleted]);

  const start = async () => {
    try {
      const { run_id } = await api.runCase(caseId);
      setExpanded({});
      poll(run_id);
      pollRef.current = setInterval(() => poll(run_id), 650);
      toast("Investigation run started", "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const ctl = async (verb: "pause" | "resume" | "cancel") => {
    if (!run) return;
    try {
      await api[`${verb}Run`](run.run.id);
      toast(`Run ${verb} requested`, "info");
      if (verb === "resume") { pollRef.current = setInterval(() => poll(run.run.id), 650); }
      poll(run.run.id);
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const retry = async (stage: string) => {
    if (!run) return;
    try { await api.retryStage(run.run.id, stage); poll(run.run.id); pollRef.current = setInterval(() => poll(run.run.id), 650); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  useEffect(() => () => stopPolling(), []);

  const stages = run?.stages ?? [];
  const done = stages.filter((s) => ["completed", "needs_review", "skipped"].includes(s.status)).length;
  const running = run?.run.status === "running";
  const pct = stages.length ? (done / stages.length) * 100 : 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-soft)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Workflow size={17} className="text-[var(--accent)]" />
          <div>
            <div className="text-[14px] font-semibold">Investigation Run Console</div>
            <div className="text-[12px] text-[var(--fg-muted)]">
              {run ? <>Agent orchestrator · <Badge status={run.run.status} /></> : "A real state machine — each stage writes structured records."}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!run && <Button variant="primary" onClick={start}><Play size={15} /> Start analysis</Button>}
          {run && !running && run.run.status === "pending" && <Button variant="primary" onClick={() => ctl("resume")}><Play size={15} /> Resume</Button>}
          {run && running && <Button variant="outline" onClick={() => ctl("pause")}><Pause size={15} /> Pause</Button>}
          {run && (
            <>
              <Button variant="ghost" onClick={() => ctl("cancel")}><Square size={14} /> Cancel</Button>
              <Button variant="subtle" onClick={start} disabled={running}><RotateCw size={14} /> New run</Button>
            </>
          )}
        </div>
      </div>

      {run && (
        <div className="px-5 py-3">
          <ProgressBar value={pct} tone={run.run.status === "failed" ? "var(--danger)" : "var(--accent)"} />
        </div>
      )}

      {run ? (
        <div className="divide-y divide-[var(--border-soft)]">
          {stages.map((s) => (
            <StageRow key={s.id} stage={s} open={!!expanded[s.id]} onToggle={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))} onRetry={() => retry(s.name)} />
          ))}
        </div>
      ) : (
        <div className="px-5 py-4 text-[12.5px] text-[var(--fg-muted)]">
          Stages: {Object.values(STAGE_LABEL).join(" → ")}. Every displayed finding will have a clear source.
        </div>
      )}
    </Card>
  );
}

function StageRow({ stage, open, onToggle, onRetry }: {
  stage: AgentStage; open: boolean; onToggle: () => void; onRetry: () => void;
}) {
  const icon =
    stage.status === "completed" ? <CheckCircle2 size={15} className="text-[var(--ok)]" />
      : stage.status === "running" ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--info)] border-t-transparent" />
        : stage.status === "failed" ? <AlertTriangle size={15} className="text-[var(--danger)]" />
          : <Circle size={15} className="text-[var(--fg-dim)]" />;

  return (
    <div className={stage.status === "running" ? "pulse-soft" : ""}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-[var(--bg-elev-2)]">
        <span className="flex shrink-0 items-center">{icon}</span>
        <span className="w-6 shrink-0 text-[11px] text-[var(--fg-dim)] tabular">#{stage.order + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{STAGE_LABEL[stage.name] || stage.name}</div>
          <div className="truncate text-[11px] text-[var(--fg-dim)]">agent: {stage.agent}{stage.duration_ms != null && ` · ${stage.duration_ms} ms`}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {stage.records_created > 0 && <Tag tone="ok">+{stage.records_created}</Tag>}
          <Badge status={stage.status} />
          {stage.status === "failed" && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onRetry(); }}><RotateCw size={13} /> Retry</Button>}
          <ChevronDown size={14} className={`text-[var(--fg-dim)] transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="space-y-2 bg-[var(--bg)] px-5 pb-4 pt-1 text-[12px] text-[var(--fg-muted)]">
          <p><span className="text-[var(--fg-dim)]">Action:</span> {stage.action}</p>
          {stage.outputs && <p><span className="text-[var(--fg-dim)]">Output:</span> {stage.outputs}</p>}
          <p><span className="text-[var(--fg-dim)]">Records:</span> created {stage.records_created} · updated {stage.records_updated}</p>
          {stage.data_source === "sample_dataset" && <Tag tone="accent">loaded from sample dataset</Tag>}
          {stage.error && <p className="text-[var(--danger)]">Error: {stage.error}</p>}
        </div>
      )}
    </div>
  );
}
