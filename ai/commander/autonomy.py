"""Deterministic continuous policy for routine Phase 5 operations."""

from __future__ import annotations

import re
from typing import Any

from .history import HistoryStore
from .remote_ops import remote_snapshot
from .schemas import StrategicOrder, Telemetry
from .transport import CommanderTransport


DIAGNOSTIC_ACTIONS = {
    "STALE_INTEL": "REASSESS_REMOTE",
    "ROUTE_FAILURE": "REASSESS_REMOTE",
    "RESERVER_SHORTAGE": "ENSURE_REMOTE_RESERVATION",
    "RESERVATION_EXPIRING": "ENSURE_REMOTE_RESERVATION",
    "NO_CONTAINER": "ENSURE_REMOTE_INFRASTRUCTURE",
    "CONTAINER_DAMAGED": "ENSURE_REMOTE_INFRASTRUCTURE",
    "ENERGY_BACKLOG": "REBALANCE_REMOTE_LOGISTICS",
    "HAULER_SHORTAGE": "REBALANCE_REMOTE_LOGISTICS",
}


class AutonomyController:
    """Select at most one bounded deterministic action per poll."""

    ROUTINE_COOLDOWN = 500
    SCOUT_COOLDOWN = 250

    def __init__(self, history: HistoryStore, transport: CommanderTransport) -> None:
        self.history = history
        self.transport = transport

    def run(self, telemetry: Telemetry) -> StrategicOrder | None:
        authority = telemetry.authority
        if authority.mode != "execute" or self.history.pending_commands():
            return None
        if authority.execution.autoRemoteMaintenance:
            order = self._remote_maintenance(telemetry)
            if order:
                return order
        if authority.execution.autoScouting:
            order = self._scout(telemetry)
            if order:
                return order
        if authority.execution.autoNewRemotes:
            return self._new_remote(telemetry)
        return None

    def _remote_maintenance(self, telemetry: Telemetry) -> StrategicOrder | None:
        severity = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        options: list[tuple[int, str, Any]] = []
        for remote in telemetry.operations.remoteMining:
            for diagnostic in remote.diagnostics:
                action = DIAGNOSTIC_ACTIONS.get(diagnostic.diagnostic)
                if action and self._cooled_down(action, remote.room, telemetry.tick, self.ROUTINE_COOLDOWN):
                    options.append((severity[diagnostic.severity], action, remote))
        if not options:
            return None
        _, action, remote = sorted(options, key=lambda item: (item[0], item[2].room, item[1]))[0]
        matching = [item.diagnostic for item in remote.diagnostics if DIAGNOSTIC_ACTIONS.get(item.diagnostic) == action]
        trigger = ", ".join(matching)
        order = self.transport.send_safe_command(
            action, {"room": remote.room},
            reason=f"Deterministic continuous maintenance: {trigger} in {remote.room}",
        )
        baseline = remote_snapshot(telemetry, remote.room)
        if baseline:
            self.history.create_operation(
                f"op-{order.id}", order.id, trigger, remote.room, action,
                f"Routine deterministic Phase 5 maintenance for {remote.room}", None,
                telemetry.tick, baseline, "The triggering deterministic diagnostic should improve",
                telemetry.tick + 1000,
            )
        return order

    def _scout(self, telemetry: Telemetry) -> StrategicOrder | None:
        active = [mission for mission in telemetry.operations.scouting if mission.status not in {"COMPLETED", "FAILED", "EXPIRED"}]
        if active:
            return None
        targets = list(telemetry.intelligence.unknownRooms) + list(telemetry.intelligence.staleRooms)
        if not targets or not telemetry.colonies:
            return None
        target = targets[0]
        origin = min(
            telemetry.colonies,
            key=lambda room: self._linear_distance(room, target),
        )
        if not self._cooled_down("SCOUT_ROOM", target, telemetry.tick, self.SCOUT_COOLDOWN):
            return None
        return self.transport.send_safe_command(
            "SCOUT_ROOM", {"room": target, "origin": origin},
            reason=f"Deterministic radius-{telemetry.intelligence.radius} territorial mapping for {target}",
        )

    def _new_remote(self, telemetry: Telemetry) -> StrategicOrder | None:
        active = [item for item in telemetry.operations.remoteEstablishments if item.state not in {"HEALTHY", "DEGRADED", "FAILED"}]
        if active:
            return None
        candidate = next((item for item in telemetry.remoteCandidates if item.eligible), None)
        if candidate is None or candidate.origin is None:
            return None
        if not self._cooled_down("START_REMOTE_MINING", candidate.room, telemetry.tick, 10000):
            return None
        order = self.transport.send_safe_command(
            "START_REMOTE_MINING", {"origin": candidate.origin, "target": candidate.room},
            reason=(f"Highest eligible deterministic remote candidate: {candidate.room} score "
                    f"{candidate.score}, predicted {candidate.predictedEconomics.quality}"),
        )
        self.history.create_operation(
            f"op-{order.id}", order.id, "eligible remote candidate selected",
            candidate.room, "START_REMOTE_MINING",
            f"Selected {candidate.room} from {candidate.origin} at score {candidate.score}",
            candidate.confidence, telemetry.tick,
            {"candidate": candidate.model_dump(), "deliveryTotal": 0, "tick": telemetry.tick},
            "The remote should bootstrap miners and deliver measurable energy",
            telemetry.tick + 5000,
        )
        return order

    def _cooled_down(self, action: str, room: str, tick: int, cooldown: int) -> bool:
        for command in self.history.recent_commands(200):
            if command["action"] != action or tick - int(command["created_tick"]) >= cooldown:
                continue
            import json
            parameters = json.loads(command["parameters_json"])
            if parameters.get("room", parameters.get("target")) == room:
                return False
        return True

    @staticmethod
    def _linear_distance(origin: str, target: str) -> int:
        def coordinates(room: str) -> tuple[int, int]:
            match = re.fullmatch(r"([WE])(\d+)([NS])(\d+)", room)
            if match is None:
                return (0, 0)
            horizontal, x_value, vertical, y_value = match.groups()
            x = int(x_value) if horizontal == "E" else -int(x_value) - 1
            y = int(y_value) if vertical == "S" else -int(y_value) - 1
            return (x, y)

        origin_x, origin_y = coordinates(origin)
        target_x, target_y = coordinates(target)
        return max(abs(origin_x - target_x), abs(origin_y - target_y))
