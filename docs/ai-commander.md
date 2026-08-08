# AI Commander

## Purpose and authority

The AI commander is a fail-safe strategic layer around the existing deterministic
AZC Screeps engine. AZC remains responsible for creep behavior, spawning,
harvesting, defense, remote mining, construction, industry, and combat
feasibility. The external Python service observes the empire, keeps long-term
history, requests structured OpenAI analysis, and writes a readable explanation
back through the narrow Memory Segment interface.

Phase 3 adds one real action: `SCOUT_ROOM`. It creates a one-shot mission in the
existing AZC scout system. It cannot claim, reserve, harvest, attack, dismantle,
or create a remote mine. Colonization, remote-mining changes, market actions,
production changes, and offensive combat remain unsupported.

```text
Screeps current state + cumulative counters (Segment 90)
                         |
                         v
Python validation -> SQLite observations -> deterministic trend calculations
                         |
                         v
OpenAI structured interpretation -> journal + optional explanation writeback
                         |
                         v
SCOUT_ROOM only when human policy, execute mode, and every safety gate allow it
```

These data sources must remain distinct:

- Current state and cumulative counters are measured by Screeps.
- Historical deltas and rates are calculated by Python from SQLite snapshots.
- Strategic interpretation, prose, and recommendations are AI output.

Gross measured remote delivery is not the same as net colony storage change.
The former counts successful remote-assigned creep transfers into the home room;
the latter includes all colony income and spending.

## Memory and segment boundaries

`Memory.ai` preserves valid existing values and defaults to disabled, unpaused,
and observe mode. Important Phase 3 defaults are:

```javascript
Memory.ai.policy = {
    posture: "expansionist",
    allowExpansion: false,
    allowCombat: false,
    allowMarket: false,
    allowProduction: false,
    allowScouting: false,
    intelligenceRadius: 2,
    intelStaleTicks: 10000
};
```

It also contains capped order histories, observer metrics, cumulative remote
counters, expected population snapshots, and compact room intelligence. Room
intelligence is capped at 150 rooms and hostile events at 50. Long-term history
lives in SQLite rather than Screeps Memory.

| Segment | Direction | Contents |
|---|---|---|
| 90 | Bot to commander | Strategic telemetry schema v2 |
| 91 | Commander to bot | Heartbeat and order inbox schema v1 |
| 92 | Bot to commander | Status, acknowledgements, and recent results schema v1 |

The commander is stale after 500 ticks without a valid heartbeat. Missing
segments, malformed JSON, duplicate IDs, expired orders, invalid parameters,
and stale heartbeats fail closed without interrupting deterministic AZC code.
No command data reaches `eval`, `Function`, arbitrary Memory writes, or a general
dispatcher.

## Actions and safety modes

| Action | Parameters | Mode/policy | Effect |
|---|---|---|---|
| `NOOP` | `{}` | observe or execute | Completes without changing game state. |
| `REQUEST_STATUS` | `{}` | observe or execute | Requests the normal Segment 92 status. |
| `SET_EXPLANATION` | `{ "explanation": "..." }` | observe or execute | Stores up to 2,000 characters of user-visible reasoning. |
| `SCOUT_ROOM` | `{ "room": "W38N10", "origin": "W37N11" }` | execute and `allowScouting` | Queues one non-respawning AZC scout mission. |

The original live NOOP rejection was caused by the observe-mode action gate:
`NOOP` was present in the global whitelist but absent from the observe-safe
whitelist. It now completes in observe mode because it changes no game state.

`SCOUT_ROOM` requires all of the following:

- interface enabled;
- interface not paused;
- fresh external heartbeat;
- `mode == "execute"`;
- `Memory.ai.policy.allowScouting == true`;
- valid Screeps room names;
- an owned, visible origin colony;
- unexpired order and unseen command ID;
- no existing active AI-managed mission for the same origin and destination.

The handler reuses `Memory.rooms[origin].scout_requests`,
`Control.runScoutRequests`, the central spawn queue, and `Creep_Roles.Scout`.
The mission has `count: 1`, `respawn: false`, station patrol behavior, and a
deterministically derived route. `AI_AUTO_SCOUT` is prepared in external config
but defaults to false and does not automatically dispatch missions in Phase 3.

