from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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


if __name__ == "__main__":
    unittest.main()
