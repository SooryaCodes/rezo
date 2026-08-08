"""The guarded capability layer: the only path from an agent to the real world.

Two invariants hold here and nowhere else:

1. **Guardrails live in code, not in prompts.** ``issue_refund`` checks the
   store's cap, the evidence tier, the approval state and the cited clause
   itself. A hallucinating or prompt-injected model cannot exceed them, because
   the enforcement point is outside the model.

2. **Money-moving operations are idempotent and audited transactionally.** The
   refund ledger's unique dispute id makes a retry a no-op, and the audit entry
   commits in the same transaction as the ledger row, so no refund can exist
   without its trace.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from ..config import settings
from ..db.models import (AuditEntry, Buyer, Dispute, Order, Precedent,
                         RefundLedger, Store)
from ..db.session import session_scope
from .connectors.http import HttpConnector
from .connectors.local import LocalConnector
from .errors import CapabilityUnavailable, GuardrailViolation, NotFound

# --------------------------------------------------------------------------
# audit
# --------------------------------------------------------------------------

def append_audit(dispute_id: str, store_id: str, actor: str, action: str,
                 detail: dict | None = None, db=None) -> None:
    """Append-only. Pass an open session to join an existing transaction."""
    entry = AuditEntry(dispute_id=dispute_id, store_id=store_id, actor=actor,
                       action=action, detail=detail or {})
    if db is not None:
        db.add(entry)
        return
    with session_scope() as own:
        own.add(entry)


# --------------------------------------------------------------------------
# connector resolution
# --------------------------------------------------------------------------

def get_store(store_id: str) -> Store:
    with session_scope() as db:
        store = db.get(Store, store_id)
        if store is None:
            raise NotFound(f"Unknown store {store_id}", store_id=store_id)
        db.expunge(store)
        return store


def connector_for(store_id: str):
    store = get_store(store_id)
    if store.connector == "http" and store.connector_base_url:
        return HttpConnector(store_id, store.connector_base_url,
                             store.connector_secret or "")
    return LocalConnector(store_id)


def capability(store_id: str, name: str) -> bool:
    return bool(get_store(store_id).capabilities.get(name, False))


# --------------------------------------------------------------------------
# read tools
# --------------------------------------------------------------------------

def get_order(store_id: str, order_id: str) -> dict:
    return connector_for(store_id).get_order(order_id)


def get_delivery_status(store_id: str, order_id: str) -> dict:
    return connector_for(store_id).get_delivery_status(order_id)


def get_customer_history(store_id: str, buyer_id: str) -> dict:
    return connector_for(store_id).get_customer_history(buyer_id)


def get_policy_pack(store_id: str, purchase_date) -> dict:
    return connector_for(store_id).get_policy_pack(purchase_date)


def get_buyer_history_across_stores(buyer_id: str) -> dict:
    """Platform-level fraud signal, deliberately not routed through a store
    connector: a single store must never see another store's data, but the
    platform can correlate across all of them.

    A buyer who looks clean to one small seller is visible here.
    """
    now = datetime.now(timezone.utc)
    with session_scope() as db:
        buyer = db.get(Buyer, buyer_id)
        if buyer is None:
            return {"buyer_id": buyer_id, "known": False}

        orders = db.scalars(select(Order).where(Order.buyer_id == buyer_id)).all()
        disputes = db.scalars(select(Dispute).where(Dispute.buyer_id == buyer_id)).all()

        # historical claims recorded as precedents, matched by buyer name so the
        # seed's cross-store history is visible without leaking store data
        prior = db.scalars(select(Precedent)).all()
        historical = [p for p in prior if buyer.name.lower() in (p.summary or "").lower()]

        def _age_days(dt):
            if dt is None:
                return 999
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return (now - dt).days

        recent_claims = [p for p in historical if _age_days(p.created_at) <= 60]
        recent_disputes = [d for d in disputes if _age_days(d.created_at) <= 60]

        stores_touched = {p.store_id for p in historical} | {d.store_id for d in disputes}
        others = db.scalars(
            select(Buyer).where(Buyer.address_hash == buyer.address_hash,
                                Buyer.id != buyer_id)).all() if buyer.address_hash else []

        return {
            "buyer_id": buyer_id,
            "known": True,
            "account_age_days": _age_days(buyer.created_at),
            "orders_total": len(orders),
            "lifetime_value": round(sum(o.total for o in orders), 2),
            "claims_all_time": len(historical) + len(disputes),
            "claims_last_60d": len(recent_claims) + len(recent_disputes),
            "stores_claimed_against": len(stores_touched),
            "refunded_total": round(sum(p.amount for p in historical), 2),
            "linked_accounts_same_address": len(others),
            "device_fingerprint": buyer.device_fingerprint,
        }


def find_reused_evidence(content_hash: str, exclude_dispute: str = "") -> list[dict]:
    """Has this exact image been submitted before, anywhere on the platform?

    Only counts as reuse when it appears on a different order or from a
    different buyer. The same person photographing the same broken item again
    for the same order is a resubmission, not fraud, and treating it as fraud
    would punish honest buyers who retry after a bad upload.
    """
    from ..db.models import Evidence
    if not content_hash:
        return []
    with session_scope() as db:
        rows = db.scalars(
            select(Evidence).where(Evidence.content_hash == content_hash,
                                   Evidence.dispute_id != exclude_dispute)).all()
        if not rows:
            return []
        current = db.get(Dispute, exclude_dispute) if exclude_dispute else None
        matches = []
        for r in rows:
            other = db.get(Dispute, r.dispute_id)
            if other is None:
                continue
            same_claim = (current is not None
                          and other.order_id == current.order_id
                          and other.buyer_id == current.buyer_id)
            if same_claim:
                continue
            matches.append({"dispute_id": r.dispute_id,
                            "store_id": other.store_id,
                            "order_id": other.order_id,
                            "at": r.created_at.isoformat()})
        return matches


# --------------------------------------------------------------------------
# clause verification - a hallucinated policy cannot pass this
# --------------------------------------------------------------------------

def verify_clause(store_id: str, clause_id: str, claim_type: str,
                  purchase_date, delivered_at=None) -> dict:
    """Confirms the cited clause exists in the pack that was in force on the
    purchase date, covers this claim type, and that the reporting window has not
    closed. The Policy Agent must return a clause id; this decides whether it is
    real."""
    pack = get_policy_pack(store_id, purchase_date)
    clause = next((c for c in pack["clauses"] if c["id"] == clause_id), None)
    if clause is None:
        raise GuardrailViolation(
            f"Cited clause {clause_id} does not exist in policy pack "
            f"{pack['version']} for store {store_id}",
            clause_id=clause_id, policy_version=pack["version"])

    if claim_type and claim_type not in clause.get("claim_types", []):
        raise GuardrailViolation(
            f"Clause {clause_id} does not cover claim type '{claim_type}'",
            clause_id=clause_id, covers=clause.get("claim_types", []))

    within_window = True
    days_since_delivery = None
    if delivered_at is not None and clause.get("window_days"):
        if isinstance(delivered_at, str):
            delivered_at = datetime.fromisoformat(delivered_at)
        if delivered_at.tzinfo is None:
            delivered_at = delivered_at.replace(tzinfo=timezone.utc)
        days_since_delivery = (datetime.now(timezone.utc) - delivered_at).days
        within_window = days_since_delivery <= clause["window_days"]

    return {
        "valid": True,
        "clause_id": clause_id,
        "clause_text": clause["text"],
        "clause_title": clause["title"],
        "policy_version": pack["version"],
        "outcome": clause.get("outcome"),
        "window_days": clause.get("window_days"),
        "days_since_delivery": days_since_delivery,
        "within_window": within_window,
        "exclusions": clause.get("exclusions", []),
    }


# --------------------------------------------------------------------------
# autonomy limits
# --------------------------------------------------------------------------

def effective_cap(store_id: str, evidence_tier: str = "none") -> float:
    """The store's cap, scaled down by how much we trust the evidence.

    Attested live capture unlocks the full cap; an unverifiable upload unlocks a
    quarter of it. Friction is proportional to risk rather than uniform.
    """
    store = get_store(store_id)
    multiplier = settings.tier_multiplier.get(evidence_tier, 0.0)
    return round(store.auto_approve_cap * multiplier, 2)


def refund_method_for(store_id: str, payment_method: str) -> str:
    """Route by capability, so a store missing a gateway still resolves."""
    caps = get_store(store_id).capabilities
    if payment_method == "cod" or not caps.get("gateway_refund", False):
        if caps.get("upi_payout", False):
            return "upi_link"
        return "settlement_adjust"
    return "gateway"


# --------------------------------------------------------------------------
# the guarded write
# --------------------------------------------------------------------------

def issue_refund(dispute_id: str, amount: float, approved_by: str,
                 clause_id: str = "", evidence_tier: str = "none",
                 claim_type: str = "") -> dict:
    """Move money, or refuse to.

    Refuses when: the amount is not positive, it exceeds what was actually paid,
    the cited clause is not real, or an automated decision exceeds the store's
    tier-adjusted cap. Returns the existing result unchanged if this dispute has
    already been refunded.
    """
    with session_scope() as db:
        dispute = db.get(Dispute, dispute_id)
        if dispute is None:
            raise NotFound(f"Unknown dispute {dispute_id}", dispute_id=dispute_id)
        store = db.get(Store, dispute.store_id)
        order = db.get(Order, dispute.order_id)

        # --- idempotency: a retry must never double-refund ---------------
        existing = db.scalar(select(RefundLedger)
                             .where(RefundLedger.dispute_id == dispute_id))
        if existing is not None:
            append_audit(dispute_id, store.id, "tools.issue_refund",
                         "refund_idempotent_noop",
                         {"reference": existing.reference,
                          "amount": existing.amount}, db=db)
            return {"reference": existing.reference, "amount": existing.amount,
                    "method": existing.method, "status": "already_processed",
                    "idempotent": True}

        # --- amount sanity ------------------------------------------------
        if amount is None or amount <= 0:
            raise GuardrailViolation("Refund amount must be positive",
                                     amount=amount, dispute_id=dispute_id)
        if order is not None and amount > order.total + 0.01:
            raise GuardrailViolation(
                f"Refund {amount} exceeds order total {order.total}",
                amount=amount, order_total=order.total)

        # --- the cited clause must be real --------------------------------
        if clause_id:
            verify_clause(store.id, clause_id, claim_type or dispute.claim_type,
                          order.placed_at if order else datetime.now(timezone.utc),
                          order.delivered_at if order else None)
        elif approved_by.startswith("auto"):
            raise GuardrailViolation(
                "Autonomous refunds must cite a policy clause",
                dispute_id=dispute_id)

        # --- autonomy cap, scaled by evidence tier ------------------------
        if approved_by.startswith("auto"):
            multiplier = settings.tier_multiplier.get(evidence_tier, 0.0)
            cap = round(store.auto_approve_cap * multiplier, 2)
            if amount > cap:
                raise GuardrailViolation(
                    f"Amount {amount} exceeds the autonomous limit {cap} for "
                    f"evidence tier '{evidence_tier}'. Human approval required.",
                    amount=amount, cap=cap, evidence_tier=evidence_tier,
                    store_cap=store.auto_approve_cap)

        # --- execute -------------------------------------------------------
        method = refund_method_for(store.id,
                                   order.payment_method if order else "prepaid")
        result = connector_for(store.id).issue_refund(dispute_id, amount, method)

        # ledger + audit commit together with the dispute update
        db.add(RefundLedger(
            dispute_id=dispute_id, store_id=store.id, amount=round(amount, 2),
            method=method, approved_by=approved_by, clause_id=clause_id,
            executed=True, executed_at=datetime.now(timezone.utc),
            reference=result["reference"]))
        append_audit(dispute_id, store.id, "tools.issue_refund", "refund_executed",
                     {"amount": round(amount, 2), "method": method,
                      "approved_by": approved_by, "clause_id": clause_id,
                      "evidence_tier": evidence_tier,
                      "reference": result["reference"]}, db=db)

        result["idempotent"] = False
        return result


# --------------------------------------------------------------------------
# optional capabilities - degrade, never fail the dispute
# --------------------------------------------------------------------------

def create_return_pickup(store_id: str, dispute_id: str, order_id: str) -> dict:
    if not capability(store_id, "courier_pickup"):
        store = get_store(store_id)
        return {"available": False,
                "fallback": "manual_return",
                "instructions": f"Ask the buyer to ship the item back to "
                                f"{store.name} and reimburse the postage."}
    out = connector_for(store_id).create_return_pickup(dispute_id, order_id)
    out["available"] = True
    return out


def restock_item(store_id: str, order_id: str, sku: str) -> dict:
    if not capability(store_id, "restock"):
        return {"available": False, "note": "Store has no inventory integration"}
    out = connector_for(store_id).restock_item(order_id, sku)
    out["available"] = True
    return out


def payout_link(store_id: str, buyer_id: str, amount: float) -> dict:
    if not capability(store_id, "upi_payout"):
        raise CapabilityUnavailable("Store has no payout capability",
                                    store_id=store_id)
    return connector_for(store_id).payout_link(buyer_id, amount)


def notify(store_id: str, recipient: str, channel: str, message: str) -> dict:
    return connector_for(store_id).notify(recipient, channel, message)


def matches_catalogue_image(store_id: str, phash: str) -> dict | None:
    """Is this the store's own product photograph, handed back as evidence?

    The easiest attack on a system that accepts photographs is not a generated
    image at all: it is right-clicking the listing photo and uploading that. It
    is a real photograph of the real product with no generator markers, so
    provenance forensics has nothing to object to, and a vision model will
    confirm it shows exactly the item that was ordered.

    Perceptual, not exact: the buyer's copy has been through a screenshot, a
    resize and a re-encode, so the bytes differ while the picture does not.
    """
    if not phash:
        return None

    from ..evidence.forensics import hamming, perceptual_hash

    with session_scope() as db:
        orders = db.scalars(select(Order).where(Order.store_id == store_id)).all()
        catalogue = {(item.get("image") or "", item.get("title") or "")
                     for o in orders for item in (o.items or [])}

    for image, title in catalogue:
        if not image:
            continue
        path = settings.media_dir / image
        if not path.exists():
            continue
        if hamming(perceptual_hash(path), phash) <= 6:
            return {"image": image, "title": title}
    return None
