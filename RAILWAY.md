# Deploying Rezo to Railway

End to end: this repo to `rezo.zevora.io`, with the agent graph on Postgres,
Anthropic as the live model provider, and evidence media surviving redeploys.

## Topology

One Railway project, four services plus a database, all from this GitHub repo:

```
┌──────────────┐   REZO_API_URL    ┌──────────────┐   DATABASE_URL   ┌──────────┐
│  frontend    │ ────proxy /api───▶│   backend    │ ────────────────▶│ Postgres │
│  Next 15     │      /media       │   FastAPI    │                  └──────────┘
│  root: frontend                  │  root: backend
│  rezo.zevora.io                  │  volume: /app/data
└──────────────┘                   └──────────────┘
                                   ┌──────────────┐
                                   │  mock_shop   │  root: mock_shop
                                   │  connector demo
                                   └──────────────┘
```

The browser only ever talks to `rezo.zevora.io`. `next.config.mjs` rewrites
`/api/*`, `/media/*` and `/health` to the backend, which is why cookies, CORS
and the embeddable widget never become a deployment problem.

---

## 1. Pre-flight changes (already applied)

- **`backend/Dockerfile`, `mock_shop/Dockerfile`** — `CMD` is now shell form and
  honours `$PORT`. Exec form would not expand the variable.
- **`backend/requirements.txt`** — dropped `sentence-transformers` (pulls torch,
  ~2.5 GB, never imported), the `anthropic`/`openai`/`google-generativeai` SDKs
  (`app/llm/client.py:21` calls every provider over raw `httpx`), `chromadb`
  (lazy-imported at `app/retrieval/policy.py:92`, only under
  `REZO_RETRIEVER=chroma`) and `redis` (read into settings, never imported).
  **`httpx` is now an explicit dependency** — it used to arrive transitively
  through the vendor SDKs. Backend build drops from ~10 min to under one.
- **`railway.json` per service** — builder, healthcheck path and timeout, start
  command, and watch paths, so config lives in the repo rather than a dashboard.

The frontend start command lives in `frontend/railway.json` rather than
`package.json`, which leaves the `next start -p 3000` script alone for local dev.

---

## 2. Project and database

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub
   repo** → `SooryaCodes/rezo`. Authorise the Railway GitHub app for the repo.
2. Delete whatever service Railway guesses at — each one is defined explicitly
   below.
3. **+ New** → **Database** → **Add PostgreSQL**.

Postgres exposes `DATABASE_URL` as `postgresql://…`, which SQLAlchemy accepts
as-is via `psycopg2-binary`. No URL rewriting needed.

---

## 3. backend

**+ New** → **GitHub Repo** → `rezo`. Settings:

| Setting | Value |
| --- | --- |
| Service name | `backend` |
| Source → Root Directory | `backend` |
| Build → Builder | Dockerfile (from `backend/railway.json`) |

Healthcheck path, timeout and watch paths come from `backend/railway.json`.
Root Directory is the one thing config-as-code can't set — it decides where
Railway looks for that file.

### Variables

| Variable | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | A reference, not a paste — follows credential rotation |
| `REZO_LLM_PROVIDER` | `anthropic` | |
| `ANTHROPIC_API_KEY` | your key | Add it yourself in the dashboard |
| `REZO_MODEL_VISION` | `claude-sonnet-4-5` | **See the note below — the default is `gemini-2.0-flash`** |
| `REZO_DEFAULT_CAP` | `500` | Guardrail defaults, all optional |
| `REZO_FRAUD_THRESHOLD` | `0.6` | |
| `REZO_MIN_CONFIDENCE` | `0.55` | |

`PORT` is injected by Railway — do not set it. `backend/.env` is gitignored and
never enters the image; `app/config.py` uses `setdefault`, so platform variables
always win.

**Leave `REZO_MAIL` unset** and sign-in codes appear on screen instead of being
emailed — no domain verification, nothing to configure. To send for real, set
`REZO_MAIL=resend`, `RESEND_API_KEY`, and `REZO_MAIL_FROM`; the from-address
domain must be verified with Resend *exactly* (a key that verified `zevora.io`
cannot send from `mail.zevora.io`).

### Volume — before the first real traffic

Evidence uploads, seeded sample images and the LangGraph SQLite checkpoint all
live under `backend/data/`, which is `/app/data` in the container. Railway
container filesystems are ephemeral: without a volume, every redeploy wipes
uploaded evidence and the media URLs in past disputes 404.

Service → **Settings** → **Volumes** → **Add Volume**, mount path exactly:

```
/app/data
```

1 GB is plenty. Not `/app/data/media`, not `/data`.

### Domain

**Settings** → **Networking** → **Generate Domain**. Note the URL — the frontend
proxies to it.

---

## 4. frontend

**+ New** → **GitHub Repo** → `rezo` again. Settings:

