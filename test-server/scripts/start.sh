#!/usr/bin/env bash
# start.sh – Start the AZC-Screeps test server
# Usage: bash test-server/scripts/start.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀  Starting AZC-Screeps test server..."
cd "$SERVER_DIR"
docker compose up -d

echo ""
echo "⏳  Waiting for server to become ready (up to 60 s)..."
for i in $(seq 1 12); do
  sleep 5
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' azc-screeps-server 2>/dev/null || echo "starting")
  echo "    Health: $STATUS  (${i}/12)"
  if [ "$STATUS" = "healthy" ]; then
    echo ""
    echo "✅  Server is ready!"
    echo "    Web client  : http://localhost:21025"
    echo "    CLI port    : 21026"
    echo ""
    echo "    Next step: run  bash test-server/scripts/upload.sh  to deploy bot code."
    exit 0
  fi
done

echo ""
echo "⚠️   Server did not report healthy within 60 s."
echo "    Check logs with:  npm run server:logs"
exit 1
