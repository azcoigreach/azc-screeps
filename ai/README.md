# AZC external AI commander

This Python 3.12 service observes the live AZC Screeps empire through Memory
Segments 90 and 92, stores bounded strategic history in SQLite, maintains a
heartbeat through Segment 91, and requests structured OpenAI advisories. The
OpenAI model is an advisor only: it cannot issue expansion, mining, market,
production, colonization, or combat orders.

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
```

Alternatively, from `ai/`, omit `PYTHONPATH=ai` and run the selected module with
`python -m commander.main ...`.

`watch` polls every 30 seconds, sends a heartbeat no more often than every two
minutes, and reviews on startup, material change, or after five minutes. It does
not call OpenAI on every poll. `Ctrl-C` stops only the external commander; the
existing deterministic Screeps bot continues independently.

## Docker Compose

From `ai/`:

```bash
docker compose up -d
docker compose logs -f commander
docker compose down
```

Compose exposes no ports, uses `restart: unless-stopped`, reads the root `.env`,
and persists SQLite data in `ai/data/`.

## Tests

```bash
PYTHONPATH=ai ai/.venv/bin/python -m unittest discover -s ai/tests -v
node tests/ai_commander.test.js
```

All network interactions are mocked in the Python suite. See
[`docs/ai-commander.md`](../docs/ai-commander.md) for deployment, live test, and
rollback procedures.
