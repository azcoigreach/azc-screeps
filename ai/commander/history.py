"""Bounded SQLite history for observations, commands, advisories, and events."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
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
                confidence REAL,
                input_tokens INTEGER,
                output_tokens INTEGER,
                total_tokens INTEGER,
                estimated_cost_usd REAL,
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
            """
        )
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def save_observation(self, telemetry: Telemetry, telemetry_hash: str, material_hash: str) -> bool:
        colony_levels = [colony.rcl for colony in telemetry.colonies.values()]
        hostile_count = sum(colony.hostiles for colony in telemetry.colonies.values())
        remote_summary = [item.model_dump(by_alias=True) for item in telemetry.operations.remoteMining]
        summary = {
            "colonies": {
                name: {
                    "rcl": colony.rcl,
                    "storageEnergy": colony.storageEnergy,
                    "terminalEnergy": colony.terminalEnergy,
                    "hostiles": colony.hostiles,
                }
                for name, colony in telemetry.colonies.items()
            },
            "operationCounts": {
                "colonizations": len(telemetry.operations.colonizations),
                "remoteMining": len(telemetry.operations.remoteMining),
                "combat": len(telemetry.operations.combat),
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
                max(colony_levels, default=0), telemetry.empire.ownedRooms, telemetry.empire.creeps,
                telemetry.cpu.used, telemetry.cpu.bucket, telemetry.empire.gcl, telemetry.empire.credits,
                json.dumps(remote_summary, separators=(",", ":")), hostile_count,
                json.dumps(summary, separators=(",", ":")),
                telemetry.model_dump_json(by_alias=True),
            ),
        )
        self.connection.commit()
        if cursor.rowcount:
            self.prune()
            return True
        return False

    def latest_observation(self) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM observations ORDER BY id DESC LIMIT 1"
        ).fetchone()
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
            (
                state,
                None if acknowledgement is None else json.dumps(acknowledgement, separators=(",", ":")),
                utc_now(),
                command_id,
            ),
        )
        self.connection.commit()

    def pending_commands(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM commands WHERE state IN ('queued', 'sent') ORDER BY created_at"
        ).fetchall()
        return [dict(row) for row in rows]

    def recent_commands(self, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM commands ORDER BY updated_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(row) for row in rows]

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
                confidence, input_tokens, output_tokens, total_tokens, estimated_cost_usd, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                recommendation_id, observation_tick, model, advisory.summary,
                advisory.strategic_assessment,
                json.dumps(advisory.concerns, separators=(",", ":")),
                json.dumps([item.model_dump() for item in advisory.priorities], separators=(",", ":")),
                json.dumps(advisory.questions, separators=(",", ":")),
                1 if advisory.ready_for_expansion else 0, advisory.confidence,
                usage.get("input_tokens"), usage.get("output_tokens"), usage.get("total_tokens"),
                estimated_cost_usd, utc_now(),
            ),
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
            """
            DELETE FROM commands
            WHERE state NOT IN ('queued', 'sent')
              AND command_id NOT IN (
                  SELECT command_id FROM commands ORDER BY updated_at DESC LIMIT 5000
              )
            """
        )
        self.connection.commit()
