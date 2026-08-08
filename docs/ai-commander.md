# AI Commander

## Purpose and architecture

The AI commander interface is a fail-safe strategic boundary around the existing AZC Screeps execution engine. The external commander may submit only explicitly whitelisted strategic orders. It cannot submit JavaScript, creep tasks, movement instructions, combat targeting, or other executable code.

```text
External commander
    |  Screeps API / Memory Segments
    v
AIInterface (transport, validation, lifecycle)
    |
    v
Explicit action handlers
    |
    v
Existing deterministic AZC systems
```

The in-game Phase 1 boundary does not authorize expansion, remote mining, markets, production, colonization, or combat. The external Python service now uses that boundary for transport and OpenAI advice, but the model remains observe/advisor only. Existing harvesting, spawning, defense, industry, and operations continue independently when the interface is disabled, paused, stale, malformed, unavailable, or when the Python process stops.

The implementation is split between:

- `definitions_ai_interface.js`: Memory initialization, segment transport, validation, order lifecycle, status acknowledgements, and console-facing diagnostics.
- `definitions_ai_observer.js`: Compact, JSON-safe strategic telemetry. It never publishes raw Screeps objects or per-creep instructions.

Each shard has its own `Memory.ai` and segment contents. Telemetry includes the current shard name so a future commander can keep shard state separate. Order IDs should be globally unique across shard and time.

## Memory schema

`Memory.ai` is initialized without replacing valid existing values:

```javascript
Memory.ai = {
    version: 1,
    enabled: false,
    paused: false,
    mode: "observe",
    policy: {
        posture: "expansionist",
        allowExpansion: false,
        allowCombat: false,
        allowMarket: false,
        allowProduction: false
    },
    commander: {
        online: false,
        lastSeenTick: null,
        lastOrderTick: null
    },
    orders: {
        pending: [],
        active: [],
        completed: [],
        rejected: [],
        seen: {}
    },
    status: {
        lastObservationTick: null,
        lastDecision: null,
        lastExplanation: null
    },
    transport: {
        lastInboxHash: null,
        lastError: null
    }
};
```

Order histories and the duplicate-ID index are capped. Large game-state snapshots remain in segments rather than normal Memory.

## Memory Segments

Segment allocation is centralized in `AI_COMMANDER_SEGMENTS`:

| Segment | Direction | Contents |
|---|---|---|
| 90 | Bot to commander | Strategic telemetry snapshot |
| 91 | Commander to bot | Heartbeat and order inbox |
| 92 | Bot to commander | Interface status, acknowledgements, and recent results |

`AIInterface.activateSegments()` requests all three every tick because Screeps segment activation applies on the following tick. Reads and writes are skipped safely when a requested segment is not available. The interface does not clear segment 91; instead it hashes the raw payload and processes a specific payload only once. The external process should replace segment 91 with a new heartbeat envelope when it has new activity.

## Inbox and heartbeat protocol

The preferred segment 91 payload is:

```json
{
  "schemaVersion": 1,
  "tick": 12345678,
  "orders": [
    {
      "schemaVersion": 1,
      "id": "shard1-ai-12345678-001",
      "createdTick": 12345678,
      "expiresTick": 12346678,
      "action": "NOOP",
      "parameters": {},
      "reason": "Transport verification"
    }
  ]
}
```

The envelope `tick` is the commander heartbeat. A valid single order object is also accepted for simple testing, with its `createdTick` serving as the heartbeat. The commander is considered stale after 500 ticks without a newer valid heartbeat. A future-dated heartbeat or order is not treated as current.

An order must have:

- `schemaVersion` equal to `1`.
- A non-empty, restricted-character `id` no longer than 128 characters.
- A whitelisted `action`.
- An object-valued `parameters` field matching the action schema exactly.
- Integer `createdTick` and `expiresTick` values, with a valid, unexpired time range.
- An optional string `reason` no longer than 1,000 characters.
- An ID not previously seen in the capped duplicate index.
- A current commander heartbeat (no more than 500 ticks old).
- An enabled, unpaused interface in `execute` mode.

Malformed JSON and malformed envelopes are ignored and reported in segment 92. Invalid orders are recorded in `Memory.ai.orders.rejected` with a concise reason. No command data is passed to `eval()`, `Function`, or a general dispatch mechanism.

## Phase 1 actions

Only the following actions are recognized:

| Action | Parameters | Effect |
|---|---|---|
| `NOOP` | `{}` | Completes without changing game state. |
| `REQUEST_STATUS` | `{}` | Requests the normal segment 92 status response. |
| `SET_EXPLANATION` | `{ "explanation": "..." }` | Stores a concise, user-visible strategic summary (maximum 2,000 characters). |

