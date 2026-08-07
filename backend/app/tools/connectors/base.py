"""The capability contract.

This is the entire surface a commerce platform must expose for Rezo to operate.
Six functions are required; four are optional and degrade gracefully when a
store has not enabled them.

Two implementations ship:
  local.py  platform-native stores, reading and writing our own database
  http.py   external merchants, HMAC-signed REST against their own backend

Binding the engine to a new platform is writing one of these, not touching a
single agent.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

REQUIRED_CAPABILITIES = [
    "get_order",
    "get_delivery_status",
    "get_customer_history",
    "get_policy_pack",
    "issue_refund",
    "notify",
]

OPTIONAL_CAPABILITIES = [
    "create_return_pickup",
    "restock_item",
    "payout_link",
    "get_buyer_history_across_stores",
]


@runtime_checkable
class CommerceConnector(Protocol):
    store_id: str

    # ---- required ------------------------------------------------------
    def get_order(self, order_id: str) -> dict:
        """Items, prices, buyer, payment method, timestamps, shipment events."""

    def get_delivery_status(self, order_id: str) -> dict:
        """Current courier state plus the event trail behind it."""

    def get_customer_history(self, buyer_id: str) -> dict:
        """Orders and prior disputes for this buyer within this store."""

    def get_policy_pack(self, purchase_date) -> dict:
        """The clause pack in force on the purchase date, not today's."""

    def issue_refund(self, dispute_id: str, amount: float, method: str) -> dict:
        """Move money. Called only after the guarded facade has cleared it."""

    def notify(self, recipient: str, channel: str, message: str) -> dict:
        """Buyer or seller notification."""

    # ---- optional ------------------------------------------------------
    def create_return_pickup(self, dispute_id: str, order_id: str) -> dict: ...
    def restock_item(self, order_id: str, sku: str) -> dict: ...
    def payout_link(self, buyer_id: str, amount: float) -> dict: ...
