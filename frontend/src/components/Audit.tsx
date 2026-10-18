"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollText, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { AuditEvent } from "@/lib/types";
import { Card, Button, Tag, Spinner, EmptyState } from "./ui";

export function AuditTrail() {
  const { currentCase, toast } = useStore();
  const [scope, setScope] = useState<"all" | "case">("all");
  const [q, setQ] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await api.audit(scope === "case" && currentCase ? currentCase.id : undefined, q || undefined));
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  }, [scope, q, currentCase, toast]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Audit Trail</h1>
          <p className="mt-1 text-[13px] text-[var(--fg-muted)]">Append-oriented record of meaningful actions in this demo.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-[var(--fg-dim)]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actions…"
              className="w-44 rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] py-2 pl-8 pr-2 text-[13px] focus:outline-none" />
          </div>
          <div className="flex overflow-hidden rounded-lg border">
            {(["all", "case"] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)} disabled={s === "case" && !currentCase}
                className={`px-3 py-2 text-[12.5px] ${scope === s ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--fg-muted)]"} ${s === "case" && !currentCase ? "opacity-40" : ""}`}>
                {s === "all" ? "All cases" : "This case"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <Card className="flex items-start gap-2 border-[var(--info)]/25 bg-[var(--info)]/6 p-3 text-[12px] text-[var(--fg-muted)]">
        <ScrollText size={14} className="mt-0.5 text-[var(--info)]" />
        This is a client-side prototype; the audit log is informative but <b>not</b> production-grade tamper-proof storage.
      </Card>

      {loading ? <div className="flex items-center gap-3 text-[var(--fg-muted)]"><Spinner /> Loading audit events…</div>
        : events.length === 0 ? <EmptyState icon={<ScrollText size={26} />} title="No audit events" message="Actions like case creation, evidence upload, review decisions and report generation appear here." />
          : (
            <Card className="overflow-hidden">
              <div className="divide-y divide-[var(--border-soft)]">
                {events.map((e) => (
                  <div key={e.id} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 py-3 text-[12.5px]">
                    <span className="mt-0.5 font-mono text-[11px] text-[var(--fg-dim)]">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-[var(--fg)]">{e.action}</span>
                        <Tag>{e.actor}</Tag>
                        {e.related_record_kind && <span className="text-[11px] text-[var(--fg-dim)]">{e.related_record_kind} <span className="font-mono">{e.related_record_id?.slice(0, 12)}</span></span>}
                        <span className="ml-auto text-[11px] text-[var(--fg-dim)]">{new Date(e.timestamp).toLocaleDateString()}</span>
                      </div>
                      {(e.previous_value || e.new_value) && (
                        <div className="mt-1 text-[11.5px] text-[var(--fg-dim)]">
                          {e.previous_value && <span className="line-through opacity-70">{e.previous_value}</span>}
                          {e.previous_value && e.new_value && " → "}
                          {e.new_value && <span className="text-[var(--ok)]">{e.new_value}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
    </div>
  );
}
