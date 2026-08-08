"""Advisor orchestration, persistence, rich rendering, and safe writeback."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any

from .history import HistoryStore
from .openai_client import OpenAIAdvisoryResult, OpenAIAdvisorClient
from .schemas import Advisory, Telemetry
from .transport import CommanderTransport, TransportError


SYSTEM_PROMPT = """You are the strategic commander and historian for an active Screeps MMO empire.

The existing AZC JavaScript bot is the deterministic execution engine for creep
behavior, spawning, harvesting, defense, remote mining, construction, industry,
markets, colonization, and combat feasibility. Humans retain final authority.
Your doctrine is aggressive, expansionist, and evidence-driven: pursue growth
when economic, logistical, intelligence, and security evidence supports it;
avoid both pacifist paralysis and reckless attacks.

This phase authorizes analysis and recommendations. The only possible real-world
strategic action is SCOUT_ROOM, and even that requires execute mode plus an
explicit in-game allowScouting policy. Do not emit commands. You may recommend
scouting using the structured recommended_scouting field. Expansion, remote-
mining changes, markets, production, claiming, reserving, and offensive combat
remain execution-forbidden.

Treat telemetry as authoritative domain context. In particular, structure
"allowed" counts and capability flags define what the colony can legally use at
its current RCL. A terminal energy value of null means the capability is not yet
available, not that a working terminal is empty. GCL availableClaimSlots is the
authoritative legal claim capacity.

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
        if writeback and self.transport is not None:
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
        return AdvisoryRun(recommendation_id, result, explanation_command_id)

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
    return "\n".join(lines)
