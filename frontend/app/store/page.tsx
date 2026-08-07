"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Order, type Store } from "@/lib/api";
import { mediaUrl, rupees, timeAgo, titleCase } from "@/lib/format";
import { Badge, Brand, Button, Eyebrow, EmptyState, Skeleton, ThemeToggle } from "@/components/ui";

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
  const [buyerId, setBuyerId] = useState("");
  const [widget, setWidget] = useState<{ store: string; order: string } | null>(null);

  useEffect(() => {
    api.stores().then(setStores).catch(() => setStores([]));
    api.orders().then(setOrders).catch(() => setOrders([]));
  }, []);

  const buyers = useMemo(() => {
    const seen = new Map<string, string>();
    (orders ?? []).forEach((o) => {
      if (o.store_id === storeId) seen.set(o.buyer_id, o.buyer_name ?? o.buyer_id);
    });
    return [...seen.entries()];
  }, [orders, storeId]);

  useEffect(() => {
    if (buyers.length && !buyers.some(([id]) => id === buyerId)) setBuyerId(buyers[0][0]);
  }, [buyers, buyerId]);

  const visible = (orders ?? []).filter(
    (o) => o.store_id === storeId && (!buyerId || o.buyer_id === buyerId));

  const storeName = stores.find((s) => s.id === storeId)?.name ?? "Store";

  return (
    <>
      <nav className="sticky top-0 z-30 bg-surface-1 border-b border-line-subtle">
        <div className="max-w-[760px] mx-auto px-6 h-[60px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Brand label={false} />
            <span className="text-ink-4">/</span>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)}
                    className="h-8 px-2 pr-7 rounded border border-line bg-surface-1 text-base appearance-none cursor-pointer">
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}
                    className="h-8 px-2 pr-7 rounded border border-line bg-surface-1 text-base appearance-none cursor-pointer">
              {buyers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <ThemeToggle />
          </div>
        </div>
      </nav>

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
              body="This buyer has not ordered from this store. Try another pairing above." />
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
                        ? <Badge tone="ok" dot>Delivered {timeAgo(o.delivered_at)}</Badge>
                        : <Badge tone={idle >= 7 ? "warn" : "neutral"}>
                            {idle >= 7 ? `No movement for ${idle} days` : titleCase(o.status)}
                          </Badge>}
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 text-sm text-ink-3">
                      <div className="flex items-center gap-1">
                        {(o.shipment_events ?? []).map((e, i) => (
                          <span key={i} title={e.status}
                                className={`w-1.5 h-1.5 rounded-full ${
                                  e.status === "delivered" ? "bg-ok"
                                    : e.status === "undelivered" ? "bg-warn" : "bg-line-strong"}`} />
                        ))}
                      </div>
                      <span>{o.courier} {o.tracking_id}</span>
                    </div>

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
