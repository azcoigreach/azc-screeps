"""Telemetry validation, change detection, and persistence."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from pydantic import ValidationError

from .history import HistoryStore
from .schemas import Telemetry
from .segments import content_hash


class TelemetryError(ValueError):
    pass


@dataclass(frozen=True)
class ObservationUpdate:
    telemetry: Telemetry
    telemetry_hash: str
    material_hash: str
    is_new: bool
    material_change: bool
    previous_telemetry: Telemetry | None = None


class ObservationProcessor:
    def __init__(self, history: HistoryStore) -> None:
        self.history = history

    def process(self, raw: str) -> ObservationUpdate:
        try:
            telemetry = Telemetry.model_validate_json(raw)
        except (ValidationError, ValueError) as exc:
            raise TelemetryError(f"Telemetry failed schema validation: {exc}") from exc
        telemetry_hash = content_hash(raw)
        material_hash = self.material_hash(telemetry)
        previous = self.history.latest_observation()
        previous_telemetry = None
        if previous is not None:
            try:
                previous_telemetry = Telemetry.model_validate(previous["telemetry"])
            except ValidationError:
                # Old history rows must never prevent fresh telemetry processing.
                previous_telemetry = None
        is_new = previous is None or previous["telemetry_hash"] != telemetry_hash
        material_change = previous is None or previous["material_hash"] != material_hash
        if is_new:
            self.history.save_observation(telemetry, telemetry_hash, material_hash)
        return ObservationUpdate(
            telemetry, telemetry_hash, material_hash, is_new, material_change,
            previous_telemetry,
        )

    @staticmethod
    def material_hash(telemetry: Telemetry) -> str:
        def protection_state(value):
            return {
                "status": value.status,
                "expirationTimestamp": value.expirationTimestamp,
                "protected": value.protected,
                "regionKey": value.regionKey,
                "sharesCurrentProtectedRegion": value.sharesCurrentProtectedRegion,
                "accessibility": value.accessibility,
                "reachableNow": value.reachableNow,
                "reachableAfterTimestamp": value.reachableAfterTimestamp,
                "blockedExits": value.blockedExits,
            }

        colonies = {}
        for name, colony in sorted(telemetry.colonies.items()):
            colonies[name] = {
                "rcl": colony.controller.rcl,
                "storageBand": colony.energy.storageEnergy // 25000,
                "terminalBand": None if colony.energy.terminalEnergy is None else colony.energy.terminalEnergy // 10000,
                "population": colony.population.model_dump(),
                "structureCounts": {
                    key: value["count"] for key, value in colony.structures.model_dump().items()
                },
                "constructionTypes": colony.construction.byType,
                "hostiles": colony.defense.hostileCreeps,
                "safeMode": colony.controller.safeMode is not None,
            }
        remotes = {}
        for remote in telemetry.operations.remoteMining:
            remotes[remote.room] = {
                "active": remote.active,
                "visible": remote.visible,
                "health": remote.health,
                "diagnostics": [item.model_dump() for item in remote.diagnostics],
                "population": remote.population.model_dump(),
                "waitingEnergyBand": remote.mining.energyWaiting // 500,
                "deliveryBand": remote.delivery.energyDeliveredTotal // 5000,
                "losses": remote.losses.model_dump(),
                "security": remote.security.model_dump(),
            }
        material = {
            "shard": telemetry.shard,
            "empire": {
                "player": telemetry.empire.player,
                "gclLevel": telemetry.empire.gcl.level,
                "claimSlots": telemetry.empire.gcl.availableClaimSlots,
                "creepBand": telemetry.empire.creeps // 5,
                "protection": {
                    "status": telemetry.empire.protection.status,
                    "expirationTimestamp": telemetry.empire.protection.expirationTimestamp,
                    "threshold": telemetry.empire.protection.threshold,
                    "globalGclClaimSlots": telemetry.empire.protection.globalGclClaimSlots,
                    "currentProtectionClaimSlots": telemetry.empire.protection.currentProtectionClaimSlots,
                    "advisoryRequired": telemetry.empire.protection.advisoryRequired,
                    "lastTransitionTick": telemetry.empire.protection.lastTransitionTick,
                    "eventIds": [event.id for event in telemetry.empire.protection.events],
                    "rules": telemetry.empire.protection.rules.model_dump(),
                },
                "militaryPreparation": {
                    "spawnThroughput": telemetry.empire.militaryPreparation.spawnThroughput.model_dump(),
                    "resourceBands": {
                        resource: amount // (25000 if resource == "energy" else 1000)
                        for resource, amount in telemetry.empire.militaryPreparation.availableCombatResources.items()
                    },
                    "nukersOperational": telemetry.empire.militaryPreparation.nukersOperational,
                },
            },
            "colonies": colonies,
            "remotes": remotes,
            "scouting": [mission.model_dump() for mission in telemetry.operations.scouting],
            "remoteEstablishments": [item.model_dump() for item in telemetry.operations.remoteEstablishments],
            "knownIntel": {
                room.room: {
                    "sources": room.sourceCount,
                    "controller": room.controller.model_dump(),
                    "hostiles": room.hostileCreeps,
                    "structures": room.structures.model_dump(),
                }
                for room in telemetry.intelligence.knownRooms
            },
            "unknownRooms": telemetry.intelligence.unknownRooms,
            "protectionByRoom": {
                room: protection_state(value)
                for room, value in sorted(telemetry.intelligence.protectionByRoom.items())
            },
            "candidateSets": telemetry.intelligence.candidateSets,
            "candidateScores": {candidate.room: candidate.score for candidate in telemetry.expansionCandidates},
            "remoteCandidateScores": {candidate.room: candidate.score for candidate in telemetry.remoteCandidates},
            "expansionReadiness": telemetry.expansionReadiness.model_dump(),
            "alerts": telemetry.alerts,
            "cpuBucketBand": telemetry.cpu.bucket // 1000,
        }
        encoded = json.dumps(material, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()
