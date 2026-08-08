from __future__ import annotations

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
        "summary": "The colony is stable and supports three remote rooms.",
        "strategic_assessment": "The economy appears stable, but expansion intelligence is incomplete.",
        "priorities": [{
            "priority": 1,
            "category": "intelligence",
            "recommendation": "Gather nearby room intelligence.",
            "reason": "No claim-candidate telemetry is available.",
        }],
        "concerns": [],
        "questions": ["Which adjacent neutral rooms have two sources?"],
        "ready_for_expansion": False,
        "recommended_review_ticks": 500,
        "confidence": 0.8,
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
    def request_advisory(self, _system, _telemetry):
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

    def test_advisor_persists_history_and_queues_only_explanation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            history = HistoryStore(Path(directory) / "db.sqlite")
            transport = FakeTransport()
            service = AdvisorService(StaticAdvisorClient(), history, transport)
            telemetry = Telemetry.model_validate(telemetry_payload())
            run = service.advise(telemetry)
            self.assertEqual(run.explanation_command_id, "writeback-1")
            self.assertEqual(transport.calls[0][0], "SET_EXPLANATION")
            self.assertEqual(len(history.recent_recommendations()), 1)
            output = format_advisory(run, telemetry.tick)
            self.assertIn("AI COMMANDER ADVISORY", output)
            self.assertIn("$0.000450", output)
            history.close()


if __name__ == "__main__":
    unittest.main()
