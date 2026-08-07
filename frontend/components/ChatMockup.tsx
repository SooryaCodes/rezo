"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

/**
 * The widget, playing itself over a merchant's order page.
 *
 * It loops, so someone landing mid-way still sees the whole arc within a few
 * seconds. Deliberately a mockup rather than a live call: on a marketing page
 * the job is to show the shape of the experience, and a real request would add
 * latency and failure modes to the one moment that has to feel effortless.
 *
 * The consent step is not decoration. The product asks before it opens a
 * camera, and the page has to show that, because "we turned your camera on"
 * is the single thing most likely to make a buyer close the tab.
 */

const PHOTO =
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&q=70&auto=format&fit=crop";

type Beat =
  | { kind: "agent"; text: string }
  | { kind: "user"; text: string }
  | { kind: "typing" }
  | { kind: "consent" }
  | { kind: "camera" }
  | { kind: "steps" }
  | { kind: "receipt" };

const SCRIPT: { beat: Beat; after: number }[] = [
  { beat: { kind: "agent", text: "Hi Arjun. I can see your Cotton Kurti Set, delivered this morning. What went wrong?" }, after: 600 },
  { beat: { kind: "typing" }, after: 1000 },
  { beat: { kind: "user", text: "the sleeve is torn where the seam meets the cuff" }, after: 900 },
  { beat: { kind: "agent", text: "Sorry about that. To sort it out now I need to see the tear — may I open your camera for about twenty seconds?" }, after: 1100 },
  { beat: { kind: "consent" }, after: 1600 },
  { beat: { kind: "camera" }, after: 2300 },
  { beat: { kind: "steps" }, after: 2500 },
  { beat: { kind: "receipt" }, after: 3200 },
];

