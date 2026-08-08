from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from commander.config import CommanderConfig, load_env_file


class ConfigTests(unittest.TestCase):
    def test_default_env_discovery_prefers_ai_directory_and_falls_back_to_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root_env = Path(directory) / "root.env"
            ai_env = Path(directory) / "ai.env"
            root_env.write_text("SCREEPS_API_TOKEN=root-value\n", encoding="utf-8")
            ai_env.write_text("SCREEPS_API_TOKEN=ai-value\n", encoding="utf-8")
            clean = {key: value for key, value in os.environ.items() if key != "SCREEPS_API_TOKEN"}
            with (
                patch("commander.config.DEFAULT_ENV_FILES", (ai_env, root_env)),
                patch.dict(os.environ, clean, clear=True),
            ):
                self.assertEqual(load_env_file(), ai_env)
                self.assertEqual(os.environ["SCREEPS_API_TOKEN"], "ai-value")

            ai_env.unlink()
            with (
                patch("commander.config.DEFAULT_ENV_FILES", (ai_env, root_env)),
                patch.dict(os.environ, clean, clear=True),
            ):
                self.assertEqual(load_env_file(), root_env)
                self.assertEqual(os.environ["SCREEPS_API_TOKEN"], "root-value")

    def test_loads_exact_token_names_from_env_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text(
                "SCREEPS_API_TOKEN=screeps-value\nOPENAI_API_TOKEN=openai-value\nOPENAI_MODEL=gpt-5.4-nano\n",
                encoding="utf-8",
            )
            clean = {
                key: value
                for key, value in os.environ.items()
                if key not in {"SCREEPS_API_TOKEN", "OPENAI_API_TOKEN", "OPENAI_API_KEY", "OPENAI_MODEL"}
            }
            with patch.dict(os.environ, clean, clear=True):
                config = CommanderConfig.from_env(env_file)
                self.assertEqual(config.screeps_token, "screeps-value")
                self.assertEqual(config.openai_token, "openai-value")
                self.assertEqual(config.openai_model, "gpt-5.4-nano")
                self.assertEqual(config.openai_timeout_seconds, 120.0)
                self.assertEqual(config.heartbeat_interval_seconds, 120.0)
                self.assertEqual(config.rate_limit_safety_seconds, 2.0)
                self.assertEqual(config.review_min_interval_seconds, 900.0)
                self.assertEqual(config.review_max_idle_interval_seconds, 3600.0)
                self.assertEqual(config.review_event_debounce_seconds, 120.0)
                self.assertEqual(config.daily_cost_warning_usd, 2.0)
                self.assertNotIn("OPENAI_API_KEY", os.environ)

    def test_environment_overrides_env_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("SCREEPS_API_TOKEN=file-value\n", encoding="utf-8")
            with patch.dict(os.environ, {"SCREEPS_API_TOKEN": "process-value"}, clear=True):
                config = CommanderConfig.from_env(env_file)
                self.assertEqual(config.screeps_token, "process-value")

    def test_rejects_rate_limit_unsafe_poll_interval(self) -> None:
        with patch.dict(os.environ, {"AI_POLL_INTERVAL_SECONDS": "5"}, clear=True):
            with self.assertRaisesRegex(ValueError, "at least 10"):
                CommanderConfig.from_env(Path("/nonexistent"))

    def test_rejects_negative_rate_limit_safety_margin(self) -> None:
        with patch.dict(os.environ, {"SCREEPS_RATE_LIMIT_SAFETY_SECONDS": "-1"}, clear=True):
            with self.assertRaisesRegex(ValueError, "cannot be negative"):
                CommanderConfig.from_env(Path("/nonexistent"))

    def test_rejects_review_cadence_that_can_restore_poll_driven_spend(self) -> None:
        with patch.dict(os.environ, {"AI_REVIEW_MIN_INTERVAL_SECONDS": "300"}, clear=True):
            with self.assertRaisesRegex(ValueError, "at least 600"):
                CommanderConfig.from_env(Path("/nonexistent"))
        with patch.dict(os.environ, {
            "AI_REVIEW_MIN_INTERVAL_SECONDS": "900",
            "AI_REVIEW_MAX_IDLE_INTERVAL_SECONDS": "600",
        }, clear=True):
            with self.assertRaisesRegex(ValueError, "at least the minimum"):
                CommanderConfig.from_env(Path("/nonexistent"))


if __name__ == "__main__":
    unittest.main()
