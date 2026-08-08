from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from commander.advisor import AdvisorService, format_advisory
from commander.history import HistoryStore
from commander.openai_client import OpenAIAdvisorClient, OpenAIAdvisorError, OpenAIAdvisoryResult
from commander.schemas import Advisory, Telemetry

from helpers import config, telemetry_payload


def advisory() -> Advisory:
    return Advisory.model_validate({
        "status": "healthy",
        "phase": "RCL6 consolidation",
        "summary": "The colony is stable and supports three remote rooms.",
        "observations": ["The colony and three remotes are operational."],
        "assessment": "Measured delivery is stable while territorial intelligence remains incomplete.",
        "strategic_assessment": "The economy appears stable, but expansion intelligence is incomplete.",
        "narrative": "W1N1 is steadily consolidating RCL6 while its remote network supplies energy.",
        "colony_assessments": [{
            "room": "W1N1",
            "status": "healthy",
            "narrative": "Energy, population, and defenses are stable.",
        }],
        "remote_assessments": [{
            "room": "W1N2",
            "status": "operating",
            "narrative": "The remote is safe and delivering measured energy.",
        }],
        "territory_assessment": "Nearby intelligence is incomplete; W1N2 is the strongest known candidate.",
        "priorities": [{
            "priority": 1,
            "category": "intelligence",
            "recommendation": "Gather nearby room intelligence.",
            "reason": "No claim-candidate telemetry is available.",
        }],
        "recommended_actions": [{
            "action": "SCOUT_ROOM", "target": "W0N1", "origin": "W1N1",
            "confidence": 0.8, "evidence": ["W0N1 is unknown"],
            "reason": "Refresh adjacent intelligence.",
            "expectedOutcome": "W0N1 becomes known.", "evaluationWindowTicks": 500,
        }],
        "executable_actions": [],
        "uncertainty": ["W0N1 has not been observed."],
        "expected_outcome": "A scout should close the adjacent intelligence gap.",
        "follow_up": "Reassess expansion readiness after the scout completes.",
        "concerns": [],
        "questions": ["Which adjacent neutral rooms have two sources?"],
        "expansion_readiness": "INSUFFICIENT_INTEL",
        "expansion_execution_allowed": False,
        "execution_authorization": "ADVISOR_ONLY",
        "recommended_scouting": [{
            "room": "W0N1",
            "origin": "W1N1",
            "priority": 1,
            "reason": "This adjacent room has no current intelligence.",
        }],
        "recommended_review_ticks": 500,
        "confidence": 0.8,
        "journal_entry": "The empire held a stable RCL6 position and identified nearby intelligence as its next strategic need.",
        "journal_narrative": "The empire held a stable RCL6 position and identified nearby intelligence as its next strategic need. It will reassess after a bounded scout returns.",
    })


