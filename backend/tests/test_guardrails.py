"""The guardrail layer is the reason an LLM can be trusted near money.

Every test here is an attempt to make the system do something it must refuse.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.db.models import Dispute, RefundLedger
from app.db.session import init_db, session_scope
from app.seed import seed
from app.tools import shop
from app.tools.errors import GuardrailViolation, NotFound


@pytest.fixture(scope="module", autouse=True)
def environment():
    init_db()
    seed(reset=True)


def make_dispute(store_id: str, order_id: str, buyer_id: str,
                 claim_type: str = "damage", value: float = 749.0) -> str:
    did = f"D-{uuid.uuid4().hex[:8]}"
    with session_scope() as db:
        db.add(Dispute(id=did, store_id=store_id, order_id=order_id,
                       buyer_id=buyer_id, claim_type=claim_type,
                       claim_value=value, status="deciding", state={}))
    return did


# ---------------------------------------------------------------- amounts

def test_negative_refund_is_refused():
    did = make_dispute("st_rehana", "ORD-2041", "by_arjun")
    with pytest.raises(GuardrailViolation):
        shop.issue_refund(did, -100, approved_by="seller:st_rehana",
                          clause_id="CL-4.2", claim_type="damage")


def test_refund_cannot_exceed_what_was_paid():
    did = make_dispute("st_rehana", "ORD-2041", "by_arjun")
    with pytest.raises(GuardrailViolation) as exc:
        shop.issue_refund(did, 5000, approved_by="seller:st_rehana",
                          clause_id="CL-4.2", claim_type="damage")
    assert "exceeds order total" in str(exc.value)


# ---------------------------------------------------------------- clauses

def test_hallucinated_clause_cannot_pass():
    """The Policy Agent must cite a clause id. This is what decides if it exists."""
    did = make_dispute("st_rehana", "ORD-2041", "by_arjun")
    with pytest.raises(GuardrailViolation) as exc:
        shop.issue_refund(did, 500, approved_by="auto", clause_id="CL-9.9",
                          evidence_tier="attested_live", claim_type="damage")
    assert "does not exist" in str(exc.value)


def test_clause_must_cover_the_claim_type():
    did = make_dispute("st_rehana", "ORD-2041", "by_arjun", claim_type="damage")
    # CL-4.4 is change-of-mind, not damage
    with pytest.raises(GuardrailViolation) as exc:
        shop.issue_refund(did, 400, approved_by="auto", clause_id="CL-4.4",
                          evidence_tier="attested_live", claim_type="damage")
    assert "does not cover claim type" in str(exc.value)


def test_autonomous_refund_must_cite_a_clause():
    did = make_dispute("st_rehana", "ORD-2041", "by_arjun")
    with pytest.raises(GuardrailViolation):
        shop.issue_refund(did, 200, approved_by="auto", clause_id="",
                          evidence_tier="attested_live")


# ---------------------------------------------------------------- caps

def test_auto_refund_over_store_cap_is_refused():
    """Rehana's cap is 800. An agent asking for 4200 without a human must fail."""
    did = make_dispute("st_rehana", "ORD-2044", "by_meera", value=4200)
    with pytest.raises(GuardrailViolation) as exc:
        shop.issue_refund(did, 4200, approved_by="auto", clause_id="CL-4.2",
                          evidence_tier="attested_live", claim_type="damage")
    assert "exceeds the autonomous limit" in str(exc.value)


def test_same_refund_succeeds_once_a_human_approves():
    did = make_dispute("st_rehana", "ORD-2044", "by_meera", value=4200)
    out = shop.issue_refund(did, 4200, approved_by="seller:st_rehana",
                            clause_id="CL-4.2", evidence_tier="attested_live",
                            claim_type="damage")
    assert out["reference"].startswith("rfnd_")
    assert out["idempotent"] is False


