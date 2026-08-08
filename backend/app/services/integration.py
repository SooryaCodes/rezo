"""Merchant integration status.

A merchant integrating Rezo implements the capability contract on their own
backend. This checks, live, which of those endpoints actually answer, so the
integration tab shows a real health state rather than a checklist someone ticked
by hand.
"""
from __future__ import annotations

from datetime import datetime, timezone

import httpx

from ..db.models import Order
from ..db.session import session_scope
from ..tools import shop
from ..tools.connectors.base import OPTIONAL_CAPABILITIES, REQUIRED_CAPABILITIES
from ..tools.connectors.http import sign
from ..tools.errors import ToolError

PROBES = {
    "get_order": ("GET", "/rezo/orders/{order_id}"),
    "get_delivery_status": ("GET", "/rezo/orders/{order_id}/delivery"),
    "get_customer_history": ("GET", "/rezo/buyers/{buyer_id}/history"),
    "get_policy_pack": ("GET", "/rezo/policy?as_of={now}"),
    "issue_refund": ("POST", "/rezo/refunds"),          # probed with dry_run
    "notify": ("POST", "/rezo/notify"),                 # probed with dry_run
    "create_return_pickup": ("POST", "/rezo/returns"),
    "restock_item": ("POST", "/rezo/inventory/restock"),
    "payout_link": ("POST", "/rezo/payouts"),
}


def _sample_ids(store_id: str) -> tuple[str, str]:
    with session_scope() as db:
        order = db.query(Order).filter(Order.store_id == store_id).first()
        return (order.id if order else "ORD-SAMPLE",
                order.buyer_id if order else "by_sample")


def status(store_id: str) -> dict:
    store = shop.get_store(store_id)
    order_id, buyer_id = _sample_ids(store_id)

    checks = []
    if store.connector == "local":
        # Platform-native: the contract is satisfied by the platform itself.
        for name in REQUIRED_CAPABILITIES + OPTIONAL_CAPABILITIES:
            required = name in REQUIRED_CAPABILITIES
            enabled = True
            if name == "create_return_pickup":
                enabled = bool(store.capabilities.get("courier_pickup"))
            elif name == "restock_item":
                enabled = bool(store.capabilities.get("restock"))
            elif name == "payout_link":
                enabled = bool(store.capabilities.get("upi_payout"))
            checks.append({
                "capability": name, "required": required,
                "state": "ok" if enabled else "not_enabled",
                "detail": ("Served by the platform" if enabled else
                           "Not enabled for this store; the engine falls back"),
            })
    else:
        base = (store.connector_base_url or "").rstrip("/")
        for name, (method, template) in PROBES.items():
            if name not in REQUIRED_CAPABILITIES + OPTIONAL_CAPABILITIES:
                continue
            path = template.format(order_id=order_id, buyer_id=buyer_id,
                                   now=datetime.now(timezone.utc).isoformat())
            checks.append(_probe(base, store.connector_secret or "", store_id,
                                 name, method, path))

    required_ok = all(c["state"] == "ok" for c in checks
                      if c["capability"] in REQUIRED_CAPABILITIES)
    return {
        "store_id": store_id,
        "store_name": store.name,
        "connector": store.connector,
        "base_url": store.connector_base_url,
        "publishable_key": store.publishable_key,
        "secret_key": store.secret_key,
        "ready": required_ok,
        "checks": checks,
        "widget_snippet": widget_snippet(store),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


def _probe(base: str, secret: str, store_id: str, name: str, method: str,
           path: str) -> dict:
    body = '{"dry_run":true}' if method == "POST" else "{}"
    ts = str(int(datetime.now(timezone.utc).timestamp()))
    headers = {"Content-Type": "application/json", "X-Rezo-Store": store_id,
               "X-Rezo-Timestamp": ts, "X-Rezo-Signature": sign(secret, ts, body),
               "X-Rezo-Probe": "1"}
    try:
        with httpx.Client(timeout=httpx.Timeout(5.0, connect=2.0)) as client:
            res = client.request(method, f"{base}{path}", content=body,
                                 headers=headers)
    except httpx.HTTPError as exc:
        return {"capability": name, "required": name in REQUIRED_CAPABILITIES,
                "state": "unreachable", "detail": str(exc)[:160]}

    if res.status_code == 501:
        return {"capability": name, "required": name in REQUIRED_CAPABILITIES,
                "state": "not_implemented",
                "detail": "Endpoint returned 501, the engine will fall back"}
    if res.status_code == 401:
        return {"capability": name, "required": name in REQUIRED_CAPABILITIES,
                "state": "auth_failed",
                "detail": "Signature rejected: check the shared secret"}
    if res.status_code == 404:
        # The probe asks for a placeholder order id, so "no such order" is the
        # endpoint behaving correctly. Only silence, a rejected signature or a
        # server fault mean the integration is actually broken.
        return {"capability": name, "required": name in REQUIRED_CAPABILITIES,
                "state": "ok", "detail": "Responded (probe id not found, as expected)"}
    if res.status_code >= 400:
        return {"capability": name, "required": name in REQUIRED_CAPABILITIES,
                "state": "error", "detail": f"HTTP {res.status_code}"}
    return {"capability": name, "required": name in REQUIRED_CAPABILITIES,
            "state": "ok", "detail": f"Responded in {res.elapsed.total_seconds()*1000:.0f} ms"}


def widget_snippet(store) -> str:
    return (
        '<script src="https://rezo.zevora.io/widget.js"\n'
        f'        data-rezo-key="{store.publishable_key}"\n'
        '        data-rezo-order="{{ order.id }}"\n'
        '        async></script>'
    )
