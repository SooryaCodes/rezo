"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, streamEvents, type AgentEvent, type Dispute, type Order } from "@/lib/api";
import { mediaUrl, rupees, timeAgo, titleCase } from "@/lib/format";
import { Badge, Button, Input, Skeleton } from "@/components/ui";

/** What the buyer is told each agent is doing, in their words rather than ours. */
const AGENT_LABEL: Record<string, string> = {
  interaction: "Understanding the claim",
  evidence: "Checking the evidence",
  policy: "Checking the store policy",
  fraud: "Reviewing the account",
  resolution: "Deciding the outcome",
  guardrail: "Applying limits",
  escalation: "Asking the seller",
  execution: "Processing",
};

type Message = { role: "buyer" | "agent"; content: string; image?: string };
type Progress = { agent: string; label: string; done: boolean };

function WidgetInner() {
  const params = useSearchParams();
  const storeId = params.get("store") || "st_rehana";
  const orderId = params.get("order") || "ORD-2041";
  const embedded = params.get("embedded") === "1";

  const [order, setOrder] = useState<Order | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stopStream = useRef<(() => void) | null>(null);

  /* ── an open case survives a refresh ──────────────────────────────────
   * The dispute already exists on the server; losing the id in the tab was the
   * only thing that made a reload look like the conversation had been thrown
   * away. Keyed by order, so two orders keep two separate threads. */
  const threadKey = `rezo:thread:${storeId}:${orderId}`;

  useEffect(() => {
    const existing = typeof window !== "undefined"
      ? window.sessionStorage.getItem(threadKey) : null;
    if (!existing) return;
    api.dispute(existing)
      .then((d) => {
        setDispute(d);
        setMessages(d.messages
          .filter((m) => m.content)
          .map((m) => ({ role: m.role === "buyer" ? "buyer" : "agent",
                         content: m.content })));
        if (d.status !== "closed") {
          stopStream.current = streamEvents(d.dispute_id, onEvents);
        }
      })
      .catch(() => window.sessionStorage.removeItem(threadKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);

  /* ── load the order so the first message already knows the context ───── */
  useEffect(() => {
    api.order(orderId)
      .then((o) => {
        setOrder(o);
        const item = o.items[0];
        const first = (o.buyer?.name || "there").split(" ")[0];
        setMessages((current) => current.length ? current : [{
          role: "agent",
          content: `Hi ${first}. I can see your ${item?.title ?? "order"}, `
                   + `${o.order_id}. What went wrong with it?`,
        }]);
      })
      .catch((e) => setLoadError(e.message));
  }, [orderId]);

  useEffect(() => () => stopStream.current?.(), []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, progress, dispute]);

  const onEvents = useCallback((events: AgentEvent[]) => {
    setProgress((current) => {
      const next = [...current];
      for (const ev of events) {
        const label = AGENT_LABEL[ev.agent];
        if (!label) continue;
        const done = ev.kind === "finding" || ev.kind === "decision" || ev.kind === "gate";
        const existing = next.find((p) => p.agent === ev.agent);
        if (existing) existing.done ||= done;
        else next.push({ agent: ev.agent, label, done });
      }
      return next;
    });
  }, []);

  /* ── the state machine the buyer actually experiences ─────────────────── */
  const absorb = (result: Dispute) => {
    setDispute(result);
    const spoken = result.messages
      .filter((m) => m.role === "agent" && m.content)
      .map((m) => m.content);
    setMessages((current) => {
      const already = new Set(current.filter((m) => m.role === "agent").map((m) => m.content));
      const fresh = spoken.filter((c) => !already.has(c)).map((content) => ({
        role: "agent" as const, content,
      }));
      return [...current, ...fresh];
    });
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setMessages((m) => [...m, { role: "buyer", content: text }]);
    setBusy(true);
    try {
      if (!dispute) {
        const result = await api.openDispute({ store_id: storeId, order_id: orderId, message: text });
        window.sessionStorage.setItem(threadKey, result.dispute_id);
        stopStream.current = streamEvents(result.dispute_id, onEvents);
        absorb(result);
      } else {
        absorb(await api.sendMessage(dispute.dispute_id, text));
      }
    } catch (e) {
      setMessages((m) => [...m, {
        role: "agent",
        content: e instanceof Error ? e.message : "Something went wrong. Try again in a moment.",
      }]);
    } finally {
      setBusy(false);
    }
  };

  const submitEvidence = async (form: FormData) => {
    if (!dispute) return;
    setBusy(true);
    try {
      absorb(await api.submitEvidence(dispute.dispute_id, form));
    } catch (e) {
      setMessages((m) => [...m, {
        role: "agent",
        content: e instanceof Error ? e.message : "That upload did not go through.",
      }]);
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="h-dvh grid place-items-center p-6 text-center">
        <div>
          <div className="font-semibold">We couldn&rsquo;t load this order</div>
          <p className="text-sm text-ink-3 mt-1">{loadError}</p>
        </div>
      </div>
    );
  }

  const item = order?.items[0];
  const awaitingEvidence =
    dispute?.awaiting === "evidence_required" || dispute?.status === "awaiting_evidence";
  const challenge = dispute?.pending?.challenge ?? dispute?.capture;

  return (
    <div className="flex flex-col h-dvh max-w-[460px] mx-auto border-x border-line-subtle bg-surface-1">
      {/* header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line-subtle sticky top-0 bg-surface-1 z-10">
        {order ? (
          <img src={mediaUrl(item?.image ?? "")} alt=""
               className="w-[34px] h-[34px] rounded object-cover border border-line-subtle" />
        ) : (
          <div className="w-[34px] h-[34px] rounded bg-surface-2" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{item?.title ?? "Loading…"}</div>
          <div className="text-xs text-ink-3 truncate">
            {order && `${order.order_id} · ${rupees(order.total)} · ${
              order.delivered_at ? `delivered ${timeAgo(order.delivered_at)}` : titleCase(order.status)}`}
          </div>
        </div>
        <Badge tone="accent" dot>Rezo</Badge>
      </div>

      {/* conversation */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {!order && <><Skeleton className="w-[70%]" /><Skeleton className="w-[45%]" /></>}

        {messages.map((m, i) => (
          m.image ? (
            <img key={i} src={m.image} alt="Photo you sent"
                 className="self-end max-w-[62%] rounded-lg rounded-br-sm border border-line-subtle" />
          ) : (
            <div key={i} className={
              m.role === "buyer"
                ? "self-end max-w-[86%] px-3 py-2 rounded-lg rounded-br-sm bg-action text-action-ink text-base whitespace-pre-wrap"
                : "self-start max-w-[86%] px-3 py-2 rounded-lg rounded-bl-sm bg-surface-2 text-base whitespace-pre-wrap"
            }>
              {m.content}
            </div>
          )
        ))}

        {/* Something has to move while eight agents think, or a working system
            reads as a hung one. */}
        {busy && (
          <div className="self-start flex items-center gap-1.5 px-3 py-2.5 rounded-lg
                          rounded-bl-sm bg-surface-2">
            {[0, 1, 2].map((n) => (
              <span key={n}
                    className="h-1.5 w-1.5 rounded-full bg-ink-3 animate-bounce"
                    style={{ animationDelay: `${n * 140}ms`, animationDuration: "900ms" }} />
            ))}
          </div>
        )}

        {progress.length > 0 && (
          <div className="border border-line-subtle rounded-md overflow-hidden divide-y divide-line-subtle">
            {progress.map((p) => (
              <div key={p.agent}
                   className={`flex items-center gap-2 px-3 py-2 text-sm ${
                     p.done ? "bg-surface-1" : "bg-accent-soft"}`}>
                <span className="w-3.5 text-center text-accent">
                  {p.done ? "✓" : (
                    <span className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
                  )}
                </span>
                <span className={`flex-1 ${p.done ? "" : "text-ink-2"}`}>{p.label}</span>
                {!p.done && <span className="text-xs text-ink-3">working</span>}
              </div>
            ))}
          </div>
        )}

        {awaitingEvidence && challenge?.steps && (
          <CaptureStage challenge={challenge} onSubmit={submitEvidence} busy={busy}
                        onPreview={(url) => setMessages((m) => [...m, {
                          role: "buyer", content: "", image: url }])} />
        )}

        {dispute?.status === "closed" && <Decision dispute={dispute} />}

        {(dispute?.status === "awaiting_seller_approval" ||
          dispute?.status === "awaiting_platform_review") && (
          <div className="border border-line-strong rounded-lg p-4 bg-surface-1">
            <Badge tone="attention">Being reviewed</Badge>
            <p className="text-sm mt-2">
              This one is above what I can settle on my own, so a person is looking at it now.
              You&rsquo;ll hear back within about two hours, and everything I checked is attached
              for them.
            </p>
          </div>
        )}
      </div>

      {/* composer */}
      <div className="flex gap-2 px-4 py-3 border-t border-line-subtle bg-surface-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Describe what went wrong…"
          disabled={busy || !order}
          autoComplete="off"
        />
        <Button variant="primary" onClick={send} disabled={busy || !draft.trim()}>Send</Button>
      </div>

      {embedded && (
        <button
          onClick={() => window.parent.postMessage({ type: "rezo:close" }, "*")}
          className="sr-only"
        >
          Close
        </button>
      )}
    </div>
  );
}

/* ── live capture ────────────────────────────────────────────────────────── */

function CaptureStage({ challenge, onSubmit, onPreview, busy }: {
  challenge: NonNullable<Dispute["capture"]>;
  onSubmit: (form: FormData) => void;
  onPreview: (url: string) => void;
  busy: boolean;
}) {
  // A challenge with no steps would render a camera and no instruction, which
  // is a dead end: the buyer sees themselves on screen and has nothing to press.
  const steps = (challenge.steps?.length ? challenge.steps
                 : ["Show the problem area up close",
                    "Now show the whole item with its label"]);
  const [step, setStep] = useState(0);
  const [frames, setFrames] = useState<File[]>([]);
  // Consent first. Calling getUserMedia on arrival throws a browser permission
  // prompt at someone who has not been told why, which is both a bad experience
  // and the fastest way to have the camera path refused forever.
  const [consented, setConsented] = useState(false);
  const [cameraReady, setCameraReady] = useState<boolean | null>(null);
  const [left, setLeft] = useState<number>(challenge.ttl_seconds ?? 300);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!consented) return;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: "environment" } } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraReady(true);
      })
      .catch(() => {
        // Denied, unavailable, or blocked by the browser. Whatever the reason,
        // the buyer must not be left looking at a panel that never changes.
        if (!cancelled) { setCameraReady(false); setConsented(true); }
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [consented]);

  useEffect(() => {
    if (!challenge.expires_at) return;
    const deadline = new Date(challenge.expires_at).getTime();
    const tick = () => setLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [challenge.expires_at]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `frame_${step + 1}.jpg`, { type: "image/jpeg" });
      const next = [...frames, file];
      setFrames(next);
      onPreview(URL.createObjectURL(file));
      if (step + 1 >= steps.length) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const form = new FormData();
        next.forEach((f) => form.append("files", f));
        form.append("source", "live_capture");
        form.append("nonce", challenge.nonce ?? "");
        onSubmit(form);
      } else {
        setStep(step + 1);
      }
    }, "image/jpeg", 0.9);
  };

  /** The buyer's own file. Goes in as an upload, which is the weakest tier:
   *  provenance cannot be established for something that arrived from a camera
   *  roll, so it unlocks less and is more likely to be read by a person. */
  const uploadFile = (file: File | undefined) => {
    if (!file) return;
    onPreview(URL.createObjectURL(file));
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const form = new FormData();
    form.append("files", file, file.name);
    form.append("source", "upload");
    onSubmit(form);
  };

  const useSample = (sample: string, source: "live_capture" | "upload") => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const form = new FormData();
    form.append("sample", sample);
    form.append("source", source);
    if (source === "live_capture") form.append("nonce", challenge.nonce ?? "");
    onSubmit(form);
  };

  const mmss = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;

  if (!consented) {
    return (
      <div className="rounded-2xl border border-line bg-surface-1 overflow-hidden">
        <div className="px-4 py-4">
          <div className="font-medium">Can I open your camera?</div>
          <p className="text-sm text-ink-2 mt-1">
            Seeing the problem is what lets me settle this now instead of passing it to
            someone tomorrow. It takes about twenty seconds.
          </p>
          <ul className="mt-3 flex flex-col gap-2 list-none p-0">
            {["Used once, for this claim only, and never opened again afterwards",
              "Nothing is recorded until you press capture",
              "Deleted when the case closes"].map((line) => (
              <li key={line} className="flex gap-2.5 text-sm text-ink-2">
                <span className="text-ink-4 mt-0.5">·</span>{line}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <Button variant="primary" className="flex-1" onClick={() => setConsented(true)}>
            Allow camera
          </Button>
          <label className="flex-1">
            <input type="file" accept="image/*" className="sr-only" disabled={busy}
                   onChange={(e) => uploadFile(e.target.files?.[0])} />
            <span className="flex h-9 cursor-pointer items-center justify-center rounded-lg
                             border border-line-strong bg-surface-2 px-3 text-sm text-ink
                             shadow-[0_1px_2px_rgba(17,17,20,.05)]">
              Send a photo instead
            </span>
          </label>
        </div>
        <p className="px-4 pb-4 text-xs text-ink-3">
          A sent photo still works — it just unlocks less on its own, so a person may take
          a look before anything is paid out.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-line rounded-2xl overflow-hidden bg-surface-2">
      {cameraReady !== false && (
        <video ref={videoRef} playsInline muted autoPlay
               className="w-full max-h-[46vh] aspect-[3/4] object-cover bg-black block" />
      )}

      <div className="px-4 py-3 flex flex-col gap-1.5 border-t border-line bg-surface-1">
        <div className="text-2xs font-bold tracking-wide uppercase text-ink-3">
          Step {step + 1} of {steps.length} · <span className="tabular">expires in {mmss}</span>
        </div>
        <div className="text-md font-medium">{steps[step]}</div>
        <p className="text-xs text-ink-3">
          Your camera opens here and we ask for this in the moment, so a photo saved earlier
          cannot answer it.
        </p>

        {cameraReady !== false && (
          <Button variant="primary" block onClick={capture}
                  disabled={busy || left === 0 || cameraReady === null}
                  className="mt-1">
            {cameraReady === null ? "Opening your camera…" : `Capture step ${step + 1}`}
          </Button>
        )}
        {cameraReady === false && (
          <div className="mt-1 rounded-lg border border-line-strong bg-surface-1 p-3">
            <p className="text-sm font-medium text-ink">Your camera didn&rsquo;t open</p>
            <p className="mt-1 text-sm text-ink-2">
              Your browser blocked it, or another app is using it. Send a photo instead:
              it still works, it just unlocks less on its own, so a person may look
              before anything is paid out.
            </p>
          </div>
        )}

        <div className="mt-1 flex gap-2">
          <label className="flex-1">
            <input type="file" accept="image/*" capture="environment" className="sr-only"
                   disabled={busy} onChange={(e) => uploadFile(e.target.files?.[0])} />
            <span className="flex h-9 cursor-pointer items-center justify-center rounded-lg
                             border border-line-strong bg-surface-2 px-3 text-sm text-ink">
              Take a photo
            </span>
          </label>
          <label className="flex-1">
            <input type="file" accept="image/*" className="sr-only" disabled={busy}
                   onChange={(e) => uploadFile(e.target.files?.[0])} />
            <span className="flex h-9 cursor-pointer items-center justify-center rounded-lg
                             border border-line-strong bg-surface-2 px-3 text-sm text-ink">
              Choose a file
            </span>
          </label>
        </div>

        <div className="mt-2 border-t border-line pt-2">
          <p className="text-2xs uppercase tracking-wide text-ink-3">
            No camera here? Try it with our samples
          </p>
          <div className="flex gap-2 mt-1.5">
            <Button variant="ghost" size="sm" className="flex-1" disabled={busy}
                    onClick={() => useSample("evidence_authentic.jpg", "live_capture")}>
              A real photo
            </Button>
            <Button variant="ghost" size="sm" className="flex-1" disabled={busy}
                    onClick={() => useSample("evidence_generated.png", "upload")}>
              An AI-generated one
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── the decision, with its reasoning ────────────────────────────────────── */

function Decision({ dispute }: { dispute: Dispute }) {
  const d = dispute.decision ?? {};
  const p = dispute.policy ?? {};
  const paid = d.outcome === "full_refund" || d.outcome === "partial_refund";

  return (
    <div className="flex flex-col gap-3">
      <div className="border border-line rounded-lg overflow-hidden">
        <div className="p-4 bg-accent-soft flex flex-col gap-1">
          <span className="text-2xs font-bold tracking-wide uppercase text-ink-3">
            {paid ? "Refund approved" : titleCase(d.outcome)}
          </span>
          {paid && <div className="text-2xl font-bold tracking-tighter tabular">{rupees(d.amount)}</div>}
          <p className="text-sm">{d.rationale}</p>
        </div>

        {p.clause_id && (
          <div className="m-4 mt-3 px-3 py-2.5 border-l-2 border-accent bg-surface-2 rounded-r text-sm text-ink-2">
            <b className="text-ink font-semibold">Clause {p.clause_id}</b>
            {p.clause_title ? ` — ${p.clause_title}` : ""}
            <br />
            {(p.clause_text ?? "").slice(0, 220)}
            {(p.clause_text ?? "").length > 220 ? "…" : ""}
          </div>
        )}

        {dispute.refund && (
          <div className="m-4 mt-0 px-3 py-2.5 border-l-2 border-accent-line bg-surface-2 rounded-r text-sm text-ink-2">
            Sent to your original payment method via {dispute.refund.method.replace("_", " ")}.
            Reference <span className="font-mono text-xs">{dispute.refund.reference}</span>.
          </div>
        )}
      </div>

      {dispute.evidence_files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-bold tracking-wide uppercase text-ink-3">
            What you showed us
          </span>
          <div className="flex gap-1.5 flex-wrap">
            {dispute.evidence_files.map((f) => (
              <img key={f.path} src={mediaUrl(f.path)} alt="evidence"
                   className="w-14 h-14 rounded-sm object-cover border border-line" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WidgetPage() {
  return (
    <Suspense fallback={<div className="p-4"><Skeleton className="w-1/2" /></div>}>
      <WidgetInner />
    </Suspense>
  );
}
