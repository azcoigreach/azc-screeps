"""Advisor orchestration, persistence, display, and safe explanation writeback."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass

from .history import HistoryStore
from .openai_client import OpenAIAdvisoryResult, OpenAIAdvisorClient
from .schemas import Advisory, Telemetry
from .transport import CommanderTransport, TransportError


SYSTEM_PROMPT = """You are the strategic advisor for an active Screeps MMO empire.

The existing AZC JavaScript bot is the deterministic execution engine for creeps,
spawning, harvesting, defense, remote mining, industry, markets, colonization, and
combat execution. You are in OBSERVE/ADVISOR mode only. Do not emit commands and do
not suggest per-tick creep micromanagement.

Current operating context:
- An established colony is being used for safe live integration testing.
- Three remote-mining rooms are expected to be operating.
- Humans retain final authority.
- The desired long-term posture is expansionist and willing to use force, not
  pacifist, but offensive action requires intelligence and favorable deterministic
  combat analysis.
- No expansion, remote-mining, market, production, colonization, or offensive-combat
  action may be taken in this phase.

Assess empire health, opportunities, expansion readiness, remote-mining health,
economic bottlenecks, missing intelligence, and what the commander should review
next. Distinguish facts present in telemetry from unknowns. Keep reasoning concise
and user-visible; never provide hidden chain-of-thought. Return only the requested
structured advisory schema."""


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

    def advise(self, telemetry: Telemetry, *, writeback: bool = True) -> AdvisoryRun:
        result = self.client.request_advisory(
            SYSTEM_PROMPT,
            telemetry.model_dump_json(by_alias=True),
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
        advisory.status.upper(),
        "",
        "Assessment:",
        advisory.strategic_assessment,
        "",
        "Priorities:",
    ]
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
        "Ready for expansion:",
        "YES" if advisory.ready_for_expansion else "NO",
        "",
        "Current concerns:",
    ])
    lines.extend(f"- {concern}" for concern in advisory.concerns)
    if not advisory.concerns:
        lines.append("None critical.")
    if advisory.questions:
        lines.extend(["", "Information needed:"])
        lines.extend(f"- {question}" for question in advisory.questions)
    usage = run.result.usage
    lines.extend([
        "",
        f"Token usage: input={usage.get('input_tokens') or 'n/a'}, output={usage.get('output_tokens') or 'n/a'}, total={usage.get('total_tokens') or 'n/a'}",
        "Estimated API cost: " + (
            f"${run.result.estimated_cost_usd:.6f}" if run.result.estimated_cost_usd is not None else "unavailable"
        ),
    ])
    if run.explanation_command_id:
        lines.append(f"Explanation writeback queued: {run.explanation_command_id}")
    return "\n".join(lines)
