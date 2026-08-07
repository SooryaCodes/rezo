/**
 * Typed client for the Rezo API.
 *
 * Everything goes through one `request` so the auth header, error shape and
 * JSON handling are defined once. Errors carry the server's message, because a
 * guardrail refusal ("Rs 4,200 exceeds the autonomous limit") is information the
 * operator needs, not a stack trace to swallow.
 */

export type Outcome =
  | "full_refund" | "partial_refund" | "replacement"
  | "coupon" | "reject" | "escalate";

export type EvidenceTier = "attested_live" | "camera_unattested" | "upload" | "none";

export interface Store {
  id: string;
  name: string;
  category: string;
  auto_approve_cap: number;
  fraud_threshold?: number;
  capabilities?: Record<string, boolean>;
  connector?: string;
  publishable_key?: string;
  secret_key?: string;
  onboarded?: boolean;
}

export interface Account {
  id: string;
  email: string;
  name: string;
  store_id: string;
  onboarding_step: number;
  is_sample?: boolean;
}

export interface OrderItem {
  sku: string; title: string; variant?: string;
  qty: number; price: number; image?: string; serial?: string;
}

export interface Order {
  order_id: string; store_id: string; store_name?: string;
  buyer_id: string; buyer_name?: string; buyer?: { id: string; name: string; language?: string };
  items: OrderItem[]; total: number; status: string; payment_method: string;
  placed_at: string; delivered_at: string | null;
  courier?: string; tracking_id?: string;
  shipment_events?: { at: string; status: string; note?: string }[];
}

export interface AgentEvent {
  seq: number; at: string; dispute_id: string;
  agent: string; kind: "start" | "finding" | "tool" | "gate" | "decision" | "error";
  message: string; data: Record<string, any>;
}

export interface Dispute {
  dispute_id: string;
  store: Partial<Store>;
  buyer: { id: string; name: string; language?: string };
  order_id: string;
  claim_type: string;
  claim_value: number;
  status: string;
  escalation_level: number;
  created_at: string;
  closed_at: string | null;
  messages: { role: string; content: string; at: string; agent?: string }[];
  capture: { nonce?: string; steps?: string[]; expires_at?: string; ttl_seconds?: number };
  evidence: {
    tier?: EvidenceTier; verified?: boolean; confidence?: number;
    forensics_flags?: string[]; forensics_summary?: string; notes?: string;
    challenge_satisfied?: boolean | null; media?: string[];
  };
  policy: {
    eligible?: boolean; clause_id?: string; clause_title?: string; clause_text?: string;
    policy_version?: string; reason?: string; verified_in_code?: boolean;
    days_since_delivery?: number | null;
  };
  fraud: { score?: number; signals?: string[]; raw_signals?: Record<string, any> };
  decision: { outcome?: Outcome; amount?: number; rationale?: string; confidence?: number;
              alternatives_considered?: string[] };
  guardrail: { route?: string; reasons?: string[]; effective_cap?: number; store_cap?: number };
  dossier: { headline?: string; why_you_are_seeing_this?: string; summary?: string[];
             recommendation?: string };
  execution: { steps?: string[]; buyer_message?: string; blocked?: Record<string, any> };
  usage: { calls?: number; cost_inr?: number; per_agent?: Record<string, any> };
  refund: { amount: number; method: string; reference: string; approved_by: string } | null;
  evidence_files: { tier: string; path: string; hash: string }[];
  audit: { at: string; actor: string; action: string; detail: Record<string, any> }[];
  events: AgentEvent[];
  // present on the response that just advanced the graph
  pending?: { type: string; challenge?: Dispute["capture"]; dossier?: Dispute["dossier"] } | null;
  awaiting?: string | null;
  done?: boolean;
}

export interface DisputeRow {
  dispute_id: string; store_id: string; order_id: string; buyer_name: string;
  claim_type: string; claim_value: number; status: string; escalation_level: number;
  outcome: Outcome | null; fraud_score: number | null; created_at: string; opened_by: string;
}

