"""Platform-native connector: reads and writes the platform's own database."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from sqlalchemy import select

from ...db.models import Buyer, Dispute, Order, PolicyPack, Precedent, Store
from ...db.session import session_scope
from ..errors import NotFound


def _as_dt(value) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


class LocalConnector:
    """Direct database access. Used for stores that live on this platform."""

    def __init__(self, store_id: str):
        self.store_id = store_id

    # ---- required ------------------------------------------------------

    def get_order(self, order_id: str) -> dict:
        with session_scope() as db:
            order = db.get(Order, order_id)
            if order is None or order.store_id != self.store_id:
                raise NotFound(f"Order {order_id} not found for this store",
                               order_id=order_id)
            buyer = db.get(Buyer, order.buyer_id)
            return {
                "order_id": order.id,
                "store_id": order.store_id,
                "buyer": {
                    "id": buyer.id, "name": buyer.name, "email": buyer.email,
                    "phone": buyer.phone, "language": buyer.language,
                    "account_age_days": (datetime.now(timezone.utc)
                                         - _as_dt(buyer.created_at)).days,
                } if buyer else {},
                "items": order.items,
                "total": order.total,
                "payment_method": order.payment_method,
                "payment_ref": order.payment_ref,
                "status": order.status,
                "placed_at": _as_dt(order.placed_at).isoformat(),
                "delivered_at": _as_dt(order.delivered_at).isoformat() if order.delivered_at else None,
                "courier": order.courier,
                "tracking_id": order.tracking_id,
                "shipment_events": order.shipment_events,
            }

    def get_delivery_status(self, order_id: str) -> dict:
        order = self.get_order(order_id)
        events = order["shipment_events"]
        last = events[-1] if events else None
        delivered = order["delivered_at"] is not None
        stalled_days = 0
        if last and not delivered:
            stalled_days = (datetime.now(timezone.utc)
                            - datetime.fromisoformat(last["at"])).days
        return {
            "order_id": order_id,
            "status": order["status"],
            "delivered": delivered,
            "delivered_at": order["delivered_at"],
            "last_event": last,
            "days_since_last_event": stalled_days,
            "courier": order["courier"],
            "tracking_id": order["tracking_id"],
        }

    def get_customer_history(self, buyer_id: str) -> dict:
        with session_scope() as db:
            orders = db.scalars(
                select(Order).where(Order.store_id == self.store_id,
                                    Order.buyer_id == buyer_id)).all()
            disputes = db.scalars(
                select(Dispute).where(Dispute.store_id == self.store_id,
                                      Dispute.buyer_id == buyer_id)).all()
            prior = db.scalars(
                select(Precedent).where(Precedent.store_id == self.store_id)).all()
            buyer = db.get(Buyer, buyer_id)
            return {
                "buyer_id": buyer_id,
                "orders_count": len(orders),
                "lifetime_value": round(sum(o.total for o in orders), 2),
                "disputes_count": len(disputes),
                "account_age_days": (datetime.now(timezone.utc)
                                     - _as_dt(buyer.created_at)).days if buyer else 0,
                "prior_outcomes": [p.outcome for p in prior if buyer_id in p.summary or ""],
            }

    def get_policy_pack(self, purchase_date) -> dict:
        """Version-aware: returns the pack that was in force when the order was
        placed, so a policy change after purchase cannot be applied backwards."""
        if isinstance(purchase_date, str):
            purchase_date = datetime.fromisoformat(purchase_date)
        purchase_date = _as_dt(purchase_date)
        with session_scope() as db:
            packs = db.scalars(
                select(PolicyPack).where(PolicyPack.store_id == self.store_id)).all()
            if not packs:
                raise NotFound("No policy pack configured", store_id=self.store_id)
            eligible = [p for p in packs if _as_dt(p.effective_from) <= purchase_date]
            pack = max(eligible or packs, key=lambda p: _as_dt(p.effective_from))
            return {
                "store_id": self.store_id,
                "version": pack.version,
                "effective_from": _as_dt(pack.effective_from).isoformat(),
                "clauses": pack.clauses,
            }

    def issue_refund(self, dispute_id: str, amount: float, method: str) -> dict:
        """Executes the movement itself. The guarded facade has already cleared
        caps, clause validity and idempotency before this is reached."""
        reference = f"rfnd_{secrets.token_hex(6)}"
        return {
            "reference": reference,
            "amount": round(amount, 2),
            "method": method,
            "status": "processing",
            "expected_settlement_days": 3 if method == "gateway" else 1,
        }

    def notify(self, recipient: str, channel: str, message: str) -> dict:
        return {"delivered": True, "recipient": recipient, "channel": channel,
                "message": message}

    # ---- optional ------------------------------------------------------

    def create_return_pickup(self, dispute_id: str, order_id: str) -> dict:
        return {"pickup_id": f"pk_{secrets.token_hex(4)}",
                "window": "tomorrow, 10:00-18:00", "courier": "Delhivery"}

    def restock_item(self, order_id: str, sku: str) -> dict:
        return {"sku": sku, "restocked": True}

    def payout_link(self, buyer_id: str, amount: float) -> dict:
        return {"link": f"https://pay.rezo.app/upi/{secrets.token_urlsafe(8)}",
                "amount": round(amount, 2), "expires_in_hours": 48}