| Setting | Value |
| --- | --- |
| Service name | `frontend` |
| Source → Root Directory | `frontend` |
| Build → Builder | Nixpacks (from `frontend/railway.json`) |

### Variables

| Variable | Value |
| --- | --- |
| `REZO_API_URL` | your backend domain, no trailing slash |
| `NODE_ENV` | `production` |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `1` — only if `playwright` is in `package.json`; see below |

`REZO_API_URL` is read at module load in `next.config.mjs`, so it must exist
before the build. Railway service variables are available at build time, so
setting it here covers both.

> **Private networking instead?** `http://backend.railway.internal:8000` keeps
> the proxy hop off the public internet, but Railway's private network is
> IPv6-only and Node's proxy client has to resolve AAAA records. If `/api/*`
> starts returning 502s, switch back to the public domain — that path is the
> reliable one.

### Custom domain — `rezo.zevora.io`

**Settings** → **Networking** → **Custom Domain** → `rezo.zevora.io`. Railway
returns a CNAME target like `abc123.up.railway.app`. Add that as a `rezo` CNAME
wherever `zevora.io`'s zone is managed (the apex currently resolves to
`216.198.79.1`, a Vercel address, so the zone is likely at Vercel or a registrar
pointing there). Verification usually completes in a few minutes and Railway
issues the certificate automatically.

Keep the generated `*.up.railway.app` domain too — it's a working fallback while
DNS propagates.

---

## 5. mock_shop

**+ New** → **GitHub Repo** → `rezo`, Root Directory `mock_shop`, generate a
domain, and point the store's connector config at it. No variables needed.

---

## 6. Verify

```bash
curl https://YOUR-BACKEND.up.railway.app/health
```

```json
{"status":"ok","service":"rezo","llm_provider":"anthropic","retriever":"local"}
```

Then through the frontend, which proves the proxy is wired:

```bash
curl https://rezo.zevora.io/health
```

Then open `rezo.zevora.io`, sign up, and run one dispute end to end. Watch the
backend's **Deploy Logs** for `database ready (seeded=…)` and
`llm provider: anthropic` on boot.

---

## 7. Things that will bite you

**A missing key looks like success, not failure.** `app/llm/client.py:160`
catches every exception and falls back to the deterministic offline provider,
recording the reason in `_fallback` on the event. With `REZO_LLM_PROVIDER=anthropic`
and no `ANTHROPIC_API_KEY`, every dispute still resolves — silently, on the
offline path. To confirm the live model is actually being used, check an event
log for a `_fallback` field; its absence is the signal.

**The vision agent needs `REZO_MODEL_VISION` changed.** It defaults to
`gemini-2.0-flash`, and `_dispatch` routes anything starting with `gemini` to
`_gemini`, which needs `GOOGLE_API_KEY`. With only an Anthropic key, the
Evidence Agent silently falls back to offline on every photo. Set
`REZO_MODEL_VISION=claude-sonnet-4-5` — Claude handles images, and `_dispatch`
routes `claude*` to `_anthropic`, which already encodes image blocks.

**Don't push the `playwright` devDependency.** Your working tree adds
`playwright` to `frontend/package.json` for the demo-recording scripts in
`frontend/demo/`. Nixpacks runs `npm ci`, which installs devDependencies, and
that package downloads browser binaries on install — slow, and it can fail in
the builder. Either keep it out of the commit that Railway builds from, or set
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` on the frontend service. You can't just
skip devDependencies: the Next build needs TypeScript, Tailwind and PostCSS.

**Live agent events fall back to polling.** `frontend/lib/api.ts:242` opens a
WebSocket at `/api/disputes/:id/stream` on the frontend origin, but Next.js
rewrites don't proxy WebSocket upgrades. The socket errors and the client drops
to 500 ms polling — by design, and the UI is identical. For the real socket,
point it at the backend domain directly (`wss://YOUR-BACKEND/...`) rather than
`location.host`.

**First request after a deploy is slow.** `lifespan` runs `init_db()` and
`seed()` before serving. With a cold Postgres and image generation for the
sample evidence, that is tens of seconds — hence the 300 s healthcheck timeout
in `railway.json`.

**A dispute takes tens of seconds.** Eight agents run before an answer.
`next.config.mjs` already sets `proxyTimeout: 180_000` for exactly this. Keep
it; the default kills the request long before the graph finishes and the buyer
sees a failure for a request that actually succeeded.

**Media 404s after redeploy** means the volume is missing or mounted at the
wrong path.

**Raising the model tier needs a `max_tokens` bump.** `_anthropic` hardcodes
`max_tokens: 1500` and sends no `thinking` field. On the Claude 4.5 models that
is fine. On Claude 5 models adaptive thinking is on by default and shares that
budget, so responses can truncate, `_extract_json` fails, and the call falls
back to offline — the same silent failure as a missing key. Raise `max_tokens`
in `app/llm/client.py` before switching to `claude-sonnet-5` or `claude-opus-5`.
