"""Transport health state."""

from __future__ import annotations

from dataclasses import dataclass

from .schemas import StatusEnvelope, Telemetry


@dataclass
class CommanderHealth:
    screeps_online: bool = False
    telemetry_valid: bool = False
    telemetry_tick: int | None = None
    status_tick: int | None = None
    last_error: str | None = None
    telemetry: Telemetry | None = None
    status: StatusEnvelope | None = None

    @property
    def current_tick(self) -> int | None:
        ticks = [tick for tick in (self.telemetry_tick, self.status_tick) if tick is not None]
        return max(ticks) if ticks else None