class FakeResponses:
    def __init__(self, response=None, error=None) -> None:
        self.response = response
        self.error = error
        self.kwargs = None

    def parse(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return self.response


class FakeOpenAI:
    def __init__(self, responses: FakeResponses) -> None:
        self.responses = responses


class FakeTransport:
    def __init__(self) -> None:
        self.calls = []

    def send_safe_command(self, action, parameters, *, reason):
        self.calls.append((action, parameters, reason))
        return SimpleNamespace(id="writeback-1")


class StaticAdvisorClient:
    def __init__(self) -> None:
        self.last_input = None

    def request_advisory(self, _system, _telemetry):
        self.last_input = json.loads(_telemetry)
        return OpenAIAdvisoryResult(
            advisory(), "gpt-5.4-nano", "resp-1",
            {"input_tokens": 1000, "output_tokens": 200, "total_tokens": 1200},
            0.00045,
        )


class OpenAIAdvisorTests(unittest.TestCase):
    def test_structured_response_model_and_cost(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cfg = config(Path(directory) / "db.sqlite")
            response = SimpleNamespace(
                output_parsed=advisory(),
                model="gpt-5.4-nano",
                id="resp-1",
                usage=SimpleNamespace(input_tokens=1000, output_tokens=200, total_tokens=1200),
            )
            responses = FakeResponses(response=response)
            client = OpenAIAdvisorClient(cfg, FakeOpenAI(responses))
            result = client.request_advisory("system", "{}")
            self.assertEqual(responses.kwargs["model"], "gpt-5.4-nano")
            self.assertIs(responses.kwargs["text_format"], Advisory)
            self.assertAlmostEqual(result.estimated_cost_usd, 0.00045)

    def test_model_unavailable_does_not_silently_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cfg = config(Path(directory) / "db.sqlite")
            client = OpenAIAdvisorClient(
                cfg, FakeOpenAI(FakeResponses(error=RuntimeError("model not found or no access")))
            )
            with self.assertRaisesRegex(OpenAIAdvisorError, "no fallback was used"):
                client.request_advisory("system", "{}")

    def test_scout_recommendations_require_exact_room_names(self) -> None:
        value = advisory().model_dump()
        value["recommended_scouting"][0]["origin"] = "W1N1 with explanation"
        with self.assertRaisesRegex(ValueError, "origin"):
            Advisory.model_validate(value)

    def test_advisor_persists_history_and_queues_only_explanation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            history = HistoryStore(Path(directory) / "db.sqlite")
            transport = FakeTransport()
            client = StaticAdvisorClient()
            service = AdvisorService(client, history, transport)
            telemetry = Telemetry.model_validate(telemetry_payload())
            run = service.advise(telemetry)
            self.assertEqual(run.explanation_command_id, "writeback-1")
            self.assertEqual(transport.calls[0][0], "SET_EXPLANATION")
            recommendations = history.recent_recommendations()
            self.assertEqual(len(recommendations), 1)
            self.assertEqual(
                Advisory.model_validate_json(recommendations[0]["advisory_json"]).summary,
                advisory().summary,
            )
            self.assertEqual(client.last_input["recentOperations"], [])
            self.assertEqual(history.recent_journal()[0]["entry_type"], "ai_review")
            output = format_advisory(run, telemetry.tick)
            self.assertIn("AI COMMANDER ADVISORY", output)
            self.assertIn(advisory().narrative, output)
            self.assertIn("INSUFFICIENT_INTEL", output)
            self.assertIn("ADVISOR_ONLY", output)
            self.assertIn("$0.000450", output)
            history.close()

    def test_automatic_action_validator_requires_mode_policy_existing_remote_and_diagnostic(self) -> None:
        value = advisory().model_dump()
        action = {
            "action": "REBALANCE_REMOTE_LOGISTICS", "target": "W1N2", "origin": None,
            "confidence": 0.9, "evidence": ["ENERGY_BACKLOG"],
            "reason": "Reduce the measured backlog.",
            "expectedOutcome": "Backlog falls while delivery continues.",
            "evaluationWindowTicks": 1000,
        }
        value["executable_actions"] = [action]
        candidate = Advisory.model_validate(value)
        payload = telemetry_payload()
        payload["operations"]["remoteMining"][0]["reasons"] = ["ENERGY_BACKLOG"]
        payload["operations"]["remoteMining"][0]["diagnostics"] = [{
            "diagnostic": "ENERGY_BACKLOG", "severity": "HIGH",
            "evidence": {"energyWaiting": 5000},
        }]
        telemetry = Telemetry.model_validate(payload)
        self.assertIsNone(AdvisorService._authorized_automatic_action(candidate, telemetry))

        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["remoteMaintenance"] = True
        payload["authority"]["execution"]["autoRemoteMaintenance"] = True
        telemetry = Telemetry.model_validate(payload)
        proposal = AdvisorService._authorized_automatic_action(candidate, telemetry)
        self.assertIsNotNone(proposal)
        self.assertEqual(proposal.action, "REBALANCE_REMOTE_LOGISTICS")

        value["executable_actions"][0]["target"] = "W9N9"
        self.assertIsNone(
            AdvisorService._authorized_automatic_action(Advisory.model_validate(value), telemetry)
        )

    def test_automatic_scout_is_deferred_while_another_scout_is_active(self) -> None:
        value = advisory().model_dump()
        value["executable_actions"] = [value["recommended_actions"][0]]
        candidate = Advisory.model_validate(value)
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["scouting"] = True
        payload["authority"]["execution"]["autoScouting"] = True
        payload["operations"]["scouting"] = [{
            "id": "ai-scout:active-1", "orderId": "active-1", "origin": "W1N1",
            "room": "W0N1", "status": "EN_ROUTE", "createdTick": 900,
            "requestedTick": 900, "observedTick": None, "completedTick": None,
            "intelLastSeenTick": None, "scoutCreep": "scou:active", "activeScouts": 1,
            "failureReason": None,
        }]
        telemetry = Telemetry.model_validate(payload)
        self.assertIsNone(AdvisorService._authorized_automatic_action(candidate, telemetry))

        payload["operations"]["scouting"][0]["status"] = "OBSERVED"
        telemetry = Telemetry.model_validate(payload)
        self.assertIsNotNone(AdvisorService._authorized_automatic_action(candidate, telemetry))

        payload["intelligence"]["protectionByRoom"]["W0N1"]["accessibility"] = "BLOCKED_BY_NOVICE_BOUNDARY"
        payload["intelligence"]["protectionByRoom"]["W0N1"]["reachableNow"] = False
        telemetry = Telemetry.model_validate(payload)
        self.assertIsNone(AdvisorService._authorized_automatic_action(candidate, telemetry))


if __name__ == "__main__":
    unittest.main()
