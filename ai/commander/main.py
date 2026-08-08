"""CLI entry point for the external AI commander."""

from __future__ import annotations

import argparse
import os
import socket
import sys
import time
import uuid
from datetime import UTC, datetime

from .advisor import AdvisorService, format_advisory
from .config import CommanderConfig
from .history import HistoryStore
from .openai_client import OpenAIAdvisorClient, OpenAIAdvisorError
from .schemas import Telemetry
from .screeps_client import ScreepsAPIClient, ScreepsAPIError
from .transport import CommanderTransport, TransportError
from .trends import TrendAnalyzer
from .remote_ops import REMOTE_ACTIONS, RemoteEconomics, remote_snapshot
from .autonomy import AutonomyController
from .report import build_report
from .review_scheduler import ReviewScheduler


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("status", help="poll and display transport/empire status")
    commands.add_parser("watch", help="continuously poll, heartbeat, and run scheduled advisories")
    advise = commands.add_parser("advise", help="request an immediate OpenAI advisory")
    advise.add_argument("--no-writeback", action="store_true", help="do not queue SET_EXPLANATION")
    commands.add_parser("request-status", help="send the safe REQUEST_STATUS command")
    commands.add_parser("noop", help="send the safe NOOP transport test command")
    explain = commands.add_parser("explain", help="send a user-visible SET_EXPLANATION command")
    explain.add_argument("text")
    history = commands.add_parser("history", help="show recent recommendations and commands")
    history.add_argument("--limit", type=int, default=10)
    journal = commands.add_parser("journal", help="show the human-readable colony journal")
    journal.add_argument("--last", type=int, default=20)
    journal.add_argument("--since-tick", type=int)
    commands.add_parser("cost", help="show cumulative OpenAI advisory cost")
    commands.add_parser("operations", help="show active and evaluated AI operations")
    commands.add_parser("remotes", help="show deterministic remote health and economics")
    commands.add_parser("intel", help="show known, stale, and unknown territorial intelligence")
    commands.add_parser("candidates", help="show remote and permanent-colony candidate rankings")
    report = commands.add_parser("report", help="show a periodic operations briefing")
    report.add_argument("--hours", type=float, default=24.0)
    authority = commands.add_parser("set-authority", help="set narrow operational authority")
    authority.add_argument("--scouting", choices=("OFF", "MANUAL", "AUTO"), required=True)
    authority.add_argument("--remotes", choices=("OFF", "MANUAL", "AUTO"), required=True)
    authority.add_argument("--new-remotes", choices=("OFF", "MANUAL", "AUTO"), default="OFF")
    authority.add_argument("--colonization", choices=("OFF", "MANUAL", "AUTO"), default="OFF")
    mode = commands.add_parser("set-mode", help="set observe or execute mode through the audited inbox")
    mode.add_argument("mode", choices=("observe", "execute"))
    scout = commands.add_parser("scout", help="queue the guarded SCOUT_ROOM action")
    scout.add_argument("room", help="room to observe, for example W38N10")
    scout.add_argument("origin", help="owned origin colony, for example W37N11")
    start_remote = commands.add_parser("start-remote", help="queue guarded START_REMOTE_MINING")
    start_remote.add_argument("target")
    start_remote.add_argument("origin")
    colonize = commands.add_parser("colonize", help="queue guarded COLONIZE_ROOM (human authority still required)")
    colonize.add_argument("target")
    colonize.add_argument("origin")
    colonize.add_argument("layout")
    colonize.add_argument("x", type=int)
    colonize.add_argument("y", type=int)
    for name, action in (
        ("reassess-remote", "REASSESS_REMOTE"),
        ("ensure-remote-reservation", "ENSURE_REMOTE_RESERVATION"),
        ("ensure-remote-infrastructure", "ENSURE_REMOTE_INFRASTRUCTURE"),
        ("rebalance-remote-logistics", "REBALANCE_REMOTE_LOGISTICS"),
    ):
        command = commands.add_parser(name, help=f"queue guarded {action}")
        command.add_argument("room")
    return root


