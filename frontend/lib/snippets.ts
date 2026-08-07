/**
 * Integration snippets, kept in one place so the guide, the onboarding step and
 * the AI-context file can never drift from each other.
 */

export const PLATFORMS = [
  { id: "html", label: "Plain HTML" },
  { id: "next", label: "Next.js / React" },
  { id: "shopify", label: "Shopify" },
  { id: "woo", label: "WooCommerce" },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]["id"];

export const FRONTEND_SNIPPET: Record<PlatformId, { file: string; code: string; note: string }> = {
  html: {
    file: "order-confirmation.html",
    note: "Put it anywhere in the page that renders an order. The launcher is fixed, so its position does not depend on where the tag sits.",
    code: `<!-- Rezo: one line, on any page that shows an order -->
<script src="https://rezo.zevora.io/widget.js"
        data-rezo-key="{PUBLISHABLE_KEY}"
        data-rezo-store="{STORE_ID}"
        data-rezo-order="ORD-1042"
        async></script>`,
  },
  next: {
    file: "app/orders/[id]/page.tsx",
    note: "next/script with afterInteractive keeps it off the critical path. The key is publishable, so NEXT_PUBLIC_ is correct here.",
    code: `import Script from "next/script";

export default function OrderPage({ order }) {
  return (
    <>
      {/* your order UI */}

      <Script
        src="https://rezo.zevora.io/widget.js"
        strategy="afterInteractive"
        data-rezo-key={process.env.NEXT_PUBLIC_REZO_KEY}
        data-rezo-store="{STORE_ID}"
        data-rezo-order={order.id}
      />
    </>
  );
}`,
  },
  shopify: {
    file: "sections/main-order.liquid",
    note: "Shopify exposes the order object in the customer order template, so the id comes straight from Liquid.",
    code: `{% comment %} Rezo: customer order page {% endcomment %}
<script src="https://rezo.zevora.io/widget.js"
        data-rezo-key="{PUBLISHABLE_KEY}"
        data-rezo-store="{STORE_ID}"
        data-rezo-order="{{ order.name | remove: '#' }}"
        async></script>`,
  },
  woo: {
    file: "functions.php",
    note: "Hook onto the order-details template so it only loads where an order actually exists.",
    code: `add_action( 'woocommerce_view_order', function ( $order_id ) {
  $order = wc_get_order( $order_id );
  printf(
    '<script src="https://rezo.zevora.io/widget.js"
             data-rezo-key="%s" data-rezo-store="%s"
             data-rezo-order="%s" async></script>',
    esc_attr( REZO_PUBLISHABLE_KEY ),
    esc_attr( REZO_STORE_ID ),
    esc_attr( $order->get_order_number() )
  );
}, 20 );`,
  },
};

export const CUSTOM_TRIGGER = `<!-- Prefer your own button? Add data-rezo-trigger and we stay out of your layout -->
<button data-rezo-trigger data-rezo-order="ORD-1042">
  Report an issue
</button>

<!-- Or drive it yourself -->
<script>
  Rezo.open({ order: "ORD-1042" });
</script>`;

