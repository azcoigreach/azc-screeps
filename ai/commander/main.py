"""CLI entry point for the external AI commander."""

from __future__ import annotations

import argparse
import sys
import time

from .advisor import AdvisorService, format_advisory
from .config import CommanderConfig
from .history import HistoryStore
from .openai_client import OpenAIAdvisorClient, OpenAIAdvisorError
from .schemas import Telemetry
from .screeps_client import ScreepsAPIClient, ScreepsAPIError
from .transport import CommanderTransport, TransportError
from .trends import TrendAnalyzer
from .remote_ops import REMOTE_ACTIONS, RemoteEconomics, remote_snapshot


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
    authority = commands.add_parser("set-authority", help="set narrow operational authority")
    authority.add_argument("--scouting", choices=("OFF", "MANUAL", "AUTO"), required=True)
    authority.add_argument("--remotes", choices=("OFF", "MANUAL", "AUTO"), required=True)
    mode = commands.add_parser("set-mode", help="set observe or execute mode through the audited inbox")
    mode.add_argument("mode", choices=("observe", "execute"))
    scout = commands.add_parser("scout", help="queue the guarded SCOUT_ROOM action")
    scout.add_argument("room", help="room to observe, for example W38N10")
    scout.add_argument("origin", help="owned origin colony, for example W37N11")
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
    if health.status:
        lines.extend([
            f"Interface: {'enabled' if health.status.interface.enabled else 'disabled'} / {health.status.interface.mode}",
            f"Commander seen by Screeps: {'ONLINE' if health.status.commander.online else 'OFFLINE'}",
            f"Orders completed/rejected: {health.status.orders.completed}/{health.status.orders.rejected}",
        ])
    if health.telemetry:
        telemetry = health.telemetry
        hostile_count = sum(colony.defense.hostileCreeps for colony in telemetry.colonies.values())
        lines.extend([
            "",
            "Empire:",
            f"Player: {telemetry.empire.player or 'UNKNOWN'}",
            f"Owned rooms: {telemetry.empire.gcl.ownedRooms}",
            f"Creeps: {telemetry.empire.creeps}",
            f"GCL: {telemetry.empire.gcl.level} ({telemetry.empire.gcl.availableClaimSlots} claim slots available)",
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
    history.record_event("commander_startup", "Commander watch loop started", {"shard": config.screeps_shard})
    last_heartbeat = 0.0
    last_review = 0.0
    print(f"Watching {config.screeps_shard}; poll={config.poll_interval_seconds:.0f}s, review={config.review_interval_seconds:.0f}s")
    try:
        while True:
            health = transport.poll()
            now = time.monotonic()
            if health.current_tick is not None and now - last_heartbeat >= config.heartbeat_interval_seconds:
                if transport.heartbeat():
                    last_heartbeat = now
            update = transport.last_observation
            should_review = (
                update is not None
                and update.telemetry is not None
                and (
                    last_review == 0.0
                    or (update.is_new and update.material_change)
                    or now - last_review >= config.review_interval_seconds
                )
            )
            if should_review and config.openai_token:
                try:
                    run_advice(config, history, transport, update.telemetry, writeback=True)
                    last_review = now
                except OpenAIAdvisorError as exc:
                    print(f"Advisor error: {exc}", file=sys.stderr)
                    last_review = now
            elif update is not None and update.is_new:
                print(display_status(transport))
            time.sleep(config.poll_interval_seconds)
    except KeyboardInterrupt:
        history.record_event("commander_shutdown", "Commander watch loop stopped", {})
        print("\nCommander stopped; Screeps deterministic automation continues independently.")
        return 0


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


def show_cost(history: HistoryStore) -> None:
    cost = history.cost_summary()
    print("=== OPENAI ADVISORY COST ===")
    print(f"\nToday:       ${float(cost['today'] or 0):.6f}")
    print(f"Last 7 days: ${float(cost['week'] or 0):.6f}")
    print(f"Lifetime:    ${float(cost['lifetime'] or 0):.6f}")
    print(f"\nAdvisories: {int(cost['advisories'] or 0)}")
    print(f"Average advisory: ${float(cost['average'] or 0):.6f}")


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
    for room in telemetry.intelligence.knownRooms:
        print(
            f"- {room.room}: {room.controller.status}; owner "
            f"{room.controller.ownerRelation}; reservation {room.controller.reservationRelation}; "
            f"intel age {room.intelAgeTicks}"
        )
    print("Scout missions:")
    if not telemetry.operations.scouting:
        print("- none")
    for mission in telemetry.operations.scouting:
        detail = f"; failure={mission.failureReason}" if mission.failureReason else ""
        print(
            f"- {mission.room or 'unknown'} from {mission.origin}: {mission.status}; "
            f"scout={mission.scoutCreep or 'unassigned'}; requested={mission.requestedTick}; "
            f"observed={mission.observedTick}; completed={mission.completedTick}{detail}"
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
                    show_cost(history)
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
            if args.command in {"remotes", "intel"}:
                if health.telemetry is None:
                    raise TransportError("No valid telemetry is available")
                if args.command == "remotes":
                    show_remotes(history, health.telemetry)
                else:
                    show_intel(health.telemetry)
                return 0
            if health.current_tick is None:
                raise TransportError("No Phase 1 telemetry/status tick is available; activate ai-test first")
            if args.command == "advise":
                if health.telemetry is None:
                    raise TransportError("No valid telemetry is available for advisory analysis")
                run_advice(config, history, transport, health.telemetry, writeback=not args.no_writeback)
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
                    {"scouting": args.scouting, "remoteMaintenance": args.remotes},
                    reason="Human operator set narrow Phase 4 authority through the CLI",
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
            print(f"Queued {order.action}: {order.id}")
            return 0
        finally:
            history.close()
    except (ValueError, ScreepsAPIError, TransportError, OpenAIAdvisorError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
