"use client";

import clsx from "clsx";
import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";

/* ══ buttons ═══════════════════════════════════════════════════════════════
   Three tiers with visibly different weight, so the action that matters on a
   screen is never ambiguous. Depth is a lit top edge plus a shadow that
   collapses on press: a couple of pixels, enough to feel physical.
   ═════════════════════════════════════════════════════════════════════════ */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium leading-none " +
  "border border-transparent whitespace-nowrap select-none rounded-full " +
  "transition-[background,border-color,color,transform,box-shadow] " +
  "duration-fast ease-out disabled:cursor-not-allowed disabled:translate-y-0 " +
  "disabled:shadow-none";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-action text-action-ink " +
    "shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_1px_2px_rgba(17,17,20,.24),0_6px_16px_rgba(17,17,20,.14)] " +
    "hover:bg-action-hover hover:-translate-y-[1px] " +
    "hover:shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_2px_4px_rgba(17,17,20,.2),0_10px_24px_rgba(17,17,20,.16)] " +
    "active:translate-y-[1px] active:shadow-[inset_0_2px_5px_rgba(0,0,0,.24)] " +
    "disabled:bg-surface-3 disabled:text-ink-4",
  secondary:
    "bg-surface-1 border-line text-ink shadow-[0_1px_2px_rgba(17,17,20,.04)] " +
    "hover:border-line-strong hover:-translate-y-[1px] hover:shadow-[0_3px_10px_rgba(17,17,20,.07)] " +
    "active:translate-y-[1px] active:shadow-none " +
    "disabled:text-ink-4 disabled:border-line-subtle",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink active:scale-[.975] disabled:text-ink-4",
  danger:
    "bg-bad-soft text-bad border-bad-line hover:bg-bad hover:text-white " +
    "hover:-translate-y-[1px] active:translate-y-[1px]",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-3 text-sm",
  md: "h-9 px-4 text-[13px]",
  lg: "h-11 px-6 text-base",
};

export function Button({
  variant = "secondary", size = "md", block, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: Size; block?: boolean;
}) {
  return <button className={clsx(BASE, VARIANTS[variant], SIZES[size],
    block && "w-full", className)} {...rest} />;
}

export function LinkButton({
  variant = "secondary", size = "md", block, className, ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant; size?: Size; block?: boolean;
}) {
  return <a className={clsx(BASE, "no-underline", VARIANTS[variant], SIZES[size],
    block && "w-full", className)} {...rest} />;
}

/* ══ status ════════════════════════════════════════════════════════════════
   No green, no amber. State is carried by weight and containment instead of
   hue, which keeps working when two states are true at once and does not drag
   the interface toward a traffic-light dashboard.
   ═════════════════════════════════════════════════════════════════════════ */

type Tone = "neutral" | "accent" | "attention" | "bad";

const TONES: Record<Tone, string> = {
  // "nothing happened" gets no fill at all
  neutral: "bg-transparent text-ink-3 border-line",
  // active, verified, resolved
  accent: "bg-accent-soft text-accent border-transparent",
  // demands a person: solid ink, the highest contrast on the page
  attention: "bg-action text-action-ink border-transparent",
  // a problem
  bad: "bg-bad-soft text-bad border-bad-line",
};

