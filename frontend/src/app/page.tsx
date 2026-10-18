"use client";

import { StoreProvider, useStore } from "@/lib/store";
import { Sidebar } from "@/components/Sidebar";
import { Toasts } from "@/components/Toasts";
import { Overview } from "@/components/Overview";
import { Investigations } from "@/components/Investigations";
import { EvidenceVault } from "@/components/EvidenceVault";
import { GraphView } from "@/components/Graph";
import { TimelineView } from "@/components/Timeline";
import { ResearchCenter } from "@/components/Research";
import { Reports } from "@/components/Reports";
import { AuditTrail } from "@/components/Audit";
import { SettingsView } from "@/components/Settings";
import { Button } from "@/components/ui";
import { Spinner } from "@/components/ui";
import { api, API_BASE } from "@/lib/api";

function Workspace() {
  const { section, ready, online, settings, setSection, toast } = useStore();

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--fg-muted)]">
        <Spinner size={22} /> <span className="ml-3 text-[14px]">Loading CaseWeaver…</span>
      </div>
    );
  }

  if (!online) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <h2 className="text-lg font-semibold">Backend not reachable</h2>
        <p className="max-w-md text-[13px] text-[var(--fg-muted)]">
          CaseWeaver needs the FastAPI backend running on <code className="rounded bg-[var(--bg-elev-2)] px-1.5 py-0.5">{API_BASE}</code>.
          Start it with <code className="rounded bg-[var(--bg-elev-2)] px-1.5 py-0.5">uvicorn app.main:app --port 8000</code>, then reconnect.
        </p>
        <Button variant="primary" onClick={async () => {
          try { await api.settings(); window.location.reload(); }
          catch { toast("Backend still offline", "error"); }
        }}>Reconnect</Button>
      </div>
    );
  }

  const sections: Record<string, React.ReactNode> = {
    overview: <Overview />,
    investigations: <Investigations />,
    evidence: <EvidenceVault />,
    graph: <GraphView />,
    timeline: <TimelineView />,
    research: <ResearchCenter />,
    reports: <Reports />,
    audit: <AuditTrail />,
    settings: <SettingsView />,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-7">{sections[section] ?? <Overview />}</div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <StoreProvider>
      <Workspace />
      <Toasts />
    </StoreProvider>
  );
}