`SET_EXPLANATION` is for a short decision rationale, not hidden model chain-of-thought.

Actions such as `COLONIZE_ROOM`, `ATTACK_ROOM`, `REMOTE_MINE`, market operations, production operations, spawning, dismantling, and suicide are unsupported and rejected.

## Modes and authority

- `observe` is the default. Telemetry and status output work. `REQUEST_STATUS` and `SET_EXPLANATION` may update control-plane metadata, while `NOOP` and all future strategic actions are prevented from executing.
- `execute` allows only the three Phase 1 safe actions after all other validation checks pass.
- `paused` prevents order execution without disabling telemetry.
- `disabled` prevents order execution without making any existing bot system dependent on the interface.

Human console changes take effect directly in Memory and remain available regardless of commander state. This preserves the intended authority order: human operator, AI strategist, validator, deterministic executor. Future game-changing handlers should also consult policy flags and explicit human overrides before touching existing operation Memory.

## Telemetry protocol

Segment 90 contains a periodic schema-versioned snapshot:

```json
{
  "schemaVersion": 1,
  "tick": 12345678,
  "shard": "shard1",
  "cpu": { "limit": 100, "used": 25, "bucket": 9000 },
  "empire": { "gcl": 5, "ownedRooms": 4, "creeps": 80, "credits": 120000 },
  "colonies": {
    "E29S14": {
      "rcl": 6,
      "energyAvailable": 1800,
      "energyCapacity": 2300,
      "storageEnergy": 240000,
      "terminalEnergy": 40000,
      "spawns": 2,
      "hostiles": 0
    }
  },
  "operations": {
    "colonizations": [],
    "remoteMining": [],
    "combat": []
  },
  "alerts": []
}
```

Telemetry is attempted on the existing mid pulse. On initialization, it is retried until segment 90 is available. Hostile counts reuse the colony defense survey in Memory instead of performing another full hostile scan.

Segment 92 includes the current interface and commander state, queue counts, up to ten recent results, the latest decision and explanation, and the most recent transport error.

## Console commands

Use `help("ai")` for the in-game list.

- `ai.status()` shows enabled, paused, mode, commander freshness, order counts, the last decision, and policy gates.
- `ai.pause()` and `ai.resume()` provide an immediate human execution override.
- `ai.enable()` and `ai.disable()` control order acceptance.
- `ai.mode("observe")` and `ai.mode("execute")` select the safety mode.
- `ai.orders()` displays the current capped order histories.
- `ai.explain()` displays the latest user-visible explanation.

Enabling does not change the default `observe` mode. Entering `execute` mode still exposes only the Phase 1 safe action whitelist.

## Safety and failover

The main loop never waits for the external commander. Segment activation occurs before the existing CPU-bucket early return, while actual AI processing is isolated after deterministic colony execution. All interface processing catches transport and serialization errors. Missing segments, empty segments, malformed JSON, stale heartbeats, duplicate IDs, expired orders, invalid parameters, and unsupported actions therefore leave existing AZC systems unchanged.

Event logging is limited to state transitions, incoming command lifecycle events, malformed payload changes, and errors. An unchanged inbox payload is not reprocessed or logged each tick.

## Testing and live verification

Run both local suites before an upload:

```bash
node tests/ai_commander.test.js
PYTHONPATH=ai .venv/bin/python -m unittest discover -s ai/tests -v
```

The Python tests mock all network calls and do not require credentials. Validate
every deployable JavaScript module without uploading anything with:

```bash
python tools/screeps_deploy.py --branch ai-test --dry-run
```

## Git branches and Screeps code branches

A Git branch and a Screeps code branch are unrelated namespaces:

| Kind | Current development name | Purpose |
|---|---|---|
| Local Git branch | `feature/ai-commander-transport` | Source history and rollback checkpoints |
| Screeps code branch | `ai-test` | Inactive upload target for live integration testing |
| Screeps code branch | `default` | Untouched known-working production code |

Committing or switching a Git branch never changes the live Screeps World.
Uploading a Screeps branch also does not make it live unless activation is
explicitly requested.

## Safe deployment and rollback

The repository-native uploader reads `SCREEPS_API_TOKEN` from the root `.env`,
validates every top-level JavaScript module with `node --check`, and uploads only
those modules using their filename stem as the Screeps module name. It excludes
the AI service, credentials, Git data, documentation, tests, and other assets.
If the requested non-production Screeps branch does not exist yet, the uploader
creates it through Screeps' branch-clone endpoint with the validated modules.

