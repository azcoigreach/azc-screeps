"""Deterministic continuous policy for routine Phase 5 operations."""

from __future__ import annotations

import re
from typing import Any

from .history import HistoryStore
from .recovery_policy import (
    growth_blocked,
    load_state,
    recovery_active,
    remote_maintenance_allowed,
)
from .remote_ops import remote_snapshot
from .remote_ops import RemoteEconomics
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

ACTION_OBJECTIVES = {
    "REASSESS_REMOTE": "reassess",
    "ENSURE_REMOTE_RESERVATION": "reservation",
    "ENSURE_REMOTE_INFRASTRUCTURE": "infrastructure",
    "REBALANCE_REMOTE_LOGISTICS": "logistics",
}


class AutonomyController:
    """Select at most one bounded deterministic action per poll."""

    ROUTINE_COOLDOWN = 500
    SCOUT_COOLDOWN = 250
    ABANDON_COOLDOWN = 5000

    def __init__(self, history: HistoryStore, transport: CommanderTransport) -> None:
        self.history = history
        self.transport = transport

    def run(self, telemetry: Telemetry) -> StrategicOrder | None:
        authority = telemetry.authority
        if authority.mode != "execute" or self.history.pending_commands():
            return None
        current_load = load_state(telemetry)
        recovering = recovery_active(telemetry)
        if (
            authority.execution.autoRemotePausing
            and current_load in {"OVEREXTENDED", "CRITICAL"}
        ):
            order = self._pause_remote(telemetry)
            if order:
                return order
        if (
            authority.execution.remotePausing
            and not recovering
            and current_load in {"HEALTHY", "STRAINED"}
        ):
            order = self._resume_remote(telemetry)
            if order:
                return order
        # A fully validated, explicitly automatic major operation must not be
        # starved by the indefinitely replenishable scouting and maintenance
        # queues. Blocked plans simply fall through to routine work.
        if authority.execution.autoColonization and not growth_blocked(telemetry):
            order = self._colonization(telemetry)
            if order:
                return order
        if (
            authority.execution.autoRemoteAbandonment
            and not recovering
            and current_load in {"HEALTHY", "STRAINED"}
        ):
            order = self._abandon_remote(telemetry)
            if order:
                return order
        # Frontier scouting gets a bounded opportunity ahead of routine repairs,
        # but never while the home colony is overextended or critical.
        if authority.execution.autoScouting and not recovering and current_load in {"HEALTHY", "STRAINED"}:
            order = self._scout(telemetry)
            if order:
                return order
        if authority.execution.autoRemoteMaintenance:
            order = self._remote_maintenance(telemetry, recovering=recovering)
            if order:
                return order
        if authority.execution.autoNewRemotes:
            if growth_blocked(telemetry):
                return None
            return self._new_remote(telemetry)
        return None

    def _colonization(self, telemetry: Telemetry) -> StrategicOrder | None:
        readiness = telemetry.expansionReadiness
        if (
            readiness.status != "READY"
            or readiness.recommendedRoom is None
            or readiness.origin is None
            or readiness.layout is None
        ):
            return None
        active = [
            operation for operation in telemetry.operations.colonizations
            if operation.state not in {"SUCCESS", "FAILED"}
        ]
        if active or not self._cooled_down(
            "COLONIZE_ROOM", readiness.recommendedRoom, telemetry.tick, 50000
        ):
            return None
        candidate = next(
            (item for item in telemetry.claimCandidates if item.room == readiness.recommendedRoom),
            None,
        )
        if candidate is None or not candidate.eligible:
            return None
        order = self.transport.send_safe_command(
            "COLONIZE_ROOM",
            {
                "origin": readiness.origin,
                "target": readiness.recommendedRoom,
                "layout": readiness.layout,
            },
            reason=(
                f"Highest ready permanent-colony candidate: {candidate.room} score "
                f"{candidate.score}, role {candidate.currentOperationalRole}"
            ),
        )
        self.history.create_operation(
            f"op-{order.id}", order.id, "permanent colonization readiness reached",
            candidate.room, "COLONIZE_ROOM",
            f"Selected {candidate.room} from {readiness.origin} at score {candidate.score}",
            None, telemetry.tick,
            {
                "candidate": candidate.model_dump(),
                "readiness": readiness.model_dump(),
                "tick": telemetry.tick,
            },
            "The target should become an owned, spawned, locally harvesting, self-sustaining colony",
            telemetry.tick + 25000,
        )
        return order

    def _remote_maintenance(
        self, telemetry: Telemetry, *, recovering: bool = False
    ) -> StrategicOrder | None:
        severity = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        options: list[tuple[int, str, Any]] = []
        for remote in telemetry.operations.remoteMining:
            for diagnostic in remote.diagnostics:
                action = DIAGNOSTIC_ACTIONS.get(diagnostic.diagnostic)
                objective = ACTION_OBJECTIVES.get(action or "")
                if (
                    action
                    and remote_maintenance_allowed(
                        remote, action, recovering=recovering
                    )
                    and objective not in remote.objectives
                    and self._cooled_down(
                        action, remote.room, telemetry.tick,
                        2000 if action == "ENSURE_REMOTE_RESERVATION" else self.ROUTINE_COOLDOWN,
                    )
                    and not (action == "ENSURE_REMOTE_RESERVATION"
                        and (remote.reservation.reserverSpawning > 0 or remote.reservation.reserverQueued > 0))
                ):
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
        active = [
            mission for mission in telemetry.operations.scouting
            if mission.status not in {"DEFERRED", "OBSERVED", "COMPLETED", "FAILED", "EXPIRED"}
        ]
        if active:
            return None
        targets = list(telemetry.intelligence.unknownRooms) + list(telemetry.intelligence.staleRooms)
        targets = [
            room for room in targets
            if telemetry.intelligence.protectionByRoom.get(room) is None
            or telemetry.intelligence.protectionByRoom[room].accessibility == "REACHABLE_NOW"
        ]
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

    def drawdown_ranking(self, telemetry: Telemetry) -> list[dict[str, Any]]:
        """Rank reversible load shedding with measured economics when available."""
        economics = RemoteEconomics(self.history).build(telemetry)
        base = {item.get("room"): dict(item) for item in telemetry.remoteDrawdownRanking}
        result: list[dict[str, Any]] = []
        for remote in telemetry.operations.remoteMining:
            item = base.get(remote.room, {"room": remote.room, "score": 0})
            value = economics.get(remote.room, {}).get("value", {})
            net = value.get("components", {}).get("estimatedNetValuePer1000")
            confidence = float(value.get("confidence") or 0)
            if net is not None and confidence >= 0.5:
                item["score"] = float(item.get("score") or 0) + max(0.0, -float(net) / 500.0)
            item["estimatedNetPer1000"] = net
            item["economicConfidence"] = confidence
            item["economicQuality"] = value.get("quality", "UNKNOWN")
            item["paused"] = remote.paused
            result.append(item)
        return sorted(result, key=lambda item: (-float(item.get("score") or 0), str(item["room"])))

    def _pause_remote(self, telemetry: Telemetry) -> StrategicOrder | None:
        if not self._cooled_down("PAUSE_REMOTE_MINING", "*", telemetry.tick, 5000):
            return None
        ranking = [item for item in self.drawdown_ranking(telemetry) if not item.get("paused")]
        if not ranking:
            return None
        target = ranking[0]
        order = self.transport.send_safe_command(
            "PAUSE_REMOTE_MINING", {"room": target["room"]},
            reason=(f"Empire load {telemetry.empireLoad.get('state')} selected reversible drawdown rank 1: "
                f"score {target.get('score')}, health {target.get('health')}, net/1k {target.get('estimatedNetPer1000')}")
        )
        if order:
            baseline = remote_snapshot(telemetry, target["room"]) or {}
            baseline["empireLoad"] = telemetry.empireLoad
            baseline["drawdownRanking"] = ranking
            self.history.create_operation(
                f"op-{order.id}", order.id, "empire overextension", target["room"], "PAUSE_REMOTE_MINING",
                "Pause the least valuable remote to release spawn capacity", None, telemetry.tick,
                baseline, "home population and spawn pressure should recover", telemetry.tick + 2000,
            )
        return order

    def _resume_remote(self, telemetry: Telemetry) -> StrategicOrder | None:
        population = telemetry.empireLoad.get("homePopulation", {})
        spawn = telemetry.empireLoad.get("spawnPressure", {})
        if float(population.get("satisfaction") or 0) < 85 or float(population.get("criticalSatisfaction") or 0) < 100:
            return None
        if int(spawn.get("queueDepth") or 0) > 1:
            return None
        candidates = [remote for remote in telemetry.operations.remoteMining if remote.lifecycleState == "RECOVERY_CANDIDATE"]
        if not candidates:
            return None
        remote = sorted(candidates, key=lambda item: item.room)[0]
        if not self._cooled_down("RESUME_REMOTE_MINING", remote.room, telemetry.tick, 3000):
            return None
        return self.transport.send_safe_command(
            "RESUME_REMOTE_MINING", {"room": remote.room},
            reason=f"Stable home recovery permits hysteretic reactivation of {remote.room}",
        )

    def _abandon_remote(self, telemetry: Telemetry) -> StrategicOrder | None:
        converting = {
            operation.target for operation in telemetry.operations.colonizations
            if operation.target is not None and operation.state not in {"SUCCESS", "FAILED"}
        }
        candidates = [
            remote for remote in telemetry.operations.remoteMining
            if remote.active and not remote.paused and remote.room not in converting
            and remote.stopLoss.state == "ABANDON_RECOMMENDED"
            and remote.stopLoss.autoEligible
            and bool(remote.stopLoss.autoEligibilityEvidence)
        ]
        if not candidates or not self._cooled_down(
            "STOP_REMOTE_MINING", "*", telemetry.tick, self.ABANDON_COOLDOWN
        ):
            return None
        ranking = {item["room"]: item for item in self.drawdown_ranking(telemetry)}
        remote = sorted(
            candidates,
            key=lambda item: (
                -float(ranking.get(item.room, {}).get("score") or 0), item.room
            ),
        )[0]
        evidence = ", ".join(remote.stopLoss.autoEligibilityEvidence)
        return self.transport.send_safe_command(
            "STOP_REMOTE_MINING", {"room": remote.room},
            reason=(f"Automatic guarded abandonment after sustained post-recovery stop-loss evidence: "
                    f"{evidence}; bad windows {remote.stopLoss.badWindows}"),
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
            if room == "*" or parameters.get("room", parameters.get("target")) == room:
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
