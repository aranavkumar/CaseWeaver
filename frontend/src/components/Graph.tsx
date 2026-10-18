"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, RotateCcw, Search, X, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { GraphData, GraphNode, GraphEdge } from "@/lib/types";
import { Card, Button, Badge, Tag, Select, Spinner, EmptyState } from "./ui";

const NODE_COLOR: Record<string, string> = {
  person: "#c084fc", email: "#38bdf8", phone: "#22d3ee", url: "#2dd4bf",
  transaction: "#fbbf24", amount: "#34d399", listing: "#f472b6", evidence: "#8a97b0",
  organization: "#a3e635",
};

export function GraphView() {
  const { currentCase, toast, setSection } = useStore();
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selNode, setSelNode] = useState<GraphNode | null>(null);
  const [selEdge, setSelEdge] = useState<GraphEdge | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<any>(null);

  useEffect(() => {
    if (!currentCase) { setLoading(false); return; }
    setLoading(true);
    api.graph(currentCase.id)
      .then(setData)
      .catch((e) => toast((e as Error).message, "error"))
      .finally(() => setLoading(false));
  }, [currentCase, toast]);

  const filtered = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    let nodes = data.nodes;
    if (typeFilter !== "all") nodes = nodes.filter((n) => n.type === typeFilter);
    if (query) { const q = query.toLowerCase(); nodes = nodes.filter((n) => n.label.toLowerCase().includes(q) || n.normalized.toLowerCase().includes(q)); }
    const keep = new Set(nodes.map((n) => n.id));
    let edges = data.edges.filter((e) => keep.has(e.source) && keep.has(e.target));
    if (statusFilter !== "all") edges = edges.filter((e) => e.review_status === statusFilter);
    return { nodes, edges };
  }, [data, typeFilter, statusFilter, query]);

  // (re)render cytoscape when filtered changes
  useEffect(() => {
    if (loading || !containerRef.current || !currentCase) return;
    let cancelled = false;
    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      if (cancelled || !containerRef.current) return;
      const elements = [
        ...filtered.nodes.map((n) => ({
          data: { id: n.id, label: n.label, type: n.type, color: NODE_COLOR[n.type] || "#8a97b0" },
        })),
        ...filtered.edges.map((e) => ({
          data: { id: e.id, source: e.source, target: e.target, label: e.relationship_type,
            inferred: e.is_inferred, rejected: e.review_status === "rejected" },
        })),
      ];
      if (cyRef.current) cyRef.current.destroy();
      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          { selector: "node", style: {
            "background-color": (n: any) => n.data("color"),
            label: "data(label)", color: "#e6ebf5", "font-size": "9px",
            "text-wrap": "wrap", "text-max-width": "90px", "text-valign": "bottom",
            "text-margin-y": 4, width: 26, height: 26,
            "border-width": 2, "border-color": "#0b0f16",
          } },
          { selector: "node[type = 'evidence']", style: { shape: "round-rectangle", width: 34, height: 22, "background-opacity": 0.85 } },
          { selector: "edge", style: {
            width: 1.6, "line-color": "#3a4a66", "target-arrow-shape": "triangle",
            "target-arrow-color": "#3a4a66", "curve-style": "bezier",
            "line-style": (e: any) => (e.data("inferred") ? "dashed" : "solid"),
            label: "data(label)", "font-size": "7px", color: "#8a97b0",
          } },
          { selector: 'edge[rejected = true]', style: { "line-color": "#f87171", "target-arrow-color": "#f87171", "line-style": "dotted" } },
          { selector: ":selected", style: { "border-color": "#38bdf8", "line-color": "#38bdf8", "target-arrow-color": "#38bdf8", "overlay-color": "#38bdf8", "overlay-opacity": 0.12 } },
        ],
        layout: { name: "cose", animate: false, padding: 30 },
        wheelSensitivity: 0.2,
      });
      cy.on("tap", "node", (evt: any) => { setSelEdge(null); setSelNode(filtered.nodes.find((n) => n.id === evt.target.id()) || null); });
      cy.on("tap", "edge", (evt: any) => { setSelNode(null); setSelEdge(filtered.edges.find((e) => e.id === evt.target.id()) || null); });
      cy.on("tap", (evt: any) => { if (evt.target === cy) { setSelNode(null); setSelEdge(null); } });
      cyRef.current = cy;
    })();
    return () => { cancelled = true; };
  }, [filtered, loading, currentCase]);

  const relReview = async (decision: "accept" | "reject") => {
    if (!selEdge || !currentCase) return;
    setReviewing(true);
    try {
      await api.review(currentCase.id, { target_kind: "relationship", target_id: selEdge.id, action: decision, comment: decision === "reject" ? "Reviewer rejected proposed relationship" : "Reviewer accepted relationship" });
      toast(`Relationship ${decision === "accept" ? "accepted" : "rejected"}`, "success");
      const fresh = await api.graph(currentCase.id);
      setData(fresh);
      const updated = fresh.edges.find((e) => e.id === selEdge.id);
      setSelEdge(updated || null);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setReviewing(false); }
  };

  if (!currentCase) return <EmptyState title="No case selected" message="Pick an investigation to view its relationship graph." action={<Button onClick={() => setSection("investigations")}>Go to Investigations</Button>} />;
  if (loading) return <div className="flex items-center gap-3 text-[var(--fg-muted)]"><Spinner /> Loading graph…</div>;

  const entityTypes = ["all", ...Array.from(new Set((data?.nodes || []).map((n) => n.type)))];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Intelligence Graph</h1>
        <p className="mt-1 text-[13px] text-[var(--fg-muted)]">Built only from structured records. Colours distinguish entity types — never guilt. Click a node or edge for provenance.</p>
      </header>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-[var(--fg-dim)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search entities…"
            className="w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-elev-2)] py-2 pl-8 pr-2 text-[13px] focus:outline-none" />
        </div>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-auto">{entityTypes.map((t) => <option key={t} value={t}>{t === "all" ? "All entity types" : t}</option>)}</Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
          <option value="all">All review states</option><option value="needs_review">needs review</option><option value="accepted">accepted</option><option value="rejected">rejected</option>
        </Select>
        <Button size="sm" variant="ghost" onClick={() => { setTypeFilter("all"); setStatusFilter("all"); setQuery(""); }}><RotateCcw size={13} /> Reset</Button>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => cyRef.current?.zoom({ level: (cyRef.current.zoom() as number) * 1.2, position: cyRef.current.pan() })}>+</Button>
          <Button size="sm" variant="ghost" onClick={() => cyRef.current?.zoom({ level: (cyRef.current.zoom() as number) * 0.83, position: cyRef.current.pan() })}>−</Button>
          <Button size="sm" variant="ghost" onClick={() => cyRef.current?.fit()}><Maximize2 size={13} /> Fit</Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-3 overflow-hidden">
          {filtered.nodes.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-[var(--fg-dim)]">No entities yet — run the investigation to build the graph.</div>
          ) : (
            <div ref={containerRef} className="h-[520px] w-full" />
          )}
        </Card>

        <Card className="p-4">
          {!selNode && !selEdge && (
            <div className="space-y-3">
              <div className="text-[13px] font-semibold">Legend</div>
              <div className="flex flex-wrap gap-1.5">{Object.entries(NODE_COLOR).map(([k, c]) => <span key={k} className="inline-flex items-center gap-1 text-[11px] text-[var(--fg-muted)]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{k}</span>)}</div>
              <p className="text-[11.5px] text-[var(--fg-dim)]">Solid edge = directly observed · dashed = inferred · dotted red = rejected.</p>
            </div>
          )}
          {selNode && <NodePanel node={selNode} edges={data?.edges.filter((e) => e.source === selNode.id || e.target === selNode.id) || []} corroborations={data?.corroborations.filter((c) => c.entity_id === selNode.id) || []} onEvidence={() => setSection("evidence")} />}
          {selEdge && <EdgePanel edge={selEdge} nodes={data?.nodes || []} reviewing={reviewing} onReview={relReview} />}
        </Card>
      </div>
    </div>
  );
}

