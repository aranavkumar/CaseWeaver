"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderSearch, Layers, ShieldAlert, FileText, Plus, Sparkles, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Overview as OverviewData } from "@/lib/types";
import { Card, Button, Badge, EmptyState, Spinner } from "./ui";

function Stat({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: number; tone: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: `${tone}1a`, color: tone }}>
          {icon}
        </div>
        <div>
          <div className="text-2xl font-semibold leading-none tabular">{value}</div>
          <div className="mt-1 text-[12px] text-[var(--fg-muted)]">{label}</div>
        </div>
      </div>
    </Card>
  );
}

export function Overview() {
  const { setSection, selectCase, toast, refreshCases, online } = useStore();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.overview()); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openDemo = async () => {
    setBusy(true);
    try {
      const c = await api.loadSample();
      await refreshCases();
      selectCase(c.id);
      setSection("evidence");
      toast("Sample investigation opened", "success");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="flex items-center gap-3 text-[var(--fg-muted)]"><Spinner /> Loading dashboard…</div>;
  if (!data) return <EmptyState title="Dashboard unavailable" message="Could not load overview data." action={<Button onClick={load}>Retry</Button>} />;

  const t = data.totals;
  const maxStatus = Math.max(1, ...Object.values(data.status_distribution));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-[13px] text-[var(--fg-muted)]">
          CaseWeaver transforms scattered digital evidence into a structured, traceable and human-reviewable investigation.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => setSection("investigations")} disabled={!online}>
          <Plus size={16} /> Create Investigation
        </Button>
        <Button variant="outline" onClick={openDemo} loading={busy}>
          <Sparkles size={16} /> Open Demo Investigation
        </Button>
      </div>

      {data.totals.investigations === 0 ? (
        <EmptyState
          icon={<FolderSearch size={30} />}
          title="No investigations yet"
          message="Start a new case from your own evidence, or load the fully-populated fictional 'Operation Silverline' sample to see the complete workflow end to end."
          action={
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => setSection("investigations")}><Plus size={16} /> New investigation</Button>
              <Button variant="outline" onClick={openDemo} loading={busy}><Sparkles size={16} /> Load sample</Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={<FolderSearch size={20} />} label="Total investigations" value={t.investigations} tone="var(--accent)" />
            <Stat icon={<Layers size={20} />} label="Evidence items processed" value={t.evidence_processed} tone="var(--accent-2)" />
            <Stat icon={<ShieldAlert size={20} />} label="Findings awaiting review" value={t.findings_awaiting_review} tone="var(--warn)" />
            <Stat icon={<FileText size={20} />} label="Reports generated" value={t.reports_generated} tone="var(--info)" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="border-b border-[var(--border-soft)] px-5 py-3.5 text-[14px] font-semibold">Recent investigations</div>
              <div className="divide-y divide-[var(--border-soft)]">
                {data.recent_investigations.map((c) => (
                  <button key={c.id} onClick={() => { selectCase(c.id); setSection("evidence"); }}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-[var(--bg-elev-2)]">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium">{c.title}{c.is_sample && <span className="ml-2"><Badge status="draft">demo</Badge></span>}</div>
                      <div className="mt-0.5 text-[12px] text-[var(--fg-dim)]">{c.category}</div>
                    </div>
                    <Badge status={c.status} />
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <div className="border-b border-[var(--border-soft)] px-5 py-3.5 text-[14px] font-semibold">Status distribution</div>
              <div className="space-y-2.5 px-5 py-4">
                {Object.entries(data.status_distribution).map(([k, v]) => (
                  <div key={k}>
                    <div className="mb-1 flex justify-between text-[12px]"><span className="text-[var(--fg-muted)]">{k.replace(/_/g, " ")}</span><span className="tabular">{v}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-elev-2)]">
                      <div className="h-full rounded-full bg-[var(--accent)]/70" style={{ width: `${(v / maxStatus) * 100}%` }} />
                    </div>
                  </div>
                ))}
                {Object.keys(data.status_distribution).length === 0 &&
                  <p className="text-[13px] text-[var(--fg-dim)]">No cases yet.</p>}
              </div>
            </Card>
          </div>

          <Card>
            <div className="border-b border-[var(--border-soft)] px-5 py-3.5 text-[14px] font-semibold">Recent activity</div>
            <div className="divide-y divide-[var(--border-soft)]">
              {data.recent_activity.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-[12.5px]">
                  <Clock size={13} className="text-[var(--fg-dim)]" />
                  <span className="text-[var(--fg-muted)]">{new Date(a.timestamp).toLocaleString()}</span>
                  <span className="font-medium">{a.action}</span>
                  <span className="text-[var(--fg-dim)]">by {a.actor}</span>
                </div>
              ))}
              {data.recent_activity.length === 0 && <p className="px-5 py-4 text-[13px] text-[var(--fg-dim)]">No activity recorded.</p>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
