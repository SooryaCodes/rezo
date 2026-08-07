"""Persistence layer.

Multi-tenant by design: every row that matters carries store_id.
The audit log is append-only and written in the same transaction as any
money-moving action - no refund exists without its trace.
"""
from datetime import datetime

from sqlalchemy import (JSON, Boolean, DateTime, Float, ForeignKey, Integer,
                        String, Text)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Store(Base):
    __tablename__ = "stores"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    # per-store configuration: the engine is generic, variation is data
    auto_approve_cap: Mapped[float] = mapped_column(Float, default=500.0)
    fraud_threshold: Mapped[float] = mapped_column(Float, default=0.6)
    capabilities: Mapped[dict] = mapped_column(JSON, default=dict)
    # e.g. {"gateway_refund": true, "courier_pickup": false, "cod_only": false}


class PolicyPack(Base):
    __tablename__ = "policy_packs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id"), index=True)
    version: Mapped[str] = mapped_column(String(16))
    effective_from: Mapped[datetime] = mapped_column(DateTime)
    # clauses are structured, not prose: {id, condition, outcome, exclusions}
    clauses: Mapped[list] = mapped_column(JSON)
    # disputes are judged against the pack in force on the PURCHASE date


class Dispute(Base):
    __tablename__ = "disputes"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id"), index=True)
    order_id: Mapped[str] = mapped_column(String(64), index=True)
    buyer_id: Mapped[str] = mapped_column(String(64), index=True)
    claim_type: Mapped[str] = mapped_column(String(32))
    claim_value: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), index=True)
    escalation_level: Mapped[int] = mapped_column(Integer, default=0)
    state: Mapped[dict] = mapped_column(JSON)  # full checkpointed case state
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Evidence(Base):
    __tablename__ = "evidence"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dispute_id: Mapped[str] = mapped_column(ForeignKey("disputes.id"), index=True)
    tier: Mapped[str] = mapped_column(String(24))   # attested_live / camera / upload
    media_path: Mapped[str] = mapped_column(String(256))
    challenge_nonce: Mapped[str | None] = mapped_column(String(64), nullable=True)
    verification: Mapped[dict] = mapped_column(JSON)  # report incl. forensics flags
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    # hashed across stores -> reused fake photos surface at platform level


class AuditEntry(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dispute_id: Mapped[str] = mapped_column(ForeignKey("disputes.id"), index=True)
    store_id: Mapped[str] = mapped_column(String(32), index=True)
    actor: Mapped[str] = mapped_column(String(48))   # agent name / seller / platform
    action: Mapped[str] = mapped_column(String(64))
    detail: Mapped[dict] = mapped_column(JSON)
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # append-only: no update or delete paths exist in the application layer


class RefundLedger(Base):
    __tablename__ = "refund_ledger"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dispute_id: Mapped[str] = mapped_column(ForeignKey("disputes.id"), unique=True)
    # unique dispute_id = idempotency: a retry cannot double-refund
    store_id: Mapped[str] = mapped_column(String(32), index=True)
    amount: Mapped[float] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(24))  # gateway / settlement_adjust / upi_link
    approved_by: Mapped[str] = mapped_column(String(48))  # "auto" / seller id / platform
    executed: Mapped[bool] = mapped_column(Boolean, default=False)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