function NodePanel({ node, edges, corroborations, onEvidence }: {
  node: GraphNode; edges: GraphEdge[]; corroborations: any[]; onEvidence: () => void;
}) {
  return (
    <div className="space-y-3 fade-in">
      <div className="flex items-center justify-between">
        <Tag tone="accent">{node.type}</Tag>
        <button onClick={onEvidence} className="text-[11px] text-[var(--fg-dim)] hover:text-[var(--fg)]">view evidence</button>
      </div>
      <div className="text-[14px] font-semibold break-words">{node.label}</div>
      {corroborations.length > 0 && (
        <div className="rounded-lg border border-[var(--ok)]/30 bg-[var(--ok)]/8 p-2.5 text-[11.5px] text-[var(--fg-muted)]">
          <div className="mb-1 font-medium text-[var(--ok)]">Cross-file corroboration</div>
          {corroborations[0].explanation}
        </div>
      )}
      <div className="text-[12px] text-[var(--fg-dim)]">Appears in {node.evidence_ids.length} evidence item(s) · {node.observation_ids.length} observation(s)</div>
      <div>
        <div className="mb-1.5 text-[12px] font-semibold">Relationships ({edges.length})</div>
        <div className="space-y-1.5">
          {edges.map((e) => (
            <div key={e.id} className="rounded border border-[var(--border-soft)] p-2 text-[11.5px]">
              <div className="flex justify-between"><span className="font-medium">{e.relationship_type}</span><Badge status={e.review_status} /></div>
              <p className="mt-1 text-[var(--fg-dim)]">{e.explanation}</p>
            </div>
          ))}
          {edges.length === 0 && <p className="text-[11.5px] text-[var(--fg-dim)]">No relationships on this node.</p>}
        </div>
      </div>
    </div>
  );
}

