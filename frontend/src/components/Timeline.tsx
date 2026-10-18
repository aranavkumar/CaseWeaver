"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, AlertTriangle, Link2, Clock, HelpCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { TimelineEvent, Observation, EvidenceItem } from "@/lib/types";
import { Card, Button, Tag, Badge, Tabs, Select, Spinner, EmptyState } from "./ui";

export function TimelineView() {
  const { currentCase, toast, selectCase, setSection } = useStore();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [obs, setObs] = useState<Observation[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list");
  const [evFilter, setEvFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sel, setSel] = useState<TimelineEvent | null>(null);

  const load = useCallback(async () => {
    if (!currentCase) { setLoading(false); return; }
    setLoading(true);
    try {
      const [tl, ws] = await Promise.all([api.timeline(currentCase.id), api.workspace(currentCase.id)]);
      setEvents(tl); setObs(ws.observations); setEvidence(ws.evidence);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  }, [currentCase, toast]);

  useEffect(() => { load(); }, [load]);

  const obsById = useMemo(() => Object.fromEntries(obs.map((o) => [o.id, o])), [obs]);
  const evById = useMemo(() => Object.fromEntries(evidence.map((e) => [e.id, e])), [evidence]);

  const shown = events.filter((t) => {
    if (evFilter !== "all" && !t.evidence_ids.includes(evFilter)) return false;
    if (typeFilter === "conflicting" && t.conflicting_event_ids.length === 0) return false;
    if (typeFilter === "approximate" && !t.is_approximate) return false;
    if (typeFilter === "exact" && (t.is_approximate || !t.timestamp_iso)) return false;
    return true;
  });

  const openEvidence = (evId: string) => { if (evId) { setSection("evidence"); } };

  if (!currentCase) return <EmptyState title="No case selected" message="Select an investigation to view its timeline." action={<Button onClick={() => setSection("investigations")}>Go to Investigations</Button>} />;
  if (loading) return <div className="flex items-center gap-3 text-[var(--fg-muted)]"><Spinner /> Loading timeline…</div>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Timeline</h1>
        <p className="mt-1 text-[13px] text-[var(--fg-muted)]">Original timestamps and time zones are preserved. Conflicts are surfaced, never silently resolved. Missing dates are not invented.</p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={[{ id: "list", label: "Chronological list" }, { id: "visual", label: "Visual track" }]} active={view} onChange={setView} />
        <div className="flex gap-2">
          <Select value={evFilter} onChange={(e) => setEvFilter(e.target.value)} className="w-auto"><option value="all">All evidence</option>{evidence.map((e) => <option key={e.id} value={e.id}>{e.evidence_label || e.original_filename}</option>)}</Select>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-auto">
            <option value="all">All events</option><option value="exact">Exact timestamps</option><option value="approximate">Approximate</option><option value="conflicting">Conflicting</option>
          </Select>
        </div>
      </div>

      {events.length === 0 ? (
        <EmptyState icon={<History size={26} />} title="No timeline events" message="Run the investigation to reconstruct events from extracted dates." />
      ) : shown.length === 0 ? (
        <EmptyState title="No matching events" message="Adjust the filters above." />
      ) : view === "list" ? (
        <div className="space-y-2.5">
          {shown.map((t) => <EventRow key={t.id} t={t} evById={evById} onOpenEvidence={openEvidence} onToggle={() => setSel(sel?.id === t.id ? null : t)} expanded={sel?.id === t.id} obsById={obsById} />)}
        </div>
      ) : (
        <VisualTrack events={shown} evById={evById} />
      )}
    </div>
  );
}

function EventRow({ t, evById, obsById, expanded, onToggle, onOpenEvidence }: {
  t: TimelineEvent; evById: Record<string, EvidenceItem>; obsById: Record<string, Observation>;
  expanded: boolean; onToggle: () => void; onOpenEvidence: (id: string) => void;
}) {
  const conflicting = t.conflicting_event_ids.length > 0;
  return (
    <Card className={`p-0 ${conflicting ? "border-[var(--warn)]/40" : ""}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${conflicting ? "bg-[var(--warn)]/15 text-[var(--warn)]" : "bg-[var(--bg-elev-2)] text-[var(--fg-dim)]"}`}>
          {conflicting ? <AlertTriangle size={16} /> : <Clock size={15} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] text-[var(--fg)]">{t.timestamp_raw || "(undated)"}</span>
            {t.is_approximate ? <Tag tone="warn">approximate</Tag> : <Tag tone="ok">exact</Tag>}
            {t.timestamp_origin === "inferred" && <Tag tone="info">inferred</Tag>}
            {t.time_zone && <Tag>{t.time_zone}</Tag>}
            {conflicting && <Tag tone="warn">conflicting</Tag>}
          </div>
          <p className="mt-1 text-[12.5px] text-[var(--fg-muted)]">{t.description}</p>
          {t.unresolved_question && <p className="mt-1 flex items-start gap-1.5 text-[12px] text-[var(--warn)]"><HelpCircle size={13} className="mt-0.5 shrink-0" />{t.unresolved_question}</p>}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-[var(--border-soft)] px-4 py-3">
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {t.evidence_ids.map((eid) => (
              <button key={eid} onClick={() => onOpenEvidence(eid)} className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--fg-muted)] hover:text-[var(--fg)]">
                <Link2 size={11} /> {evById[eid]?.evidence_label || evById[eid]?.original_filename || eid}
              </button>
            ))}
          </div>
          <div className="text-[11.5px] font-semibold text-[var(--fg-dim)]">Supporting observations</div>
          <div className="mt-1 space-y-1.5">
            {t.observation_ids.map((oid) => {
              const o = obsById[oid]; if (!o) return null;
              return <div key={oid} className="rounded border border-[var(--border-soft)] bg-[var(--bg-elev-2)] p-2 text-[11.5px]"><span className="font-mono">{o.value}</span> — <span className="text-[var(--fg-dim)]">“{o.source_passage}”</span> <Badge status={o.review_status} /></div>;
            })}
          </div>
          <div className="mt-2 text-[11px] text-[var(--fg-dim)]">Source reliability: {t.source_reliability}</div>
        </div>
      )}
    </Card>
  );
}

