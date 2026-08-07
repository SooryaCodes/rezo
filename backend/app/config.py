"""Runtime configuration.

Everything is environment driven with safe defaults so the system boots and is
fully testable without any external API keys. Set REZO_LLM_PROVIDER=anthropic
(or gemini/openai) plus the matching key to switch from the deterministic
offline provider to a live model.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MEDIA_DIR = DATA_DIR / "media"


class Settings:
    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        MEDIA_DIR.mkdir(parents=True, exist_ok=True)

        self.database_url: str = os.getenv(
            "DATABASE_URL", f"sqlite:///{DATA_DIR / 'rezo.db'}"
        )
        self.redis_url: str | None = os.getenv("REDIS_URL")

        # --- LLM routing -------------------------------------------------
        # Per-agent overrides let cheap models do volume work and a frontier
        # model do the judgement. "offline" is a deterministic rule-based
        # provider used for tests and for demos without network access.
        self.llm_provider: str = os.getenv("REZO_LLM_PROVIDER", "offline")
        self.anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
        self.google_api_key: str = os.getenv("GOOGLE_API_KEY", "")
        self.openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
        self.elevenlabs_api_key: str = os.getenv("ELEVENLABS_API_KEY", "")

        self.model_reasoning: str = os.getenv("REZO_MODEL_REASONING", "claude-sonnet-4-5")
        self.model_fast: str = os.getenv("REZO_MODEL_FAST", "claude-haiku-4-5-20251001")
        self.model_vision: str = os.getenv("REZO_MODEL_VISION", "gemini-2.0-flash")

        # --- policy retrieval --------------------------------------------
        self.retriever: str = os.getenv("REZO_RETRIEVER", "local")  # local | chroma

        # --- evidence ----------------------------------------------------
        self.challenge_ttl_seconds: int = int(os.getenv("REZO_CHALLENGE_TTL", "300"))
        self.media_dir: Path = MEDIA_DIR

        # --- guardrail defaults (per-store values override these) ---------
        self.default_auto_cap: float = float(os.getenv("REZO_DEFAULT_CAP", "500"))
        self.default_fraud_threshold: float = float(os.getenv("REZO_FRAUD_THRESHOLD", "0.6"))
        self.min_decision_confidence: float = float(os.getenv("REZO_MIN_CONFIDENCE", "0.55"))

        # Trust tier caps: how much autonomy each evidence tier may unlock.
        self.tier_multiplier: dict[str, float] = {
            "attested_live": 1.0,
            "camera_unattested": 0.5,
            "upload": 0.25,
            "none": 0.0,
        }

        self.seller_sla_hours: int = int(os.getenv("REZO_SELLER_SLA_HOURS", "24"))

    @property
    def live_llm(self) -> bool:
        return self.llm_provider != "offline"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
