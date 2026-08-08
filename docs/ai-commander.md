# AI Commander Foundation

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

Phase 1 does not connect to OpenAI and does not authorize expansion, remote mining, markets, production, colonization, or combat. Existing harvesting, spawning, defense, industry, and operations continue independently when the interface is disabled, paused, stale, malformed, or unavailable.

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

- `observe` is the default. Telemetry and status output work, but every incoming order is prevented from executing and recorded as rejected.
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

Run the local lightweight suite without installing dependencies:

```bash
node tests/ai_commander.test.js
```

Before connecting an external process on the live server:

1. Upload the feature branch to a non-production Screeps code branch.
2. Run `ai.status()` and confirm `Enabled: NO` and `Mode: OBSERVE`.
3. Confirm segments 90 and 92 contain valid JSON after activation has taken effect.
4. Enable the interface but leave it in observe mode, then submit a `NOOP`; confirm it is rejected for observe mode and normal colony ticks continue.
5. Set execute mode, submit a unique `NOOP`, and confirm a completion appears in segment 92.
6. Stop heartbeat updates for more than 500 ticks and confirm the commander transitions offline once without console spam.
7. Restore the production code branch if any unexpected CPU or segment interaction appears.

## Future extension points

Add future strategic capabilities one action at a time by extending the whitelist, defining an exact parameter validator, adding a deterministic handler, applying the relevant policy and human-override gates, and adding rejection/execution tests. Game-changing actions should create or update the existing high-level operation structures; they must not introduce per-tick creep micromanagement into this interface.
