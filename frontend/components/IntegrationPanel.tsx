"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Store } from "@/lib/api";
import { rupees, timeAgo } from "@/lib/format";
import { Badge, Button, Card, Eyebrow, Panel, Skeleton, useToast } from "./ui";

type Check = { capability: string; required: boolean; state: string; detail: string };
type Status = {
  connector: string; ready: boolean; checks: Check[];
  publishable_key: string; secret_key: string; widget_snippet: string;
  checked_at: string; base_url?: string | null;
};

const STATE_TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = {
  ok: "ok", not_enabled: "neutral", not_implemented: "warn",
  unreachable: "bad", auth_failed: "bad", error: "bad",
};

export function IntegrationPanel({ store }: { store: Store }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [cap, setCap] = useState(store.auto_approve_cap);
  const [saving, setSaving] = useState(false);
  const [revealSecret, setRevealSecret] = useState(false);
  const toast = useToast();

  const check = useCallback(() => {
    setStatus(null);
    api.integration(store.id).then(setStatus).catch(() => setStatus(null));
  }, [store.id]);

  useEffect(() => { check(); }, [check]);

  const saveCap = async () => {
    setSaving(true);
    try {
      await api.updateStore(store.id, { auto_approve_cap: cap });
      toast("Limit saved. It applies to the next dispute immediately.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save the limit", "err");
    } finally {
      setSaving(false);
    }
  };

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text);
    toast(`${what} copied.`);
  };

  return (
    <>
      <header className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter">Integration</h1>
          <p className="text-ink-2 mt-1">
            Your keys, the snippet, and a live check of what your backend actually answers.
          </p>
        </div>
        <Button size="sm" onClick={check}>Re-check</Button>
      </header>

      {/* ── autonomy ─────────────────────────────────────────────────────── */}
      <Panel title="Autonomy" className="mb-5">
        <div className="p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-ink-2">Resolve on its own up to</span>
            <span className="text-xl font-bold tabular">{rupees(cap)}</span>
          </div>
          <input type="range" min={0} max={5000} step={100} value={cap}
                 onChange={(e) => setCap(parseInt(e.target.value, 10))}
                 className="w-full my-3 accent-[var(--accent)]" />
          <p className="text-sm text-ink-3">
            Enforced in code before a refund is called, not by asking the model to behave.
            Evidence quality scales it down further: an unverifiable upload unlocks a quarter
            of it, so weak proof can never do what a live capture can.
          </p>
          <Button size="sm" variant="primary" className="mt-3" onClick={saveCap} disabled={saving}>
            {saving ? "Saving…" : "Save limit"}
          </Button>
        </div>
      </Panel>

      {/* ── contract health ──────────────────────────────────────────────── */}
      <Panel
        title="Capability contract"
        action={status && <span className="text-xs text-ink-3">
          checked {timeAgo(status.checked_at)}
        </span>}
        className="mb-5"
      >
        {!status ? <div className="p-5"><Skeleton className="w-1/2" /></div> : (
          <>
            <div className="px-5 py-3 border-b border-line-subtle flex items-center gap-2">
              <Badge tone={status.ready ? "ok" : "warn"} dot>
                {status.ready ? "Ready" : "Incomplete"}
              </Badge>
              <span className="text-sm text-ink-3">
                {status.connector === "local"
                  ? "Served natively by the platform"
                  : `Calling your backend at ${status.base_url}`}
              </span>
            </div>
            <div className="p-4 flex flex-col gap-1">
              {status.checks.map((c) => (
                <div key={c.capability} className="flex items-center gap-2 py-1">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    c.state === "ok" ? "bg-ok" : c.required ? "bg-bad" : "bg-ink-4"}`} />
                  <span className="font-mono text-sm">{c.capability}</span>
                  {c.required && <Badge>required</Badge>}
                  <span className="flex-1" />
                  <span className="text-sm text-ink-3 text-right">{c.detail}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      {/* ── keys ─────────────────────────────────────────────────────────── */}
      <Panel title="Keys" className="mb-5">
        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-2">
              Publishable key — safe to put in your page
            </span>
            <div className="flex gap-2">
              <code className="flex-1 font-mono text-sm bg-surface-2 border border-line rounded px-2.5 py-2 truncate">
                {status?.publishable_key ?? store.publishable_key}
              </code>
              <Button size="sm" onClick={() =>
                copy(status?.publishable_key ?? store.publishable_key ?? "", "Publishable key")}>
                Copy
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-2">
              Secret key — server to server only, never in the browser
            </span>
            <div className="flex gap-2">
              <code className="flex-1 font-mono text-sm bg-surface-2 border border-line rounded px-2.5 py-2 truncate">
                {revealSecret ? status?.secret_key ?? "" : "•".repeat(32)}
              </code>
              <Button size="sm" onClick={() => setRevealSecret((v) => !v)}>
                {revealSecret ? "Hide" : "Reveal"}
              </Button>
              <Button size="sm" onClick={() => copy(status?.secret_key ?? "", "Secret key")}>
                Copy
              </Button>
            </div>
          </div>
        </div>
      </Panel>

      {/* ── snippet ──────────────────────────────────────────────────────── */}
      <Panel
        title="Add the widget"
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => window.open("/docs", "_blank")}>Full guide</Button>
            <Button size="sm" onClick={() => window.open("/docs#llms", "_blank")}>
              For your AI assistant
            </Button>
          </div>
        }
      >
        <div className="p-5">
          <pre className="font-mono text-sm bg-surface-2 border border-line rounded-md p-3.5 overflow-x-auto text-ink-2 whitespace-pre-wrap">
            {status?.widget_snippet ?? ""}
          </pre>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => copy(status?.widget_snippet ?? "", "Snippet")}>
              Copy snippet
            </Button>
          </div>
          <p className="text-sm text-ink-3 mt-3">
            Drop this on your order page. The widget loads in an isolated frame, so your styling
            cannot break it and the camera permission is its own.
          </p>
        </div>
      </Panel>
    </>
  );
}
