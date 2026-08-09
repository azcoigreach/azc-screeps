"""Human-readable periodic commander operations briefing."""

from __future__ import annotations

from .history import HistoryStore
from .remote_ops import RemoteEconomics
from .schemas import Telemetry


def build_report(history: HistoryStore, telemetry: Telemetry, hours: float = 24) -> str:
    since_tick = max(0, telemetry.tick - round(hours * 1200))
    economics = RemoteEconomics(history).build(telemetry)
    operations = [item for item in history.recent_operations(100) if item["created_tick"] >= since_tick]
    journal = history.recent_journal(100, since_tick)
    hostile_events = [item for item in telemetry.intelligence.hostileEvents if item.tick >= since_tick]
    protection = telemetry.empire.protection
    military = telemetry.empire.militaryPreparation
    lines = [
        f"=== COMMANDER OPERATIONS BRIEFING — LAST {hours:g} HOURS ===", "",
        "Empire summary",
        f"{telemetry.empire.gcl.ownedRooms} colonies, GCL {telemetry.empire.gcl.level}, "
        f"{telemetry.empire.gcl.availableClaimSlots} claim slots, {telemetry.empire.creeps} creeps.",
        f"Protection {protection.status.upper()}; global/current-region claim slots "
        f"{protection.globalGclClaimSlots}/{protection.currentProtectionClaimSlots}; "
        f"claim rule {protection.rules.claimLimitType}; countdown threshold {protection.threshold}.",
        f"Military preparation: {military.spawnThroughput.spawns} spawns "
        f"({military.spawnThroughput.idle} idle), {len(military.availableCombatResources)} stored resource types; "
        f"nukers {'operational' if military.nukersOperational else 'unavailable'}; offensive authority off.",
        f"CPU {telemetry.cpu.used:.2f}/{telemetry.cpu.limit:.0f}; bucket {telemetry.cpu.bucket}.", "",
        "Current authority",
        f"Mode {telemetry.authority.mode.upper()}; scouting "
        f"{'AUTO' if telemetry.authority.execution.autoScouting else 'MANUAL' if telemetry.authority.execution.scouting else 'OFF'}; "
        f"remote maintenance {'AUTO' if telemetry.authority.execution.autoRemoteMaintenance else 'MANUAL' if telemetry.authority.execution.remoteMaintenance else 'OFF'}; "
        f"new remotes {'AUTO' if telemetry.authority.execution.autoNewRemotes else 'MANUAL' if telemetry.authority.execution.newRemotes else 'OFF'}; "
        f"colonization {'AUTO' if telemetry.authority.execution.autoColonization else 'MANUAL' if telemetry.authority.execution.colonization else 'OFF'}; "
        "remote abandonment OFF; offensive combat OFF.", "",
        "Population and energy",
    ]
    load = telemetry.empireLoad
    lines.append(
        f"Empire load: {load.get('state', 'UNKNOWN')}; growth veto "
        f"{'ON' if load.get('growthVeto') else 'OFF'}; reasons {load.get('reasons') or 'none'}."
    )
    home_load = load.get("homePopulation", {})
    spawn_load = load.get("spawnPressure", {})
    remote_load = load.get("remotePressure", {})
    lines.append(
        f"Load metrics: home {home_load.get('alive', 'unknown')}/{home_load.get('desired', 'unknown')} "
        f"({home_load.get('satisfaction', 'unknown')}%); critical roles {home_load.get('criticalAvailable', 'unknown')}/"
        f"{home_load.get('criticalDesired', 'unknown')}; spawn queue {spawn_load.get('queueDepth', 'unknown')}, "
        f"oldest home wait {spawn_load.get('oldestHomeDemandTicks', 'unknown')}; active remote demand "
        f"{remote_load.get('available', 'unknown')}/{remote_load.get('desired', 'unknown')}."
    )
    for room, colony in telemetry.colonies.items():
        lines.append(
            f"- {room}: RCL {colony.controller.rcl} ({colony.controller.progressPercent:.1f}%); "
            f"storage {colony.energy.storageEnergy:,}; "
            f"population {colony.population.state} "
            f"({colony.population.aliveTotal}/{colony.population.desiredTotal}, queued {colony.population.queuedTotal})."
        )
    lines.extend(["", "Remote performance"])
    for remote in telemetry.operations.remoteMining:
        value = economics[remote.room]["value"]
        components = value.get("components", {})
        gross = components.get("grossEnergyPer1000")
        net = components.get("estimatedNetValuePer1000")
        continuity = remote.reservation.continuity or {}
        lines.append(
            f"- {remote.room}: {remote.health}; value {value['quality']} "
            f"(confidence {value['confidence']:.2f}); gross/1k "
            f"{gross if gross is not None else 'unknown'}, estimated net/1k "
            f"{net if net is not None else 'unknown'}; reservation {remote.reservation.ticksToEnd or 0} "
            f"(lead {continuity.get('leadTicks', 'unknown')}); "
            f"stop-loss {remote.stopLoss.state}."
        )
    if telemetry.remoteDrawdownRanking:
        lines.extend(["", "Remote drawdown ranking"])
        for index, item in enumerate(telemetry.remoteDrawdownRanking, 1):
            value = economics.get(item.get("room"), {}).get("value", {})
            net = value.get("components", {}).get("estimatedNetValuePer1000")
            lines.append(
                f"{index}. {item.get('room')}: score {item.get('score')}; {item.get('health')}; "
                f"staffing deficit {item.get('staffingDeficit')}; spawn burden {item.get('spawnBurden')}; "
                f"estimated net/1k {net if net is not None else 'unknown'}; establishment failed "
                f"{item.get('establishmentFailed')}; recommendation {item.get('recommendation')}."
            )
    lines.extend(["", "Territorial intelligence"])
    lines.append(
        f"Known {len(telemetry.intelligence.knownRooms)}; unknown "
        f"{', '.join(telemetry.intelligence.unknownRooms) or 'none'}; stale "
        f"{', '.join(telemetry.intelligence.staleRooms) or 'none'}."
    )
    lines.append(
        f"Frontier: reachable {', '.join(telemetry.intelligence.reachableFrontier) or 'none'}; "
        f"blocked {', '.join(telemetry.intelligence.blockedFrontier) or 'none'}; "
        f"high-value {', '.join(telemetry.intelligence.highValueFrontier) or 'none'}."
    )
    current_set = telemetry.intelligence.candidateSets.get("CURRENTLY_REACHABLE", {})
    post_set = telemetry.intelligence.candidateSets.get("POST_PROTECTION", {})
    lines.append(
        f"Candidate sets: currently reachable remotes {', '.join(current_set.get('remoteRooms', [])) or 'none'}; "
        f"post-protection remotes {', '.join(post_set.get('remoteRooms', [])) or 'none'}."
    )
    eligible = [item for item in telemetry.remoteCandidates if item.eligible]
    if eligible:
        top = eligible[0]
        lines.append(f"Best new remote: {top.room}, score {top.score}, predicted {top.predictedEconomics.quality}.")
    lines.append("Territory graph:")
    for colony, graph in telemetry.intelligence.territoryGraph.items():
        lines.append(
            f"- {colony}: remotes {', '.join(graph.get('remotes', [])) or 'none'}; "
            f"claim candidates {', '.join(graph.get('nearbyCandidates', [])) or 'none'}; "
            f"neighboring players {', '.join(graph.get('neighboringPlayers', [])) or 'none'}; "
            f"boundary-deferred {', '.join(graph.get('protectedBoundaryRooms', [])) or 'none'}."
        )
    if telemetry.playerHistory:
        lines.append("Known players:")
        for player in telemetry.playerHistory:
            lines.append(
                f"- {player.username}: {player.currentRelationship}; owned {len(player.ownedRooms)}, "
                f"reserved {len(player.reservations)}, proximity {player.territorialProximity}, "
                f"hostile actions {player.hostileActionsObserved}."
            )
    lines.extend(["", "Military intelligence and feasibility"])
    lines.append(
        f"Capability: RCL {military.maximumRcl}, room energy capacity "
        f"{military.maximumSpawnEnergyCapacity}, {military.terminalStructures} terminals, "
        f"{military.labStructures} labs; {military.capabilityLimit}. Offensive execution remains disabled."
    )
    if not telemetry.combatAssessments:
        lines.append("- No fresh foreign-owned or currently hostile room is available for deterministic assessment.")
    for assessment in telemetry.combatAssessments:
        lines.append(
            f"- {assessment.get('target')}: {assessment.get('recommendation')}; intel confidence "
            f"{assessment.get('intelConfidence')}; force advantage {assessment.get('estimatedForceAdvantage')}; "
            f"estimated success {assessment.get('estimatedSuccess')}; execution authorized NO."
        )
    readiness = telemetry.expansionReadiness
    lines.extend(["", "Expansion planning"])
    lines.append(
        f"Colonization readiness: {readiness.status}; preferred "
        f"{readiness.recommendedRoom or 'none'}; legal slots global/current-region "
        f"{readiness.globalGclClaimSlots}/{readiness.currentProtectionClaimSlots}; recommended simultaneous "
        f"{readiness.recommendedSimultaneousColonizations}; operational limit "
        f"{readiness.operationalLimitReason or 'none'}; reasons {', '.join(readiness.reasons) or 'none'}."
    )
    candidate = next(
        (item for item in telemetry.claimCandidates if item.room == readiness.recommendedRoom),
        None,
    )
    if candidate:
        layout = candidate.layout or {}
        origin = layout.get("origin", {})
        lines.append(
            f"Preferred plan: {candidate.room} from {candidate.origin}; score {candidate.score}; role "
            f"{candidate.currentOperationalRole}; {candidate.sourceCount} sources; route "
            f"{candidate.route.get('length', 'unknown')}; layout {layout.get('name', 'none')} at "
            f"{origin.get('x', '?')},{origin.get('y', '?')}; bootstrap "
            f"{candidate.bootstrap.get('burden', 'unknown')} / "
            f"{candidate.bootstrap.get('estimatedEnergy', 'unknown')} energy; displaced remote income "
            f"{candidate.economicConversion.get('temporaryIncomeLossPer1000', 0) or 0}/1k; adjacent "
            f"remote potential {candidate.strategy.get('adjacentRemotePotential', 0)}."
        )
    if readiness.components:
        failed_components = [
            name for name, component in readiness.components.items()
            if isinstance(component, dict) and component.get("pass") is False
        ]
        lines.append(f"Failed readiness components: {', '.join(failed_components) or 'none'}.")
    lines.extend(["", "AI operations"])
    if not operations:
        lines.append("No strategic operations began in this period.")
    for operation in operations:
        lines.append(
            f"- Tick {operation['created_tick']}: {operation['action']} {operation['room']} — "
            f"{operation['outcome'] or 'in progress'}"
        )
    for establishment in telemetry.operations.remoteEstablishments:
        lines.append(
            f"- Live establishment {establishment.target}: {establishment.state}; delivered "
            f"{establishment.actualDelivered:,}; predicted "
            f"{establishment.prediction.get('quality', 'UNKNOWN')}; "
            f"failure={establishment.failureReason or 'none'}."
        )
    for colonization in telemetry.operations.colonizations:
        lines.append(
            f"- Colonization {colonization.target}: {colonization.state}; outcome "
            f"{colonization.outcome or 'pending'}; claim {colonization.claimTick or 'pending'}; "
            f"spawn {colonization.spawnOperationalTick or 'pending'}; independent spawn "
            f"{colonization.firstIndependentSpawnTick or 'pending'}; failure "
            f"{colonization.failureReason or 'none'}."
        )
    lines.extend(["", "Scouting"])
    if not telemetry.operations.scouting:
        lines.append("No scout missions are recorded.")
    for scout in telemetry.operations.scouting[-10:]:
        lines.append(
            f"- {scout.room or 'unknown'} from {scout.origin}: {scout.status}; "
            f"observed {scout.observedTick or 'pending'}; failure {scout.failureReason or 'none'}."
        )
    lines.extend(["", "Hostile activity"])
    lines.append("No hostile territorial events recorded." if not hostile_events else
                 f"{len(hostile_events)} hostile sightings were recorded; review the journal for rooms and players.")
    lines.extend(["", "Recent operating history"])
    for entry in reversed(journal[-8:]):
        lines.append(f"- Tick {entry['screeps_tick']}: {entry['title']} — {entry['narrative']}")
    cost = history.cost_summary()
    lines.extend(["", "API cost"])
    lines.append(
        f"Today ${float(cost['today'] or 0):.6f}; lifetime ${float(cost['lifetime'] or 0):.6f}; "
        f"{int(cost['advisories'] or 0)} advisories ({int(cost['reviews_today'] or 0)} today); "
        f"scheduler triggered/suppressed/coalesced "
        f"{int(cost['reviews_triggered'] or 0)}/{int(cost['reviews_suppressed'] or 0)}/"
        f"{int(cost['events_coalesced'] or 0)}."
    )
    if cost.get("estimated_daily_cost") is not None:
        lines.append(
            f"Estimated daily cost at the observed 24-hour cadence: "
            f"${float(cost['estimated_daily_cost']):.6f}; average advisory "
            f"${float(cost['average'] or 0):.6f}."
        )
    try:
        database_bytes = history.path.stat().st_size
    except OSError:
        database_bytes = 0
    lines.extend(["", "Performance and data footprint"])
    lines.append(
        f"Whole bot {telemetry.cpu.used:.2f}/{telemetry.cpu.limit:.0f} CPU; bucket {telemetry.cpu.bucket}; "
        f"observer {telemetry.observer.cpuUsed:.3f} CPU; telemetry {telemetry.observer.payloadBytes:,} bytes; "
        f"SQLite {database_bytes:,} bytes."
    )
    lines.extend(["", "Current concerns and next objectives"])
    concerns = [f"{remote.room}: {', '.join(remote.reasons)}" for remote in telemetry.operations.remoteMining if remote.reasons]
    lines.extend(f"- {item}" for item in concerns[:8])
    if not concerns:
        lines.append("- No deterministic remote alerts are active.")
    if readiness.status == "READY":
        lines.append(f"- Colony plan {readiness.recommendedRoom} is ready but remains human-gated unless AUTO authority is explicitly enabled.")
    else:
        lines.append(f"- Permanent colonization remains blocked by: {readiness.operationalLimitReason or readiness.status}.")
    lines.append("- Continue reservation/staffing continuity, map missing radius intelligence, and evaluate one major expansion at a time.")
    return "\n".join(lines)
