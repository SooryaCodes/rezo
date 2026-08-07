/* Shared API client and small UI helpers. */

const API = (() => {
  const base = "/api";

  async function req(path, options = {}) {
    const res = await fetch(base + path, options);
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { detail = (await res.json()).detail || detail; } catch (_) {}
      throw new Error(detail);
    }
    return res.status === 204 ? null : res.json();
  }

  const json = (path, method, body) => req(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    stores: () => req("/stores"),
    store: (id) => req(`/stores/${id}`),
    updateStore: (id, body) => json(`/stores/${id}`, "PATCH", body),
    policy: (id) => req(`/stores/${id}/policy`),
    publishPolicy: (id, body) => json(`/stores/${id}/policy`, "PUT", body),
    analytics: (id) => req(`/stores/${id}/analytics`),

    orders: (params = {}) => req("/orders?" + new URLSearchParams(params)),
    order: (id) => req(`/orders/${id}`),

    disputes: (params = {}) => req("/disputes?" + new URLSearchParams(params)),
    dispute: (id) => req(`/disputes/${id}`),
    openDispute: (body) => json("/disputes", "POST", body),
    message: (id, content) => json(`/disputes/${id}/messages`, "POST", { content }),
    challenge: (id) => req(`/disputes/${id}/challenge`),
    approve: (id, body) => json(`/disputes/${id}/approve`, "POST", body),
    events: (id, since = 0) => req(`/disputes/${id}/events?since=${since}`),

    submitEvidence: (id, form) => req(`/disputes/${id}/evidence`, { method: "POST", body: form }),

    integration: (id) => req(`/integration/${id}`),
    watchdog: () => json("/watchdog/run", "POST"),
    platformQueue: () => req("/platform/queue"),
    reset: () => json("/demo/reset", "POST"),
  };
})();

/* Live agent stream. Falls back to polling if the socket cannot open, because
   a demo should never depend on a WebSocket surviving a venue network. */
function streamEvents(disputeId, onBatch) {
  let cursor = 0;
  let closed = false;
  let socket;

  const poll = () => {
    if (closed) return;
    API.events(disputeId, cursor)
      .then(({ events }) => {
        if (events.length) { cursor += events.length; onBatch(events); }
      })
      .catch(() => {})
      .finally(() => !closed && setTimeout(poll, 500));
  };

  try {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    socket = new WebSocket(`${proto}://${location.host}/api/disputes/${disputeId}/stream`);
    socket.onmessage = (msg) => {
      const { events } = JSON.parse(msg.data);
      if (events && events.length) { cursor += events.length; onBatch(events); }
    };
    socket.onerror = () => { try { socket.close(); } catch (_) {} poll(); };
  } catch (_) {
    poll();
  }

  return () => { closed = true; if (socket) try { socket.close(); } catch (_) {} };
}

/* ── formatting ────────────────────────────────────────────────────────── */
const rupees = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const titleCase = (s) => (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function timeAgo(iso) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function outcomeBadge(outcome) {
  if (!outcome) return '<span class="badge badge-none">Open</span>';
  const map = {
    full_refund: ["badge-ok", "Refunded"],
    partial_refund: ["badge-ok", "Partial refund"],
    replacement: ["badge-ok", "Replacement"],
    coupon: ["badge-ok", "Credit"],
    reject: ["badge-none", "Declined"],
    escalate: ["badge-warn", "Needs review"],
  };
  const [cls, label] = map[outcome] || ["badge-none", titleCase(outcome)];
  return `<span class="badge ${cls}">${label}</span>`;
}

function statusBadge(status) {
  const map = {
    closed: ["badge-ok", "Resolved"],
    awaiting_seller_approval: ["badge-warn", "Needs you"],
    awaiting_platform_review: ["badge-warn", "Platform review"],
    awaiting_evidence: ["badge-live", "Awaiting evidence"],
    open: ["badge-none", "Open"],
    deciding: ["badge-live", "Deciding"],
    gathering_evidence: ["badge-live", "Gathering evidence"],
  };
  const [cls, label] = map[status] || ["badge-none", titleCase(status)];
  return `<span class="badge ${cls}">${label}</span>`;
}

/* ── toasts: errors never auto-dismiss ─────────────────────────────────── */
function toast(message, kind = "ok") {
  let host = document.querySelector(".toasts");
  if (!host) {
    host = document.createElement("div");
    host.className = "toasts";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = "toast" + (kind === "err" ? " err" : "");
  el.innerHTML = `<div class="grow">${escapeHtml(message)}</div>`;
  const close = document.createElement("button");
  close.className = "btn btn-ghost btn-sm";
  close.textContent = "Dismiss";
  close.onclick = () => el.remove();
  el.appendChild(close);
  host.appendChild(el);
  if (kind !== "err") setTimeout(() => el.remove(), 5000);
}

/* ── theme: light by default, dark on request, remembered ──────────────── */
(function theme() {
  const saved = localStorage.getItem("rezo-theme");
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");

  window.toggleTheme = () => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (dark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("rezo-theme", "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("rezo-theme", "dark");
    }
    document.querySelectorAll("[data-theme-toggle]").forEach(paintToggle);
  };

  function paintToggle(el) {
    el.textContent = document.documentElement.getAttribute("data-theme") === "dark"
      ? "Light" : "Dark";
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-theme-toggle]").forEach((el) => {
      paintToggle(el);
      el.onclick = window.toggleTheme;
    });
  });
})();
