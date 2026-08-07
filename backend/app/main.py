"""Rezo backend entrypoint."""
from fastapi import FastAPI

app = FastAPI(
    title="Rezo",
    description="Autonomous multi-agent dispute resolution for e-commerce.",
    version="0.1.0",
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "rezo-backend"}


# Route modules land with the Round 2 prototype:
#   /disputes            create + track a dispute case
#   /disputes/{id}/ws    live agent event stream (buyer status + console)
#   /capture/{id}        challenge issuance + evidence frame ingestion
#   /approvals           seller approval queue (interrupt -> resume)
#   /platform            level-2 arbitration queue
