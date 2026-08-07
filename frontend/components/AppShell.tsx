"use client";

import clsx from "clsx";
import { useAuth } from "@/lib/useAuth";
import { Brand, Skeleton, ThemeToggle } from "./ui";

const NAV = [
  { key: "disputes", label: "Disputes", href: "/dashboard?tab=disputes" },
  { key: "analytics", label: "Analytics", href: "/dashboard?tab=analytics" },
  { key: "policy", label: "Policy", href: "/dashboard?tab=policy" },
  { key: "integration", label: "Integration", href: "/dashboard?tab=integration" },
];

const TOOLS = [
  { key: "console", label: "Agent console", href: "/console" },
  { key: "store", label: "Test storefront", href: "/store" },
  { key: "docs", label: "Integration guide", href: "/docs" },
];

export function AppShell({ active, badge, children }: {
  active: string; badge?: number; children: React.ReactNode;
}) {
  const { status, session, signOut } = useAuth();

  if (status !== "authed" || !session) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Skeleton className="w-56" />
      </div>
    );
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[224px_1fr]">
      <aside className="bg-surface-1 border-r border-line-subtle p-4 flex lg:flex-col gap-2
                        lg:sticky lg:top-0 lg:h-screen overflow-x-auto">
        <div className="px-2 pb-3 hidden lg:block"><Brand /></div>

        <div className="px-2 pb-3 hidden lg:block">
          <div className="font-semibold truncate">{session.store.name}</div>
          <div className="text-xs text-ink-3 truncate">{session.account.email}</div>
        </div>

        {NAV.map((item) => (
          <a key={item.key} href={item.href}
             className={clsx(
               "flex items-center gap-2 h-[30px] px-2 rounded text-base font-medium no-underline",
               "transition-colors duration-fast",
               active === item.key
                 ? "bg-surface-2 text-ink"
                 : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
            <span className={clsx("w-1.5 h-1.5 rounded-full",
              active === item.key ? "bg-accent" : "bg-ink-4")} />
            {item.label}
            {item.key === "disputes" && !!badge && (
              <span className="ml-auto text-xs font-bold text-warn bg-warn-soft rounded-sm px-1.5">
                {badge}
              </span>
            )}
          </a>
        ))}

        <div className="hidden lg:block flex-1" />

        <div className="hidden lg:block h-px bg-line-subtle my-2" />
        {TOOLS.map((item) => (
          <a key={item.key} href={item.href}
             className={clsx(
               "flex items-center gap-2 h-[30px] px-2 rounded text-base no-underline",
               "transition-colors duration-fast",
               active === item.key
                 ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
            <span className="w-1.5 h-1.5 rounded-full bg-ink-4" />
            {item.label}
          </a>
        ))}

        <div className="hidden lg:flex items-center justify-between px-2 pt-2">
          <button onClick={signOut} className="text-sm text-ink-3 hover:text-ink">Sign out</button>
          <ThemeToggle />
        </div>
      </aside>

      <main className="p-5 lg:p-6 max-w-[1180px] w-full">{children}</main>
    </div>
  );
}
