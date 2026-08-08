#!/usr/bin/env python3
"""Validate and upload top-level Screeps JavaScript modules safely."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

try:
    from ._common import REPO_ROOT, build_client, confirm, git_branch, record_event, validate_branch_name
except ImportError:  # Direct execution: python tools/screeps_deploy.py
    from _common import REPO_ROOT, build_client, confirm, git_branch, record_event, validate_branch_name


def collect_modules(root: Path = REPO_ROOT) -> dict[str, str]:
    modules: dict[str, str] = {}
    for path in sorted(root.glob("*.js")):
        if not path.is_file():
            continue
        modules[path.stem] = path.read_text(encoding="utf-8")
    if "main" not in modules:
        raise SystemExit("Deployment aborted: main.js was not found")
    return modules


def validate_modules(root: Path, modules: dict[str, str]) -> None:
    failures: list[str] = []
    for module_name in sorted(modules):
        path = root / f"{module_name}.js"
        result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
        if result.returncode != 0:
            failures.append(f"{path.name}: {result.stderr.strip()}")
    if failures:
        detail = "\n\n".join(failures)
        raise SystemExit(f"JavaScript validation failed; nothing was uploaded.\n\n{detail}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--branch", default="ai-test", help="Screeps code branch to upload")
    parser.add_argument("--activate", action="store_true", help="activate the branch after upload")
    parser.add_argument("--production", action="store_true", help="explicitly authorize targeting default")
    parser.add_argument("--yes", action="store_true", help="skip interactive production confirmation")
    parser.add_argument("--dry-run", action="store_true", help="validate and report without network writes")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    branch = validate_branch_name(args.branch)
    if branch == "default" and not args.production:
        raise SystemExit("Refusing to overwrite production branch 'default' without --production")
    if branch == "default" and not args.yes:
        confirm("PRODUCTION SCREEPS CODE WILL BE OVERWRITTEN.", "default")

    modules = collect_modules()
    validate_modules(REPO_ROOT, modules)
    local_branch = git_branch()

    if args.dry_run:
        print("Screeps deployment dry run complete")
        print(f"\nLocal Git branch:\n{local_branch}")
        print(f"\nScreeps code branch:\n{branch}")
        print(f"\nModules validated:\n{len(modules)}")
        print("\nUploaded:\nNO")
        print("\nActivated:\nNO")
        return 0

    client = build_client()
    previous = client.active_world_branch()
    client.upload_code(branch, modules)
    branches_after_upload = client.list_branches()
    branch_names = {str(item.get("branch")) for item in branches_after_upload}
    if branch not in branch_names:
        raise SystemExit(f"Upload response succeeded but Screeps branch {branch!r} was not listed afterward")
    active_after_upload = next(
        (str(item.get("branch")) for item in branches_after_upload if item.get("activeWorld") is True),
        None,
    )
    if not args.activate and active_after_upload != previous:
        raise SystemExit(
            f"Safety check failed: active branch changed unexpectedly from {previous!r} to {active_after_upload!r}"
        )

    activated = False
    if args.activate:
        print("\nACTIVE SCREEPS CODE BRANCH CHANGING:")
        print(f"{previous or '(none)'} -> {branch}")
        client.activate_branch(branch)
        active_now = client.active_world_branch()
        if active_now != branch:
            raise SystemExit(f"Activation request returned but active branch is {active_now!r}")
        activated = True

    record_event(
        "branch_deployment",
        f"Uploaded {len(modules)} modules to {branch}",
        {"git_branch": local_branch, "screeps_branch": branch, "activated": activated},
    )
    if activated:
        record_event(
            "branch_activation",
            f"Activated Screeps branch {branch}",
            {"previous": previous, "active": branch},
        )

    print("\nScreeps deployment complete")
    print(f"\nLocal Git branch:\n{local_branch}")
    print(f"\nScreeps code branch:\n{branch}")
    print(f"\nModules uploaded:\n{len(modules)}")
    print(f"\nActivated:\n{'YES' if activated else 'NO'}")
    print(f"\nCurrent active Screeps branch:\n{branch if activated else active_after_upload or '(none)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