def build_runtime(config: CommanderConfig) -> tuple[HistoryStore, CommanderTransport]:
    config.require_screeps()
    history = HistoryStore(config.database_path)
    client = ScreepsAPIClient(
        config.screeps_token,
        base_url=config.screeps_api_url,
        shard=config.screeps_shard,
        timeout=config.http_timeout_seconds,
    )
    return history, CommanderTransport(client, history, config)


def display_status(transport: CommanderTransport) -> str:
    health = transport.health
    lines = [
        "=== AI COMMANDER TRANSPORT ===",
        "",
        f"Screeps API: {'ONLINE' if health.screeps_online else 'OFFLINE'}",
        f"Shard: {transport.config.screeps_shard}",
        f"Telemetry: {'VALID' if health.telemetry_valid else 'UNAVAILABLE'}",
        f"Telemetry tick: {health.telemetry_tick if health.telemetry_tick is not None else 'n/a'}",
        f"Status tick: {health.status_tick if health.status_tick is not None else 'n/a'}",
    ]
    budget = transport.segment_write_budget()
    if budget:
        reset_epoch = budget.get("reset_epoch")
        reset_text = (
            datetime.fromtimestamp(float(reset_epoch), UTC).isoformat(timespec="seconds")
            if reset_epoch is not None else "unknown"
        )
        blocked = float(budget.get("blocked_until") or 0) > time.time()
        lines.append(
            f"Segment writes: {budget.get('remaining', 'unknown')}/{budget.get('limit', 'unknown')} remaining; "
            f"reset {reset_text}; {'BLOCKED' if blocked else 'available'}"
        )
    if health.status:
        lines.extend([
            f"Interface: {'enabled' if health.status.interface.enabled else 'disabled'} / {health.status.interface.mode}",
            f"Commander seen by Screeps: {'ONLINE' if health.status.commander.online else 'OFFLINE'}",
            f"Orders completed/rejected: {health.status.orders.completed}/{health.status.orders.rejected}",
        ])
    if health.telemetry:
        telemetry = health.telemetry
        protection = telemetry.empire.protection
        military = telemetry.empire.militaryPreparation
        hostile_count = sum(colony.defense.hostileCreeps for colony in telemetry.colonies.values())
        execution = telemetry.authority.execution
        lines.extend([
            "",
            f"Commander: {'ONLINE' if health.status and health.status.commander.online else 'OFFLINE'}",
            f"Mode: {telemetry.authority.mode.upper()}",
            "",
            "Authority:",
            f"Autonomous scouting: {'ON' if execution.autoScouting else 'OFF'}",
            f"Existing remote maintenance: {'ON' if execution.autoRemoteMaintenance else 'OFF'}",
            f"New remote establishment: {'ON' if execution.autoNewRemotes else 'OFF'}",
            f"Permanent colonization: {'ON' if execution.autoColonization else 'OFF'}",
            f"Remote abandonment: {'ON' if execution.remoteAbandonment else 'OFF / HUMAN GATED'}",
            f"Offensive combat: {'ON' if execution.offensiveCombat else 'OFF'}",
            f"Market authority: {'ON' if execution.market else 'OFF'}",
            f"Production authority: {'ON' if execution.production else 'OFF'}",
            "",
            "Empire:",
            f"Player: {telemetry.empire.player or 'UNKNOWN'}",
            f"Owned rooms: {telemetry.empire.gcl.ownedRooms}",
            f"Creeps: {telemetry.empire.creeps}",
            f"GCL: {telemetry.empire.gcl.level} ({protection.globalGclClaimSlots or telemetry.empire.gcl.availableClaimSlots} global claim slots available)",
            f"Protection: {protection.status.upper()} ({_duration(protection.remainingProtectionMs)} remaining)",
            f"Protection rules: boundary={'YES' if protection.rules.temporaryBoundary else 'NO'}, "
            f"claims={protection.rules.claimLimitType}, nukers={'allowed' if protection.rules.nukersAllowed else 'restricted'}",
            f"Current protection claim slots: {protection.currentProtectionClaimSlots}",
            f"Military preparation: {military.spawnThroughput.spawns} spawns, "
            f"{military.spawnThroughput.idle} idle, {len(military.availableCombatResources)} stored resource types; "
            f"nukers {'available' if military.nukersOperational else 'unavailable'}",
            f"Credits: {telemetry.empire.credits:,.0f}",
            f"Remote mining rooms: {len(telemetry.operations.remoteMining)}",
            f"Hostiles: {hostile_count}",
            f"CPU: {telemetry.cpu.used:.2f}/{telemetry.cpu.limit:.0f}, bucket {telemetry.cpu.bucket}",
            f"Observer: {telemetry.observer.cpuUsed:.3f} CPU, {telemetry.observer.payloadBytes:,} bytes",
        ])
        for room, colony in telemetry.colonies.items():
            lines.append(
                f"{room}: RCL{colony.controller.rcl}, storage {colony.energy.storageEnergy:,}, "
                f"population {colony.population.state} "
                f"({colony.population.aliveTotal}/{colony.population.desiredTotal or '?'}, "
                f"queued {colony.population.queuedTotal})"
            )
    if health.last_error:
        lines.extend(["", f"Last error: {health.last_error}"])
    return "\n".join(lines)


