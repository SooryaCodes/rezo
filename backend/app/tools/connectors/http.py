"""External-merchant connector.

The merchant implements the capability contract on their own backend and we
call it over HTTPS. Every request is HMAC-SHA256 signed with the store's secret
and carries a timestamp, so the merchant can verify the call came from us and
reject replays. We never hold their payment credentials: their endpoint decides
whether to move money.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import datetime
from urllib.parse import quote

import httpx

from ..errors import CapabilityUnavailable, NotFound, ToolError

TIMEOUT = httpx.Timeout(10.0, connect=4.0)


def sign(secret: str, timestamp: str, body: str) -> str:
    """Signature scheme documented for merchants in docs/INTEGRATION.md."""
    payload = f"{timestamp}.{body}".encode()
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


class HttpConnector:
    def __init__(self, store_id: str, base_url: str, secret: str):
        self.store_id = store_id
        self.base_url = base_url.rstrip("/")
        self.secret = secret or ""

    def _call(self, method: str, path: str, payload: dict | None = None) -> dict:
        body = json.dumps(payload or {}, separators=(",", ":"), sort_keys=True)
        ts = str(int(time.time()))
        headers = {
            "Content-Type": "application/json",
            "X-Rezo-Store": self.store_id,
            "X-Rezo-Timestamp": ts,
            "X-Rezo-Signature": sign(self.secret, ts, body),
        }
        url = f"{self.base_url}{path}"
        try:
            with httpx.Client(timeout=TIMEOUT) as client:
                res = client.request(method, url, content=body, headers=headers)
        except httpx.HTTPError as exc:
            raise ToolError(f"Merchant endpoint unreachable: {exc}", path=path) from exc

        if res.status_code == 404:
            raise NotFound("Merchant returned not found", path=path)
        if res.status_code == 501:
            raise CapabilityUnavailable("Merchant has not implemented this capability",
                                        path=path)
        if res.status_code >= 400:
            raise ToolError(f"Merchant endpoint error {res.status_code}",
                            path=path, body=res.text[:400])
        return res.json()

    # ---- required ------------------------------------------------------
    def get_order(self, order_id: str) -> dict:
        return self._call("GET", f"/rezo/orders/{order_id}")

    def get_delivery_status(self, order_id: str) -> dict:
        return self._call("GET", f"/rezo/orders/{order_id}/delivery")

    def get_customer_history(self, buyer_id: str) -> dict:
        return self._call("GET", f"/rezo/buyers/{buyer_id}/history")

    def get_policy_pack(self, purchase_date) -> dict:
        if isinstance(purchase_date, datetime):
            purchase_date = purchase_date.isoformat()
        # Quoted, because an ISO timestamp ends in "+00:00" and a raw + in a
        # query string decodes to a space. The merchant would fail to parse it,
        # quietly serve today's pack, and the dispute would be judged under
        # rules that did not exist when the order was placed.
        return self._call("GET", f"/rezo/policy?as_of={quote(str(purchase_date), safe='')}")

    def issue_refund(self, dispute_id: str, amount: float, method: str) -> dict:
        return self._call("POST", "/rezo/refunds",
                          {"dispute_id": dispute_id, "amount": round(amount, 2),
                           "method": method})

    def notify(self, recipient: str, channel: str, message: str) -> dict:
        return self._call("POST", "/rezo/notify",
                          {"recipient": recipient, "channel": channel,
                           "message": message})

    # ---- optional ------------------------------------------------------
    def create_return_pickup(self, dispute_id: str, order_id: str) -> dict:
        return self._call("POST", "/rezo/returns",
                          {"dispute_id": dispute_id, "order_id": order_id})

    def restock_item(self, order_id: str, sku: str) -> dict:
        return self._call("POST", "/rezo/inventory/restock",
                          {"order_id": order_id, "sku": sku})

    def payout_link(self, buyer_id: str, amount: float) -> dict:
        return self._call("POST", "/rezo/payouts",
                          {"buyer_id": buyer_id, "amount": round(amount, 2)})
