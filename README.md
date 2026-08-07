# Rezo

**Autonomous multi-agent dispute resolution for e-commerce.**

A buyer reports a problem with an order. Rezo understands the claim, verifies the evidence through a live camera challenge, checks eligibility against the merchant's own policy down to the clause, scores fraud risk, decides an outcome, and executes it — inside limits the merchant sets and enforced in code, not by asking a model to behave. Anything above the line, anything risky and anything uncertain freezes and asks a person.

Built for **Neurobots Championship 2026** — Agentic AI Track, Problem Statement 12.

## Why

Resolving a dispute today takes days: rigid chatbots, ticket queues, and a human cross-checking orders, policies and photos across disconnected systems. Meanwhile roughly 3 in 10 retail fraud attempts are now AI-generated imagery, and most reviewers cannot tell.

Existing tools automate the *talking* (chatbots) or the *clicking* (RPA). Nobody automates the *judging*. Rezo does, safely.

**We don't detect fake claims. We make them impossible to file** — evidence is captured live, inside our session, against a randomised challenge issued seconds earlier, and matched against the exact unit that was shipped.

## Run it

Two processes. The API serves the engine; Next proxies to it so everything is same-origin.

```bash
# 1. backend
cd backend
python3 -m venv ../.venv && ../.venv/bin/pip install -r requirements.txt
PYTHONPATH=. ../.venv/bin/python -m uvicorn app.main:app --port 8000

# 2. frontend
cd frontend
npm install
npm run dev            # http://localhost:3000
```

The database seeds itself on first boot with three stores, versioned policy packs, buyer histories and five scenarios. No API keys are required: the LLM layer ships with a deterministic offline provider so the whole pipeline runs and is testable without a network. Add `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` and set `REZO_LLM_PROVIDER=anthropic` to switch to live models.

```bash
cd backend && ../.venv/bin/python -m pytest      # 28 tests
```

## What's here

| Surface | Path | What it is |
|---|---|---|
| Marketing site | `/` | Runs four real cases through the live engine on the page |
| Sign in / up | `/signin`, `/signup` | One email-code flow for both |
| Onboarding | `/onboarding` | Four steps that write real policy and guardrail config |
| Dashboard | `/dashboard` | Inbox, approval dossier, analytics, policy, integration health |
| Agent console | `/console` | The real graph in React Flow with a live event stream |
| Integration guide | `/docs` | A visual guide, and a context file for a coding assistant |
| Test storefront | `/store` | Embeds the widget exactly as the guide describes |
| Widget | `/widget` | The buyer flow; embeddable via `public/widget.js` |

## Architecture

```
Buyer ──► Interaction ──┬─► Evidence ──┬─► Fraud ─► Resolution ─► Guardrail ─┬─► Execution
                        └─► Policy ────┘                          (code)     ├─► Seller gate
                                                                             └─► Platform gate
```

Evidence and Policy run concurrently. Fraud runs after Evidence deliberately: scoring risk before knowing an image carries generator metadata throws away the strongest signal available. Waiting for the buyer's evidence and waiting for a human approval are both first-class graph interrupts, so a case can freeze for days, survive a restart and resume from its checkpoint.

Three invariants hold the whole thing together:

1. **Agents recommend, code enforces.** Refund caps, clause verification and idempotency live in the tool layer, outside the model. A prompt-injected or hallucinating agent cannot move money.
2. **Evidence quality scales autonomy.** Attested live capture unlocks the full limit; an unverifiable upload unlocks a quarter of it and gets reviewed. Friction is proportional to risk.
3. **Nothing moves untracked.** The audit entry commits in the same transaction as the refund.

See [docs/architecture.md](docs/architecture.md) and [docs/agents.md](docs/agents.md).

## Stack

| Layer | Choice |
|---|---|
| Agent orchestration | LangGraph — checkpointed state graph, native interrupts |
| LLMs | Claude Sonnet (judgement) · Gemini Flash / GPT-4o-mini (vision, routing) behind a model-agnostic client, plus a deterministic offline provider |
| API | FastAPI + WebSockets |
| Retrieval | Lexical retriever by default, ChromaDB optional — policy packs are small and exactness matters more than embeddings at this size |
| Data | PostgreSQL or SQLite (disputes, versioned policy, append-only audit, refund ledger) · Redis optional |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind, React Flow |
| Evidence | `getUserMedia` live capture with server-issued expiring challenge · EXIF and C2PA forensics on the fallback path |

## Repository

```
backend/
  app/agents/      LangGraph state machine, the eight agent nodes, prompts, event stream
  app/tools/       Guarded capability layer + local and HTTP connectors
  app/evidence/    Challenge-response capture, image forensics
  app/services/    Dispute lifecycle, accounts, OTP, watchdog, integration checks
  app/db/          Multi-tenant models, session scope
  tests/           28 tests: guardrail refusals and the five end-to-end scenarios
frontend/
  app/             Marketing, auth, onboarding, dashboard, console, docs, store, widget
  components/      UI kit, motion primitives, agent visuals
  lib/             Typed API client, formatting, integration snippets
  public/widget.js The embeddable loader
docs/              Architecture and agent specifications
```

## Team

- **Soorya Krishna P R** — agent architecture & orchestration, product
- **Vinu Vinson** — backend APIs, tools & guardrails layer, data model
- **Vishnu M V** — frontend: buyer chat, capture flow, dashboard, console
- **Jyothis Mariya Joy** — evidence & fraud layer, demo scenarios, QA

MIT licensed.