def _duration(milliseconds: int | None) -> str:
    if milliseconds is None:
        return "unknown"
    hours = max(0, milliseconds) / 3_600_000
    return f"{hours / 24:.1f} days" if hours >= 48 else f"{hours:.1f} hours"


def run_advice(
    config: CommanderConfig,
    history: HistoryStore,
    transport: CommanderTransport,
    telemetry: Telemetry,
    *,
    writeback: bool,
) -> None:
    client = OpenAIAdvisorClient(config)
    service = AdvisorService(client, history, transport)
    trends = TrendAnalyzer(history).build(telemetry)
    try:
        result = service.advise(
            telemetry,
            trends,
            writeback=writeback and config.write_explanation,
        )
    except OpenAIAdvisorError as exc:
        history.record_event("openai_call_failure", str(exc), {"model": config.openai_model})
        raise
    print(format_advisory(result, telemetry.tick))


def watch(config: CommanderConfig, history: HistoryStore, transport: CommanderTransport) -> int:
    lease_key = f"commander_watch_lease:{config.screeps_shard}"
    lease_owner = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:12]}"
    lease_ttl = max(180.0, config.poll_interval_seconds * 4)
    acquired, existing_lease = history.acquire_lease(
        lease_key, lease_owner, ttl_seconds=lease_ttl,
    )
    if not acquired:
        raise TransportError(
            "Another commander watcher owns the active SQLite lease until "
            f"{datetime.fromtimestamp(float(existing_lease['expires_at']), UTC).isoformat(timespec='seconds')}"
        )
    history.record_event(
        "commander_startup", "Commander watch loop started",
        {"shard": config.screeps_shard, "leaseOwner": lease_owner},
    )
    last_heartbeat = 0.0
    autonomy = AutonomyController(history, transport)
    scheduler = ReviewScheduler(
        history,
        min_interval_seconds=config.review_min_interval_seconds,
        max_idle_interval_seconds=config.review_max_idle_interval_seconds,
        debounce_seconds=config.review_event_debounce_seconds,
    )
    print(
        f"Watching {config.screeps_shard}; poll={config.poll_interval_seconds:.0f}s, "
        f"review=min {config.review_min_interval_seconds / 60:.0f}m/"
        f"max {config.review_max_idle_interval_seconds / 60:.0f}m/"
        f"debounce {config.review_event_debounce_seconds / 60:.0f}m"
    )
    try:
        while True:
            try:
                renewed, _ = history.acquire_lease(
                    lease_key, lease_owner, ttl_seconds=lease_ttl,
                )
                if not renewed:
                    raise TransportError("Commander watcher lost its process-ownership lease")
                health = transport.poll()
                now = time.monotonic()
                queued_order = transport.flush_queued_command()
                if queued_order is not None:
                    print(f"Deferred command sent: {queued_order.action}: {queued_order.id}")
                automatic_order = None
                if health.telemetry is not None:
                    try:
                        automatic_order = autonomy.run(health.telemetry)
                        if automatic_order:
                            print(f"Deterministic autonomy queued {automatic_order.action}: {automatic_order.id}")
                    except TransportError as exc:
                        history.record_event("autonomy_deferred", str(exc), {})
                if automatic_order is None and health.current_tick is not None and now - last_heartbeat >= config.heartbeat_interval_seconds:
                    if transport.heartbeat():
                        last_heartbeat = now
                update = transport.last_observation
                decision = scheduler.evaluate(update) if update is not None and config.openai_token else None
                if decision is not None and decision.should_review:
                    try:
                        event_names = ", ".join(event.key for event in decision.events) or "periodic fallback"
                        print(f"Strategic review due: {decision.reason}; events={event_names}")
                        run_advice(config, history, transport, update.telemetry, writeback=True)
                        scheduler.mark_success(decision.strategic_hash, reason=decision.reason)
                    except OpenAIAdvisorError as exc:
                        print(f"Advisor error: {exc}", file=sys.stderr)
                        scheduler.mark_failure(str(exc))
                elif update is not None and update.is_new:
                    print(display_status(transport))
            except ScreepsAPIError as exc:
                if not exc.transient:
                    raise
                history.record_event(
                    "watch_api_deferred", str(exc),
                    {"status": exc.status, "retryAfter": exc.retry_after},
                )
                print(f"Screeps API deferred: {exc}; watcher remains active", file=sys.stderr)
            time.sleep(config.poll_interval_seconds)
    except KeyboardInterrupt:
        history.record_event("commander_shutdown", "Commander watch loop stopped", {})
        print("\nCommander stopped; Screeps deterministic automation continues independently.")
        return 0
    finally:
        history.release_lease(lease_key, lease_owner)


