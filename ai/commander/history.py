"""Bounded SQLite history, trends, recommendations, events, and colony journal."""

from __future__ import annotations

import json
import sqlite3
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .schemas import Advisory, StrategicOrder, Telemetry


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class HistoryStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA foreign_keys=ON")
        self._initialize()

    def _initialize(self) -> None:
        self.connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS observations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recorded_at TEXT NOT NULL,
                screeps_tick INTEGER NOT NULL,
                shard TEXT NOT NULL,
                telemetry_hash TEXT NOT NULL UNIQUE,
                material_hash TEXT NOT NULL,
                rcl INTEGER NOT NULL,
                owned_room_count INTEGER NOT NULL,
                creep_count INTEGER NOT NULL,
                cpu_used REAL NOT NULL,
                cpu_bucket INTEGER NOT NULL,
                gcl INTEGER NOT NULL,
                credits REAL NOT NULL,
                remote_mining_summary TEXT NOT NULL,
                hostile_count INTEGER NOT NULL,
                empire_summary TEXT NOT NULL,
                telemetry_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_observations_tick ON observations(screeps_tick DESC);

            CREATE TABLE IF NOT EXISTS commands (
                command_id TEXT PRIMARY KEY,
                action TEXT NOT NULL,
                parameters_json TEXT NOT NULL,
                reason TEXT NOT NULL,
                created_tick INTEGER NOT NULL,
                expires_tick INTEGER NOT NULL,
                state TEXT NOT NULL,
                acknowledgement_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_commands_state ON commands(state, updated_at DESC);

            CREATE TABLE IF NOT EXISTS recommendations (
                recommendation_id TEXT PRIMARY KEY,
                observation_tick INTEGER NOT NULL,
                model TEXT NOT NULL,
                summary TEXT NOT NULL,
                strategic_assessment TEXT NOT NULL,
                concerns_json TEXT NOT NULL,
                recommended_actions_json TEXT NOT NULL,
                questions_json TEXT NOT NULL,
                ready_for_expansion INTEGER NOT NULL,
                expansion_readiness TEXT,
                journal_entry TEXT,
                confidence REAL,
                input_tokens INTEGER,
                output_tokens INTEGER,
                total_tokens INTEGER,
                estimated_cost_usd REAL,
                advisory_json TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_recommendations_tick ON recommendations(observation_tick DESC);

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                message TEXT NOT NULL,
                details_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);

            CREATE TABLE IF NOT EXISTS journal (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                screeps_tick INTEGER NOT NULL,
                entry_type TEXT NOT NULL,
                title TEXT NOT NULL,
                narrative TEXT NOT NULL,
                details_json TEXT NOT NULL,
                model TEXT,
                recommendation_id TEXT,
                dedupe_key TEXT UNIQUE,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_journal_tick ON journal(screeps_tick DESC, id DESC);

            CREATE TABLE IF NOT EXISTS operations (
                operation_id TEXT PRIMARY KEY,
                command_id TEXT UNIQUE,
                trigger_text TEXT NOT NULL,
                room TEXT NOT NULL,
                action TEXT NOT NULL,
                reason TEXT NOT NULL,
                confidence REAL,
                created_tick INTEGER NOT NULL,
                executed_tick INTEGER,
                baseline_json TEXT NOT NULL,
                expected_outcome TEXT NOT NULL,
                evaluation_tick INTEGER NOT NULL,
                result_json TEXT,
                outcome TEXT,
                outcome_reason TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_operations_state ON operations(outcome, evaluation_tick);

            CREATE TABLE IF NOT EXISTS transport_state (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        self._ensure_column("recommendations", "expansion_readiness", "TEXT")
        self._ensure_column("recommendations", "journal_entry", "TEXT")
        self._ensure_column("recommendations", "advisory_json", "TEXT")
        self.connection.commit()

    def _ensure_column(self, table: str, column: str, declaration: str) -> None:
        names = {row["name"] for row in self.connection.execute(f"PRAGMA table_info({table})")}
        if column not in names:
            self.connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")

    def close(self) -> None:
        self.connection.close()

    def save_observation(self, telemetry: Telemetry, telemetry_hash: str, material_hash: str) -> bool:
        previous = self.latest_observation()
        colony_levels = [colony.controller.rcl for colony in telemetry.colonies.values()]
        hostile_count = sum(colony.defense.hostileCreeps for colony in telemetry.colonies.values())
        remote_summary = [item.model_dump(by_alias=True) for item in telemetry.operations.remoteMining]
        summary = {
            "colonies": {
                name: {
                    "rcl": colony.controller.rcl,
                    "controllerProgress": colony.controller.progress,
                    "storageEnergy": colony.energy.storageEnergy,
                    "terminalEnergy": colony.energy.terminalEnergy,
                    "hostiles": colony.defense.hostileCreeps,
                    "population": colony.population.model_dump(),
                }
                for name, colony in telemetry.colonies.items()
            },
            "gcl": telemetry.empire.gcl.model_dump(),
            "operationCounts": {
                "colonizations": len(telemetry.operations.colonizations),
                "remoteMining": len(telemetry.operations.remoteMining),
                "combat": len(telemetry.operations.combat),
                "scouting": len(telemetry.operations.scouting),
            },
            "alerts": telemetry.alerts,
        }
        cursor = self.connection.execute(
            """
            INSERT OR IGNORE INTO observations (
                recorded_at, screeps_tick, shard, telemetry_hash, material_hash,
                rcl, owned_room_count, creep_count, cpu_used, cpu_bucket, gcl,
                credits, remote_mining_summary, hostile_count, empire_summary, telemetry_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                utc_now(), telemetry.tick, telemetry.shard, telemetry_hash, material_hash,
                max(colony_levels, default=0), telemetry.empire.gcl.ownedRooms, telemetry.empire.creeps,
                telemetry.cpu.used, telemetry.cpu.bucket, telemetry.empire.gcl.level, telemetry.empire.credits,
                json.dumps(remote_summary, separators=(",", ":")), hostile_count,
                json.dumps(summary, separators=(",", ":")), telemetry.model_dump_json(by_alias=True),
            ),
        )
        self.connection.commit()
        if cursor.rowcount:
            self._journal_observation_changes(previous, telemetry)
            self.prune()
            return True
        return False

    def latest_observation(self) -> dict[str, Any] | None:
        row = self.connection.execute("SELECT * FROM observations ORDER BY id DESC LIMIT 1").fetchone()
        return self._observation_row(row)

    def observation_at_or_before(self, tick: int) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM observations WHERE screeps_tick <= ? ORDER BY screeps_tick DESC, id DESC LIMIT 1",
            (tick,),
        ).fetchone()
        return self._observation_row(row)

    def observations_since(self, tick: int) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM observations WHERE screeps_tick >= ? ORDER BY screeps_tick, id", (tick,)
        ).fetchall()
        return [item for row in rows if (item := self._observation_row(row)) is not None]

    @staticmethod
    def _observation_row(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        result = dict(row)
        result["telemetry"] = json.loads(result.pop("telemetry_json"))
        return result

    def record_command(self, order: StrategicOrder, state: str) -> None:
        now = utc_now()
        self.connection.execute(
            """
            INSERT INTO commands (
                command_id, action, parameters_json, reason, created_tick,
                expires_tick, state, acknowledgement_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
            """,
            (
                order.id, order.action, json.dumps(order.parameters, separators=(",", ":")),
                order.reason, order.createdTick, order.expiresTick, state, now, now,
            ),
        )
        self.connection.commit()

    def update_command(self, command_id: str, state: str, acknowledgement: dict[str, Any] | None = None) -> None:
        self.connection.execute(
            "UPDATE commands SET state = ?, acknowledgement_json = ?, updated_at = ? WHERE command_id = ?",
            (state, None if acknowledgement is None else json.dumps(acknowledgement, separators=(",", ":")), utc_now(), command_id),
        )
        self.connection.commit()

    def pending_commands(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM commands WHERE state IN ('queued', 'sent') ORDER BY created_at"
        ).fetchall()
        return [dict(row) for row in rows]

    def recent_commands(self, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM commands ORDER BY created_tick DESC, created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(row) for row in rows]

    def queued_commands(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM commands WHERE state = 'queued' ORDER BY created_at"
        ).fetchall()
        return [dict(row) for row in rows]

    def latest_command(self, action: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM commands WHERE action = ? ORDER BY created_at DESC LIMIT 1", (action,)
        ).fetchone()
        return None if row is None else dict(row)

    def transport_state(self, key: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT value_json FROM transport_state WHERE key = ?", (key,)
        ).fetchone()
        return None if row is None else json.loads(row["value_json"])

    def set_transport_state(self, key: str, value: dict[str, Any]) -> None:
        self.connection.execute(
            """
            INSERT INTO transport_state (key, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = excluded.updated_at
            """,
            (key, json.dumps(value, separators=(",", ":")), utc_now()),
        )
        self.connection.commit()

    def acquire_lease(
        self,
        key: str,
        owner: str,
        *,
        ttl_seconds: float,
        now_epoch: float | None = None,
    ) -> tuple[bool, dict[str, Any]]:
        """Acquire or renew an expiring cross-process lease atomically."""
        now = time.time() if now_epoch is None else now_epoch
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute(
                "SELECT value_json FROM transport_state WHERE key = ?", (key,)
            ).fetchone()
            state = {} if row is None else json.loads(row["value_json"])
            current_owner = state.get("owner")
            expires_at = float(state.get("expires_at") or 0)
            acquired = current_owner == owner or expires_at <= now
            if acquired:
                state = {"owner": owner, "acquired_at": now, "expires_at": now + ttl_seconds}
                self.connection.execute(
                    """
                    INSERT INTO transport_state (key, value_json, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                        value_json = excluded.value_json,
                        updated_at = excluded.updated_at
                    """,
                    (key, json.dumps(state, separators=(",", ":")), utc_now()),
                )
            self.connection.commit()
            return acquired, state
        except Exception:
            self.connection.rollback()
            raise

    def release_lease(self, key: str, owner: str) -> bool:
        """Release a lease only when it is still owned by this process."""
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute(
                "SELECT value_json FROM transport_state WHERE key = ?", (key,)
            ).fetchone()
            state = {} if row is None else json.loads(row["value_json"])
            if state.get("owner") != owner:
                self.connection.rollback()
                return False
            self.connection.execute("DELETE FROM transport_state WHERE key = ?", (key,))
            self.connection.commit()
            return True
        except Exception:
            self.connection.rollback()
            raise

    def reserve_segment_write(
        self,
        key: str,
        now_epoch: float,
        *,
        optional: bool,
        default_limit: int = 60,
        optional_reserve: int = 20,
    ) -> tuple[bool, dict[str, Any]]:
        """Atomically reserve one shared memory-segment write token."""
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute(
                "SELECT value_json FROM transport_state WHERE key = ?", (key,)
            ).fetchone()
            state = {} if row is None else json.loads(row["value_json"])
            limit = max(1, int(state.get("limit") or default_limit))
            reset_epoch = float(state.get("reset_epoch") or 0)
            if reset_epoch <= now_epoch:
                state = {
                    "limit": limit,
                    "remaining": limit,
                    "reset_epoch": now_epoch + 3600,
                    "blocked_until": 0,
                }
            remaining = max(0, int(state.get("remaining", limit)))
            blocked_until = float(state.get("blocked_until") or 0)
            allowed = blocked_until <= now_epoch and remaining > (optional_reserve if optional else 0)
            if allowed:
                state["remaining"] = remaining - 1
            self.connection.execute(
                """
                INSERT INTO transport_state (key, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value_json = excluded.value_json,
                    updated_at = excluded.updated_at
                """,
                (key, json.dumps(state, separators=(",", ":")), utc_now()),
            )
            self.connection.commit()
            return allowed, state
        except Exception:
            self.connection.rollback()
            raise

    def update_segment_write_budget(
        self,
        key: str,
        *,
        limit: int | None,
        remaining: int | None,
        reset_epoch: int | None,
        blocked_until: float | None = None,
    ) -> dict[str, Any]:
        """Merge authoritative server quota fields without increasing stale state."""
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute(
                "SELECT value_json FROM transport_state WHERE key = ?", (key,)
            ).fetchone()
            state = {} if row is None else json.loads(row["value_json"])
            if limit is not None:
                state["limit"] = max(1, limit)
            if reset_epoch is not None:
                prior_reset = state.get("reset_epoch")
                if prior_reset != reset_epoch:
                    if remaining is not None:
                        state["remaining"] = remaining
                elif remaining is not None:
                    prior_remaining = state.get("remaining")
                    state["remaining"] = remaining if prior_remaining is None else min(prior_remaining, remaining)
                state["reset_epoch"] = reset_epoch
            elif remaining is not None:
                prior_remaining = state.get("remaining")
                state["remaining"] = remaining if prior_remaining is None else min(prior_remaining, remaining)
            if blocked_until is not None:
                state["blocked_until"] = max(float(state.get("blocked_until") or 0), blocked_until)
            self.connection.execute(
                """
                INSERT INTO transport_state (key, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value_json = excluded.value_json,
                    updated_at = excluded.updated_at
                """,
                (key, json.dumps(state, separators=(",", ":")), utc_now()),
            )
            self.connection.commit()
            return state
        except Exception:
            self.connection.rollback()
            raise

    def save_recommendation(
        self,
        recommendation_id: str,
        observation_tick: int,
        model: str,
        advisory: Advisory,
        usage: dict[str, int | None],
        estimated_cost_usd: float | None,
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO recommendations (
                recommendation_id, observation_tick, model, summary, strategic_assessment,
                concerns_json, recommended_actions_json, questions_json, ready_for_expansion,
                expansion_readiness, journal_entry, confidence, input_tokens, output_tokens,
                total_tokens, estimated_cost_usd, advisory_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                recommendation_id, observation_tick, model, advisory.summary, advisory.strategic_assessment,
                json.dumps(advisory.concerns, separators=(",", ":")),
                json.dumps([item.model_dump() for item in advisory.priorities], separators=(",", ":")),
                json.dumps(advisory.questions, separators=(",", ":")),
                1 if advisory.expansion_readiness == "READY" else 0,
                advisory.expansion_readiness, advisory.journal_narrative, advisory.confidence,
                usage.get("input_tokens"), usage.get("output_tokens"), usage.get("total_tokens"),
                estimated_cost_usd, advisory.model_dump_json(by_alias=True), utc_now(),
            ),
        )
        self.append_journal(
            observation_tick,
            "ai_review",
            "AI strategic review",
            advisory.journal_narrative,
            {"status": advisory.status, "expansionReadiness": advisory.expansion_readiness},
            model=model,
            recommendation_id=recommendation_id,
            dedupe_key=f"advisory:{recommendation_id}",
        )
        self.connection.commit()
        self.prune()

    def latest_recommendation(self) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM recommendations ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        return None if row is None else dict(row)

    def recent_recommendations(self, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM recommendations ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(row) for row in rows]

    def append_journal(
        self,
        screeps_tick: int,
        entry_type: str,
        title: str,
        narrative: str,
        details: dict[str, Any] | None = None,
        *,
        model: str | None = None,
        recommendation_id: str | None = None,
        dedupe_key: str | None = None,
    ) -> None:
        self.connection.execute(
            """
            INSERT OR IGNORE INTO journal (
                screeps_tick, entry_type, title, narrative, details_json, model,
                recommendation_id, dedupe_key, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                screeps_tick, entry_type, title, narrative,
                json.dumps(details or {}, separators=(",", ":")), model,
                recommendation_id, dedupe_key, utc_now(),
            ),
        )
        self.connection.commit()

    def recent_journal(self, limit: int = 20, since_tick: int | None = None) -> list[dict[str, Any]]:
        if since_tick is None:
            rows = self.connection.execute(
                "SELECT * FROM journal ORDER BY screeps_tick DESC, id DESC LIMIT ?", (limit,)
            ).fetchall()
        else:
            rows = self.connection.execute(
                "SELECT * FROM journal WHERE screeps_tick >= ? ORDER BY screeps_tick DESC, id DESC LIMIT ?",
                (since_tick, limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def cost_summary(self) -> dict[str, float | int | None]:
        now = datetime.now(UTC)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        week = (now - timedelta(days=7)).isoformat()
        row = self.connection.execute(
            """
            SELECT
                COALESCE(SUM(CASE WHEN created_at >= ? THEN estimated_cost_usd ELSE 0 END), 0) AS today,
                COALESCE(SUM(CASE WHEN created_at >= ? THEN estimated_cost_usd ELSE 0 END), 0) AS week,
                COALESCE(SUM(estimated_cost_usd), 0) AS lifetime,
                COUNT(*) AS advisories,
                AVG(estimated_cost_usd) AS average,
                SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS reviews_today
            FROM recommendations
            """,
            (today, week, today),
        ).fetchone()
        result = dict(row)
        recent_rows = self.connection.execute(
            "SELECT created_at, estimated_cost_usd FROM recommendations "
            "WHERE created_at >= ? ORDER BY created_at",
            ((now - timedelta(hours=24)).isoformat(),),
        ).fetchall()
        timestamps = []
        for item in recent_rows:
            try:
                timestamps.append(datetime.fromisoformat(item["created_at"]).timestamp())
            except (TypeError, ValueError):
                continue
        intervals = [later - earlier for earlier, later in zip(timestamps, timestamps[1:]) if later > earlier]
        average_interval = sum(intervals) / len(intervals) if intervals else None
        recent_costs = [float(item["estimated_cost_usd"]) for item in recent_rows if item["estimated_cost_usd"] is not None]
        average_recent_cost = sum(recent_costs) / len(recent_costs) if recent_costs else float(result["average"] or 0)
        result["average_interval_seconds"] = average_interval
        result["estimated_daily_cost"] = (
            average_recent_cost * 86400 / average_interval if average_interval else None
        )

        scheduler_state = self.transport_state("llm_review_scheduler_v1") or {}
        metrics = scheduler_state.get("metrics", {})
        result["reviews_suppressed"] = int(metrics.get("suppressed", 0))
        result["events_coalesced"] = int(metrics.get("coalesced", 0))
        result["reviews_triggered"] = int(metrics.get("triggered", 0))
        result["last_review_at"] = scheduler_state.get("last_review_at")
        event_counts = self.connection.execute(
            """
            SELECT event_type, COUNT(*) AS count FROM events
            WHERE created_at >= ? AND event_type IN ('review_suppressed', 'review_coalesced', 'review_triggered')
            GROUP BY event_type
            """,
            (today,),
        ).fetchall()
        today_counts = {item["event_type"]: item["count"] for item in event_counts}
        result["reviews_suppressed_today"] = int(today_counts.get("review_suppressed", 0))
        result["events_coalesced_today"] = int(today_counts.get("review_coalesced", 0))
        result["reviews_triggered_today"] = int(today_counts.get("review_triggered", 0))
        return result

    def record_event(self, event_type: str, message: str, details: dict[str, Any] | None = None) -> None:
        self.connection.execute(
            "INSERT INTO events (event_type, message, details_json, created_at) VALUES (?, ?, ?, ?)",
            (event_type, message, json.dumps(details or {}, separators=(",", ":")), utc_now()),
        )
        self.connection.commit()
        self.prune()

    def recent_events(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(row) for row in rows]

    def create_operation(
        self,
        operation_id: str,
        command_id: str,
        trigger: str,
        room: str,
        action: str,
        reason: str,
        confidence: float | None,
        created_tick: int,
        baseline: dict[str, Any],
        expected_outcome: str,
        evaluation_tick: int,
    ) -> None:
        now = utc_now()
        self.connection.execute(
            """
            INSERT INTO operations (
                operation_id, command_id, trigger_text, room, action, reason, confidence,
                created_tick, executed_tick, baseline_json, expected_outcome,
                evaluation_tick, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
            """,
            (
                operation_id, command_id, trigger, room, action, reason, confidence,
                created_tick, json.dumps(baseline, separators=(",", ":")), expected_outcome,
                evaluation_tick, now, now,
            ),
        )
        if action == "START_REMOTE_MINING":
            title = f"New remote selected: {room}"
            narrative = (
                f"After comparing fresh territorial intelligence, the commander selected {room}. "
                f"Evidence: {trigger}. It authorized START_REMOTE_MINING through AZC's deterministic "
                f"remote-mining controller. Predicted evidence and economics: {baseline.get('candidate', baseline)}. "
                f"Expected outcome: {expected_outcome} The first operating evaluation is scheduled at or after "
                f"tick {evaluation_tick}."
            )
            entry_type = "remote_establishment"
        elif action == "COLONIZE_ROOM":
            title = f"Permanent colonization authorized: {room}"
            narrative = (
                f"After deterministic candidate and readiness validation, the commander authorized AZC's "
                f"existing colonization system to establish {room}. Evidence: {trigger}. "
                f"The operation will not count as successful at claim time; it must establish a spawn, "
                f"local harvesting, functioning population control, and an independent spawn cycle. "
                f"Expected outcome: {expected_outcome}"
            )
            entry_type = "colonization_authorized"
        else:
            title = f"Commander intervened in {room}"
            narrative = (
                f"The commander identified {trigger}. It authorized {action} for the existing remote "
                f"{room} through AZC's deterministic controller. Expected outcome: {expected_outcome} "
                f"The operation will be evaluated at or after tick {evaluation_tick}."
            )
            entry_type = "commander_action"
        self.append_journal(
            created_tick,
            entry_type,
            title,
            narrative,
            {"operationId": operation_id, "action": action, "baseline": baseline},
            dedupe_key=f"operation:{operation_id}:started",
        )
        self.connection.commit()

    def mark_operation_executed(self, command_id: str, tick: int) -> None:
        self.connection.execute(
            """
            UPDATE operations SET
                evaluation_tick = CASE
                    WHEN executed_tick IS NULL THEN ? + (evaluation_tick - created_tick)
                    ELSE evaluation_tick
                END,
                executed_tick = COALESCE(executed_tick, ?),
                updated_at = ?
            WHERE command_id = ?
            """,
            (tick, tick, utc_now(), command_id),
        )
        self.connection.commit()

    def fail_operation_by_command(
        self,
        command_id: str,
        tick: int,
        command_status: str,
        reason: str,
    ) -> None:
        operation = self.connection.execute(
            "SELECT operation_id FROM operations WHERE command_id = ? AND outcome IS NULL",
            (command_id,),
        ).fetchone()
        if operation is None:
            return
        self.complete_operation(
            operation["operation_id"],
            tick,
            "FAILED",
            {"commandStatus": command_status},
            reason,
        )

    def due_operations(self, tick: int) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """
            SELECT * FROM operations
            WHERE outcome IS NULL AND executed_tick IS NOT NULL AND evaluation_tick <= ?
            ORDER BY evaluation_tick
            """,
            (tick,),
        ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["baseline"] = json.loads(item.pop("baseline_json"))
            result.append(item)
        return result

    def complete_operation(
        self,
        operation_id: str,
        tick: int,
        outcome: str,
        result: dict[str, Any],
        reason: str,
    ) -> None:
        self.connection.execute(
            """
            UPDATE operations SET result_json = ?, outcome = ?, outcome_reason = ?, updated_at = ?
            WHERE operation_id = ?
            """,
            (json.dumps(result, separators=(",", ":")), outcome, reason, utc_now(), operation_id),
        )
        operation = self.connection.execute(
            "SELECT room, action FROM operations WHERE operation_id = ?", (operation_id,)
        ).fetchone()
        if operation:
            if operation["action"] == "START_REMOTE_MINING":
                title = f"{operation['room']} remote establishment evaluated: {outcome}"
                narrative = (
                    f"The deterministic establishment evaluation for {operation['room']} produced {outcome}. "
                    f"{reason} The result remains linked to the original prediction for predicted-versus-actual review."
                )
            else:
                title = f"{operation['room']} intervention evaluated: {outcome}"
                narrative = (
                    f"The deterministic evaluation of {operation['action']} in {operation['room']} "
                    f"produced {outcome}. {reason}"
                )
            self.append_journal(
                tick,
                "commander_evaluation",
                title,
                narrative,
                {"operationId": operation_id, "outcome": outcome, "result": result},
                dedupe_key=f"operation:{operation_id}:evaluated",
            )
        self.connection.commit()

    def recent_operations(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM operations ORDER BY created_tick DESC LIMIT ?", (limit,)
        ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            item["baseline"] = json.loads(item.pop("baseline_json"))
            item["result"] = json.loads(item.pop("result_json")) if item.get("result_json") else None
            result.append(item)
        return result

    def _journal_observation_changes(self, previous: dict[str, Any] | None, telemetry: Telemetry) -> None:
        current = telemetry.model_dump(by_alias=True)
        self._journal_phase6_changes(previous, current, telemetry.tick, telemetry.shard)
        if previous is None or previous["telemetry"].get("schemaVersion") not in (3, 4):
            rooms = ", ".join(sorted(telemetry.colonies)) or "no owned rooms"
            self.append_journal(
                telemetry.tick,
                "telemetry_baseline",
                "Strategic telemetry baseline established",
                f"The commander established its first detailed Phase 4 baseline for {rooms}. "
                f"It can now compare colony energy, population, remote delivery counters, territory, and threats over time.",
                {"rooms": sorted(telemetry.colonies)},
                dedupe_key=f"baseline:{telemetry.shard}:3",
            )
            return

        old = previous["telemetry"]
        old_colonies = old.get("colonies", {})
        for room, colony in current["colonies"].items():
            old_colony = old_colonies.get(room)
            if not old_colony:
                self.append_journal(
                    telemetry.tick, "colony_observed", f"Colony {room} entered strategic telemetry",
                    f"{room} is now represented in the commander's detailed strategic record.",
                    {"room": room}, dedupe_key=f"colony:{room}:{telemetry.tick}",
                )
                continue
            old_rcl = old_colony.get("controller", {}).get("rcl", old_colony.get("rcl", 0))
            new_rcl = colony["controller"]["rcl"]
            if new_rcl > old_rcl:
                self.append_journal(
                    telemetry.tick, "rcl_increased", f"{room} reached RCL {new_rcl}",
                    f"The controller in {room} advanced from RCL {old_rcl} to RCL {new_rcl}, unlocking a broader set of deterministic colony capabilities.",
                    {"room": room, "from": old_rcl, "to": new_rcl},
                    dedupe_key=f"rcl:{room}:{new_rcl}",
                )
            old_storage = old_colony.get("energy", {}).get("storageEnergy", old_colony.get("storageEnergy", 0))
            new_storage = colony["energy"]["storageEnergy"]
            if new_storage // 250000 != old_storage // 250000:
                direction = "rose above" if new_storage > old_storage else "fell below"
                threshold = max(new_storage, old_storage) // 250000 * 250000
                self.append_journal(
                    telemetry.tick, "storage_threshold", f"{room} storage crossed an energy threshold",
                    f"Storage in {room} {direction} the {threshold:,}-energy band and now contains {new_storage:,} energy.",
                    {"room": room, "before": old_storage, "after": new_storage},
                    dedupe_key=f"storage:{room}:{telemetry.tick}:{new_storage // 250000}",
                )

        old_gcl = old.get("empire", {}).get("gcl", {})
        if isinstance(old_gcl, int):
            old_gcl = {"level": old_gcl, "availableClaimSlots": max(0, old_gcl - old.get("empire", {}).get("ownedRooms", 0))}
        new_gcl = current["empire"]["gcl"]
        if new_gcl["level"] > old_gcl.get("level", 0):
            self.append_journal(
                telemetry.tick, "gcl_increased", f"Empire reached GCL {new_gcl['level']}",
                f"The empire reached GCL {new_gcl['level']} and now has {new_gcl['availableClaimSlots']} unused claim slots.",
                new_gcl, dedupe_key=f"gcl:{new_gcl['level']}",
            )

        old_protection = old.get("empire", {}).get("protection", {})
        seen_protection_events = {item.get("id") for item in old_protection.get("events", [])}
        for event in current["empire"].get("protection", {}).get("events", []):
            if event.get("id") in seen_protection_events:
                continue
            expired = event.get("type") == "PROTECTION_EXPIRED"
            self.append_journal(
                telemetry.tick,
                "protection_expired" if expired else "protection_reassessment",
                "Novice protection ended — a new strategic era began" if expired else event["message"],
                (
                    "The protected-area boundary transitioned to normal. Cached boundary blocks were invalidated; "
                    "the commander will recompute routes, reconsider deferred scouts and post-protection candidates, "
                    "refresh external threats, and request a full strategic advisory."
                    if expired else
                    f"{event['message']}. The commander is reassessing boundary intelligence, defenses, spawn "
                    "availability, nearby players, and protected/post-protection expansion priorities."
                ),
                {"event": event, "protection": current["empire"].get("protection", {})},
                dedupe_key=event["id"],
            )

        old_remotes = {item.get("room"): item for item in old.get("operations", {}).get("remoteMining", [])}
        for remote in current["operations"]["remoteMining"]:
            prior = old_remotes.get(remote["room"])
            continuity = remote.get("reservation", {}).get("continuity") or {}
            prior_continuity = (prior or {}).get("reservation", {}).get("continuity") or {}
            if continuity.get("continuityAtRisk") and (
                continuity.get("spawning", 0) > 0 or continuity.get("queued", 0) > 0
            ) and not (
                prior_continuity.get("continuityAtRisk")
                and (prior_continuity.get("spawning", 0) > 0 or prior_continuity.get("queued", 0) > 0)
            ):
                self.append_journal(
                    telemetry.tick,
                    "reservation_replacement_dispatched",
                    f"Reservation replacement dispatched for {remote['room']}",
                    f"The reservation in {remote['room']} entered its travel-aware replacement window. "
                    "AZC has a reserver queued or spawning early enough to cover body production, route travel, "
                    "and the configured safety margin.",
                    {"room": remote["room"], "continuity": continuity},
                    dedupe_key=f"reservation-dispatched:{remote['room']}:{telemetry.tick}",
                )
            prior_ticks = (prior or {}).get("reservation", {}).get("ticksToEnd")
            current_ticks = remote.get("reservation", {}).get("ticksToEnd")
            if (
                isinstance(prior_ticks, int)
                and isinstance(current_ticks, int)
                and prior_ticks <= max(200, prior_continuity.get("leadTicks", 0))
                and current_ticks >= prior_ticks + 500
            ):
                self.append_journal(
                    telemetry.tick,
                    "reservation_crisis_avoided",
                    f"Reservation crisis avoided in {remote['room']}",
                    f"The controller reservation in {remote['room']} recovered from {prior_ticks:,} to "
                    f"{current_ticks:,} ticks after deterministic travel-aware replacement. The remote remained "
                    "under AZC control without requiring another strategic AI order.",
                    {"room": remote["room"], "before": prior_ticks, "after": current_ticks},
                    dedupe_key=f"reservation-avoided:{remote['room']}:{current_ticks // 500}",
                )
            if prior and prior.get("security", {}).get("isSafe", True) and not remote["security"]["isSafe"]:
                self.append_journal(
                    telemetry.tick, "remote_interrupted", f"Remote {remote['room']} was interrupted",
                    f"The remote operation in {remote['room']} is no longer reporting a safe operating state. Deterministic defenses and population handling remain in control.",
                    {"room": remote["room"], "hostiles": remote["security"]["hostileCreeps"]},
                    dedupe_key=f"remote-interruption:{remote['room']}:{telemetry.tick}",
                )
            if prior and not prior.get("security", {}).get("isSafe", False) and remote["security"]["isSafe"]:
                self.append_journal(
                    telemetry.tick, "remote_recovered", f"Remote {remote['room']} recovered",
                    f"The remote operation in {remote['room']} has returned to a safe operating state.",
                    {"room": remote["room"]}, dedupe_key=f"remote-recovery:{remote['room']}:{telemetry.tick}",
                )

        old_establishments = {
            item.get("target"): item for item in old.get("operations", {}).get("remoteEstablishments", [])
        }
        for establishment in current["operations"].get("remoteEstablishments", []):
            prior = old_establishments.get(establishment["target"])
            if prior and prior.get("state") == establishment["state"]:
                continue
            predicted = establishment.get("prediction", {})
            narrative = (
                f"The new remote operation from {establishment['origin']} to {establishment['target']} is now "
                f"{establishment['state']}. Its deterministic candidate score was "
                f"{establishment.get('candidateScore', 'unknown')}, with predicted quality "
                f"{predicted.get('quality', 'UNKNOWN')}."
            )
            if establishment.get("failureReason"):
                narrative += f" Failure reason: {establishment['failureReason']}."
            self.append_journal(
                telemetry.tick,
                "remote_establishment_state",
                f"{establishment['target']} establishment entered {establishment['state']}",
                narrative,
                {"establishment": establishment, "previousState": (prior or {}).get("state")},
                dedupe_key=(
                    f"remote-establishment:{establishment['target']}:{establishment['state']}:"
                    f"{establishment.get('startedTick', telemetry.tick)}"
                ),
            )

        old_intel = {item.get("room") for item in old.get("intelligence", {}).get("knownRooms", [])}
        for intel in current["intelligence"]["knownRooms"]:
            if intel["room"] not in old_intel:
                self.append_journal(
                    telemetry.tick, "room_first_observed", f"Room {intel['room']} entered the intelligence record",
                    f"Fresh intelligence was recorded for {intel['room']}: {intel['sourceCount']} sources, "
                    f"classification {intel['classification']}, controller status {intel['controller']['status']}.",
                    {"room": intel["room"]}, dedupe_key=f"room-intel:{intel['room']}",
                )

    def _journal_phase6_changes(
        self,
        previous: dict[str, Any] | None,
        current: dict[str, Any],
        tick: int,
        shard: str,
    ) -> None:
        readiness = current.get("expansionReadiness", {})
        candidates = current.get("claimCandidates", [])
        candidate = next(
            (item for item in candidates if item.get("room") == readiness.get("recommendedRoom")),
            candidates[0] if candidates else None,
        )
        self.append_journal(
            tick,
            "phase6_baseline",
            "Permanent-colonization planning baseline established",
            (
                f"The commander began persistent Phase 6 planning with {len(candidates)} ranked claim "
                f"candidates. Current readiness is {readiness.get('status', 'UNKNOWN')}; preferred room "
                f"is {readiness.get('recommendedRoom') or 'not yet determined'} from "
                f"{readiness.get('origin') or 'no healthy origin'}. Legal global/protected-region capacity "
                f"is {readiness.get('globalGclClaimSlots', 0)}/{readiness.get('currentProtectionClaimSlots', 0)}."
            ),
            {"readiness": readiness, "topCandidate": candidate},
            dedupe_key=f"phase6-baseline:{shard}",
        )

        old = {} if previous is None else previous.get("telemetry", {})
        old_readiness = old.get("expansionReadiness", {})
        if readiness.get("status") == "READY" and (
            old_readiness.get("status") != "READY"
            or old_readiness.get("recommendedRoom") != readiness.get("recommendedRoom")
        ) and candidate:
            layout = candidate.get("layout") or {}
            origin = layout.get("origin") or {}
            conversion = candidate.get("economicConversion") or {}
            bootstrap = candidate.get("bootstrap") or {}
            strategy = candidate.get("strategy") or {}
            self.append_journal(
                tick,
                "colonization_ready",
                f"A permanent colony is ready for authorization: {candidate['room']}",
                (
                    f"After comparing current territorial intelligence, the commander selected "
                    f"{candidate['room']} from {candidate.get('origin')} at score {candidate.get('score')}. "
                    f"Its current role is {candidate.get('currentOperationalRole')}; the supported layout "
                    f"is {layout.get('name')} at {origin.get('x')},{origin.get('y')}. Estimated bootstrap "
                    f"burden is {bootstrap.get('burden', 'unknown')} ({bootstrap.get('estimatedEnergy', 'unknown')} "
                    f"energy). Existing remote income temporarily displaced is "
                    f"{conversion.get('temporaryIncomeLossPer1000') or 0} energy/1,000 ticks. "
                    f"The room opens approximately {strategy.get('adjacentRemotePotential', 0)} adjacent "
                    f"remote opportunities. The first claim remains human-gated."
                ),
                {"candidate": candidate, "readiness": readiness},
                dedupe_key=(
                    f"colonization-ready:{candidate['room']}:{layout.get('name')}:"
                    f"{origin.get('x')}:{origin.get('y')}"
                ),
            )

        old_operations = {
            item.get("target"): item
            for item in old.get("operations", {}).get("colonizations", [])
        }
        for operation in current.get("operations", {}).get("colonizations", []):
            target = operation.get("target")
            prior = old_operations.get(target)
            if prior and prior.get("state") == operation.get("state"):
                continue
            state = operation.get("state", "UNKNOWN")
            titles = {
                "AUTHORIZED": f"Colonization of {target} was authorized",
                "CLAIMER_REQUESTED": f"A claimer was requested for {target}",
                "CLAIMER_EN_ROUTE": f"The claimer is traveling to {target}",
                "CLAIMED": f"{target} became an owned room",
                "SPAWN_BUILDING": f"The first spawn is under construction in {target}",
                "SPAWN_OPERATIONAL": f"The first spawn became operational in {target}",
                "ECONOMY_BOOTSTRAPPING": f"{target}'s local economy began operating",
                "SUCCESS": f"{target} became self-sustaining",
                "FAILED": f"Colonization of {target} failed",
            }
            self.append_journal(
                tick,
                "colonization_failure" if state == "FAILED" else "colonization_milestone",
                titles.get(state, f"{target} colonization entered {state}"),
                (
                    f"The deterministic colonization lifecycle for {target} advanced to {state}. "
                    + (operation.get("failureReason") or "Progress remains governed by AZC's native executor.")
                ),
                {"operation": operation, "previousState": None if prior is None else prior.get("state")},
                dedupe_key=f"colonization:{operation.get('id')}:{state}",
            )

    def prune(self) -> None:
        self.connection.execute(
            "DELETE FROM observations WHERE id NOT IN (SELECT id FROM observations ORDER BY id DESC LIMIT 5000)"
        )
        self.connection.execute(
            """
            DELETE FROM recommendations
            WHERE recommendation_id NOT IN (
                SELECT recommendation_id FROM recommendations ORDER BY created_at DESC LIMIT 1000
            )
            """
        )
        self.connection.execute(
            "DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 5000)"
        )
        self.connection.execute(
            "DELETE FROM journal WHERE id NOT IN (SELECT id FROM journal ORDER BY id DESC LIMIT 5000)"
        )
        self.connection.execute(
            """
            DELETE FROM commands
            WHERE state NOT IN ('queued', 'sent')
              AND command_id NOT IN (
                  SELECT command_id FROM commands ORDER BY updated_at DESC LIMIT 5000
              )
            """
        )
        self.connection.commit()
