"""Strict Memory Segment and structured-advisory schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class CPUState(StrictModel):
    limit: float
    used: float
    bucket: int


class GCLState(StrictModel):
    level: int
    progress: float
    progressTotal: float
    ownedRooms: int
    availableClaimSlots: int


class EmpireState(StrictModel):
    gcl: GCLState
    creeps: int
    credits: float


class ControllerState(StrictModel):
    rcl: int
    progress: int
    progressTotal: int
    progressPercent: float
    ticksToDowngrade: int | None
    downgradeCritical: bool
    safeMode: int | None
    safeModeAvailable: int
    safeModeCooldown: int | None


class ContainerEnergyState(StrictModel):
    count: int
    energy: int
    capacity: int


class ColonyEnergyState(StrictModel):
    available: int
    capacity: int
    storageEnergy: int
    terminalEnergy: int | None
    droppedEnergy: int
    containers: ContainerEnergyState


class StructureCapacity(StrictModel):
    count: int
    allowed: int


class ColonyStructures(StrictModel):
    spawn: StructureCapacity
    extension: StructureCapacity
    tower: StructureCapacity
    storage: StructureCapacity
    terminal: StructureCapacity
    link: StructureCapacity
    lab: StructureCapacity
    factory: StructureCapacity
    extractor: StructureCapacity
    observer: StructureCapacity
    nuker: StructureCapacity
    powerSpawn: StructureCapacity


class Capabilities(StrictModel):
    canUseStorage: bool
    canUseTerminal: bool
    canUseLabs: bool
    canUseFactory: bool
    canUseLinks: bool
    canUseExtractor: bool


class SpawningState(StrictModel):
    spawns: int
    busy: int
    idle: int
    queueDepth: int
    queuedRoles: dict[str, int]


class ConstructionState(StrictModel):
    sites: int
    byType: dict[str, int]
    outstandingEnergy: int


class HitSummary(StrictModel):
    count: int
    min: int | None
    median: int | None
    max: int | None


class DefenseState(StrictModel):
    towers: int
    towerEnergy: int
    ramparts: HitSummary
    walls: HitSummary
    hostileCreeps: int
    hostileStructures: int
    recentHostileEvents: int
    lastHostileSightingTick: int | None


class PopulationRole(StrictModel):
    expected: int
    alive: int
    spawning: int
    queued: int
    dyingSoon: int


class PopulationState(StrictModel):
    roles: dict[str, PopulationRole]
    expectedTotal: int
    aliveTotal: int
    spawningTotal: int
    dyingSoonTotal: int
    demandSatisfaction: float | None


class ColonyState(StrictModel):
    controller: ControllerState
    energy: ColonyEnergyState
    structures: ColonyStructures
    capabilities: Capabilities
    spawning: SpawningState
    construction: ConstructionState
    defense: DefenseState
    population: PopulationState


class ColonizationOperation(StrictModel):
    id: str
    from_: str | None = Field(alias="from")
    target: str | None


class RouteState(StrictModel):
    length: int | None
    rooms: list[str]


class ReservationState(StrictModel):
    username: str | None
    ticksToEnd: int | None


class RemoteMiningState(StrictModel):
    visibleSources: int
    sourceEnergy: int
    minimumRegenerationTicks: int | None
    containers: int
    containerEnergy: int
    containerHits: HitSummary
    droppedEnergy: int
    energyWaiting: int


class RemoteDeliveryState(StrictModel):
    energyDeliveredTotal: int
    lastDeliveryTick: int | None


class RemoteLossState(StrictModel):
    creepLossesTotal: int
    lastCreepLossTick: int | None
    hostileInterruptionsTotal: int
    lastInterruptionTick: int | None


class RemoteSecurityState(StrictModel):
    isSafe: bool
    hostileCreeps: int
    lastHostileSightingTick: int | None


class RemoteMiningOperation(StrictModel):
    room: str
    colony: str | None
    configured: bool
    active: bool
    hasKeepers: bool
    visible: bool
    lastSeenTick: int | None
    intelAgeTicks: int | None
    sourceCount: int | None
    route: RouteState
    reservation: ReservationState
    population: PopulationState
    mining: RemoteMiningState
    delivery: RemoteDeliveryState
    losses: RemoteLossState
    security: RemoteSecurityState


class CombatOperation(StrictModel):
    id: str
    colony: str | None
    target: str | None
    tactic: str | None


class ScoutingOperation(StrictModel):
    id: str
    origin: str
    room: str | None
    status: str
    createdTick: int | None
    observedTick: int | None
    activeScouts: int


class OperationsState(StrictModel):
    colonizations: list[ColonizationOperation]
    remoteMining: list[RemoteMiningOperation]
    combat: list[CombatOperation]
    scouting: list[ScoutingOperation]


class IntelController(StrictModel):
    status: Literal["none", "owned", "owned_other", "reserved", "neutral"]
    owner: str | None
    reservation: str | None
    reservationTicks: int | None
    rcl: int
    safeMode: int | None


class IntelStructures(StrictModel):
    spawns: int
    towers: int
    storage: int
    terminal: int
    hostile: int
    fortifications: HitSummary


class RoomIntel(StrictModel):
    room: str
    lastSeenTick: int
    classification: Literal["normal", "highway", "source_keeper", "sector_center", "unknown"]
    sourceCount: int
    mineralType: str | None
    terrainSwampPercent: float | None
    controller: IntelController
    structures: IntelStructures
    hostileCreeps: int
    hostilePlayers: list[str]
    lastHostileSightingTick: int | None
    hostileSightingsTotal: int
    nearestColony: str | None
    distanceFromColony: int | None
    routeLength: int | None
    routeStatus: Literal["available", "no_path", "unknown", "unavailable"]
    intelAgeTicks: int
    stale: bool


class HostileEvent(StrictModel):
    tick: int
    room: str
    players: list[str]
    count: int


class IntelligenceState(StrictModel):
    radius: int
    staleAfterTicks: int
    knownRooms: list[RoomIntel]
    unknownRooms: list[str]
    staleRooms: list[str]
    hostileEvents: list[HostileEvent]


class ExpansionCandidate(StrictModel):
    room: str
    score: int
    factors: dict[str, int]
    intelAgeTicks: int
    disqualified: bool
    disqualifiers: list[str]


class ExecutionAuthority(StrictModel):
    scouting: bool
    expansion: bool
    remoteMiningChanges: bool
    market: bool
    production: bool
    offensiveCombat: bool


class AuthorityState(StrictModel):
    mode: Literal["observe", "execute"]
    allowedActions: list[Literal["NOOP", "REQUEST_STATUS", "SET_EXPLANATION", "SCOUT_ROOM"]]
    execution: ExecutionAuthority


class ObserverMetrics(StrictModel):
    cpuUsed: float
    payloadBytes: int


class Telemetry(StrictModel):
    schemaVersion: Literal[2]
    tick: int
    shard: str
    cpu: CPUState
    empire: EmpireState
    colonies: dict[str, ColonyState]
    operations: OperationsState
    intelligence: IntelligenceState
    expansionCandidates: list[ExpansionCandidate]
    authority: AuthorityState
    alerts: list[str]
    observer: ObserverMetrics


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
    action: Literal["NOOP", "REQUEST_STATUS", "SET_EXPLANATION", "SCOUT_ROOM"]
    parameters: dict[str, Any]
    reason: str


class InboxEnvelope(StrictModel):
    schemaVersion: Literal[1]
    tick: int
    orders: list[StrategicOrder]


class AdvisoryPriority(StrictModel):
    priority: int = Field(ge=1, le=10)
    category: Literal[
        "expansion", "economy", "intelligence", "defense", "remote_mining",
        "population", "production", "diplomacy", "other"
    ]
    recommendation: str = Field(min_length=1, max_length=1200)
    reason: str = Field(min_length=1, max_length=1600)


class ColonyAssessment(StrictModel):
    room: str
    status: Literal["healthy", "stable", "degraded", "critical", "unknown"]
    narrative: str = Field(min_length=1, max_length=2400)


class RemoteAssessment(StrictModel):
    room: str
    status: Literal["healthy", "operating", "degraded", "interrupted", "unknown"]
    narrative: str = Field(min_length=1, max_length=1800)


class ScoutRecommendation(StrictModel):
    room: str
    origin: str
    priority: int = Field(ge=1, le=10)
    reason: str = Field(min_length=1, max_length=1000)


class Advisory(StrictModel):
    status: Literal["healthy", "stable", "strained", "critical", "unknown"]
    phase: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=1800)
    strategic_assessment: str = Field(min_length=1, max_length=4000)
    narrative: str = Field(min_length=1, max_length=6000)
    colony_assessments: list[ColonyAssessment] = Field(max_length=20)
    remote_assessments: list[RemoteAssessment] = Field(max_length=40)
    territory_assessment: str = Field(min_length=1, max_length=3000)
    priorities: list[AdvisoryPriority] = Field(max_length=10)
    concerns: list[str] = Field(max_length=16)
    questions: list[str] = Field(max_length=16)
    expansion_readiness: Literal[
        "READY", "NOT_READY", "INSUFFICIENT_INTEL", "BLOCKED_BY_GCL",
        "BLOCKED_BY_ECONOMY", "BLOCKED_BY_THREAT"
    ]
    expansion_execution_allowed: bool
    execution_authorization: Literal["ADVISOR_ONLY", "SCOUTING_ONLY"]
    recommended_scouting: list[ScoutRecommendation] = Field(max_length=8)
    recommended_review_ticks: int = Field(ge=50, le=20000)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    journal_entry: str = Field(min_length=1, max_length=5000)
