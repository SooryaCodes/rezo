"use client";

import clsx from "clsx";

/**
 * The mark.
 *
 * Two arcs closing on each other around a settled point: the buyer's side and
 * the seller's side of a dispute meeting in the middle. It reads as a rounded
 * "R" at a glance and as a resolution when you look twice, and it survives
 * being 16px in a browser tab because it is three shapes and no detail.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Rezo"
      className={clsx("shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" fill="var(--action)" />
      {/* the two sides, arcing toward each other */}
      <path
        d="M10.5 22.5V9.5h6.2a4.4 4.4 0 0 1 0 8.8h-3.6"
        stroke="var(--action-ink)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* the settlement: where they meet */}
      <path
        d="m15.6 18.3 5.9 4.2"
        stroke="var(--action-ink)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Mark plus wordmark, at the weight the rest of the interface uses. */
export function Logo({ href = "/", label = true, size = 26, className }: {
  href?: string; label?: boolean; size?: number; className?: string;
}) {
  return (
    <a href={href}
       className={clsx("inline-flex items-center gap-2 no-underline text-ink", className)}>
      <LogoMark size={size} />
      {label && (
        <span className="font-bold tracking-tighter text-lg leading-none">Rezo</span>
      )}
    </a>
  );
}
