"""Shared dispute case state.

This object is the collaboration medium: agents never message each other.
Each agent reads the case state, performs its single job, and writes its
findings back. The graph (see graph.py) decides which agent runs next.
Checkpointed after every step, so a case can freeze (human approval) or
survive a crash and resume exactly where it stopped.
"""
from typing import Optional, Literal, TypedDict


ClaimType = Literal[
    "damage", "wrong_item", "wrong_size", "not_delivered",
    "functional_defect", "warranty", "subscription", "other",
]

Outcome = Literal[
    "full_refund", "partial_refund", "replacement",
    "coupon", "reject", "escalate",
]


class EvidenceReport(TypedDict, total=False):
    tier: Literal["attested_live", "camera_unattested", "upload"]
    verified: bool
    damage_type: Optional[str]
    serial_match: Optional[bool]
    confidence: float
    forensics_flags: list[str]          # e.g. ["no_exif", "c2pa_ai_generated"]


class PolicyVerdict(TypedDict, total=False):
    eligible: bool
    clause_id: str                      # verified against the store's pack in code
    clause_text: str                    # quoted verbatim in the decision record
    policy_version: str                 # the pack in force on the purchase date
    exclusions_hit: list[str]


class FraudAssessment(TypedDict, total=False):
    score: float                        # 0.0 - 1.0
    signals: list[str]                  # e.g. ["4_claims_60d", "account_age_14d"]
    cross_store_hits: int               # platform-level: same buyer across stores


class Decision(TypedDict, total=False):
    outcome: Outcome
    amount: float
    rationale: str
    confidence: float
    alternatives_considered: list[str]


class DisputeState(TypedDict, total=False):
    # identity & scope (multi-tenant: everything hangs off store_id)
    dispute_id: str
    store_id: str
    order_id: str
    buyer_id: str

    # conversation
    messages: list[dict]
    claim_type: Optional[ClaimType]
    claim_value: float

    # findings, written by each specialist agent
    evidence: EvidenceReport
    policy: PolicyVerdict
    fraud: FraudAssessment
    decision: Decision

    # control flow
    status: Literal[
        "open", "gathering_evidence", "deciding",
        "awaiting_seller_approval", "awaiting_platform_review",
        "executing", "closed", "rejected",
    ]
    escalation_level: int               # 0 = agents, 1 = seller, 2 = platform
    human_note: Optional[str]           # override reason -> learning precedent
