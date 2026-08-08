"""A merchant's own backend, implementing the Rezo capability contract.

This is the other side of the fence. Rezo does not hold this store's gateway
credentials or database; it asks these ten endpoints and this service decides
what to answer. Everything here is what a real integrator would write, which is
why it lives in its own service with its own data rather than importing
anything from the engine.

Two things are deliberately imperfect, because a contract is only proven by the
cases it does not cover:

  * ``/rezo/returns`` answers 501. Rezo must fall back to manual return
    instructions rather than failing the dispute.
  * ``/rezo/refunds`` is idempotent on dispute_id. Rezo may retry; the
    merchant's own endpoint is the last line of defence against a double
    refund, and it is written that way here to show it.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="Northwind Supply (mock merchant)", version="1.0.0")

# The shared secret Rezo signs with. In a real store this is an environment
# secret; here it is fixed so the demo store can be seeded against it.
SECRET = os.getenv("REZO_SHARED_SECRET", "whsec_northwind_demo_2026")
MAX_SKEW_SECONDS = 300


# --------------------------------------------------------------------------
# the store's own data
# --------------------------------------------------------------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)


ORDERS: dict[str, dict] = {
    "NW-88120": {
        "order_id": "NW-88120",
        "buyer": {"id": "cust_4417", "name": "Priya Raman", "language": "en"},
        "items": [{"sku": "NW-LMP-BRS", "title": "Brass Desk Lamp",
                   "variant": "Antique", "qty": 1, "price": 3450.0,
                   "serial": "NW-LMP-BRS-9921"}],
        "total": 3450.0,
        "payment_method": "prepaid",
        "status": "delivered",
        "placed_at": (_now() - timedelta(days=6)).isoformat(),
        "delivered_at": (_now() - timedelta(days=2)).isoformat(),
        "courier": "Bluedart",
        "tracking_id": "BD77120934",
        "shipment_events": [
            {"at": (_now() - timedelta(days=5)).isoformat(), "status": "dispatched"},
            {"at": (_now() - timedelta(days=2)).isoformat(), "status": "delivered"},
        ],
    },
    "NW-88121": {
        "order_id": "NW-88121",
        "buyer": {"id": "cust_9902", "name": "Dev Anand", "language": "en"},
        "items": [{"sku": "NW-CHR-OAK", "title": "Oak Reading Chair",
                   "variant": "Natural", "qty": 1, "price": 12900.0,
                   "serial": "NW-CHR-OAK-3310"}],
        "total": 12900.0,
        "payment_method": "prepaid",
        "status": "in_transit",
        "placed_at": (_now() - timedelta(days=24)).isoformat(),
        "delivered_at": None,
        "courier": "Safexpress",
        "tracking_id": "SFX9911022",
        "shipment_events": [
            {"at": (_now() - timedelta(days=23)).isoformat(), "status": "dispatched"},
            {"at": (_now() - timedelta(days=19)).isoformat(), "status": "reached_hub",
             "note": "Bengaluru hub"},
            {"at": (_now() - timedelta(days=18)).isoformat(), "status": "undelivered",
             "note": "address unreachable"},
        ],
    },
}

BUYERS: dict[str, dict] = {
    "cust_4417": {"orders_count": 9, "lifetime_value": 41200.0,
                  "disputes_count": 0, "account_age_days": 890},
    "cust_9902": {"orders_count": 1, "lifetime_value": 12900.0,
                  "disputes_count": 0, "account_age_days": 21},
}

POLICY_VERSIONS = [
    {
        "version": "v1",
        "effective_from": datetime(2025, 1, 1, tzinfo=timezone.utc).isoformat(),
        "clauses": [
            {"id": "NW-1", "title": "Damaged on arrival",
             "text": "Furniture and lighting that arrives damaged must be reported "
                     "within 5 days of delivery with photographs of the damage. "
                     "Verified claims receive a full refund.",
             "claim_types": ["damage"], "window_days": 5,
             "outcome": "full_refund", "exclusions": []},
        ],
    },
    {
        "version": "v2",
        "effective_from": datetime(2026, 3, 1, tzinfo=timezone.utc).isoformat(),
        "clauses": [
            {"id": "NW-2.1", "title": "Damaged on arrival",
             "text": "Items that arrive damaged must be reported within 10 days of "
                     "delivery with photographic evidence showing the damage and the "
                     "item's serial plate. Verified claims receive a full refund or a "
                     "replacement at the buyer's choice.",
             "claim_types": ["damage"], "window_days": 10,
             "outcome": "full_refund", "exclusions": ["clearance"]},
            {"id": "NW-2.2", "title": "Not delivered",
             "text": "If a shipment shows no courier movement for 10 days, or is "
                     "marked undelivered, the order is refunded in full without "
                     "waiting for the item to return to the warehouse.",
             "claim_types": ["not_delivered"], "window_days": 45,
             "outcome": "full_refund", "exclusions": []},
            {"id": "NW-2.3", "title": "Wrong item delivered",
             "text": "Where the delivered item differs from the order, the correct "
                     "item is dispatched at no cost and collection of the wrong one "
                     "is arranged. Report within 10 days.",
             "claim_types": ["wrong_item", "wrong_size"], "window_days": 10,
             "outcome": "replacement", "exclusions": []},
        ],
    },
]

# The merchant's own refund ledger. Unique on dispute_id: this is what makes a
# retry safe on their side, independently of anything Rezo does.
REFUNDS: dict[str, dict] = {}
NOTIFICATIONS: list[dict] = []


# --------------------------------------------------------------------------
# signature verification
# --------------------------------------------------------------------------

async def verify(request: Request) -> dict:
    """Reject anything not signed by Rezo, and anything old enough to be a replay.

    Signed over the raw body bytes rather than a re-serialised object: any
    reordering of keys on the way through would change the JSON and break a
    signature computed over a parsed copy.
    """
    if request.headers.get("X-Rezo-Probe") == "1":
        # A health probe from the dashboard. Still signed, still verified.
        pass

    timestamp = request.headers.get("X-Rezo-Timestamp", "")
    signature = request.headers.get("X-Rezo-Signature", "")
    raw = (await request.body()).decode() or "{}"

    if not timestamp or not signature:
        raise HTTPException(401, "Missing signature headers")

    try:
        skew = abs(time.time() - float(timestamp))
    except ValueError:
        raise HTTPException(401, "Bad timestamp")
    if skew > MAX_SKEW_SECONDS:
        raise HTTPException(401, "Signature too old")

    expected = hmac.new(SECRET.encode(), f"{timestamp}.{raw}".encode(),
                        hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(401, "Bad signature")

    try:
        return json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return {}


# --------------------------------------------------------------------------
# the contract
# --------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "northwind-mock-merchant",
            "orders": len(ORDERS), "refunds_issued": len(REFUNDS)}


@app.get("/rezo/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    await verify(request)
    order = ORDERS.get(order_id)
    if order is None:
        raise HTTPException(404, "Unknown order")
    return order


@app.get("/rezo/orders/{order_id}/delivery")
async def get_delivery(order_id: str, request: Request):
    await verify(request)
    order = ORDERS.get(order_id)
    if order is None:
        raise HTTPException(404, "Unknown order")

    events = order["shipment_events"]
    last = events[-1] if events else None
    idle = 0
    if last and not order["delivered_at"]:
        idle = (_now() - datetime.fromisoformat(last["at"])).days
    return {
        "order_id": order_id,
        "status": order["status"],
        "delivered": order["delivered_at"] is not None,
        "delivered_at": order["delivered_at"],
        "last_event": last,
        "days_since_last_event": idle,
        "courier": order["courier"],
        "tracking_id": order["tracking_id"],
    }


@app.get("/rezo/buyers/{buyer_id}/history")
async def get_history(buyer_id: str, request: Request):
    await verify(request)
    record = BUYERS.get(buyer_id)
    if record is None:
        # An unknown buyer is not an error: they simply have no history here.
        return {"buyer_id": buyer_id, "orders_count": 0, "lifetime_value": 0,
                "disputes_count": 0, "account_age_days": 0}
    return {"buyer_id": buyer_id, **record}


@app.get("/rezo/policy")
async def get_policy(request: Request, as_of: str | None = None):
    await verify(request)
    if not as_of:
        return POLICY_VERSIONS[-1]

    try:
        moment = datetime.fromisoformat(as_of.replace("Z", "+00:00"))
    except ValueError:
        # Refuse rather than serving today's pack. Silently applying the wrong
        # policy version is worse than an error: the dispute would be decided
        # under rules the buyer never agreed to, and nothing would look wrong.
        raise HTTPException(400, f"Could not parse as_of: {as_of!r}")
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)

    # The pack in force when the order was placed, not today's.
    eligible = [p for p in POLICY_VERSIONS
                if datetime.fromisoformat(p["effective_from"]) <= moment]
    return (eligible or POLICY_VERSIONS)[-1]


@app.post("/rezo/refunds")
async def issue_refund(request: Request):
    body = await verify(request)
    if body.get("dry_run"):
        return {"ok": True, "dry_run": True}

    dispute_id = body.get("dispute_id", "")
    amount = float(body.get("amount", 0) or 0)

    # Idempotent on our side too. Rezo guards against a double refund; so do we,
    # because the endpoint that moves money should never rely on its caller.
    if dispute_id in REFUNDS:
        existing = REFUNDS[dispute_id]
        return {**existing, "status": "already_processed"}

    if amount <= 0:
        raise HTTPException(400, "Refund amount must be positive")

    record = {"reference": f"nw_rfnd_{secrets.token_hex(5)}",
              "amount": amount, "method": body.get("method", "gateway"),
              "status": "processing", "expected_settlement_days": 3,
              "issued_at": _now().isoformat()}
    REFUNDS[dispute_id] = record
    return record


@app.post("/rezo/notify")
async def notify(request: Request):
    body = await verify(request)
    if body.get("dry_run"):
        return {"ok": True, "dry_run": True}
    NOTIFICATIONS.append({**body, "at": _now().isoformat()})
    return {"delivered": True, "channel": body.get("channel", "app")}


# ── deliberately not implemented, to prove the fallback path ───────────────

@app.post("/rezo/returns")
async def create_return(request: Request):
    await verify(request)
    return JSONResponse(
        status_code=501,
        content={"error": "not_implemented",
                 "detail": "Northwind has no courier pickup integration yet"})


@app.post("/rezo/inventory/restock")
async def restock(request: Request):
    await verify(request)
    return JSONResponse(status_code=501, content={"error": "not_implemented"})


@app.post("/rezo/payouts")
async def payouts(request: Request):
    body = await verify(request)
    if body.get("dry_run"):
        return {"ok": True, "dry_run": True}
    return {"link": f"https://pay.northwind.example/{secrets.token_urlsafe(8)}",
            "amount": body.get("amount"), "expires_in_hours": 48}


# ── a window into what the merchant saw, for the demo ──────────────────────

@app.get("/inspect")
def inspect() -> dict:
    """Everything Rezo has done to this store, from the store's point of view."""
    return {"refunds": REFUNDS, "notifications": NOTIFICATIONS[-10:]}
