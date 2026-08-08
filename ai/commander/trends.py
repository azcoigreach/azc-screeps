"""Historical strategic trends derived from SQLite observations."""

from __future__ import annotations

from statistics import fmean
from typing import Any

from .history import HistoryStore
from .schemas import Telemetry


class TrendAnalyzer:
    WINDOWS = (1000, 5000, 20000)

    def __init__(self, history: HistoryStore) -> None:
        self.history = history

    def build(self, current: Telemetry) -> dict[str, Any]:
        result: dict[str, Any] = {
            "dataProvenance": (
                "Current values and cumulative counters come from Screeps telemetry. "
                "Rates and deltas are calculated by the external commander from stored SQLite observations. "
                "Remote delivered energy is gross measured delivery; storage change is net colony balance."
            ),
            "windows": {},
        }
        for ticks in self.WINDOWS:
            result["windows"][str(ticks)] = self._window(current, current.tick - ticks, f"last {ticks:,} ticks")

        recommendation = self.history.latest_recommendation()
        if recommendation and recommendation["observation_tick"] < current.tick:
            result["sincePreviousAdvisory"] = self._window(
                current,
                int(recommendation["observation_tick"]),
                "since previous advisory",
            )
        else:
            result["sincePreviousAdvisory"] = {
                "available": False,
                "reason": "No earlier advisory observation is available",
            }
        return result

    def _window(self, current: Telemetry, target_tick: int, label: str) -> dict[str, Any]:
        baseline_row = self.history.observation_at_or_before(target_tick)
        partial_window = False
        if baseline_row is None or baseline_row["telemetry"].get("schemaVersion") != 3:
            baseline_row = next(
                (
                    row for row in self.history.observations_since(target_tick)
                    if row["telemetry"].get("schemaVersion") == 3
                    and row["screeps_tick"] <= current.tick
                ),
                None,
            )
            if baseline_row is None:
                return {
                    "available": False,
                    "label": label,
                    "targetTick": target_tick,
                    "reason": "No Phase 4 baseline exists in the requested period",
                }
            partial_window = True

        baseline = baseline_row["telemetry"]
        span = max(0, current.tick - int(baseline["tick"]))
        rows = [
            row for row in self.history.observations_since(int(baseline["tick"]))
            if row["telemetry"].get("schemaVersion") == 3 and row["screeps_tick"] <= current.tick
        ]
        colony_trends: dict[str, Any] = {}
        for room, colony in current.colonies.items():
            old = baseline.get("colonies", {}).get(room)
            if not old:
                colony_trends[room] = {"available": False, "reason": "Colony absent from baseline"}
                continue
            controller_delta = None
            if old["controller"]["rcl"] == colony.controller.rcl:
                controller_delta = colony.controller.progress - old["controller"]["progress"]
            colony_trends[room] = {
                "available": True,
                "storageEnergy": {
                    "baseline": old["energy"]["storageEnergy"],
                    "current": colony.energy.storageEnergy,
                    "netChange": colony.energy.storageEnergy - old["energy"]["storageEnergy"],
                },
                "controller": {
                    "baselineRcl": old["controller"]["rcl"],
                    "currentRcl": colony.controller.rcl,
                    "progressDeltaAtSameRcl": controller_delta,
                },
                "population": {
                    "baselineAlive": old["population"]["aliveTotal"],
                    "currentAlive": colony.population.aliveTotal,
                    "aliveDelta": colony.population.aliveTotal - old["population"]["aliveTotal"],
                    "currentDemandSatisfaction": colony.population.demandSatisfaction,
                },
            }

        old_remotes = {
            remote["room"]: remote for remote in baseline.get("operations", {}).get("remoteMining", [])
        }
        remote_trends: dict[str, Any] = {}
        for remote in current.operations.remoteMining:
            old = old_remotes.get(remote.room)
            if not old:
                remote_trends[remote.room] = {"available": False, "reason": "Remote absent from baseline"}
                continue
            delivered = remote.delivery.energyDeliveredTotal - old["delivery"]["energyDeliveredTotal"]
            remote_trends[remote.room] = {
                "available": True,
                "grossEnergyDelivered": delivered,
                "deliveryPer1000Ticks": round(delivered * 1000 / span, 2) if span > 0 else None,
                "creepLosses": remote.losses.creepLossesTotal - old["losses"]["creepLossesTotal"],
                "hostileInterruptions": (
                    remote.losses.hostileInterruptionsTotal - old["losses"]["hostileInterruptionsTotal"]
                ),
                "population": {
                    "baselineAlive": old["population"]["aliveTotal"],
                    "currentAlive": remote.population.aliveTotal,
                    "currentDemandSatisfaction": remote.population.demandSatisfaction,
                },
            }

        cpu_values = [float(row["cpu_used"]) for row in rows]
        buckets = [int(row["cpu_bucket"]) for row in rows]
        old_gcl = baseline["empire"]["gcl"]
        return {
            "available": True,
            "label": label,
            "targetTick": target_tick,
            "baselineTick": int(baseline["tick"]),
            "currentTick": current.tick,
            "spanTicks": span,
            "partialWindow": partial_window,
            "sampleCount": len(rows),
            "colonies": colony_trends,
            "remotes": remote_trends,
            "empire": {
                "gclLevelBefore": old_gcl["level"],
                "gclLevelNow": current.empire.gcl.level,
                "gclProgressDeltaAtSameLevel": (
                    current.empire.gcl.progress - old_gcl["progress"]
                    if old_gcl["level"] == current.empire.gcl.level else None
                ),
                "creepDelta": current.empire.creeps - baseline["empire"]["creeps"],
                "cpuAverage": round(fmean(cpu_values), 3) if cpu_values else None,
                "cpuBucketBefore": buckets[0] if buckets else None,
                "cpuBucketNow": current.cpu.bucket,
                "cpuBucketDelta": current.cpu.bucket - buckets[0] if buckets else None,
            },
        }
