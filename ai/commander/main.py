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
        hostile_count = sum(colony.hostiles for colony in telemetry.colonies.values())
        lines.extend([
            "",
            "Empire:",
            f"Owned rooms: {telemetry.empire.ownedRooms}",
            f"Creeps: {telemetry.empire.creeps}",
            f"GCL: {telemetry.empire.gcl}",
            f"Credits: {telemetry.empire.credits:,.0f}",
            f"Remote mining rooms: {len(telemetry.operations.remoteMining)}",
            f"Hostiles: {hostile_count}",
            f"CPU: {telemetry.cpu.used:.2f}/{telemetry.cpu.limit:.0f}, bucket {telemetry.cpu.bucket}",
        ])
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
    try:
        result = service.advise(telemetry, writeback=writeback and config.write_explanation)
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


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        config = CommanderConfig.from_env()
        if args.command == "history":
            history = HistoryStore(config.database_path)
            try:
                show_history(history, max(1, args.limit))
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
