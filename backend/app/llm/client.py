"""Model-agnostic LLM client.

Every agent asks for a completion through this one surface, so the model behind
any single agent is a configuration change rather than a code change. That
buys three things: the right-sized model per task (frontier for judgement,
small and fast for routing), provider failover if one is down mid-demo, and a
deterministic offline provider that lets the entire pipeline run and be tested
without network access or API keys.

Providers are called over plain HTTP, so no vendor SDK is a dependency.
"""
from __future__ import annotations

import base64
import json
import mimetypes
import re
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from ..config import settings
from . import offline as offline_provider

TIMEOUT = httpx.Timeout(60.0, connect=8.0)

# Rough public list prices, USD per million tokens, used only to show the
# operator what a dispute costs. Not billing.
PRICING = {
    "claude-sonnet-4-5": (3.0, 15.0),
    "claude-haiku-4-5-20251001": (1.0, 5.0),
    "gemini-2.0-flash": (0.10, 0.40),
    "gemini-2.5-flash": (0.15, 0.60),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.0),
    "offline": (0.0, 0.0),
}
USD_TO_INR = 88.0

# Which capability tier each agent needs. Cheap models do the volume work.
AGENT_TIER = {
    "interaction": "reasoning",
    "policy": "reasoning",
    "resolution": "reasoning",
    "fraud": "fast",
    "escalation": "fast",
    "router": "fast",
    "evidence": "vision",
    "learning": "fast",
}


@dataclass
class Usage:
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    per_agent: dict = field(default_factory=dict)

    def add(self, agent: str, model: str, tin: int, tout: int) -> None:
        self.calls += 1
        self.input_tokens += tin
        self.output_tokens += tout
        slot = self.per_agent.setdefault(agent, {"calls": 0, "model": model, "inr": 0.0})
        slot["calls"] += 1
        slot["inr"] = round(slot["inr"] + cost_inr(model, tin, tout), 4)

    @property
    def cost_inr(self) -> float:
        return round(sum(v["inr"] for v in self.per_agent.values()), 3)

    def as_dict(self) -> dict:
        return {"calls": self.calls, "input_tokens": self.input_tokens,
                "output_tokens": self.output_tokens, "cost_inr": self.cost_inr,
                "per_agent": self.per_agent}


def cost_inr(model: str, tin: int, tout: int) -> float:
    price_in, price_out = PRICING.get(model, (0.0, 0.0))
    usd = (tin / 1_000_000) * price_in + (tout / 1_000_000) * price_out
    return usd * USD_TO_INR


def _extract_json(text: str) -> dict:
    """Models occasionally wrap JSON in prose or a code fence. Recover it."""
    text = (text or "").strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Model did not return JSON: {text[:200]}")


def _encode_image(path: str | Path) -> tuple[str, str]:
    p = Path(path)
    media_type = mimetypes.guess_type(p.name)[0] or "image/jpeg"
    return media_type, base64.b64encode(p.read_bytes()).decode()


class LLMClient:
    def __init__(self, provider: str | None = None):
        self.provider = provider or settings.llm_provider
        self.usage = Usage()

    # ------------------------------------------------------------------
    def model_for(self, agent: str) -> str:
        if self.provider == "offline":
            return "offline"
        tier = AGENT_TIER.get(agent, "fast")
        return {"reasoning": settings.model_reasoning,
                "fast": settings.model_fast,
                "vision": settings.model_vision}[tier]

    def complete_json(self, *, agent: str, system: str, user: str,
                      schema: dict, images: list[str] | None = None,
                      context: dict | None = None) -> dict:
        """Structured output. Free text is confined to designated fields; every
        consequential value comes back typed and is validated by the caller."""
        model = self.model_for(agent)

        if self.provider == "offline":
            result = offline_provider.respond(agent, context or {})
            self.usage.add(agent, "offline", 0, 0)
            return result

        instruction = (
            f"{user}\n\nRespond with ONLY a JSON object matching this schema, "
            f"no prose and no code fence:\n{json.dumps(schema, indent=2)}"
        )
        try:
            raw, tin, tout = self._dispatch(model, system, instruction, images)
            self.usage.add(agent, model, tin, tout)
            return _extract_json(raw)
        except Exception as exc:  # provider down, rate limited, or malformed
            # Falling back keeps a live demo alive; the event log records that
            # the deterministic path was used rather than hiding it.
            result = offline_provider.respond(agent, context or {})
            result["_fallback"] = f"{type(exc).__name__}: {exc}"[:180]
            self.usage.add(agent, "offline", 0, 0)
            return result

    # ------------------------------------------------------------------
    def _dispatch(self, model: str, system: str, user: str,
                  images: list[str] | None) -> tuple[str, int, int]:
        if model.startswith("claude"):
            return self._anthropic(model, system, user, images)
        if model.startswith("gemini"):
            return self._gemini(model, system, user, images)
        if model.startswith("gpt"):
            return self._openai(model, system, user, images)
        raise ValueError(f"No provider route for model {model}")

    def _anthropic(self, model, system, user, images):
        content: list[dict] = []
        for img in images or []:
            media_type, data = _encode_image(img)
            content.append({"type": "image", "source": {
                "type": "base64", "media_type": media_type, "data": data}})
        content.append({"type": "text", "text": user})

        with httpx.Client(timeout=TIMEOUT) as client:
            res = client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": settings.anthropic_api_key,
                         "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json={"model": model, "max_tokens": 1500, "system": system,
                      "messages": [{"role": "user", "content": content}]})
            res.raise_for_status()
            data = res.json()
        text = "".join(b.get("text", "") for b in data.get("content", []))
        u = data.get("usage", {})
        return text, u.get("input_tokens", 0), u.get("output_tokens", 0)

    def _gemini(self, model, system, user, images):
        parts: list[dict] = [{"text": user}]
        for img in images or []:
            media_type, data = _encode_image(img)
            parts.append({"inline_data": {"mime_type": media_type, "data": data}})

        with httpx.Client(timeout=TIMEOUT) as client:
            res = client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model}:generateContent",
                params={"key": settings.google_api_key},
                json={"system_instruction": {"parts": [{"text": system}]},
                      "contents": [{"parts": parts}],
                      "generationConfig": {"temperature": 0.2,
                                           "responseMimeType": "application/json"}})
            res.raise_for_status()
            data = res.json()
        text = "".join(
            p.get("text", "")
            for p in data["candidates"][0]["content"].get("parts", []))
        u = data.get("usageMetadata", {})
        return (text, u.get("promptTokenCount", 0), u.get("candidatesTokenCount", 0))

    def _openai(self, model, system, user, images):
        content: list[dict] = [{"type": "text", "text": user}]
        for img in images or []:
            media_type, data = _encode_image(img)
            content.append({"type": "image_url",
                            "image_url": {"url": f"data:{media_type};base64,{data}"}})

        with httpx.Client(timeout=TIMEOUT) as client:
            res = client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={"model": model, "temperature": 0.2,
                      "response_format": {"type": "json_object"},
                      "messages": [{"role": "system", "content": system},
                                   {"role": "user", "content": content}]})
            res.raise_for_status()
            data = res.json()
        text = data["choices"][0]["message"]["content"]
        u = data.get("usage", {})
        return text, u.get("prompt_tokens", 0), u.get("completion_tokens", 0)


_shared = LLMClient()


def get_client() -> LLMClient:
    return _shared
