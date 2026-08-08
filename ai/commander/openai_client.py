"""OpenAI Responses API adapter for structured strategic advisories."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .config import CommanderConfig
from .schemas import Advisory


class OpenAIAdvisorError(RuntimeError):
    pass


@dataclass(frozen=True)
class OpenAIAdvisoryResult:
    advisory: Advisory
    model: str
    response_id: str | None
    usage: dict[str, int | None]
    estimated_cost_usd: float | None


class OpenAIAdvisorClient:
    def __init__(self, config: CommanderConfig, client: Any | None = None) -> None:
        config.require_openai()
        self.config = config
        if client is None:
            try:
                from openai import OpenAI
            except ImportError as exc:
                raise OpenAIAdvisorError(
                    "The OpenAI SDK is not installed; install ai/requirements.txt"
                ) from exc
            client = OpenAI(api_key=config.openai_token, timeout=config.http_timeout_seconds)
        self.client = client

    def request_advisory(self, system_prompt: str, telemetry_json: str) -> OpenAIAdvisoryResult:
        try:
            response = self.client.responses.parse(
                model=self.config.openai_model,
                reasoning={"effort": "low"},
                input=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": telemetry_json},
                ],
                text_format=Advisory,
            )
        except Exception as exc:
            name = type(exc).__name__
            message = str(exc)
            if "model" in message.lower() and ("not found" in message.lower() or "access" in message.lower()):
                raise OpenAIAdvisorError(
                    f"Configured OpenAI model {self.config.openai_model!r} is unavailable to this account; no fallback was used"
                ) from exc
            raise OpenAIAdvisorError(f"OpenAI advisory request failed ({name}): {message}") from exc

        advisory = getattr(response, "output_parsed", None)
        if advisory is None:
            raise OpenAIAdvisorError("OpenAI response contained no parsed advisory (possible refusal or incomplete response)")
        if not isinstance(advisory, Advisory):
            advisory = Advisory.model_validate(advisory)

        usage_object = getattr(response, "usage", None)
        usage = {
            "input_tokens": getattr(usage_object, "input_tokens", None),
            "output_tokens": getattr(usage_object, "output_tokens", None),
            "total_tokens": getattr(usage_object, "total_tokens", None),
        }
        estimated_cost = self._estimate_cost(usage)
        return OpenAIAdvisoryResult(
            advisory=advisory,
            model=str(getattr(response, "model", self.config.openai_model)),
            response_id=getattr(response, "id", None),
            usage=usage,
            estimated_cost_usd=estimated_cost,
        )

    def _estimate_cost(self, usage: dict[str, int | None]) -> float | None:
        input_tokens = usage.get("input_tokens")
        output_tokens = usage.get("output_tokens")
        if input_tokens is None or output_tokens is None:
            return None
        return (
            input_tokens * self.config.openai_input_cost_per_million
            + output_tokens * self.config.openai_output_cost_per_million
        ) / 1_000_000
