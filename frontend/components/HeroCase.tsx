"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "./ui";

const FINDINGS = [
  { label: "Evidence verified", meta: "live capture · 0.97" },
  { label: "Policy checked", meta: "clause 4.2" },
  { label: "Account reviewed", meta: "risk 0.05" },
];

/**
 * A case resolving, shown rather than described.
 *
 * Everything is visible by default and the animation only adds motion, so a
 * scripting failure leaves a readable card instead of an empty one.
 */
export function HeroCase() {
  const [revealed, setRevealed] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setRevealed(FINDINGS.length); setElapsed(1.6); return; }

    const run = () => {
      if (started.current) return;
      started.current = true;
      const t0 = performance.now();
      const ticker = setInterval(() => setElapsed((performance.now() - t0) / 1000), 90);
      FINDINGS.forEach((_, i) => setTimeout(() => setRevealed(i), 420 + i * 380));
      setTimeout(() => {
        setRevealed(FINDINGS.length);
        clearInterval(ticker);
        setElapsed(1.6);
      }, 420 + FINDINGS.length * 380);
    };

    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && run()),
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="bg-surface-1 border border-line rounded-lg shadow-2 overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-line-subtle">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        <span className="text-sm font-semibold">Live case</span>
        <span className="ml-auto text-xs text-ink-3 tabular">{elapsed.toFixed(1)}s</span>
      </div>

      <div className="p-3.5 flex flex-col gap-2.5 min-h-[300px]">
        <div className="self-end max-w-[90%] px-3 py-2 rounded-md bg-action text-action-ink text-sm">
          the sleeve is torn, I want a refund
        </div>
        <div className="self-start max-w-[90%] px-3 py-2 rounded-md bg-surface-2 text-sm">
          Sorry about that. Let me look — I&rsquo;ll open your camera for a few seconds.
        </div>

        {FINDINGS.map((f, i) => (
          <div
            key={f.label}
            className="flex items-center gap-2 text-sm text-ink-2 transition-all duration-300 ease-out"
            style={{
              opacity: revealed >= i ? 1 : 0,
              transform: revealed >= i ? "none" : "translateY(4px)",
            }}
          >
            <span className="w-4 text-ok">✓</span>
            {f.label}
            <span className="ml-auto text-xs text-ink-3">{f.meta}</span>
          </div>
        ))}

        <div
          className="border border-accent-line bg-accent-soft rounded-md px-3.5 py-3 transition-all duration-300 ease-out"
          style={{
            opacity: revealed >= FINDINGS.length ? 1 : 0,
            transform: revealed >= FINDINGS.length ? "none" : "translateY(4px)",
          }}
        >
          <div className="text-xs text-ink-3">Refund approved</div>
          <div className="text-xl font-bold tracking-tighter tabular">₹749</div>
          <div className="text-xs text-ink-3 mt-0.5">
            Damaged on arrival, reported within the 7 day window. Sent to the original
            payment method.
          </div>
        </div>
      </div>
    </div>
  );
}

export function ExploreButton({ className, children = "Explore a live store" }: {
  className?: string; children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  const explore = async () => {
    setBusy(true);
    try {
      const { api, tokenStore } = await import("@/lib/api");
      const data = await api.sample("st_rehana");
      tokenStore.set(data.token);
      window.location.href = "/dashboard";
    } catch {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={explore}
      disabled={busy}
      className={className ??
        "inline-flex items-center justify-center h-[38px] px-[18px] rounded border border-line " +
        "bg-surface-1 text-base font-medium hover:border-line-strong hover:bg-surface-2 " +
        "transition-colors duration-fast active:scale-[0.975]"}
    >
      {busy ? "Opening…" : children}
    </button>
  );
}

export { Badge };
