"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type Analytics, type Dispute, type DisputeRow } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { OUTCOME_LABEL, mediaUrl, rupees, timeAgo, titleCase } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { CountUp } from "@/components/motion";
import {
  Badge, Button, Card, EmptyState, Eyebrow, Panel, Sheet, Skeleton, useToast,
} from "@/components/ui";
import { IntegrationPanel } from "@/components/IntegrationPanel";
import { PolicyPanel } from "@/components/PolicyPanel";

function outcomeTone(outcome: string | null) {
  if (!outcome) return "neutral" as const;
  if (["full_refund", "partial_refund", "replacement", "coupon"].includes(outcome)) return "ok" as const;
  if (outcome === "escalate") return "warn" as const;
  return "neutral" as const;
}

function DashboardInner() {
  const params = useSearchParams();
  const tab = params.get("tab") ?? "disputes";
  const { status, session } = useAuth();
  const toast = useToast();

  const [rows, setRows] = useState<DisputeRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [deciding, setDeciding] = useState(false);

  const storeId = session?.store.id;

  const load = useCallback(async () => {
    if (!storeId) return;
    const params: Record<string, string> = { store_id: storeId };
    if (filter) params.status = filter;
    try { setRows(await api.disputes(params)); } catch { /* keep the last good list */ }
  }, [storeId, filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!storeId) return;
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [storeId, load]);

  useEffect(() => {
    if (tab === "analytics" && storeId) api.analytics(storeId).then(setAnalytics).catch(() => {});
  }, [tab, storeId]);

  if (status !== "authed" || !session) return <AppShell active={tab}><Skeleton className="w-56" /></AppShell>;

  const needsYou = (rows ?? []).filter((r) => r.status === "awaiting_seller_approval").length;

  const open = async (id: string) => {
    try { setSelected(await api.dispute(id)); }
    catch (e) { toast(e instanceof Error ? e.message : "Could not open that case", "err"); }
  };

  const decide = async (approved: boolean, note = "",
                        overrideOutcome?: string, overrideAmount?: number) => {
    if (!selected) return;
    setDeciding(true);
    try {
      const result = await api.approve(selected.dispute_id, {
        approved, by: `seller:${storeId}`, note,
        override_outcome: overrideOutcome ?? null,
        override_amount: overrideAmount ?? null,
      });
      toast(result.refund
        ? `Done. ${rupees(result.refund.amount)} refunded.`
        : "Recorded. No payment was made.");
      setSelected(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "That did not go through", "err");
    } finally {
      setDeciding(false);
    }
  };

  const runWatchdog = async () => {
    toast("Scanning shipments and approval timers…");
    try {
      const r = await api.watchdog();
      const opened = r.disputes_opened?.length ?? 0;
      toast(opened
        ? `${opened} dispute(s) opened from stalled shipments nobody had reported.`
        : "No stalled shipments and no breached timers.");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "The watchdog could not run", "err");
    }
  };

  return (
    <AppShell active={tab} badge={needsYou}>
      {tab === "disputes" && (
        <>
          <header className="flex items-end justify-between gap-4 mb-5">
            <div>
              <h1 className="text-2xl font-bold tracking-tighter">Disputes</h1>
              <p className="text-ink-2 mt-1">
                Everything below {rupees(session.store.auto_approve_cap)} resolves on its own.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={runWatchdog}>Run watchdog</Button>
              <select value={filter} onChange={(e) => setFilter(e.target.value)}
                      className="h-8 px-2 pr-7 rounded border border-line bg-surface-1 text-base appearance-none cursor-pointer">
                <option value="">All</option>
                <option value="awaiting_seller_approval">Needs you</option>
                <option value="closed">Resolved</option>
              </select>
            </div>
          </header>

          <Panel>
            {rows === null && <div className="p-5 flex flex-col gap-3">
              <Skeleton className="w-1/2" /><Skeleton className="w-1/3" /></div>}

            {rows?.length === 0 && (
              <EmptyState
                glyph="◷"
                title={filter ? "Nothing matches this filter" : "Nothing waiting"}
                body={filter
                  ? "Try clearing the filter to see resolved cases too."
                  : "When a buyer reports a problem it appears here. Most never need you."}
                action={filter
                  ? <Button size="sm" onClick={() => setFilter("")}>Clear filter</Button>
                  : <Button size="sm" onClick={() => (window.location.href = "/store")}>
                      Open the test storefront
                    </Button>}
              />
            )}

            <div className="divide-y divide-line-subtle">
              {rows?.map((r) => (
                <button key={r.dispute_id} onClick={() => open(r.dispute_id)}
                        className="w-full text-left flex items-center gap-3 px-4 py-2.5 min-h-[44px]
                                   hover:bg-surface-2 transition-colors duration-fast">
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold">{r.buyer_name || "Buyer"}</span>
                    <span className="text-ink-3"> · {titleCase(r.claim_type)}</span>
                    <span className="block text-xs text-ink-3">
                      <span className="font-mono">{r.order_id}</span> · {timeAgo(r.created_at)}
                      {r.opened_by === "watchdog" && (
                        <span className="text-warn"> · opened by watchdog</span>)}
                    </span>
                  </span>
                  <span className="font-semibold tabular">{rupees(r.claim_value)}</span>
                  {(r.fraud_score ?? 0) >= 0.6 && <Badge tone="bad">Fraud risk</Badge>}
                  {r.status === "awaiting_seller_approval"
                    ? <Badge tone="warn">Needs you</Badge>
                    : <Badge tone={outcomeTone(r.outcome)}>
                        {r.outcome ? OUTCOME_LABEL[r.outcome] ?? titleCase(r.outcome) : "Open"}
                      </Badge>}
                </button>
              ))}
            </div>
          </Panel>
        </>
      )}

      {tab === "analytics" && (
        <>
          <header className="mb-5">
            <h1 className="text-2xl font-bold tracking-tighter">Analytics</h1>
            <p className="text-ink-2 mt-1">What the agents handled for you.</p>
          </header>

          {!analytics ? <Skeleton className="w-1/2" /> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { v: analytics.disputes_total, label: "Disputes" },
                  { v: Math.round(analytics.auto_resolution_rate * 100), suffix: "%",
                    label: "Resolved without you" },
                  { v: analytics.awaiting_human, label: "Waiting on you" },
                  { v: analytics.fraud_flagged, label: "Flagged as risky" },
                  { v: analytics.refunded_total, prefix: "₹", label: "Refunded" },
                  { v: analytics.fraud_value_blocked, prefix: "₹", label: "Claim value held back" },
                ].map((m) => (
                  <Card key={m.label} className="flex flex-col gap-0.5">
                    <span className="text-2xl font-bold tracking-tighter">
                      <CountUp to={m.v} prefix={m.prefix} suffix={m.suffix} />
                    </span>
                    <span className="text-sm text-ink-3">{m.label}</span>
                  </Card>
                ))}
              </div>

              <Panel title="Cost" className="mt-5">
                <div className="p-5 flex flex-col gap-2">
                  <div className="flex justify-between">
                    <span className="text-ink-2">Model cost, this store</span>
                    <span className="font-semibold tabular">
                      {analytics.llm_cost_inr ? rupees(analytics.llm_cost_inr, 2) : "₹0"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-2">Per dispute</span>
                    <span className="font-semibold tabular">
                      {analytics.cost_per_dispute_inr
                        ? rupees(analytics.cost_per_dispute_inr, 2) : "₹0"}
                    </span>
                  </div>
                  <p className="text-sm text-ink-3 mt-2">
                    A person handling the same case costs roughly ₹150–400 in agent time spread
                    over several days.
                    {!analytics.llm_cost_inr &&
                      " This workspace is running on the offline provider, so model cost is zero."}
                  </p>
                </div>
              </Panel>
            </>
          )}
        </>
      )}

      {tab === "policy" && <PolicyPanel storeId={session.store.id} />}
      {tab === "integration" && <IntegrationPanel store={session.store} />}

      {/* ── the approval dossier ──────────────────────────────────────── */}
      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow={selected?.status === "awaiting_seller_approval" ? "Needs your approval" : "Case"}
        title={selected
          ? `${titleCase(selected.claim_type)} · ${rupees(selected.claim_value)}` : ""}
        footer={selected?.status === "awaiting_seller_approval" ? (
          <>
            <Button variant="primary" className="flex-1" disabled={deciding}
                    onClick={() => decide(true)}>Approve</Button>
            <Button disabled={deciding} onClick={() => {
              const amount = prompt("Refund how much instead?",
                String(selected?.decision?.amount ?? 0));
              if (amount === null) return;
              const note = prompt("Reason for the change?") || "adjusted by seller";
              decide(true, note, "partial_refund", parseFloat(amount));
            }}>Modify</Button>
            <Button variant="danger" disabled={deciding} onClick={() => {
              const note = prompt("Why are you declining? The buyer sees a version of this.");
              if (note === null) return;
              decide(false, note);
            }}>Decline</Button>
          </>
        ) : undefined}
      >
        {selected && <Dossier dispute={selected} />}
      </Sheet>
    </AppShell>
  );
}