const STEPS = [
  { label: "Photo checked against your order", meta: "matches" },
  { label: "Return policy applied", meta: "clause 4.2" },
  { label: "Account reviewed", meta: "6 orders, no claims" },
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
        setOpen(true);
        setVisible(SCRIPT.map((s) => s.beat).filter((b) => b.kind !== "typing"));
        setStepsShown(STEPS.length);
        return;
      }

      let t = 500;
      timers.current.push(setTimeout(() => setOpen(true), t));
      t += 450;

      SCRIPT.forEach(({ beat, after }) => {
        t += after;
        timers.current.push(setTimeout(() => {
          setVisible((current) => {
            const trimmed = current.filter((b) => b.kind !== "typing");
            return beat.kind === "user" ? [...trimmed, beat] : [...current, beat];
          });
          if (beat.kind === "steps") {
            STEPS.forEach((_, i) =>
              timers.current.push(setTimeout(() => setStepsShown(i + 1), 450 + i * 560)));
          }
        }, t));
      });

      t += 5400;
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
      <div className="rounded-3xl border border-line-subtle bg-surface-1 overflow-hidden
                      shadow-[0_1px_2px_rgba(0,0,0,.04),0_24px_64px_rgba(0,0,0,.08)]">
        <div className="h-10 border-b border-line-subtle flex items-center gap-1.5 px-4">
          <span className="w-2 h-2 rounded-full bg-surface-3" />
          <span className="w-2 h-2 rounded-full bg-surface-3" />
          <span className="w-2 h-2 rounded-full bg-surface-3" />
          <span className="ml-2 text-2xs text-ink-4 font-mono">rehanascloset.in/orders</span>
        </div>

        <div className="relative h-[452px] p-5">
          {/* the merchant's own page, quiet behind the widget */}
          <div className="flex gap-3 opacity-40 select-none" aria-hidden>
            <img src={PHOTO} alt="" className="w-14 h-14 rounded-xl object-cover" />
            <div className="flex-1 pt-1">
              <div className="h-2.5 w-32 rounded bg-surface-3" />
              <div className="h-2 w-20 rounded bg-surface-2 mt-2" />
            </div>
          </div>
          <div className="flex gap-3 opacity-20 mt-5 select-none" aria-hidden>
            <div className="w-14 h-14 rounded-xl bg-surface-3" />
            <div className="flex-1 pt-1">
              <div className="h-2.5 w-28 rounded bg-surface-3" />
              <div className="h-2 w-24 rounded bg-surface-2 mt-2" />
            </div>
          </div>

          <div className={clsx(
            "absolute right-4 bottom-4 flex items-center gap-2 h-10 px-4 rounded-full",
            "bg-action text-action-ink text-[13px] font-medium",
            "shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_6px_18px_rgba(0,0,0,.16)]",
            "transition-all duration-slow ease-out",
            open ? "opacity-0 translate-y-2 scale-95" : "opacity-100")}>
            Report an issue
          </div>

          <div className={clsx(
            "absolute right-4 bottom-4 w-[min(348px,calc(100%-2rem))] rounded-3xl",
            "bg-surface-1 border border-line overflow-hidden flex flex-col",
            "shadow-[0_2px_10px_rgba(0,0,0,.06),0_24px_64px_rgba(0,0,0,.14)]",
            "transition-all duration-slow ease-out origin-bottom-right",
            open ? "opacity-100 translate-y-0 scale-100 max-h-[406px]"
                 : "opacity-0 translate-y-4 scale-95 max-h-0 pointer-events-none")}>
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line-subtle">
              <img src={PHOTO} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">Cotton Kurti Set</div>
                <div className="text-2xs text-ink-3 truncate">ORD-2041 · ₹749</div>
              </div>
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent animate-breathe" />
            </div>

            <div ref={body} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
              {visible.map((beat, i) => {
                if (beat.kind === "agent") return (
                  <div key={i} className="animate-pop self-start max-w-[90%] px-3.5 py-2.5 rounded-2xl
                                          rounded-bl-md bg-surface-2 text-sm leading-relaxed">
                    {beat.text}
                  </div>
                );
                if (beat.kind === "user") return (
                  <div key={i} className="animate-pop self-end max-w-[90%] px-3.5 py-2.5 rounded-2xl
                                          rounded-br-md bg-action text-action-ink text-sm">
                    {beat.text}
                  </div>
                );
                if (beat.kind === "typing") return (
                  <div key={i} className="animate-pop self-end px-4 py-3 rounded-2xl rounded-br-md
                                          bg-surface-2 flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="w-1.5 h-1.5 rounded-full bg-ink-4 animate-breathe"
                            style={{ animationDelay: `${d * 180}ms` }} />
                    ))}
                  </div>
                );
                if (beat.kind === "consent") return <Consent key={i} />;
                if (beat.kind === "camera") return <CameraFrame key={i} />;
                if (beat.kind === "steps") return (
                  <div key={i} className="animate-pop rounded-2xl border border-line-subtle
                                          divide-y divide-line-subtle overflow-hidden">
                    {STEPS.map((s, si) => (
                      <div key={s.label} className={clsx(
                        "flex items-center gap-2 px-3 py-2 text-sm transition-opacity duration-500",
                        si < stepsShown ? "opacity-100" : "opacity-40")}>
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
                return <Receipt key={i} />;
              })}
            </div>

            <div className="px-4 py-3 border-t border-line-subtle flex gap-2 items-center">
              <div className="flex-1 h-9 rounded-full bg-surface-2 px-3.5 flex items-center text-2xs text-ink-4">
                Message…
              </div>
              <div className="w-9 h-9 rounded-full bg-action grid place-items-center shrink-0">
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

/** Consent is asked for, and what happens to the footage is said out loud. */
function Consent() {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setGranted(true), 1150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="animate-pop rounded-2xl border border-line bg-surface-1 overflow-hidden">
      <div className="px-3.5 py-3">
        <div className="text-sm font-medium">Camera access</div>
        <ul className="mt-2 flex flex-col gap-1.5 text-2xs text-ink-2 list-none p-0">
          {["Used once, for this claim only",
            "Nothing records until you press capture",
            "Deleted when the case closes"].map((line) => (
            <li key={line} className="flex gap-2">
              <span className="text-ink-4">·</span>{line}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-2 px-3.5 pb-3.5">
        <div className={clsx(
          "flex-1 h-8 rounded-full grid place-items-center text-2xs font-medium transition-colors duration-500",
          granted ? "bg-surface-3 text-ink-3" : "bg-action text-action-ink")}>
          {granted ? "Allowed" : "Allow camera"}
        </div>
        <div className="flex-1 h-8 rounded-full border border-line grid place-items-center text-2xs text-ink-3">
          Send a photo instead
        </div>
      </div>
    </div>
  );
}

/** The instruction is issued in the moment, which is what a saved photo cannot answer. */
function CameraFrame() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setStep(1), 1050);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="animate-pop rounded-2xl border border-line overflow-hidden bg-surface-2">
      <div className="relative h-28">
        <img src={PHOTO} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute inset-3 rounded-xl border-2 border-dashed border-white/70" />
        <span className="absolute top-2 left-2.5 flex items-center gap-1.5 text-2xs text-white/90">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-breathe" /> live
        </span>
      </div>
      <div className="px-3.5 py-2.5 bg-surface-1">
        <div className="text-2xs font-bold uppercase tracking-wide text-ink-3">
          Step {step + 1} of 2
        </div>
        <div className="text-sm font-medium mt-0.5">
          {step === 0
            ? "Point at the torn seam"
            : "Now turn it so the price tag is in the same shot"}
        </div>
      </div>
    </div>
  );
}

/** Not a badge saying "approved" — the receipt a payment actually produces. */
function Receipt() {
  return (
    <div className="animate-pop rounded-2xl border border-line bg-surface-1 overflow-hidden">
      <div className="px-3.5 pt-3.5 pb-3">
        <div className="text-2xs text-ink-3">Refund issued</div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-2xl font-bold tracking-tighter tabular">₹749</span>
          <span className="text-2xs text-ink-3">INR</span>
        </div>
      </div>

      <div className="border-t border-line-subtle divide-y divide-line-subtle">
        {[["To", "HDFC ···· 4412"],
          ["Arrives", "3–5 working days"],
          ["Reference", "rfnd_8a21c9f0"],
          ["Reason", "Damaged on arrival · 4.2"]].map(([k, v]) => (
          <div key={k} className="flex justify-between px-3.5 py-2 text-2xs">
            <span className="text-ink-3">{k}</span>
            <span className={k === "Reference" ? "font-mono text-ink" : "text-ink"}>{v}</span>
          </div>
        ))}
      </div>

      <div className="px-3.5 py-2.5 bg-surface-2 text-2xs text-ink-3">
        Keep the item — under ₹1,500 we don&rsquo;t ask for it back.
      </div>
    </div>
  );
}