## Strategic telemetry schema v2

Segment 90 publishes compact summaries rather than raw game objects.

For every owned colony it reports:

- controller level/progress/percentage, downgrade state, and safe mode;
- available/capacity, storage, applicable terminal, dropped, and container energy;
- actual and `CONTROLLER_STRUCTURES`-allowed counts for spawns, extensions,
  towers, storage, terminal, links, labs, factory, extractor, observer, nuker,
  and power spawn;
- explicit storage/terminal/lab/factory/link/extractor capability flags;
- busy/idle spawns, queue depth, and queued roles;
- construction count/types and outstanding energy;
- tower energy and compact rampart/wall hit statistics;
- current hostile counts and recent hostile history;
- role-level expected, alive, spawning, queued, and dying-soon population plus
  aggregate demand satisfaction.

Unavailable structure resources are represented semantically. For example, an
RCL5 colony reports terminal `allowed: 0`, `canUseTerminal: false`, and
`terminalEnergy: null`; it does not misleadingly report an empty operating
terminal.

Each configured remote reports home colony, active/visible state, source-keeper
status, source count, route, reservation, population demand/health, visible
source state, containers and hit summary, waiting energy, security, cumulative
delivered energy, creep losses, and hostile interruptions. Delivery counters are
incremented only after a successful energy transfer by a creep assigned to a
remote into its home colony.

Empire state includes exact GCL level/progress/total, owned-controller count,
available claim slots, creep count, credits, CPU, and bucket. The observer
publishes its measured CPU cost and exact UTF-8 serialized payload size.

## Room intelligence and expansion candidates

The observer refreshes compact intelligence for every visible room and retains:

- last seen tick and calculated age;
- normal/highway/source-keeper/sector-center classification;
- sources, mineral, and cached swamp percentage;
- controller ownership, reservation, RCL, and safe mode;
- strategically relevant structures and compact fortification hits;
- current/recent hostile facts and player names;
- nearest colony, linear distance, route length, and route status.

A configurable breadth-first map scan identifies nearby known, stale, and
unknown rooms. Candidate scores expose their component values for sources,
distance, terrain, mineral, and security. Ownership, unclaimable room type, stale
intel, and low source counts remain visible as explicit disqualifiers rather than
being hidden in one opaque score. Candidate ranking is factual preparation; the
AI makes the strategic interpretation.

## Expansion readiness and advisor narrative

The structured advisory uses one of:

```text
READY
NOT_READY
INSUFFICIENT_INTEL
BLOCKED_BY_GCL
BLOCKED_BY_ECONOMY
BLOCKED_BY_THREAT
```

Readiness answers whether expansion is strategically desirable. The separate
`expansion_execution_allowed` field remains false in Phase 3. Therefore the AI
may correctly report `READY` while also reporting no claim authorization.

The OpenAI prompt identifies current telemetry, calculated trends, execution
authority, AZC capabilities, and gross-versus-net measurement semantics. The
strict result contains rich empire, colony, remote, and territory prose;
priorities and reasons; concerns and questions; scout recommendations; confidence;
and a narrative journal entry. It requests user-visible reasoning, never hidden
chain-of-thought.

## SQLite trends and colony journal

`HistoryStore` migrates existing databases in place and keeps bounded tables for
observations, commands, recommendations, operational events, and journal entries.
`TrendAnalyzer` compares current telemetry with stored Phase 3 baselines for:

- the last 1,000, 5,000, and 20,000 ticks;
- the period since the previous advisory;
- colony storage and controller progress;
- GCL progress, creep population, average CPU, and bucket movement;
- measured remote deliveries, losses, interruptions, and staffing.

Unavailable historical windows are labeled unavailable rather than fabricated.

The human journal combines meaningful deterministic milestones—such as a Phase
3 baseline, RCL/GCL changes, major storage-band crossings, new room intelligence,
and remote interruption/recovery—with AI-written strategic chapters. It avoids
per-creep action spam.