function Dossier({ dispute }: { dispute: Dispute }) {
  const e = dispute.evidence ?? {};
  const p = dispute.policy ?? {};
  const f = dispute.fraud ?? {};
  const d = dispute.decision ?? {};

  return (
    <>
      {dispute.status === "awaiting_seller_approval" && (
        <div className="rounded-lg bg-warn-soft p-4">
          <div className="font-semibold">{dispute.dossier?.headline}</div>
          <p className="text-sm mt-1">{dispute.guardrail?.reasons?.join(" ")}</p>
        </div>
      )}

      {dispute.evidence_files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Eyebrow>Evidence</Eyebrow>
          {dispute.evidence_files.map((file) => (
            <img key={file.path} src={mediaUrl(file.path)} alt="evidence"
                 className="w-full rounded-md border border-line" />
          ))}
        </div>
      )}

      <div>
        <Eyebrow>Findings</Eyebrow>
        <div className="divide-y divide-line-subtle">
          <Finding label="Evidence">
            <Badge tone={e.verified ? "ok" : "bad"}>
              {e.verified ? "Verified" : "Not verified"}
            </Badge>
            <span className="text-sm text-ink-3 ml-1.5">
              {Math.round((e.confidence ?? 0) * 100)}% · {titleCase(e.tier ?? "none")}
            </span>
            <p className="text-sm text-ink-3 mt-1">{e.notes}</p>
            {!!e.forensics_flags?.length && (
              <p className="text-sm text-warn mt-1">
                {e.forensics_flags.map((x) => titleCase(x)).join(", ")}
              </p>
            )}
          </Finding>

          <Finding label="Policy">
            <Badge tone={p.eligible ? "ok" : "neutral"}>
              {p.eligible ? "Eligible" : "Not eligible"}
            </Badge>
            {p.clause_id && <span className="font-mono text-xs ml-1.5">{p.clause_id}</span>}
            <p className="text-sm text-ink-3 mt-1">{p.reason}</p>
          </Finding>

          <Finding label="Fraud">
            <Badge tone={(f.score ?? 0) >= 0.6 ? "bad" : "ok"}>
              {(f.score ?? 0).toFixed(2)}
            </Badge>
            <p className="text-sm text-ink-3 mt-1">{(f.signals ?? []).join("; ")}</p>
          </Finding>

          <Finding label="Recommends">
            <Badge tone={outcomeTone(d.outcome ?? null)}>
              {d.outcome ? OUTCOME_LABEL[d.outcome] ?? titleCase(d.outcome) : "—"}
            </Badge>
            {!!d.amount && <span className="font-semibold tabular ml-1.5">{rupees(d.amount)}</span>}
            <p className="text-sm text-ink-3 mt-1">{d.rationale}</p>
          </Finding>
        </div>
      </div>

      {dispute.refund && (
        <Card tight>
          <Eyebrow>Executed</Eyebrow>
          <p className="text-sm mt-1">
            {rupees(dispute.refund.amount)} via {dispute.refund.method.replace("_", " ")} ·{" "}
            <span className="font-mono text-xs">{dispute.refund.reference}</span>
            <br />Approved by {dispute.refund.approved_by}
          </p>
        </Card>
      )}

      <details>
        <summary className="text-sm text-ink-2 cursor-pointer">
          Audit trail ({dispute.audit.length} entries)
        </summary>
        <div className="mt-2 flex flex-col gap-0.5">
          {dispute.audit.map((a, i) => (
            <div key={i} className="text-xs text-ink-3">
              <span className="font-mono">{new Date(a.at).toLocaleTimeString()}</span>{" "}
              {a.actor} · {a.action}
            </div>
          ))}
        </div>
      </details>
    </>
  );
}

function Finding({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-3">
      <span className="w-[78px] shrink-0 text-sm text-ink-3">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6"><Skeleton className="w-56" /></div>}>
      <DashboardInner />
    </Suspense>
  );
}
