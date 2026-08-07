"""Logistics watchdog and approval SLA timers.

Most dispute systems are complaint-triggered: they do nothing until a buyer
notices something went wrong and finds the support page. The failure mode that
motivated this project is the opposite one, where a shipment silently stalls or
a return pickup is cancelled by the courier and nobody is told, so no refund is
ever triggered and the money sits with the seller by default.

This watches the promises rather than waiting for the complaint.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from ..config import settings
from ..db.models import Dispute, Order, Store
from ..db.session import session_scope
from ..tools import shop

STALL_DAYS = 7          # no courier movement for this long is a stalled shipment
UNDELIVERED_STATES = {"undelivered", "rto_initiated", "lost", "exception",
                      "reached_hub", "in_transit", "dispatched"}


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def find_stalled_shipments() -> list[dict]:
    """Orders whose courier trail stopped moving and which nobody has claimed."""
    now = datetime.now(timezone.utc)
    found = []
    with session_scope() as db:
        open_orders = db.scalars(
            select(Order).where(Order.delivered_at.is_(None))).all()
        claimed = {d.order_id for d in db.scalars(select(Dispute)).all()}
        stores = {s.id: s.name for s in db.scalars(select(Store)).all()}

        for order in open_orders:
            if order.id in claimed:
                continue
            events = order.shipment_events or []
            if not events:
                continue
            last = events[-1]
            last_at = _aware(datetime.fromisoformat(last["at"]))
            idle_days = (now - last_at).days
            if idle_days < STALL_DAYS:
                continue
            if last.get("status") not in UNDELIVERED_STATES:
                continue
            found.append({
                "order_id": order.id,
                "store_id": order.store_id,
                "store_name": stores.get(order.store_id, ""),
                "buyer_id": order.buyer_id,
                "value": order.total,
                "idle_days": idle_days,
                "last_status": last.get("status"),
                "last_note": last.get("note", ""),
                "courier": order.courier,
                "tracking_id": order.tracking_id,
            })
    return found


def find_breached_approvals() -> list[dict]:
    """Cases a seller has been sitting on past the platform's SLA."""
    now = datetime.now(timezone.utc)
    out = []
    with session_scope() as db:
        rows = db.scalars(select(Dispute).where(
            Dispute.status == "awaiting_seller_approval")).all()
        for row in rows:
            due = _aware(row.sla_due_at)
            if due and now > due:
                out.append({"dispute_id": row.id, "store_id": row.store_id,
                            "hours_overdue": round((now - due).total_seconds() / 3600, 1),
                            "value": row.claim_value})
    return out


def run_once(open_disputes: bool = True) -> dict:
    """One sweep. In production this is scheduled; here it is also callable so
    the behaviour can be demonstrated."""
    from . import disputes as svc  # imported here to avoid a cycle at import time

    stalled = find_stalled_shipments()
    opened = []
    if open_disputes:
        for item in stalled:
            note = (f"Shipment has not moved for {item['idle_days']} days. "
                    f"Courier {item['courier']} last reported "
                    f"'{item['last_status']}'"
                    + (f" ({item['last_note']})" if item["last_note"] else "")
                    + ". The parcel was neither delivered nor returned, so no "
                      "refund would ever trigger on its own.")
            try:
                result = svc.open_dispute(item["store_id"], item["order_id"],
                                          note, item["buyer_id"],
                                          opened_by="watchdog",
                                          claim_hint="not_delivered")
                opened.append({"dispute_id": result["dispute_id"],
                               "order_id": item["order_id"],
                               "status": result["status"],
                               "outcome": (result.get("decision") or {}).get("outcome")})
            except Exception as exc:  # a bad row must not stop the sweep
                opened.append({"order_id": item["order_id"],
                               "error": f"{type(exc).__name__}: {exc}"})

    breached = find_breached_approvals()
    escalated = []
    for case in breached:
        shop.append_audit(case["dispute_id"], case["store_id"], "watchdog",
                          "seller_sla_breached", case)
        with session_scope() as db:
            row = db.get(Dispute, case["dispute_id"])
            if row is not None:
                row.escalation_level = 2
                row.status = "awaiting_platform_review"
        escalated.append(case["dispute_id"])

    return {
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "stalled_shipments": stalled,
        "disputes_opened": opened,
        "sla_breaches": breached,
        "escalated_to_platform": escalated,
        "sla_hours": settings.seller_sla_hours,
    }
