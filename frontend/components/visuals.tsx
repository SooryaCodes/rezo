"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Small working diagrams.
 *
 * Each one animates into its finished state the first time it is seen and shows
 * a mechanism rather than decorating a card. They idle in the finished state
 * when motion is reduced, so nothing is only legible while it moves.
 */

function useInView<T extends HTMLElement>(threshold = 0.35) {
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

/* ── how much autonomy each evidence tier unlocks ────────────────────────── */

const TIERS = [
  { label: "Verified live", pct: 100, note: "full limit" },
  { label: "Camera only", pct: 50, note: "half" },
  { label: "Uploaded file", pct: 25, note: "quarter, reviewed" },
];

export function EvidenceTierVisual() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="flex flex-col gap-2.5">
      {TIERS.map((t, i) => (
        <div key={t.label} className="flex items-center gap-3">
          <span className="text-sm text-ink-2 w-[104px] shrink-0">{t.label}</span>
          <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
            <span className="block h-full rounded-full bg-action transition-[width] duration-[900ms] ease-out"
                  style={{ width: seen ? `${t.pct}%` : "0%", transitionDelay: `${i * 150}ms` }} />
          </div>
          <span className="text-xs text-ink-3 w-[110px] text-right shrink-0 tabular">{t.note}</span>
        </div>
      ))}
    </div>
  );
}

/* ── the cited clause, verified before it can be used ────────────────────── */

export function ClauseVisual() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref}
         className="rounded-xl border border-line-subtle bg-surface-2 px-3.5 py-3 font-mono text-xs text-ink-2">
      <div className="flex justify-between"><span>clause</span><span className="text-ink">CL-4.2</span></div>
      <div className="flex justify-between mt-1"><span>window</span><span className="text-ink">7 days</span></div>
      <div className="flex justify-between mt-1 pt-2 border-t border-line-subtle">
        <span>exists in your policy</span>
        <span className={`transition-all duration-500 ease-out ${
          seen ? "opacity-100 translate-x-0 text-accent" : "opacity-0 -translate-x-1"}`}
          style={{ transitionDelay: "500ms" }}>
          verified
        </span>
      </div>
    </div>
  );
}

/* ── a risk score accumulating from named signals ────────────────────────── */

const SIGNALS: [string, number][] = [
  ["4 claims in 60 days", 35],
  ["across 3 different stores", 20],
  ["account is 14 days old", 20],
  ["photo carries generator metadata", 25],
];

export function FraudVisual() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!seen) return;
    const timers = SIGNALS.map((_, i) => setTimeout(() => setShown(i + 1), 250 + i * 300));
    return () => timers.forEach(clearTimeout);
  }, [seen]);

  const total = SIGNALS.slice(0, shown).reduce((sum, [, w]) => sum + w, 0);

  return (
    <div ref={ref} className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold tracking-tighter tabular">
          {(total / 100).toFixed(2)}
        </span>
        <span className="text-xs text-ink-3">risk</span>
        {shown === SIGNALS.length && (
          <span className="ml-auto text-xs text-bad animate-pop">held for review</span>
        )}
      </div>
      <div className="h-2 rounded-full bg-surface-3 overflow-hidden flex gap-px">
        {SIGNALS.map(([label, w], i) => (
          <span key={label} className="block h-full bg-bad transition-all duration-500 ease-out"
                style={{ width: i < shown ? `${w}%` : "0%" }} />
        ))}
      </div>
      <div className="text-xs text-ink-3 min-h-[16px]">
        {shown > 0 ? SIGNALS[shown - 1][0] : " "}
      </div>
    </div>
  );
}

/* ── a shipment that stopped moving ──────────────────────────────────────── */

const TRAIL = [
  { label: "dispatched", state: "done" },
  { label: "reached hub", state: "done" },
  { label: "undelivered", state: "stuck" },
  { label: "21 days of nothing", state: "dead" },
];

export function WatchdogVisual() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="flex items-center gap-1.5">
      {TRAIL.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1.5 flex-1 last:flex-none">
          <span title={s.label}
                className={`w-2 h-2 rounded-full shrink-0 transition-all duration-500 ease-out ${
                  s.state === "done" ? "bg-ink-3"
                    : s.state === "stuck" ? "bg-bad" : "bg-surface-4"} ${
                  seen ? "scale-100 opacity-100" : "scale-0 opacity-0"}`}
                style={{ transitionDelay: `${i * 170}ms` }} />
          {i < TRAIL.length - 1 && (
            <span className={`h-px flex-1 transition-opacity duration-500 ease-out ${
              i === TRAIL.length - 2
                ? "border-t border-dashed border-line-strong"
                : "bg-line-strong"}`}
              style={{ opacity: seen ? 1 : 0, transitionDelay: `${i * 170 + 90}ms` }} />
          )}
        </div>
      ))}
      <span className={`text-xs text-bad ml-1 shrink-0 transition-opacity duration-500 ${
        seen ? "opacity-100" : "opacity-0"}`} style={{ transitionDelay: "760ms" }}>
        opened itself
      </span>
    </div>
  );
}

/* ── the refund and its audit entry, written together ────────────────────── */

const LEDGER = [
  ["refund", "₹749 · gateway"],
  ["clause", "CL-4.2"],
  ["approved by", "auto"],
  ["written", "same transaction"],
];

export function LedgerVisual() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="rounded-xl border border-line-subtle divide-y divide-line-subtle overflow-hidden">
      {LEDGER.map(([k, v], i) => (
        <div key={k}
             className="flex justify-between px-3 py-1.5 text-xs transition-all duration-500 ease-out"
             style={{
               opacity: seen ? 1 : 0,
               transform: seen ? "none" : "translateY(4px)",
               transitionDelay: `${i * 120}ms`,
             }}>
          <span className="text-ink-3">{k}</span>
          <span className="font-mono text-ink">{v}</span>
        </div>
      ))}
    </div>
  );
}