function EdgePanel({ edge, nodes, reviewing, onReview }: {
  edge: GraphEdge; nodes: GraphNode[]; reviewing: boolean; onReview: (d: "accept" | "reject") => void;
}) {
  const src = nodes.find((n) => n.id === edge.source);
  const tgt = nodes.find((n) => n.id === edge.target);
  return (
    <div className="space-y-3 fade-in">
      <div className="text-[13px] font-semibold">Relationship</div>
      <div className="text-[13px]">{src?.label || edge.source} <span className="text-[var(--accent)]">→ {edge.relationship_type} →</span> {tgt?.label || edge.target}</div>
      <div className="flex flex-wrap gap-1.5">
        <Tag tone={edge.is_inferred ? "warn" : "default"}>{edge.is_inferred ? "inferred" : "directly observed"}</Tag>
        <Tag>match: {edge.match_method}</Tag>
        <Tag>confidence: {(edge.confidence * 100).toFixed(0)}%</Tag>
        <Badge status={edge.review_status} />
      </div>
      <p className="text-[12.5px] text-[var(--fg-muted)]">{edge.explanation}</p>
      {edge.contradicting_evidence && <p className="text-[12px] text-[var(--danger)]">Contradicting: {edge.contradicting_evidence}</p>}
      <div className="text-[11.5px] text-[var(--fg-dim)]">Supported by {edge.supporting_observation_ids.length} observation(s) in {edge.supporting_evidence_ids.length} evidence item(s).</div>
      {edge.review_status === "needs_review" && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="primary" loading={reviewing} onClick={() => onReview("accept")}><Check size={13} /> Accept</Button>
          <Button size="sm" variant="danger" disabled={reviewing} onClick={() => onReview("reject")}><X size={13} /> Reject</Button>
        </div>
      )}
    </div>
  );
}
