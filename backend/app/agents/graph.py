"""The dispute resolution graph.

    intake -> capture -+-> evidence -+-> fraud -> resolve -> guardrail -+-> execute
                       +-> policy ---+                                  |
                                                                        +-> seller gate ---+
                                                                        +-> platform gate -+-> execute

Evidence and Policy run concurrently: neither needs the other's output. Fraud
runs after Evidence on purpose, because it consumes the forensic flags; scoring
risk before knowing an image carries generator metadata would throw away the
strongest signal available. Resolution fans in once all findings exist.

Two things pause the graph, both as first-class interrupts rather than polling:
waiting for the buyer's evidence, and waiting for a human to approve. State is
checkpointed at every step, so a case can freeze for days, survive a restart,
and resume exactly where it stopped.
"""
from __future__ import annotations

from typing import Any

from langgraph.graph import END, START, StateGraph
from langgraph.types import Command

from .nodes import (capture_node, evidence_node, execute_node, fraud_node,
                    guardrail_node, intake_node, platform_gate_node,
                    policy_node, resolve_node, route_after_guardrail,
                    seller_gate_node)
from .state import DisputeState


def build_graph() -> StateGraph:
    g = StateGraph(DisputeState)

    g.add_node("intake", intake_node)             # Interaction Agent
    g.add_node("capture", capture_node)           # challenge issue + buyer pause
    g.add_node("evidence", evidence_node)         # Evidence Agent
    g.add_node("policy", policy_node)             # Policy Agent
    g.add_node("fraud", fraud_node)               # Fraud Agent
    g.add_node("resolve", resolve_node)           # Resolution Agent
    g.add_node("guardrail", guardrail_node)       # deterministic routing
    g.add_node("seller_gate", seller_gate_node)   # Escalation Agent, level 1
    g.add_node("platform_gate", platform_gate_node)  # level 2
    g.add_node("execute", execute_node)           # Execution Agent

    g.add_edge(START, "intake")
    g.add_edge("intake", "capture")

    # fan out: independent findings, computed concurrently
    g.add_edge("capture", "evidence")
    g.add_edge("capture", "policy")

    # fraud consumes the evidence forensics, then resolution fans in
    g.add_edge("evidence", "fraud")
    g.add_edge("policy", "fraud")
    g.add_edge("fraud", "resolve")

    g.add_edge("resolve", "guardrail")
    g.add_conditional_edges("guardrail", route_after_guardrail, {
        "auto": "execute",
        "seller": "seller_gate",
        "platform": "platform_gate",
        "terminal": END,
    })
    g.add_edge("seller_gate", "execute")
    g.add_edge("platform_gate", "execute")
    g.add_edge("execute", END)
    return g


def _make_checkpointer():
    """Durable if the sqlite saver is available, in-memory otherwise.

    The engine does not depend on it for correctness of the record: full case
    state is mirrored into the disputes table after every node, so the API and
    the UI always read from the database.
    """
    try:
        import sqlite3

        from langgraph.checkpoint.sqlite import SqliteSaver

        from ..config import DATA_DIR
        conn = sqlite3.connect(str(DATA_DIR / "checkpoints.db"),
                               check_same_thread=False)
        return SqliteSaver(conn)
    except Exception:
        from langgraph.checkpoint.memory import MemorySaver
        return MemorySaver()


class DisputeEngine:
    """Thin wrapper that owns the compiled graph and the interrupt protocol."""

    def __init__(self) -> None:
        self.checkpointer = _make_checkpointer()
        self.graph = build_graph().compile(checkpointer=self.checkpointer)

    @staticmethod
    def _config(dispute_id: str) -> dict:
        return {"configurable": {"thread_id": dispute_id}, "recursion_limit": 40}

    @staticmethod
    def _interrupt_payload(result: dict) -> dict | None:
        raw = result.get("__interrupt__")
        if not raw:
            return None
        first = raw[0]
        return getattr(first, "value", first)

    def start(self, initial_state: dict) -> dict:
        result = self.graph.invoke(initial_state,
                                   self._config(initial_state["dispute_id"]))
        return self._shape(result)

    def resume(self, dispute_id: str, payload: Any) -> dict:
        result = self.graph.invoke(Command(resume=payload), self._config(dispute_id))
        return self._shape(result)

    def snapshot(self, dispute_id: str) -> dict:
        state = self.graph.get_state(self._config(dispute_id))
        return dict(state.values) if state and state.values else {}

    def _shape(self, result: dict) -> dict:
        pending = self._interrupt_payload(result)
        return {
            "state": {k: v for k, v in result.items() if k != "__interrupt__"},
            "pending": pending,
            "awaiting": (pending or {}).get("type"),
            "done": pending is None,
        }


_engine: DisputeEngine | None = None


def get_engine() -> DisputeEngine:
    global _engine
    if _engine is None:
        _engine = DisputeEngine()
    return _engine
