#!/usr/bin/env bash
# reset.sh – Wipe all test-server data and restart with a clean world
# Usage: bash test-server/scripts/reset.sh
#
# WARNING: This destroys ALL world data, accounts, and uploaded code.
#          Use only when you want a fresh start.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"

echo "⚠️   This will DESTROY all test-server world data."
read -rp "    Type 'yes' to confirm: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "    Aborted."
  exit 1
fi

echo ""
echo "🗑️   Stopping server and removing volume..."
cd "$SERVER_DIR"
docker compose down -v 2>/dev/null || true

echo "🧹  Removing named volume azc-screeps-test-data..."
docker volume rm azc-screeps-test-data 2>/dev/null || echo "    (volume did not exist – already clean)"

echo ""
echo "✅  Clean slate ready."
echo "    Run  bash test-server/scripts/start.sh  to start fresh."
