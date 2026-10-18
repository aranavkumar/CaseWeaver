"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, ArrowRight, ArrowLeft, Check, ShieldCheck, Upload, Sparkles, FileStack } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Case } from "@/lib/types";
import { Card, Button, Badge, Field, Input, Textarea, Select, EmptyState, ConfirmDialog, Tag } from "./ui";

const CATEGORIES = [
  "Suspected online scam", "Suspicious communication", "Payment dispute",
  "Phishing incident", "Suspicious website", "Other digital incident",
];

export function Investigations() {
  const { cases, currentCase, selectCase, setSection, refreshCases, toast } = useStore();
  const [wizard, setWizard] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Case | null>(null);

  const open = (c: Case) => { selectCase(c.id); setSection("evidence"); };

  const del = async (c: Case) => {
    try {
      await api.deleteCase(c.id);
      if (currentCase?.id === c.id) selectCase(null);
      await refreshCases();
      toast("Investigation deleted", "success");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setConfirmDel(null); }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Investigations</h1>
          <p className="mt-1 text-[13px] text-[var(--fg-muted)]">Your digital-incident case files.</p>
        </div>
        <Button variant="primary" onClick={() => setWizard(true)}><Plus size={16} /> Create Investigation</Button>
      </header>

      {cases.length === 0 ? (
        <EmptyState icon={<FileStack size={30} />} title="No investigations"
          message="Create a case from your own evidence, or load the fictional sample to explore the full workflow."
          action={<Button variant="primary" onClick={() => setWizard(true)}><Plus size={16} /> New investigation</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {cases.map((c) => (
            <Card key={c.id} className={`p-4 ${currentCase?.id === c.id ? "ring-1 ring-[var(--accent)]/40" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold">{c.title}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--fg-dim)]">{c.category}</div>
                </div>
                {c.is_sample && <Tag tone="accent">demo</Tag>}
              </div>
              <p className="mt-2 line-clamp-2 text-[12.5px] text-[var(--fg-muted)]">{c.description || c.objective || "No description."}</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge status={c.status} />
                <span className="text-[11px] text-[var(--fg-dim)]">updated {new Date(c.updated_at).toLocaleDateString()}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" variant="subtle" onClick={() => open(c)}>Open workspace</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDel(c)} aria-label="Delete"><Trash2 size={14} /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Wizard open={wizard} onClose={() => setWizard(false)} />

      <ConfirmDialog open={!!confirmDel} onCancel={() => setConfirmDel(null)}
        onConfirm={() => confirmDel && del(confirmDel)} danger
        title="Delete investigation?"
        message={<>This permanently removes <b>{confirmDel?.title}</b> and all its evidence, findings and derived records in this demo. Originals are not kept elsewhere.</>}
        confirmLabel="Delete case" />
    </div>
  );
}

/* ============================== WIZARD ================================== */
function Wizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refreshCases, selectCase, setSection, toast } = useStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    title: "", description: "", category: CATEGORIES[0], incident_date: "",
    time_zone: "", priority: "medium", internal_reference: "", objective: "",
  });
  const [permission, setPermission] = useState(false);
  const [evidenceMode, setEvidenceMode] = useState<"none" | "sample" | "upload">("none");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const step1Valid = form.title.trim().length > 0;
  const canNext = step === 0 ? step1Valid : step === 1 ? permission : true;

  const reset = () => {
    setStep(0);
    setForm({ title: "", description: "", category: CATEGORIES[0], incident_date: "", time_zone: "", priority: "medium", internal_reference: "", objective: "" });
    setPermission(false); setEvidenceMode("none"); setFiles([]);
  };

  const create = async () => {
    setBusy(true);
    try {
      let created: Case;
      if (evidenceMode === "sample") {
        created = await api.createCase({ ...form, use_sample: true });
      } else {
        created = await api.createCase({ ...form, use_sample: false });
        let uploaded = 0;
        for (const f of files) {
          try { await api.uploadEvidence(created.id, f); uploaded++; }
          catch (e) { toast(`${f.name}: ${(e as Error).message}`, "error"); }
        }
        if (uploaded) toast(`${uploaded} file(s) uploaded`, "success");
      }
      await refreshCases();
      selectCase(created.id);
      setSection("evidence");
      toast("Investigation created", "success");
      reset();
      onClose();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };

  const steps = ["Basic information", "Scope & permissions", "Evidence", "Review"];
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl fade-in rounded-xl border bg-[var(--bg-elev)] shadow-2xl">
        <div className="border-b border-[var(--border-soft)] px-6 py-4">
          <h3 className="text-[15px] font-semibold">New investigation</h3>
          <div className="mt-3 flex items-center gap-2">
            {steps.map((s, i) => (
              <div key={s} className="flex flex-1 items-center gap-2">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  i < step ? "bg-[var(--ok)] text-[var(--accent-ink)]" : i === step ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--bg-elev-2)] text-[var(--fg-dim)]"}`}>
                  {i < step ? <Check size={13} /> : i + 1}
                </div>
                <span className={`hidden text-[12px] sm:block ${i === step ? "text-[var(--fg)]" : "text-[var(--fg-dim)]"}`}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Investigation title" required><Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Fake marketplace refund request" /></Field></div>
              <div className="sm:col-span-2"><Field label="Case description"><Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
              <Field label="Incident category"><Select value={form.category} onChange={(e) => set("category", e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Case priority"><Select value={form.priority} onChange={(e) => set("priority", e.target.value)}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option></Select></Field>
              <Field label="Incident date (or approximate)"><Input value={form.incident_date} onChange={(e) => set("incident_date", e.target.value)} placeholder="e.g. around 2024-06-11" /></Field>
              <Field label="Time zone (if known)"><Input value={form.time_zone} onChange={(e) => set("time_zone", e.target.value)} placeholder="e.g. UTC, IST" /></Field>
              <Field label="Internal reference (optional)"><Input value={form.internal_reference} onChange={(e) => set("internal_reference", e.target.value)} /></Field>
              <Field label="Investigation objective"><Input value={form.objective} onChange={(e) => set("objective", e.target.value)} placeholder="What should this case establish?" /></Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4 text-[13.5px]">
              <div className="flex gap-3 rounded-lg border border-[var(--info)]/30 bg-[var(--info)]/8 p-3.5 text-[var(--fg-muted)]">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--info)]" />
                <p>This prototype uses synthetic data for its built-in sample investigation. Uploaded files are stored locally on the machine running the backend, treated strictly as untrusted data, never executed, and never sent to any external service.</p>
              </div>
              <label className="flex items-start gap-2.5">
                <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                <span>I confirm I have the right to provide this material and understand how this demonstration processes it.</span>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <button onClick={() => setEvidenceMode("sample")} className={`rounded-lg border p-4 text-left ${evidenceMode === "sample" ? "border-[var(--accent)]/60 bg-[var(--accent)]/8" : "border-[var(--border)] hover:bg-[var(--bg-elev-2)]"}`}>
                  <Sparkles size={18} className="text-[var(--accent)]" />
                  <div className="mt-2 text-[13.5px] font-semibold">Use built-in sample evidence</div>
                  <div className="mt-0.5 text-[12px] text-[var(--fg-muted)]">Loads the fictional Operation Silverline dataset (5 evidence items).</div>
                </button>
                <button onClick={() => setEvidenceMode("upload")} className={`rounded-lg border p-4 text-left ${evidenceMode === "upload" ? "border-[var(--accent)]/60 bg-[var(--accent)]/8" : "border-[var(--border)] hover:bg-[var(--bg-elev-2)]"}`}>
                  <Upload size={18} className="text-[var(--accent-2)]" />
                  <div className="mt-2 text-[13.5px] font-semibold">Upload my own files</div>
                  <div className="mt-0.5 text-[12px] text-[var(--fg-muted)]">PNG, JPEG, PDF, TXT, CSV, JSON, EML. Text extraction runs locally.</div>
                </button>
              </div>
              {evidenceMode === "upload" && (
                <div>
                  <input ref={fileRef} type="file" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                  <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload size={15} /> Choose files</Button>
                  <div className="mt-2 text-[12.5px] text-[var(--fg-muted)]">{files.length} file(s) selected</div>
                  <ul className="mt-1 space-y-0.5">
                    {files.map((f) => <li key={f.name} className="text-[12px] text-[var(--fg-dim)]">• {f.name} ({(f.size / 1024).toFixed(1)} KB)</li>)}
                  </ul>
                </div>
              )}
              {evidenceMode === "none" && <p className="text-[12.5px] text-[var(--fg-dim)]">You can add evidence later from the Evidence Vault.</p>}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-[13.5px]">
              <ReviewRow label="Title" value={form.title} />
              <ReviewRow label="Category" value={form.category} />
              <ReviewRow label="Priority" value={form.priority} />
              <ReviewRow label="Incident date" value={form.incident_date || "—"} />
              <ReviewRow label="Objective" value={form.objective || "—"} />
              <ReviewRow label="Evidence" value={evidenceMode === "sample" ? "Built-in sample (5 items)" : evidenceMode === "upload" ? `${files.length} upload(s)` : "None yet"} />
              <div className="rounded-lg border border-[var(--warn)]/30 bg-[var(--warn)]/8 p-3 text-[12.5px] text-[var(--fg-muted)]">
                After creation you can start the agentic investigation run from the case workspace to extract observations, correlate entities and build the report.
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-soft)] px-6 py-4">
          <Button variant="ghost" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            <ArrowLeft size={15} /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < 3 ? (
            <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Next <ArrowRight size={15} /></Button>
          ) : (
            <Button variant="primary" loading={busy} onClick={create}><Check size={15} /> Create investigation</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex gap-3 border-b border-[var(--border-soft)] pb-2"><span className="w-28 shrink-0 text-[var(--fg-dim)]">{label}</span><span className="text-[var(--fg)]">{value}</span></div>;
}
