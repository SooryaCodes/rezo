"""HTTP and WebSocket surface.

The graph is synchronous and can block for seconds, so it runs in a worker
thread while the event stream keeps flowing to whoever is watching.
"""
from __future__ import annotations

import asyncio
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import (APIRouter, BackgroundTasks, File, Form, HTTPException,
                     UploadFile, WebSocket, WebSocketDisconnect)
from pydantic import BaseModel
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from ..agents import events
from ..config import settings
from ..db.models import Buyer, Order, PolicyPack, Store
from ..db.session import session_scope
from ..evidence import capture as capture_mod
from ..services import disputes as svc
from ..services import watchdog
from ..tools import shop
from ..tools.errors import ToolError

router = APIRouter()


# --------------------------------------------------------------------------
# storefront reads
# --------------------------------------------------------------------------

@router.get("/stores")
def list_stores():
    with session_scope() as db:
        rows = db.scalars(select(Store)).all()
        return [{"id": s.id, "name": s.name, "category": s.category,
                 "auto_approve_cap": s.auto_approve_cap,
                 "fraud_threshold": s.fraud_threshold,
                 "capabilities": s.capabilities, "connector": s.connector,
                 "publishable_key": s.publishable_key,
                 "onboarded": s.onboarded} for s in rows]


@router.get("/stores/{store_id}")
def get_store(store_id: str):
    try:
        s = shop.get_store(store_id)
    except ToolError as exc:
        raise HTTPException(404, exc.message)
    return {"id": s.id, "name": s.name, "category": s.category,
            "auto_approve_cap": s.auto_approve_cap,
            "fraud_threshold": s.fraud_threshold, "capabilities": s.capabilities,
            "connector": s.connector, "publishable_key": s.publishable_key,
            "secret_key": s.secret_key, "onboarded": s.onboarded}


class StoreSettings(BaseModel):
    auto_approve_cap: float | None = None
    fraud_threshold: float | None = None
    capabilities: dict | None = None
    onboarded: bool | None = None


@router.patch("/stores/{store_id}")
def update_store(store_id: str, body: StoreSettings):
    """The autonomy slider in the seller dashboard writes here. This value is
    the guardrail: the tool layer reads it before any automated refund."""
    with session_scope() as db:
        store = db.get(Store, store_id)
        if store is None:
            raise HTTPException(404, "Unknown store")
        for field, value in body.model_dump(exclude_none=True).items():
            setattr(store, field, value)
    shop.append_audit("", store_id, "seller", "store_settings_updated",
                      body.model_dump(exclude_none=True))
    return get_store(store_id)


@router.get("/stores/{store_id}/policy")
def get_policy(store_id: str):
    with session_scope() as db:
        packs = db.scalars(select(PolicyPack)
                           .where(PolicyPack.store_id == store_id)).all()
        return [{"version": p.version,
                 "effective_from": p.effective_from.isoformat(),
                 "clauses": p.clauses} for p in packs]


class PolicyBody(BaseModel):
    clauses: list[dict]
    version: str | None = None


@router.put("/stores/{store_id}/policy")
def put_policy(store_id: str, body: PolicyBody):
    """The onboarding wizard compiles a seller's answers into clauses and posts
    them here as a new version. Older packs are never edited, so a dispute is
    always judged against the policy in force when the order was placed."""
    with session_scope() as db:
        existing = db.scalars(select(PolicyPack)
                              .where(PolicyPack.store_id == store_id)).all()
        version = body.version or f"v{len(existing) + 1}"
        db.add(PolicyPack(store_id=store_id, version=version,
                          effective_from=datetime.now(timezone.utc),
                          clauses=body.clauses))
        store = db.get(Store, store_id)
        if store:
            store.onboarded = True
    shop.append_audit("", store_id, "seller", "policy_published",
                      {"version": version, "clauses": len(body.clauses)})
    return {"published": True, "version": version}


@router.get("/stores/{store_id}/analytics")
def analytics(store_id: str):
    return svc.store_analytics(store_id)


