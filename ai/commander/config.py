"""Configuration and minimal .env loading for the commander."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILES = (REPO_ROOT / "ai" / ".env", REPO_ROOT / ".env")


def load_env_file(path: Path | None = None) -> Path | None:
    candidates = (path,) if path is not None else DEFAULT_ENV_FILES
    env_path = next((candidate for candidate in candidates if candidate.exists()), None)
    if env_path is None:
        return None
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
    return env_path


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError as exc:
        raise ValueError(f"{name} must be numeric") from exc


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc


def _bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be true or false")


@dataclass(frozen=True)
class CommanderConfig:
    screeps_token: str
    openai_token: str
    screeps_api_url: str
    screeps_shard: str
    openai_model: str
    database_path: Path
    poll_interval_seconds: float
    heartbeat_interval_seconds: float
    review_interval_seconds: float
    http_timeout_seconds: float
    openai_timeout_seconds: float
    command_expiry_ticks: int
    rate_limit_safety_seconds: float
    write_explanation: bool
    auto_scout: bool
    openai_input_cost_per_million: float
    openai_output_cost_per_million: float

    @classmethod
    def from_env(cls, env_file: Path | None = None) -> "CommanderConfig":
        load_env_file(env_file)
        database_value = os.environ.get("AI_DATABASE_PATH", "ai/data/commander.db")
        database_path = Path(database_value)
        if not database_path.is_absolute():
            database_path = REPO_ROOT / database_path
        config = cls(
            screeps_token=os.environ.get("SCREEPS_API_TOKEN", ""),
            openai_token=os.environ.get("OPENAI_API_TOKEN", ""),
            screeps_api_url=os.environ.get("SCREEPS_API_URL", "https://screeps.com").rstrip("/"),
            screeps_shard=os.environ.get("SCREEPS_SHARD", "shard0"),
            openai_model=os.environ.get("OPENAI_MODEL", "gpt-5.4-nano"),
            database_path=database_path,
            poll_interval_seconds=_float("AI_POLL_INTERVAL_SECONDS", 30.0),
            heartbeat_interval_seconds=_float("AI_HEARTBEAT_INTERVAL_SECONDS", 120.0),
            review_interval_seconds=_float("AI_REVIEW_INTERVAL_SECONDS", 300.0),
            http_timeout_seconds=_float("SCREEPS_HTTP_TIMEOUT", 10.0),
            openai_timeout_seconds=_float("OPENAI_TIMEOUT_SECONDS", 120.0),
            command_expiry_ticks=_int("AI_COMMAND_EXPIRY_TICKS", 1000),
            rate_limit_safety_seconds=_float("SCREEPS_RATE_LIMIT_SAFETY_SECONDS", 2.0),
            write_explanation=_bool("AI_WRITE_EXPLANATION", True),
            auto_scout=_bool("AI_AUTO_SCOUT", False),
            openai_input_cost_per_million=_float("OPENAI_INPUT_COST_PER_MILLION", 0.20),
            openai_output_cost_per_million=_float("OPENAI_OUTPUT_COST_PER_MILLION", 1.25),
        )
        if config.poll_interval_seconds < 10:
            raise ValueError("AI_POLL_INTERVAL_SECONDS must be at least 10 to respect Screeps rate limits")
        if config.heartbeat_interval_seconds < 60:
            raise ValueError("AI_HEARTBEAT_INTERVAL_SECONDS must be at least 60")
        if config.review_interval_seconds < 60:
            raise ValueError("AI_REVIEW_INTERVAL_SECONDS must be at least 60")
        if config.openai_timeout_seconds <= 0:
            raise ValueError("OPENAI_TIMEOUT_SECONDS must be positive")
        if config.rate_limit_safety_seconds < 0:
            raise ValueError("SCREEPS_RATE_LIMIT_SAFETY_SECONDS cannot be negative")
        return config

    def require_screeps(self) -> None:
        if not self.screeps_token:
            raise ValueError("SCREEPS_API_TOKEN is missing or empty")

    def require_openai(self) -> None:
        if not self.openai_token:
            raise ValueError("OPENAI_API_TOKEN is missing or empty")
