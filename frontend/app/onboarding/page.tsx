"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { rupees } from "@/lib/format";
import { Aurora } from "@/components/motion";
import { Badge, Brand, Button, Eyebrow, Skeleton, Slider, useToast } from "@/components/ui";

type Choice = { value: string; label: string };
type Question = { key: string; q: string; help?: string; options: Choice[]; value: string };

const BASE_QUESTIONS: Question[] = [
  { key: "window", q: "How long after delivery can someone report a problem?",
    help: "Most stores land on 7 days. Longer windows raise resolution rates and returns alike.",
    value: "7",
    options: [{ value: "3", label: "3 days" }, { value: "7", label: "7 days" },
              { value: "15", label: "15 days" }, { value: "30", label: "30 days" }] },
  { key: "damage", q: "If it arrives damaged:", value: "full_refund",
    options: [{ value: "full_refund", label: "Refund in full" },
              { value: "replacement", label: "Send a replacement" }] },
  { key: "wrong", q: "If the wrong item or size arrives:", value: "replacement",
    options: [{ value: "replacement", label: "Send the right one" },
              { value: "full_refund", label: "Refund in full" }] },
  { key: "mind", q: "If they simply changed their mind:", value: "partial_refund",
    options: [{ value: "partial_refund", label: "Refund minus shipping" },
              { value: "reject", label: "Not accepted" }] },
  { key: "sale", q: "Sale and made-to-order items:", value: "final",
    options: [{ value: "final", label: "Final sale" },
              { value: "same", label: "Same as everything else" }] },
];

const STEPS = ["Your policy", "Your limit", "Install", "Done"];

