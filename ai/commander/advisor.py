"""Advisor orchestration, persistence, rich rendering, and safe writeback."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any

from .history import HistoryStore
from .openai_client import OpenAIAdvisoryResult, OpenAIAdvisorClient
from .recovery_policy import (
    growth_blocked,
    recovery_active,
    remote_maintenance_allowed,
)
from .remote_ops import REMOTE_ACTIONS, RemoteEconomics, remote_snapshot
from .schemas import Advisory, Telemetry
from .transport import CommanderTransport, TransportError


REMOTE_ACTION_OBJECTIVES = {
    "REASSESS_REMOTE": "reassess",
    "ENSURE_REMOTE_RESERVATION": "reservation",
    "ENSURE_REMOTE_INFRASTRUCTURE": "infrastructure",
    "REBALANCE_REMOTE_LOGISTICS": "logistics",
}


SYSTEM_PROMPT = """You are the strategic commander and historian for an active Screeps MMO empire.

The existing AZC JavaScript bot is the deterministic execution engine for creep
behavior, spawning, harvesting, defense, remote mining, construction, industry,
markets, colonization, and combat feasibility. Humans retain final authority.
Your doctrine is aggressive, expansionist, and evidence-driven: pursue growth
when economic, logistical, intelligence, and security evidence supports it;
avoid both pacifist paralysis and reckless attacks.

This phase permits bounded scouting, maintenance objectives for EXISTING remote
mines, and one-at-a-time guarded START_REMOTE_MINING when separately authorized.
COLONIZE_ROOM is engineered for analysis but automatic permanent claiming remains
disabled. You may propose actions through recommended_actions and may copy only
currently authorized proposals into executable_actions. SCOUT_ROOM requires
execute mode, allowScouting, and automatic dispatch additionally requires
autoScouting. REASSESS_REMOTE, ENSURE_REMOTE_RESERVATION,
ENSURE_REMOTE_INFRASTRUCTURE, and REBALANCE_REMOTE_LOGISTICS require execute mode
and allowRemoteMaintenance; automatic dispatch additionally requires
autoRemoteMaintenance. START_REMOTE_MINING requires execute mode, autoNewRemotes,
and an eligible remoteCandidates entry with the exact target and origin. The
deterministic validator is authoritative. Stopping remotes, markets, production,
automatic claiming, arbitrary Memory, and offensive combat remain forbidden.

Game.map.getRoomStatus-derived protection telemetry is authoritative. During a
novice or respawn period, use currentState.empire.protection.rules as the
authoritative rule model. NOVICE uses claimLimitType NOVICE_THREE_ROOM.
RESPAWN uses claimLimitType NORMAL_GCL and is not capped at three permanent colonies.
Both can retain a temporary outer boundary and restrict Nukers. Treat
BLOCKED_BY_PROTECTED_BOUNDARY and REACHABLE_AFTER_PROTECTION rooms as
post-protection strategy, never as currently executable targets. Protection does
not prevent conflict with residents in the same reachable region, and controller
Safe Mode remains separate. Prioritize strong protected-region
colonies, RCL/spawn growth, reserves, defenses, reachable mapping, resident
player intelligence, and refreshed post-protection plans. A countdown threshold
or transition to normal is a major strategic reassessment event.

Choose at most one executable action per review. Never place SCOUT_ROOM in
executable_actions while currentState.operations.scouting contains a mission in
QUEUED, SPAWNING, or EN_ROUTE state. When mode is execute,
autoScouting is true, and unknownRooms or staleRooms is non-empty, place exactly
one highest-value legal SCOUT_ROOM proposal in executable_actions unless an
immediate hostile threat makes scouting unsafe. Do this even when disabled remote
maintenance needs are strategically more urgent: describe those needs, but do not
substitute an unauthorized remote action for the available scout. When automatic
remote maintenance is enabled instead, place exactly one diagnostic-matched
existing-remote action in executable_actions. When new-remote autonomy is enabled
and no establishment is active, select exactly one eligible remote candidate by
its exposed component scores, predicted economics, and strategic context. Use a
5,000-tick evaluation window for START_REMOTE_MINING and a 50-200 tick evaluation
window for routine maintenance; longer deterministic objectives may remain active.