function VisualTrack({ events, evById }: { events: TimelineEvent[]; evById: Record<string, EvidenceItem> }) {
  const dated = events.filter((e) => e.timestamp_iso);
  const undef = events.filter((e) => !e.timestamp_iso && e.is_approximate);
  const unknown = events.filter((e) => !e.timestamp_iso && !e.is_approximate);
  return (
    <Card className="p-5">
      <div className="relative ml-3 border-l border-dashed border-[var(--border)] pl-6">
        {dated.map((e) => (
          <div key={e.id} className="relative mb-5">
            <span className={`absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-[var(--bg)] ${e.conflicting_event_ids.length ? "bg-[var(--warn)]" : "bg-[var(--accent)]"}`} />
            <div className="text-[11px] font-mono text-[var(--fg-dim)]">{e.timestamp_iso}{e.is_approximate && " ~"}</div>
            <div className="text-[13px] text-[var(--fg)]">{e.description}</div>
            <div className="mt-0.5 flex flex-wrap gap-1">{e.evidence_ids.map((id) => <Tag key={id}>{evById[id]?.evidence_label || id}</Tag>)}{e.conflicting_event_ids.length > 0 && <Tag tone="warn">conflict</Tag>}</div>
          </div>
        ))}
        {undef.map((e) => (
          <div key={e.id} className="relative mb-5">
            <span className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-[var(--bg)] bg-[var(--warn)]" />
            <div className="text-[11px] text-[var(--warn)]">approximate — {e.timestamp_raw}</div>
            <div className="text-[13px] text-[var(--fg)]">{e.description}</div>
          </div>
        ))}
        {unknown.length > 0 && (
          <div className="relative mt-2">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-[var(--fg-dim)]">Date not established</div>
            {unknown.map((e) => (
              <div key={e.id} className="mb-3">
                <span className="absolute -left-[31px] h-3.5 w-3.5 rounded-full border-2 border-[var(--bg)] bg-[var(--fg-dim)]" />
                <div className="text-[13px] text-[var(--fg-muted)]">{e.description}</div>
                {e.unresolved_question && <div className="text-[11.5px] text-[var(--warn)]">{e.unresolved_question}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
