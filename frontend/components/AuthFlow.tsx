"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError, tokenStore } from "@/lib/api";
import { Badge, Button, Field, Input, Select } from "./ui";

type Step = "email" | "code" | "store" | "no-account" | "already-have";

/**
 * One flow for signing in and creating a workspace.
 *
 * The address identifies a merchant, so we ask for it first and let the server
 * say whether it already knows it. That single fact removes the two dead ends
 * this kind of form usually has: someone signing in to an account that was
 * never created, and someone signing up on an address that already has one.
 * Neither gets an error — each gets the door they actually wanted.
 */
export function AuthFlow({ intent }: { intent: "signin" | "signup" }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [category, setCategory] = useState("clothing");
  const [creating, setCreating] = useState(intent === "signup");
  const [localCode, setLocalCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const friendly = (e: unknown) => {
    if (e instanceof ApiError) {
      if (e.status >= 500) return "Our end had a problem. Give it a moment and try again.";
      return e.message;
    }
    if (e instanceof TypeError) {
      return "We couldn't reach our servers. Check your connection and try again.";
    }
    return e instanceof Error ? e.message : "Something went wrong. Try again.";
  };

  /** Ask for a code, then route on what the server says about the address. */
  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.requestCode(email);
      setLocalCode(res.local_code ?? null);
      setCooldown(30);
      setCreating(res.is_new_account);

      if (res.is_new_account && intent === "signin") setStep("no-account");
      else if (!res.is_new_account && intent === "signup") setStep("already-have");
      else setStep("code");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.requestCode(email);
      setLocalCode(res.local_code ?? null);
      setCooldown(30);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.verifyCode({
        email, code, name: name.trim(), store_name: storeName.trim(), category,
      });
      tokenStore.set(res.token);
      window.location.href =
        res.account.onboarding_step < 99 ? "/onboarding" : "/dashboard";
    } catch (e) {
      const message = friendly(e);
      // The code was right; we simply still need a store name.
      if (message.toLowerCase().includes("store name")) {
        setStep("store");
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  /* ── the address ──────────────────────────────────────────────────────── */
  if (step === "email") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter">
            {intent === "signup" ? "Create your workspace" : "Sign in"}
          </h1>
          <p className="text-ink-2 mt-2">
            We&rsquo;ll email you a six digit code. Nothing to remember, nothing to lose.
          </p>
        </div>

        <form className="flex flex-col gap-4"
              onSubmit={(e) => { e.preventDefault(); start(); }}>
          <Field label="Work email" error={error ?? undefined}>
            <Input type="email" required autoFocus autoComplete="email" value={email}
                   onChange={(e) => { setEmail(e.target.value); setError(null); }}
                   placeholder="you@yourstore.com" />
          </Field>
          <Button type="submit" variant="primary" size="lg" block
                  disabled={busy || !email.includes("@")}>
            {busy ? "Sending…" : "Continue with email"}
          </Button>
        </form>

        <p className="text-sm text-ink-3">
          {intent === "signup" ? (
            <>Already have a workspace?{" "}
              <a href="/signin" className="text-accent no-underline hover:underline">Sign in</a>
            </>
          ) : (
            <>New here?{" "}
              <a href="/signup" className="text-accent no-underline hover:underline">
                Create a workspace
              </a>
            </>
          )}
        </p>
      </div>
    );
  }

  /* ── signing in to an address with no account ─────────────────────────── */
  if (step === "no-account") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Badge>No account yet</Badge>
          <h1 className="text-2xl font-bold tracking-tighter mt-3">
            We don&rsquo;t have a workspace for that email.
          </h1>
          <p className="text-ink-2 mt-2">
            Nothing is set up for <b className="text-ink">{email}</b>. You can create one now —
            it takes about three minutes, and the code we just sent still works.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" block
                  onClick={() => { setCreating(true); setStep("code"); }}>
            Create a workspace with this email
          </Button>
          <Button size="lg" block onClick={() => { setStep("email"); setError(null); }}>
            Try a different email
          </Button>
        </div>
        <p className="text-sm text-ink-3">
          If you expected an account here, it may be under another address — a personal one, or
          a colleague&rsquo;s.
        </p>
      </div>
    );
  }

  /* ── signing up on an address that already has one ────────────────────── */
  if (step === "already-have") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Badge tone="accent">Welcome back</Badge>
          <h1 className="text-2xl font-bold tracking-tighter mt-3">
            You already have a workspace.
          </h1>
          <p className="text-ink-2 mt-2">
            <b className="text-ink">{email}</b> is already set up. The code we just sent takes
            you straight back into it, so there is nothing to redo.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" block
                  onClick={() => { setCreating(false); setStep("code"); }}>
            Sign in instead
          </Button>
          <Button size="lg" block onClick={() => { setStep("email"); setError(null); }}>
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  /* ── store details, for a new workspace ───────────────────────────────── */
  if (step === "store") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter">Tell us about your store</h1>
          <p className="text-ink-2 mt-2">
            We use this to draft your starting policy. You change every line of it in the next
            step.
          </p>
        </div>

        <form className="flex flex-col gap-4"
              onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <Field label="Store name">
            <Input required autoFocus value={storeName}
                   onChange={(e) => setStoreName(e.target.value)}
                   placeholder="Rehana's Closet" />
          </Field>
          <Field label="Your name" hint="So the dashboard can show who approved what.">
            <Input value={name} onChange={(e) => setName(e.target.value)}
                   autoComplete="name" placeholder="Rehana K" />
          </Field>
          <Field label="What do you sell?" error={error ?? undefined}
                 hint="This only sets your starting return windows.">
            <Select value={category} onChange={setCategory} options={[
              { value: "clothing", label: "Clothing and accessories", hint: "7 day window" },
              { value: "electronics", label: "Electronics and gadgets", hint: "10 day window" },
              { value: "home", label: "Home and furnishing", hint: "5 day window" },
              { value: "beauty", label: "Beauty and personal care", hint: "5 day window" },
              { value: "general", label: "Something else", hint: "7 day window" },
            ]} />
          </Field>
          <Button type="submit" variant="primary" size="lg" block
                  disabled={busy || !storeName.trim()}>
            {busy ? "Setting up…" : "Create workspace"}
          </Button>
        </form>
      </div>
    );
  }

  /* ── the code ─────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tighter">Check your email</h1>
        <p className="text-ink-2 mt-2">
          We sent a six digit code to <b className="text-ink">{email}</b>. It expires in ten
          minutes.
        </p>
      </div>

      {localCode && (
        <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
          <div className="text-xs text-ink-3">
            No mail provider is connected in this build, so here is your code:
          </div>
          <div className="font-mono text-xl tracking-[0.35em] mt-1">{localCode}</div>
        </div>
      )}

      <form className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (creating && !storeName.trim()) { setStep("store"); return; }
              verify();
            }}>
        <Field label="Six digit code" error={error ?? undefined}>
          <Input ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                 value={code}
                 onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setError(null); }}
                 placeholder="••••••"
                 className="text-center text-xl tracking-[0.5em] font-mono h-14" />
        </Field>
        <Button type="submit" variant="primary" size="lg" block
                disabled={busy || code.length < 6}>
          {busy ? "Checking…" : creating ? "Continue" : "Sign in"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-sm">
        <button onClick={() => { setStep("email"); setCode(""); setError(null); }}
                className="text-ink-2 hover:text-ink">
          Use a different email
        </button>
        <span className="text-ink-4">·</span>
        <button onClick={resend} disabled={cooldown > 0 || busy}
                className="text-ink-2 hover:text-ink disabled:text-ink-4">
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </div>
  );
}
