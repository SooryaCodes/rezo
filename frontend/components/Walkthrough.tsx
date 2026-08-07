"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Eyebrow } from "./ui";

/**
 * The first five minutes.
 *
 * A dispute engine is not self-explanatory: nothing happens until a case
 * exists, and a merchant who lands on an empty inbox has no way to tell
 * whether it is working or broken. This is a checklist rather than a tooltip
 * tour — each item is a real thing to go and do, it remembers what has been
 * done, and it gets out of the way permanently once the list is finished.
 */

type Task = {
  id: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  /** what proves this actually happened, so the tick is earned not clicked */
  done?: (facts: Facts) => boolean;
};

export type Facts = {
  hasPolicy: boolean;
  hasDisputes: boolean;
  hasResolved: boolean;
  hasApproved: boolean;
};

const TASKS: Task[] = [
  {
    id: "policy",
    title: "Check the policy we drafted for you",
    body: "Your answers during setup became clauses. These are the exact words the agents " +
          "will quote back to a customer, so it is worth thirty seconds of reading.",
    cta: "Open policy",
    href: "/dashboard?tab=policy",
    done: (f) => f.hasPolicy,
  },
  {
    id: "file",
    title: "File a dispute as one of your customers",
    body: "Open the test storefront, pick an order and report a problem. You will see exactly " +
          "what your buyer sees, camera step and all.",
    cta: "Open the storefront",
    href: "/store",
    done: (f) => f.hasDisputes,
  },
  {
    id: "watch",
    title: "Watch the agents work on it",
    body: "The console shows the same case from the inside: which agent found what, where the " +
          "guardrail sat, and what the whole decision cost.",
    cta: "Open the console",
    href: "/console",
    done: (f) => f.hasResolved,
  },
  {
    id: "approve",
    title: "Approve one yourself",
    body: "Run the claim that lands above your limit. It stops mid-graph, waits for you, and " +
          "carries on from exactly where it paused once you decide.",
    cta: "See what's waiting",
    href: "/dashboard?tab=disputes",
    done: (f) => f.hasApproved,
  },
  {
    id: "install",
    title: "Put it on your real store",
    body: "One script tag on your order page. The guide has the code for your stack, and a " +
          "context file you can hand to whatever coding assistant you already use.",
    cta: "Integration guide",
    href: "/docs",
  },
];

const DISMISSED = "rezo-walkthrough-dismissed";

export function Walkthrough({ facts }: { facts: Facts }) {
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED) === "1");
  }, []);

  if (dismissed) return null;

  const complete = TASKS.filter((t) => t.done?.(facts)).length;
  const total = TASKS.filter((t) => t.done).length;
  const allDone = complete >= total;

  const hide = () => {
    localStorage.setItem(DISMISSED, "1");
    setDismissed(true);
  };

  // The first thing not yet done is the only one that needs a button.
  const next = TASKS.find((t) => t.done && !t.done(facts)) ?? TASKS[TASKS.length - 1];

  return (
    <div className="rounded-2xl border border-line bg-surface-1 overflow-hidden mb-5
                    shadow-[0_1px_2px_rgba(17,17,20,.04),0_8px_28px_rgba(17,17,20,.05)]">
      <div className="px-5 py-4 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Eyebrow>Getting started</Eyebrow>
            <Badge tone={allDone ? "accent" : "neutral"}>
              {complete} of {total} done
            </Badge>
          </div>
          <h2 className="text-lg font-semibold tracking-tight mt-1.5">
            {allDone
              ? "You've seen the whole loop."
              : "Five minutes to see the whole thing work."}
          </h2>
          <p className="text-base text-ink-2 mt-1 max-w-[62ch]">
            {allDone
              ? "Nothing left to try here. Put the widget on your real store and let it run in " +
                "shadow mode for a week before you raise your limit."
              : "Nothing in a dispute tool happens until a dispute exists. These four steps " +
                "create one, resolve it, and show you what happened underneath."}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Show"}
          </Button>
          <Button variant="ghost" size="sm" onClick={hide}>Dismiss</Button>
        </div>
      </div>

      {/* progress, as a single quiet line rather than a bar per item */}
      <div className="h-[3px] bg-surface-3">
        <div className="h-full bg-action transition-[width] duration-slow ease-out"
             style={{ width: `${(complete / Math.max(1, total)) * 100}%` }} />
      </div>

      {open && (
        <div className="divide-y divide-line-subtle">
          {TASKS.map((task) => {
            const isDone = task.done?.(facts) ?? false;
            const isNext = task.id === next.id && !isDone;
            return (
              <div key={task.id}
                   className={`flex items-start gap-3.5 px-5 py-4 ${isNext ? "bg-surface-2" : ""}`}>
                <span className={`mt-0.5 w-5 h-5 rounded-full border grid place-items-center
                                  text-2xs shrink-0 transition-colors duration-base ${
                  isDone ? "bg-action border-transparent text-action-ink"
                    : isNext ? "border-action text-ink" : "border-line text-ink-4"}`}>
                  {isDone ? "✓" : TASKS.indexOf(task) + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium ${isDone ? "text-ink-3 line-through" : ""}`}>
                    {task.title}
                  </div>
                  {!isDone && <p className="text-sm text-ink-2 mt-0.5">{task.body}</p>}
                </div>
                {!isDone && (
                  <Button size="sm" variant={isNext ? "primary" : "secondary"}
                          onClick={() => (window.location.href = task.href)}>
                    {task.cta}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
