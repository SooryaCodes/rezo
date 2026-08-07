"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

/**
 * What happens between "my sleeve is torn" and "₹749 is on its way".
 *
 * The buyer never sees this. The merchant sees it as a decision record. It is
 * on the marketing page because the whole argument for trusting an agent with
 * money is that its work can be inspected, and that argument is easier to make
 * with a diagram than a paragraph.
 *
 * The sequence plays on scroll and mirrors the real graph: Evidence and Policy
 * side by side because they run together, Fraud below because it reads the
 * evidence, and a guardrail between the recommendation and the money.
 */

type Step = {
  id: string;
  title: string;
  detail: string;
  column?: "left" | "right";
};

const STEPS: Step[] = [
  { id: "interaction", title: "Interaction", detail: "damage claim · order loaded" },
  { id: "evidence", title: "Evidence", detail: "live capture · verified", column: "left" },
  { id: "policy", title: "Policy", detail: "clause 4.2 · in window", column: "right" },
  { id: "fraud", title: "Fraud", detail: "6 orders · no prior claims" },
  { id: "resolution", title: "Resolution", detail: "full refund ₹749" },
  { id: "guardrail", title: "Guardrail", detail: "under the ₹800 limit" },
  { id: "execution", title: "Execution", detail: "refund sent · logged" },
];

export function AgentFlow({ className }: { className?: string }) {
  const [active, setActive] = useState(-1);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setActive(STEPS.length); return; }

    const el = host.current;
    if (!el) return;
    let timers: ReturnType<typeof setTimeout>[] = [];

    const play = () => {
      timers.forEach(clearTimeout);
      timers = [];
      setActive(-1);
      STEPS.forEach((_, i) => {
        timers.push(setTimeout(() => setActive(i), 300 + i * 520));
      });
      timers.push(setTimeout(play, 300 + STEPS.length * 520 + 3600));
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) play();
        else { timers.forEach(clearTimeout); timers = []; }
      });
    }, { threshold: 0.25 });

    observer.observe(el);
    return () => { observer.disconnect(); timers.forEach(clearTimeout); };
  }, []);

  const node = (step: Step, index: number) => {
    const state = index < active ? "done" : index === active ? "live" : "idle";
    return (
      <div className={clsx(
        "rounded-xl border px-3.5 py-2.5 bg-surface-1 min-w-0",
        "transition-all duration-slow ease-out",
        state === "live" && "border-accent-line shadow-[0_0_0_4px_var(--accent-soft)] -translate-y-[1px]",
        state === "done" && "border-line",
        state === "idle" && "border-line-subtle opacity-45")}>
        <div className="flex items-center gap-2">
          <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-base",
            state === "live" ? "bg-accent animate-breathe"
              : state === "done" ? "bg-accent" : "bg-ink-4")} />
          <span className="text-sm font-medium truncate">{step.title}</span>
        </div>
        <div className={clsx("text-2xs mt-0.5 truncate transition-opacity duration-base",
          state === "idle" ? "text-ink-4" : "text-ink-3")}>
          {step.detail}
        </div>
      </div>
    );
  };

  const connector = (lit: boolean) => (
    <div className="flex justify-center py-1.5" aria-hidden>
      <svg width="2" height="18" viewBox="0 0 2 18">
        <line x1="1" y1="0" x2="1" y2="18"
              stroke={lit ? "var(--accent)" : "var(--border-strong)"}
              strokeWidth="1.5" strokeDasharray="4 4"
              className={lit ? "[animation:dash_.7s_linear_infinite]" : undefined} />
      </svg>
    </div>
  );

  return (
    <div ref={host} className={clsx("relative", className)}>
      {node(STEPS[0], 0)}
      {connector(active >= 1)}

      <div className="grid grid-cols-2 gap-2.5">
        {node(STEPS[1], 1)}
        {node(STEPS[2], 2)}
      </div>
      <div className="text-center text-2xs text-ink-4 pt-1.5">at the same time</div>
      {connector(active >= 3)}

      {node(STEPS[3], 3)}
      {connector(active >= 4)}
      {node(STEPS[4], 4)}
      {connector(active >= 5)}

      {/* the guardrail reads differently: it is code, not an agent */}
      <div className={clsx(
        "rounded-xl border-2 border-dashed px-3.5 py-2.5 transition-all duration-slow ease-out",
        active === 5 ? "border-accent-line bg-accent-soft"
          : active > 5 ? "border-line bg-surface-2" : "border-line-subtle opacity-45")}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Guardrail</span>
          <span className="text-2xs text-ink-3 ml-auto">not a model</span>
        </div>
        <div className="text-2xs text-ink-3 mt-0.5">{STEPS[5].detail}</div>
      </div>

      {connector(active >= 6)}
      {node(STEPS[6], 6)}
    </div>
  );
}
