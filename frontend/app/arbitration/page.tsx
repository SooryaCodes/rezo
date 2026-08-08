"use client";

/**
 * Level two.
 *
 * A seller who never answers is not a decision. When the approval SLA lapses
 * the case stops being theirs and lands here, on a desk that sits above any
 * single store, so a buyer's refund is never held hostage by an inbox nobody
 * reads. This view is deliberately cross-store: the whole point is that it is
 * not the merchant deciding any more.
 */

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, EmptyState, Panel, Skeleton, useToast } from "@/components/ui";
import { api, type DisputeRow } from "@/lib/api";

function hoursOverdue(due: string | null | undefined): number | null {
  if (!due) return null;
  const diff = Date.now() - new Date(due).getTime();
  return diff <= 0 ? null : Math.floor(diff / 3_600_000);
}

export default function ArbitrationPage() {
  const [queue, setQueue] = useState<DisputeRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [working, setWorking] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api.platformQueue().then(setQueue).catch(() => setQueue([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!open) { setDetail(null); return; }
    api.dispute(open).then(setDetail).catch(() => setDetail(null));
  }, [open]);

  async function rule(approved: boolean) {
    if (!open) return;
    setWorking(true);
    try {
      await api.approve(open, {
        approved, by: "platform",
        note: approved
          ? "Platform upheld the recommendation after the seller SLA lapsed."
          : "Platform declined the claim after review.",
      });
      toast(approved ? "Ruling recorded, refund released" : "Ruling recorded, claim declined");
      setOpen(null);
      load();
    } catch (err: any) {
      toast(err?.message ?? "Could not record the ruling", "bad");
    } finally {
      setWorking(false);
    }
  }

  return (
    <AppShell active="arbitration" badge={queue?.length || undefined}>
      <div className="mb-8 max-w-2xl">
        <h1 className="text-2xl font-medium tracking-tight text-ink">Arbitration</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-3">
          Cases where the seller did not respond inside their approval window.
          Rezo decides these on the buyer&rsquo;s behalf so a silent inbox cannot
          hold a refund indefinitely. Every ruling here is written to the same
          audit trail as an automatic decision.
        </p>
      </div>

      {queue === null && <Skeleton className="h-40" />}

      {queue?.length === 0 && (
        <EmptyState
          title="Nothing waiting"
          body="Sellers are answering inside their SLA. Cases appear here only when an approval window lapses."
        />
      )}

      {!!queue?.length && (
        <div className="grid gap-3">
          {queue.map((row) => {
            const late = hoursOverdue((row as any).sla_due_at);
            return (
              <Card key={row.dispute_id} className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="min-w-[13rem] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink-3">{row.dispute_id}</span>
                    {late !== null && (
                      <Badge tone="bad">{late}h past SLA</Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-ink">{row.order_id} &middot; {row.store_name ?? row.store_id}</p>
                </div>
                <div className="text-sm">
                  <span className="text-ink-3">Recommended</span>{" "}
                  <span className="text-ink">{(row.outcome ?? "escalate").replace(/_/g, " ")}</span>
                </div>
                <div className="text-sm tabular-nums text-ink">
                  &#8377;{Number(row.claim_value ?? 0).toLocaleString("en-IN")}
                </div>
                <Button size="sm" variant="secondary" onClick={() => setOpen(row.dispute_id)}>
                  Review
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/20 p-0 sm:items-center sm:p-6"
             onClick={() => !working && setOpen(null)}>
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <Panel className="max-h-[85vh] overflow-y-auto">
              {!detail && <Skeleton className="h-48" />}
              {detail && (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-xs text-ink-3">{detail.dispute_id}</p>
                      <h2 className="mt-1 text-lg font-medium text-ink">
                        {detail.order?.items?.[0]?.title ?? detail.order_id}
                      </h2>
                    </div>
                    <Badge tone="attention">Seller did not respond</Badge>
                  </div>

                  {detail.dossier?.summary && (
                    <p className="mt-4 text-sm leading-relaxed text-ink-2">{detail.dossier.summary}</p>
                  )}

                  <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                    {[
                      ["Claim", `₹${Number(detail.claim_value ?? 0).toLocaleString("en-IN")}`],
                      ["Policy clause", detail.policy?.clause_id || "none cited"],
                      ["Evidence", `${detail.evidence?.tier ?? "none"} · ${detail.evidence?.confidence ?? 0}`],
                      ["Fraud risk", String(detail.fraud?.score ?? "n/a")],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-xs uppercase tracking-wide text-ink-3">{k}</dt>
                        <dd className="mt-0.5 text-sm text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  {detail.decision?.rationale && (
                    <div className="mt-5 rounded-lg bg-surface-2 p-4">
                      <p className="text-xs uppercase tracking-wide text-ink-3">Recommendation</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{detail.decision.rationale}</p>
                    </div>
                  )}

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button onClick={() => rule(true)} disabled={working}>
                      Uphold and release &#8377;
                      {Number(detail.decision?.amount ?? 0).toLocaleString("en-IN")}
                    </Button>
                    <Button variant="secondary" onClick={() => rule(false)} disabled={working}>
                      Decline the claim
                    </Button>
                    <Button variant="ghost" onClick={() => setOpen(null)} disabled={working}>
                      Close
                    </Button>
                  </div>
                </>
              )}
            </Panel>
          </div>
        </div>
      )}
    </AppShell>
  );
}
