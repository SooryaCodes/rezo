# Setup — the parts only you can do

Everything in this repo runs today without a single credential. This document is
about the four things that turn it from *running* into *shippable*, in the order
they matter, with an honest note on each about what is genuinely blocked versus
what merely looks unfinished.

---

## 0. Run it locally (no keys needed)

Two processes. The API serves the engine; Next proxies to it so the browser only
ever talks to one origin.

```bash
# terminal 1
cd backend
python3 -m venv ../.venv
../.venv/bin/pip install -r requirements.txt
PYTHONPATH=. ../.venv/bin/python -m uvicorn app.main:app --port 8000
```

```bash
# terminal 2
cd frontend
npm install
npm run dev            # http://localhost:3000
```

The database seeds itself on first boot. Verify with:

```bash
cd backend && ../.venv/bin/python -m pytest      # 29 tests
```

If a page ever renders stale or half-dressed in dev, it is almost always Next's
build cache rather than your code:

```bash
rm -rf frontend/.next && (cd frontend && npm run dev)
```

---

## 1. Language models — 15 minutes

**What works without this:** everything. The LLM layer ships with a
deterministic offline provider, so the full pipeline runs, all 29 tests pass,
and every demo scenario resolves correctly. What you lose is judgement quality:
the offline provider follows rules, it does not reason about an unusual case.

**What you do:**

1. **Anthropic** — <https://console.anthropic.com> → API Keys → Create Key.
   Add ~$5 of credit; a full demo day is well under a dollar.
2. **Google AI Studio** — <https://aistudio.google.com/apikey> → Create API key.
   Free tier, and it covers the vision work.
3. Create `backend/.env` (already gitignored):

```bash
REZO_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
# optional third provider for failover
OPENAI_API_KEY=sk-...
```

4. Restart the API. Confirm it took:

```bash
curl -s localhost:8000/health          # "llm_provider":"anthropic"
```

Then run a case from `/console` and watch the cost counter move off ₹0 — that
number is real, computed from token usage.

**What changes:** the Interaction agent replies in the customer's own words
instead of from a template, the Evidence agent actually looks at the photo
rather than reasoning from metadata alone, and the Resolution agent handles the
cases the rules do not anticipate.

---

## 2. Email delivery — 30 minutes

**This is the one real gap.** Sign-in codes are generated, hashed, expiry-bound
and attempt-limited exactly as they should be — but nothing sends them. In local
mode the code is written to the server log and shown on screen, clearly labelled.
That is honest and testable, and it is not something you can put in front of a
customer.

**Recommended: Resend** (simplest, generous free tier).

1. Sign up at <https://resend.com>, verify a domain (`zevora.io` or a
   subdomain). DNS records take ~15 minutes to propagate.
2. Create an API key.
3. `pip install resend` and add to `backend/.env`:

```bash
REZO_MAIL=live
RESEND_API_KEY=re_...
REZO_MAIL_FROM="Rezo <hello@rezo.zevora.io>"
```

4. Implement the send in `backend/app/services/otp.py`. The seam is already
   there — find the `LOCAL_DELIVERY` branch in `request_code` and replace the
   log line with the provider call. Roughly twenty lines:

```python
import resend
resend.api_key = os.getenv("RESEND_API_KEY")
resend.Emails.send({
    "from": os.getenv("REZO_MAIL_FROM"),
    "to": email,
    "subject": f"{code} is your Rezo code",
    "html": f"<p>Your code is <strong>{code}</strong>. It expires in 10 minutes.</p>",
})
```

Keep the `local_code` field out of the response when `REZO_MAIL=live` — the code
already does this, so do not remove that branch.

**Alternatives:** Postmark (best deliverability for transactional), AWS SES
(cheapest at volume, slowest to get out of sandbox — start this days early if
you go this route).

---

## 3. Voice — optional, ~2 hours

You have an ElevenLabs key already. This is the bonus-innovation item from the
problem statement (voice-enabled support agents), and it is genuinely
differentiating for accessibility and for vernacular speakers.

```bash
ELEVENLABS_API_KEY=...
```

Two pieces, both additive — they touch nothing in the core pipeline:

- **Speech to text:** mic button in the widget → ElevenLabs Scribe → the
  transcript enters the pipeline exactly as typed text does.
- **Text to speech:** the decision card read aloud in the buyer's language.
  Multilingual v2 handles Malayalam and Hindi.

Build this last. If it is not done by demo time, the architecture is voice-ready
and you lose nothing by saying so.

---

## 4. Deploying to rezo.zevora.io

Every snippet, doc and generated integration line already points at this host,
so the only work is making it resolve.

**Frontend (Vercel):**

1. Import the repo at <https://vercel.com/new>, set the root directory to
   `frontend`.
2. Environment variable: `REZO_API_URL=https://api.rezo.zevora.io`
3. Add `rezo.zevora.io` as a custom domain and point the CNAME at Vercel.

**Backend (Railway, Render or Fly):**

1. Deploy `backend/` with `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
2. Attach a Postgres instance and set `DATABASE_URL` — SQLite will not survive
   a container restart.
3. Set the same `.env` values as above.
4. Point `api.rezo.zevora.io` at it.

**Then check three things:**

```bash
curl https://api.rezo.zevora.io/health
curl -I https://rezo.zevora.io/widget.js          # must be 200 and cacheable
```

and load `https://rezo.zevora.io/widget?store=st_rehana&order=ORD-2041` — the
camera step needs HTTPS, which is exactly why testing this before demo day
matters.

---

## 5. Before you demo

Half an hour, and it is the difference between a demo that lands and one that
limps.

- [ ] `POST /api/demo/reset` — a half-finished case from a rehearsal is the
      classic way a live demo goes wrong. It only clears the three sample stores,
      so real accounts are safe.
- [ ] Run all four cases from `/console` once, on the venue wifi.
- [ ] Open the widget on a real phone over HTTPS and grant camera once, so the
      permission is already remembered.
- [ ] Record a screen capture of the full four-beat run as a fallback.
- [ ] Sign in on a second device to confirm the OTP email actually arrives.
- [ ] Check `/dashboard` shows the getting-started list, not an empty inbox.

---

## What is genuinely not built

Stated plainly so nothing surprises you in Q&A:

- **Email sending.** Codes are generated correctly and shown on screen. Section
  2 closes this.
- **Real payment rails.** `issue_refund` calls a mock gateway. The guardrails,
  idempotency and ledger around it are real; the transfer is not.
- **Courier APIs.** Shipment events are seeded rather than pulled from Delhivery
  or Shiprocket. The watchdog logic that reads them is real.
- **Voice.** Architecture is ready, not wired.
- **Cross-store fraud at scale.** The correlation query is real and works over
  the seeded network; it has never been tested against a large one.

Everything else — the agent graph, the guardrails, the evidence tiers, the
challenge-response capture, the forensics, the versioned policy, the audit
trail, the human-in-the-loop interrupts, the multi-tenancy — is implemented and
covered by tests.
