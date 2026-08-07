"""Accounts, sessions and merchant onboarding.

Signing up creates the merchant's store, a starter policy pack derived from
their category, and safe default guardrails, so a new account is never in a
state where the engine could act without limits.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from ..db.models import Account, PolicyPack, Session, Store
from ..db.session import session_scope

SESSION_DAYS = 30
PBKDF_ROUNDS = 200_000


# --------------------------------------------------------------------------
# passwords
# --------------------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(),
                                 PBKDF_ROUNDS).hex()
    return f"pbkdf2${PBKDF_ROUNDS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, rounds, salt, digest = stored.split("$")
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(),
                                        int(rounds)).hex()
        return hmac.compare_digest(candidate, digest)
    except (ValueError, AttributeError):
        return False


# --------------------------------------------------------------------------
# starter policy
# --------------------------------------------------------------------------

STARTER_WINDOWS = {"clothing": 7, "electronics": 10, "home": 5, "beauty": 5,
                   "general": 7}


def starter_clauses(category: str) -> list[dict]:
    window = STARTER_WINDOWS.get(category, 7)
    return [
        {"id": "P-1", "title": "Order not delivered",
         "text": "If a shipment is not delivered within 10 days of dispatch, or the "
                 "courier marks it undelivered, lost or stuck in transit, the order "
                 "is refunded in full without waiting for the parcel to be returned.",
         "claim_types": ["not_delivered"], "window_days": 30,
         "outcome": "full_refund", "exclusions": []},
        {"id": "P-2", "title": "Damaged on arrival",
         "text": f"Items that arrive damaged must be reported within {window} days of "
                 f"delivery with photographic evidence of the damage. Verified claims "
                 f"receive a full refund or a free replacement at the buyer's choice.",
         "claim_types": ["damage"], "window_days": window,
         "outcome": "full_refund", "exclusions": ["custom_made"]},
        {"id": "P-3", "title": "Wrong item or size delivered",
         "text": f"If the delivered item does not match the order in design, colour or "
                 f"size, the buyer receives a replacement in the correct variant, or a "
                 f"full refund if it is unavailable. Report within {window} days.",
         "claim_types": ["wrong_item", "wrong_size"], "window_days": window,
         "outcome": "replacement", "exclusions": []},
        {"id": "P-4", "title": "Change of mind",
         "text": "Unused items in original packaging with tags intact may be returned "
                 "within 3 days of delivery for a refund of the item price. Original "
                 "shipping charges are not refunded.",
         "claim_types": ["change_of_mind"], "window_days": 3,
         "outcome": "partial_refund", "exclusions": ["sale_item", "custom_made"]},
    ]


# --------------------------------------------------------------------------
# sign up / in
# --------------------------------------------------------------------------

class AuthError(Exception):
    pass


def _issue_session(db, account_id: str) -> str:
    token = secrets.token_urlsafe(32)
    db.add(Session(token=token, account_id=account_id,
                   expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)))
    return token


def _key(prefix: str, seed: str) -> str:
    return f"{prefix}_{hashlib.sha256((prefix + seed).encode()).hexdigest()[:24]}"


def signup(email: str, password: str, name: str, store_name: str,
           category: str = "general") -> dict:
    email = (email or "").strip().lower()
    if not email or "@" not in email:
        raise AuthError("Enter a valid email address")
    if len(password or "") < 8:
        raise AuthError("Use at least 8 characters for your password")
    if not store_name.strip():
        raise AuthError("Your store needs a name")

    with session_scope() as db:
        if db.scalar(select(Account).where(Account.email == email)):
            raise AuthError("An account with this email already exists")

        store_id = "st_" + secrets.token_hex(6)
        account_id = "ac_" + secrets.token_hex(6)

        db.add(Store(
            id=store_id, name=store_name.strip(), category=category,
            # Safe by default: a brand new store resolves only small claims on
            # its own until the operator raises the limit deliberately.
            auto_approve_cap=500.0, fraud_threshold=0.6,
            capabilities={"gateway_refund": True, "courier_pickup": False,
                          "restock": False, "upi_payout": True, "cod_only": False},
            connector="local", onboarded=False,
            publishable_key=_key("pk", store_id), secret_key=_key("sk", store_id)))

        db.add(PolicyPack(store_id=store_id, version="v1",
                          effective_from=datetime.now(timezone.utc),
                          clauses=starter_clauses(category)))

        db.add(Account(id=account_id, email=email, name=name.strip(),
                       password_hash=hash_password(password), store_id=store_id,
                       onboarding_step=1))

        token = _issue_session(db, account_id)

    return {"token": token, "account": {"id": account_id, "email": email,
                                        "name": name, "store_id": store_id,
                                        "onboarding_step": 1},
            "store": {"id": store_id, "name": store_name, "category": category}}


def signup_verified(email: str, name: str, store_name: str,
                    category: str = "general") -> dict:
    """Create the workspace for an address a one-time code has just proven."""
    return signup(email, secrets.token_urlsafe(24), name, store_name, category)


def signin_verified(email: str) -> dict:
    """Start a session for an address a one-time code has just proven."""
    email = (email or "").strip().lower()
    with session_scope() as db:
        account = db.scalar(select(Account).where(Account.email == email))
        if account is None:
            raise AuthError("No account for that address")
        token = _issue_session(db, account.id)
        store = db.get(Store, account.store_id)
        return {"token": token,
                "account": {"id": account.id, "email": account.email,
                            "name": account.name, "store_id": account.store_id,
                            "onboarding_step": account.onboarding_step},
                "store": {"id": store.id, "name": store.name,
                          "category": store.category} if store else {}}


def signin(email: str, password: str) -> dict:
    email = (email or "").strip().lower()
    with session_scope() as db:
        account = db.scalar(select(Account).where(Account.email == email))
        if account is None or not verify_password(password, account.password_hash):
            raise AuthError("That email and password do not match")
        token = _issue_session(db, account.id)
        store = db.get(Store, account.store_id)
        return {"token": token,
                "account": {"id": account.id, "email": account.email,
                            "name": account.name, "store_id": account.store_id,
                            "onboarding_step": account.onboarding_step},
                "store": {"id": store.id, "name": store.name,
                          "category": store.category} if store else {}}


def sample_session(store_id: str = "st_rehana") -> dict:
    """Sign in to a pre-populated store to look around without signing up.

    Kept explicitly separate from real accounts and flagged as a sample, so
    nothing about the evaluation of the product depends on a fake identity.
    """
    with session_scope() as db:
        store = db.get(Store, store_id)
        if store is None:
            raise AuthError("Sample store is unavailable")
        account = db.scalar(select(Account).where(Account.store_id == store_id,
                                                  Account.is_sample.is_(True)))
        if account is None:
            account = Account(id="ac_sample_" + secrets.token_hex(3),
                              email=f"sample+{store_id}@rezo.app",
                              name=store.name + " (sample)",
                              password_hash=hash_password(secrets.token_hex(16)),
                              store_id=store_id, onboarding_step=99, is_sample=True)
            db.add(account)
            db.flush()
        token = _issue_session(db, account.id)
        return {"token": token, "sample": True,
                "account": {"id": account.id, "email": account.email,
                            "name": account.name, "store_id": store_id,
                            "onboarding_step": 99},
                "store": {"id": store.id, "name": store.name,
                          "category": store.category}}


def _rebuild_store(db, account: Account) -> Store:
    """Re-provision a workspace for an account whose store has vanished."""
    store = Store(
        id=account.store_id,
        name="Your store",
        category="general",
        auto_approve_cap=500.0,
        fraud_threshold=0.6,
        capabilities={"gateway_refund": True, "courier_pickup": False,
                      "restock": False, "upi_payout": True, "cod_only": False},
        connector="local",
        onboarded=False,
        publishable_key=_key("pk", account.store_id),
        secret_key=_key("sk", account.store_id),
    )
    db.add(store)
    db.add(PolicyPack(store_id=account.store_id, version="v1",
                      effective_from=datetime.now(timezone.utc),
                      clauses=starter_clauses("general")))
    # Back to setup, so they name the store and set their own limit.
    account.onboarding_step = 1
    db.flush()
    return store


def resolve(token: str) -> dict:
    if not token:
        raise AuthError("Not signed in")
    with session_scope() as db:
        session = db.get(Session, token)
        if session is None:
            raise AuthError("Session not found, please sign in again")
        expires = session.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            raise AuthError("Session expired, please sign in again")
        account = db.get(Account, session.account_id)
        if account is None:
            raise AuthError("This account no longer exists")
        store = db.get(Store, account.store_id)
        if store is None:
            # The account is real; its store went missing. Stranding someone
            # outside an account they legitimately own is the worst possible
            # answer, so rebuild the workspace and put them back at setup. The
            # old store's data is gone either way — this at least returns the
            # door key.
            store = _rebuild_store(db, account)
        return {"account": {"id": account.id, "email": account.email,
                            "name": account.name, "store_id": account.store_id,
                            "onboarding_step": account.onboarding_step,
                            "is_sample": account.is_sample},
                "store": {"id": store.id, "name": store.name,
                          "category": store.category,
                          "auto_approve_cap": store.auto_approve_cap,
                          "onboarded": store.onboarded,
                          "publishable_key": store.publishable_key} if store else {}}


def signout(token: str) -> None:
    with session_scope() as db:
        session = db.get(Session, token)
        if session is not None:
            db.delete(session)


def set_onboarding_step(account_id: str, step: int) -> None:
    with session_scope() as db:
        account = db.get(Account, account_id)
        if account is not None:
            account.onboarding_step = step
            if step >= 99:
                store = db.get(Store, account.store_id)
                if store is not None:
                    store.onboarded = True