def show_history(history: HistoryStore, limit: int) -> None:
    print("=== RECENT AI RECOMMENDATIONS ===")
    recommendations = history.recent_recommendations(limit)
    if not recommendations:
        print("No recommendations stored.")
    for item in recommendations:
        cost = item["estimated_cost_usd"]
        print(f"- tick {item['observation_tick']} | {item['model']} | {item['summary']}")
        print(f"  tokens={item['total_tokens'] or 'n/a'} cost={f'${cost:.6f}' if cost is not None else 'n/a'}")
    print("\n=== RECENT COMMANDS ===")
    commands = history.recent_commands(limit)
    if not commands:
        print("No commands stored.")
    for item in commands:
        print(f"- {item['command_id']} | {item['action']} | {item['state']}")


def show_journal(history: HistoryStore, limit: int, since_tick: int | None) -> None:
    print("=== AZC COLONY JOURNAL ===")
    entries = history.recent_journal(limit, since_tick)
    if not entries:
        print("No journal entries stored.")
        return
    for entry in reversed(entries):
        date = entry["created_at"][:10]
        print(f"\n{date} — Tick {entry['screeps_tick']} — {entry['title']}")
        print(entry["narrative"])
        if entry["model"]:
            print(f"Advisor: {entry['model']}")


def show_cost(history: HistoryStore, warning_threshold: float = 2.0) -> None:
    cost = history.cost_summary()
    print("=== OPENAI ADVISORY COST ===")
    print(f"\nToday:       ${float(cost['today'] or 0):.6f}")
    print(f"Last 7 days: ${float(cost['week'] or 0):.6f}")
    print(f"Lifetime:    ${float(cost['lifetime'] or 0):.6f}")
    print(f"\nAdvisories: {int(cost['advisories'] or 0)} ({int(cost['reviews_today'] or 0)} today)")
    print(f"Average advisory: ${float(cost['average'] or 0):.6f}")
    interval = cost.get("average_interval_seconds")
    print(f"Average interval (24h): {_duration_seconds(interval) if interval else 'n/a'}")
    estimated = cost.get("estimated_daily_cost")
    print(f"Estimated daily cost: {f'${float(estimated):.6f}' if estimated is not None else 'n/a'}")
    print(
        f"Scheduler: {int(cost['reviews_triggered'] or 0)} triggered, "
        f"{int(cost['reviews_suppressed'] or 0)} suppressed, "
        f"{int(cost['events_coalesced'] or 0)} events coalesced"
    )
    if float(cost["today"] or 0) >= warning_threshold:
        print(f"WARNING: today's cost has reached the ${warning_threshold:.2f} warning threshold.")


