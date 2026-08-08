"""Memory Segment allocation shared with the Phase 1 JavaScript protocol."""

from __future__ import annotations

import hashlib


SCHEMA_VERSION = 1
TELEMETRY_SEGMENT = 90
INBOX_SEGMENT = 91
STATUS_SEGMENT = 92
SAFE_ACTIONS = frozenset({
    "NOOP", "REQUEST_STATUS", "SET_EXPLANATION", "SCOUT_ROOM", "REASSESS_REMOTE",
    "ENSURE_REMOTE_RESERVATION", "ENSURE_REMOTE_INFRASTRUCTURE", "REBALANCE_REMOTE_LOGISTICS",
})


def content_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
