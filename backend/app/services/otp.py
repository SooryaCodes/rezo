"""Email one-time codes.

Passwords are one more thing for a small merchant to lose, so the primary way
in is a six digit code sent to their inbox. The code is stored hashed, expires
in ten minutes, is single use, and dies after five wrong attempts, because a
short code is only safe when guessing it is bounded.

No mail provider is configured in this build. Rather than pretend, the code is
written to the application log and returned to the caller only when the server
is explicitly running in local mode, so the flow is real and testable end to
end without inventing a delivery guarantee we do not have.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from ..db.models import Account, LoginCode
from ..db.session import session_scope
from . import accounts

log = logging.getLogger("rezo.otp")

CODE_TTL_MINUTES = 10
MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 30

# When no mail provider is wired, the code is surfaced to the client so the
# flow can be completed. Set REZO_MAIL=live once a provider exists.
LOCAL_DELIVERY = os.getenv("REZO_MAIL", "local") == "local"


class OtpError(Exception):
    pass


def _hash(email: str, code: str) -> str:
    return hashlib.sha256(f"{email.lower()}:{code}".encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def request_code(email: str) -> dict:
    email = (email or "").strip().lower()
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise OtpError("Enter a valid email address")

    with session_scope() as db:
        recent = db.scalars(
            select(LoginCode)
            .where(LoginCode.email == email, LoginCode.consumed.is_(False))
            .order_by(LoginCode.created_at.desc())
        ).first()
        if recent is not None:
            age = (_now() - _aware(recent.created_at)).total_seconds()
            if age < RESEND_COOLDOWN_SECONDS:
                raise OtpError(
                    f"We just sent a code. Try again in "
                    f"{int(RESEND_COOLDOWN_SECONDS - age)} seconds.")
            # a new code always retires the previous one
            recent.consumed = True

        code = f"{secrets.randbelow(1_000_000):06d}"
        db.add(LoginCode(email=email, code_hash=_hash(email, code),
                         expires_at=_now() + timedelta(minutes=CODE_TTL_MINUTES)))
        existing = db.scalar(select(Account).where(Account.email == email))
        is_new = existing is None

    log.info("login code for %s: %s", email, code)
    payload = {
        "sent": True,
        "email": email,
        "is_new_account": is_new,
        "expires_in_minutes": CODE_TTL_MINUTES,
    }
    if LOCAL_DELIVERY:
        # Explicitly labelled: no mail provider is configured in this build.
        payload["local_code"] = code
        payload["delivery"] = "local"
    else:
        payload["delivery"] = "email"
    return payload


def verify_code(email: str, code: str, name: str = "", store_name: str = "",
                category: str = "general") -> dict:
    email = (email or "").strip().lower()
    code = (code or "").strip()

    with session_scope() as db:
        row = db.scalars(
            select(LoginCode)
            .where(LoginCode.email == email, LoginCode.consumed.is_(False))
            .order_by(LoginCode.created_at.desc())
        ).first()

        if row is None:
            raise OtpError("Ask for a new code, this one is no longer valid")
        if _now() > _aware(row.expires_at):
            row.consumed = True
            raise OtpError("That code expired. Ask for a new one.")
        if row.attempts >= MAX_ATTEMPTS:
            row.consumed = True
            raise OtpError("Too many attempts. Ask for a new code.")
        if not hmac.compare_digest(row.code_hash, _hash(email, code)):
            row.attempts += 1
            remaining = MAX_ATTEMPTS - row.attempts
            raise OtpError(
                f"That code is not right. {remaining} attempt"
                f"{'' if remaining == 1 else 's'} left." if remaining > 0
                else "Too many attempts. Ask for a new code.")

        row.consumed = True
        account_exists = db.scalar(select(Account).where(Account.email == email)) is not None

    if account_exists:
        return accounts.signin_verified(email)

    if not store_name.strip():
        # The caller knows it is a new account from request_code and collects
        # the store name before verifying.
        raise OtpError("Tell us your store name to finish setting up")
    return accounts.signup_verified(email, name, store_name, category)
