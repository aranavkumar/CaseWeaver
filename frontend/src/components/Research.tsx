"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Globe, Database, FileUp, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { ResearchQuery, ResearchResult } from "@/lib/types";
import { Card, Button, Tag, Badge, Spinner, EmptyState } from "./ui";

export function ResearchCenter() {
  const { currentCase, toast, setSection } = useStore();
  const [queries, setQueries] = useState<ResearchQuery[]>([]);
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!currentCase) { setLoading(false); return; }
    setLoading(true);
    try {
      const d = await api.research(currentCase.id);
      setQueries(d.queries); setResults(d.results); setLive(d.live_mode);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  }, [currentCase, toast]);

  useEffect(() => { load(); }, [load]);

  if (!currentCase) return <EmptyState title="No case selected" message="Select an investigation to research external sources." action={<Button onClick={() => setSection("investigations")}>Go to Investigations</Button>} />;
  if (loading) return <div className="flex items-center gap-3 text-[var(--fg-muted)]"><Spinner /> Loading research…</div>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Research Center</h1>
        <p className="mt-1 text-[13px] text-[var(--fg-muted)]">External-source research with transparent provenance. No private accounts are browsed, no authentication is bypassed, and no intrusive scans are performed.</p>
      </header>

      <div className={`flex items-center gap-2 rounded-lg border p-3 text-[12.5px] ${live ? "border-[var(--ok)]/40 bg-[var(--ok)]/8 text-[var(--ok)]" : "border-[var(--warn)]/40 bg-[var(--warn)]/8 text-[var(--warn)]"}`}>
        {live ? <Globe size={15} /> : <Database size={15} />}
        {live
          ? "Live integration mode: a configured public API is being queried."
          : "Demo mode: results below are from a local mock adapter and marked 'Simulated research result'. No live internet retrieval occurred."}
      </div>

      {queries.length === 0 ? (
        <EmptyState icon={<Search size={26} />} title="No research yet" message="Run the investigation to generate research questions." />
      ) : (
        <div className="space-y-3">
          {queries.map((q) => {
            const rs = results.filter((r) => r.query_id === q.id);
            return (
              <Card key={q.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Search size={16} className="mt-0.5 text-[var(--accent)]" />
                    <div>
                      <div className="text-[14px] font-medium">{q.question}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--fg-dim)]">
                        <Tag>tool: {q.tool}</Tag>
                        <span className="font-mono">input: {q.query_input}</span>
                      </div>
                    </div>
                  </div>
                  <Badge status={q.status} />
                </div>
                <div className="mt-3 space-y-2 border-t border-[var(--border-soft)] pt-3">
                  {rs.map((r) => (
                    <div key={r.id} className="rounded-lg bg-[var(--bg-elev-2)] p-3">
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        {r.is_simulated
                          ? <Tag tone="warn"><AlertCircle size={11} className="mr-1" />Simulated research result</Tag>
                          : <Tag tone="ok">Live result</Tag>}
                        <Tag>{sourceIcon(r.source_kind)} {r.source_kind}</Tag>
                        <span className="text-[11px] text-[var(--fg-dim)]">retrieved {new Date(r.retrieval_time).toLocaleString()}</span>
                        {r.source_url && <a href={r.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-[var(--accent)] underline">{r.source_url}</a>}
                      </div>
                      <p className="text-[12.5px] text-[var(--fg-muted)]">{r.returned_observation}</p>
                      {r.limitations && <p className="mt-1 text-[11.5px] text-[var(--fg-dim)]">Limitation: {r.limitations}</p>}
                    </div>
                  ))}
                  {rs.length === 0 && <p className="text-[12px] text-[var(--fg-dim)]">No results returned.</p>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[11.5px] text-[var(--fg-dim)]">Note: a lack of search results is never treated as proof that an entity is legitimate or illegitimate.</p>
    </div>
  );
}

function sourceIcon(kind: string) {
  if (kind === "live") return <Globe size={11} className="mr-1 inline" />;
  if (kind === "user_document") return <FileUp size={11} className="mr-1 inline" />;
  return <Database size={11} className="mr-1 inline" />;
}
