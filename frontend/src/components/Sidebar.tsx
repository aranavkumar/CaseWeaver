"use client";

import {
  LayoutDashboard, FolderSearch, Vault, Share2, History, Search,
  FileText, ScrollText, Settings as SettingsIcon, Scale, ChevronDown, WifiOff,
} from "lucide-react";
import { useStore, type Section } from "@/lib/store";
import { Badge } from "./ui";

const NAV: { id: Section; label: string; icon: React.ReactNode; caseScoped?: boolean }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={17} /> },
  { id: "investigations", label: "Investigations", icon: <FolderSearch size={17} /> },
  { id: "evidence", label: "Evidence Vault", icon: <Vault size={17} />, caseScoped: true },
  { id: "graph", label: "Intelligence Graph", icon: <Share2 size={17} />, caseScoped: true },
  { id: "timeline", label: "Timeline", icon: <History size={17} />, caseScoped: true },
  { id: "research", label: "Research Center", icon: <Search size={17} />, caseScoped: true },
  { id: "reports", label: "Reports", icon: <FileText size={17} />, caseScoped: true },
  { id: "audit", label: "Audit Trail", icon: <ScrollText size={17} /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon size={17} /> },
];

export function Sidebar() {
  const { section, setSection, cases, currentCase, selectCase, online, settings } = useStore();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-[var(--bg-elev)]">
      {/* logo */}
      <div className="flex items-center gap-2.5 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-[var(--accent-ink)]">
          <Scale size={18} strokeWidth={2.2} />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight">CaseWeaver</div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--fg-dim)]">Evidence → Intelligence</div>
        </div>
      </div>

      {/* current case context */}
      <div className="mx-3 mb-2 rounded-lg border bg-[var(--bg-elev-2)] p-2.5">
        <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-wide text-[var(--fg-dim)]">
          <span>Active case</span>
          {currentCase?.is_sample && <Badge status="draft">demo</Badge>}
        </div>
        <div className="relative">
          <select
            value={currentCase?.id || ""}
            onChange={(e) => selectCase(e.target.value || null)}
            className="w-full appearance-none rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 pr-7 text-[13px] text-[var(--fg)] focus:outline-none">
            <option value="">— No case selected —</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2 top-2.5 text-[var(--fg-muted)]" />
        </div>
      </div>

      {/* nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-0.5">
          {NAV.map((item) => {
            const disabled = item.caseScoped && !currentCase;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                disabled={disabled}
                onClick={() => !disabled && setSection(item.id)}
                title={disabled ? "Select an investigation first" : undefined}
                className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors ${
                  active
                    ? "bg-[var(--accent)]/12 text-[var(--accent)]"
                    : disabled
                      ? "cursor-not-allowed text-[var(--fg-dim)] opacity-50"
                      : "text-[var(--fg-muted)] hover:bg-[var(--bg-elev-2)] hover:text-[var(--fg)]"}`}>
                <span className={active ? "text-[var(--accent)]" : "text-[var(--fg-dim)] group-hover:text-[var(--fg-muted)]"}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* footer / workspace status */}
      <div className="border-t border-[var(--border-soft)] px-4 py-3 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-[var(--fg-dim)]">Mode</span>
          <span className="font-medium text-[var(--accent-2)]">
            {settings?.mode === "demo" ? "Simulated demo" : settings?.mode || "—"}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[var(--fg-dim)]">Backend</span>
          {online ? (
            <span className="flex items-center gap-1 text-[var(--ok)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />connected</span>
          ) : (
            <span className="flex items-center gap-1 text-[var(--danger)]"><WifiOff size={12} />offline</span>
          )}
        </div>
      </div>
    </aside>
  );
}
