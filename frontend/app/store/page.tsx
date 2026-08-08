"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type DisputeRow, type Order, type Store } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { mediaUrl, rupees, timeAgo, titleCase } from "@/lib/format";
import { Badge, Brand, Button, Eyebrow, EmptyState, Select, Skeleton } from "@/components/ui";

/**
 * A storefront to try the widget against.
 *
 * This is the merchant's side of the fence, so the widget is embedded exactly
 * the way the integration guide describes: an overlay iframe opened from a
 * button on an order. Nothing here knows anything about the dispute engine.
 */
export default function StorePage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [storeId, setStoreId] = useState("st_rehana");
  const { session } = useAuth();
  const [buyerId, setBuyerId] = useState("");
  const [widget, setWidget] = useState<{ store: string; order: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [cases, setCases] = useState<DisputeRow[]>([]);

  // Your own store first. Filing a dispute against a demo store and then finding
  // your dashboard empty is the single most confusing thing a new account can do.
  useEffect(() => {
    const mine = session?.store?.id;
    const load = () => Promise.all([
      api.stores().then(setStores).catch(() => setStores([])),
      api.orders().then(setOrders).catch(() => setOrders([])),
    ]);
    if (mine) {
      setStoreId(mine);
      api.addSampleOrders(mine).catch(() => {}).then(load);
    } else {
      load();
    }
  }, [session?.store?.id]);

  const buyers = useMemo(() => {
    const seen = new Map<string, string>();
    (orders ?? []).forEach((o) => {
      if (o.store_id === storeId) seen.set(o.buyer_id, o.buyer_name ?? o.buyer_id);
    });
    return [...seen.entries()];
  }, [orders, storeId]);

  // Default to the whole store. Landing on a single customer's one order made
  // the storefront look empty and hid every scenario worth trying.
  useEffect(() => {
    if (buyerId && !buyers.some(([id]) => id === buyerId)) setBuyerId("");
  }, [buyers, buyerId]);

  const visible = (orders ?? []).filter(
    (o) => o.store_id === storeId && (!buyerId || o.buyer_id === buyerId));

  const storeName = stores.find((s) => s.id === storeId)?.name ?? "Store";

  // Scrolling the storefront behind an open conversation makes the page feel
  // like it is coming apart under the panel.
  useEffect(() => {
    if (!widget && !picker) return;
    // Both elements: which one owns the scroll varies by browser, and locking
    // only body let the page keep moving underneath the panel.
    const body = document.body.style.overflow;
    const root = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = body;
      document.documentElement.style.overflow = root;
    };
  }, [widget, picker]);

  // Each seeded order exists to exercise one behaviour. Saying so turns a list
  // of products into a list of things you can actually try.
  const TRY: Record<string, string> = {
    "ORD-2041": "Report damage — settles on its own, under the cap",
    "ORD-2042": "Upload an AI-generated photo — it gets caught",
    "ORD-2043": "Try telling the agent to ignore its rules",
    "ORD-2044": "Report damage — too big to auto-approve, waits for the seller",
    "ORD-2045": "Stalled 21 days — the watchdog opens this one without being asked",
    "NW-88120": "A store on its own backend, reached over signed HTTP",
    "NW-88121": "Undelivered for 18 days at an external merchant",
  };

  return (
    <>
      <nav className="sticky top-0 z-30 bg-surface-1 border-b border-line-subtle">
        <div className="max-w-[760px] mx-auto px-6 h-[60px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Brand label={false} />
            <span className="text-ink-4">/</span>
            <Select value={storeId} onChange={setStoreId} className="w-[190px]"
                    options={stores.filter((s) => (orders ?? []).some((o) => o.store_id === s.id))
                                   .map((s) => ({ value: s.id, label: s.name }))} />
          </div>
          <div className="flex items-center gap-2">
            <a href="/dashboard?tab=disputes"
               className="text-sm text-ink-2 hover:text-ink whitespace-nowrap">
              &larr; Dashboard
            </a>
            <Select value={buyerId} onChange={setBuyerId} className="w-[185px]"
                    options={[{ value: "", label: "All customers" },
                              ...buyers.map(([id, name]) => ({ value: id, label: name }))]} />
          </div>
        </div>
      </nav>

      {/* One launcher for the whole store, the way a real storefront carries it.
          Opening it without an order picks the most recent one, because that is
          almost always the one someone is writing in about. */}
      {!widget && visible.length > 0 && (
        <button
          onClick={() => {
            api.disputes({ store_id: storeId }).then(setCases).catch(() => setCases([]));
            setPicker(true);
          }}
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center
                     rounded-full bg-action text-action-ink shadow-lg
                     transition-transform hover:scale-105"
          aria-label="Chat about an order">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.9-5.1A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z"
                  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <div className="max-w-[760px] mx-auto px-6 py-8 pb-24">
        <header className="mb-6">
          <Eyebrow>Test storefront</Eyebrow>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tighter">{storeName}</h1>
          <p className="text-ink-2 mt-1">
            Your orders, with dispute resolution built in. Pick an order and report a problem —
            this is the same widget your customers would use.
          </p>
        </header>

        <div className="bg-surface-1 border border-line-subtle rounded-lg overflow-hidden">
          {orders === null && <div className="p-5 flex flex-col gap-3">
            <Skeleton className="w-2/3" /><Skeleton className="w-1/2" /></div>}

          {orders !== null && visible.length === 0 && (
            <EmptyState glyph="◻" title="No orders here"
              body="Nothing matches this filter. Switch to All customers, or pick another store." />
          )}

          <div className="divide-y divide-line-subtle">
            {visible.map((o) => {
              const item = o.items[0];
              const last = o.shipment_events?.[o.shipment_events.length - 1];
              const idle = !o.delivered_at && last
                ? Math.floor((Date.now() - new Date(last.at).getTime()) / 86400000) : 0;

              return (
                <div key={o.order_id} className="flex gap-4 p-4 items-start">
                  <img src={mediaUrl(item?.image ?? "")} alt=""
                       className="w-[68px] h-[68px] rounded-md object-cover border border-line-subtle shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold">{item?.title}</div>
                        <div className="text-sm text-ink-3">
                          {item?.variant} · {rupees(o.total)} ·{" "}
                          <span className="font-mono text-xs">{o.order_id}</span>
                        </div>
                      </div>
                      {o.delivered_at
                        ? <Badge tone="accent" dot>Delivered {timeAgo(o.delivered_at)}</Badge>
                        : <Badge tone={idle >= 7 ? "attention" : "neutral"}>
                            {idle >= 7 ? `No movement for ${idle} days` : titleCase(o.status)}
                          </Badge>}
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 text-sm text-ink-3">
                      <div className="flex items-center gap-1">
                        {(o.shipment_events ?? []).map((e, i) => (
                          <span key={i} title={e.status}
                                className={`w-1.5 h-1.5 rounded-full ${
                                  e.status === "delivered" ? "bg-accent"
                                    : e.status === "undelivered" ? "bg-ink-3" : "bg-line-strong"}`} />
                        ))}
                      </div>
                      <span>{o.courier} {o.tracking_id}</span>
                    </div>

                    {TRY[o.order_id] && (
                      <p className="mt-2 text-xs text-ink-3">{TRY[o.order_id]}</p>
                    )}

                    <div className="flex items-center gap-3 mt-3">
                      <Button size="sm"
                              onClick={() => setWidget({ store: o.store_id, order: o.order_id })}>
                        Report an issue
                      </Button>
                      <span className="text-xs text-ink-3">
                        {o.payment_method === "cod" ? "Cash on delivery" : "Prepaid"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-sm text-ink-3 mt-5">
          On a real store this button comes from one script tag.{" "}
          <a href="/docs" className="text-accent no-underline">See the integration guide →</a>
        </p>
      </div>

      {/* the widget, embedded the way a merchant would embed it */}
      {/* What a buyer opening a support widget actually needs: the cases they
          already have, and a way to start a new one against a specific order.
          Dropping them into the newest order's thread answers a question they
          did not ask. */}
      {picker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)] sm:items-center"
             onClick={(e) => { if (e.target === e.currentTarget) setPicker(false); }}>
          <div className="w-full max-w-[440px] max-h-[80vh] overflow-y-auto rounded-t-2xl
                          border border-line-subtle bg-surface-1 p-5 shadow-3 sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Help with an order</h2>
                <p className="text-sm text-ink-3 mt-0.5">Pick the one you want to talk about.</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPicker(false)}>Close</Button>
            </div>

            {cases.length > 0 && (
              <div className="mt-4">
                <div className="text-2xs font-bold uppercase tracking-wide text-ink-3">
                  Your open cases
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  {cases.slice(0, 4).map((c) => (
                    <button key={c.dispute_id}
                            onClick={() => { setPicker(false);
                                             setWidget({ store: storeId, order: c.order_id }); }}
                            className="flex items-center justify-between gap-3 rounded-lg border
                                       border-line-subtle px-3 py-2 text-left hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{c.order_id}</span>
                        <span className="block text-xs text-ink-3">
                          {titleCase(c.claim_type)} &middot; {titleCase(c.status)}
                        </span>
                      </span>
                      <Badge tone={c.status === "closed" ? "neutral" : "accent"}>
                        {c.status === "closed" ? "Resolved" : "Open"}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <div className="text-2xs font-bold uppercase tracking-wide text-ink-3">
                Start a new one
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {visible.map((o) => (
                  <button key={o.order_id}
                          onClick={() => { setPicker(false);
                                           setWidget({ store: o.store_id, order: o.order_id }); }}
                          className="flex items-center gap-3 rounded-lg border border-line-subtle
                                     px-3 py-2 text-left hover:bg-surface-2">
                    <img src={mediaUrl(o.items[0]?.image ?? "")} alt=""
                         className="h-9 w-9 shrink-0 rounded object-cover border border-line-subtle" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{o.items[0]?.title}</span>
                      <span className="block text-xs text-ink-3">
                        {o.order_id} &middot; {rupees(o.total)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {widget && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[var(--scrim)] animate-rise"
             onClick={(e) => { if (e.target === e.currentTarget) setWidget(null); }}>
          <button onClick={() => setWidget(null)}
                  className="absolute top-4 left-4 h-[30px] px-3 rounded border border-white/30 bg-white/15 text-white text-sm backdrop-blur">
            Close
          </button>
          <iframe
            title="Report an issue"
            allow="camera; microphone"
            src={`/widget?store=${encodeURIComponent(widget.store)}&order=${encodeURIComponent(widget.order)}&embedded=1`}
            className="w-[min(460px,100vw)] h-full border-0 bg-surface-1 shadow-3"
          />
        </div>
      )}
    </>
  );
}
