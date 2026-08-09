"""Shared automatic-execution gates while native colony recovery is active."""

from __future__ import annotations

from .schemas import RemoteMiningOperation, Telemetry


RECOVERY_LOAD_STATES = frozenset({"OVEREXTENDED", "CRITICAL"})


def load_state(telemetry: Telemetry) -> str:
    return str(telemetry.empireLoad.get("state", "HEALTHY"))


def recovery_active(telemetry: Telemetry) -> bool:
    scheduler = telemetry.empireLoad.get("schedulerRecovery") or {}
    return bool(scheduler.get("active")) or load_state(telemetry) in RECOVERY_LOAD_STATES


def growth_blocked(telemetry: Telemetry) -> bool:
    return bool(telemetry.empireLoad.get("growthVeto")) or recovery_active(telemetry)


def remote_maintenance_allowed(
    remote: RemoteMiningOperation,
    action: str,
    *,
    recovering: bool,
) -> bool:
    """Allow no paused work and only held-reservation continuity in recovery."""
    if remote.paused or remote.lifecycleState == "PAUSED":
        return False
    if not recovering:
        return True
    continuity = remote.reservation.continuity or {}
    ticks = remote.reservation.ticksToEnd
    lead = int(continuity.get("leadTicks") or 0)
    return (
        action == "ENSURE_REMOTE_RESERVATION"
        and remote.reservation.relation == "SELF"
        and ticks is not None
        and ticks > 0
        and lead > 0
        and ticks <= lead
    )
