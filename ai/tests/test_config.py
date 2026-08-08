from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from commander.config import CommanderConfig


class ConfigTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
