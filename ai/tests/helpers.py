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
        "openai_timeout_seconds": 120.0,
        "command_expiry_ticks": 1000,
        "write_explanation": True,
        "auto_scout": False,
        "openai_input_cost_per_million": 0.20,
        "openai_output_cost_per_million": 1.25,
    }
    values.update(overrides)
    return CommanderConfig(**values)


def telemetry_payload(tick: int = 12345) -> dict:
    hit_summary = {"count": 0, "min": None, "median": None, "max": None}
    population = {
        "roles": {
            "harvester": {"expected": 2, "alive": 2, "spawning": 0, "queued": 0, "dyingSoon": 0},
            "hauler": {"expected": 2, "alive": 2, "spawning": 0, "queued": 0, "dyingSoon": 0},
        },
        "expectedTotal": 4,
        "aliveTotal": 4,
        "spawningTotal": 0,
        "dyingSoonTotal": 0,
        "demandSatisfaction": 1.0,
    }
    remote_population = {
        "roles": {
            "remote_miner": {"expected": 1, "alive": 1, "spawning": 0, "queued": 0, "dyingSoon": 0},
            "remote_hauler": {"expected": 1, "alive": 1, "spawning": 0, "queued": 0, "dyingSoon": 0},
        },
        "expectedTotal": 2,
        "aliveTotal": 2,
        "spawningTotal": 0,
        "dyingSoonTotal": 0,
        "demandSatisfaction": 1.0,
    }

    def remote(room: str, delivered: int) -> dict:
        return {
            "room": room,
            "colony": "W1N1",
            "configured": True,
            "active": True,
            "hasKeepers": False,
            "visible": True,
            "lastSeenTick": tick,
            "intelAgeTicks": 0,
            "sourceCount": 2,
            "route": {"length": 1, "rooms": ["W1N1", room]},
            "reservation": {"username": "tester", "ticksToEnd": 3000},
            "population": remote_population,
            "mining": {
                "visibleSources": 2,
                "sourceEnergy": 6000,
                "minimumRegenerationTicks": 200,
                "containers": 2,
                "containerEnergy": 1500,
                "containerHits": {"count": 2, "min": 200000, "median": 220000, "max": 240000},
                "droppedEnergy": 100,
                "energyWaiting": 1600,
            },
            "delivery": {"energyDeliveredTotal": delivered, "lastDeliveryTick": tick - 5},
            "losses": {
                "creepLossesTotal": 1,
                "lastCreepLossTick": tick - 500,
                "hostileInterruptionsTotal": 0,
                "lastInterruptionTick": None,
            },
            "security": {"isSafe": True, "hostileCreeps": 0, "lastHostileSightingTick": None},
        }

    return {
        "schemaVersion": 2,
        "tick": tick,
        "shard": "shard0",
        "cpu": {"limit": 100.0, "used": 12.5, "bucket": 9000},
        "empire": {
            "gcl": {
                "level": 4,
                "progress": 250000.0,
                "progressTotal": 500000.0,
                "ownedRooms": 1,
                "availableClaimSlots": 3,
            },
            "creeps": 30,
            "credits": 12345.0,
        },
        "colonies": {
            "W1N1": {
                "controller": {
                    "rcl": 6,
                    "progress": 100000,
                    "progressTotal": 200000,
                    "progressPercent": 50.0,
                    "ticksToDowngrade": 100000,
                    "downgradeCritical": False,
                    "safeMode": None,
                    "safeModeAvailable": 1,
                    "safeModeCooldown": None,
                },
                "energy": {
                    "available": 1800,
                    "capacity": 2300,
                    "storageEnergy": 240000,
                    "terminalEnergy": 40000,
                    "droppedEnergy": 250,
                    "containers": {"count": 2, "energy": 3000, "capacity": 4000},
                },
                "structures": {
                    "spawn": {"count": 2, "allowed": 3},
                    "extension": {"count": 40, "allowed": 40},
                    "tower": {"count": 2, "allowed": 2},
                    "storage": {"count": 1, "allowed": 1},
                    "terminal": {"count": 1, "allowed": 1},
                    "link": {"count": 3, "allowed": 3},
                    "lab": {"count": 3, "allowed": 3},
                    "factory": {"count": 1, "allowed": 1},
                    "extractor": {"count": 1, "allowed": 1},
                    "observer": {"count": 0, "allowed": 0},
                    "nuker": {"count": 0, "allowed": 0},
                    "powerSpawn": {"count": 0, "allowed": 0},
                },
                "capabilities": {
                    "canUseStorage": True,
                    "canUseTerminal": True,
                    "canUseLabs": True,
                    "canUseFactory": True,
                    "canUseLinks": True,
                    "canUseExtractor": True,
                },
                "spawning": {"spawns": 2, "busy": 0, "idle": 2, "queueDepth": 0, "queuedRoles": {}},
                "construction": {"sites": 0, "byType": {}, "outstandingEnergy": 0},
                "defense": {
                    "towers": 2,
                    "towerEnergy": 1800,
                    "ramparts": hit_summary,
                    "walls": hit_summary,
                    "hostileCreeps": 0,
                    "hostileStructures": 0,
                    "recentHostileEvents": 0,
                    "lastHostileSightingTick": None,
                },
                "population": population,
            }
        },
        "operations": {
            "colonizations": [],
            "remoteMining": [
                remote("W1N2", 15000),
                remote("W2N1", 14000),
                remote("W2N2", 13000),
            ],
            "combat": [],
            "scouting": [],
        },
        "intelligence": {
            "radius": 2,
            "staleAfterTicks": 10000,
            "knownRooms": [{
                "room": "W1N2",
                "lastSeenTick": tick,
                "classification": "normal",
                "sourceCount": 2,
                "mineralType": "H",
                "terrainSwampPercent": 12.5,
                "controller": {
                    "status": "neutral",
                    "owner": None,
                    "reservation": None,
                    "reservationTicks": None,
                    "rcl": 0,
                    "safeMode": None,
                },
                "structures": {
                    "spawns": 0,
                    "towers": 0,
                    "storage": 0,
                    "terminal": 0,
                    "hostile": 0,
                    "fortifications": hit_summary,
                },
                "hostileCreeps": 0,
                "hostilePlayers": [],
                "lastHostileSightingTick": None,
                "hostileSightingsTotal": 0,
                "nearestColony": "W1N1",
                "distanceFromColony": 1,
                "routeLength": 1,
                "routeStatus": "available",
                "intelAgeTicks": 0,
                "stale": False,
            }],
            "unknownRooms": ["W0N1"],
            "staleRooms": [],
            "hostileEvents": [],
        },
        "expansionCandidates": [{
            "room": "W1N2",
            "score": 80,
            "factors": {"sources": 40, "distance": 25, "terrain": 15},
            "intelAgeTicks": 0,
            "disqualified": False,
            "disqualifiers": [],
        }],
        "authority": {
            "mode": "observe",
            "allowedActions": ["NOOP", "REQUEST_STATUS", "SET_EXPLANATION", "SCOUT_ROOM"],
            "execution": {
                "scouting": False,
                "expansion": False,
                "remoteMiningChanges": False,
                "market": False,
                "production": False,
                "offensiveCombat": False,
            },
        },
        "alerts": [],
        "observer": {"cpuUsed": 0.4, "payloadBytes": 6000},
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
