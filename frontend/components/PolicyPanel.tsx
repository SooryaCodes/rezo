"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Button, Eyebrow, Panel, Select, Skeleton } from "./ui";

type Pack = { version: string; effective_from: string; clauses: any[] };

/**
 * Policy is versioned, never edited in place.
 *
 * Publishing writes a new pack with today's date, and a dispute is judged
 * against whichever pack was in force when the order was placed. That is why
 * older versions stay visible here rather than being replaced: they are still
 * deciding cases.
 */
export function PolicyPanel({ storeId }: { storeId: string }) {
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [showing, setShowing] = useState(0);

  useEffect(() => {
    api.policy(storeId)
      .then((p) => { setPacks(p); setShowing(Math.max(0, p.length - 1)); })
      .catch(() => setPacks([]));
  }, [storeId]);

  if (!packs) return <Skeleton className="w-1/2" />;

  const pack = packs[showing];
  const isCurrent = showing === packs.length - 1;

  return (
    <>
      <header className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter">Policy</h1>
          <p className="text-ink-2 mt-1">
            The clauses your agents quote. Every decision names one of these.
          </p>
        </div>
        {packs.length > 1 && (
          <Select value={String(showing)} onChange={(v) => setShowing(parseInt(v, 10))}
                  className="w-[190px]"
                  options={packs.map((pack, i) => ({
                    value: String(i),
                    label: pack.version,
                    hint: i === packs.length - 1 ? "in force" : "older orders",
                  }))} />
        )}
      </header>

      <Panel
        title={
          <span className="flex items-center gap-2">
            {pack?.version}
            {isCurrent ? <Badge tone="accent">In force</Badge>
                       : <Badge>Still deciding older orders</Badge>}
          </span>
        }
        action={
          <span className="text-xs text-ink-3">
            since {pack ? new Date(pack.effective_from).toLocaleDateString() : ""}
          </span>
        }
      >
        <div className="divide-y divide-line-subtle">
          {(pack?.clauses ?? []).map((c: any) => (
            <div key={c.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-ink-3">{c.id}</span>
                <span className="font-semibold">{c.title}</span>
                <Badge>{c.window_days} day window</Badge>
                {!!c.exclusions?.length && (
                  <Badge tone="attention">excludes {c.exclusions.join(", ").replace(/_/g, " ")}</Badge>
                )}
              </div>
              <p className="text-base text-ink-2 mt-1.5">{c.text}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={() => (window.location.href = "/onboarding")}>
          Change these answers
        </Button>
        <span className="text-sm text-ink-3">
          Publishing writes a new version. Orders placed before it keep the old one.
        </span>
      </div>
    </>
  );
}
