"""Deterministic remote economics, diagnostics rendering, and outcome evaluation."""

from __future__ import annotations

from statistics import fmean
from typing import Any

from .history import HistoryStore
from .schemas import RemoteMiningOperation, Telemetry


REMOTE_ACTIONS = frozenset({
    "REASSESS_REMOTE",
    "ENSURE_REMOTE_RESERVATION",
    "ENSURE_REMOTE_INFRASTRUCTURE",
    "REBALANCE_REMOTE_LOGISTICS",
})


class RemoteEconomics:
    WINDOWS = (1000, 5000, 20000)

    def __init__(self, history: HistoryStore) -> None:
        self.history = history

    def build(self, telemetry: Telemetry) -> dict[str, Any]:
        return {
            remote.room: {
                "health": remote.health,
                "diagnostics": [item.model_dump() for item in remote.diagnostics],
                "windows": {
                    str(window): self._window(telemetry, remote, window)
                    for window in self.WINDOWS
                },
            }
            for remote in telemetry.operations.remoteMining
        }

    def _window(
        self, telemetry: Telemetry, remote: RemoteMiningOperation, window: int
    ) -> dict[str, Any]:
        baseline_row = self.history.observation_at_or_before(telemetry.tick - window)
        partial = False
        if baseline_row is None or baseline_row["telemetry"].get("schemaVersion") != 3:
            rows = [
                row for row in self.history.observations_since(telemetry.tick - window)
                if row["telemetry"].get("schemaVersion") == 3
            ]
            baseline_row = rows[0] if rows else None
            partial = True
        if baseline_row is None:
            return {"available": False, "reason": "No Phase 4 baseline is available"}

        baseline = self._remote(baseline_row["telemetry"], remote.room)
        if baseline is None:
            return {"available": False, "reason": "Remote was absent from the baseline"}
        span = max(0, telemetry.tick - int(baseline_row["screeps_tick"]))
        rows = [
            row for row in self.history.observations_since(int(baseline_row["screeps_tick"]))
            if row["telemetry"].get("schemaVersion") == 3
            and row["screeps_tick"] <= telemetry.tick
        ]
        samples = [item for row in rows if (item := self._remote(row["telemetry"], remote.room))]
        delivered = max(
            0,
            remote.delivery.energyDeliveredTotal
            - int(baseline["delivery"]["energyDeliveredTotal"]),
        )
        losses = max(
            0,
            remote.losses.creepLossesTotal - int(baseline["losses"]["creepLossesTotal"]),
        )
        interruptions = max(
            0,
            remote.losses.hostileInterruptionsTotal
            - int(baseline["losses"]["hostileInterruptionsTotal"]),
        )
        backlogs = [int(sample["mining"]["energyWaiting"]) for sample in samples]
        uptime_samples = [
            bool(sample["active"]) and bool(sample["security"]["isSafe"])
            for sample in samples
        ]
        per_1000 = round(delivered * 1000 / span, 2) if span else None
        average_backlog = round(fmean(backlogs), 2) if backlogs else None
        efficiency = "UNKNOWN"
        if per_1000 is not None:
            if per_1000 >= 10000 and (average_backlog or 0) < 2000:
                efficiency = "GOOD"
            elif per_1000 >= 3000:
                efficiency = "FAIR"
            else:
                efficiency = "POOR"
        return {
            "available": True,
            "spanTicks": span,
            "partialWindow": partial,
            "sampleCount": len(samples),
            "grossEnergyDelivered": {"value": delivered, "provenance": "MEASURED"},
            "grossDeliveryPer1000Ticks": {"value": per_1000, "provenance": "DERIVED"},
            "harvestedEnergy": {"value": None, "provenance": "UNKNOWN"},
            "averageBacklog": {"value": average_backlog, "provenance": "DERIVED"},
            "creepLosses": {"value": losses, "provenance": "MEASURED"},
            "replacementEnergyCost": {
                "value": losses * 800 if losses else 0,
                "provenance": "ESTIMATED",
                "assumption": "800 energy per lost remote creep; live body costs are not retained",
            },
            "spawnTimeCost": {"value": None, "provenance": "UNKNOWN"},
            "reservationCost": {
                "value": None,
                "provenance": "UNKNOWN",
                "reason": "Reserver body and lifetime costs are not retained historically",
            },
            "hostileInterruptions": {"value": interruptions, "provenance": "MEASURED"},
            "operationalUptimePercent": {
                "value": round(sum(uptime_samples) * 100 / len(uptime_samples), 2)
                if uptime_samples else None,
                "provenance": "DERIVED",
            },
            "measuredDeliveryEfficiency": efficiency,
        }

    @staticmethod
    def _remote(telemetry: dict[str, Any], room: str) -> dict[str, Any] | None:
        return next(
            (
                item for item in telemetry.get("operations", {}).get("remoteMining", [])
                if item.get("room") == room
            ),
            None,
        )