export const REQUIRED_ENDPOINTS = [
  {
    name: "get_order",
    method: "GET",
    path: "/rezo/orders/:id",
    why: "Everything is checked against the real order: what was bought, for how much, when it was delivered.",
    response: `{
  "order_id": "ORD-1042",
  "buyer": { "id": "by_9", "name": "Arjun Menon", "language": "en" },
  "items": [{ "sku": "KRT-RST-M", "title": "Cotton Kurti Set",
              "variant": "Rust / M", "qty": 1, "price": 749,
              "serial": "KRT-RST-M" }],
  "total": 749,
  "payment_method": "prepaid",
  "status": "delivered",
  "placed_at": "2026-08-01T09:12:00Z",
  "delivered_at": "2026-08-05T14:03:00Z"
}`,
  },
  {
    name: "get_delivery_status",
    method: "GET",
    path: "/rezo/orders/:id/delivery",
    why: "Courier state is the evidence for a 'never arrived' claim, and it is what the watchdog watches.",
    response: `{
  "delivered": false,
  "last_event": { "at": "2026-07-18T06:00:00Z", "status": "undelivered",
                  "note": "short shipment" },
  "days_since_last_event": 21,
  "courier": "Delhivery",
  "tracking_id": "DL188650102"
}`,
  },
  {
    name: "get_customer_history",
    method: "GET",
    path: "/rezo/buyers/:id/history",
    why: "Distinguishes a long-standing customer from an account opened two weeks ago.",
    response: `{
  "orders_count": 6,
  "lifetime_value": 5397,
  "disputes_count": 0,
  "account_age_days": 760
}`,
  },
  {
    name: "get_policy_pack",
    method: "GET",
    path: "/rezo/policy?as_of=<iso>",
    why: "Version-aware on purpose: a claim is judged against the policy in force when the order was placed, so changing your rules never rewrites old orders.",
    response: `{
  "version": "v2",
  "effective_from": "2026-06-01T00:00:00Z",
  "clauses": [{ "id": "CL-4.2", "title": "Damaged on arrival",
                "text": "Items that arrive damaged must be reported within 7 days…",
                "claim_types": ["damage"], "window_days": 7,
                "outcome": "full_refund", "exclusions": [] }]
}`,
  },
  {
    name: "issue_refund",
    method: "POST",
    path: "/rezo/refunds",
    why: "The only endpoint that moves money. We never hold your gateway credentials: your endpoint decides. Make it idempotent on dispute_id.",
    response: `// we send
{ "dispute_id": "D-4F2A", "amount": 749, "method": "gateway" }

// you return
{ "reference": "rfnd_8a21c9", "status": "processing",
  "expected_settlement_days": 3 }`,
  },
  {
    name: "notify",
    method: "POST",
    path: "/rezo/notify",
    why: "Messages reach the buyer through your own channel, so they arrive from you rather than from a third party they do not recognise.",
    response: `// we send
{ "recipient": "by_9", "channel": "app",
  "message": "Your refund of ₹749 is on its way…" }

// you return
{ "delivered": true }`,
  },
];

export const OPTIONAL_ENDPOINTS = [
  { name: "create_return_pickup", path: "POST /rezo/returns",
    fallback: "We send the buyer your return address instead." },
  { name: "restock_item", path: "POST /rezo/inventory/restock",
    fallback: "We skip it and note it in the audit log." },
  { name: "payout_link", path: "POST /rezo/payouts",
    fallback: "Used for COD refunds. Without it we adjust settlement instead." },
];

export const SIGNATURE_CODE = `// Every request from Rezo is signed. Verify it before you act on it.
import crypto from "node:crypto";

export function verifyRezo(req, secret) {
  const timestamp = req.headers["x-rezo-timestamp"];
  const signature = req.headers["x-rezo-signature"];
  const raw = req.rawBody;                       // the exact bytes, not re-serialised

  // reject anything older than five minutes so a captured request cannot be replayed
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)                // your rezo secret key
    .update(\`\${timestamp}.\${raw}\`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expected), Buffer.from(signature)
  );
}`;

export const ENDPOINT_STUB = `// Express, but the shape is the same anywhere.
import express from "express";
const app = express();

app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString(); } }));

app.use("/rezo", (req, res, next) => {
  if (!verifyRezo(req, process.env.REZO_SECRET)) {
    return res.status(401).json({ error: "bad signature" });
  }
  next();
});

app.get("/rezo/orders/:id", async (req, res) => {
  const order = await db.orders.findById(req.params.id);
  if (!order) return res.sendStatus(404);
  res.json({
    order_id: order.id,
    buyer: { id: order.buyerId, name: order.buyerName },
    items: order.items.map((i) => ({
      sku: i.sku, title: i.title, variant: i.variant,
      qty: i.qty, price: i.price, serial: i.serial,
    })),
    total: order.total,
    payment_method: order.paymentMethod,
    status: order.status,
    placed_at: order.placedAt.toISOString(),
    delivered_at: order.deliveredAt?.toISOString() ?? null,
  });
});

app.post("/rezo/refunds", async (req, res) => {
  const { dispute_id, amount } = req.body;

  // idempotency is yours to own: a retry must never refund twice
  const existing = await db.refunds.findOne({ disputeId: dispute_id });
  if (existing) return res.json({ reference: existing.reference, status: "already_processed" });

  const refund = await gateway.refund({ amount });
  await db.refunds.insert({ disputeId: dispute_id, reference: refund.id, amount });
  res.json({ reference: refund.id, status: "processing" });
});

// Anything you have not built yet: answer 501 and we fall back gracefully.
app.all("/rezo/*", (_req, res) => res.sendStatus(501));`;

