"""Phase 1 Memory Segment transport and command correlation."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import ValidationError

from .config import CommanderConfig
from .health import CommanderHealth
from .history import HistoryStore
from .observer import ObservationProcessor, ObservationUpdate, TelemetryError
from .remote_ops import evaluate_operation
from .schemas import InboxEnvelope, StatusEnvelope, StrategicOrder
from .screeps_client import ScreepsAPIClient, ScreepsAPIError
from .segments import INBOX_SEGMENT, SAFE_ACTIONS, SCHEMA_VERSION, STATUS_SEGMENT, TELEMETRY_SEGMENT


class TransportError(RuntimeError):
    pass


class CommanderTransport:
    def __init__(self, client: ScreepsAPIClient, history: HistoryStore, config: CommanderConfig) -> None:
        self.client = client
        self.history = history
        self.config = config
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
        envelope = InboxEnvelope(schemaVersion=SCHEMA_VERSION, tick=tick, orders=[])
        self.client.write_segment(INBOX_SEGMENT, envelope.model_dump_json(by_alias=True))
        return True

    def send_safe_command(
        self,
        action: str,
        parameters: dict[str, Any] | None = None,
        *,
        reason: str,
    ) -> StrategicOrder:
        if action not in SAFE_ACTIONS:
            raise TransportError(f"Action {action!r} is not in the commander safe-action whitelist")
        pending = self.history.pending_commands()
        if pending:
            raise TransportError(
                f"Command {pending[0]['command_id']} is still awaiting acknowledgement; refusing to overwrite Segment 91"
            )
        tick = self.health.current_tick
        if tick is None:
            raise TransportError("Cannot send a command before polling a valid Screeps tick")
        params = parameters or {}
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
            self.client.write_segment(INBOX_SEGMENT, envelope.model_dump_json(by_alias=True))
        except Exception:
            self.history.update_command(order.id, "failed")
            raise
        self.history.update_command(order.id, "sent")
        return order

    @staticmethod
    def _room_name(value: Any) -> bool:
        import re

        return isinstance(value, str) and re.fullmatch(r"[WE]\d+[NS]\d+", value) is not None

    def _correlate_results(self, status: StatusEnvelope) -> None:
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
