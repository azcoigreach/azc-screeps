from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools import _common
from tools.screeps_deploy import collect_modules, main, validate_modules


class DeployTests(unittest.TestCase):
    def test_collects_only_top_level_javascript_modules(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "main.js").write_text("module.exports.loop=function(){};", encoding="utf-8")
            (root / "helper.js").write_text("global.helper={};", encoding="utf-8")
            (root / ".env").write_text("SECRET=value", encoding="utf-8")
            (root / "tests").mkdir()
            (root / "tests" / "ignored.js").write_text("bad", encoding="utf-8")
            modules = collect_modules(root)
            self.assertEqual(set(modules), {"main", "helper"})
            self.assertNotIn("SECRET", "".join(modules.values()))

    def test_validation_failure_aborts_before_upload(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "main.js").write_text("let broken = ;", encoding="utf-8")
            with self.assertRaisesRegex(SystemExit, "nothing was uploaded"):
                validate_modules(root, {"main": "let broken = ;"})

    def test_production_upload_requires_explicit_flag_before_network(self) -> None:
        with patch("sys.argv", ["screeps_deploy.py", "--branch", "default"]), \
             patch("tools.screeps_deploy.build_client") as build_client:
            with self.assertRaisesRegex(SystemExit, "Refusing to overwrite production"):
                main()
        build_client.assert_not_called()

    def test_tools_prefer_ai_environment_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            ai_env = root / "ai.env"
            root_env = root / "root.env"
            ai_env.write_text("SCREEPS_API_TOKEN=ai-value\n", encoding="utf-8")
            root_env.write_text("SCREEPS_API_TOKEN=root-value\n", encoding="utf-8")
            with patch.object(_common, "DEFAULT_ENV_FILES", (ai_env, root_env)), \
                 patch.dict("os.environ", {}, clear=True):
                loaded = _common.load_env_file()
                self.assertEqual(loaded, ai_env)
                self.assertEqual(os.environ["SCREEPS_API_TOKEN"], "ai-value")


if __name__ == "__main__":
    unittest.main()