Executable remote actions must match at least one current deterministic reason:
- REASSESS_REMOTE: STALE_INTEL or ROUTE_FAILURE only
- ENSURE_REMOTE_RESERVATION: RESERVER_SHORTAGE or RESERVATION_EXPIRING only
- ENSURE_REMOTE_INFRASTRUCTURE: NO_CONTAINER or CONTAINER_DAMAGED only
- REBALANCE_REMOTE_LOGISTICS: ENERGY_BACKLOG or HAULER_SHORTAGE only
MINER_SHORTAGE and HIGH_CREEP_LOSSES may inform priorities but do not by
themselves authorize any executable action in this phase. When another remote
has a legal, measured backlog action, prefer it over an unmatched reassessment.

Treat telemetry as authoritative domain context. In particular, structure
"allowed" counts and capability flags define what the colony can legally use at
its current RCL. A terminal energy value of null means the capability is not yet
available, not that a working terminal is empty. Use globalGclClaimSlots for the
empire-wide ceiling and currentProtectionClaimSlots for the protected-region
ceiling; the lower relevant value is authoritative for a protected-region claim.
Legal capacity is not operational readiness: staffing, spawn throughput, energy,
bootstrap cost, travel, candidate quality, defense, and existing operations may
still make recommendedSimultaneousColonizations zero. Area protection is not a
generic PvP prohibition and must never substitute for controller Safe Mode or
route accessibility.
When protection status is RESPAWN, explicitly state in strategic_assessment or
narrative that normal GCL capacity applies, include the exposed global and
protected-region available slot counts, say the empire is not under the Novice
three-colony cap, and name the operational reason limiting immediate expansion.

Player/relation fields are already classified as SELF, ALLY, NEUTRAL, HOSTILE,
or UNKNOWN. Never infer identity from the English appearance of a username.
Population expected/desired values are active AZC demand, and each role carries a
deterministic state. assignedTotal includes roles outside the current demand;
aliveTotal covers demanded roles. A queueDepth observed after spawn processing
may be zero while a role's persisted queued count records the latest demand pulse.
When currentState.empireLoad.schedulerRecovery.active is true, do not place
SCOUT_ROOM, START_REMOTE_MINING, COLONIZE_ROOM, or routine remote maintenance in
executable_actions. The only recovery-time maintenance exception is
ENSURE_REMOTE_RESERVATION for a non-paused remote that already has a SELF
reservation inside its positive continuity lead window. Never place maintenance
for a paused remote in executable_actions.
Remote health and diagnostic reasons are deterministic inputs, not LLM scores.

Keep these concepts separate:
- strategic expansion readiness: whether the empire should be preparing or ready
- new-remote execution permission: separately controlled by autoNewRemotes
- permanent colonization execution permission: disabled for automatic dispatch
- current Screeps state and cumulative counters
- historical trends calculated by Python from SQLite
- your interpretation and uncertainty

recentOperations contains deterministic before/after evaluations from the local
operation journal. Acknowledge their measured outcomes explicitly. Do not
recommend repeating a successful action unless the current matching diagnostic
still exists; distinguish a resolved backlog/hauler intervention from different
remaining miner, reservation, or loss risks.

Remote energyDeliveredTotal deltas are gross measured successful deliveries from
assigned remote creeps into the home colony. Colony storage deltas are net balance
after all income and spending; never present one as the other. Stale or missing
room intelligence should lead to a specific scouting recommendation rather than
indefinite caution.

Historical windows marked partialWindow=true cover only spanTicks, not the full
requested interval. State that actual span and do not describe a partial window
as a complete 1,000/5,000/20,000-tick history. Recommend scouts for unknown or
stale rooms. Do not recommend re-scouting a room that is currently visible with
intelAgeTicks=0 merely to obtain source geometry or other facts this telemetry
does not collect. Every recommended_scouting room and origin must contain only
an exact Screeps room name such as W38N10 or W37N11; put all explanation in reason.

