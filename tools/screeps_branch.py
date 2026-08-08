#!/usr/bin/env python3
"""List or intentionally activate Screeps World code branches."""

from __future__ import annotations

import argparse

try:
    from ._common import build_client, confirm, record_event, validate_branch_name
except ImportError:  # Direct execution: python tools/screeps_branch.py
    from _common import build_client, confirm, record_event, validate_branch_name


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("list", help="list branches and show the active World branch")
    activate = subparsers.add_parser("activate", help="activate an existing World branch")
    activate.add_argument("branch")
    activate.add_argument("--production", action="store_true", help="non-interactive production acknowledgement")
    activate.add_argument("--yes", action="store_true", help="skip the ordinary activation prompt")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    client = build_client()
    branches = client.list_branches()
    active = next((str(item.get("branch")) for item in branches if item.get("activeWorld") is True), None)

    if args.command == "list":
        print("Screeps code branches:")
        for item in sorted(branches, key=lambda entry: str(entry.get("branch"))):
            marker = " [ACTIVE WORLD]" if item.get("activeWorld") is True else ""
            sim = " [ACTIVE SIM]" if item.get("activeSim") is True else ""
            print(f"- {item.get('branch')}{marker}{sim}")
        print(f"\nCurrent active Screeps branch: {active or '(none)'}")
        return 0

    target = validate_branch_name(args.branch)
    names = {str(item.get("branch")) for item in branches}
    if target not in names:
        raise SystemExit(f"Screeps branch {target!r} does not exist; upload it before activation")
    if active == target:
        print(f"Screeps branch {target} is already active.")
        return 0

    print("ACTIVE SCREEPS CODE BRANCH CHANGING:")
    print(f"{active or '(none)'} -> {target}")
    if target == "default":
        if not args.production:
            confirm("Production rollback/activation requested.", "default")
    elif not args.yes:
        confirm("Live Screeps World code will change.", target)

    client.activate_branch(target)
    active_now = client.active_world_branch()
    if active_now != target:
        raise SystemExit(f"Activation request returned but active branch is {active_now!r}")
    record_event("branch_activation", f"Activated Screeps branch {target}", {"previous": active, "active": target})
    print("\nScreeps branch activated:")
    print(target)
    print("\nPrevious:")
    print(active or "(none)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
