"use client";

import { useEffect, useRef, useState } from "react";
import { api, tokenStore } from "@/lib/api";
import { Button, Field, Input, Select } from "./ui";

type Step = "email" | "code" | "store";

/**
 * One flow for signing in and signing up.
 *
 * The address is what identifies a merchant, so we ask for it first and let the
 * server tell us whether it already has an account. New merchants are asked for
 * a store name after the code has proven the address, which keeps a stranger
 * from creating workspaces on someone else's email.
 */
export function AuthFlow({ intent }: { intent: "signin" | "signup" }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [category, setCategory] = useState("clothing");
  const [isNew, setIsNew] = useState(false);
  const [localCode, setLocalCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const requestCode = async (resend = false) => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.requestCode(email);
      setIsNew(res.is_new_account);
      setLocalCode(res.local_code ?? null);
      setCooldown(30);
      if (!resend) setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send a code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.verifyCode({
        email, code,
        name: name.trim(),
        store_name: storeName.trim(),
        category,
      });
      tokenStore.set(res.token);
      window.location.href =
        res.account.onboarding_step < 99 ? "/onboarding" : "/dashboard";
    } catch (e) {
      const message = e instanceof Error ? e.message : "That did not work";
      // The code was right, we just still need the store name.
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

  const submitCode = () => {
    if (isNew && !storeName.trim()) { setStep("store"); return; }
    verify();
  };

  /* ── email ────────────────────────────────────────────────────────────── */
  if (step === "email") {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter">
            {intent === "signup" ? "Create your workspace" : "Sign in"}
          </h1>
          <p className="text-ink-2 mt-1.5">
            We&rsquo;ll email you a six digit code. No password to remember or lose.
          </p>
        </div>

        <form className="flex flex-col gap-4"
              onSubmit={(e) => { e.preventDefault(); requestCode(); }}>
          <Field label="Work email">
            <Input type="email" required autoFocus autoComplete="email"
                   value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="you@yourstore.com" />
          </Field>
          {error && <p className="text-sm text-bad">{error}</p>}
          <Button type="submit" variant="primary" size="lg" block disabled={busy || !email}>
            {busy ? "Sending…" : "Continue with email"}
          </Button>
        </form>

        <p className="text-sm text-ink-3">
          {intent === "signup"
            ? "Already set up? The same code signs you in."
            : "New here? The same code creates your workspace."}
        </p>
      </div>
    );
  }

  /* ── store details, for a new workspace ───────────────────────────────── */
  if (step === "store") {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter">Tell us about your store</h1>
          <p className="text-ink-2 mt-1.5">
            We use this to draft your starting policy. You get to change every line of it next.
          </p>
        </div>

        <form className="flex flex-col gap-4"
              onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <Field label="Store name">
            <Input required autoFocus value={storeName}
                   onChange={(e) => setStoreName(e.target.value)}
                   placeholder="Rehana's Closet" />
          </Field>
          <Field label="Your name">
            <Input value={name} onChange={(e) => setName(e.target.value)}
                   autoComplete="name" placeholder="Rehana K" />
          </Field>
          <Field label="What do you sell?"
                 hint="Different categories get different default return windows.">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="clothing">Clothing and accessories</option>
              <option value="electronics">Electronics and gadgets</option>
              <option value="home">Home and furnishing</option>
              <option value="beauty">Beauty and personal care</option>
              <option value="general">Something else</option>
            </Select>
          </Field>
          {error && <p className="text-sm text-bad">{error}</p>}
          <Button type="submit" variant="primary" size="lg" block
                  disabled={busy || !storeName.trim()}>
            {busy ? "Setting up…" : "Create workspace"}
          </Button>
        </form>
      </div>
    );
  }

  /* ── code ─────────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tighter">Check your email</h1>
        <p className="text-ink-2 mt-1.5">
          We sent a six digit code to <b className="text-ink">{email}</b>. It expires in
          ten minutes.
        </p>
      </div>

      {localCode && (
        <div className="rounded-md border border-warn bg-warn-soft px-3.5 py-3">
          <p className="text-sm">
            No mail provider is connected in this build, so here is your code:
            <b className="font-mono text-md ml-1.5 tracking-[0.2em]">{localCode}</b>
          </p>
        </div>
      )}

      <form className="flex flex-col gap-4"
            onSubmit={(e) => { e.preventDefault(); submitCode(); }}>
        <Field label="Six digit code">
          <Input
            ref={codeRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="••••••"
            className="text-center text-xl tracking-[0.5em] font-mono h-12"
          />
        </Field>
        {error && <p className="text-sm text-bad">{error}</p>}
        <Button type="submit" variant="primary" size="lg" block
                disabled={busy || code.length < 6}>
          {busy ? "Checking…" : isNew ? "Continue" : "Sign in"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-sm">
        <button onClick={() => { setStep("email"); setCode(""); setError(null); }}
                className="text-ink-2 hover:text-ink">
          Use a different email
        </button>
        <span className="text-ink-4">·</span>
        <button onClick={() => requestCode(true)} disabled={cooldown > 0 || busy}
                className="text-ink-2 hover:text-ink disabled:text-ink-4">
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </div>
  );
}
