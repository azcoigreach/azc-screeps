"""Strict protocol and advisor schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class CPUState(StrictModel):
    limit: float
    used: float
    bucket: int


class EmpireState(StrictModel):
    gcl: int
    ownedRooms: int = Field(alias="ownedRooms")
    creeps: int
    credits: float


class ColonyState(StrictModel):
    rcl: int
    energyAvailable: int
    energyCapacity: int
    storageEnergy: int
    terminalEnergy: int
    spawns: int
    hostiles: int


class ColonizationOperation(StrictModel):
    id: str
    from_: str | None = Field(alias="from")
    target: str | None


class RemoteMiningOperation(StrictModel):
    room: str
    colony: str | None
    hasKeepers: bool


class CombatOperation(StrictModel):
    id: str
    colony: str | None
    target: str | None
    tactic: str | None


class OperationsState(StrictModel):
    colonizations: list[ColonizationOperation]
    remoteMining: list[RemoteMiningOperation]
    combat: list[CombatOperation]


class Telemetry(StrictModel):
    schemaVersion: Literal[1]
    tick: int
    shard: str
    cpu: CPUState
    empire: EmpireState
    colonies: dict[str, ColonyState]
    operations: OperationsState
    alerts: list[str]


class CommanderState(StrictModel):
    online: bool
    lastSeenTick: int | None
    lastOrderTick: int | None


class InterfaceState(StrictModel):
    enabled: bool
    paused: bool
    mode: Literal["observe", "execute"]


class OrderResult(StrictModel):
    id: str
    action: str
    status: Literal["completed", "rejected"]
    tick: int
    message: str | None = None
    reason: str | None = None


class OrderStatus(StrictModel):
    pending: int
    active: int
    completed: int
    rejected: int
    recentResults: list[OrderResult]


class Decision(StrictModel):
    id: str
    action: str
    tick: int


class TransportErrorState(StrictModel):
    message: str
    tick: int


class StatusEnvelope(StrictModel):
    schemaVersion: Literal[1]
    tick: int
    shard: str
    interface: InterfaceState
    commander: CommanderState
    orders: OrderStatus
    lastDecision: Decision | None
    lastExplanation: str | None
    lastError: TransportErrorState | None


class StrategicOrder(StrictModel):
    schemaVersion: Literal[1]
    id: str
    createdTick: int
    expiresTick: int
    action: Literal["NOOP", "REQUEST_STATUS", "SET_EXPLANATION"]
    parameters: dict[str, Any]
    reason: str


class InboxEnvelope(StrictModel):
    schemaVersion: Literal[1]
    tick: int
    orders: list[StrategicOrder]


class AdvisoryPriority(StrictModel):
    priority: int = Field(ge=1, le=10)
    category: Literal["expansion", "economy", "intelligence", "defense", "remote_mining", "production", "diplomacy", "other"]
    recommendation: str = Field(min_length=1, max_length=600)
    reason: str = Field(min_length=1, max_length=800)


class Advisory(StrictModel):
    status: Literal["healthy", "stable", "strained", "critical", "unknown"]
    summary: str = Field(min_length=1, max_length=1200)
    strategic_assessment: str = Field(min_length=1, max_length=2000)
    priorities: list[AdvisoryPriority] = Field(max_length=8)
    concerns: list[str] = Field(max_length=12)
    questions: list[str] = Field(max_length=12)
    ready_for_expansion: bool
    recommended_review_ticks: int = Field(ge=50, le=10000)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
