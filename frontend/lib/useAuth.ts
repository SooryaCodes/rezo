"use client";

import { useEffect, useState } from "react";
import { api, tokenStore, type Account, type Store } from "./api";

export interface Session {
  account: Account;
  store: Store;
}

type State =
  | { status: "loading"; session: null }
  | { status: "authed"; session: Session }
  | { status: "anonymous"; session: null };

/**
 * Resolves the signed-in account and the store it is scoped to.
 *
 * `require` sends anyone without a session to sign-in, and anyone who has not
 * finished setup back to onboarding, so no screen has to defend against a
 * half-configured store.
 */
export function useAuth({ require = true, allowUnonboarded = false } = {}) {
  const [state, setState] = useState<State>({ status: "loading", session: null });

  useEffect(() => {
    let cancelled = false;

    if (!tokenStore.get()) {
      if (require) { window.location.href = "/signin"; return; }
      setState({ status: "anonymous", session: null });
      return;
    }

    api.me()
      .then((session) => {
        if (cancelled) return;
        if (!allowUnonboarded && !session.store?.onboarded && !session.account.is_sample) {
          window.location.href = "/onboarding";
          return;
        }
        setState({ status: "authed", session });
      })
      .catch(() => {
        if (cancelled) return;
        tokenStore.clear();
        if (require) window.location.href = "/signin";
        else setState({ status: "anonymous", session: null });
      });

    return () => { cancelled = true; };
  }, [require, allowUnonboarded]);

  const signOut = async () => {
    try { await api.signout(); } catch { /* the local token is what matters */ }
    tokenStore.clear();
    window.location.href = "/";
  };

  return { ...state, signOut };
}
