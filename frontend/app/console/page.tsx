"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background, BackgroundVariant, Handle, Position,
  type Edge, type Node, type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { api, streamEvents, type AgentEvent, type Dispute, type DisputeRow } from "@/lib/api";
import { rupees, titleCase } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { Badge, Card, Eyebrow, Panel, Skeleton } from "@/components/ui";

type NodeState = "idle" | "live" | "done" | "frozen" | "blocked";
type AgentNodeData = { label: string; role: string; state: NodeState; detail: string };

/**
 * The graph on screen is the graph in the backend, node for node. Evidence and
 * Policy sit side by side because they genuinely run at the same time; Fraud is
 * below them because it consumes the evidence forensics, and drawing it in
 * parallel would be a lie about the dependency.
 */
function AgentNode({ data }: NodeProps<AgentNodeData>) {
  const tone: Record<NodeState, string> = {
    idle: "border-line bg-surface-1",
    live: "border-accent bg-accent-soft shadow-[0_0_0_4px_var(--accent-soft)]",
    done: "border-line-strong bg-surface-1",
    frozen: "border-warn bg-warn-soft",
    blocked: "border-bad bg-bad-soft",
  };
  const nameTone: Record<NodeState, string> = {
    idle: "text-ink-3", live: "text-accent", done: "text-ink",
    frozen: "text-warn", blocked: "text-bad",
  };

  return (
    <div className={`w-[186px] rounded-md border px-3 py-2 text-center transition-all duration-base ease-out ${tone[data.state]}`}>
      <Handle type="target" position={Position.Top} />
      <div className={`text-base font-medium ${nameTone[data.state]}`}>{data.label}</div>
      <div className="text-2xs text-ink-3">{data.role}</div>
      {data.detail && (
        <div className={`text-2xs mt-1 tabular ${
          data.state === "frozen" ? "text-warn"
            : data.state === "blocked" ? "text-bad" : "text-ok"}`}>
          {data.detail}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

const LAYOUT: { id: string; label: string; role: string; x: number; y: number }[] = [
  { id: "interaction", label: "Interaction", role: "understands the claim", x: 150, y: 0 },
  { id: "evidence", label: "Evidence", role: "verifies the capture", x: 0, y: 110 },
  { id: "policy", label: "Policy", role: "cites the clause", x: 300, y: 110 },
  { id: "fraud", label: "Fraud", role: "scores the risk", x: 150, y: 220 },
  { id: "resolution", label: "Resolution", role: "decides the outcome", x: 150, y: 330 },
  { id: "guardrail", label: "Guardrail", role: "limits, in code", x: 150, y: 440 },
  { id: "escalation", label: "Escalation", role: "asks a human", x: 0, y: 550 },
  { id: "execution", label: "Execution", role: "moves money and goods", x: 300, y: 550 },
];

const EDGES: Edge[] = [
  { id: "e1", source: "interaction", target: "evidence" },
  { id: "e2", source: "interaction", target: "policy" },
  { id: "e3", source: "evidence", target: "fraud" },
  { id: "e4", source: "policy", target: "fraud" },
  { id: "e5", source: "fraud", target: "resolution" },
  { id: "e6", source: "resolution", target: "guardrail" },
  { id: "e7", source: "guardrail", target: "escalation", animated: true },
  { id: "e8", source: "guardrail", target: "execution", animated: true },
];

export default function ConsolePage() {
  const [cases, setCases] = useState<DisputeRow[]>([]);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [states, setStates] = useState<Record<string, { state: NodeState; detail: string }>>({});
  const stop = useRef<(() => void) | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => api.disputes().then(setCases).catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!caseId && cases.length) setCaseId(cases[0].dispute_id);
  }, [cases, caseId]);

  const ingest = useCallback((batch: AgentEvent[]) => {
    setEvents((current) => [...current, ...batch]);
    setStates((current) => {
      const next = { ...current };
      for (const ev of batch) {
        if (!LAYOUT.some((n) => n.id === ev.agent)) continue;
        if (ev.kind === "start") next[ev.agent] = { state: "live", detail: "" };
        else if (ev.kind === "error") next[ev.agent] = { state: "blocked", detail: "blocked" };
        else if (ev.kind === "gate" && /waiting|approval/i.test(ev.message)) {
          next[ev.agent] = { state: "frozen", detail: "frozen, awaiting a human" };
        } else {
          next[ev.agent] = { state: "done", detail: summarise(ev) };
        }
        if (ev.agent === "guardrail" && ev.data?.route) {
          next.guardrail = {
            state: ev.data.route === "auto" ? "done" : "frozen",
            detail: ev.data.route === "auto"
              ? `autonomous, limit ${rupees(ev.data.effective_cap)}`
              : `human approval, over ${rupees(ev.data.effective_cap)}`,
          };
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!caseId) return;
    stop.current?.();
    setEvents([]);
    setStates({});
    setDispute(null);

    api.dispute(caseId).then((d) => {
      setDispute(d);
      ingest(d.events ?? []);
    }).catch(() => {});

    stop.current = streamEvents(caseId, ingest);
    const refresh = setInterval(() => {
      api.dispute(caseId).then(setDispute).catch(() => {});
    }, 4000);

    return () => { stop.current?.(); clearInterval(refresh); };
  }, [caseId, ingest]);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [events]);

  const nodes: Node<AgentNodeData>[] = useMemo(() => LAYOUT.map((n) => ({
    id: n.id,
    type: "agent",
    position: { x: n.x, y: n.y },
    data: {
      label: n.label, role: n.role,
      state: states[n.id]?.state ?? "idle",
      detail: states[n.id]?.detail ?? "",
    },
    draggable: false, selectable: false, connectable: false,
  })), [states]);

  const edges = useMemo(() => EDGES.map((e) => ({
    ...e,
    className: states[e.source]?.state === "done" ? "active" : undefined,
  })), [states]);

  const elapsed = events.length > 1
    ? (new Date(events[events.length - 1].at).getTime() - new Date(events[0].at).getTime()) / 1000
    : 0;

  return (
    <AppShell active="console">
      <header className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter">Agent console</h1>
          <p className="text-ink-2 mt-1">
            The graph below is the graph in the engine, node for node.
          </p>
        </div>
        <select value={caseId ?? ""} onChange={(e) => setCaseId(e.target.value)}
                className="h-8 px-2 pr-7 rounded border border-line bg-surface-1 text-base appearance-none cursor-pointer min-w-[280px]">
          {cases.length === 0 && <option>No cases yet</option>}
          {cases.map((c) => (
            <option key={c.dispute_id} value={c.dispute_id}>
              {c.dispute_id} · {c.buyer_name} · {titleCase(c.claim_type)} {rupees(c.claim_value)}
            </option>
          ))}
        </select>
      </header>

      <div className="grid xl:grid-cols-[1fr_380px] gap-5 items-start">
        <div>
          <Panel
            title={dispute
              ? `${dispute.dispute_id} · ${titleCase(dispute.claim_type)} · ${rupees(dispute.claim_value)}`
              : "Select a case"}
            action={dispute && (
              <Badge tone={dispute.status === "closed" ? "ok"
                : dispute.status.startsWith("awaiting") ? "warn" : "live"}>
                {titleCase(dispute.status)}
              </Badge>
            )}
          >
            <div className="h-[620px] bg-bg">
              <ReactFlow
                nodes={nodes} edges={edges} nodeTypes={nodeTypes}
                fitView fitViewOptions={{ padding: 0.18 }}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false} nodesConnectable={false}
                zoomOnScroll={false} panOnScroll preventScrolling={false}
              >
                <Background variant={BackgroundVariant.Dots} gap={18} size={1}
                            color="var(--border)" />
              </ReactFlow>
            </div>
            <div className="px-4 py-2 border-t border-line-subtle text-xs text-ink-3">
              Evidence and Policy run at the same time. Fraud waits for Evidence on purpose:
              scoring risk before knowing an image carries generator metadata throws away the
              strongest signal there is.
            </div>
          </Panel>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              { v: elapsed ? `${elapsed.toFixed(1)}s` : "—", l: "Elapsed" },
              { v: dispute?.usage?.calls ?? 0, l: "Model calls" },
              { v: dispute?.usage?.cost_inr ? rupees(dispute.usage.cost_inr, 2) : "₹0",
                l: "Cost this case" },
              { v: dispute?.audit?.length ?? 0, l: "Audit entries" },
            ].map((m) => (
              <Card key={m.l} className="flex flex-col gap-0.5">
                <span className="text-2xl font-bold tracking-tighter tabular">{m.v}</span>
                <span className="text-sm text-ink-3">{m.l}</span>
              </Card>
            ))}
          </div>
        </div>

        <Panel
          title="Event stream"
          action={<Badge tone="live" dot>live</Badge>}
          className="xl:sticky xl:top-5"
        >
          <div ref={streamRef} className="h-[560px] overflow-y-auto px-4 py-3 font-mono text-sm">
            {events.length === 0 && (
              <div className="text-ink-3">Nothing yet for this case.</div>
            )}
            {events.map((ev, i) => (
              <div key={i} className="flex gap-2 py-1 border-b border-line-subtle last:border-0">
                <span className="text-ink-4 shrink-0">
                  {new Date(ev.at).toLocaleTimeString("en-GB")}
                </span>
                <span className="text-accent shrink-0 w-[76px] truncate">{ev.agent}</span>
                <span className={`break-words ${
                  ev.kind === "gate" ? "text-warn"
                    : ev.kind === "error" ? "text-bad"
                    : ev.kind === "decision" ? "text-ink font-medium" : "text-ink-2"}`}>
                  {ev.message}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function summarise(ev: AgentEvent): string {
  const d = ev.data ?? {};
  if (ev.agent === "interaction" && d.claim_type) return titleCase(d.claim_type);
  if (ev.agent === "evidence" && d.tier) return titleCase(String(d.tier));
  if (ev.agent === "evidence" && typeof d.confidence === "number") return `confidence ${d.confidence}`;
  if (ev.agent === "policy" && d.eligible !== undefined) {
    return d.eligible ? "eligible" : "not eligible";
  }
  if (ev.agent === "fraud") return ev.message.toLowerCase();
  if (ev.agent === "resolution" && ev.kind === "decision") return ev.message;
  if (ev.agent === "execution" && Array.isArray(d.steps)) return d.steps[0] ?? "done";
  return "";
}