export function Badge({ tone = "neutral", dot, children, className }: {
  tone?: Tone; dot?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <span className={clsx(
      "inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-full border",
      "text-xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-breathe" />}
      {children}
    </span>
  );
}

/* ══ surfaces ══════════════════════════════════════════════════════════════ */

export function Card({ className, children, tight, hover }: {
  className?: string; children: React.ReactNode; tight?: boolean; hover?: boolean;
}) {
  return (
    <div className={clsx(
      "bg-surface-1 border border-line-subtle rounded-2xl",
      tight ? "p-4" : "p-6",
      hover && "transition-[transform,box-shadow,border-color] duration-base ease-out " +
               "hover:-translate-y-[2px] hover:shadow-[0_8px_28px_rgba(17,17,20,.07)] hover:border-line",
      className)}>
      {children}
    </div>
  );
}

export function Panel({ title, action, children, className }: {
  title?: React.ReactNode; action?: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={clsx("bg-surface-1 border border-line-subtle rounded-2xl overflow-hidden",
      className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-line-subtle">
          <span className="font-semibold text-base">{title}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: {
  children: React.ReactNode; className?: string;
}) {
  return (
    <span className={clsx("text-2xs font-bold tracking-wide uppercase text-ink-3", className)}>
      {children}
    </span>
  );
}

/* ══ inputs ════════════════════════════════════════════════════════════════ */

export const Input = React.forwardRef<HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input ref={ref} className={clsx(
      "h-11 w-full px-3.5 bg-surface-1 text-ink border border-line rounded-xl text-base",
      "placeholder:text-ink-4 transition-[border-color,box-shadow] duration-fast ease-out",
      "focus:outline-none focus:border-accent-line focus:shadow-[0_0_0_4px_var(--accent-soft)]",
      className)} {...rest} />
  );
});

export function Field({ label, hint, error, children }: {
  label?: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && <span className="text-sm font-medium text-ink-2">{label}</span>}
      {children}
      {error
        ? <span className="text-sm text-bad">{error}</span>
        : hint && <span className="text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

/* ── select: a real listbox, because the native control cannot be styled
      consistently and looks foreign the moment the rest of the page is not ── */

export type Option = { value: string; label: string; hint?: string };

export function Select({ value, onChange, options, placeholder = "Select…", className, id }: {
  value: string; onChange: (value: string) => void; options: Option[];
  placeholder?: string; className?: string; id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) setActive(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
      e.preventDefault(); setOpen(true); return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter") { e.preventDefault(); commit(active); }
  };

  return (
    <div ref={root} className={clsx("relative", className)}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        className={clsx(
          "h-11 w-full pl-3.5 pr-10 bg-surface-1 border rounded-xl text-base text-left",
          "flex items-center transition-[border-color,box-shadow] duration-fast ease-out",
          "focus:outline-none focus:border-accent-line focus:shadow-[0_0_0_4px_var(--accent-soft)]",
          open ? "border-accent-line" : "border-line hover:border-line-strong")}
      >
        <span className={clsx("truncate", !selected && "text-ink-4")}>
          {selected?.label ?? placeholder}
        </span>
        <svg viewBox="0 0 12 12" aria-hidden
             className={clsx("absolute right-3.5 w-3 h-3 text-ink-3 transition-transform duration-base ease-out",
               open && "rotate-180")}>
          <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor"
                strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div role="listbox"
             className="absolute z-50 mt-1.5 w-full max-h-[280px] overflow-y-auto p-1
                        bg-surface-1 border border-line rounded-xl
                        shadow-[0_4px_12px_rgba(17,17,20,.08),0_16px_40px_rgba(17,17,20,.12)]
                        animate-pop">
          {options.map((option, i) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => commit(i)}
              className={clsx(
                "w-full text-left px-3 py-2 rounded-lg flex items-center gap-2",
                "transition-colors duration-fast",
                i === active ? "bg-surface-2" : "bg-transparent")}
            >
              <span className="flex-1 min-w-0">
                <span className="block truncate text-base">{option.label}</span>
                {option.hint && (
                  <span className="block text-xs text-ink-3 truncate">{option.hint}</span>
                )}
              </span>
              {option.value === value && (
                <svg viewBox="0 0 12 12" className="w-3 h-3 text-accent shrink-0" aria-hidden>
                  <path d="M2 6.5 4.8 9 10 3.5" fill="none" stroke="currentColor"
                        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── slider: the native range control cannot carry a filled track and a
      grabbable thumb consistently across browsers, and this one sets money ── */

export function Slider({
  value, onChange, min = 0, max = 100, step = 1, marks, format, className,
}: {
  value: number; onChange: (value: number) => void;
  min?: number; max?: number; step?: number;
  marks?: [string, string]; format?: (value: number) => string; className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const pct = ((value - min) / (max - min)) * 100;

  const setFromClientX = useCallback((clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    onChange(Math.round(raw / step) * step);
  }, [min, max, step, onChange]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setFromClientX(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, setFromClientX]);

  const onKey = (e: React.KeyboardEvent) => {
    const jump = e.shiftKey ? step * 10 : step;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault(); onChange(Math.min(max, value + jump));
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault(); onChange(Math.max(min, value - jump));
    }
    if (e.key === "Home") { e.preventDefault(); onChange(min); }
    if (e.key === "End") { e.preventDefault(); onChange(max); }
  };

  return (
    <div className={className}>
      <div
        ref={track}
        onPointerDown={(e) => { setDragging(true); setFromClientX(e.clientX); }}
        className="relative h-9 flex items-center cursor-pointer touch-none"
      >
        <div className="absolute left-0 right-0 h-1.5 rounded-full bg-surface-3" />
        <div className="absolute left-0 h-1.5 rounded-full bg-action transition-[width] duration-75"
             style={{ width: `${pct}%` }} />
        <div
          role="slider"
          tabIndex={0}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          onKeyDown={onKey}
          className={clsx(
            "absolute w-5 h-5 -ml-2.5 rounded-full bg-surface-1 border border-line-strong",
            "shadow-[0_1px_2px_rgba(17,17,20,.16),0_4px_10px_rgba(17,17,20,.12)]",
            "transition-[transform,box-shadow] duration-fast ease-out",
            "focus:outline-none focus:shadow-[0_0_0_4px_var(--accent-soft)]",
            dragging ? "scale-110" : "hover:scale-105")}
          style={{ left: `${pct}%` }}
        />
      </div>
      {marks && (
        <div className="flex justify-between text-xs text-ink-3 -mt-1">
          <span>{marks[0]}</span><span>{marks[1]}</span>
        </div>
      )}
      {format && <div className="sr-only">{format(value)}</div>}
    </div>
  );
}

/* ══ states ════════════════════════════════════════════════════════════════ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("shimmer rounded-lg h-3", className)} />;
}

export function EmptyState({ glyph, title, body, action }: {
  glyph?: React.ReactNode; title: string; body: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-16 px-5 max-w-[400px] mx-auto">
      <div className="w-11 h-11 rounded-xl bg-surface-2 border border-line grid place-items-center text-ink-3 mb-1">
        {glyph ?? (
          <svg viewBox="0 0 16 16" className="w-4 h-4" aria-hidden>
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 5v3.5l2 1.4" fill="none" stroke="currentColor"
                  strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-ink-3">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ══ side sheet ════════════════════════════════════════════════════════════
   A sheet rather than a modal, so the evidence a decision rests on stays on
   screen while the decision is made.
   ═════════════════════════════════════════════════════════════════════════ */

export function Sheet({ open, onClose, title, eyebrow, footer, children }: {
  open: boolean; onClose: () => void; title: React.ReactNode; eyebrow?: string;
  footer?: React.ReactNode; children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div onClick={onClose}
           className={clsx("fixed inset-0 z-40 bg-[var(--scrim)] backdrop-blur-[2px]",
             "transition-opacity duration-base ease-out",
             open ? "opacity-100" : "opacity-0 pointer-events-none")} />
      <aside role="dialog" aria-modal="true" aria-hidden={!open}
             className={clsx(
               "fixed top-0 right-0 z-40 h-dvh w-[min(520px,100vw)] bg-surface-1",
               "border-l border-line flex flex-col",
               "shadow-[-8px_0_40px_rgba(17,17,20,.14)]",
               "transition-transform duration-slow ease-out",
               open ? "translate-x-0" : "translate-x-full")}>
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-line-subtle">
          <div>
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h3 className="text-lg font-semibold tracking-tight mt-1">{title}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-line-subtle flex gap-2 bg-surface-1">{footer}</div>
        )}
      </aside>
    </>
  );
}

/* ══ toasts ════════════════════════════════════════════════════════════════ */

type Toast = { id: number; message: string; tone: "ok" | "err" };
const ToastContext = createContext<(message: string, tone?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    // An error never auto-dismisses: the person may not have been looking.
    if (tone === "ok") setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={clsx(
            "animate-pop bg-surface-1 border rounded-xl px-4 py-3 text-[13px]",
            "min-w-[280px] max-w-[380px] flex items-start gap-3",
            "shadow-[0_4px_12px_rgba(17,17,20,.08),0_16px_40px_rgba(17,17,20,.12)]",
            t.tone === "err" ? "border-bad-line" : "border-line")}>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
                    className="text-ink-3 hover:text-ink text-sm shrink-0">
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ══ brand ═════════════════════════════════════════════════════════════════ */

export function Brand({ href = "/", label = true, className }: {
  href?: string; label?: boolean; className?: string;
}) {
  return (
    <a href={href} className={clsx(
      "flex items-center gap-2 no-underline text-ink font-bold tracking-tight text-md", className)}>
      <span className="w-6 h-6 rounded-lg bg-action text-action-ink grid place-items-center text-xs font-bold
                       shadow-[inset_0_1px_0_rgba(255,255,255,.18)]">
        R
      </span>
      {label && "Rezo"}
    </a>
  );
}
