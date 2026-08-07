"""Rezo backend entrypoint.

Serves the API, the three front-end surfaces and the embeddable widget from a
single origin, so the whole system runs with one command and no build step.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api.routes import router
from .config import settings
from .db.session import init_db
from .seed import seed

log = logging.getLogger("rezo")
FRONTEND = Path(__file__).resolve().parent.parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    result = seed(reset=False)
    log.info("database ready (seeded=%s)", result.get("seeded"))
    log.info("llm provider: %s", settings.llm_provider)
    yield


app = FastAPI(
    title="Rezo",
    description="Autonomous multi-agent dispute resolution for e-commerce.",
    version="1.0.0",
    lifespan=lifespan,
)

# The widget is designed to be embedded on a merchant's own domain.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])

app.include_router(router, prefix="/api")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "rezo",
            "llm_provider": settings.llm_provider,
            "retriever": settings.retriever}


app.mount("/media", StaticFiles(directory=str(settings.media_dir)), name="media")

if FRONTEND.exists():
    @app.get("/")
    def index():
        return FileResponse(FRONTEND / "index.html")

    app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")