/** The context file a merchant hands to their own coding assistant. */
export function buildLlmsText(storeId: string, publishableKey: string) {
  return `# Rezo integration context

You are helping a developer integrate Rezo, an autonomous dispute resolution
service, into their e-commerce application. Read this whole file before
proposing changes, then produce a plan and a diff for THEIR stack. Ask which
framework and payment gateway they use if it is not obvious from the repository.

## What Rezo does

A buyer reports a problem with an order. Rezo runs a team of agents that:
1. classify the claim and load the order,
2. ask the buyer for evidence through a live camera challenge,
3. verify that evidence and check it for signs of being generated or reused,
4. decide eligibility against the merchant's own policy, citing a clause id,
5. score fraud risk from the buyer's history across the platform,
6. decide an outcome, and either execute it or stop and ask a human.

Rezo never moves money on its own beyond a limit the merchant sets. Refund
caps, clause verification and idempotency are enforced in code, not by the
model.

## This merchant

- store_id: ${storeId}
- publishable key (safe in the browser): ${publishableKey}
- secret key: server side only, never in client code, never committed

## Part 1: the front end (required, ~5 minutes)

Add one script tag to every page that renders a single order. It injects a
"Report an issue" launcher and opens the dispute flow in an isolated iframe.

    <script src="https://rezo.zevora.io/widget.js"
            data-rezo-key="${publishableKey}"
            data-rezo-store="${storeId}"
            data-rezo-order="<THE ORDER ID>"
            async></script>

Rules:
- data-rezo-order must be the id your backend uses for that order. Rezo will
  ask your API for it by exactly this value.
- The iframe needs camera permission. Do not add a restrictive iframe or
  Permissions-Policy header that blocks camera on your order pages.
- If the merchant wants their own button instead of the floating launcher, add
  data-rezo-trigger to it and Rezo will not inject anything:
      <button data-rezo-trigger data-rezo-order="ORD-1042">Report an issue</button>
- Programmatic control is available as Rezo.open({ order: "ORD-1042" }).

## Part 2: the backend contract (required for real resolutions)

Rezo calls the merchant's own backend. It never holds gateway credentials.
Implement these six endpoints. Return 501 for anything not built yet and Rezo
degrades gracefully instead of failing the dispute.

${REQUIRED_ENDPOINTS.map((e) => `### ${e.method} ${e.path}
Why: ${e.why}
Shape:
${e.response.split("\n").map((l) => "    " + l).join("\n")}`).join("\n\n")}

Optional, each with a documented fallback:
${OPTIONAL_ENDPOINTS.map((e) => `- ${e.path} — if absent: ${e.fallback}`).join("\n")}

## Part 3: request signing (required)

Every request from Rezo carries:
- X-Rezo-Store: the store id
- X-Rezo-Timestamp: unix seconds
- X-Rezo-Signature: hex HMAC-SHA256 of \`\${timestamp}.\${rawBody}\` using the
  secret key

Verify the signature against the RAW body bytes, not a re-serialised object,
and reject timestamps older than five minutes. Reference implementation:

${SIGNATURE_CODE.split("\n").map((l) => "    " + l).join("\n")}

## Part 4: what NOT to do

- Do not put the secret key in client code or a public environment variable.
- Do not make /rezo/refunds non-idempotent. Rezo may retry; the merchant's
  endpoint is the last line of defence against a double refund.
- Do not trust the amount blindly: check it against the order total on your side
  too. Defence in depth is the point.
- Do not skip signature verification "for now". An unsigned refund endpoint is
  an open door.

## Deliverable

Produce: (1) a short plan naming the files to change, (2) the diff, (3) a test
plan that covers a valid signature, an invalid signature, an unknown order, and
a duplicate refund. Follow the conventions already present in the repository.
`;
}