## Console and external CLI

Use `help("ai")` for the in-game list. Important commands are:

- `ai.status()`, `ai.orders()`, and `ai.explain()`;
- `ai.enable()` / `ai.disable()`;
- `ai.pause()` / `ai.resume()`;
- `ai.mode("observe")` / `ai.mode("execute")`;
- `ai.scouting(true)` / `ai.scouting(false)`.

From `ai/`, use the local virtual environment:

```bash
.venv/bin/python -m commander.main status
.venv/bin/python -m commander.main watch
.venv/bin/python -m commander.main advise
.venv/bin/python -m commander.main advise --no-writeback
.venv/bin/python -m commander.main noop
.venv/bin/python -m commander.main request-status
.venv/bin/python -m commander.main scout W38N10 W37N11
.venv/bin/python -m commander.main history --limit 20
.venv/bin/python -m commander.main journal --last 20
.venv/bin/python -m commander.main journal --since-tick 76800000
.venv/bin/python -m commander.main cost
```

`history` is the engineering/audit view. `journal` is the readable story of the
empire. `cost` shows today's, seven-day, lifetime, count, and average estimated
OpenAI cost. The default model and cost rates are configurable in `.env` using
the exact credential names `SCREEPS_API_TOKEN` and `OPENAI_API_TOKEN`.

## Local verification

From the repository root:

```bash
node tests/ai_commander.test.js
PYTHONPATH=ai ai/.venv/bin/python -m unittest discover -s ai/tests -v
PYTHONPATH=ai ai/.venv/bin/python -m compileall -q ai/commander ai/tests
ai/.venv/bin/python tools/screeps_deploy.py --branch ai-test --dry-run
git diff --check
```

All Python network interactions are mocked. The dry run validates every
deployable top-level JavaScript module without uploading.

## Git, deployment, live test, and rollback

Git branches and Screeps code branches are separate namespaces.

| Kind | Phase 3 name | Purpose |
|---|---|---|
| Git branch | `feature/ai-strategic-intelligence` | Source history and commits |
| Screeps branch | `ai-test` | Live integration target |
| Screeps branch | `default` | Untouched known-good rollback |

List branches and confirm both the active branch and rollback target:

```bash
ai/.venv/bin/python tools/screeps_branch.py list
```

Upload only to `ai-test`:

```bash
ai/.venv/bin/python tools/screeps_deploy.py --branch ai-test
```

If necessary, activate it explicitly:

```bash
ai/.venv/bin/python tools/screeps_branch.py activate ai-test
```

Immediate rollback does not upload anything:

```bash
ai/.venv/bin/python tools/screeps_branch.py activate default
```

Type `default` at the production confirmation prompt. The already-authorized
non-interactive form is `ai/.venv/bin/python tools/screeps_branch.py activate default --production`.

For a Phase 3 live test:

1. Confirm local suites pass, `default` exists, and the rollback command is known.
2. Upload to `ai-test`, activate only if it is not already active, and list again.
3. Verify W37N11, W38N11, W36N11, and W37N12 plus CPU/bucket before commands.
4. Run `ai.enable()` and `ai.mode("observe")`; send `noop` and confirm completion.
5. Collect multiple observations, run `advise`, then inspect `journal` and `cost`.
6. Select one nearby stale/unknown room. In the game console run
   `ai.mode("execute")` and `ai.scouting(true)`, then issue exactly one CLI
   `scout ROOM W37N11` order.
7. Confirm acknowledgement, one AZC spawn request/mission, room visibility,
   refreshed `lastSeenTick`, and no other strategic state change.
8. Disable scouting with `ai.scouting(false)` and return to
   `ai.mode("observe")` immediately after the mission is accepted.
9. Re-run the advisory and verify it incorporates the returned intelligence.
10. Roll back to `default` if colony behavior, remote operation, CPU, or payload
    size is unexpected.

Stopping the external commander never stops deterministic AZC automation. The
uploader refuses to overwrite `default` unless explicit production flags and
confirmation are supplied.
