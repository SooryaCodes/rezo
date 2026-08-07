"""The shared case state.

This object is the collaboration medium. Agents never message each other: each
one reads the case, performs a single job, writes its findings back, and the
graph decides who runs next. That keeps every agent independently testable and
the whole flow auditable.

It is checkpointed after every step, which is what lets a case freeze for human
approval for three days and resume exactly where it paused.
"""
from __future__ import annotations

import operator
from typing import Annotated, Literal, Optional, TypedDict


def merge_usage(current: dict, incoming: dict) -> dict:
    """Nodes running in the same step both report token usage. The client keeps
    running totals, so the later snapshot supersedes the earlier one."""
    if not current:
        return incoming or {}
    if not incoming:
        return current
    return incoming if incoming.get("calls", 0) >= current.get("calls", 0) else current

ClaimType = Literal[
    "damage", "wrong_item", "wrong_size", "not_delivered",
    "functional_defect", "warranty", "change_of_mind", "other",
]

Outcome = Literal[
    "full_refund", "partial_refund", "replacement", "coupon", "reject", "escalate",
]

EvidenceTier = Literal["attested_live", "camera_unattested", "upload", "none"]


class EvidenceReport(TypedDict, total=False):
    tier: EvidenceTier
    verified: bool
    confidence: float
    damage_type: Optional[str]
    serial_match: Optional[bool]
    challenge_satisfied: Optional[bool]
    forensics_flags: list[str]
    forensics_summary: str
    media: list[str]
    notes: str


class PolicyVerdict(TypedDict, total=False):
    eligible: bool
    clause_id: str
    clause_title: str
    clause_text: str
    policy_version: str
    prescribed_outcome: str
    within_window: bool
    days_since_delivery: Optional[int]
    exclusions_hit: list[str]
    reason: str
    verified_in_code: bool


class FraudAssessment(TypedDict, total=False):
    score: float
    signals: list[str]
    raw_signals: dict
    recommendation: str


class Decision(TypedDict, total=False):
    outcome: Outcome
    amount: float
    rationale: str
    confidence: float
    alternatives_considered: list[str]


class GuardrailResult(TypedDict, total=False):
    route: Literal["auto", "seller", "platform", "terminal"]
    reasons: list[str]
    effective_cap: float
    store_cap: float


class DisputeState(TypedDict, total=False):
    # identity and scope: every read and write is tenant-scoped by store_id
    dispute_id: str
    store_id: str
    store_name: str
    order_id: str
    buyer_id: str
    buyer_name: str

    # conversation
    messages: Annotated[list[dict], operator.add]
    language: str
    claim_type: ClaimType
    claim_value: float
    order: dict

    # evidence acquisition
    capture: dict            # the issued challenge
    submitted_evidence: dict  # what the buyer sent back

    # specialist findings
    evidence: EvidenceReport
    policy: PolicyVerdict
    fraud: FraudAssessment
    decision: Decision
    guardrail: GuardrailResult

    # human involvement
    approval: dict
    escalation_level: int
    dossier: dict

    # execution
    execution: dict
    status: str

    # observability
    events: Annotated[list[dict], operator.add]
    usage: Annotated[dict, merge_usage]
