"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Small diagrams that animate the first time they are seen.
 *
 * Each one shows a mechanism rather than decorating a card: how much autonomy
 * each evidence tier unlocks, what a verified clause looks like, where the
 * guardrail sits, how a fraud score accumulates, what a stalled shipment looks
 * like. They idle in their finished state if motion is reduced.
 */

function useInView<T extends HTMLElement>(threshold = 0.4) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSeen(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { setSeen(true); observer.disconnect(); } });
    }, { threshold });
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, seen] as const;
}

/* ── how much each evidence tier unlocks ─────────────────────────────────── */

const TIERS = [
  { label: "Attested live capture", pct: 100, note: "full limit" },
  { label: "Camera, no challenge", pct: 50, note: "half" },
  { label: "Uploaded file", pct: 25, note: "quarter, reviewed" },
];

export function EvidenceTierVisual() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="flex flex-col gap-2">
      {TIERS.map((t, i) => (
        <div key={t.label} className="flex items-center gap-3">
          <span className="text-sm text-ink-2 w-[152px] shrink-0">{t.label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <span
              className="block h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
              style={{ width: seen ? `${t.pct}%` : "0%", transitionDelay: `${i * 130}ms` }}
            />
          </div>
          <span className="text-xs text-ink-3 w-[104px] text-right shrink-0">{t.note}</span>
        </div>
      ))}
    </div>
  );
}

/* ── a clause being verified before it can be used ───────────────────────── */

export function ClauseVisual() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="font-mono text-xs bg-surface-2 border border-line-subtle rounded px-3 py-2.5 text-ink-2">
      <div>clause: <span className="text-ink">CL-4.2</span></div>
      <div>window: <span className="text-ink">7 days</span></div>
      <div className="flex items-center gap-1.5">
        verified:
        <span className={`transition-all duration-500 ease-out ${
          seen ? "opacity-100 translate-x-0 text-ok" : "opacity-0 -translate-x-1"}`}
          style={{ transitionDelay: "420ms" }}>
          true ✓
        </span>
      </div>
    </div>
  );
}

/* ── the guardrail between the recommendation and the money ──────────────── */

export function GuardrailVisual() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="flex items-center gap-2 text-xs">
      <div className="flex-1 rounded border border-line-subtle bg-surface-2 px-2 py-1.5 text-center text-ink-2">
        agent asks
      </div>
      <span className="text-ink-4">→</span>
      <div className={`flex-1 rounded border px-2 py-1.5 text-center font-medium transition-all duration-500 ease-out ${
        seen ? "border-warn bg-warn-soft text-warn scale-100" : "border-line bg-surface-2 text-ink-3 scale-95"}`}
        style={{ transitionDelay: "260ms" }}>
        code decides
      </div>
      <span className="text-ink-4">→</span>
      <div className={`flex-1 rounded border px-2 py-1.5 text-center transition-all duration-500 ease-out ${
        seen ? "border-ok bg-ok-soft text-ok" : "border-line bg-surface-2 text-ink-3"}`}
        style={{ transitionDelay: "520ms" }}>
        money moves
      </div>
    </div>
  );
}

/* ── a fraud score accumulating from named signals ───────────────────────── */

const SIGNALS = [
  ["4 claims in 60 days", 35],
  ["across 3 stores", 20],
  ["account is 14 days old", 20],
  ["evidence carries generator metadata", 25],
];

export function FraudVisual() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!seen) return;
    const timers = SIGNALS.map((_, i) =>
      setTimeout(() => setShown(i + 1), 220 + i * 260));
    return () => timers.forEach(clearTimeout);
  }, [seen]);

  const total = SIGNALS.slice(0, shown).reduce((sum, [, w]) => sum + (w as number), 0);

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold tracking-tighter tabular">
          {(total / 100).toFixed(2)}
        </span>
        <span className="text-xs text-ink-3">risk score</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden flex">
        {SIGNALS.map(([label, w], i) => (
          <span key={label as string}
                className="block h-full bg-warn transition-all duration-500 ease-out border-r border-surface-1 last:border-0"
                style={{ width: i < shown ? `${w}%` : "0%" }} />
        ))}
      </div>
      <div className="text-xs text-ink-3 min-h-[16px]">
        {shown > 0 ? SIGNALS[Math.min(shown, SIGNALS.length) - 1][0] : " "}
      </div>
    </div>
  );
}

/* ── a shipment that stopped moving ──────────────────────────────────────── */

const TRAIL = [
  { label: "dispatched", tone: "ok" },
  { label: "reached hub", tone: "ok" },
  { label: "undelivered", tone: "warn" },
  { label: "21 days of nothing", tone: "dead" },
];

export function WatchdogVisual() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="flex items-center gap-1.5">
      {TRAIL.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1.5 flex-1 last:flex-none">
          <span
            className={`w-2 h-2 rounded-full shrink-0 transition-all duration-500 ease-out ${
              s.tone === "ok" ? "bg-ok" : s.tone === "warn" ? "bg-warn" : "bg-ink-4"} ${
              seen ? "scale-100 opacity-100" : "scale-0 opacity-0"}`}
            style={{ transitionDelay: `${i * 180}ms` }}
            title={s.label}
          />
          {i < TRAIL.length - 1 && (
            <span className={`h-px flex-1 transition-all duration-500 ease-out ${
              i === TRAIL.length - 2 ? "bg-ink-4 border-t border-dashed" : "bg-line-strong"}`}
              style={{ opacity: seen ? 1 : 0, transitionDelay: `${i * 180 + 90}ms` }} />
          )}
        </div>
      ))}
      <span className="text-xs text-warn ml-1 shrink-0">stalled</span>
    </div>
  );
}
