"""Phase 1 Memory Segment transport and command correlation."""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from typing import Any, Callable

from pydantic import ValidationError

from .config import CommanderConfig
from .health import CommanderHealth
from .history import HistoryStore
from .observer import ObservationProcessor, ObservationUpdate, TelemetryError
from .remote_ops import evaluate_operation
from .schemas import InboxEnvelope, StatusEnvelope, StrategicOrder
from .screeps_client import RateLimit, ScreepsAPIClient, ScreepsAPIError
from .segments import INBOX_SEGMENT, SAFE_ACTIONS, SCHEMA_VERSION, STATUS_SEGMENT, TELEMETRY_SEGMENT


class TransportError(RuntimeError):
    pass


class CommanderTransport:
    WRITE_BUDGET_DEFAULT = 60
    OPTIONAL_WRITE_RESERVE = 20

    def __init__(
        self,
        client: ScreepsAPIClient,
        history: HistoryStore,
        config: CommanderConfig,
        *,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.client = client
        self.history = history
        self.config = config
        self._clock = clock
        self.observer = ObservationProcessor(history)
        self.health = CommanderHealth()
        self.last_observation: ObservationUpdate | None = None
        self._last_online: bool | None = None

    def poll(self) -> CommanderHealth:
        try:
            telemetry_raw = self.client.read_segment(TELEMETRY_SEGMENT)
            status_raw = self.client.read_segment(STATUS_SEGMENT)
            self.health.screeps_online = True
            self.health.last_error = None
            self._record_online_transition(True)
        except ScreepsAPIError as exc:
            self.health.screeps_online = False
            self.health.last_error = str(exc)
            self._record_online_transition(False)
            self.history.record_event("api_failure", str(exc), {"transient": exc.transient, "status": exc.status})
            return self.health

        if telemetry_raw:
            try:
                update = self.observer.process(telemetry_raw)
                self.last_observation = update
                self.health.telemetry = update.telemetry
                self.health.telemetry_tick = update.telemetry.tick
                self.health.telemetry_valid = True
            except TelemetryError as exc:
                self.health.telemetry_valid = False
                self.health.last_error = str(exc)
                self.history.record_event("telemetry_malformed", str(exc), {})
        else:
            self.health.telemetry_valid = False

        if status_raw:
            try:
                status = StatusEnvelope.model_validate_json(status_raw)
                self.health.status = status
                self.health.status_tick = status.tick
                self._correlate_results(status)
            except (ValidationError, ValueError) as exc:
                self.health.last_error = f"Status Segment failed schema validation: {exc}"
                self.history.record_event("status_malformed", self.health.last_error, {})

        self._expire_local_commands()
        if self.health.telemetry is not None:
            for operation in self.history.due_operations(self.health.telemetry.tick):
                outcome, result, reason = evaluate_operation(operation, self.health.telemetry)
                self.history.complete_operation(operation["operation_id"], self.health.telemetry.tick, outcome, result, reason)
        return self.health

    def heartbeat(self) -> bool:
        if self.history.pending_commands():
            return False
        tick = self.health.current_tick
        if tick is None:
            raise TransportError("Cannot send heartbeat before a valid Screeps tick is available")
        now = self._clock()
        prior = self.history.transport_state(self._state_key("last_contact")) or {}
        if now - float(prior.get("epoch") or 0) < self.config.heartbeat_interval_seconds:
            return False
        envelope = InboxEnvelope(schemaVersion=SCHEMA_VERSION, tick=tick, orders=[])
        outcome = self._write_inbox(envelope.model_dump_json(by_alias=True), optional=False)
        return outcome == "written"

    def flush_queued_command(self) -> StrategicOrder | None:
        queued = self.history.queued_commands()
        if not queued:
            return None
        row = queued[0]
        order = StrategicOrder(
            schemaVersion=SCHEMA_VERSION,
            id=row["command_id"],
            createdTick=int(row["created_tick"]),
            expiresTick=int(row["expires_tick"]),
            action=row["action"],
            parameters=json.loads(row["parameters_json"]),
            reason=row["reason"],
        )
        if self.health.current_tick is not None and order.expiresTick < self.health.current_tick:
            self.history.update_command(order.id, "expired")
            return None
        envelope = InboxEnvelope(schemaVersion=SCHEMA_VERSION, tick=order.createdTick, orders=[order])
        optional = order.action == "SET_EXPLANATION"
        try:
            outcome = self._write_inbox(envelope.model_dump_json(by_alias=True), optional=optional)
        except ScreepsAPIError:
            self.history.update_command(order.id, "failed")
            raise
        if outcome == "deferred" and optional:
            self.history.update_command(order.id, "suppressed")
            return None
        if outcome != "deferred":
            self.history.update_command(order.id, "sent")
        return order if outcome != "deferred" else None

    def segment_write_budget(self) -> dict[str, Any] | None:
        return self.history.transport_state(self._state_key("segment_write_budget"))

    def send_safe_command(
        self,
        action: str,
        parameters: dict[str, Any] | None = None,
        *,
        reason: str,
    ) -> StrategicOrder | None:
        if action not in SAFE_ACTIONS:
            raise TransportError(f"Action {action!r} is not in the commander safe-action whitelist")
        params = parameters or {}
        if action == "SET_EXPLANATION" and self._explanation_is_unchanged(params.get("explanation")):
            return None
        pending = self.history.pending_commands()
        if pending:
            raise TransportError(
                f"Command {pending[0]['command_id']} is still awaiting acknowledgement; refusing to overwrite Segment 91"
            )
        tick = self.health.current_tick
        if tick is None:
            raise TransportError("Cannot send a command before polling a valid Screeps tick")
        if action in {"NOOP", "REQUEST_STATUS"} and params:
            raise TransportError(f"{action} does not accept parameters")
        if action == "SET_EXPLANATION":
            explanation = params.get("explanation")
            if set(params) != {"explanation"} or not isinstance(explanation, str) or not 1 <= len(explanation) <= 2000:
                raise TransportError("SET_EXPLANATION requires a 1-2000 character explanation")
        if action == "SET_OPERATIONAL_AUTHORITY":
            allowed = {"scouting", "remoteMaintenance", "newRemotes", "colonization"}
            if not {"scouting", "remoteMaintenance"}.issubset(params) or not set(params).issubset(allowed):
                raise TransportError("SET_OPERATIONAL_AUTHORITY requires scouting and remoteMaintenance with optional newRemotes and colonization")
            if params["scouting"] not in {"OFF", "MANUAL", "AUTO"}:
                raise TransportError("scouting authority must be OFF, MANUAL, or AUTO")
            if params["remoteMaintenance"] not in {"OFF", "MANUAL", "AUTO"}:
                raise TransportError("remoteMaintenance authority must be OFF, MANUAL, or AUTO")
            for field in ("newRemotes", "colonization"):
                if field in params and params[field] not in {"OFF", "MANUAL", "AUTO"}:
                    raise TransportError(f"{field} authority must be OFF, MANUAL, or AUTO")
        if action == "SET_EXECUTION_MODE":
            if set(params) != {"mode"} or params["mode"] not in {"observe", "execute"}:
                raise TransportError("SET_EXECUTION_MODE requires mode observe or execute")
        if action == "SCOUT_ROOM":
            room = params.get("room")
            origin = params.get("origin")
            if set(params) != {"room", "origin"} or not self._room_name(room) or not self._room_name(origin):
                raise TransportError("SCOUT_ROOM requires valid room and origin room names")
        if action in {
            "REASSESS_REMOTE", "ENSURE_REMOTE_RESERVATION",
            "ENSURE_REMOTE_INFRASTRUCTURE", "REBALANCE_REMOTE_LOGISTICS",
        }:
            room = params.get("room")
            if set(params) != {"room"} or not self._room_name(room):
                raise TransportError(f"{action} requires one valid remote room name")
        if action == "START_REMOTE_MINING":
            if set(params) != {"origin", "target"} or not self._room_name(params.get("origin")) or not self._room_name(params.get("target")):
                raise TransportError("START_REMOTE_MINING requires valid origin and target room names")
        if action == "COLONIZE_ROOM":
            if set(params) != {"origin", "target", "layout"} or not self._room_name(params.get("origin")) or not self._room_name(params.get("target")) or not isinstance(params.get("layout"), dict):
                raise TransportError("COLONIZE_ROOM requires valid origin, target, and layout")
        identifier = f"py-{self.config.screeps_shard}-{tick}-{uuid.uuid4().hex[:10]}"
        order = StrategicOrder(
            schemaVersion=SCHEMA_VERSION,
            id=identifier,
            createdTick=tick,
            expiresTick=tick + self.config.command_expiry_ticks,
            action=action,
            parameters=params,
            reason=reason[:1000],
        )
        envelope = InboxEnvelope(schemaVersion=SCHEMA_VERSION, tick=tick, orders=[order])
        self.history.record_command(order, "queued")
        try:
            outcome = self._write_inbox(
                envelope.model_dump_json(by_alias=True),
                optional=action == "SET_EXPLANATION",
            )
        except ScreepsAPIError as exc:
            if exc.transient:
                return order
            self.history.update_command(order.id, "failed")
            raise
        if outcome == "deferred" and action == "SET_EXPLANATION":
            self.history.update_command(order.id, "suppressed")
            return None
        if outcome != "deferred":
            self.history.update_command(order.id, "sent")
        return order

    def _write_inbox(self, payload: str, *, optional: bool) -> str:
        digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        payload_key = self._state_key(f"segment_{INBOX_SEGMENT}_payload")
        prior = self.history.transport_state(payload_key) or {}
        if prior.get("sha256") == digest:
            return "unchanged"

        now = self._clock()
        allowed, budget = self.history.reserve_segment_write(
            self._state_key("segment_write_budget"),
            now,
            optional=optional,
            default_limit=self.WRITE_BUDGET_DEFAULT,
            optional_reserve=self.OPTIONAL_WRITE_RESERVE,
        )
        if not allowed:
            return "deferred"

        try:
            self.client.write_segment(INBOX_SEGMENT, payload)
        except ScreepsAPIError as exc:
            rate = self._write_rate_limit()
            reset_epoch = rate.reset_epoch or self._integer_or_none(budget.get("reset_epoch"))
            retry_until = now + max(1.0, float(exc.retry_after or 60.0))
            if reset_epoch is not None:
                retry_until = max(retry_until, float(reset_epoch))
            retry_until += self.config.rate_limit_safety_seconds
            self.history.update_segment_write_budget(
                self._state_key("segment_write_budget"),
                limit=rate.limit,
                remaining=0 if exc.status == 429 else rate.remaining,
                reset_epoch=reset_epoch,
                blocked_until=retry_until,
            )
            if exc.transient:
                self.history.record_event(
                    "segment_write_deferred",
                    str(exc),
                    {"status": exc.status, "retryAfter": exc.retry_after, "blockedUntil": retry_until},
                )
                return "deferred"
            raise

        rate = self._write_rate_limit()
        self.history.update_segment_write_budget(
            self._state_key("segment_write_budget"),
            limit=rate.limit,
            remaining=rate.remaining,
            reset_epoch=rate.reset_epoch,
        )
        self.history.set_transport_state(payload_key, {"sha256": digest, "confirmed_at": now})
        self.history.set_transport_state(self._state_key("last_contact"), {"epoch": now})
        return "written"

    def _write_rate_limit(self) -> RateLimit:
        value = getattr(self.client, "memory_segment_write_rate_limit", None)
        if value is not None:
            return value
        return RateLimit(None, None, None)

    def _state_key(self, suffix: str) -> str:
        return f"{self.config.screeps_shard}:{suffix}"

    def _explanation_is_unchanged(self, explanation: Any) -> bool:
        if not isinstance(explanation, str):
            return False
        prior = self.history.latest_command("SET_EXPLANATION")
        if prior is None or prior["state"] in {"failed", "rejected", "expired", "suppressed"}:
            return False
        try:
            return json.loads(prior["parameters_json"]).get("explanation") == explanation
        except (TypeError, ValueError, json.JSONDecodeError):
            return False

    @staticmethod
    def _integer_or_none(value: Any) -> int | None:
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _room_name(value: Any) -> bool:
        import re

        return isinstance(value, str) and re.fullmatch(r"[WE]\d+[NS]\d+", value) is not None

    def _correlate_results(self, status: StatusEnvelope) -> None:
        for active in status.orders.activeOrders:
            self.history.update_command(active.id, "active", active.model_dump())
        for result in status.orders.recentResults:
            state = result.status
            self.history.update_command(result.id, state, result.model_dump())
            if state == "completed":
                self.history.mark_operation_executed(result.id, result.tick)
            elif state in {"rejected", "failed", "expired"}:
                detail = result.reason or result.message or f"Command ended with status {state}"
                self.history.fail_operation_by_command(result.id, result.tick, state, detail)

    def _expire_local_commands(self) -> None:
        tick = self.health.current_tick
        if tick is None:
            return
        for command in self.history.pending_commands():
            if command["expires_tick"] < tick:
                self.history.update_command(command["command_id"], "expired")

    def _record_online_transition(self, online: bool) -> None:
        if self._last_online is None:
            self._last_online = online
            return
        if online != self._last_online:
            event = "screeps_online" if online else "screeps_offline"
            self.history.record_event(event, f"Screeps API is {'online' if online else 'offline'}", {})
            self._last_online = online