Set execution_authorization to SCOUTING_ONLY only when currentState.authority.mode
is execute and only scouting is authorized. Set it to
EXISTING_REMOTE_MAINTENANCE when existing-remote maintenance is authorized. Set it
to NEW_REMOTE_ESTABLISHMENT when new-remote automatic authority is active. Use
COLONIZATION_ANALYSIS for readiness analysis without claim execution. Otherwise
set it to ADVISOR_ONLY. Automatic flags control dispatch, not whether a
human may send an otherwise allowed action.

Write rich, readable operator prose. Explain colony health, population demand,
remote health and contribution, energy direction, RCL capabilities, defenses,
GCL capacity, nearby territory, candidate scoring, uncertainty, and what you plan
to learn next. Preserve useful detail and the story of change. Return concise
user-visible reasoning, never hidden chain-of-thought. The journal_entry should
read like a dated chapter in the colony's history and cover observations,
interpretation, recommendations, uncertainty, and next intended steps.

Return only the requested strict structured advisory schema."""


@dataclass(frozen=True)
class AdvisoryRun:
    recommendation_id: str
    result: OpenAIAdvisoryResult
    explanation_command_id: str | None
    action_command_id: str | None


class AdvisorService:
    def __init__(
        self,
        client: OpenAIAdvisorClient,
        history: HistoryStore,
        transport: CommanderTransport | None = None,
    ) -> None:
        self.client = client
        self.history = history
        self.transport = transport

    def advise(
        self,
        telemetry: Telemetry,
        trends: dict[str, Any] | None = None,
        *,
        writeback: bool = True,
    ) -> AdvisoryRun:
        advisor_input = {
            "currentState": telemetry.model_dump(by_alias=True),
            "historicalTrends": trends or {
                "available": False,
                "reason": "No historical trend context was supplied",
            },
            "remoteEconomics": RemoteEconomics(self.history).build(telemetry),
            "recentOperations": self.history.recent_operations(10),
            "interpretationRules": {
                "currentStateSource": "Screeps Memory Segment 90",
                "historicalTrendSource": "Python calculations over SQLite observations",
                "aiOutputType": "interpretation and recommendation",
                "newRemoteExecutionAllowed": telemetry.authority.execution.autoNewRemotes,
                "colonizationExecutionAllowed": False,
            },
        }
        result = self.client.request_advisory(
            SYSTEM_PROMPT,
            json.dumps(advisor_input, separators=(",", ":")),
        )
        recommendation_id = f"adv-{telemetry.tick}-{uuid.uuid4().hex[:10]}"
        self.history.save_recommendation(
            recommendation_id,
            telemetry.tick,
            result.model,
            result.advisory,
            result.usage,
            result.estimated_cost_usd,
        )
        self.history.record_event(
            "openai_call_success",
            f"Stored advisory {recommendation_id}",
            {"model": result.model, "tick": telemetry.tick, "usage": result.usage},
        )

        explanation_command_id = None
        action_command_id = None
        if self.transport is not None:
            proposal = self._authorized_automatic_action(result.advisory, telemetry)
            if proposal is not None:
                parameters = {"room": proposal.target}
                if proposal.action == "SCOUT_ROOM":
                    parameters["origin"] = proposal.origin
                elif proposal.action == "START_REMOTE_MINING":
                    parameters = {"target": proposal.target, "origin": proposal.origin}
                try:
                    order = self.transport.send_safe_command(
                        proposal.action,
                        parameters,
                        reason=proposal.reason,
                    )
                    if order is None:
                        raise TransportError(f"{proposal.action} write was suppressed as unchanged")
                    action_command_id = order.id
                    if proposal.action in REMOTE_ACTIONS:
                        baseline = remote_snapshot(telemetry, proposal.target)
                        if baseline is not None:
                            self.history.create_operation(
                                f"op-{order.id}", order.id, "; ".join(proposal.evidence),
                                proposal.target, proposal.action, proposal.reason,
                                proposal.confidence, telemetry.tick, baseline,
                                proposal.expectedOutcome,
                                telemetry.tick + proposal.evaluationWindowTicks,
                            )
                    elif proposal.action == "START_REMOTE_MINING":
                        candidate = next(item for item in telemetry.remoteCandidates if item.room == proposal.target)
                        self.history.create_operation(
                            f"op-{order.id}", order.id, "; ".join(proposal.evidence),
                            proposal.target, proposal.action, proposal.reason,
                            proposal.confidence, telemetry.tick,
                            {"candidate": candidate.model_dump(), "deliveryTotal": 0, "tick": telemetry.tick},
                            proposal.expectedOutcome,
                            telemetry.tick + proposal.evaluationWindowTicks,
                        )
                except TransportError as exc:
                    self.history.record_event(
                        "automatic_action_deferred", str(exc),
                        {"action": proposal.action, "target": proposal.target},
                    )
        if writeback and self.transport is not None and action_command_id is None:
            explanation = self._explanation(result.advisory)
            try:
                order = self.transport.send_safe_command(
                    "SET_EXPLANATION",
                    {"explanation": explanation},
                    reason=f"User-visible summary from advisory {recommendation_id}",
                )
                explanation_command_id = None if order is None else order.id
            except TransportError as exc:
                self.history.record_event(
                    "explanation_writeback_deferred",
                    str(exc),
                    {"recommendation_id": recommendation_id},
                )
        return AdvisoryRun(recommendation_id, result, explanation_command_id, action_command_id)

    @staticmethod
    def _authorized_automatic_action(advisory: Advisory, telemetry: Telemetry):
        if telemetry.authority.mode != "execute":
            return None
        recovering = recovery_active(telemetry)
        owned = set(telemetry.colonies)
        remotes = {remote.room: remote for remote in telemetry.operations.remoteMining}
        unknown = set(telemetry.intelligence.unknownRooms) | set(telemetry.intelligence.staleRooms)
        scout_active = any(
            mission.status not in {"DEFERRED", "OBSERVED", "COMPLETED", "FAILED", "EXPIRED"}
            for mission in telemetry.operations.scouting
        )
        for proposal in advisory.executable_actions:
            if proposal.action == "SCOUT_ROOM":
                target_protection = telemetry.intelligence.protectionByRoom.get(proposal.target)
                if (
                    telemetry.authority.execution.scouting
                    and telemetry.authority.execution.autoScouting
                    and not recovering
                    and not scout_active
                    and proposal.target in unknown
                    and proposal.origin in owned
                    and (target_protection is None or target_protection.accessibility == "REACHABLE_NOW")
                ):
                    return proposal
                continue
            if proposal.action == "START_REMOTE_MINING":
                candidate = next(
                    (item for item in telemetry.remoteCandidates if item.room == proposal.target),
                    None,
                )
                active = [
                    item for item in telemetry.operations.remoteEstablishments
                    if item.state not in {"HEALTHY", "DEGRADED", "FAILED"}
                ]
                if (
                    telemetry.authority.execution.newRemotes
                    and telemetry.authority.execution.autoNewRemotes
                    and not growth_blocked(telemetry)
                    and candidate is not None
                    and candidate.eligible
                    and proposal.origin == candidate.origin
                    and not active
                ):
                    return proposal
                continue
            if proposal.action in REMOTE_ACTIONS:
                if not (
                    telemetry.authority.execution.remoteMaintenance
                    and telemetry.authority.execution.autoRemoteMaintenance
                    and proposal.target in remotes
                ):
                    continue
                remote = remotes[proposal.target]
                if not remote_maintenance_allowed(
                    remote, proposal.action, recovering=recovering
                ):
                    continue
                if REMOTE_ACTION_OBJECTIVES[proposal.action] in remote.objectives:
                    continue
                reasons = set(remote.reasons)
                required = {
                    "ENSURE_REMOTE_INFRASTRUCTURE": {"NO_CONTAINER", "CONTAINER_DAMAGED"},
                    "ENSURE_REMOTE_RESERVATION": {"RESERVER_SHORTAGE", "RESERVATION_EXPIRING"},
                    "REBALANCE_REMOTE_LOGISTICS": {"ENERGY_BACKLOG", "HAULER_SHORTAGE"},
                    "REASSESS_REMOTE": {"STALE_INTEL", "ROUTE_FAILURE"},
                }[proposal.action]
                if reasons & required:
                    return proposal
        return None

    @staticmethod
    def _explanation(advisory: Advisory) -> str:
        pieces = [advisory.summary.strip()]
        pieces.append(f"Expansion readiness: {advisory.expansion_readiness}.")
        if advisory.priorities:
            pieces.append(f"Top priority: {advisory.priorities[0].recommendation.strip()}")
        if advisory.concerns:
            pieces.append(f"Concern: {advisory.concerns[0].strip()}")
        return " ".join(pieces)[:2000]


def format_advisory(run: AdvisoryRun, tick: int) -> str:
    advisory = run.result.advisory
    lines = [
        "=== AI COMMANDER ADVISORY ===",
        "",
        f"Tick: {tick}",
        f"Model: {run.result.model}",
        "",
        "Empire:",
        f"{advisory.status.upper()} — {advisory.phase.upper()}",
        "",
        advisory.narrative,
        "",
        "Colonies",
    ]
    if advisory.colony_assessments:
        for colony in advisory.colony_assessments:
            lines.extend(["", colony.room, colony.status.upper(), colony.narrative])
    else:
        lines.append("No colony assessment was supplied.")

    lines.extend(["", "Remote Mining"])
    if advisory.remote_assessments:
        for remote in advisory.remote_assessments:
            lines.extend(["", remote.room, remote.status.upper(), remote.narrative])
    else:
        lines.append("No remote assessment was supplied.")

    lines.extend(["", "Territory", "", advisory.territory_assessment, "", "Priorities:"])
    if advisory.priorities:
        for item in sorted(advisory.priorities, key=lambda priority: priority.priority):
            lines.extend([
                "",
                f"{item.priority}. {item.category.upper()}",
                f"   {item.recommendation}",
                f"   Why: {item.reason}",
            ])
    else:
        lines.append("None supplied.")

    lines.extend([
        "",
        "Expansion readiness:",
        advisory.expansion_readiness,
        "",
        "Expansion execution allowed:",
        "YES" if advisory.expansion_execution_allowed else "NO",
        "",
        "Execution authorization:",
        advisory.execution_authorization,
    ])

    if advisory.recommended_scouting:
        lines.extend(["", "Recommended scouting:"])
        for scout in sorted(advisory.recommended_scouting, key=lambda item: item.priority):
            lines.append(f"- {scout.room} from {scout.origin}: {scout.reason}")

    lines.extend(["", "Current concerns:"])
    lines.extend(f"- {concern}" for concern in advisory.concerns)
    if not advisory.concerns:
        lines.append("None critical.")
    if advisory.questions:
        lines.extend(["", "Information needed:"])
        lines.extend(f"- {question}" for question in advisory.questions)

    usage = run.result.usage
    lines.extend([
        "",
        "Journal entry stored:",
        run.recommendation_id,
        "",
        f"Token usage: input={usage.get('input_tokens') or 'n/a'}, output={usage.get('output_tokens') or 'n/a'}, total={usage.get('total_tokens') or 'n/a'}",
        "Estimated API cost: " + (
            f"${run.result.estimated_cost_usd:.6f}"
            if run.result.estimated_cost_usd is not None else "unavailable"
        ),
    ])
    if run.explanation_command_id:
        lines.append(f"Explanation writeback queued: {run.explanation_command_id}")
    if run.action_command_id:
        lines.append(f"Authorized operational action queued: {run.action_command_id}")
    return "\n".join(lines)
