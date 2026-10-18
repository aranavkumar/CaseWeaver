"use client";

import { useEffect, useState } from "react";
import { Settings as SettingsIcon, CheckCircle2, XCircle, Trash2, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { Card, Button, Tag, ConfirmDialog } from "./ui";

const THEMES = [
  { name: "Teal Blue", accent: "#38bdf8", accent2: "#2dd4bf" },
  { name: "Indigo", accent: "#818cf8", accent2: "#38bdf8" },
  { name: "Amber", accent: "#fbbf24", accent2: "#f472b6" },
  { name: "Emerald", accent: "#34d399", accent2: "#22d3ee" },
];

export function SettingsView() {
  const { settings, toast, refreshCases, selectCase } = useStore();
  const [theme, setTheme] = useState("Teal Blue");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("cw_theme") || "Teal Blue";
    applyTheme(saved); setTheme(saved);
  }, []);

  const applyTheme = (name: string) => {
    const t = THEMES.find((x) => x.name === name) || THEMES[0];
    document.documentElement.style.setProperty("--accent", t.accent);
    document.documentElement.style.setProperty("--accent-2", t.accent2);
  };
  const chooseTheme = (name: string) => { setTheme(name); localStorage.setItem("cw_theme", name); applyTheme(name); };

  const resetLocal = () => {
    localStorage.removeItem("cw_case"); localStorage.removeItem("cw_section");
    selectCase(null); setConfirmReset(false);
    toast("Local demo selection cleared", "success");
  };
  const rebuildSample = async () => {
    try { const c = await api.loadSample(true); await refreshCases(); selectCase(c.id); toast("Sample dataset rebuilt", "success"); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  const modeLabel = settings?.mode === "demo" ? "Fully simulated demo mode"
    : settings?.mode === "local" ? "Local-processing mode"
      : settings?.mode === "live" ? "Live API mode" : "—";

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-[13px] text-[var(--fg-muted)]">Workspace preferences, integrations and privacy. API credentials stay on the server, never in the frontend.</p>
      </header>

      <Card>
        <div className="border-b border-[var(--border-soft)] px-5 py-3 text-[14px] font-semibold">Operating mode</div>
        <div className="px-5 py-4">
          <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-[var(--accent-2)]/40 bg-[var(--accent-2)]/10 px-3 py-1.5 text-[13px] text-[var(--accent-2)]">
            <SettingsIcon size={14} /> {modeLabel}
          </div>
          <p className="text-[12.5px] text-[var(--fg-muted)]">The prototype launches and the sample investigation runs fully without any external API key. Where an operation is simulated (e.g. OCR or web research), it is labelled honestly.</p>
        </div>
      </Card>

      <Card>
        <div className="border-b border-[var(--border-soft)] px-5 py-3 text-[14px] font-semibold">Configured integrations</div>
        <div className="divide-y divide-[var(--border-soft)]">
          {settings && Object.entries(settings.integrations).map(([k, v]) => (
            <div key={k} className="flex items-start gap-3 px-5 py-3">
              {v.configured ? <CheckCircle2 size={17} className="mt-0.5 text-[var(--ok)]" /> : <XCircle size={17} className="mt-0.5 text-[var(--danger)]" />}
              <div>
                <div className="flex items-center gap-2 text-[13.5px] font-medium">{label(k)} <Tag tone={v.configured ? "ok" : "danger"}>{v.configured ? "connected" : "not connected"}</Tag></div>
                <p className="mt-0.5 text-[12px] text-[var(--fg-dim)]">{v.note}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="px-5 pb-4 pt-2 text-[11.5px] text-[var(--fg-dim)]">
          To enable live integrations, set <span className="font-mono">OPENAI_API_KEY</span> / <span className="font-mono">SEARCHAPI_API_KEY</span> in the backend <span className="font-mono">.env</span> and restart. They are never stored in client code or browser storage.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="border-b border-[var(--border-soft)] px-5 py-3 text-[14px] font-semibold">Processing limits</div>
          <div className="space-y-2.5 px-5 py-4 text-[12.5px]">
            <Row k="Max upload size" v={settings ? `${(settings.max_upload_bytes / 1048576).toFixed(0)} MiB` : "—"} />
            <div><div className="mb-1 text-[var(--fg-dim)]">Allowed formats</div><div className="flex flex-wrap gap-1.5">{settings?.allowed_extensions.map((e) => <Tag key={e}>{e}</Tag>)}</div></div>
          </div>
        </Card>
        <Card>
          <div className="border-b border-[var(--border-soft)] px-5 py-3 text-[14px] font-semibold">Theme</div>
          <div className="grid grid-cols-2 gap-2 px-5 py-4">
            {THEMES.map((t) => (
              <button key={t.name} onClick={() => chooseTheme(t.name)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${theme === t.name ? "border-[var(--accent)]/60 bg-[var(--accent)]/8" : "border-[var(--border)] hover:bg-[var(--bg-elev-2)]"}`}>
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})` }} />
                {t.name}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="border-b border-[var(--border-soft)] px-5 py-3 text-[14px] font-semibold">Privacy, data retention & safeguards</div>
        <div className="space-y-3 px-5 py-4 text-[12.5px] text-[var(--fg-muted)]">
          <div className="flex gap-2 rounded-lg border border-[var(--info)]/30 bg-[var(--info)]/8 p-3">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--info)]" />
            <span>{settings?.privacy}</span>
          </div>
          <ul className="list-inside list-disc space-y-1">
            <li>Safeguards: file type/size validation, safe parsing, no execution of uploaded content, restricted external-tool allowlist, bounded retries/timeouts.</li>
            <li>Uploaded originals are stored separately from derived data and are never silently overwritten. You control deletion from the Evidence Vault.</li>
            <li>This prototype does not claim to be a certified forensic system or guarantee legal admissibility.</li>
          </ul>
        </div>
      </Card>

      <Card>
        <div className="border-b border-[var(--border-soft)] px-5 py-3 text-[14px] font-semibold">Demo state</div>
        <div className="flex flex-wrap gap-3 px-5 py-4">
          <Button variant="outline" onClick={rebuildSample}><RefreshCw size={15} /> Rebuild sample dataset</Button>
          <Button variant="danger" onClick={() => setConfirmReset(true)}><Trash2 size={15} /> Clear local selections</Button>
        </div>
      </Card>

      <ConfirmDialog open={confirmReset} onCancel={() => setConfirmReset(false)} onConfirm={resetLocal} danger
        title="Clear local workspace state?" message="This clears your remembered case selection and section (browser storage only). It does not delete backend case data." confirmLabel="Clear" />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between"><span className="text-[var(--fg-dim)]">{k}</span><span className="font-mono">{v}</span></div>;
}
function label(k: string) {
  return { llm: "Model provider (LLM)", web_search: "Public web search" }[k] || k;
}