List Screeps branches and identify the live branch:

```bash
python tools/screeps_branch.py list
```

Upload to the inactive test branch without activating it:

```bash
python tools/screeps_deploy.py --branch ai-test
```

After reviewing the report, intentionally switch the live World to the test
branch:

```bash
python tools/screeps_branch.py activate ai-test
```

The command prints the old and new live branches and requires confirmation.
Uploading to or overwriting `default` requires an explicit production option;
ordinary development commands cannot silently replace it.

> **Immediate rollback:** select the untouched production branch. No upload is
> involved.

```bash
python tools/screeps_branch.py activate default
```

Type `default` at the production confirmation prompt. Re-run the branch list to
verify the result. The non-interactive form for an already-authorized operator is
`python tools/screeps_branch.py activate default --production`.

## External Python commander

The Python 3.12 service under `ai/` has four boundaries:

1. `ScreepsAPIClient` owns token authentication, timeouts, bounded retry and
   rate-limit handling, branch operations, and segment I/O.
2. `CommanderTransport` validates Segments 90 and 92, correlates acknowledgements,
   and protects Segment 91 from overwriting an unacknowledged command.
3. `HistoryStore` records compact observations, command lifecycle, advisories,
   and operational events in `ai/data/commander.db` using SQLite WAL mode and
   bounded retention.
4. `AdvisorService` sends only compact validated telemetry to OpenAI, persists a
   strict structured result, and may write only a concise `SET_EXPLANATION` back
   to Screeps.

The commander uses the exact root `.env` names `SCREEPS_API_TOKEN` and
`OPENAI_API_TOKEN`. Setup and Docker instructions are in [`ai/README.md`](../ai/README.md).

Useful commands from the repository root are:

```bash
PYTHONPATH=ai .venv/bin/python -m commander.main status
PYTHONPATH=ai .venv/bin/python -m commander.main watch
PYTHONPATH=ai .venv/bin/python -m commander.main advise
PYTHONPATH=ai .venv/bin/python -m commander.main history
```

`status` reports API reachability, telemetry validity and tick, interface mode,
acknowledgement counts, and a compact empire/CPU summary. `watch` separates the
30-second telemetry polling loop from the default five-minute strategic review
interval. `advise` requests an immediate assessment; add `--no-writeback` to
prevent even the safe explanation update.

The default model is configurable as `OPENAI_MODEL=gpt-5.4-nano`. The OpenAI
Responses API result is parsed into a strict schema containing health status,
summary, strategic assessment, priorities and reasons, concerns, questions,
expansion readiness, review timing, and optional confidence. The service stores
user-visible justification only, reports token usage and estimated cost, and
does not silently choose a fallback model if the configured model is unavailable.

## Live `ai-test` procedure

Only perform these steps after the upload report confirms that `default` remains
active:

1. Activate `ai-test` with the explicit branch command above.
2. In the Screeps console run `ai.enable()`, `ai.mode("observe")`, and
   `ai.status()`.
3. Start `python -m commander.main watch` from `ai/`.
4. Confirm Segment 90 telemetry and Segment 92 status become valid.
5. Run `python -m commander.main noop` and confirm observe mode rejects execution
   without affecting normal colony behavior.
6. Run `python -m commander.main request-status` and then
   `python -m commander.main explain "Testing external commander communication"`.
7. Confirm acknowledgements in Segment 92 and inspect `ai.explain()` in the game
   console.
8. Run `python -m commander.main advise` for a real structured assessment and
   confirm its concise explanation is visible through `ai.explain()`.
9. Monitor the owned colony, its existing remote-mining rooms, CPU usage/bucket,
   spawn behavior, harvesting, and defense. Do not change remote configuration or
   enable execute mode.
10. Stop the commander with `Ctrl-C`; confirm normal deterministic automation
    continues and then use the rollback command if any unexpected behavior appears.

An empty Segment 90 before activation is expected because the production branch
does not contain the AI interface. A missing heartbeat makes the commander appear
offline but never pauses the existing bot. During a longer failover test, stop
heartbeat updates for more than 500 ticks and confirm the commander transitions
offline once without console spam.

## Future extension points

Add future strategic capabilities one action at a time by extending the whitelist, defining an exact parameter validator, adding a deterministic handler, applying the relevant policy and human-override gates, and adding rejection/execution tests. Game-changing actions should create or update the existing high-level operation structures; they must not introduce per-tick creep micromanagement into this interface.