def test_evidence_tier_scales_the_autonomous_cap():
    """Attested live capture unlocks the full cap; an upload unlocks a quarter."""
    assert shop.effective_cap("st_rehana", "attested_live") == 800.0
    assert shop.effective_cap("st_rehana", "camera_unattested") == 400.0
    assert shop.effective_cap("st_rehana", "upload") == 200.0
    assert shop.effective_cap("st_rehana", "none") == 0.0

    did = make_dispute("st_rehana", "ORD-2041", "by_arjun")
    # 700 is inside the store cap but outside the upload tier's share of it
    with pytest.raises(GuardrailViolation):
        shop.issue_refund(did, 700, approved_by="auto", clause_id="CL-4.2",
                          evidence_tier="upload", claim_type="damage")

    # the very same amount clears once evidence was captured live
    out = shop.issue_refund(did, 700, approved_by="auto", clause_id="CL-4.2",
                            evidence_tier="attested_live", claim_type="damage")
    assert out["idempotent"] is False


# ---------------------------------------------------------------- idempotency

def test_retrying_a_refund_is_a_no_op():
    did = make_dispute("st_rehana", "ORD-2041", "by_arjun")
    first = shop.issue_refund(did, 749, approved_by="seller:st_rehana",
                              clause_id="CL-4.2", claim_type="damage")
    second = shop.issue_refund(did, 749, approved_by="seller:st_rehana",
                               clause_id="CL-4.2", claim_type="damage")
    assert second["idempotent"] is True
    assert second["reference"] == first["reference"]

    with session_scope() as db:
        rows = db.query(RefundLedger).filter(RefundLedger.dispute_id == did).all()
    assert len(rows) == 1, "a retry must not create a second ledger row"


def test_refund_writes_an_audit_trail():
    from app.db.models import AuditEntry
    did = make_dispute("st_rehana", "ORD-2041", "by_arjun")
    shop.issue_refund(did, 300, approved_by="seller:st_rehana",
                      clause_id="CL-4.2", claim_type="damage")
    with session_scope() as db:
        entries = db.query(AuditEntry).filter(AuditEntry.dispute_id == did).all()
    actions = [e.action for e in entries]
    assert "refund_executed" in actions


# ---------------------------------------------------------------- policy versions

def test_policy_pack_is_resolved_as_of_the_purchase_date():
    """A policy change after purchase must not be applied backwards."""
    old = shop.get_policy_pack("st_rehana", datetime(2025, 6, 1, tzinfo=timezone.utc))
    new = shop.get_policy_pack("st_rehana", datetime.now(timezone.utc))
    assert old["version"] == "v1"
    assert new["version"] == "v2"
    assert old["clauses"][0]["window_days"] == 3
    assert any(c["id"] == "CL-4.2" and c["window_days"] == 7 for c in new["clauses"])


def test_window_expiry_is_reported():
    long_ago = datetime.now(timezone.utc) - timedelta(days=40)
    result = shop.verify_clause("st_rehana", "CL-4.2", "damage",
                                purchase_date=datetime.now(timezone.utc),
                                delivered_at=long_ago)
    assert result["within_window"] is False
    assert result["days_since_delivery"] >= 40


# ---------------------------------------------------------------- capabilities

def test_missing_courier_integration_degrades_instead_of_failing():
    """Urban Leaf has no pickup integration. The dispute must still resolve."""
    did = make_dispute("st_urbanleaf", "ORD-2045", "by_meera",
                       claim_type="not_delivered", value=2499)
    out = shop.create_return_pickup("st_urbanleaf", did, "ORD-2045")
    assert out["available"] is False
    assert out["fallback"] == "manual_return"


def test_cod_store_refunds_via_payout_link():
    assert shop.refund_method_for("st_urbanleaf", "cod") == "upi_link"
    assert shop.refund_method_for("st_rehana", "prepaid") == "gateway"


# ---------------------------------------------------------------- cross-store

def test_cross_store_fraud_signal_sees_what_one_store_cannot():
    seed(reset=True)  # clear disputes created by the guardrail tests above
    clean = shop.get_buyer_history_across_stores("by_arjun")
    repeat = shop.get_buyer_history_across_stores("by_rahul")

    assert clean["claims_last_60d"] == 0
    assert repeat["claims_last_60d"] >= 3
    assert repeat["stores_claimed_against"] >= 3
    assert repeat["account_age_days"] < 30

    # a single store only sees its own slice of that history
    single_store = shop.get_customer_history("st_techkart", "by_rahul")
    assert single_store["disputes_count"] == 0


def test_unknown_store_and_order_raise_not_found():
    with pytest.raises(NotFound):
        shop.get_store("st_nope")
    with pytest.raises(NotFound):
        shop.get_order("st_rehana", "ORD-DOES-NOT-EXIST")
