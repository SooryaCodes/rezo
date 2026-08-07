"use client";

import { Aurora } from "./motion";
import { Brand } from "./ui";

/**
 * The split used across sign-in, sign-up and onboarding.
 *
 * The colour lives on the left panel only, behind a card that never carries
 * running text, so the form side stays plain and legible. On a phone the panel
 * is dropped entirely rather than stacked: it is atmosphere, and atmosphere
 * should not cost someone a scroll before they can type their email.
 */
export function AuthShell({ children, aside }: {
  children: React.ReactNode; aside: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_minmax(420px,42%)]">
      <aside className="relative hidden lg:flex flex-col justify-between p-8 overflow-hidden bg-surface-2">
        <Aurora />
        <div className="relative z-10">
          <Brand />
        </div>
        <div className="relative z-10">{aside}</div>
        <div className="relative z-10 text-xs text-ink-2">
          Evidence you can trust, decisions you can read.
        </div>
      </aside>

      <main className="flex flex-col justify-center px-6 py-10">
        <div className="w-full max-w-[380px] mx-auto">
          <div className="lg:hidden mb-8"><Brand /></div>
          {children}
        </div>
      </main>
    </div>
  );
}

/** The frosted card that sits on the gradient. Short lines only. */
export function AsideCard({ quote, attribution, points }: {
  quote?: string; attribution?: string; points?: string[];
}) {
  return (
    <div className="rounded-xl border border-white/60 bg-white/70 dark:bg-white/10 dark:border-white/15 backdrop-blur-xl p-6 max-w-[420px] shadow-[0_8px_32px_rgba(24,24,27,.10)]">
      {quote && (
        <>
          <p className="text-md leading-relaxed text-ink">{quote}</p>
          {attribution && <p className="text-sm text-ink-2 mt-3">{attribution}</p>}
        </>
      )}
      {points && (
        <ul className="list-none p-0 m-0 flex flex-col gap-3">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-base text-ink">
              <span className="text-accent shrink-0">✓</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