export interface Analytics {
  disputes_total: number; closed: number; auto_resolved: number;
  auto_resolution_rate: number; awaiting_human: number; fraud_flagged: number;
  fraud_value_blocked: number; refunded_total: number; resolved_without_refund: number;
  llm_cost_inr: number; cost_per_dispute_inr: number;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "rezo-token";

export const tokenStore = {
  get: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.detail || body.message || message;
    } catch {
      /* the body was not JSON; the status line is all we have */
    }
    throw new ApiError(message, res.status);
  }
  return res.status === 204 ? (null as T) : res.json();
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  // ── auth ──────────────────────────────────────────────────────────────
  signup: (b: { email: string; password: string; name: string; store_name: string; category: string }) =>
    post<{ token: string; account: Account; store: Store }>("/auth/signup", b),
  signin: (b: { email: string; password: string }) =>
    post<{ token: string; account: Account; store: Store }>("/auth/signin", b),
  sample: (store_id = "st_rehana") =>
    post<{ token: string; account: Account; store: Store; sample: boolean }>("/auth/sample", { store_id }),
  me: () => request<{ account: Account; store: Store }>("/auth/me"),
  signout: () => post<{ signed_out: boolean }>("/auth/signout"),
  setOnboardingStep: (step: number) => post<{ onboarding_step: number }>("/auth/onboarding", { step }),

  // ── stores ────────────────────────────────────────────────────────────
  stores: () => request<Store[]>("/stores"),
  store: (id: string) => request<Store>(`/stores/${id}`),
  updateStore: (id: string, body: Partial<Store>) =>
    request<Store>(`/stores/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  policy: (id: string) =>
    request<{ version: string; effective_from: string; clauses: any[] }[]>(`/stores/${id}/policy`),
  publishPolicy: (id: string, clauses: any[]) =>
    request<{ published: boolean; version: string }>(`/stores/${id}/policy`, {
      method: "PUT", body: JSON.stringify({ clauses }),
    }),
  analytics: (id: string) => request<Analytics>(`/stores/${id}/analytics`),
  integration: (id: string) => request<any>(`/integration/${id}`),

  // ── orders ────────────────────────────────────────────────────────────
  orders: (params: Record<string, string> = {}) =>
    request<Order[]>(`/orders?${new URLSearchParams(params)}`),
  order: (id: string) => request<Order>(`/orders/${id}`),

  // ── disputes ──────────────────────────────────────────────────────────
  disputes: (params: Record<string, string> = {}) =>
    request<DisputeRow[]>(`/disputes?${new URLSearchParams(params)}`),
  dispute: (id: string) => request<Dispute>(`/disputes/${id}`),
  openDispute: (b: { store_id: string; order_id: string; message: string }) =>
    post<Dispute>("/disputes", b),
  sendMessage: (id: string, content: string) =>
    post<Dispute>(`/disputes/${id}/messages`, { content }),
  submitEvidence: (id: string, form: FormData) =>
    request<Dispute>(`/disputes/${id}/evidence`, { method: "POST", body: form }),
  approve: (id: string, b: {
    approved: boolean; by: string; note?: string;
    override_outcome?: string | null; override_amount?: number | null;
  }) => post<Dispute>(`/disputes/${id}/approve`, b),
  events: (id: string, since = 0) =>
    request<{ events: AgentEvent[] }>(`/disputes/${id}/events?since=${since}`),

  // ── platform ──────────────────────────────────────────────────────────
  watchdog: () => post<any>("/watchdog/run"),
  platformQueue: () => request<DisputeRow[]>("/platform/queue"),
  resetDemo: () => post<any>("/demo/reset"),
};

/**
 * Live agent stream, with a polling fallback.
 *
 * A venue network that blocks WebSockets should degrade the demo, not end it,
 * so the socket is the fast path and polling is the safety net.
 */
export function streamEvents(disputeId: string, onBatch: (events: AgentEvent[]) => void) {
  let cursor = 0;
  let closed = false;
  let socket: WebSocket | undefined;

  const poll = () => {
    if (closed) return;
    api.events(disputeId, cursor)
      .then(({ events }) => {
        if (events.length) { cursor += events.length; onBatch(events); }
      })
      .catch(() => undefined)
      .finally(() => { if (!closed) setTimeout(poll, 500); });
  };

  try {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${proto}://${location.host}/api/disputes/${disputeId}/stream`);
    socket.onmessage = (msg) => {
      const { events } = JSON.parse(msg.data) as { events: AgentEvent[] };
      if (events?.length) { cursor += events.length; onBatch(events); }
    };
    socket.onerror = () => { try { socket?.close(); } catch {} poll(); };
  } catch {
    poll();
  }

  return () => { closed = true; try { socket?.close(); } catch {} };
}
