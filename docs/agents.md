# Agent Specifications

Eight specialized agents. Each is one focused LLM call with a role prompt, a
permitted tool set, and a defined read/write contract on the shared case state.

| # | Agent | Replaces | Reads | Writes | Model class |
|---|-------|----------|-------|--------|-------------|
| 1 | Interaction | Front-desk support rep | Buyer messages, order (tool) | `claim_type`, order verified, follow-up questions | Frontier (conversation quality) |
| 2 | Evidence | Photo/video inspector | Live-capture media, uploads | `evidence`: verified, damage type, serial match, confidence, forensics flags | Vision-capable |
| 3 | Policy | Rulebook expert | Claim + store policy pack (RAG) | `policy`: eligible, clause id + quoted text, version, exclusions | Frontier + retrieval |
| 4 | Fraud | Risk analyst | History (tools), value, forensics flags, cross-store hits | `fraud`: score 0–1 + named signals | Small/fast |
| 5 | Resolution | Deciding team lead | All findings above | `decision`: outcome, amount, rationale, confidence, alternatives | Strongest reasoner |
| 6 | Execution | Backend operator | Approved decision | Refund/label/restock/notify results | Minimal (mostly code) |
| 7 | Escalation | "Get my manager" | Guardrail triggers | Seller/platform dossier; fires `interrupt()` | Small/fast |
| 8 | Learning | Institutional memory | Closed cases + overrides | Precedents (retrieved into future rationales) | Embeddings + small |

## Interaction contract

- No agent-to-agent messaging. The case state is the collaboration medium.
- Evidence, Policy, Fraud run in parallel after capture; Resolution fans in.
- Every agent output is typed JSON validated at the boundary; free text only
  inside designated rationale fields.
- The Resolution Agent cannot approve a claim the Policy Agent found
  ineligible without emitting an explicit conflict flag (surfaced to humans).
- Every state transition appends an audit entry: actor, action, detail, time.

## Guardrail node (not an agent)

Pure code between Resolution and Execution:
- amount vs store auto-cap → route to seller gate
- fraud score vs threshold → route to seller/platform gate
- clause id existence + applicability check → hard fail on mismatch
- confidence floor → below it, never auto-execute
