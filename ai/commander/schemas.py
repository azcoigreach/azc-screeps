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
    player: str | None
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
    desired: int
    alive: int
    spawning: int
    queued: int
    dyingSoon: int
    waitingTicks: int
    lastSpawnResult: int | None
    state: Literal[
        "SATISFIED", "UNDERSTAFFED", "REPLACEMENT_PENDING",
        "INTENTIONALLY_DISABLED", "NOT_REQUIRED", "MISCONFIGURED"
    ]


class PopulationState(StrictModel):
    roles: dict[str, PopulationRole]
    source: str
    state: Literal[
        "SATISFIED", "UNDERSTAFFED", "REPLACEMENT_PENDING",
        "INTENTIONALLY_DISABLED", "NOT_REQUIRED", "MISCONFIGURED"
    ]
    expectedTotal: int
    desiredTotal: int
    aliveTotal: int
    assignedTotal: int
    spawningTotal: int
    queuedTotal: int
    dyingSoonTotal: int
    lastDemandTick: int | None
    oldestWaitingTicks: int
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
    status: Literal["DIRECT", "CONFIGURED", "FAILED"]


class ReservationState(StrictModel):
    username: str | None
    relation: Literal["SELF", "ALLY", "NEUTRAL", "HOSTILE", "UNKNOWN"]
    ticksToEnd: int | None
    warningTicks: int
    reserverPresent: int
    reserverSpawning: int
    reserverQueued: int


class RemoteMiningState(StrictModel):
    visibleSources: int
    sourceEnergy: int
    minimumRegenerationTicks: int | None
    containers: int
    containerSites: int
    expectedSourceContainers: int | None
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


class RemoteDiagnostic(StrictModel):
    diagnostic: Literal[
        "NO_CONTAINER", "CONTAINER_DAMAGED", "ENERGY_BACKLOG", "MINER_SHORTAGE",
        "HAULER_SHORTAGE", "RESERVER_SHORTAGE", "RESERVATION_EXPIRING",
        "HOSTILE_INTERRUPTION", "STALE_INTEL", "ROUTE_FAILURE",
        "HIGH_CREEP_LOSSES", "LOW_DELIVERY"
    ]
    severity: Literal["LOW", "MEDIUM", "HIGH"]
    evidence: dict[str, Any]


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
    health: Literal["HEALTHY", "DEGRADED", "FAILING", "UNSAFE", "STALE_INTEL", "PAUSED", "UNKNOWN"]
    reasons: list[str]
    diagnostics: list[RemoteDiagnostic]
    objectives: list[str]


class CombatOperation(StrictModel):
    id: str
    colony: str | None
    target: str | None
    tactic: str | None


class ScoutingOperation(StrictModel):
    id: str
    orderId: str | None
    origin: str
    room: str | None
    status: Literal["QUEUED", "SPAWNING", "EN_ROUTE", "OBSERVED", "COMPLETED", "FAILED", "EXPIRED"]
    createdTick: int | None
    requestedTick: int | None
    observedTick: int | None
    completedTick: int | None
    intelLastSeenTick: int | None
    scoutCreep: str | None
    activeScouts: int
    failureReason: str | None


class OperationsState(StrictModel):
    colonizations: list[ColonizationOperation]
    remoteMining: list[RemoteMiningOperation]
    combat: list[CombatOperation]
    scouting: list[ScoutingOperation]


class IntelController(StrictModel):
    status: Literal["none", "owned", "owned_other", "reserved", "neutral"]
    owner: str | None
    ownerRelation: Literal["SELF", "ALLY", "NEUTRAL", "HOSTILE", "UNKNOWN"]
    reservation: str | None
    reservationRelation: Literal["SELF", "ALLY", "NEUTRAL", "HOSTILE", "UNKNOWN"]
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
    playerRelations: list[dict[str, str]]
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
    currentOperationalRole: Literal[
        "OUR_COLONY", "OUR_REMOTE", "NEUTRAL_SCOUTED", "NEUTRAL_UNKNOWN",
        "SELF_RESERVED", "ALLY_RESERVED", "FOREIGN_RESERVED", "HOSTILE_OWNED",
        "ALLY_OWNED", "SOURCE_KEEPER", "HIGHWAY", "OTHER"
    ]
    claimCandidateStatus: Literal["ELIGIBLE", "NEEDS_FRESH_INTEL", "DISQUALIFIED"]


