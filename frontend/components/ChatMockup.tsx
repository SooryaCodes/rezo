"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

/**
 * The widget, playing itself.
 *
 * This is what a buyer actually sees: a launcher on a store page, a panel that
 * slides up, a short conversation, a camera step, and an answer with the reason
 * attached. It loops, so someone who lands mid-way still sees the whole thing
 * within a few seconds.
 *
 * Deliberately a mockup rather than a live call. On a marketing page the job is
 * to show the shape of the experience; a real request would add latency,
 * failure modes and a spinner to the one moment that has to feel effortless.
 */

type Beat =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "typing" }
  | { kind: "camera" }
  | { kind: "steps" }
  | { kind: "decision" };

const SCRIPT: { beat: Beat; after: number }[] = [
  { beat: { kind: "agent", text: "Hi Arjun. I can see your Cotton Kurti Set, delivered this morning. What went wrong?" }, after: 700 },
  { beat: { kind: "typing" }, after: 1100 },
  { beat: { kind: "user", text: "the sleeve is torn, I want a refund" }, after: 900 },
  { beat: { kind: "agent", text: "Sorry about that. Let me see it — I'll open your camera for a few seconds." }, after: 1100 },
  { beat: { kind: "camera" }, after: 2400 },
  { beat: { kind: "steps" }, after: 2600 },
  { beat: { kind: "decision" }, after: 3400 },
];

const STEPS = [
  { label: "Evidence verified", meta: "live capture" },
  { label: "Policy checked", meta: "clause 4.2" },
  { label: "Account reviewed", meta: "no flags" },
];

