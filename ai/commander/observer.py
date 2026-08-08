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
        is_new = previous is None or previous["telemetry_hash"] != telemetry_hash
        material_change = previous is None or previous["material_hash"] != material_hash
        if is_new:
            self.history.save_observation(telemetry, telemetry_hash, material_hash)
        return ObservationUpdate(telemetry, telemetry_hash, material_hash, is_new, material_change)

    @staticmethod
    def material_hash(telemetry: Telemetry) -> str:
        material = {
            "shard": telemetry.shard,
            "empire": telemetry.empire.model_dump(),
            "colonies": {
                name: colony.model_dump()
                for name, colony in sorted(telemetry.colonies.items())
            },
            "operations": telemetry.operations.model_dump(),
            "alerts": telemetry.alerts,
            "cpuBucketBand": telemetry.cpu.bucket // 1000,
        }
        encoded = json.dumps(material, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()
