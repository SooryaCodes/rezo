"""Mock storefront API for the demo environment.

Simulates the commerce platform surface Rezo binds to: orders, customers,
payments, shipping, catalog. Seeded from seed_data.json with the demo
scenarios (happy path, fraud path, high-value approval path).
"""
from fastapi import FastAPI

app = FastAPI(title="Rezo Mock Shop", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "mock-shop"}
