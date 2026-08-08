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
    lines = [
        f"=== COMMANDER OPERATIONS BRIEFING — LAST {hours:g} HOURS ===", "",
        "Empire summary",
        f"{telemetry.empire.gcl.ownedRooms} colonies, GCL {telemetry.empire.gcl.level}, "
        f"{telemetry.empire.gcl.availableClaimSlots} claim slots, {telemetry.empire.creeps} creeps.",
        f"CPU {telemetry.cpu.used:.2f}/{telemetry.cpu.limit:.0f}; bucket {telemetry.cpu.bucket}.", "",
        "Population and energy",
    ]
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
    lines.extend(["", "Territorial intelligence"])
    lines.append(
        f"Known {len(telemetry.intelligence.knownRooms)}; unknown "
        f"{', '.join(telemetry.intelligence.unknownRooms) or 'none'}; stale "
        f"{', '.join(telemetry.intelligence.staleRooms) or 'none'}."
    )
    eligible = [item for item in telemetry.remoteCandidates if item.eligible]
    if eligible:
        top = eligible[0]
        lines.append(f"Best new remote: {top.room}, score {top.score}, predicted {top.predictedEconomics.quality}.")
    readiness = telemetry.expansionReadiness
    lines.extend(["", "Expansion planning"])
    lines.append(
        f"Colonization readiness: {readiness.status}; preferred "
        f"{readiness.recommendedRoom or 'none'}; reasons {', '.join(readiness.reasons) or 'none'}."
    )
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
        f"{int(cost['advisories'] or 0)} advisories."
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
    lines.append("- Continue reservation/staffing continuity, map missing radius intelligence, and evaluate one major expansion at a time.")
    return "\n".join(lines)
