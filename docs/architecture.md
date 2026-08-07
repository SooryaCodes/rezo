# Architecture

## Overview

Rezo is a multi-agent dispute-resolution engine deployed as a native layer on a multi-vendor commerce platform. One generic engine serves every store; all per-store variation (policies, autonomy limits, claim types, capabilities) is configuration data loaded at case time — never code.

```
┌─────────────────────────── Interfaces ───────────────────────────┐
│  Buyer chat + live capture   Seller dashboard    Agent console   │
│  (Next.js, getUserMedia)     (wizard/inbox)      (React Flow)    │
└──────────────┬──────────────────────┬───────────────┬────────────┘
               │        WebSocket event stream        │
┌──────────────▼──────────────────────▼───────────────▼────────────┐
│              Agent Service — FastAPI + LangGraph                 │
│   checkpointed dispute graph · model-agnostic LLM client         │
│   ChromaDB (policy RAG, precedents)                              │
└──────────────────────────────┬───────────────────────────────────┘
                               │  guarded tools API (the ONLY path
                               │  to money-moving actions)
┌──────────────────────────────▼───────────────────────────────────┐
│  Platform: PostgreSQL (disputes, audit) · Redis (state, timers)  │
│  Payments · Couriers · Notifications (mock_shop in the demo)     │
└──────────────────────────────────────────────────────────────────┘
```

## Core design decisions

**1. Reasoning/execution split.** LLM agents emit structured recommendations (typed JSON). Deterministic code — the guardrail node and the tools layer — enforces refund caps, clause-ID verification, identity checks, and idempotency. The enforcement point is outside the model, so prompt injection and hallucination cannot move money.

**2. Shared-state collaboration.** Agents do not message each other. Each reads the checkpointed case state, performs one job, and writes findings back; the graph routes. Evidence, Policy, and Fraud run in parallel; Resolution requires all three.

**3. Human-in-the-loop as a graph primitive.** Over-cap or high-fraud cases hit `interrupt()`: state checkpoints, the case freezes, the seller receives a one-screen dossier, and the graph resumes on approval — surviving restarts in between.

**4. Three-tier escalation (multi-vendor).**
- Level 0 — agents resolve within store policy (most cases end here)
- Level 1 — store owner approves above their cap / overrides with a reason
- Level 2 — platform arbitration: buyer appeals, seller SLA breaches (Redis timers), high-fraud seller-approval conflicts, seller-conduct disputes. Platform baseline policy takes precedence over store policy (marketplace-guarantee model).

**5. Evidence trust tiers.** Attested live capture (server-issued time-boxed challenge + session nonce + serial/tag match against the shipped unit) unlocks full autonomy; unattested camera capture gets a lower cap; arbitrary uploads get EXIF/C2PA forensics plus a vision-model pass and human review above small amounts. Friction scales with computed risk, not uniformly.

**6. Cross-store fraud intelligence.** Claim history, device/address linkage, and perceptual hashes of evidence media are correlated across all stores. A network effect only a platform-native layer can provide.

**7. Version-aware policy.** Clause packs are versioned with effective dates; a dispute is always judged against the pack in force on the purchase date.

## Failure handling

- LLM provider outage → model-agnostic client fails over per agent
- Crash mid-case → checkpoint resume, no restarts from zero
- Refund retries → ledger uniqueness makes them no-ops
- Notification failure after refund → outbox retry; refund never re-fires
- Unverifiable-remotely claims → explicit escalation to physical inspection rather than guessing

## Scaling path

Demo: Docker Compose, single instances. Production: stateless agent workers scaled horizontally on Kubernetes; Kafka replaces in-process events; OpenTelemetry tracing; per-store rate limits; read replicas for analytics.
