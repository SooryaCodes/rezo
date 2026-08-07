# Rezo

**Autonomous multi-agent dispute resolution for e-commerce.**

Rezo is a dispute-resolution layer that handles a buyer's complaint end to end: it understands the claim in natural language, verifies evidence through live challenge-based camera capture, checks the seller's actual policy with clause-level citations, scores fraud, decides a fair outcome, and executes it (refund, replacement, escalation) — with a human approving anything above configurable risk thresholds, and a complete audit trail behind every decision.

Built for **Neurobots Championship 2026** — Agentic AI Track, Problem Statement 12 (Enterprise Customer Experience Intelligence & Autonomous Dispute Resolution Platform).

## Why

Resolving an e-commerce dispute today takes days: rigid chatbots, ticket queues, and a human agent manually cross-checking orders, policies, and photos across disconnected systems. Meanwhile, AI-generated fake damage photos have become the fastest-growing form of return fraud — roughly 3 in 10 retail fraud attempts are now AI-generated, and human reviewers miss most high-quality fakes.

Existing tools automate the *talking* (chatbots) or the *clicking* (RPA) — never the *judging*. Rezo automates the judging, safely.

**We don't detect fake claims. We make them impossible to file** — evidence is captured live, inside our session, against a server-issued random challenge, and matched against the exact unit that was shipped.

## Architecture

```
Buyer chat ──► Interaction Agent ──► ┌─ Evidence Agent  (vision, live capture)
                                     ├─ Policy Agent    (RAG, clause citations)   ──► Resolution Agent
                                     └─ Fraud Agent     (signals + scoring)              │
                                                                              guardrail check (code, not LLM)
                                                                                   │              │
                                                                             auto-execute    human approval
                                                                                   │         (interrupt/resume)
                                                                                   ▼              ▼
                                                                          Execution Agent ──► audit log
```

Eight specialized agents collaborate through a shared, checkpointed case state (LangGraph). Agents never call money-moving APIs directly: they emit structured decisions, and deterministic tool-layer code enforces refund caps, identity checks, and policy-clause verification before anything executes. Human-in-the-loop is implemented as a first-class graph interrupt — over-threshold cases freeze mid-flow and resume exactly where they paused after seller approval.

See [docs/architecture.md](docs/architecture.md) and [docs/agents.md](docs/agents.md) for the full design.

## Key capabilities

- **Live evidence capture with challenge–response** — server-issued, time-boxed random challenges ("show the damage, then the price tag in the same frame"); defeats pre-generated and AI-generated fake evidence
- **Tiered evidence trust** — attested live capture → unattested camera → upload with EXIF/C2PA forensics; friction scales with risk
- **Policy engine with citations** — seller policies compiled into versioned clause packs; every decision quotes the governing clause; hallucinated clauses cannot pass (clause IDs verified in code)
- **Multi-vendor / multi-tenant** — per-store policy packs, autonomy limits and capability flags; platform-level arbitration tier; cross-store fraud intelligence
- **Human-in-the-loop** — configurable autonomy caps; one-tap approval dossiers; every override recorded as a learning precedent
- **Full explainability** — decision rationale, clause reference, confidence, fraud assessment, and an append-only audit log written transactionally with every execution

## Tech stack

| Layer | Choice |
|---|---|
| Agent orchestration | LangGraph (Python) |
| LLMs | Claude Sonnet (reasoning) · Gemini Flash / GPT-4o-mini (vision, routing) via a model-agnostic client |
| API | FastAPI + WebSockets |
| Retrieval | ChromaDB + sentence-transformers |
| Data | PostgreSQL (disputes, audit log) · Redis (state, SLA timers) |
| Frontend | Next.js + Tailwind + React Flow |
| Evidence | getUserMedia live capture + server nonce · EXIF/C2PA forensics |
| Infra | Docker Compose (dev) · Kubernetes/Kafka/OpenTelemetry (production path) |

## Repository layout

```
backend/          FastAPI service: agent graph, tools layer, API routes, DB models
  app/agents/     LangGraph state machine, agent nodes, prompts
  app/tools/      Guarded tool layer (the only path to money-moving actions)
  app/api/        REST + WebSocket endpoints
  app/db/         SQLAlchemy models: disputes, evidence, policy packs, audit log
frontend/         Next.js: buyer chat + capture, seller dashboard, agent console
mock_shop/        Seeded demo store API (orders, payments, shipping, catalog)
docs/             Architecture, agent specifications, API reference
```

## Status & roadmap

| Round | Scope |
|---|---|
| R1 — Idea validation | Architecture, documentation, scaffold (this repo) |
| R2 — Prototype | End-to-end happy path: chat → capture → verify → decide → execute → audit; HITL interrupt/resume; live agent console |
| R3 — Product readiness | Challenge-response capture, upload forensics, fraud signals, seller wizard, analytics |
| R4 — Grand finale | Multi-store fraud intelligence, Malayalam support, SLA watchdog, polish |

## Team

- **Soorya Krishna P R** — agent architecture & orchestration, product
- **Vinu Vinson** — backend APIs, tools & guardrails layer, data model
- **Vishnu M V** — frontend: buyer chat, capture flow, seller dashboard, agent console
- **Jyothis Mariya Joy** — evidence & fraud layer, demo scenarios, QA

## Local development

```bash
docker compose up -d postgres redis
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload
```

MIT licensed.
