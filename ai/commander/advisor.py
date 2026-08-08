"""Advisor orchestration, persistence, rich rendering, and safe writeback."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any

from .history import HistoryStore
from .openai_client import OpenAIAdvisoryResult, OpenAIAdvisorClient
from .remote_ops import REMOTE_ACTIONS, RemoteEconomics, remote_snapshot
from .schemas import Advisory, Telemetry
from .transport import CommanderTransport, TransportError


SYSTEM_PROMPT = """You are the strategic commander and historian for an active Screeps MMO empire.

The existing AZC JavaScript bot is the deterministic execution engine for creep
behavior, spawning, harvesting, defense, remote mining, construction, industry,
markets, colonization, and combat feasibility. Humans retain final authority.
Your doctrine is aggressive, expansionist, and evidence-driven: pursue growth
when economic, logistical, intelligence, and security evidence supports it;
avoid both pacifist paralysis and reckless attacks.

This phase permits only bounded scouting and maintenance objectives for EXISTING
remote mines. You may propose actions through recommended_actions and may copy
only currently authorized proposals into executable_actions. SCOUT_ROOM requires
execute mode, allowScouting, and automatic dispatch additionally requires
autoScouting. REASSESS_REMOTE, ENSURE_REMOTE_RESERVATION,
ENSURE_REMOTE_INFRASTRUCTURE, and REBALANCE_REMOTE_LOGISTICS require execute mode
and allowRemoteMaintenance; automatic dispatch additionally requires
autoRemoteMaintenance. The deterministic validator is authoritative. Starting or
stopping remotes, expansion, markets, production, claiming, arbitrary Memory,
and offensive combat remain forbidden.

Treat telemetry as authoritative domain context. In particular, structure
"allowed" counts and capability flags define what the colony can legally use at
its current RCL. A terminal energy value of null means the capability is not yet
available, not that a working terminal is empty. GCL availableClaimSlots is the
authoritative legal claim capacity.

Player/relation fields are already classified as SELF, ALLY, NEUTRAL, HOSTILE,
or UNKNOWN. Never infer identity from the English appearance of a username.
Population expected/desired values are active AZC demand, and each role carries a
deterministic state. assignedTotal includes roles outside the current demand;
aliveTotal covers demanded roles. A queueDepth observed after spawn processing
may be zero while a role's persisted queued count records the latest demand pulse.
Remote health and diagnostic reasons are deterministic inputs, not LLM scores.

Keep these concepts separate:
- strategic expansion readiness: whether the empire should be preparing or ready
- expansion execution permission: always false in this phase
- current Screeps state and cumulative counters
- historical trends calculated by Python from SQLite
- your interpretation and uncertainty

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
EXISTING_REMOTE_MAINTENANCE when existing-remote maintenance is authorized.
Otherwise set it to ADVISOR_ONLY. Automatic flags control dispatch, not whether a
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
            "interpretationRules": {
                "currentStateSource": "Screeps Memory Segment 90",
                "historicalTrendSource": "Python calculations over SQLite observations",
                "aiOutputType": "interpretation and recommendation",
                "expansionExecutionAllowed": False,
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
                try:
                    order = self.transport.send_safe_command(
                        proposal.action,
                        parameters,
                        reason=proposal.reason,
                    )
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
                explanation_command_id = order.id
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
        owned = set(telemetry.colonies)
        remotes = {remote.room: remote for remote in telemetry.operations.remoteMining}
        unknown = set(telemetry.intelligence.unknownRooms) | set(telemetry.intelligence.staleRooms)
        for proposal in advisory.executable_actions:
            if proposal.action == "SCOUT_ROOM":
                if (
                    telemetry.authority.execution.scouting
                    and telemetry.authority.execution.autoScouting
                    and proposal.target in unknown
                    and proposal.origin in owned
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