@router.get("/orders")
def list_orders(store_id: str | None = None, buyer_id: str | None = None):
    with session_scope() as db:
        q = select(Order).order_by(Order.placed_at.desc())
        if store_id:
            q = q.where(Order.store_id == store_id)
        if buyer_id:
            q = q.where(Order.buyer_id == buyer_id)
        rows = db.scalars(q).all()
        buyers = {b.id: b.name for b in db.scalars(select(Buyer)).all()}
        stores = {s.id: s.name for s in db.scalars(select(Store)).all()}
        return [{"order_id": o.id, "store_id": o.store_id,
                 "store_name": stores.get(o.store_id, ""),
                 "buyer_id": o.buyer_id, "buyer_name": buyers.get(o.buyer_id, ""),
                 "items": o.items, "total": o.total, "status": o.status,
                 "payment_method": o.payment_method,
                 "placed_at": o.placed_at.isoformat(),
                 "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
                 "courier": o.courier, "tracking_id": o.tracking_id,
                 "shipment_events": o.shipment_events} for o in rows]


@router.get("/orders/{order_id}")
def get_order(order_id: str):
    with session_scope() as db:
        o = db.get(Order, order_id)
        if o is None:
            raise HTTPException(404, "Unknown order")
        store_id = o.store_id
    return shop.get_order(store_id, order_id)


# --------------------------------------------------------------------------
# disputes
# --------------------------------------------------------------------------

class OpenDispute(BaseModel):
    store_id: str
    order_id: str
    message: str
    buyer_id: str | None = None


@router.post("/disputes")
async def open_dispute(body: OpenDispute):
    try:
        return await run_in_threadpool(
            svc.open_dispute, body.store_id, body.order_id, body.message,
            body.buyer_id)
    except ToolError as exc:
        raise HTTPException(400, exc.message)


@router.get("/disputes")
def list_disputes(store_id: str | None = None, status: str | None = None):
    return svc.list_disputes(store_id, status)


