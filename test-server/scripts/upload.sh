#!/usr/bin/env bash
# upload.sh – Upload the bot code from the repo root to the test server
#
# Usage:
#   bash test-server/scripts/upload.sh
#
# Environment variables (override defaults):
#   SERVER_HOST   – host of the test server  (default: localhost)
#   SERVER_PORT   – port of the test server  (default: 21025)
#   SERVER_USER   – Screeps account username (default: AzcTestBot)
#   SERVER_PASS   – Screeps account password (default: testpass)
#   BOT_BRANCH    – Code branch to upload to (default: default)
#
# The script uses the Screeps HTTP API to upload every *.js file
# from the repository root as a separate module.
# ----------------------------------------------------------------
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-localhost}"
SERVER_PORT="${SERVER_PORT:-21025}"
SERVER_USER="${SERVER_USER:-AzcTestBot}"
SERVER_PASS="${SERVER_PASS:-testpass}"
BOT_BRANCH="${BOT_BRANCH:-default}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

API_BASE="http://${SERVER_HOST}:${SERVER_PORT}/api"

# ---- helpers -------------------------------------------------------
require_cmd() { command -v "$1" &>/dev/null || { echo "❌  '$1' is required but not found."; exit 1; }; }
require_cmd curl
require_cmd python3

# ---- authenticate --------------------------------------------------
echo "🔐  Authenticating as '${SERVER_USER}' on ${SERVER_HOST}:${SERVER_PORT}..."
AUTH_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/signin" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${SERVER_USER}\",\"password\":\"${SERVER_PASS}\"}")

TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('token', ''))
except json.JSONDecodeError as e:
    print('', file=sys.stderr)  # non-JSON response – token stays empty
    sys.exit(0)
" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "❌  Authentication failed. Check SERVER_USER / SERVER_PASS and that the server is running."
  echo "    Response: ${AUTH_RESPONSE}"
  exit 1
fi
echo "    ✅  Got auth token."

# ---- collect modules -----------------------------------------------
echo ""
echo "📦  Collecting *.js modules from repo root..."
JS_FILES=()
while IFS= read -r -d '' f; do
  JS_FILES+=("$f")
done < <(find "$REPO_ROOT" -maxdepth 1 -name "*.js" -print0 | sort -z)

echo "    Found ${#JS_FILES[@]} modules."

# ---- build JSON payload --------------------------------------------
MODULES_JSON="{"
FIRST=1
for FILE_PATH in "${JS_FILES[@]}"; do
  MODULE_NAME=$(basename "$FILE_PATH" .js)
  # Escape file content as a JSON string using Python
  ESCAPED=$(python3 -c "
import sys, json
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    print(json.dumps(f.read()), end='')
" "$FILE_PATH")
  if [ "$FIRST" = "1" ]; then
    FIRST=0
  else
    MODULES_JSON+=","
  fi
  MODULES_JSON+="\"${MODULE_NAME}\":${ESCAPED}"
done
MODULES_JSON+="}"

# ---- upload --------------------------------------------------------
echo ""
echo "⬆️   Uploading to branch '${BOT_BRANCH}'..."
UPLOAD_RESPONSE=$(curl -s -X POST "${API_BASE}/user/code" \
  -H "Content-Type: application/json" \
  -H "X-Token: ${TOKEN}" \
  -H "X-Username: ${SERVER_USER}" \
  -d "{\"branch\":\"${BOT_BRANCH}\",\"modules\":${MODULES_JSON}}")

OK=$(echo "$UPLOAD_RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('ok', '0'))
except json.JSONDecodeError:
    print('parse_error', file=sys.stderr)
    print('0')
" 2>/dev/null || echo "parse_error")
if [ "$OK" = "1" ]; then
  echo "✅  Upload successful! ${#JS_FILES[@]} modules deployed to '${BOT_BRANCH}'."
elif [ "$OK" = "parse_error" ]; then
  echo "❌  Upload failed: server returned a non-JSON response."
  echo "    Response: ${UPLOAD_RESPONSE}"
  exit 1
else
  echo "❌  Upload failed."
  echo "    Response: ${UPLOAD_RESPONSE}"
  exit 1
fi