def _duration_seconds(seconds: float) -> str:
    if seconds >= 3600:
        return f"{seconds / 3600:.1f}h"
    if seconds >= 60:
        return f"{seconds / 60:.1f}m"
    return f"{seconds:.0f}s"


def show_operations(history: HistoryStore) -> None:
    print("=== AI OPERATIONS ===")
    operations = history.recent_operations()
    if not operations:
        print("No operational interventions stored.")
        return
    for operation in operations:
        state = operation["outcome"] or (
            "EVALUATING" if operation["executed_tick"] is not None else "AWAITING_EXECUTION"
        )
        print(f"\n{operation['room']} — {operation['action']} — {state}")
        print(f"  Operation: {operation['operation_id']}")
        print(f"  Trigger: {operation['trigger_text']}")
        print(f"  Evaluation tick: {operation['evaluation_tick']}")
        if operation["outcome_reason"]:
            print(f"  Result: {operation['outcome_reason']}")


def show_remotes(history: HistoryStore, telemetry: Telemetry) -> None:
    print("=== REMOTE OPERATIONS ===")
    economics = RemoteEconomics(history).build(telemetry)
    for remote in telemetry.operations.remoteMining:
        print(f"\n{remote.room}\n{remote.health}")
        print(
            f"Staffing: {remote.population.state} "
            f"({remote.population.aliveTotal}/{remote.population.desiredTotal}, "
            f"queued {remote.population.queuedTotal})"
        )
        reservation = remote.reservation
        print(
            f"Reservation: {reservation.relation} "
            f"{reservation.username or 'none'}, {reservation.ticksToEnd or 0} ticks"
        )
        print(
            f"Backlog: {remote.mining.energyWaiting:,}; containers "
            f"{remote.mining.containers} + {remote.mining.containerSites} sites; "
            f"losses {remote.losses.creepLossesTotal}"
        )
        window = economics[remote.room]["windows"]["1000"]
        if window.get("available"):
            delivery = window["grossDeliveryPer1000Ticks"]["value"]
            uptime = window["operationalUptimePercent"]["value"]
            print(f"Measured delivery / 1,000 ticks: {delivery if delivery is not None else 'unknown'}")
            print(f"Operational uptime: {uptime if uptime is not None else 'unknown'}%")
            print(f"Delivery efficiency: {window['measuredDeliveryEfficiency']}")
        else:
            print(f"Economics: {window['reason']}")
        if remote.diagnostics:
            print("Diagnostics:")
            for diagnostic in remote.diagnostics:
                print(f"- {diagnostic.diagnostic} ({diagnostic.severity})")


