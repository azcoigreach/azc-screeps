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
        result: dict[str, Any] = {}
        for remote in telemetry.operations.remoteMining:
            windows = {
                str(window): self._window(telemetry, remote, window)
                for window in self.WINDOWS
            }
            windows["lifetime"] = self._window(telemetry, remote, None)
            basis = next(
                (windows[key] for key in ("5000", "20000", "1000", "lifetime") if windows[key].get("available")),
                None,
            )
            result[remote.room] = {
                "health": remote.health,
                "diagnostics": [item.model_dump() for item in remote.diagnostics],
                "windows": windows,
                "value": self._value_model(remote, basis),
                "stopLoss": remote.stopLoss.model_dump(),
            }
        return result

    def _window(
        self, telemetry: Telemetry, remote: RemoteMiningOperation, window: int | None
    ) -> dict[str, Any]:
        baseline_row = (
            self.history.observation_at_or_before(telemetry.tick - window)
            if window is not None else None
        )
        partial = False
        if baseline_row is None or baseline_row["telemetry"].get("schemaVersion") != 3:
            rows = [
                row for row in self.history.observations_since(0 if window is None else telemetry.tick - window)
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
        role_costs = self._role_costs(remote, span)
        loss_cost = losses * 800
        total_cost = sum(item["value"] for item in role_costs.values()) + loss_cost
        net = delivered - total_cost
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
                "value": loss_cost,
                "provenance": "ESTIMATED",
                "assumption": "800 energy per lost remote creep; live body costs are not retained",
            },
            "spawnTimeCost": {"value": None, "provenance": "UNKNOWN"},
            "minerReplacementCost": role_costs["miner"],
            "haulerReplacementCost": role_costs["hauler"],
            "reservationCost": role_costs["reserver"],
            "defenderCost": {"value": None, "provenance": "UNKNOWN"},
            "infrastructureReplacementCost": {"value": None, "provenance": "UNKNOWN"},
            "estimatedNetEnergy": {"value": net, "provenance": "ESTIMATED"},
            "estimatedNetPer1000Ticks": {
                "value": round(net * 1000 / span, 2) if span else None,
                "provenance": "ESTIMATED",
            },
            "routeLengthRooms": {"value": remote.route.length, "provenance": "MEASURED" if remote.route.length is not None else "UNKNOWN"},
            "spawnCapacityConsumedTicks": {
                "value": round(sum(item["spawnTicks"] for item in role_costs.values()) * span / 1500, 2),
                "provenance": "ESTIMATED",
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
    def _role_costs(remote: RemoteMiningOperation, span: int) -> dict[str, dict[str, Any]]:
        roles = remote.population.roles
        miners = sum(roles.get(role).desired for role in ("burrower", "miner") if role in roles)
        haulers = roles.get("carrier").desired if "carrier" in roles else 0
        reservers = roles.get("reserver").desired if "reserver" in roles else 0
        # Current AZC body energy is not retained historically. These assumptions
        # remain explicit and are never upgraded to measured provenance.
        assumptions = {
            "miner": (miners, 800, 30),
            "hauler": (haulers, 650, 24),
            "reserver": (reservers, 1300, 36),
        }
        return {
            role: {
                "value": round(count * cost * span / 1500),
                "provenance": "ESTIMATED",
                "spawnTicks": count * spawn_ticks,
                "assumption": f"{count} active slots, {cost} energy/body, 1500-tick nominal life",
            }
            for role, (count, cost, spawn_ticks) in assumptions.items()
        }

    @staticmethod
    def _value_model(remote: RemoteMiningOperation, window: dict[str, Any] | None) -> dict[str, Any]:
        if not window:
            return {"quality": "UNKNOWN", "confidence": 0.0, "components": {}, "evidence": ["no historical baseline"]}
        net = window["estimatedNetPer1000Ticks"]["value"]
        gross = window["grossDeliveryPer1000Ticks"]["value"]
        confidence = min(0.95, 0.35 + min(0.4, window["spanTicks"] / 20000) + min(0.2, window["sampleCount"] / 20))
        if net is None:
            quality = "UNKNOWN"
        elif net >= 7000:
            quality = "EXCELLENT"
        elif net >= 3000:
            quality = "GOOD"
        elif net >= 500:
            quality = "MARGINAL"
        elif net >= 0:
            quality = "POOR"
        else:
            quality = "LOSING"
        return {
            "quality": quality,
            "confidence": round(confidence, 2),
            "components": {
                "grossEnergyPer1000": gross,
                "estimatedNetValuePer1000": net,
                "minerCost": window["minerReplacementCost"],
                "haulerCost": window["haulerReplacementCost"],
                "reservationCost": window["reservationCost"],
                "lossCost": window["replacementEnergyCost"],
                "routeLengthRooms": remote.route.length,
            },
            "evidence": [
                f"{window['spanTicks']} ticks across {window['sampleCount']} samples",
                "delivery is measured; lifecycle costs are explicit estimates",
            ],
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
    if operation["action"] == "START_REMOTE_MINING":
        establishment = next(
            (item for item in telemetry.operations.remoteEstablishments if item.target == operation["room"]),
            None,
        )
        if current is None or establishment is None:
            return "FAILED", {}, "The new remote never appeared in configured operational telemetry."
        result = current | {
            "establishmentState": establishment.state,
            "actualDelivered": establishment.actualDelivered,
            "prediction": establishment.prediction,
        }
        if establishment.state == "FAILED":
            return "FAILED", result, establishment.failureReason or "Deterministic establishment failed."
        if establishment.actualDelivered > 0 and current["reservationRelation"] in {"SELF", "NEUTRAL"}:
            return "SUCCESS", result, "The configured remote bootstrapped and delivered measurable energy."
        if establishment.state in {"BOOTSTRAPPING", "ACTIVE"}:
            return "PARTIAL_SUCCESS", result, "The remote is operationally bootstrapping, but the evaluation window has limited delivery evidence."
        return "INCONCLUSIVE", result, "The remote is configured but has not produced enough startup evidence yet."
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
