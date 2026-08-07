"use client";

import clsx from "clsx";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

/* ── buttons: three tiers with visibly different weight, so the important
      action on a screen is never ambiguous ──────────────────────────────── */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  block?: boolean;
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded font-medium leading-none " +
  "border border-transparent whitespace-nowrap transition-[background,border-color,color,transform] " +
  "duration-fast ease-out active:scale-[0.975] disabled:cursor-not-allowed";

const BUTTON_VARIANTS = {
  primary: "bg-action text-action-ink hover:bg-action-hover disabled:bg-surface-2 disabled:text-ink-4",
  secondary:
    "bg-surface-1 border-line text-ink hover:border-line-strong hover:bg-surface-2 " +
    "disabled:text-ink-4 disabled:hover:bg-surface-1",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink disabled:text-ink-4",
  danger: "bg-bad-soft text-bad hover:bg-bad hover:text-white",
};

const BUTTON_SIZES = {
  sm: "h-[27px] px-[9px] text-sm",
  md: "h-8 px-3 text-[13px]",
  lg: "h-[38px] px-[18px] text-base",
};

export function Button({
  variant = "secondary", size = "md", block, className, ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size],
        block && "w-full", className)}
      {...rest}
    />
  );
}

export function LinkButton({
  variant = "secondary", size = "md", block, className, ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: keyof typeof BUTTON_VARIANTS; size?: keyof typeof BUTTON_SIZES; block?: boolean;
}) {
  return (
    <a
      className={clsx(BUTTON_BASE, "no-underline", BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size], block && "w-full", className)}
      {...rest}
    />
  );
}

/* ── badges: 4px radius reads product; a full pill reads consumer app ───── */

type Tone = "neutral" | "ok" | "warn" | "bad" | "live";

const TONES: Record<Tone, string> = {
  // "nothing happened" gets no hue at all, only an outline
  neutral: "bg-transparent text-ink-3 border-line",
  ok: "bg-ok-soft text-ok border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
  live: "bg-accent-soft text-accent border-transparent",
};

export function Badge({ tone = "neutral", dot, children, className }: {
  tone?: Tone; dot?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <span className={clsx(
      "inline-flex items-center gap-1.5 h-5 px-[7px] rounded-sm border text-xs font-medium whitespace-nowrap",
      TONES[tone], className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ── surfaces ───────────────────────────────────────────────────────────── */

export function Card({ className, children, tight }: {
  className?: string; children: React.ReactNode; tight?: boolean;
}) {
  return (
    <div className={clsx("bg-surface-1 border border-line-subtle rounded-lg",
      tight ? "p-4" : "p-5", className)}>
      {children}
    </div>
  );
}

export function Panel({ title, action, children, className }: {
  title?: React.ReactNode; action?: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={clsx("bg-surface-1 border border-line-subtle rounded-lg overflow-hidden", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line-subtle">
          <span className="font-semibold text-base">{title}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={clsx("text-2xs font-bold tracking-wide uppercase text-ink-3", className)}>
      {children}
    </span>
  );
}

/* ── form controls ──────────────────────────────────────────────────────── */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input ref={ref} className={clsx(
        "h-[34px] w-full px-2.5 bg-surface-1 text-ink border border-line rounded text-base",
        "placeholder:text-ink-4 transition-[border-color,box-shadow] duration-fast ease-out",
        "focus:outline-none focus:border-accent-line focus:shadow-[0_0_0_3px_var(--accent-soft)]",
        className)} {...rest} />
    );
  });

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={clsx(
      "w-full min-h-[76px] px-2.5 py-2 bg-surface-1 text-ink border border-line rounded text-base",
      "placeholder:text-ink-4 resize-y leading-relaxed",
      "focus:outline-none focus:border-accent-line focus:shadow-[0_0_0_3px_var(--accent-soft)]",
      className)} {...rest} />
  );
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(
      "h-[34px] w-full pl-2.5 pr-7 bg-surface-1 text-ink border border-line rounded text-base",
      "appearance-none cursor-pointer",
      "focus:outline-none focus:border-accent-line focus:shadow-[0_0_0_3px_var(--accent-soft)]",
      "bg-[linear-gradient(45deg,transparent_50%,var(--text-3)_50%),linear-gradient(135deg,var(--text-3)_50%,transparent_50%)]",
      "bg-[length:5px_5px,5px_5px] bg-no-repeat",
      "bg-[position:calc(100%-15px)_15px,calc(100%-10px)_15px]",
      className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

/* ── states: loading, empty and failed are three different things and must
      never be shown in place of one another ──────────────────────────────── */

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("shimmer rounded-sm h-3", className)} />;
}

export function EmptyState({ glyph = "◷", title, body, action }: {
  glyph?: string; title: string; body: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-14 px-5 max-w-[380px] mx-auto">
      <div className="w-[42px] h-[42px] rounded-md bg-surface-2 border border-line grid place-items-center text-ink-3 mb-1">
        {glyph}
      </div>
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-ink-3">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ── side sheet: the evidence stays visible beside the decision, which a
      full-screen modal would cover ───────────────────────────────────────── */

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
      <div
        onClick={onClose}
        className={clsx("fixed inset-0 z-40 bg-[var(--scrim)] transition-opacity duration-base ease-out",
          open ? "opacity-100" : "opacity-0 pointer-events-none")}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        className={clsx(
          "fixed top-0 right-0 z-40 h-screen w-[min(480px,100vw)] bg-surface-1 border-l border-line",
          "shadow-3 flex flex-col transition-transform duration-slow ease-out",
          open ? "translate-x-0" : "translate-x-full")}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line-subtle">
          <div>
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h3 className="text-lg font-semibold tracking-tight mt-0.5">{title}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-line-subtle flex gap-2 bg-surface-1">{footer}</div>
        )}
      </aside>
    </>
  );
}

/* ── toasts: an error never auto-dismisses, because the person may not have
      been looking when it appeared ───────────────────────────────────────── */

type Toast = { id: number; message: string; tone: "ok" | "err" };
const ToastContext = createContext<(message: string, tone?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    if (tone === "ok") {
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
    }
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={clsx(
            "animate-rise bg-surface-1 border rounded-md shadow-2 px-3.5 py-2.5 text-[13px]",
            "min-w-[260px] max-w-[360px] flex items-start gap-2",
            t.tone === "err" ? "border-bad" : "border-line")}>
            <span className="flex-1">{t.message}</span>
            <Button variant="ghost" size="sm"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              Dismiss
            </Button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ── theme ──────────────────────────────────────────────────────────────── */

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("rezo-theme", next ? "dark" : "light");
  };

  return (
    <Button variant="ghost" size="sm" onClick={toggle} className={className}>
      {dark ? "Light" : "Dark"}
    </Button>
  );
}

/* ── brand ──────────────────────────────────────────────────────────────── */

export function Brand({ href = "/", label = true }: { href?: string; label?: boolean }) {
  return (
    <a href={href} className="flex items-center gap-2 no-underline text-ink font-bold tracking-tight text-md">
      <span className="w-[22px] h-[22px] rounded-sm bg-action text-action-ink grid place-items-center text-xs font-bold">
        R
      </span>
      {label && "Rezo"}
    </a>
  );
}
