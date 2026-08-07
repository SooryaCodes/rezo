"""Agent event stream.

Every node emits as it works. The same stream renders twice: as plain status
for the buyer ("evidence verified, checking policy") and as the live agent graph
the operator watches. Built once, used in both places.

Events are kept in memory for streaming and mirrored into the append-only audit
log, which is the durable record.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone

_LOCK = threading.Lock()
_STREAMS: dict[str, list[dict]] = {}
_MAX_PER_DISPUTE = 500


def emit(dispute_id: str, agent: str, kind: str, message: str,
         data: dict | None = None) -> dict:
    """Record one step. Safe to call from the worker thread running the graph."""
    event = {
        "seq": 0,
        "at": datetime.now(timezone.utc).isoformat(),
        "dispute_id": dispute_id,
        "agent": agent,
        "kind": kind,          # start | finding | tool | gate | decision | error
        "message": message,
        "data": data or {},
    }
    with _LOCK:
        stream = _STREAMS.setdefault(dispute_id, [])
        event["seq"] = len(stream)
        stream.append(event)
        if len(stream) > _MAX_PER_DISPUTE:
            del stream[: len(stream) - _MAX_PER_DISPUTE]
    return event


def since(dispute_id: str, index: int = 0) -> list[dict]:
    with _LOCK:
        return list(_STREAMS.get(dispute_id, [])[index:])


def all_events(dispute_id: str) -> list[dict]:
    return since(dispute_id, 0)


def clear(dispute_id: str) -> None:
    with _LOCK:
        _STREAMS.pop(dispute_id, None)