export function ChatMockup({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState<Beat[]>([]);
  const [stepsShown, setStepsShown] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };

    const play = () => {
      clear();
      setVisible([]);
      setStepsShown(0);
      setOpen(false);

      if (reduced) {
        // No motion: show the finished conversation rather than an empty frame.
        setOpen(true);
        setVisible(SCRIPT.map((s) => s.beat).filter((b) => b.kind !== "typing"));
        setStepsShown(STEPS.length);
        return;
      }

      let t = 600;
      timers.current.push(setTimeout(() => setOpen(true), t));
      t += 500;

      SCRIPT.forEach(({ beat, after }) => {
        t += after;
        timers.current.push(setTimeout(() => {
          setVisible((current) => {
            // a typing bubble is replaced by what was being typed
            const trimmed = current.filter((b) => b.kind !== "typing");
            return beat.kind === "user" ? [...trimmed, beat] : [...current, beat];
          });
          if (beat.kind === "steps") {
            STEPS.forEach((_, i) =>
              timers.current.push(setTimeout(() => setStepsShown(i + 1), 500 + i * 620)));
          }
        }, t));
      });

      // hold on the answer, then run it again
      t += 5200;
      timers.current.push(setTimeout(play, t));
    };

    const el = host.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? play() : clear()));
    }, { threshold: 0.3 });
    observer.observe(el);

    return () => { observer.disconnect(); clear(); };
  }, []);

  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight, behavior: "smooth" });
  }, [visible, stepsShown]);

  return (
    <div ref={host} className={clsx("relative", className)}>
      {/* the merchant's page, blurred back so the widget is what you read */}
      <div className="rounded-2xl border border-line-subtle bg-surface-1 overflow-hidden
                      shadow-[0_2px_8px_rgba(17,17,20,.05),0_24px_60px_rgba(17,17,20,.09)]">
        <div className="h-9 border-b border-line-subtle flex items-center gap-1.5 px-3.5">
          <span className="w-2 h-2 rounded-full bg-surface-4" />
          <span className="w-2 h-2 rounded-full bg-surface-4" />
          <span className="w-2 h-2 rounded-full bg-surface-4" />
          <span className="ml-2 text-2xs text-ink-4 font-mono">rehanascloset.in/orders</span>
        </div>

        <div className="relative h-[440px] p-5">
          {/* a faint order card: context, not content */}
          <div className="flex gap-3 opacity-45 select-none" aria-hidden>
            <div className="w-14 h-14 rounded-xl bg-surface-3" />
            <div className="flex-1 pt-1">
              <div className="h-2.5 w-32 rounded bg-surface-3" />
              <div className="h-2 w-20 rounded bg-surface-2 mt-2" />
              <div className="h-2 w-24 rounded bg-surface-2 mt-1.5" />
            </div>
          </div>
          <div className="flex gap-3 opacity-25 mt-5 select-none" aria-hidden>
            <div className="w-14 h-14 rounded-xl bg-surface-3" />
            <div className="flex-1 pt-1">
              <div className="h-2.5 w-28 rounded bg-surface-3" />
              <div className="h-2 w-24 rounded bg-surface-2 mt-2" />
            </div>
          </div>

          {/* the launcher */}
          <div className={clsx(
            "absolute right-4 bottom-4 flex items-center gap-2 h-10 px-4 rounded-full",
            "bg-action text-action-ink text-[13px] font-medium",
            "shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_6px_18px_rgba(17,17,20,.18)]",
            "transition-all duration-slow ease-out",
            open ? "opacity-0 translate-y-2 scale-95" : "opacity-100")}>
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" aria-hidden>
              <path d="M14 8.5a5.5 5.5 0 0 1-7.9 4.96L2.5 14l1.02-3.4A5.5 5.5 0 1 1 14 8.5Z"
                    fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            Report an issue
          </div>

          {/* the widget */}
          <div className={clsx(
            "absolute right-4 bottom-4 w-[min(340px,calc(100%-2rem))] rounded-2xl",
            "bg-surface-1 border border-line overflow-hidden flex flex-col",
            "shadow-[0_4px_16px_rgba(17,17,20,.08),0_24px_60px_rgba(17,17,20,.16)]",
            "transition-all duration-slow ease-out origin-bottom-right",
            open ? "opacity-100 translate-y-0 scale-100 max-h-[400px]"
                 : "opacity-0 translate-y-4 scale-95 max-h-0 pointer-events-none")}>
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-line-subtle">
              <div className="w-7 h-7 rounded-lg bg-surface-3 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">Cotton Kurti Set</div>
                <div className="text-2xs text-ink-3 truncate">ORD-2041 · ₹749</div>
              </div>
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent animate-breathe" />
            </div>

            <div ref={body} className="flex-1 overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">
              {visible.map((beat, i) => {
                if (beat.kind === "agent") return (
                  <div key={i} className="animate-pop self-start max-w-[88%] px-3 py-2 rounded-2xl
                                          rounded-bl-md bg-surface-2 text-sm leading-relaxed">
                    {beat.text}
                  </div>
                );
                if (beat.kind === "user") return (
                  <div key={i} className="animate-pop self-end max-w-[88%] px-3 py-2 rounded-2xl
                                          rounded-br-md bg-action text-action-ink text-sm">
                    {beat.text}
                  </div>
                );
                if (beat.kind === "typing") return (
                  <div key={i} className="animate-pop self-end px-3.5 py-2.5 rounded-2xl rounded-br-md
                                          bg-surface-2 flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="w-1.5 h-1.5 rounded-full bg-ink-4 animate-breathe"
                            style={{ animationDelay: `${d * 180}ms` }} />
                    ))}
                  </div>
                );
                if (beat.kind === "camera") return <CameraFrame key={i} />;
                if (beat.kind === "steps") return (
                  <div key={i} className="animate-pop rounded-xl border border-line-subtle divide-y divide-line-subtle">
                    {STEPS.map((s, si) => (
                      <div key={s.label} className={clsx(
                        "flex items-center gap-2 px-3 py-2 text-sm transition-colors duration-base",
                        si < stepsShown ? "" : "opacity-45")}>
                        <span className={clsx("w-3.5 text-center",
                          si < stepsShown ? "text-accent" : "text-ink-4")}>
                          {si < stepsShown ? "✓" : "○"}
                        </span>
                        <span className="flex-1">{s.label}</span>
                        <span className="text-2xs text-ink-3">
                          {si < stepsShown ? s.meta : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                );
                return (
                  <div key={i} className="animate-pop rounded-xl border border-accent-line bg-accent-soft p-3">
                    <div className="text-2xs font-bold uppercase tracking-wide text-ink-3">
                      Refund approved
                    </div>
                    <div className="text-xl font-bold tracking-tighter tabular mt-0.5">₹749</div>
                    <p className="text-xs text-ink-2 mt-1 leading-relaxed">
                      Damaged on arrival, reported inside the 7 day window. Back on your card in
                      3&ndash;5 days.
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="px-3.5 py-2.5 border-t border-line-subtle flex gap-2 items-center">
              <div className="flex-1 h-8 rounded-full bg-surface-2 px-3 flex items-center text-2xs text-ink-4">
                Message…
              </div>
              <div className="w-8 h-8 rounded-full bg-action grid place-items-center shrink-0">
                <svg viewBox="0 0 12 12" className="w-3 h-3 text-action-ink" aria-hidden>
                  <path d="M1.5 6h8M6 2.5 9.5 6 6 9.5" fill="none" stroke="currentColor"
                        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The camera step, with the instruction that makes a prepared photo useless. */
function CameraFrame() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setStep(1), 1100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="animate-pop rounded-xl border border-line overflow-hidden bg-surface-2">
      <div className="relative h-24 grid place-items-center bg-[linear-gradient(135deg,#e9e9ee_25%,#f2f2f5_25%,#f2f2f5_50%,#e9e9ee_50%,#e9e9ee_75%,#f2f2f5_75%)] bg-[length:14px_14px]">
        <div className="absolute inset-3 rounded-lg border-2 border-dashed border-accent/50" />
        <span className="relative text-2xs text-ink-3">camera</span>
      </div>
      <div className="px-3 py-2.5">
        <div className="text-2xs font-bold uppercase tracking-wide text-ink-3">
          Step {step + 1} of 2
        </div>
        <div className="text-sm font-medium mt-0.5">
          {step === 0
            ? "Point at the torn sleeve"
            : "Now turn it so the price tag is in the same shot"}
        </div>
      </div>
    </div>
  );
}
