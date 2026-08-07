"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

/**
 * Reveal on scroll.
 *
 * The element is visible in the markup and only *becomes* hidden once we know
 * the observer is alive. If scripting fails or the observer never fires, the
 * page is readable rather than blank — the difference between a degraded page
 * and an invisible one.
 */
export function Reveal({
  children, delay = 0, y = 14, className, as: Tag = "div",
}: {
  children: React.ReactNode; delay?: number; y?: number;
  className?: string; as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    setArmed(true);
    const el = ref.current;
    if (!el) { setShown(true); return; }

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { setShown(true); observer.disconnect(); }
      }),
      // Any part entering is enough. Requiring a fraction of the element leaves
      // tall sections stuck half-faded when they are taller than the viewport.
      { threshold: 0, rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hidden = armed && !shown;

  return (
    <Tag
      ref={ref as never}
      className={clsx("transition-[opacity,transform] duration-700 [transition-timing-function:cubic-bezier(.22,1,.36,1)]", className)}
      style={{
        opacity: hidden ? 0 : 1,
        transform: hidden ? `translateY(${y}px)` : "none",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * A number that counts up the first time it is seen. Tabular figures, so the
 * digits do not jitter while it runs.
 */
export function CountUp({
  to, prefix = "", suffix = "", decimals = 0, duration = 900, className,
}: {
  to: number; prefix?: string; suffix?: string; decimals?: number;
  duration?: number; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(to);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting || done.current) return;
        done.current = true;
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          // decelerating, so it settles rather than stopping dead
          setValue(to * (1 - Math.pow(1 - t, 3)));
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });

    observer.observe(el);
    return () => observer.disconnect();
  }, [to, duration]);

  return (
    <span ref={ref} className={clsx("tabular", className)}>
      {prefix}
      {value.toLocaleString("en-IN", {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/**
 * Depth without decoration: the card lifts a little and its shadow follows the
 * pointer, so the highlight tracks where the light would be. Disabled for
 * touch, where there is no hover and the tilt would only fight the scroll.
 */
export function TiltCard({
  children, className, intensity = 5,
}: { children: React.ReactNode; className?: string; intensity?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setStyle({
      transform: `perspective(900px) rotateX(${-py * intensity}deg) ` +
                 `rotateY(${px * intensity}deg) translateZ(0)`,
      boxShadow: `${-px * 18}px ${-py * 18 + 10}px 40px rgba(24,24,27,.10), ` +
                 `0 1px 3px rgba(24,24,27,.07)`,
    });
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => setStyle({})}
      style={style}
      className={clsx("transition-[transform,box-shadow] duration-300 ease-out will-change-transform",
        className)}
    >
      {children}
    </div>
  );
}

/**
 * A mesh of colour behind a panel.
 *
 * Four blurred fields on a tinted base, animated slowly enough that you notice
 * it only if you stop and look. It sits behind a card and never behind running
 * text, so nothing here has to survive a contrast check.
 */
export function Aurora({ className }: { className?: string }) {
  return (
    <div aria-hidden className={clsx("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute inset-0 bg-[linear-gradient(160deg,#eef5f3_0%,#f3f0fb_45%,#fdf3ec_100%)]" />
      <div className="absolute -top-[22%] -left-[12%] w-[62%] h-[62%] rounded-full blur-[70px] opacity-[0.55] animate-[drift_18s_ease-in-out_infinite]"
           style={{ background: "radial-gradient(closest-side, #14b8a6, transparent 72%)" }} />
      <div className="absolute top-[8%] right-[-14%] w-[58%] h-[58%] rounded-full blur-[80px] opacity-[0.45] animate-[drift_22s_ease-in-out_infinite_reverse]"
           style={{ background: "radial-gradient(closest-side, #6366f1, transparent 72%)" }} />
      <div className="absolute bottom-[-16%] left-[18%] w-[56%] h-[56%] rounded-full blur-[80px] opacity-[0.42] animate-[drift_26s_ease-in-out_infinite]"
           style={{ background: "radial-gradient(closest-side, #f59e0b, transparent 72%)" }} />
      <div className="absolute bottom-[6%] right-[6%] w-[42%] h-[42%] rounded-full blur-[70px] opacity-[0.34] animate-[drift_20s_ease-in-out_infinite_reverse]"
           style={{ background: "radial-gradient(closest-side, #f43f5e, transparent 72%)" }} />
      {/* a little grain, so the blur does not band on wide screens */}
      <div className="absolute inset-0 opacity-[0.16] mix-blend-overlay"
           style={{ backgroundImage:
             "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")" }} />
    </div>
  );
}

/** Marks progress through a long page without stealing attention. */
export function ScrollProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const max = document.body.scrollHeight - window.innerHeight;
      setPct(max > 0 ? (window.scrollY / max) * 100 : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 h-[2px] z-50 pointer-events-none">
      <div className="h-full bg-accent transition-[width] duration-100 ease-out"
           style={{ width: `${pct}%` }} />
    </div>
  );
}
