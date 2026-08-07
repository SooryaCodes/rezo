"""The dispute resolution graph.

Topology:

    intake -> capture -> [evidence | policy | fraud]  (parallel)
           -> resolve -> guardrail gate -> execute -> close
                              |
                        interrupt()  -> seller approval -> resume
                              |
                        (SLA breach / appeal) -> platform review

Design rules encoded here, not in prompts:
- Agents emit structured recommendations; this graph and the tools layer
  hold every enforcement point (caps, clause verification, idempotency).
- interrupt() implements human-in-the-loop: state is checkpointed, the
  case freezes, and resumes after an approval event.
- Evidence, Policy and Fraud run concurrently; Resolution requires all three.
"""
from langgraph.graph import StateGraph, START, END

from .state import DisputeState

# Node implementations land with the Round 2 prototype build.
# Each node = one agent = one focused LLM call + its permitted tools.


def build_graph() -> StateGraph:
    g = StateGraph(DisputeState)

    g.add_node("intake", intake_node)            # Interaction Agent
    g.add_node("capture", capture_node)          # challenge-response session
    g.add_node("evidence", evidence_node)        # Evidence Agent (vision)
    g.add_node("policy", policy_node)            # Policy Agent (RAG + citation)
    g.add_node("fraud", fraud_node)              # Fraud Agent (signals + score)
    g.add_node("resolve", resolve_node)          # Resolution Agent
    g.add_node("guardrail", guardrail_node)      # pure code - no LLM
    g.add_node("seller_gate", seller_gate_node)  # interrupt() -> approval
    g.add_node("platform_gate", platform_node)   # level-2 arbitration
    g.add_node("execute", execute_node)          # Execution Agent (guarded tools)

    g.add_edge(START, "intake")
    g.add_edge("intake", "capture")
    # fan-out: the three specialists run in parallel on the same state
    g.add_edge("capture", "evidence")
    g.add_edge("capture", "policy")
    g.add_edge("capture", "fraud")
    # fan-in: resolution waits for all three
    g.add_edge("evidence", "resolve")
    g.add_edge("policy", "resolve")
    g.add_edge("fraud", "resolve")

    g.add_conditional_edges("guardrail", route_after_guardrail, {
        "auto": "execute",
        "seller": "seller_gate",
        "platform": "platform_gate",
    })
    g.add_edge("resolve", "guardrail")
    g.add_edge("seller_gate", "execute")
    g.add_edge("platform_gate", "execute")
    g.add_edge("execute", END)
    return g


def route_after_guardrail(state: DisputeState) -> str:
    """Deterministic routing - the LLM has no vote here."""
    raise NotImplementedError("Round 2")


def intake_node(state: DisputeState) -> dict: raise NotImplementedError("Round 2")
def capture_node(state: DisputeState) -> dict: raise NotImplementedError("Round 2")
def evidence_node(state: DisputeState) -> dict: raise NotImplementedError("Round 2")
def policy_node(state: DisputeState) -> dict: raise NotImplementedError("Round 2")
def fraud_node(state: DisputeState) -> dict: raise NotImplementedError("Round 2")
def resolve_node(state: DisputeState) -> dict: raise NotImplementedError("Round 2")
def guardrail_node(state: DisputeState) -> dict: raise NotImplementedError("Round 2")
def seller_gate_node(state: DisputeState) -> dict: raise NotImplementedError("Round 2")
def platform_node(state: DisputeState) -> dict: raise NotImplementedError("Round 2")
def execute_node(state: DisputeState) -> dict: raise NotImplementedError("Round 2")
