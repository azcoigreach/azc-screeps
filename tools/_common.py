"""Shared helpers for repository-native Screeps command-line tools."""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
AI_ROOT = REPO_ROOT / "ai"
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from commander.screeps_client import ScreepsAPIClient  # noqa: E402


BRANCH_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")
DEFAULT_ENV_FILES = (AI_ROOT / ".env", REPO_ROOT / ".env")


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


def build_client() -> ScreepsAPIClient:
    load_env_file()
    token = os.environ.get("SCREEPS_API_TOKEN", "")
    if not token:
        raise SystemExit("SCREEPS_API_TOKEN is missing or empty in the environment, ai/.env, or .env")
    return ScreepsAPIClient(
        token,
        base_url=os.environ.get("SCREEPS_API_URL", "https://screeps.com"),
        shard=os.environ.get("SCREEPS_SHARD", "shard0"),
        timeout=float(os.environ.get("SCREEPS_HTTP_TIMEOUT", "10")),
    )


def validate_branch_name(branch: str) -> str:
    if not BRANCH_PATTERN.fullmatch(branch):
        raise SystemExit("Invalid Screeps branch name; use letters, numbers, dot, underscore, or hyphen")
    return branch


def git_branch() -> str:
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() or "(detached HEAD)"


def confirm(prompt: str, expected: str) -> None:
    if not sys.stdin.isatty():
        raise SystemExit(f"Confirmation required. Re-run interactively and type {expected!r}.")
    answer = input(f"{prompt}\nType {expected!r} to continue: ").strip()
    if answer != expected:
        raise SystemExit("Cancelled; no Screeps state was changed.")


def record_event(event_type: str, message: str, details: dict | None = None) -> None:
    try:
        from commander.history import HistoryStore

        store = HistoryStore(REPO_ROOT / "ai" / "data" / "commander.db")
        store.record_event(event_type, message, details or {})
        store.close()
    except Exception:
        # Deployment must not fail because optional audit persistence is unavailable.
        return