@router.get("/disputes/{dispute_id}")
def get_dispute(dispute_id: str):
    try:
        return svc.get_dispute(dispute_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


class MessageBody(BaseModel):
    content: str
    role: str = "buyer"


@router.post("/disputes/{dispute_id}/messages")
async def post_message(dispute_id: str, body: MessageBody):
    return await run_in_threadpool(svc.add_message, dispute_id, body.content,
                                   body.role)


@router.get("/disputes/{dispute_id}/challenge")
def get_challenge(dispute_id: str):
    """What the buyer must show, and how long they have to do it."""
    session = capture_mod.active_session(dispute_id)
    if session is None:
        raise HTTPException(404, "No live capture challenge for this dispute")
    return {k: v for k, v in session.items() if k != "expected_tokens"}


@router.post("/disputes/{dispute_id}/evidence")
async def submit_evidence(
    dispute_id: str,
    files: list[UploadFile] = File(default=[]),
    source: str = Form("live_capture"),
    nonce: str | None = Form(None),
    observed_tokens: str = Form(""),
    sample: str | None = Form(None),
):
    """Accepts live-captured frames, an uploaded file, or a named demo sample."""
    paths: list[str] = []

    if sample:
        candidate = settings.media_dir / "samples" / sample
        if not candidate.exists():
            raise HTTPException(404, f"Unknown sample {sample}")
        target = settings.media_dir / f"{dispute_id}_{uuid.uuid4().hex[:6]}{candidate.suffix}"
        # A live capture is a new photograph every time; an upload is whatever
        # file the buyer already had, so it keeps its identity and can collide
        # with the same file submitted elsewhere.
        capture_mod.materialise(candidate, target, vary=source in ("live_capture", "camera"))
        paths.append(str(target))

    for upload in files or []:
        suffix = Path(upload.filename or "frame.jpg").suffix or ".jpg"
        target = settings.media_dir / f"{dispute_id}_{uuid.uuid4().hex[:6]}{suffix}"
        with target.open("wb") as fh:
            shutil.copyfileobj(upload.file, fh)
        paths.append(str(target))

    if not paths:
        raise HTTPException(400, "No evidence supplied")

    tokens = [t.strip() for t in observed_tokens.split(",") if t.strip()]
    try:
        return await run_in_threadpool(svc.submit_evidence, dispute_id, paths,
                                       source, nonce, tokens)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


class ApprovalBody(BaseModel):
    approved: bool
    by: str
    note: str = ""
    override_outcome: str | None = None
    override_amount: float | None = None


@router.post("/disputes/{dispute_id}/approve")
async def approve(dispute_id: str, body: ApprovalBody):
    try:
        return await run_in_threadpool(
            svc.record_approval, dispute_id, body.approved, body.by, body.note,
            body.override_outcome, body.override_amount)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/disputes/{dispute_id}/events")
def get_events(dispute_id: str, since: int = 0):
    return {"events": events.since(dispute_id, since)}


@router.websocket("/disputes/{dispute_id}/stream")
async def stream(websocket: WebSocket, dispute_id: str):
    """Live agent activity. The same stream drives the buyer's status list and
    the operator's agent graph."""
    await websocket.accept()
    cursor = 0
    try:
        while True:
            batch = events.since(dispute_id, cursor)
            if batch:
                cursor += len(batch)
                await websocket.send_json({"events": batch})
            await asyncio.sleep(0.25)
    except (WebSocketDisconnect, RuntimeError):
        return


# --------------------------------------------------------------------------
# platform operations
# --------------------------------------------------------------------------

@router.post("/watchdog/run")
async def run_watchdog():
    """Scan for stalled shipments and breached approval SLAs. In production this
    is a scheduled job; exposed here so it can be demonstrated on demand."""
    return await run_in_threadpool(watchdog.run_once)


@router.get("/integration/{store_id}")
def integration_status(store_id: str):
    """Keys and a live health check of the capability contract, so a merchant
    can see exactly which endpoints they have implemented."""
    from ..services import integration
    return integration.status(store_id)


@router.get("/platform/queue")
def platform_queue():
    """The arbitration desk: cases whose seller let the approval window lapse."""
    return svc.platform_queue()


def _reset_external_merchants() -> None:
    """Clear the books of any store that keeps its own.

    A demo is run more than once. Reseeding our side while an external merchant
    still holds last run's refunds is how the second demo shows a refund that
    was never issued during it.
    """
    from datetime import datetime, timezone

    import httpx

    from ..db.models import Store
    from ..db.session import session_scope
    from ..tools.connectors.http import sign

    with session_scope() as db:
        targets = [(s.connector_base_url, s.connector_secret, s.id)
                   for s in db.query(Store).filter(Store.connector == "http").all()
                   if s.connector_base_url]

    for base, secret, store_id in targets:
        body = "{}"
        ts = str(int(datetime.now(timezone.utc).timestamp()))
        try:
            httpx.post(f"{base.rstrip('/')}/rezo/reset", content=body, timeout=5.0,
                       headers={"Content-Type": "application/json",
                                "X-Rezo-Store": store_id, "X-Rezo-Timestamp": ts,
                                "X-Rezo-Signature": sign(secret or "", ts, body)})
        except httpx.HTTPError:
            # A merchant that is down must not stop our own reset.
            pass


@router.post("/stores/{store_id}/sample-orders")
async def add_sample_orders(store_id: str):
    """Put a handful of orders in this merchant's own store.

    Without them a new account's first dispute lands on a demo store and their
    own dashboard stays empty, which reads as the product not working.
    """
    from ..seed import seed_sample_orders
    created = await run_in_threadpool(seed_sample_orders, store_id)
    return {"created": created}


@router.post("/demo/reset")
async def reset_demo():
    """Return the environment to its seeded state.

    Demos are run more than once, and a half-finished case from the previous
    run is the classic way a live demo goes wrong.
    """
    from ..seed import seed
    from ..agents import events as ev
    import app.agents.graph as graph_module

    def _reset():
        result = seed(reset=True)
        _reset_external_merchants()
        graph_module._engine = None  # drop checkpoints with the data
        ev._STREAMS.clear()
        return result

    return await run_in_threadpool(_reset)
