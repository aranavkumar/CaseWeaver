"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Trash2, Eye, ShieldQuestion, Link2, Check, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { EvidenceItem, EvidenceDetail, Observation } from "@/lib/types";
import { Card, Button, Badge, Tag, Modal, EmptyState, ConfirmDialog, Spinner, Textarea } from "./ui";
import { RunConsole } from "./RunConsole";

const fmtBytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export function EvidenceVault() {
  const { currentCase, toast, setSection } = useStore();
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<EvidenceDetail | null>(null);
  const [confirmDel, setConfirmDel] = useState<EvidenceItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!currentCase) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try { setItems(await api.listEvidence(currentCase.id)); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  }, [currentCase, toast]);

  useEffect(() => { load(); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files || !currentCase) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      try { await api.uploadEvidence(currentCase.id, f); toast(`${f.name} uploaded`, "success"); }
      catch (e) { toast(`${f.name}: ${(e as Error).message}`, "error"); }
    }
    setBusy(false);
    load();
  };

  const openDetail = async (id: string) => {
    try { setDetail(await api.getEvidence(id)); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  const del = async () => {
    if (!confirmDel) return;
    try { await api.deleteEvidence(confirmDel.id); toast("Evidence deleted", "success"); setConfirmDel(null); load(); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  if (!currentCase) return <EmptyState title="No case selected" message="Choose or create an investigation to manage its evidence." action={<Button onClick={() => setSection("investigations")}>Go to Investigations</Button>} />;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Evidence Vault</h1>
          <p className="mt-1 text-[13px] text-[var(--fg-muted)]">Originals are preserved separately from derived data. Hashes are computed over the actual uploaded bytes.</p>
        </div>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        <Button variant="primary" loading={busy} onClick={() => fileRef.current?.click()}><Upload size={16} /> Upload evidence</Button>
      </header>

      <Card className="flex items-center gap-2 border-[var(--info)]/25 bg-[var(--info)]/6 px-4 py-2.5 text-[12.5px] text-[var(--fg-muted)]">
        <ShieldQuestion size={15} className="text-[var(--info)]" />
        A SHA-256 hash helps detect later changes to a file — it does <b>not</b> prove the original document was authentic or truthful.
      </Card>

      <RunConsole caseId={currentCase.id} onCompleted={load} />

      {loading ? <div className="flex items-center gap-3 text-[var(--fg-muted)]"><Spinner /> Loading evidence…</div>
        : items.length === 0 ? <EmptyState icon={<Upload size={28} />} title="No evidence yet" message="Upload supported files (PNG, JPEG, PDF, TXT, CSV, JSON, EML) to begin extraction." action={<Button variant="primary" onClick={() => fileRef.current?.click()}><Upload size={15} /> Upload</Button>} />
          : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="border-b border-[var(--border-soft)] text-left text-[var(--fg-dim)]">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Evidence</th>
                      <th className="px-4 py-2.5 font-medium">Type</th>
                      <th className="px-4 py-2.5 font-medium">Size</th>
                      <th className="px-4 py-2.5 font-medium">SHA-256</th>
                      <th className="px-4 py-2.5 font-medium">Processing</th>
                      <th className="px-4 py-2.5 font-medium">Extraction</th>
                      <th className="px-4 py-2.5 font-medium">Review</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-soft)]">
                    {items.map((e) => (
                      <tr key={e.id} className="hover:bg-[var(--bg-elev-2)]">
                        <td className="px-4 py-3">
                          <div className="font-medium text-[var(--fg)]">{e.evidence_label || e.original_filename}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--fg-dim)]">
                            <span className="font-mono">{e.id}</span>
                            {e.is_synthetic && <Tag tone="accent">synthetic</Tag>}
                          </div>
                        </td>
                        <td className="px-4 py-3"><Tag>{e.source_type}</Tag></td>
                        <td className="px-4 py-3 tabular">{fmtBytes(e.size_bytes)}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[var(--fg-dim)]">{e.sha256 ? `${e.sha256.slice(0, 12)}…` : "n/a"}</td>
                        <td className="px-4 py-3"><Badge status={e.processing_status} /></td>
                        <td className="px-4 py-3"><Badge status={e.extraction_status} /></td>
                        <td className="px-4 py-3"><Badge status={e.review_status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openDetail(e.id)} aria-label="View"><Eye size={15} /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDel(e)} aria-label="Delete"><Trash2 size={15} /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

      {/* detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} wide
        title={detail ? (detail.item.evidence_label || detail.item.original_filename) : ""}
        footer={<Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>}>
        {detail && <EvidenceDetailView detail={detail} caseId={currentCase.id} onCorrected={() => openDetail(detail.item.id)} onJumpTimeline={() => { setDetail(null); setSection("timeline"); }} />}
      </Modal>

      <ConfirmDialog open={!!confirmDel} onCancel={() => setConfirmDel(null)} onConfirm={del} danger
        title="Delete evidence item?"
        message={<>Remove <b>{confirmDel?.original_filename}</b> and all observations derived from it? Findings and report sections that depended on it will update. The stored original will be deleted from this demo.</>}
        confirmLabel="Delete evidence" />
    </div>
  );
}

function EvidenceDetailView({ detail, caseId, onCorrected, onJumpTimeline }: {
  detail: EvidenceDetail; caseId: string; onCorrected: () => void; onJumpTimeline: () => void;
}) {
  const { toast } = useStore();
  const [editing, setEditing] = useState<Observation | null>(null);
  const [newValue, setNewValue] = useState("");

  const dates = detail.observations.filter((o) => o.field_type === "date");
  const amounts = detail.observations.filter((o) => o.field_type === "amount");

  const saveCorrection = async (o: Observation) => {
    try {
      await api.review(caseId, { target_kind: "observation", target_id: o.id, action: "correct", new_value: newValue, comment: "Reviewer corrected extracted field" });
      toast("Observation corrected — graph & report updated", "success");
      setEditing(null); onCorrected();
    } catch (e) { toast((e as Error).message, "error"); }
  };

  const accept = async (o: Observation) => {
    try { await api.review(caseId, { target_kind: "observation", target_id: o.id, action: "accept" }); toast("Observation accepted", "success"); onCorrected(); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-3">
        <Meta label="Filename" value={detail.item.original_filename} mono />
        <Meta label="Source type" value={detail.item.source_type} />
        <Meta label="Size" value={fmtBytes(detail.item.size_bytes)} />
        <Meta label="Uploaded" value={new Date(detail.item.uploaded_at).toLocaleString()} />
        <Meta label="Method" value={detail.item.extraction_method} mono />
        <Meta label="ID" value={detail.item.id} mono />
      </div>

      <div>
        <div className="mb-1 text-[12px] uppercase tracking-wide text-[var(--fg-dim)]">Integrity</div>
        <div className="rounded-lg border bg-[var(--bg-elev-2)] p-3">
          <div className="break-all font-mono text-[11px] text-[var(--fg-muted)]">SHA-256: {detail.item.sha256 || "n/a"}</div>
          <p className="mt-2 text-[11.5px] text-[var(--fg-dim)]">{detail.hash_note}</p>
          {detail.item.stored_path && <p className="mt-1 text-[11px] text-[var(--fg-dim)]">Original preserved at: <span className="font-mono">{detail.item.stored_path}</span></p>}
          {!detail.item.stored_path && <p className="mt-1 text-[11px] text-[var(--fg-dim)]">Built-in sample fixture (no uploaded bytes).</p>}
        </div>
      </div>

      {detail.item.notes && (
        <div className="flex gap-2 rounded-lg border border-[var(--warn)]/30 bg-[var(--warn)]/8 p-3 text-[12.5px] text-[var(--fg-muted)]">
          <ShieldQuestion size={15} className="mt-0.5 shrink-0 text-[var(--warn)]" /> {detail.item.notes}
        </div>
      )}

      <div>
        <div className="mb-1 text-[12px] uppercase tracking-wide text-[var(--fg-dim)]">Extracted text</div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border bg-[var(--bg-elev-2)] p-3 font-mono text-[12px] leading-relaxed text-[var(--fg-muted)]">{detail.item.derived_text || "(no extracted text — see processing notes above)"}</pre>
      </div>

      {(dates.length > 0 || amounts.length > 0) && (
        <div className="flex flex-wrap gap-2 text-[12px]">
          {dates.map((d) => <Tag key={d.id} tone="info">date · {d.value}</Tag>)}
          {amounts.map((a) => <Tag key={a.id} tone="ok">amount · {a.value}</Tag>)}
        </div>
      )}

      <div>
        <div className="mb-2 text-[12px] uppercase tracking-wide text-[var(--fg-dim)]">Observations & entities ({detail.observations.length})</div>
        <div className="space-y-2">
          {detail.observations.map((o) => (
            <div key={o.id} className="rounded-lg border bg-[var(--bg-elev-2)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Tag tone="accent">{o.field_type}</Tag>
                  <span className="font-mono text-[13px] text-[var(--fg)]">{editing?.id === o.id ? "" : o.value}</span>
                  <Tag tone={o.provenance === "inferred" ? "warn" : "default"}>{o.provenance}</Tag>
                  <Badge status={o.review_status} />
                </div>
                <div className="flex gap-1">
                  {o.review_status !== "accepted" && o.review_status !== "corrected" && <Button size="sm" variant="ghost" onClick={() => accept(o)}><Check size={13} /></Button>}
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(o); setNewValue(o.value); }} aria-label="Correct"><Pencil size={13} /></Button>
                </div>
              </div>
              {o.source_passage && <p className="mt-1.5 text-[11.5px] text-[var(--fg-dim)]">↳ “{o.source_passage}”{o.char_start != null && <span className="ml-1 font-mono">[chars {o.char_start}–{o.char_end}]</span>}</p>}
              {o.ambiguity && <p className="mt-1 text-[11.5px] text-[var(--warn)]">⚠ {o.ambiguity}</p>}
              {editing?.id === o.id && (
                <div className="mt-2 flex gap-2">
                  <Textarea rows={1} value={newValue} onChange={(e) => setNewValue(e.target.value)} />
                  <Button size="sm" variant="primary" onClick={() => saveCorrection(o)}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              )}
            </div>
          ))}
          {detail.observations.length === 0 && <p className="text-[12.5px] text-[var(--fg-dim)]">No observations extracted yet.</p>}
        </div>
      </div>

      {detail.timeline_events.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <div className="text-[12px] uppercase tracking-wide text-[var(--fg-dim)]">Linked timeline events ({detail.timeline_events.length})</div>
            <Button size="sm" variant="ghost" onClick={onJumpTimeline}><Link2 size={13} /> Open in Timeline</Button>
          </div>
          <ul className="space-y-1 text-[12.5px] text-[var(--fg-muted)]">
            {detail.timeline_events.map((t) => <li key={t.id}>• {t.timestamp_raw}: {t.description}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div><div className="text-[11px] text-[var(--fg-dim)]">{label}</div><div className={mono ? "font-mono text-[12px]" : "text-[13px]"}>{value}</div></div>;
}