def remote_snapshot(telemetry: Telemetry, room: str) -> dict[str, Any] | None:
    remote = next((item for item in telemetry.operations.remoteMining if item.room == room), None)
    if remote is None:
        return None
    return {
        "tick": telemetry.tick,
        "health": remote.health,
        "energyWaiting": remote.mining.energyWaiting,
        "containers": remote.mining.containers,
        "containerSites": remote.mining.containerSites,
        "deliveryTotal": remote.delivery.energyDeliveredTotal,
        "reservationTicks": remote.reservation.ticksToEnd,
        "reservationRelation": remote.reservation.relation,
        "reserverCapacity": (
            remote.reservation.reserverPresent
            + remote.reservation.reserverSpawning
            + remote.reservation.reserverQueued
        ),
        "populationState": remote.population.state,
        "diagnostics": remote.reasons,
    }


def evaluate_operation(operation: dict[str, Any], telemetry: Telemetry) -> tuple[str, dict[str, Any], str]:
    """Return outcome, result metrics, and a deterministic explanation."""
    current = remote_snapshot(telemetry, operation["room"])
    if current is None:
        return "INCONCLUSIVE", {}, "The configured remote is absent from current telemetry."
    baseline = operation["baseline"]
    action = operation["action"]
    if action == "REBALANCE_REMOTE_LOGISTICS":
        before = int(baseline.get("energyWaiting") or 0)
        after = int(current["energyWaiting"])
        delivery = int(current["deliveryTotal"]) - int(baseline.get("deliveryTotal") or 0)
        reduction = before - after
        if before > 0 and after <= before * 0.6 and delivery > 0:
            outcome, reason = "SUCCESS", "Backlog fell at least 40% while measured delivery continued."
        elif before > 0 and after <= before * 0.9:
            outcome, reason = "PARTIAL_SUCCESS", "Backlog improved, but not enough for full success."
        elif delivery <= 0 and after >= before:
            outcome, reason = "NO_EFFECT", "No delivery increase or backlog reduction was observed."
        else:
            outcome, reason = "INCONCLUSIVE", "Delivery changed without a decisive backlog improvement."
        current["backlogReduction"] = reduction
        current["deliveredDuringEvaluation"] = max(0, delivery)
        return outcome, current, reason
    if action == "ENSURE_REMOTE_INFRASTRUCTURE":
        before = int(baseline.get("containers") or 0) + int(baseline.get("containerSites") or 0)
        after = int(current["containers"]) + int(current["containerSites"])
        if after > before:
            return "SUCCESS", current, "A deterministic source-container site or structure appeared."
        return "NO_EFFECT", current, "No additional source-container site or structure was observed."
    if action == "ENSURE_REMOTE_RESERVATION":
        before = int(baseline.get("reservationTicks") or 0)
        after = int(current.get("reservationTicks") or 0)
        if current["reservationRelation"] == "SELF" and after > before:
            return "SUCCESS", current, "The self reservation increased during the evaluation window."
        if int(current["reserverCapacity"]) > int(baseline.get("reserverCapacity") or 0):
            return "PARTIAL_SUCCESS", current, "Reserver capacity was queued or added, but reserve ticks have not risen yet."
        return "NO_EFFECT", current, "Neither reserver capacity nor self-reservation ticks improved."
    if action == "REASSESS_REMOTE":
        if current["tick"] > int(baseline.get("tick") or 0):
            return "SUCCESS", current, "A newer deterministic remote assessment is available."
    return "INCONCLUSIVE", current, "No deterministic evaluator exists for this action."
