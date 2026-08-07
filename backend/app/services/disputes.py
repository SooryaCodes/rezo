"""Dispute lifecycle service.

Sits between the HTTP layer and the agent graph: creates the durable record,
drives the engine, and translates graph interrupts into things the API can
express (waiting for evidence, waiting for a human).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from ..agents import events
from ..agents.graph import get_engine
from ..config import settings
from ..db.models import AuditEntry, Buyer, Dispute, Evidence, RefundLedger, Store
from ..db.session import session_scope
from ..tools import shop


def _new_id() -> str:
    return f"D-{uuid.uuid4().hex[:8].upper()}"


def open_dispute(store_id: str, order_id: str, message: str,
                 buyer_id: str | None = None, opened_by: str = "buyer") -> dict:
    """Create the case and run it until it needs something from someone."""
    order = shop.get_order(store_id, order_id)
    buyer_id = buyer_id or (order.get("buyer") or {}).get("id", "")
    store = shop.get_store(store_id)

    dispute_id = _new_id()
    now = datetime.now(timezone.utc)
    with session_scope() as db:
        db.add(Dispute(id=dispute_id, store_id=store_id, order_id=order_id,
                       buyer_id=buyer_id, claim_type="unknown",
                       claim_value=order["total"], status="open",
                       opened_by=opened_by, state={}, created_at=now,
                       sla_due_at=now + timedelta(hours=settings.seller_sla_hours)))
    shop.append_audit(dispute_id, store_id, opened_by, "dispute_opened",
                      {"order_id": order_id, "message": message[:400]})
    events.emit(dispute_id, "system", "start", "Dispute opened",
                {"order_id": order_id, "store": store.name})

    initial = {
        "dispute_id": dispute_id,
        "store_id": store_id,
        "store_name": store.name,
        "order_id": order_id,
        "buyer_id": buyer_id,
        "order": order,
        "messages": [{"role": "buyer", "content": message,
                      "at": now.isoformat()}],
        "events": [],
        "status": "open",
        "escalation_level": 0,
    }
    result = get_engine().start(initial)
    return _envelope(dispute_id, result)


def submit_evidence(dispute_id: str, media: list[str], source: str = "live_capture",
                    nonce: str | None = None,
                    observed_tokens: list[str] | None = None) -> dict:
    """Resume the frozen case with whatever the buyer captured."""
    payload = {"media": media, "source": source, "nonce": nonce,
               "observed_tokens": observed_tokens or []}
    shop.append_audit(dispute_id, _store_of(dispute_id), "buyer", "evidence_submitted",
                      {"count": len(media), "source": source})
    result = get_engine().resume(dispute_id, payload)
    return _envelope(dispute_id, result)


def record_approval(dispute_id: str, approved: bool, by: str,
                    note: str = "", override_outcome: str | None = None,
                    override_amount: float | None = None) -> dict:
    payload = {"approved": approved, "by": by, "note": note,
               "override_outcome": override_outcome,
               "override_amount": override_amount}
    result = get_engine().resume(dispute_id, payload)
    return _envelope(dispute_id, result)


def add_message(dispute_id: str, content: str, role: str = "buyer") -> dict:
    """A follow-up message on an open case: recorded, and surfaced to the seller
    if the case is already waiting on a human."""
    with session_scope() as db:
        row = db.get(Dispute, dispute_id)
        if row is None:
            raise ValueError(f"Unknown dispute {dispute_id}")
        state = dict(row.state or {})
        state.setdefault("messages", []).append(
            {"role": role, "content": content,
             "at": datetime.now(timezone.utc).isoformat()})
        row.state = state
    events.emit(dispute_id, "interaction", "finding", f"New message from {role}",
                {"content": content[:200]})
    return get_dispute(dispute_id)


# --------------------------------------------------------------------------
# reads
# --------------------------------------------------------------------------

def _store_of(dispute_id: str) -> str:
    with session_scope() as db:
        row = db.get(Dispute, dispute_id)
        return row.store_id if row else ""


def _envelope(dispute_id: str, result: dict) -> dict:
    record = get_dispute(dispute_id)
    record["pending"] = result.get("pending")
    record["awaiting"] = result.get("awaiting")
    record["done"] = result.get("done")
    return record


def get_dispute(dispute_id: str) -> dict:
    with session_scope() as db:
        row = db.get(Dispute, dispute_id)
        if row is None:
            raise ValueError(f"Unknown dispute {dispute_id}")
        store = db.get(Store, row.store_id)
        buyer = db.get(Buyer, row.buyer_id)
        refund = db.scalar(select(RefundLedger)
                           .where(RefundLedger.dispute_id == dispute_id))
        audit = db.scalars(select(AuditEntry)
                           .where(AuditEntry.dispute_id == dispute_id)
                           .order_by(AuditEntry.id)).all()
        media = db.scalars(select(Evidence)
                           .where(Evidence.dispute_id == dispute_id)).all()
        state = dict(row.state or {})

    return {
        "dispute_id": row.id,
        "store": {"id": store.id, "name": store.name,
                  "auto_approve_cap": store.auto_approve_cap} if store else {},
        "buyer": {"id": buyer.id, "name": buyer.name,
                  "language": buyer.language} if buyer else {},
        "order_id": row.order_id,
        "claim_type": row.claim_type,
        "claim_value": row.claim_value,
        "status": row.status,
        "escalation_level": row.escalation_level,
        "created_at": row.created_at.isoformat(),
        "closed_at": row.closed_at.isoformat() if row.closed_at else None,
        "messages": state.get("messages", []),
        "capture": state.get("capture", {}),
        "evidence": state.get("evidence", {}),
        "policy": state.get("policy", {}),
        "fraud": state.get("fraud", {}),
        "decision": state.get("decision", {}),
        "guardrail": state.get("guardrail", {}),
        "dossier": state.get("dossier", {}),
        "execution": state.get("execution", {}),
        "usage": state.get("usage", {}),
        "refund": ({"amount": refund.amount, "method": refund.method,
                    "reference": refund.reference,
                    "approved_by": refund.approved_by} if refund else None),
        "evidence_files": [{"tier": m.tier, "path": m.media_path,
                            "hash": m.content_hash} for m in media],
        "audit": [{"at": a.at.isoformat(), "actor": a.actor, "action": a.action,
                   "detail": a.detail} for a in audit],
        "events": events.all_events(dispute_id),
    }


def list_disputes(store_id: str | None = None, status: str | None = None,
                  limit: int = 50) -> list[dict]:
    with session_scope() as db:
        q = select(Dispute).order_by(Dispute.created_at.desc()).limit(limit)
        if store_id:
            q = q.where(Dispute.store_id == store_id)
        if status:
            q = q.where(Dispute.status == status)
        rows = db.scalars(q).all()
        buyers = {b.id: b for b in db.scalars(select(Buyer)).all()}
        out = []
        for r in rows:
            state = dict(r.state or {})
            out.append({
                "dispute_id": r.id,
                "store_id": r.store_id,
                "order_id": r.order_id,
                "buyer_name": buyers[r.buyer_id].name if r.buyer_id in buyers else "",
                "claim_type": r.claim_type,
                "claim_value": r.claim_value,
                "status": r.status,
                "escalation_level": r.escalation_level,
                "outcome": (state.get("decision") or {}).get("outcome"),
                "fraud_score": (state.get("fraud") or {}).get("score"),
                "created_at": r.created_at.isoformat(),
                "opened_by": r.opened_by,
            })
        return out


def store_analytics(store_id: str) -> dict:
    """The numbers a seller actually cares about."""
    with session_scope() as db:
        rows = db.scalars(select(Dispute).where(Dispute.store_id == store_id)).all()
        refunds = db.scalars(select(RefundLedger)
                             .where(RefundLedger.store_id == store_id)).all()

    total = len(rows)
    closed = [r for r in rows if r.status == "closed"]
    auto = [r for r in closed if r.escalation_level == 0]
    fraud_blocked = [r for r in rows
                     if (dict(r.state or {}).get("fraud") or {}).get("score", 0) >= 0.6]
    refunded = sum(r.amount for r in refunds)
    fixed_without_refund = [
        r for r in closed
        if (dict(r.state or {}).get("decision") or {}).get("outcome") in
        ("reject", "replacement")]

    cost = 0.0
    for r in rows:
        cost += float((dict(r.state or {}).get("usage") or {}).get("cost_inr", 0) or 0)

    return {
        "disputes_total": total,
        "closed": len(closed),
        "auto_resolved": len(auto),
        "auto_resolution_rate": round(len(auto) / total, 2) if total else 0.0,
        "awaiting_human": len([r for r in rows if "awaiting" in r.status]),
        "fraud_flagged": len(fraud_blocked),
        "fraud_value_blocked": round(sum(r.claim_value for r in fraud_blocked), 2),
        "refunded_total": round(refunded, 2),
        "resolved_without_refund": len(fixed_without_refund),
        "llm_cost_inr": round(cost, 2),
        "cost_per_dispute_inr": round(cost / total, 2) if total else 0.0,
    }
