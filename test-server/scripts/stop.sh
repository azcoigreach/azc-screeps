#!/usr/bin/env bash
# stop.sh – Stop the AZC-Screeps test server
# Usage: bash test-server/scripts/stop.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"

echo "🛑  Stopping AZC-Screeps test server..."
cd "$SERVER_DIR"
docker compose down

echo "✅  Server stopped. World data is preserved in the Docker volume."
echo "    To wipe world data, run:  bash test-server/scripts/reset.sh"
