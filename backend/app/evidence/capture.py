"""Live capture with challenge-response.

The primary defence against fabricated evidence is not classifying an image as
real or fake. It is refusing to accept an image whose origin we did not control.

When evidence is needed the server issues a random, time-boxed instruction and
a single-use nonce. Frames come back inside that session. An image prepared in
advance cannot satisfy an instruction that did not exist a few seconds earlier,
and a screen replay cannot produce a coherent multi-angle view of the specific
serial number that was shipped on that order.
"""
from __future__ import annotations

import random
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from ..config import settings
from ..db.models import CaptureSession
from ..db.session import session_scope

ISSUE_PHRASE = {
    "damage": "the damaged area",
    "wrong_item": "the item you received",
    "wrong_size": "the size label",
    "functional_defect": "the fault happening",
    "not_delivered": "the packaging you received",
}

# The unpredictable element. Parameters are randomised per session so the
# instruction cannot be anticipated or reused.
LIVENESS_MOVES = [
    "hold {n} fingers next to the item",
    "tilt the item slowly to the {side} so the light moves across it",
    "move the camera slowly around the item to show it from {side}",
    "place your thumb beside {issue} and hold still for two seconds",
]

SIDES = ["left", "right"]


def _tokens_for(order: dict) -> list[str]:
    """What we expect to see in frame: the serial or tag of the exact unit that
    was shipped on this order. Matching it is a lookup, not a probability."""
    tokens = []
    for item in order.get("items", []) or []:
        for key in ("serial", "sku"):
            value = item.get(key)
            if value:
                tokens.append(str(value))
    return list(dict.fromkeys(tokens))


def issue_challenge(dispute_id: str, order: dict, claim_type: str) -> dict:
    """Create a single-use capture session."""
    issue = ISSUE_PHRASE.get(claim_type, "the problem")
    move = random.choice(LIVENESS_MOVES).format(
        n=random.randint(2, 5), side=random.choice(SIDES), issue=issue)

    steps = [
        f"Point the camera at {issue} and keep it in frame",
        "Slowly turn the item so the label or serial number is visible in the "
        "same shot",
        f"Finally, {move}",
    ]
    if claim_type == "functional_defect":
        steps = [
            "Start recording and reproduce the problem so it is visible",
            "Show the settings or about screen with the serial number",
            f"Finally, {move}",
        ]

    now = datetime.now(timezone.utc)
    session = {
        "id": uuid.uuid4().hex[:16],
        "dispute_id": dispute_id,
        "nonce": secrets.token_urlsafe(24),
        "challenge": " -> ".join(steps),
        "steps": steps,
        "expected_tokens": _tokens_for(order),
        "expires_at": now + timedelta(seconds=settings.challenge_ttl_seconds),
    }

    with session_scope() as db:
        db.add(CaptureSession(
            id=session["id"], dispute_id=dispute_id, nonce=session["nonce"],
            challenge=session["challenge"], steps=session["steps"],
            expected_tokens=session["expected_tokens"],
            issued_at=now, expires_at=session["expires_at"], consumed=False))

    return {
        "session_id": session["id"],
        "nonce": session["nonce"],
        "steps": steps,
        "expires_at": session["expires_at"].isoformat(),
        "ttl_seconds": settings.challenge_ttl_seconds,
        "expected_tokens": session["expected_tokens"],
    }


def active_session(dispute_id: str) -> dict | None:
    """The live challenge for this case, if one is still valid.

    Issuance is idempotent: a buyer refreshing the page, or the graph replaying
    the node after resuming, must see the same instruction rather than a new
    one. Only expiry or use retires a challenge.
    """
    now = datetime.now(timezone.utc)
    with session_scope() as db:
        rows = (db.query(CaptureSession)
                .filter(CaptureSession.dispute_id == dispute_id,
                        CaptureSession.consumed.is_(False))
                .order_by(CaptureSession.issued_at.desc()).all())
        for row in rows:
            expires = row.expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires > now:
                return {"session_id": row.id, "nonce": row.nonce,
                        "steps": row.steps, "expires_at": expires.isoformat(),
                        "ttl_seconds": settings.challenge_ttl_seconds,
                        "expected_tokens": row.expected_tokens}
    return None


def resolve_session(nonce: str) -> dict | None:
    """Validate a nonce: it must exist, be unexpired and unused."""
    if not nonce:
        return None
    with session_scope() as db:
        row = db.query(CaptureSession).filter(CaptureSession.nonce == nonce).first()
        if row is None:
            return None
        expires = row.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return {
            "session_id": row.id,
            "dispute_id": row.dispute_id,
            "steps": row.steps,
            "expected_tokens": row.expected_tokens,
            "expired": datetime.now(timezone.utc) > expires,
            "consumed": row.consumed,
            "challenge": row.challenge,
        }


def consume_session(nonce: str) -> None:
    with session_scope() as db:
        row = db.query(CaptureSession).filter(CaptureSession.nonce == nonce).first()
        if row is not None:
            row.consumed = True


def classify_tier(nonce: str | None, source: str) -> tuple[str, str]:
    """Decide how much this evidence is worth.

    attested_live      captured in-session against a live challenge
    camera_unattested  came from a camera but outside a challenge session
    upload             an arbitrary file the buyer already had

    The tier scales the autonomy cap in the guardrail layer, so friction is
    proportional to risk rather than uniform.
    """
    if source == "live_capture" and nonce:
        session = resolve_session(nonce)
        if session is None:
            return "upload", "capture nonce not recognised"
        if session["expired"]:
            return "camera_unattested", "capture challenge expired before submission"
        if session["consumed"]:
            return "camera_unattested", "capture nonce already used"
        return "attested_live", "captured live against a server-issued challenge"
    if source == "camera":
        return "camera_unattested", "camera capture outside a challenge session"
    return "upload", "file uploaded by the buyer"