def show_intel(telemetry: Telemetry) -> None:
    print("=== TERRITORIAL INTELLIGENCE ===")
    print(f"Player: {telemetry.empire.player or 'UNKNOWN'}")
    print(f"Known rooms: {len(telemetry.intelligence.knownRooms)}")
    print("Unknown: " + (", ".join(telemetry.intelligence.unknownRooms) or "none"))
    print("Stale: " + (", ".join(telemetry.intelligence.staleRooms) or "none"))
    protection = telemetry.empire.protection
    military = telemetry.empire.militaryPreparation
    print(
        f"Protection: {protection.status.upper()}, {_duration(protection.remainingProtectionMs)} remaining; "
        f"claim slots global/current-region={protection.globalGclClaimSlots}/"
        f"{protection.currentProtectionClaimSlots}"
    )
    print(
        f"Protection rules: boundary={'yes' if protection.rules.temporaryBoundary else 'no'}, "
        f"claims={protection.rules.claimLimitType}, "
        f"nukers={'allowed' if protection.rules.nukersAllowed else 'restricted'}"
    )
    print(
        f"Military preparation: spawns={military.spawnThroughput.spawns}, "
        f"idle={military.spawnThroughput.idle}, queue={military.spawnThroughput.queueDepth}, "
        f"combat resources={military.availableCombatResources or 'none'}, "
        f"nukers={'available' if military.nukersOperational else 'unavailable'}"
    )
    for room in telemetry.intelligence.knownRooms:
        print(
            f"- {room.room}: {room.controller.status}; owner "
            f"{room.controller.ownerRelation}; reservation {room.controller.reservationRelation}; "
            f"intel age {room.intelAgeTicks}; accessibility {room.protection.accessibility}"
        )
    print("Scout missions:")
    if not telemetry.operations.scouting:
        print("- none")
    for mission in telemetry.operations.scouting:
        detail = f"; failure={mission.failureReason}" if mission.failureReason else ""
        if mission.status == "DEFERRED":
            detail += f"; reconsider-after={mission.deferredUntilTimestamp or 'status transition'}"
        print(
            f"- {mission.room or 'unknown'} from {mission.origin}: {mission.status}; "
            f"scout={mission.scoutCreep or 'unassigned'}; requested={mission.requestedTick}; "
            f"observed={mission.observedTick}; completed={mission.completedTick}{detail}"
        )


def show_candidates(telemetry: Telemetry) -> None:
    print("=== REMOTE CANDIDATES ===")
    if not telemetry.remoteCandidates:
        print("No fresh remote candidates are available.")
    for candidate in telemetry.remoteCandidates:
        print(
            f"- {candidate.room} from {candidate.origin or 'n/a'}: {candidate.score} "
            f"{'ELIGIBLE' if candidate.eligible else 'BLOCKED'}; "
            f"predicted {candidate.predictedEconomics.quality}; set={candidate.availabilitySet}; "
            f"factors={candidate.factors}; blockers={candidate.disqualifiers or 'none'}"
        )
    print("\n=== PERMANENT COLONY CANDIDATES ===")
    for candidate in telemetry.claimCandidates:
        print(
            f"- {candidate.room}: {candidate.score} {candidate.claimCandidateStatus}; "
            f"role={candidate.currentOperationalRole}; set={candidate.availabilitySet}; factors={candidate.factors}; "
            f"layout={candidate.layout or 'none'}; blockers={candidate.disqualifiers or 'none'}"
        )
    readiness = telemetry.expansionReadiness
    print(
        f"\nReadiness: {readiness.status}; recommended={readiness.recommendedRoom or 'none'}; "
        f"origin={readiness.origin or 'none'}; global/current-protection slots="
        f"{readiness.globalGclClaimSlots}/{readiness.currentProtectionClaimSlots}; "
        f"recommended simultaneous colonizations={readiness.recommendedSimultaneousColonizations}; "
        f"operational limit={readiness.operationalLimitReason or 'none'}; "
        f"reasons={readiness.reasons or 'none'}"
    )
