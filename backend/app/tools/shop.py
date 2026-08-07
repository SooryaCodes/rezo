"""Guarded tools layer - the only path from agents to the real world.

Every function here is an agent-callable tool. Two invariants:

1. Guardrails live HERE, in code, not in prompts. issue_refund() checks the
   store's cap and the approval state itself; a prompt-injected or
   hallucinating LLM cannot exceed them because the enforcement point is
   outside the model.

2. Money-moving operations are idempotent (unique dispute_id on the refund
   ledger) and write their audit entry in the same transaction.

The tool signatures are the platform "capability contract": binding them to
the demo mock_shop or to production DropNShop is a connector swap, not a
rewrite.
"""


def get_order(store_id: str, order_id: str) -> dict:
    """Items, prices, buyer, timestamps, delivery status."""
    raise NotImplementedError("Round 2")


def get_customer_history(store_id: str, buyer_id: str) -> dict:
    """Past orders and disputes within this store."""
    raise NotImplementedError("Round 2")


def get_buyer_history_across_stores(buyer_id: str) -> dict:
    """Platform-level fraud signal: same buyer's claims across ALL stores.

    A fraudster who looks clean to one store looks obvious to the platform.
    Only a multi-vendor-native dispute layer can offer this.
    """
    raise NotImplementedError("Round 2")


def get_policy_pack(store_id: str, purchase_date: str) -> dict:
    """The clause pack in force on the purchase date (version-aware)."""
    raise NotImplementedError("Round 2")


def issue_refund(dispute_id: str, amount: float, approved_by: str) -> dict:
    """GUARDED. Refuses if:
    - amount exceeds the store's auto-cap and approved_by == "auto"
    - a ledger row already exists for this dispute (idempotency)
    - the cited policy clause id does not exist in the store's pack
    Routes by store capability: gateway refund / settlement adjustment /
    UPI payout link (COD stores).
    """
    raise NotImplementedError("Round 2")


def create_return_pickup(dispute_id: str) -> dict:
    """Falls back to manual return instructions if the store has no courier
    integration (capability flag)."""
    raise NotImplementedError("Round 2")


def notify(recipient: str, channel: str, message: str) -> dict:
    """Buyer/seller notification: in-app, email, WhatsApp."""
    raise NotImplementedError("Round 2")


def append_audit(dispute_id: str, actor: str, action: str, detail: dict) -> None:
    """Append-only; called inside the same transaction as the action itself."""
    raise NotImplementedError("Round 2")
