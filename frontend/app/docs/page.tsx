"use client";

import { useEffect, useState } from "react";
import { api, tokenStore } from "@/lib/api";
import {
  CUSTOM_TRIGGER, ENDPOINT_STUB, FRONTEND_SNIPPET, OPTIONAL_ENDPOINTS,
  PLATFORMS, REQUIRED_ENDPOINTS, SIGNATURE_CODE, buildLlmsText, type PlatformId,
} from "@/lib/snippets";
import { Reveal } from "@/components/motion";
import { Badge, Brand, Button, Eyebrow, LinkButton, ThemeToggle, useToast } from "@/components/ui";

type Mode = "guide" | "llms";

function CodeBlock({ code, file, onCopy }: {
  code: string; file?: string; onCopy: () => void;
}) {
  return (
    <div className="rounded-md border border-line overflow-hidden bg-surface-2">
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-line">
        <span className="font-mono text-xs text-ink-3">{file ?? "snippet"}</span>
        <Button size="sm" variant="ghost" onClick={onCopy}>Copy</Button>
      </div>
      <pre className="p-3.5 overflow-x-auto font-mono text-sm text-ink-2 leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

/** What the merchant's own system gains at each step. */
function ChangeList({ items }: { items: [string, string][] }) {
  return (
    <div className="rounded-md border border-line-subtle divide-y divide-line-subtle">
      {items.map(([what, where]) => (
        <div key={what} className="flex gap-3 px-3.5 py-2.5">
          <span className="text-ok shrink-0">+</span>
          <div className="min-w-0">
            <div className="text-base">{what}</div>
            <div className="font-mono text-xs text-ink-3 truncate">{where}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DocsPage() {
  const [mode, setMode] = useState<Mode>("guide");
  const [platform, setPlatform] = useState<PlatformId>("next");
  const [storeId, setStoreId] = useState("st_your_store");
  const [pk, setPk] = useState("pk_live_your_key");
  const toast = useToast();

  // If they are signed in, the guide shows their real keys instead of placeholders.
  useEffect(() => {
    if (!tokenStore.get()) return;
    api.me()
      .then(({ store }) => {
        setStoreId(store.id);
        if (store.publishable_key) setPk(store.publishable_key);
      })
      .catch(() => undefined);
  }, []);

  const fill = (code: string) =>
    code.replaceAll("{PUBLISHABLE_KEY}", pk).replaceAll("{STORE_ID}", storeId);

  const copy = (text: string, what = "Snippet") => {
    navigator.clipboard.writeText(text);
    toast(`${what} copied.`);
  };

  const snippet = FRONTEND_SNIPPET[platform];
  const llms = buildLlmsText(storeId, pk);

  return (
    <>
      <nav className="sticky top-0 z-40 bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur border-b border-line-subtle">
        <div className="max-w-shell mx-auto px-6 h-[60px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Brand />
            <span className="text-ink-4">/</span>
            <span className="text-ink-2">Integration</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LinkButton href="/dashboard" size="sm">Dashboard</LinkButton>
          </div>
        </div>
      </nav>

      <div className="max-w-shell mx-auto px-6 py-12">
        <header className="max-w-[720px]">
          <Eyebrow>Integration</Eyebrow>
          <h1 className="mt-2 text-3xl font-bold tracking-tighter">
            Two ways to wire this up.
          </h1>
          <p className="mt-3 text-md text-ink-2">
            Read the guide and do it yourself, or hand the context file to whatever coding
            assistant you already use and review the diff it proposes. Both describe exactly
            the same contract.
          </p>
        </header>

        {/* ── mode switch ────────────────────────────────────────────────── */}
        <div className="mt-8 grid md:grid-cols-2 gap-3 max-w-[720px]">
          {([
            ["guide", "Do it yourself", "Step by step, with the code for your stack and what changes in your app."],
            ["llms", "Hand it to your AI", "One context file to paste into Claude, Cursor or Copilot. It plans and writes the diff."],
          ] as [Mode, string, string][]).map(([id, title, body]) => (
            <button key={id} onClick={() => setMode(id)}
              className={`text-left rounded-lg border p-4 transition-all duration-base ease-out ${
                mode === id
                  ? "border-accent bg-accent-soft -translate-y-[1px] shadow-2"
                  : "border-line bg-surface-1 hover:border-line-strong hover:-translate-y-[1px]"}`}>
              <div className={`font-semibold ${mode === id ? "text-accent" : ""}`}>{title}</div>
              <p className="text-sm text-ink-2 mt-1">{body}</p>
            </button>
          ))}
        </div>

        {/* ══ guide ═══════════════════════════════════════════════════════ */}
        {mode === "guide" && (
          <div className="mt-12 flex flex-col gap-14 max-w-[820px]">
            {/* step 1 */}
            <Reveal>
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-md bg-action text-action-ink grid place-items-center text-sm font-bold shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_1px_2px_rgba(24,24,27,.25)]">1</span>
                <h2 className="text-xl font-semibold tracking-tight">
                  Put the widget on your order page
                </h2>
                <Badge tone="ok">~5 minutes</Badge>
              </div>
              <p className="mt-3 text-ink-2">
                One script tag on any page that renders a single order. It adds a
                &ldquo;Report an issue&rdquo; launcher and opens the dispute flow in an isolated
                iframe, so your CSS cannot break it and the camera permission belongs to us
                rather than to your page.
              </p>

              <div className="flex flex-wrap gap-1.5 mt-5">
                {PLATFORMS.map((p) => (
                  <button key={p.id} onClick={() => setPlatform(p.id)}
                    className={`px-2.5 py-1.5 rounded text-sm border transition-colors duration-fast ${
                      platform === p.id
                        ? "bg-accent-soft border-accent-line text-accent font-medium"
                        : "bg-surface-1 border-line text-ink-2 hover:border-line-strong"}`}>
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="mt-3">
                <CodeBlock code={fill(snippet.code)} file={snippet.file}
                           onCopy={() => copy(fill(snippet.code))} />
                <p className="text-sm text-ink-3 mt-2">{snippet.note}</p>
              </div>

              <h3 className="mt-6 font-semibold">What changes in your app</h3>
              <div className="mt-2">
                <ChangeList items={[
                  ["One script tag added", snippet.file],
                  ["A launcher appears on order pages", "no layout change; it is fixed-position"],
                  ["Nothing else touched", "no dependencies, no build step, ~4 kB"],
                ]} />
              </div>

              <details className="mt-4 group">
                <summary className="cursor-pointer text-base font-medium list-none flex items-center gap-2">
                  <span className="text-ink-3 group-open:rotate-90 transition-transform duration-fast">›</span>
                  Use your own button instead
                </summary>
                <div className="mt-3">
                  <CodeBlock code={CUSTOM_TRIGGER} file="your-template"
                             onCopy={() => copy(CUSTOM_TRIGGER)} />
                </div>
              </details>
            </Reveal>

            {/* step 2 */}
            <Reveal>
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-md bg-action text-action-ink grid place-items-center text-sm font-bold shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_1px_2px_rgba(24,24,27,.25)]">2</span>
                <h2 className="text-xl font-semibold tracking-tight">
                  Answer six questions about an order
                </h2>
                <Badge tone="warn">~1 hour</Badge>
              </div>
              <p className="mt-3 text-ink-2">
                Rezo calls your backend to check every claim against reality. Six endpoints are
                required, four are optional, and anything you have not built yet can return
                <code className="font-mono text-sm bg-surface-2 border border-line-subtle rounded px-1 mx-1">501</code>
                — we fall back rather than failing the dispute. We never hold your gateway
                credentials: your endpoint decides whether money moves.
              </p>

              <div className="mt-5 flex flex-col gap-3">
                {REQUIRED_ENDPOINTS.map((e, i) => (
                  <Reveal key={e.name} delay={i * 40}>
                    <details className="rounded-md border border-line-subtle bg-surface-1 group">
                      <summary className="cursor-pointer list-none px-4 py-3 flex flex-wrap items-center gap-2">
                        <span className="text-ink-3 group-open:rotate-90 transition-transform duration-fast">›</span>
                        <Badge>{e.method}</Badge>
                        <span className="font-mono text-sm">{e.path}</span>
                        <span className="flex-1" />
                        <span className="text-sm text-ink-3 hidden md:block">{e.name}</span>
                      </summary>
                      <div className="px-4 pb-4 pt-1">
                        <p className="text-base text-ink-2 mb-3">{e.why}</p>
                        <CodeBlock code={e.response} file="response"
                                   onCopy={() => copy(e.response, "Example")} />
                      </div>
                    </details>
                  </Reveal>
                ))}
              </div>

              <h3 className="mt-6 font-semibold">Optional, each with a fallback</h3>
              <div className="mt-2 rounded-md border border-line-subtle divide-y divide-line-subtle">
                {OPTIONAL_ENDPOINTS.map((e) => (
                  <div key={e.name} className="px-3.5 py-2.5 flex flex-wrap gap-x-3 gap-y-1 items-baseline">
                    <span className="font-mono text-sm">{e.path}</span>
                    <span className="text-sm text-ink-3">if absent: {e.fallback}</span>
                  </div>
                ))}
              </div>

              <h3 className="mt-6 font-semibold">A working stub</h3>
              <div className="mt-2">
                <CodeBlock code={ENDPOINT_STUB} file="routes/rezo.js"
                           onCopy={() => copy(ENDPOINT_STUB, "Stub")} />
              </div>

              <h3 className="mt-6 font-semibold">What changes in your app</h3>
              <div className="mt-2">
                <ChangeList items={[
                  ["A /rezo route group", "routes/rezo.js — six handlers"],
                  ["Signature middleware", "verifies every inbound call"],
                  ["An idempotency record for refunds", "your refunds table, unique on dispute_id"],
                  ["One secret in your environment", "REZO_SECRET — server side only"],
                ]} />
              </div>
            </Reveal>

            {/* step 3 */}
            <Reveal>
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-md bg-action text-action-ink grid place-items-center text-sm font-bold shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_1px_2px_rgba(24,24,27,.25)]">3</span>
                <h2 className="text-xl font-semibold tracking-tight">Verify our signature</h2>
                <Badge tone="bad">do not skip</Badge>
              </div>
              <p className="mt-3 text-ink-2">
                Every request from Rezo is signed with your secret key over{" "}
                <code className="font-mono text-sm bg-surface-2 border border-line-subtle rounded px-1">
                  {"`${timestamp}.${rawBody}`"}
                </code>. Verify against the raw bytes rather than a re-serialised object, and
                reject anything older than five minutes so a captured request cannot be replayed.
              </p>
              <div className="mt-4">
                <CodeBlock code={SIGNATURE_CODE} file="lib/rezo-signature.js"
                           onCopy={() => copy(SIGNATURE_CODE, "Verifier")} />
              </div>
            </Reveal>

            {/* step 4 */}
            <Reveal>
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-md bg-action text-action-ink grid place-items-center text-sm font-bold shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_1px_2px_rgba(24,24,27,.25)]">4</span>
                <h2 className="text-xl font-semibold tracking-tight">Watch it go green</h2>
              </div>
              <p className="mt-3 text-ink-2">
                The integration tab in your dashboard probes each endpoint live and tells you what
                answered, what returned 501, and what is unreachable. Turn one on and refresh: it
                goes green while you watch. Then start in shadow mode, where Rezo decides
                alongside your team without acting, and raise your limit when the agreement rate
                convinces you.
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <LinkButton href="/dashboard?tab=integration" variant="primary">
                  Open the health check
                </LinkButton>
                <LinkButton href="/store">Try a dispute end to end</LinkButton>
              </div>
            </Reveal>
          </div>
        )}

        {/* ══ llms ════════════════════════════════════════════════════════ */}
        {mode === "llms" && (
          <div className="mt-12 max-w-[820px] flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                Give this to your coding assistant
              </h2>
              <p className="mt-2 text-ink-2">
                One file with the whole contract: what the product does, the front-end tag, all
                ten endpoints with example payloads, the signing scheme, and the mistakes that
                matter. It is written to be read by a model that will then propose a plan and a
                diff against your repository, which you review like any other change.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => copy(llms, "Context file")}>
                Copy the context file
              </Button>
              <Button onClick={() => {
                const blob = new Blob([llms], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "rezo-llms.txt"; a.click();
                URL.revokeObjectURL(url);
              }}>Download llms.txt</Button>
            </div>

            <div className="rounded-lg border border-line-subtle bg-surface-1 p-4">
              <Eyebrow>Suggested prompt</Eyebrow>
              <p className="text-base text-ink-2 mt-2">
                Paste the file, then ask for exactly this. It keeps the assistant from guessing
                at your stack and from skipping the parts that protect you.
              </p>
              <div className="mt-3">
                <CodeBlock
                  file="prompt"
                  code={`Read the Rezo integration context I just pasted.

Then:
1. Tell me which files in this repository need to change and why.
2. Write the diff, following the conventions already in the codebase.
3. Include signature verification and make the refund endpoint idempotent.
4. Give me a test plan covering: a valid signature, an invalid signature,
   an unknown order id, and a duplicate refund request.

Do not put the secret key anywhere the browser can reach it.`}
                  onCopy={() => copy(
                    "Read the Rezo integration context I just pasted.\n\n" +
                    "Then:\n1. Tell me which files in this repository need to change and why.\n" +
                    "2. Write the diff, following the conventions already in the codebase.\n" +
                    "3. Include signature verification and make the refund endpoint idempotent.\n" +
                    "4. Give me a test plan covering: a valid signature, an invalid signature,\n" +
                    "   an unknown order id, and a duplicate refund request.\n\n" +
                    "Do not put the secret key anywhere the browser can reach it.", "Prompt")}
                />
              </div>
            </div>

            <div>
              <Eyebrow>The file</Eyebrow>
              <div className="mt-2 rounded-md border border-line overflow-hidden bg-surface-2">
                <div className="flex items-center justify-between px-3 py-2 border-b border-line">
                  <span className="font-mono text-xs text-ink-3">rezo-llms.txt</span>
                  <span className="text-xs text-ink-3">{llms.split("\n").length} lines</span>
                </div>
                <pre className="p-3.5 overflow-auto max-h-[520px] font-mono text-xs text-ink-2 leading-relaxed whitespace-pre-wrap">
                  {llms}
                </pre>
              </div>
            </div>

            <div className="rounded-lg border border-warn bg-warn-soft p-4">
              <div className="font-semibold">Review the diff before you merge it</div>
              <p className="text-base mt-1">
                An assistant writing your refund endpoint is writing code that moves money. The
                context file tells it to make that endpoint idempotent and to verify our
                signature; check that both actually appear in what it hands back.
              </p>
            </div>
          </div>
        )}
      </div>

      <footer className="border-t border-line-subtle mt-10">
        <div className="max-w-shell mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4">
          <Brand />
          <div className="flex gap-4 text-base">
            <a href="/" className="text-ink-2 hover:text-ink no-underline">Home</a>
            <a href="/dashboard" className="text-ink-2 hover:text-ink no-underline">Dashboard</a>
            <a href="/console" className="text-ink-2 hover:text-ink no-underline">Agent console</a>
          </div>
        </div>
      </footer>
    </>
  );
}
