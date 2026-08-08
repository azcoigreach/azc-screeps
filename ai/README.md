# AZC external AI commander

This Python 3.12 service observes the live AZC Screeps empire through Memory
Segments 90 and 92, stores bounded strategic history in SQLite, maintains a
heartbeat through Segment 91, and requests structured OpenAI advisories.
Deterministic Phase 5 policy can continuously maintain existing remotes and map
territory; a separately authorized model proposal may select one prevalidated new
remote. Arbitrary state writes, automatic claiming, abandonment, markets,
production, and offensive combat remain unavailable.

The commander is protection-aware. `status`, `intel`, `candidates`, and periodic
reports distinguish global GCL slots from the current Novice/Respawn-region claim
rules, show the runtime protection countdown, keep post-protection candidates,
and report deferred scouts plus military-preparation intelligence. Temporary
boundary targets are reconsidered after `Game.map.getRoomStatus()` becomes
reachable; no remaining duration is configured manually.

Only `novice` uses the three-room regional claim limit. `respawn` retains normal
GCL claim capacity while still using protected-boundary routing and Nuker
restrictions. Controller Safe Mode remains an independent per-room field.

## Setup

From the repository root, create a virtual environment and install the pinned
dependency ranges:

```bash
python3.12 -m venv ai/.venv
ai/.venv/bin/pip install -r ai/requirements.txt
```

The commander automatically loads the repository-root `.env`. Start from
`ai/.env.example` and set these exact credential names:

```dotenv
SCREEPS_API_TOKEN=...
OPENAI_API_TOKEN=...
```

Do not rename the OpenAI token to `OPENAI_API_KEY`; the client passes
`OPENAI_API_TOKEN` explicitly to the SDK. The `.env` file, SQLite databases,
and Python caches are ignored by Git and excluded from the Docker build
context.

The default shard is `shard0`. Override `SCREEPS_SHARD` if the test colony is
on another shard. `OPENAI_MODEL`, polling, heartbeat, strategic review interval,
the separate OpenAI request timeout, database location, and cost rates are
configurable using `ai/.env.example`.

## Commands

Run commands from the repository root:

```bash
PYTHONPATH=ai ai/.venv/bin/python -m commander.main status
PYTHONPATH=ai ai/.venv/bin/python -m commander.main watch
PYTHONPATH=ai ai/.venv/bin/python -m commander.main advise
PYTHONPATH=ai ai/.venv/bin/python -m commander.main advise --no-writeback
PYTHONPATH=ai ai/.venv/bin/python -m commander.main request-status
PYTHONPATH=ai ai/.venv/bin/python -m commander.main noop
PYTHONPATH=ai ai/.venv/bin/python -m commander.main scout W38N10 W37N11
PYTHONPATH=ai ai/.venv/bin/python -m commander.main explain "Testing external commander communication"
PYTHONPATH=ai ai/.venv/bin/python -m commander.main history
PYTHONPATH=ai ai/.venv/bin/python -m commander.main journal --last 20
PYTHONPATH=ai ai/.venv/bin/python -m commander.main cost
PYTHONPATH=ai ai/.venv/bin/python -m commander.main candidates
PYTHONPATH=ai ai/.venv/bin/python -m commander.main report --hours 24
```

Alternatively, from `ai/`, omit `PYTHONPATH=ai` and run the selected module with
`python -m commander.main ...`.

`watch` polls every 30 seconds, sends a heartbeat no more often than every two
minutes, and reviews on startup, material change, or after five minutes. It does
not call OpenAI on every poll. `Ctrl-C` stops only the external commander; the
existing deterministic Screeps bot continues independently.

Memory-segment writes use a persistent quota budget shared through the SQLite
database. Server `X-RateLimit-*` headers override the conservative local
60-write/hour model. Optional explanation writebacks stop when 20 writes remain;
commands and heartbeats retain the reserve. HTTP 429 leaves critical commands
queued under their original IDs and blocks further writes until the server reset
deadline plus `SCREEPS_RATE_LIMIT_SAFETY_SECONDS` (default 2), while telemetry
polling continues. Identical Segment 91 payloads and unchanged explanations are
not posted again. Any successful command also satisfies the heartbeat cadence.

## Docker Compose

From `ai/`:

```bash
docker compose up -d
docker compose logs -f commander
docker compose down
```

Compose exposes no ports, retries fatal exits at most five times, reads the root
`.env`, and persists SQLite data in `ai/data/`. Transient Screeps API failures
are handled inside `watch` and therefore do not consume those restart attempts.

## Tests

```bash
PYTHONPATH=ai ai/.venv/bin/python -m unittest discover -s ai/tests -v
node tests/ai_commander.test.js
```

All network interactions are mocked in the Python suite. See
[`docs/ai-commander.md`](../docs/ai-commander.md) for deployment, live test, and
rollback procedures.