class ExecutionAuthority(StrictModel):
    scouting: bool
    autoScouting: bool
    expansion: bool
    remoteMaintenance: bool
    autoRemoteMaintenance: bool
    remoteMiningChanges: bool
    market: bool
    production: bool
    offensiveCombat: bool


class AuthorityState(StrictModel):
    mode: Literal["observe", "execute"]
    allowedActions: list[Literal[
        "NOOP", "REQUEST_STATUS", "SET_EXPLANATION", "SCOUT_ROOM", "REASSESS_REMOTE",
        "ENSURE_REMOTE_RESERVATION", "ENSURE_REMOTE_INFRASTRUCTURE", "REBALANCE_REMOTE_LOGISTICS"
    ]]
    execution: ExecutionAuthority
    matrix: dict[str, dict[str, bool]]


class ObserverMetrics(StrictModel):
    cpuUsed: float
    payloadBytes: int


class Telemetry(StrictModel):
    schemaVersion: Literal[3]
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
    status: Literal["completed", "rejected", "failed", "expired"]
    tick: int
    message: str | None = None
    reason: str | None = None
    details: dict[str, Any] | None = None


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
    action: Literal[
        "NOOP", "REQUEST_STATUS", "SET_EXPLANATION", "SCOUT_ROOM", "REASSESS_REMOTE",
        "ENSURE_REMOTE_RESERVATION", "ENSURE_REMOTE_INFRASTRUCTURE", "REBALANCE_REMOTE_LOGISTICS"
    ]
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
    room: str = Field(pattern=r"^[WE]\d+[NS]\d+$")
    origin: str = Field(pattern=r"^[WE]\d+[NS]\d+$")
    priority: int = Field(ge=1, le=10)
    reason: str = Field(min_length=1, max_length=1000)


class StrategicActionProposal(StrictModel):
    action: Literal[
        "SCOUT_ROOM", "REASSESS_REMOTE", "ENSURE_REMOTE_RESERVATION",
        "ENSURE_REMOTE_INFRASTRUCTURE", "REBALANCE_REMOTE_LOGISTICS",
        "START_REMOTE_MINING", "STOP_REMOTE_MINING", "COLONIZE_ROOM", "ATTACK_ROOM"
    ]
    target: str = Field(pattern=r"^[WE]\d+[NS]\d+$")
    origin: str | None = Field(default=None, pattern=r"^[WE]\d+[NS]\d+$")
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str] = Field(max_length=12)
    reason: str = Field(min_length=1, max_length=1600)
    expectedOutcome: str = Field(min_length=1, max_length=1600)
    evaluationWindowTicks: int = Field(ge=50, le=20000)


class Advisory(StrictModel):
    status: Literal["healthy", "stable", "strained", "critical", "unknown"]
    phase: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=1800)
    observations: list[str] = Field(max_length=20)
    assessment: str = Field(min_length=1, max_length=4000)
    strategic_assessment: str = Field(min_length=1, max_length=4000)
    narrative: str = Field(min_length=1, max_length=6000)
    colony_assessments: list[ColonyAssessment] = Field(max_length=20)
    remote_assessments: list[RemoteAssessment] = Field(max_length=40)
    territory_assessment: str = Field(min_length=1, max_length=3000)
    priorities: list[AdvisoryPriority] = Field(max_length=10)
    recommended_actions: list[StrategicActionProposal] = Field(max_length=8)
    executable_actions: list[StrategicActionProposal] = Field(max_length=4)
    uncertainty: list[str] = Field(max_length=16)
    expected_outcome: str = Field(min_length=1, max_length=2400)
    follow_up: str = Field(min_length=1, max_length=2400)
    concerns: list[str] = Field(max_length=16)
    questions: list[str] = Field(max_length=16)
    expansion_readiness: Literal[
        "READY", "NOT_READY", "INSUFFICIENT_INTEL", "BLOCKED_BY_GCL",
        "BLOCKED_BY_ECONOMY", "BLOCKED_BY_THREAT"
    ]
    expansion_execution_allowed: bool
    execution_authorization: Literal["ADVISOR_ONLY", "SCOUTING_ONLY", "EXISTING_REMOTE_MAINTENANCE"]
    recommended_scouting: list[ScoutRecommendation] = Field(max_length=8)
    recommended_review_ticks: int = Field(ge=50, le=20000)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    journal_entry: str = Field(min_length=1, max_length=5000)
    journal_narrative: str = Field(min_length=1, max_length=6000)