export default function OnboardingPage() {
  const { status, session } = useAuth({ allowUnonboarded: true });
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [questions, setQuestions] = useState<Question[]>(BASE_QUESTIONS);
  const [cap, setCap] = useState(500);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session?.store?.auto_approve_cap) setCap(session.store.auto_approve_cap);
  }, [session]);

  const get = (key: string) => questions.find((q) => q.key === key)!.value;
  const pick = (key: string, value: string) =>
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, value } : q)));

  const clauses = useMemo(() => {
    const w = parseInt(get("window"), 10);
    const finalSale = get("sale") === "final";
    return [
      { id: "P-1", title: "Order not delivered",
        text: "If a shipment is not delivered within 10 days of dispatch, or the courier marks " +
              "it undelivered, lost or stuck in transit, the order is refunded in full without " +
              "waiting for the parcel to come back.",
        claim_types: ["not_delivered"], window_days: 30, outcome: "full_refund", exclusions: [] },
      { id: "P-2", title: "Damaged on arrival",
        text: `Items that arrive damaged must be reported within ${w} days of delivery with ` +
              `photographic evidence of the damage. Verified claims receive ` +
              `${get("damage") === "full_refund" ? "a full refund" : "a free replacement"}.`,
        claim_types: ["damage"], window_days: w, outcome: get("damage"),
        exclusions: finalSale ? ["custom_made"] : [] },
      { id: "P-3", title: "Wrong item or size delivered",
        text: `If the delivered item does not match the order in design, colour or size, the ` +
              `buyer receives ${get("wrong") === "replacement"
                ? "a replacement in the correct variant, or a full refund if it is unavailable"
                : "a full refund"}. Must be reported within ${w} days of delivery.`,
        claim_types: ["wrong_item", "wrong_size"], window_days: w, outcome: get("wrong"),
        exclusions: [] },
      { id: "P-4", title: "Change of mind",
        text: get("mind") === "reject"
          ? "Returns for change of mind are not accepted. Damage on arrival and wrong items " +
            "delivered remain covered."
          : "Unused items in original packaging with tags intact may be returned within 3 days " +
            "of delivery for a refund of the item price. Original shipping charges are not " +
            "refunded.",
        claim_types: ["change_of_mind"], window_days: get("mind") === "reject" ? 0 : 3,
        outcome: get("mind"), exclusions: finalSale ? ["sale_item", "custom_made"] : [] },
    ];
  }, [questions]);

  if (status !== "authed" || !session) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Skeleton className="w-64" />
      </div>
    );
  }

  const storeId = session.store.id;

  const advance = async (next: number) => {
    setBusy(true);
    try {
      if (next === 2) await api.publishPolicy(storeId, clauses);
      if (next === 3) await api.updateStore(storeId, { auto_approve_cap: cap });
      await api.setOnboardingStep(next);
      setStep(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "That did not save", "err");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    await api.setOnboardingStep(99);
    window.location.href = "/dashboard";
  };

  const snippet =
    `<script src="https://rezo.zevora.io/widget.js"\n` +
    `        data-rezo-key="${session.store.publishable_key ?? "pk_live_..."}"\n` +
    `        data-rezo-order="{{ order.id }}" async></script>`;

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(360px,34%)_1fr]">
      {/* ── the panel keeps its bearings while the form changes ─────────── */}
      <aside className="relative hidden lg:flex flex-col justify-between p-8 overflow-hidden">
        <Aurora />
        <div className="relative z-10"><Brand /></div>

        <div className="relative z-10 rounded-xl border border-white/60 bg-white/70 backdrop-blur-xl p-6 shadow-[0_8px_32px_rgba(24,24,27,.10)]">
          <Eyebrow>Setting up {session.store.name}</Eyebrow>
          <ol className="list-none p-0 mt-4 flex flex-col gap-3">
            {STEPS.map((label, i) => {
              const n = i + 1;
              const done = step > n;
              const active = step === n;
              return (
                <li key={label} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold shrink-0 transition-colors duration-base ${
                    done ? "bg-accent text-white"
                         : active ? "bg-action text-action-ink"
                                  : "bg-white/60 text-ink-3"}`}>
                    {done ? "✓" : n}
                  </span>
                  <span className={active ? "font-medium" : "text-ink-2"}>{label}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="relative z-10 text-xs text-ink-2 max-w-[34ch]">
          Nothing is live until you finish. You can change every one of these later.
        </p>
      </aside>

      {/* ── the work ────────────────────────────────────────────────────── */}
      <main className="px-6 py-10 lg:py-16">
        <div className="max-w-[620px] mx-auto flex flex-col gap-6">
          <div className="lg:hidden flex items-center justify-between">
            <Brand />
            <span className="text-sm text-ink-3">Step {step} of 4</span>
          </div>

          {step === 1 && (
            <>
              <header>
                <Eyebrow>Your policy</Eyebrow>
                <h1 className="mt-2 text-3xl font-bold tracking-tighter">
                  What are your rules when something goes wrong?
                </h1>
                <p className="mt-3 text-md text-ink-2">
                  These answers become the clauses your agents quote to customers. Older orders
                  always keep the policy that applied when they were placed, so changing your
                  mind later never rewrites history.
                </p>
              </header>

              <div className="bg-surface-1 border border-line-subtle rounded-lg divide-y divide-line-subtle">
                {questions.map((q) => (
                  <div key={q.key} className="p-5">
                    <div className="font-medium">{q.q}</div>
                    {q.help && <p className="text-sm text-ink-3 mt-0.5">{q.help}</p>}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {q.options.map((o) => (
                        <button key={o.value} onClick={() => pick(q.key, o.value)}
                          className={`px-3 py-1.5 rounded text-base border transition-all duration-fast ease-out ${
                            q.value === o.value
                              ? "bg-accent-soft border-accent-line text-accent font-medium"
                              : "bg-surface-1 border-line text-ink-2 hover:border-line-strong hover:-translate-y-[1px]"}`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <details className="bg-surface-1 border border-line-subtle rounded-lg p-5 group">
                <summary className="cursor-pointer font-medium list-none flex justify-between">
                  Preview the clauses this writes
                  <span className="text-ink-3 group-open:hidden">+</span>
                  <span className="text-ink-3 hidden group-open:inline">−</span>
                </summary>
                <div className="mt-4 flex flex-col gap-3">
                  {clauses.map((c) => (
                    <div key={c.id} className="border-l-2 border-accent pl-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-3">{c.id}</span>
                        <span className="font-medium text-base">{c.title}</span>
                        <Badge>{c.window_days} day window</Badge>
                      </div>
                      <p className="text-sm text-ink-2 mt-1">{c.text}</p>
                    </div>
                  ))}
                </div>
              </details>

              <div className="flex items-center gap-3">
                <Button variant="primary" size="lg" onClick={() => advance(2)} disabled={busy}>
                  {busy ? "Saving…" : "Continue"}
                </Button>
                <span className="text-sm text-ink-3">Takes about a minute</span>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <header>
                <Eyebrow>Your limit</Eyebrow>
                <h1 className="mt-2 text-3xl font-bold tracking-tighter">
                  How much can Rezo settle without asking you?
                </h1>
                <p className="mt-3 text-md text-ink-2">
                  Anything above this comes to you with everything the agents found. The limit is
                  enforced in code before a refund is called, so it holds even if a customer tries
                  to talk the assistant into ignoring it.
                </p>
              </header>

              <div className="bg-surface-1 border border-line-subtle rounded-lg p-6">
                <div className="text-4xl font-bold tracking-tightest tabular">
                  {cap === 0 ? "Everything comes to me" : rupees(cap)}
                </div>
                <Slider value={cap} onChange={setCap} min={0} max={5000} step={100}
                        className="my-3"
                        marks={["₹0 — I approve everything", "₹5,000"]} />

                <div className="h-px bg-line-subtle my-5" />

                <Eyebrow>What each evidence tier unlocks</Eyebrow>
                <div className="flex flex-col gap-2 mt-3">
                  {[["Verified live capture", 1], ["Camera, no challenge", 0.5],
                    ["Uploaded file", 0.25]].map(([label, mult]) => (
                    <div key={label as string} className="flex items-center gap-3">
                      <span className="text-sm text-ink-2 w-[160px] shrink-0">{label as string}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                        <span className="block h-full bg-accent transition-[width] duration-500 ease-out"
                              style={{ width: `${(mult as number) * 100}%` }} />
                      </div>
                      <span className="text-sm font-medium tabular w-[70px] text-right">
                        {rupees(cap * (mult as number))}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-ink-3 mt-3">
                  You do not configure this. Weaker evidence simply unlocks less, so an
                  unverifiable upload can never do what a live capture can.
                </p>
              </div>

              <div className="flex gap-3">
                <Button size="lg" onClick={() => setStep(1)}>Back</Button>
                <Button variant="primary" size="lg" onClick={() => advance(3)} disabled={busy}>
                  {busy ? "Saving…" : "Continue"}
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <header>
                <Eyebrow>Install</Eyebrow>
                <h1 className="mt-2 text-3xl font-bold tracking-tighter">
                  Add one line to your order page.
                </h1>
                <p className="mt-3 text-md text-ink-2">
                  This puts &ldquo;Report an issue&rdquo; on every order. The widget opens in its
                  own frame, so your styling cannot break it and the camera permission belongs to
                  us rather than to your page.
                </p>
              </header>

              <div className="bg-surface-1 border border-line-subtle rounded-lg p-5">
                <pre className="font-mono text-sm bg-surface-2 border border-line rounded-md p-3.5 overflow-x-auto text-ink-2 whitespace-pre-wrap">
                  {snippet}
                </pre>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" onClick={() => {
                    navigator.clipboard.writeText(snippet);
                    toast("Copied. Paste it into your order page template.");
                  }}>Copy snippet</Button>
                  <Button size="sm" onClick={() => window.open("/docs", "_blank")}>
                    Full integration guide
                  </Button>
                  <Button size="sm" onClick={() => window.open("/docs#llms", "_blank")}>
                    Hand it to your AI assistant
                  </Button>
                </div>
              </div>

              <div className="bg-surface-1 border border-line-subtle rounded-lg p-5">
                <Eyebrow>Custom backend?</Eyebrow>
                <p className="text-base text-ink-2 mt-1.5">
                  If your store is not on a platform we speak natively, implement six endpoints
                  and we do the rest. The dashboard shows a live health check of each one, so you
                  always know what is wired and what is falling back.
                </p>
              </div>

              <div className="flex gap-3">
                <Button size="lg" onClick={() => setStep(2)}>Back</Button>
                <Button variant="primary" size="lg" onClick={() => advance(4)} disabled={busy}>
                  Continue
                </Button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="w-12 h-12 rounded-full bg-accent-soft text-accent grid place-items-center text-xl">
                ✓
              </div>
              <header>
                <h1 className="text-3xl font-bold tracking-tighter">You&rsquo;re set up.</h1>
                <p className="mt-3 text-md text-ink-2">
                  Rezo is watching your orders. Small disputes resolve on their own and you get a
                  weekly digest; anything above {rupees(cap)} pings you with a one-screen brief.
                </p>
              </header>

              <div className="bg-surface-1 border border-line-subtle rounded-lg divide-y divide-line-subtle">
                {[["Watch a dispute resolve end to end", "Open a test store", "/store"],
                  ["See the agents working in real time", "Agent console", "/console"],
                  ["Review the policy we compiled", "Policy", "/dashboard?tab=policy"]].map(
                  ([label, cta, href]) => (
                    <div key={label} className="flex items-center justify-between gap-3 p-4">
                      <span className="text-base">{label}</span>
                      <Button size="sm" onClick={() => (window.location.href = href)}>{cta}</Button>
                    </div>
                  ))}
              </div>

              <Button variant="primary" size="lg" onClick={finish}>Go to dashboard</Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
