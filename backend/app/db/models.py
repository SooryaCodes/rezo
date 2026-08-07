"""Persistence layer.

Multi-tenant by design: every row that matters carries store_id.
The audit log is append-only and written in the same transaction as any
money-moving action, so no refund can exist without its trace.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, DateTime, Float, ForeignKey, Integer,
                        String, Text, UniqueConstraint)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Store(Base):
    """A merchant on the platform. All engine behaviour varies by this row."""

    __tablename__ = "stores"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(32), default="general")

    # guardrails - enforced in code by the tools layer, never by a prompt
    auto_approve_cap: Mapped[float] = mapped_column(Float, default=500.0)
    fraud_threshold: Mapped[float] = mapped_column(Float, default=0.6)

    # capability flags: missing capabilities degrade gracefully
    # {"gateway_refund": true, "courier_pickup": false, "cod_only": false,
    #  "upi_payout": true, "restock": true}
    capabilities: Mapped[dict] = mapped_column(JSON, default=dict)

    # how the engine reaches this store's commerce backend
    connector: Mapped[str] = mapped_column(String(16), default="local")  # local | http
    connector_base_url: Mapped[str | None] = mapped_column(String(256), nullable=True)
    connector_secret: Mapped[str | None] = mapped_column(String(128), nullable=True)

    publishable_key: Mapped[str] = mapped_column(String(64), default="")
    secret_key: Mapped[str] = mapped_column(String(64), default="")

    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PolicyPack(Base):
    """Versioned clause pack. A dispute is judged against the pack in force on
    the PURCHASE date, not the claim date."""

    __tablename__ = "policy_packs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id"), index=True)
    version: Mapped[str] = mapped_column(String(16))
    effective_from: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    # [{id, title, text, claim_types[], window_days, outcome, exclusions[]}]
    clauses: Mapped[list] = mapped_column(JSON, default=list)


class Buyer(Base):
    """Platform-level identity: the same buyer can shop at many stores, which
    is what makes cross-store fraud intelligence possible."""

    __tablename__ = "buyers"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), default="")
    phone: Mapped[str] = mapped_column(String(32), default="")
    language: Mapped[str] = mapped_column(String(8), default="en")
    device_fingerprint: Mapped[str] = mapped_column(String(64), default="")
    address_hash: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id"), index=True)
    buyer_id: Mapped[str] = mapped_column(ForeignKey("buyers.id"), index=True)
    # [{sku, title, variant, qty, price, image, serial}]
    items: Mapped[list] = mapped_column(JSON, default=list)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    payment_method: Mapped[str] = mapped_column(String(16), default="prepaid")
    payment_ref: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(24), default="delivered")
    placed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    courier: Mapped[str] = mapped_column(String(32), default="")
    tracking_id: Mapped[str] = mapped_column(String(48), default="")
    # courier events power the logistics watchdog
    shipment_events: Mapped[list] = mapped_column(JSON, default=list)


class Dispute(Base):
    __tablename__ = "disputes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id"), index=True)
    order_id: Mapped[str] = mapped_column(String(48), index=True)
    buyer_id: Mapped[str] = mapped_column(String(32), index=True)

    claim_type: Mapped[str] = mapped_column(String(32), default="unknown")
    claim_value: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(32), default="open", index=True)
    escalation_level: Mapped[int] = mapped_column(Integer, default=0)

    state: Mapped[dict] = mapped_column(JSON, default=dict)  # full case state
    decision: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    opened_by: Mapped[str] = mapped_column(String(16), default="buyer")  # buyer | watchdog
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sla_due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dispute_id: Mapped[str] = mapped_column(ForeignKey("disputes.id"), index=True)
    tier: Mapped[str] = mapped_column(String(24))  # attested_live | camera_unattested | upload
    media_path: Mapped[str] = mapped_column(String(256), default="")
    media_kind: Mapped[str] = mapped_column(String(16), default="image")
    challenge_nonce: Mapped[str | None] = mapped_column(String(64), nullable=True)
    verification: Mapped[dict] = mapped_column(JSON, default=dict)
    # perceptual/content hash, correlated ACROSS stores to catch reused fakes
    content_hash: Mapped[str] = mapped_column(String(64), default="", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class CaptureSession(Base):
    """A live capture challenge. Random, time-boxed, single-use: a fake
    prepared in advance cannot satisfy an instruction issued seconds ago."""

    __tablename__ = "capture_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    dispute_id: Mapped[str] = mapped_column(ForeignKey("disputes.id"), index=True)
    nonce: Mapped[str] = mapped_column(String(64), unique=True)
    challenge: Mapped[str] = mapped_column(Text)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    expected_tokens: Mapped[list] = mapped_column(JSON, default=list)  # serial, tag text
    issued_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)


class AuditEntry(Base):
    """Append-only. No update or delete path exists in the application layer."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dispute_id: Mapped[str] = mapped_column(String(32), index=True)
    store_id: Mapped[str] = mapped_column(String(32), index=True)
    actor: Mapped[str] = mapped_column(String(48))
    action: Mapped[str] = mapped_column(String(64))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class RefundLedger(Base):
    """Unique dispute_id is the idempotency key: a retry cannot double-refund."""

    __tablename__ = "refund_ledger"
    __table_args__ = (UniqueConstraint("dispute_id", name="uq_refund_dispute"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dispute_id: Mapped[str] = mapped_column(String(32), index=True)
    store_id: Mapped[str] = mapped_column(String(32), index=True)
    amount: Mapped[float] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(24))  # gateway | settlement_adjust | upi_link
    approved_by: Mapped[str] = mapped_column(String(48))  # auto | seller:<id> | platform
    clause_id: Mapped[str] = mapped_column(String(32), default="")
    executed: Mapped[bool] = mapped_column(Boolean, default=False)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reference: Mapped[str] = mapped_column(String(64), default="")


class Precedent(Base):
    """Closed cases become retrievable precedents. Seller overrides carry the
    most weight because they encode that seller's own judgement."""

    __tablename__ = "precedents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[str] = mapped_column(String(32), index=True)
    dispute_id: Mapped[str] = mapped_column(String(32))
    claim_type: Mapped[str] = mapped_column(String(32))
    summary: Mapped[str] = mapped_column(Text)
    outcome: Mapped[str] = mapped_column(String(24))
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    was_override: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Account(Base):
    """A merchant operator. One account owns one store in this build; the
    schema allows more without change."""

    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(256))
    store_id: Mapped[str] = mapped_column(String(32), index=True)
    role: Mapped[str] = mapped_column(String(16), default="owner")  # owner | platform
    onboarding_step: Mapped[int] = mapped_column(Integer, default=0)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Session(Base):
    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class LoginCode(Base):
    """A one-time email code.

    Stored hashed with a fixed attempt budget: a six digit code is only safe if
    guessing it is bounded, so the row dies after five wrong tries.
    """

    __tablename__ = "login_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(160), index=True)
    code_hash: Mapped[str] = mapped_column(String(128))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
