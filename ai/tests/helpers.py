from __future__ import annotations

from pathlib import Path

from commander.config import CommanderConfig


def config(database_path: Path, **overrides) -> CommanderConfig:
    values = {
        "screeps_token": "screeps-secret",
        "openai_token": "openai-secret",
        "screeps_api_url": "https://screeps.invalid",
        "screeps_shard": "shard0",
        "openai_model": "gpt-5.4-nano",
        "database_path": database_path,
        "poll_interval_seconds": 30.0,
        "heartbeat_interval_seconds": 120.0,
        "review_interval_seconds": 300.0,
        "http_timeout_seconds": 10.0,
        "command_expiry_ticks": 1000,
        "write_explanation": True,
        "openai_input_cost_per_million": 0.20,
        "openai_output_cost_per_million": 1.25,
    }
    values.update(overrides)
    return CommanderConfig(**values)


def telemetry_payload(tick: int = 12345) -> dict:
    return {
        "schemaVersion": 1,
        "tick": tick,
        "shard": "shard0",
        "cpu": {"limit": 100, "used": 12.5, "bucket": 9000},
        "empire": {"gcl": 4, "ownedRooms": 1, "creeps": 30, "credits": 12345},
        "colonies": {
            "W1N1": {
                "rcl": 6,
                "energyAvailable": 1800,
                "energyCapacity": 2300,
                "storageEnergy": 240000,
                "terminalEnergy": 40000,
                "spawns": 2,
                "hostiles": 0,
            }
        },
        "operations": {
            "colonizations": [],
            "remoteMining": [
                {"room": "W1N2", "colony": "W1N1", "hasKeepers": False},
                {"room": "W2N1", "colony": "W1N1", "hasKeepers": False},
                {"room": "W2N2", "colony": "W1N1", "hasKeepers": False},
            ],
            "combat": [],
        },
        "alerts": [],
    }


def status_payload(tick: int = 12345, results: list[dict] | None = None) -> dict:
    return {
        "schemaVersion": 1,
        "tick": tick,
        "shard": "shard0",
        "interface": {"enabled": True, "paused": False, "mode": "observe"},
        "commander": {"online": True, "lastSeenTick": tick, "lastOrderTick": tick},
        "orders": {
            "pending": 0,
            "active": 0,
            "completed": 0,
            "rejected": 0,
            "recentResults": results or [],
        },
        "lastDecision": None,
        "lastExplanation": None,
        "lastError": None,
    }
