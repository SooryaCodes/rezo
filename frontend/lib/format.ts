export const rupees = (n: number | undefined | null, decimals = 0) =>
  "₹" + Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: decimals });

export const titleCase = (s: string | undefined | null) =>
  (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export const mediaUrl = (path: string) => `/media/${path.split("/").pop()}`;

/** Outcome labels the customer would recognise, not our internal enum. */
export const OUTCOME_LABEL: Record<string, string> = {
  full_refund: "Refunded",
  partial_refund: "Partial refund",
  replacement: "Replacement",
  coupon: "Store credit",
  reject: "Declined",
  escalate: "Needs review",
};

export const STATUS_LABEL: Record<string, string> = {
  closed: "Resolved",
  awaiting_seller_approval: "Needs you",
  awaiting_platform_review: "Platform review",
  awaiting_evidence: "Awaiting evidence",
  gathering_evidence: "Gathering evidence",
  deciding: "Deciding",
  open: "Open",
};