def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        config = CommanderConfig.from_env()
        if args.command in {"history", "journal", "cost", "operations"}:
            history = HistoryStore(config.database_path)
            try:
                if args.command == "history":
                    show_history(history, max(1, args.limit))
                elif args.command == "journal":
                    show_journal(history, max(1, args.last), args.since_tick)
                elif args.command == "operations":
                    show_operations(history)
                else:
                    show_cost(history, config.daily_cost_warning_usd)
                return 0
            finally:
                history.close()

        history, transport = build_runtime(config)
        try:
            if args.command == "watch":
                return watch(config, history, transport)
            health = transport.poll()
            if args.command == "status":
                print(display_status(transport))
                return 0 if health.screeps_online else 1
            if args.command in {"remotes", "intel", "candidates", "report"}:
                if health.telemetry is None:
                    raise TransportError("No valid telemetry is available")
                if args.command == "remotes":
                    show_remotes(history, health.telemetry)
                elif args.command == "intel":
                    show_intel(health.telemetry)
                elif args.command == "candidates":
                    show_candidates(health.telemetry)
                else:
                    print(build_report(history, health.telemetry, max(0.1, args.hours)))
                return 0
            if health.current_tick is None:
                raise TransportError("No Phase 1 telemetry/status tick is available; activate ai-test first")
            if args.command == "advise":
                if health.telemetry is None:
                    raise TransportError("No valid telemetry is available for advisory analysis")
                run_advice(config, history, transport, health.telemetry, writeback=not args.no_writeback)
                ReviewScheduler(
                    history,
                    min_interval_seconds=config.review_min_interval_seconds,
                    max_idle_interval_seconds=config.review_max_idle_interval_seconds,
                    debounce_seconds=config.review_event_debounce_seconds,
                ).mark_success(
                    ReviewScheduler.strategic_hash(health.telemetry),
                    reason="manual CLI request", manual=True,
                )
                return 0
            if args.command == "request-status":
                order = transport.send_safe_command("REQUEST_STATUS", reason="Manual CLI status request")
            elif args.command == "noop":
                order = transport.send_safe_command("NOOP", reason="Manual CLI transport verification")
            elif args.command == "explain":
                order = transport.send_safe_command(
                    "SET_EXPLANATION", {"explanation": args.text}, reason="Manual CLI explanation"
                )
            elif args.command == "set-authority":
                order = transport.send_safe_command(
                    "SET_OPERATIONAL_AUTHORITY",
                    {"scouting": args.scouting, "remoteMaintenance": args.remotes,
                     "newRemotes": args.new_remotes, "colonization": args.colonization},
                    reason="Human operator set narrow Phase 5 authority through the CLI",
                )
            elif args.command == "set-mode":
                order = transport.send_safe_command(
                    "SET_EXECUTION_MODE", {"mode": args.mode},
                    reason="Human operator changed Phase 4 execution mode through the CLI",
                )
            elif args.command == "scout":
                order = transport.send_safe_command(
                    "SCOUT_ROOM",
                    {"room": args.room, "origin": args.origin},
                    reason=f"Manual Phase 4 intelligence request for {args.room}",
                )
            elif args.command == "start-remote":
                order = transport.send_safe_command(
                    "START_REMOTE_MINING", {"target": args.target, "origin": args.origin},
                    reason=f"Human-authorized Phase 5 remote establishment for {args.target}",
                )
            elif args.command == "colonize":
                order = transport.send_safe_command(
                    "COLONIZE_ROOM",
                    {"target": args.target, "origin": args.origin,
                     "layout": {"name": args.layout, "origin": {"x": args.x, "y": args.y}}},
                    reason=f"Human-authorized guarded colonization for {args.target}",
                )
            elif args.command in {
                "reassess-remote", "ensure-remote-reservation",
                "ensure-remote-infrastructure", "rebalance-remote-logistics",
            }:
                action = {
                    "reassess-remote": "REASSESS_REMOTE",
                    "ensure-remote-reservation": "ENSURE_REMOTE_RESERVATION",
                    "ensure-remote-infrastructure": "ENSURE_REMOTE_INFRASTRUCTURE",
                    "rebalance-remote-logistics": "REBALANCE_REMOTE_LOGISTICS",
                }[args.command]
                order = transport.send_safe_command(
                    action, {"room": args.room}, reason=f"Manual existing-remote objective for {args.room}"
                )
                baseline = remote_snapshot(health.telemetry, args.room) if health.telemetry else None
                if baseline is not None:
                    history.create_operation(
                        f"op-{order.id}", order.id, "manual operator request", args.room,
                        action, f"Manual existing-remote objective for {args.room}", None,
                        health.telemetry.tick, baseline, "remote health should improve", health.telemetry.tick + 1000,
                    )
            else:
                raise TransportError(f"Unsupported command {args.command}")
            if order is None:
                print("No optional segment write queued; it was unchanged or reserved write budget is low.")
            else:
                print(f"Queued {order.action}: {order.id}")
            return 0
        finally:
            history.close()
    except (ValueError, ScreepsAPIError, TransportError, OpenAIAdvisorError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
