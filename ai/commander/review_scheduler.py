"""Persistent, event-driven scheduling for paid strategic reviews."""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .history import HistoryStore
from .observer import ObservationUpdate
from .schemas import Telemetry


STATE_KEY = "llm_review_scheduler_v1"
INFO = "INFO"
MATERIAL = "MATERIAL"
URGENT = "URGENT"


@dataclass(frozen=True)
class StrategicEvent:
    key: str
    priority: str
    message: str


@dataclass(frozen=True)
class ReviewDecision:
    should_review: bool
    reason: str
    strategic_hash: str
    events: tuple[StrategicEvent, ...] = ()
    next_review_epoch: float | None = None


class ReviewScheduler:
    """Coalesce strategic transitions and enforce a restart-safe review cadence."""

    def __init__(
        self,
        history: HistoryStore,
        *,
        min_interval_seconds: float,
        max_idle_interval_seconds: float,
        debounce_seconds: float,
    ) -> None:
        self.history = history
        self.min_interval = min_interval_seconds
        self.max_idle = max_idle_interval_seconds
        self.debounce = debounce_seconds
        self.state = history.transport_state(STATE_KEY) or self._initial_state()

    def _initial_state(self) -> dict[str, Any]:
        latest = self.history.latest_recommendation()
        last_review = 0.0
        if latest and latest.get("created_at"):
            try:
                last_review = datetime.fromisoformat(latest["created_at"]).timestamp()
            except (TypeError, ValueError):
                pass
        return {
            "last_review_at": last_review,
            "last_attempt_at": 0.0,
            "last_review_hash": None,
            "current_hash": None,
            "pending_since": None,
            "pending_events": {},
            "metrics": {
                "suppressed": 0,
                "coalesced": 0,
                "triggered": 0,
                "urgent": 0,
                "material": 0,
                "periodic": 0,
                "manual": 0,
                "failures": 0,
            },
        }

    def evaluate(self, update: ObservationUpdate, now_epoch: float | None = None) -> ReviewDecision:
        now = time.time() if now_epoch is None else now_epoch
        strategic_hash = self.strategic_hash(update.telemetry)
        self.state["current_hash"] = strategic_hash

        new_events: list[StrategicEvent] = []
        if update.is_new:
            new_events = self.classify(update.previous_telemetry, update.telemetry)
            # When an existing database is first upgraded, associate its latest
            # advisory with the preceding strategic state instead of paying for
            # a restart-only baseline review.
            if self.state.get("last_review_at") and not self.state.get("last_review_hash"):
                self.state["last_review_hash"] = (
                    self.strategic_hash(update.previous_telemetry)
                    if update.previous_telemetry is not None else strategic_hash
                )
                new_events = [event for event in new_events if event.key != "telemetry_baseline"]
            self._accept_events(new_events, now)

            actionable = [event for event in new_events if event.priority != INFO]
            if not actionable and new_events:
                self._increment("suppressed")
                self.history.record_event(
                    "review_suppressed", "Informational telemetry change did not require an LLM review",
                    {"events": [event.key for event in new_events]},
                )

            if (
                strategic_hash == self.state.get("last_review_hash")
                and not any(event.priority == URGENT for event in actionable)
                and self.state.get("pending_events")
            ):
                self._increment("suppressed")
                self.state["pending_events"] = {}
                self.state["pending_since"] = None
                self.history.record_event(
                    "review_suppressed", "Strategic state returned to the last reviewed state",
                    {"reason": "state_hash_deduplication", "hash": strategic_hash},
                )

        pending = self._pending_events()
        last_review = float(self.state.get("last_review_at") or 0)
        last_attempt = float(self.state.get("last_attempt_at") or 0)
        pending_since = float(self.state.get("pending_since") or now)
        # A failed provider call never enters an urgent retry storm. Urgency may
        # bypass the normal success cadence, but provider failures still back off.
        retry_ready = last_attempt <= last_review or now - last_attempt >= self.min_interval

        urgent = [event for event in pending if event.priority == URGENT]
        if urgent and retry_ready:
            return self._trigger("urgent strategic event", strategic_hash, pending, now, "urgent")

        if last_review and now - last_review >= self.max_idle and retry_ready:
            return self._trigger("maximum idle interval reached", strategic_hash, pending, now, "periodic")

        cadence_anchor = max(last_review, last_attempt)
        debounce_ready = now - pending_since >= self.debounce
        interval_ready = not cadence_anchor or now - cadence_anchor >= self.min_interval
        if pending and debounce_ready and interval_ready:
            return self._trigger("coalesced material events", strategic_hash, pending, now, "material")

        next_times: list[float] = []
        if pending:
            next_times.extend((pending_since + self.debounce, cadence_anchor + self.min_interval))
        if last_review:
            next_times.append(last_review + self.max_idle)
        next_epoch = max(now, min(next_times)) if next_times else None
        self._save()
        return ReviewDecision(False, "no review due", strategic_hash, tuple(pending), next_epoch)

    def mark_success(
        self,
        strategic_hash: str,
        *,
        now_epoch: float | None = None,
        reason: str | None = None,
        manual: bool = False,
    ) -> None:
        now = time.time() if now_epoch is None else now_epoch
        self.state["last_review_at"] = now
        self.state["last_attempt_at"] = now
        self.state["last_review_hash"] = strategic_hash
        self.state["current_hash"] = strategic_hash
        self.state["pending_since"] = None
        self.state["pending_events"] = {}
        if manual:
            self._increment("manual")
            self.history.record_event(
                "review_manual", "Manual strategic review completed",
                {"reason": reason or "manual CLI request", "hash": strategic_hash},
            )
        self._save()

    def mark_failure(self, message: str, *, now_epoch: float | None = None) -> None:
        now = time.time() if now_epoch is None else now_epoch
        self.state["last_attempt_at"] = now
        self._increment("failures")
        self.history.record_event("review_failed", message, {"retryDebounceSeconds": self.debounce})
        self._save()

    def _accept_events(self, events: list[StrategicEvent], now: float) -> None:
        pending = self.state.setdefault("pending_events", {})
        for event in events:
            if event.priority == INFO:
                continue
            if pending:
                self._increment("coalesced")
                self.history.record_event(
                    "review_coalesced", event.message,
                    {"event": event.key, "priority": event.priority},
                )
            current = pending.get(event.key)
            if current:
                current["last_seen"] = now
                current["count"] = int(current.get("count", 1)) + 1
                if event.priority == URGENT:
                    current["priority"] = URGENT
            else:
                pending[event.key] = {
                    "key": event.key, "priority": event.priority, "message": event.message,
                    "first_seen": now, "last_seen": now, "count": 1,
                }
        if pending and self.state.get("pending_since") is None:
            self.state["pending_since"] = now

    def _pending_events(self) -> list[StrategicEvent]:
        return [
            StrategicEvent(item["key"], item["priority"], item["message"])
            for item in self.state.get("pending_events", {}).values()
        ]

    def _trigger(
        self,
        reason: str,
        strategic_hash: str,
        events: list[StrategicEvent],
        now: float,
        metric: str,
    ) -> ReviewDecision:
        self.state["last_attempt_at"] = now
        self._increment("triggered")
        self._increment(metric)
        self.history.record_event(
            "review_triggered", reason,
            {"events": [event.key for event in events], "hash": strategic_hash, "class": metric},
        )
        self._save()
        return ReviewDecision(True, reason, strategic_hash, tuple(events))

    def _increment(self, name: str) -> None:
        metrics = self.state.setdefault("metrics", {})
        metrics[name] = int(metrics.get(name, 0)) + 1

    def _save(self) -> None:
        self.history.set_transport_state(STATE_KEY, self.state)

    @staticmethod
    def strategic_hash(telemetry: Telemetry) -> str:
        data = telemetry.model_dump(by_alias=True)
        empire = data.get("empire", {})
        gcl = empire.get("gcl", {})
        protection = empire.get("protection", {})

        colonies = {}
        for room, colony in sorted(data.get("colonies", {}).items()):
            controller = colony.get("controller", {})
            population = colony.get("population", {})
            colonies[room] = {
                "rcl": controller.get("rcl"),
                "downgradeCritical": controller.get("downgradeCritical"),
                "populationState": population.get("state"),
                "roleStates": {
                    role: values.get("state")
                    for role, values in sorted(population.get("roles", {}).items())
                },
                "hostilePresence": colony.get("defense", {}).get("hostileCreeps", 0) > 0,
                "safeMode": controller.get("safeMode") is not None,
            }

        remotes = {}
        for remote in data.get("operations", {}).get("remoteMining", []):
            reservation = remote.get("reservation", {})
            ticks = reservation.get("ticksToEnd") or 0
            remotes[remote.get("room")] = {
                "active": remote.get("active"),
                "health": remote.get("health"),
                "reasons": sorted(remote.get("reasons", [])),
                "populationState": remote.get("population", {}).get("state"),
                "reservationRelation": reservation.get("relation"),
                "reservationBand": 0 if ticks <= 0 else 1 if ticks < 500 else 2 if ticks < 1500 else 3,
                "hostilePresence": remote.get("security", {}).get("hostileCreeps", 0) > 0,
                "stopLoss": remote.get("stopLoss", {}).get("state"),
            }

        operations = data.get("operations", {})
        snapshot = {
            "player": empire.get("player"),
            "gcl": {
                "level": gcl.get("level"), "ownedRooms": gcl.get("ownedRooms"),
                "availableClaimSlots": gcl.get("availableClaimSlots"),
            },
            "protection": {
                "status": protection.get("status"), "threshold": protection.get("threshold"),
                "advisoryRequired": protection.get("advisoryRequired"),
                "eventIds": [event.get("id") for event in protection.get("events", [])],
            },
            "colonies": colonies,
            "remotes": remotes,
            "completedScouts": sorted((
                    (mission.get("room"), mission.get("status"), mission.get("completedTick"))
                    for mission in operations.get("scouting", [])
                    if mission.get("status") in {"COMPLETED", "FAILED", "DEFERRED"}
                ), key=lambda item: tuple(str(value) for value in item)),
            "remoteEstablishments": sorted(
                (item.get("target"), item.get("state"), item.get("failureReason"))
                for item in operations.get("remoteEstablishments", [])
            ),
            "colonizations": sorted(
                (item.get("target"), item.get("state"), item.get("failureReason"))
                for item in operations.get("colonizations", [])
            ),
            "readiness": {
                "status": data.get("expansionReadiness", {}).get("status"),
                "room": data.get("expansionReadiness", {}).get("recommendedRoom"),
                "reasons": sorted(data.get("expansionReadiness", {}).get("reasons", [])),
            },
            "eligibleClaims": sorted(
                (item.get("room"), item.get("claimCandidateStatus"), bool(item.get("layout")))
                for item in data.get("claimCandidates", [])
                if item.get("claimCandidateStatus") == "ELIGIBLE"
            ),
            "alerts": sorted(data.get("alerts", [])),
            "cpuState": "CRITICAL" if data.get("cpu", {}).get("bucket", 0) < 1000 else "LOW" if data.get("cpu", {}).get("bucket", 0) < 3000 else "NORMAL",
        }
        encoded = json.dumps(snapshot, sort_keys=True, separators=(",", ":")).encode()
        return hashlib.sha256(encoded).hexdigest()

    @classmethod
    def classify(cls, previous: Telemetry | None, current: Telemetry) -> list[StrategicEvent]:
        if previous is None:
            return [StrategicEvent("telemetry_baseline", MATERIAL, "Initial strategic telemetry baseline")]

        old = previous.model_dump(by_alias=True)
        new = current.model_dump(by_alias=True)
        events: list[StrategicEvent] = []

        def add(key: str, priority: str, message: str) -> None:
            events.append(StrategicEvent(key, priority, message))

        old_gcl = old.get("empire", {}).get("gcl", {})
        new_gcl = new.get("empire", {}).get("gcl", {})
        old_owned = int(old_gcl.get("ownedRooms") or 0)
        new_owned = int(new_gcl.get("ownedRooms") or 0)
        if old_owned != new_owned:
            priority = URGENT if new_owned < old_owned else MATERIAL
            add(f"owned_rooms:{old_owned}:{new_owned}", priority, f"Owned room count changed from {old_owned} to {new_owned}")
        if old_gcl.get("level") != new_gcl.get("level"):
            add(f"gcl:{old_gcl.get('level')}:{new_gcl.get('level')}", MATERIAL, "GCL level changed")

        old_protection = old.get("empire", {}).get("protection", {})
        new_protection = new.get("empire", {}).get("protection", {})
        if old_protection.get("status") != new_protection.get("status"):
            add(
                f"protection:{old_protection.get('status')}:{new_protection.get('status')}", URGENT,
                "Novice-area protection status changed; routes, threats, and claims require reassessment",
            )
        elif old_protection.get("threshold") != new_protection.get("threshold"):
            add(
                f"protection_threshold:{new_protection.get('threshold')}", MATERIAL,
                f"Protection countdown crossed {new_protection.get('threshold')}",
            )
        if not old_protection.get("advisoryRequired") and new_protection.get("advisoryRequired"):
            add("protection_advisory_required", URGENT, "Protection transition requires strategic review")

        old_colonies = old.get("colonies", {})
        new_colonies = new.get("colonies", {})
        for room in sorted(set(old_colonies) | set(new_colonies)):
            before = old_colonies.get(room)
            after = new_colonies.get(room)
            if before is None:
                add(f"colony_added:{room}", MATERIAL, f"New owned colony detected in {room}")
                continue
            if after is None:
                add(f"colony_lost:{room}", URGENT, f"Owned colony {room} disappeared from telemetry")
                continue
            old_controller = before.get("controller", {})
            new_controller = after.get("controller", {})
            if old_controller.get("rcl") != new_controller.get("rcl"):
                add(f"rcl:{room}:{new_controller.get('rcl')}", MATERIAL, f"{room} reached RCL {new_controller.get('rcl')}")
            if not old_controller.get("downgradeCritical") and new_controller.get("downgradeCritical"):
                add(f"downgrade_critical:{room}", URGENT, f"{room} controller entered critical downgrade risk")
            old_hostiles = int(before.get("defense", {}).get("hostileCreeps") or 0)
            new_hostiles = int(after.get("defense", {}).get("hostileCreeps") or 0)
            if old_hostiles == 0 and new_hostiles > 0:
                add(f"owned_hostiles:{room}", URGENT, f"Hostiles appeared in owned room {room}")
            old_population = before.get("population", {}).get("state")
            new_population = after.get("population", {}).get("state")
            if old_population != new_population:
                add(f"population:{room}:{old_population}:{new_population}", MATERIAL, f"{room} population changed from {old_population} to {new_population}")

        old_remotes = {item.get("room"): item for item in old.get("operations", {}).get("remoteMining", [])}
        new_remotes = {item.get("room"): item for item in new.get("operations", {}).get("remoteMining", [])}
        for room in sorted(set(old_remotes) | set(new_remotes)):
            before = old_remotes.get(room)
            after = new_remotes.get(room)
            if before is None or after is None:
                add(f"remote_membership:{room}:{after is not None}", MATERIAL, f"Remote portfolio changed for {room}")
                continue
            if before.get("health") != after.get("health"):
                add(f"remote_health:{room}:{before.get('health')}:{after.get('health')}", MATERIAL, f"{room} health changed from {before.get('health')} to {after.get('health')}")
            old_relation = before.get("reservation", {}).get("relation")
            new_relation = after.get("reservation", {}).get("relation")
            if old_relation != new_relation:
                priority = URGENT if new_relation not in {"SELF", "NONE", None} else MATERIAL
                add(f"remote_reservation:{room}:{old_relation}:{new_relation}", priority, f"{room} reservation relation changed")

        old_readiness = old.get("expansionReadiness", {})
        new_readiness = new.get("expansionReadiness", {})
        if (old_readiness.get("status"), old_readiness.get("recommendedRoom")) != (
            new_readiness.get("status"), new_readiness.get("recommendedRoom")
        ):
            add(
                f"expansion_readiness:{new_readiness.get('status')}:{new_readiness.get('recommendedRoom')}", MATERIAL,
                "Permanent-colony readiness or preferred room changed",
            )

        old_scouts = {
            (item.get("room"), item.get("status"), item.get("completedTick"))
            for item in old.get("operations", {}).get("scouting", [])
            if item.get("status") in {"COMPLETED", "FAILED", "DEFERRED"}
        }
        new_scouts = {
            (item.get("room"), item.get("status"), item.get("completedTick"))
            for item in new.get("operations", {}).get("scouting", [])
            if item.get("status") in {"COMPLETED", "FAILED", "DEFERRED"}
        }
        for room, status, completed in sorted(
            new_scouts - old_scouts,
            key=lambda item: tuple(str(value) for value in item),
        ):
            add(f"scout:{room}:{status}:{completed}", MATERIAL, f"Scout mission for {room} became {status}")

        old_alerts = set(old.get("alerts", []))
        for alert in sorted(set(new.get("alerts", [])) - old_alerts):
            urgent_words = ("attack", "nuke", "downgrade", "lost", "breach")
            priority = URGENT if any(word in alert.lower() for word in urgent_words) else MATERIAL
            add(f"alert:{hashlib.sha256(alert.encode()).hexdigest()[:12]}", priority, alert)

        if cls.strategic_hash(previous) != cls.strategic_hash(current) and not events:
            add("strategic_state_changed", MATERIAL, "Normalized strategic state changed")
        return events
