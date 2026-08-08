# AI Commander

## Phase 5 remote expansion

Phase 5 promotes the closed loop into continuous operations while retaining
explicit human authority boundaries.

```text
deterministic diagnostics -> routine maintenance policy -> existing AZC controller
fresh territorial intel -> separate remote/claim scoring -> guarded major action
predicted economics -> measured lifecycle -> deterministic outcome -> journal/report
```

New policy switches default to off:

```javascript
Memory.ai.policy.allowNewRemotes = false;
Memory.ai.policy.autoNewRemotes = false;
Memory.ai.policy.allowColonization = false;
Memory.ai.policy.autoColonization = false;
```

`START_REMOTE_MINING` accepts only an owned origin and neutral target. It requires
fresh intel, an acceptable route, an eligible remote-candidate score, sufficient
home population/spawn capacity, execute mode, separate new-remote authority, one
free establishment slot, and an elapsed cooldown. It writes the same
`Memory.sites.mining` shape as `empire.remote_mining`; AZC still chooses bodies,
spawns, tasks, paths, reservation, hauling, and infrastructure. Repeating the
same target is idempotent.

`COLONIZE_ROOM` is implemented against the existing `Memory.sites.colonization`
API. It additionally requires a GCL slot, fresh neutral/self-reserved intel,
protection-aware route, a layout selected from cached terrain-valid `def_hor`,
`def_vert`, or `def_comp` origins, a healthy origin, energy reserve, candidate
score, concurrency slot, and elapsed retry/cascade cooldown. Automatic claiming
remains off. `STOP_REMOTE_MINING` remains human-gated; stop-loss recommendations
never delete configuration.

## Phase 6 permanent colonization

Permanent-colony scoring is independent from remote scoring. It includes sources,
terrain/swamps, mineral, route distance, supported layout feasibility,
defensibility, adjacent remote potential, corridor value, neighboring players,
bootstrap burden, and the room's current operational role. An `OUR_REMOTE` is a
valid claim candidate, but its measured delivery per 1,000 ticks becomes an
explicit temporary conversion cost. The origin is selected across all colonies
using storage, population satisfaction, spawn count, energy capacity, threats,
and distance; it is not hardcoded to the first colony.

Readiness is authoritative and componentized:

```text
READY  INSUFFICIENT_INTEL  NO_GCL_CAPACITY  BLOCKED_BY_POPULATION
BLOCKED_BY_SPAWN_CAPACITY  BLOCKED_BY_ECONOMY  BLOCKED_BY_ROUTE
BLOCKED_BY_LAYOUT  BLOCKED_BY_THREAT  BLOCKED_BY_PROTECTION
COLONIZATION_IN_PROGRESS  COLONIZATION_COOLDOWN
```

Legal GCL/protected-region capacity is reported separately from the operational
recommendation. Defaults allow one concurrent colonization, require 250,000
origin storage energy, 90% origin demand satisfaction, 800 energy capacity, and
then require the new room to reach RCL 3, 75% population satisfaction, a local
harvester, and evidence that its own spawn ran before success. These thresholds
live in `Memory.ai.policy`, not in an LLM prompt.

AZC continues to request and run the colonizer and build the supported blueprint.
The AI record persists after AZC removes the temporary mission and tracks:

```text
AUTHORIZED -> CLAIMER_REQUESTED -> CLAIMER_EN_ROUTE -> CLAIMED
-> SPAWN_BUILDING -> SPAWN_OPERATIONAL -> ECONOMY_BOOTSTRAPPING
-> SUCCESS | FAILED
```

Claiming alone is never success. Failure removes only the AI-managed colonization
mission, records cause/outcome and a retry deadline, and releases a converting
remote. When an existing remote is converted, reserver replacement is suppressed;
after claim its mining site becomes the new colony's local site so reservers are
not sent to an owned controller.

Remote continuity is deterministic. For reservers, miners/burrowers, and
carriers, AZC combines configured/measured route travel, the actual configured
body spawn time, a role safety margin, current TTL, and already-spawning capacity.
A creep that cannot survive until its replacement arrives no longer satisfies
future demand. Urgent reservation replacement uses bounded priority 13, below
home emergencies, and normal spawn aging retains its priority floor.

Territorial intelligence now retains source/mineral positions, terrain burden,
route rooms, controller relations, structures and fortifications, hostile body
and boost summaries, cached layout feasibility, and persistent player history.
Non-allied ownership is `NEUTRAL` unless the player is explicitly listed in
`Memory.hive.enemies`; ownership alone is not treated as hostility.

### Novice and respawn protection doctrine

`Game.map.getRoomStatus(roomName)` is the sole authority for `normal`, `closed`,
`novice`, and `respawn` status and temporary expiration timestamps. No protection
duration is hard-coded. Empire, colony, and strategically relevant room telemetry
expose status, expiration, remaining milliseconds, protected-region identity,
current reachability, post-protection reconsideration time, and cached blocked
exits. Visible edge walls and `Game.map.findExit` failures add direct evidence to
status-derived boundary records.

Protected routing uses these states:

```text
REACHABLE_NOW  BLOCKED_BY_PROTECTED_BOUNDARY  REACHABLE_AFTER_PROTECTION
CLOSED         UNKNOWN
```

Status-keyed routes are cached for 1,000 ticks and invalidated on the transition
to `normal`. Scouts, remote starts, colonization, and traveling scout creeps all
use the same layer. An inaccessible temporary scout target becomes `DEFERRED`,
stores the authoritative expiration timestamp, consumes no scout concurrency,
and is reconsidered by automatic scouting after the status becomes reachable.
It is not repeatedly respawned and is not mislabeled as permanently failed.

Remote and permanent-room planning retain separate `CURRENTLY_REACHABLE` and
`POST_PROTECTION` sets. The latter remains ranked but is never executable during
the current boundary. `AIRemoteStrategy.protectionRules(status)` is the single
authority for area semantics:

| Status | Temporary boundary | Claim rule | Nukers |
|---|---:|---|---:|
| `novice` | yes | `NOVICE_THREE_ROOM` | restricted |
| `respawn` | yes | `NORMAL_GCL` | restricted |
| `normal` | no | `NORMAL_GCL` | allowed |
| `closed` | no | `NOT_CLAIMABLE` | restricted |

Only Novice Areas impose the three-claimed-room region limit. Respawn Areas keep
normal GCL claim capacity while retaining their temporary outer boundary.
Reservations, possible conflict with reachable resident players, and controller
Safe Mode remain separate concepts. Telemetry reports both
`globalGclClaimSlots` and `currentProtectionClaimSlots`, plus the explicit rule
model. Expansion readiness separately reports legal capacity, recommended
simultaneous colonizations, and the current operational limiting reason.

Countdown thresholds default to 7 days, 3 days, 24 hours, 6 hours, and expiration
through `Memory.ai.policy.protectionThresholdHours`. Crossing one triggers a
material strategic reassessment and journal event. Expiration also clears route
and boundary caches, reopens deferred intelligence, refreshes candidates and
threat context, requests a full advisory, and creates a major colony-journal
chapter.

Military preparation remains intelligence-only. The observer preserves player,
ownership, RCL, towers and tower energy, spawns, Safe Mode, fortifications,
storage/terminal presence, hostile body parts and boosts, and route distance. It
also aggregates our spawn throughput and stored combat resources. Offensive
combat stays unauthorized.

Remote economics cover 1,000, 5,000, 20,000, and lifetime windows. Delivery,
losses, and interruptions are measured; rates and uptime are derived; miner,
hauler, reserver, and loss costs are explicit estimates; unavailable harvest,
defender, and infrastructure costs remain unknown. The exposed value category is
`EXCELLENT`, `GOOD`, `MARGINAL`, `POOR`, `LOSING`, or `UNKNOWN`, with component
values and confidence rather than an opaque score.

Establishment lifecycle is `CONFIGURING`, `RESERVING`, `BOOTSTRAPPING`, `ACTIVE`,
`EVALUATING`, `HEALTHY`/`DEGRADED`, or `FAILED`. Configuration alone is not
success; deterministic evaluation requires actual operating evidence. Stop-loss
progresses across multiple windows through `ACTIVE`, `WATCH`, `PROBATION`,
`PAUSE_RECOMMENDED`, and `ABANDON_RECOMMENDED`.

Continuous `watch` evaluates obvious maintenance and scouting rules before any
scheduled OpenAI review and sends at most one command per poll. The LLM handles
ambiguity and strategic selection, including a separately authorized eligible
new remote. Major operations are one-at-a-time and cooled down.

Useful Phase 5 controls:

```javascript
ai.newRemotes(true|false)
ai.autoNewRemotes(true|false)
ai.colonization(true|false)
ai.roomPolicy("W38N10", "PRIORITIZE"|"EXCLUDE"|"NO_REMOTE"|"NO_COLONY"|"NONE")
```

```bash
python -m commander.main candidates
python -m commander.main report --hours 24
python -m commander.main set-authority --scouting AUTO --remotes AUTO --new-remotes OFF --colonization OFF
python -m commander.main start-remote W38N10 W37N11
python -m commander.main colonize W38N10 W37N11 def_hor 20 20
```

For the live gate, run maintenance and bounded radius-two scouting first, review
candidate rankings and an advisory, then enable new-remotes for exactly one
operation. Disable it again after dispatch. Keep colonization, abandonment,
combat, market, and production authority off.

## Phase 4 architecture

The commander is a constrained strategic layer around AZC. Responsibility is
deliberately split:

| Layer | Responsibility |
|---|---|
| LLM strategist | Interpret validated state, explain priorities, and propose high-level objectives. |
| Deterministic AZC | Validate authority, choose bodies/coordinates/tasks, spawn creeps, build, reserve, mine, haul, and defend. |
| Python commander | Validate schemas, calculate history/economics, correlate commands, evaluate outcomes, and keep the journal. |
| Human operator | Enable the interface, choose observe/execute mode, grant automatic authority, and roll back. |

The strategist cannot execute JavaScript, write arbitrary Memory, choose raw
construction coordinates, claim, attack, trade, alter production, or add/delete
remote configurations.

```text
Segment 90 telemetry -> strict Python validation -> SQLite trends/economics
        -> strict OpenAI advisory -> deterministic authorization validator
        -> Segment 91 high-level objective -> AZC controller -> Segment 92 result
        -> scheduled metric evaluation -> colony journal
```

## Safe defaults and authority

`Memory.ai` preserves existing values and initializes new authority to off:

```javascript
Memory.ai.policy = {
    posture: "expansionist",
    allowScouting: false,
    autoScouting: false,
    allowRemoteMaintenance: false,
    autoRemoteMaintenance: false,
    intelligenceRadius: 2,
    intelStaleTicks: 10000,
    reservationWarningTicks: 2000,
    maxConcurrentScouts: 1,
    allowExpansion: false,
    allowCombat: false,
    allowMarket: false,
    allowProduction: false
};
```

`allowScouting` and `allowRemoteMaintenance` permit an explicitly requested
action. Their `auto*` partners separately permit the strategist to dispatch an
otherwise valid proposal. Automatic flags do nothing unless the interface is
enabled, unpaused, online, in execute mode, and the corresponding `allow*` flag
is also true.

| Action | Parameters | Authority | Deterministic effect |
|---|---|---|---|
| `NOOP` | `{}` | observe or execute | No game-state operation. |
| `REQUEST_STATUS` | `{}` | observe or execute | Publishes normal status. |
| `SET_EXPLANATION` | explanation only | observe or execute | Stores user-visible prose. |
| `SET_OPERATIONAL_AUTHORITY` | two `OFF`/`MANUAL`/`AUTO` values | observe or execute | Applies only the scouting and existing-remote policy switches. |
| `SET_EXECUTION_MODE` | `observe` or `execute` | observe or execute | Mirrors the human `ai.mode()` switch through the audited inbox. |
| `SCOUT_ROOM` | room + owned origin | execute + scouting | Queues one bounded AZC scout. |
| `REASSESS_REMOTE` | existing remote | execute + remote maintenance | Forces the normal remote survey path. |
| `ENSURE_REMOTE_RESERVATION` | existing remote | execute + remote maintenance | Gives the normal reserver controller a bounded objective. |
| `ENSURE_REMOTE_INFRASTRUCTURE` | existing remote | execute + remote maintenance | Forces the existing deterministic source-container placement check. |
| `REBALANCE_REMOTE_LOGISTICS` | existing remote | execute + remote maintenance | Lets AZC translate confirmed backlog into one bounded hauling slot. |

Phase 4 prepared these actions without accepting them. Phase 5 accepts guarded
`START_REMOTE_MINING` and human-authorized `COLONIZE_ROOM`; `STOP_REMOTE_MINING`
and `ATTACK_ROOM` remain unavailable.

## Memory Segments and fail-closed behavior

| Segment | Direction | Contents |
|---|---|---|
| 90 | Bot to commander | Strategic telemetry schema v5 |
| 91 | Commander to bot | Heartbeat and command inbox schema v1 |
| 92 | Bot to commander | Status and command results schema v1 |

The external heartbeat becomes stale after 500 ticks. Missing segments,
malformed JSON, inherited object names, duplicate IDs, expired orders, invalid
rooms/parameters, non-owned origins, non-remote targets, disabled authority, and
concurrent duplicates fail closed. Segment 91 is never overwritten while a local
command awaits acknowledgement.

The 30-second read poll is independent from Segment 91's write cadence. Heartbeats
default to 120 seconds and are displaced by successful command writes. Python
persists the memory-segment write quota, last confirmed payload hash, last contact
time, and queued commands in SQLite so a CLI process and the Docker watcher share
one budget. It retains the endpoint-specific `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, and `X-RateLimit-Reset` values instead of allowing later
GET headers to replace the POST budget.

Paid strategic reviews are also independent from polling. A persistent scheduler
normalizes strategic state, classifies transitions as informational, material, or
urgent, coalesces material events for two minutes, enforces a 15-minute minimum
between normal reviews, and runs a one-hour idle fallback. Owned-room attacks,
colony loss, protection transitions, major remote collapse, and colonization
failure may bypass the successful-review cadence. Provider failures still back
off. SQLite retains scheduler hashes, pending events, metrics, and an expiring
single-watcher ownership lease across Docker restarts. Manual `advise` bypasses
deduplication by design.

At more than 20 writes remaining, normal command, heartbeat, and changed
explanation traffic is allowed. At 20 or fewer, optional explanations are
suppressed. Commands and required heartbeats continue while tokens remain. A 429
sets the write budget to zero until the advertised reset plus a safety margin;
reads and acknowledgement correlation continue, and a queued command is retried
with its original ID. Transient network and 5xx failures use bounded exponential
backoff and do not normally terminate `watch`.

## Player identity and relationships

The observer derives `empire.player` first from an owned controller and then from
owned spawns, structures, or creeps. It is never hard-coded. Usernames in
ownership, reservations, and observed players are classified before the LLM sees
them:

```text
SELF  ALLY  NEUTRAL  HOSTILE  UNKNOWN
```

`Memory.hive.allies` supplies the current ally set. A missing username is
`NEUTRAL`; a username is `UNKNOWN` only when the observer cannot determine our
own player identity. For example, a reservation by `Stranger` is `SELF` when the
owned controller also identifies the account as `Stranger`.

## Population semantics

Population telemetry comes from the same active `popTarget` and `popActual`
objects used by `Sites.Colony.runPopulation` and `Sites.Mining.runPopulation`.
It is not inferred from dormant population templates.

For each role:

- `expected`/`desired` is the current dynamically adjusted AZC target;
- `alive`, `spawning`, and `dyingSoon` come from assigned live creeps;
- `queued` persists requests observed at the latest population pulse, because the
  central request list is rebuilt every tick;
- `state` is `SATISFIED`, `UNDERSTAFFED`, `REPLACEMENT_PENDING`,
  `INTENTIONALLY_DISABLED`, `NOT_REQUIRED`, or `MISCONFIGURED`.

`aliveTotal` counts roles with current demand. `assignedTotal` also counts live
roles that are present but not part of that demand. Therefore local
`carrier`/`burrower` creeps no longer make colony worker satisfaction look better,
and a zero target is not reported as a staffing failure. A visible queue depth of
zero after spawn processing does not erase the persisted latest demand request.

AZC role names are reported literally. At RCL5 these commonly include `worker`
and `upgrader` for the colony and `burrower`, `carrier`, `multirole`, and
`reserver` for mining sites. If required roles remain missing, the deterministic
spawn controller—not the LLM—must be fixed.

## Scout lifecycle and guardrails

AI scout missions use explicit states:

```text
QUEUED -> SPAWNING -> EN_ROUTE -> OBSERVED -> COMPLETED
   |                          \-> FAILED
   |                           -> EXPIRED
   \-> DEFERRED (temporary protected boundary; reconsider after transition)
```

Order completion means the destination was visible and
`Memory.ai.intelligence.rooms[target].lastSeenTick` was updated at or after the
request tick. Spawning or queueing alone does not complete the order. Telemetry
and history retain order ID, mission ID, target, origin, scout name, requested,
observed and completed ticks, intelligence tick, and failure reason.

Automatic scouting is limited by `maxConcurrentScouts` (1 by default, never more
than 2 here), intelligence radius (2 by default), fresh-intel suppression,
duplicate mission rejection, route validation, order expiry, and policy. The
Python validator only auto-dispatches exact unknown/stale rooms from an owned
origin. Known hostile ownership is not selected merely to fill an intel gap.

## Remote health and diagnostics

AZC deterministically classifies each configured remote as:

```text
HEALTHY  DEGRADED  FAILING  UNSAFE  STALE_INTEL  PAUSED  UNKNOWN
```

It exposes every component reason instead of hiding them in a score:

```text
NO_CONTAINER          CONTAINER_DAMAGED       ENERGY_BACKLOG
MINER_SHORTAGE        HAULER_SHORTAGE         RESERVER_SHORTAGE
RESERVATION_EXPIRING  HOSTILE_INTERRUPTION    STALE_INTEL
ROUTE_FAILURE         HIGH_CREEP_LOSSES       LOW_DELIVERY
```

Diagnostics include severity and evidence. Infrastructure distinguishes finished
containers from container construction sites and compares both with visible
source count. Reservation includes username/relation, remaining and warning
ticks, and present/spawning/queued reserver capacity. Thresholds are deterministic
and visible in telemetry.

The normal remote builder still checks every 1,500 ticks. A bounded
infrastructure objective may force the same check sooner; the existing source
position helper chooses the tile. Existing construction sites suppress duplicate
placement.

## Economics and outcomes

Python calculates remote windows over 1,000, 5,000, and 20,000 ticks from SQLite.
Every value is labeled:

- `MEASURED`: cumulative delivered energy, losses, interruptions;
- `DERIVED`: delivery per 1,000 ticks, average backlog, sampled uptime;
- `ESTIMATED`: replacement energy uses the stated 800-energy-per-loss assumption
  until body costs are retained;
- `UNKNOWN`: harvested energy, exact spawn time, and reservation cost when the
  required historical inputs do not exist.

The report says “measured delivery efficiency,” not exact profit. Partial windows
state their actual span.

Every remote intervention creates an SQLite operation with trigger, action,
reason, confidence, baseline, expected outcome, and evaluation tick. Evaluation
is deterministic:

- logistics compares backlog reduction and measured delivery;
- infrastructure compares containers plus construction sites;
- reservation compares self-reserve ticks and reserver capacity;
- reassessment requires a newer observation.

Outcomes are `SUCCESS`, `PARTIAL_SUCCESS`, `NO_EFFECT`, `FAILED`, or
`INCONCLUSIVE`. The LLM cannot mark its own action successful. Start and
evaluation events each create readable journal entries.

## Candidate and expansion semantics

Territory exposes current operational role separately from claim candidacy:

```text
OUR_COLONY  OUR_REMOTE  NEUTRAL_SCOUTED  SELF_RESERVED  ALLY_RESERVED
FOREIGN_RESERVED  HOSTILE_OWNED  ALLY_OWNED  SOURCE_KEEPER  HIGHWAY
```

Claim status is `ELIGIBLE`, `NEEDS_FRESH_INTEL`, or `DISQUALIFIED`. An
`OUR_REMOTE` may still be a future permanent-claim candidate. GCL slots,
candidate factors, stale/unknown rooms, and expansion readiness continue to be
calculated. Phase 5 adds separate remote/claim models above; automatic permanent
claiming remains disabled.

## Structured advisory and journal

The strict OpenAI result contains observations, assessment, priorities,
recommended and executable action proposals, uncertainty, expected outcome,
follow-up, colony/remote/territory narrative, and a long journal narrative. Each
proposal includes exact action/target, confidence, evidence, rationale,
evaluation window, and expected outcome. The implementation follows official
OpenAI Structured Outputs with a Pydantic schema; AZC policy remains an
independent enforcement layer.

The journal records telemetry milestones, strategic reviews, actual actions, and
deterministic evaluations. It is intentionally richer than the short in-game
explanation field.

## Operator controls

In the Screeps console:

```javascript
ai.status()
ai.authority()
ai.operations()
ai.remoteOps()                 // report
ai.remoteOps(true|false)       // allow manual remote objectives
ai.autoRemoteOps(true|false)   // allow strategist dispatch
ai.scouting(true|false)
ai.autoScouting(true|false)
ai.colonization(true|false)       // manual colonization authority
ai.autoColonization(true|false)   // explicit automatic authority; default off
ai.playerRelation("username", "ALLY"|"NEUTRAL"|"SUSPICIOUS"|"HOSTILE"|"WAR"|"AUTO")
ai.mode("observe"|"execute")
ai.pause()
ai.resume()
ai.explain()
```

From `ai/`:

```bash
.venv/bin/python -m commander.main status
.venv/bin/python -m commander.main operations
.venv/bin/python -m commander.main remotes
.venv/bin/python -m commander.main intel
.venv/bin/python -m commander.main military
.venv/bin/python -m commander.main advise
.venv/bin/python -m commander.main journal --last 20
.venv/bin/python -m commander.main cost
.venv/bin/python -m commander.main set-authority --scouting AUTO --remotes OFF
.venv/bin/python -m commander.main set-mode execute
.venv/bin/python -m commander.main scout W38N10 W37N11
.venv/bin/python -m commander.main reassess-remote W37N12
.venv/bin/python -m commander.main ensure-remote-reservation W37N12
.venv/bin/python -m commander.main ensure-remote-infrastructure W37N12
.venv/bin/python -m commander.main rebalance-remote-logistics W37N12
.venv/bin/python -m commander.main candidates
.venv/bin/python -m commander.main report --hours 24
.venv/bin/python -m commander.main colonize TARGET ORIGIN LAYOUT X Y
```

## Verification, deployment, and rollback

```bash
node tests/ai_commander.test.js
PYTHONPATH=ai ai/.venv/bin/python -m unittest discover -s ai/tests -v
PYTHONPATH=ai ai/.venv/bin/python -m compileall -q ai/commander ai/tests tools
PYTHONPATH=ai ai/.venv/bin/python tools/screeps_deploy.py --branch ai-test --dry-run
git diff --check
```

All Python unit tests use mocks/local SQLite and require no credentials. Upload
only to `ai-test`:

```bash
PYTHONPATH=ai ai/.venv/bin/python tools/screeps_deploy.py --branch ai-test
PYTHONPATH=ai ai/.venv/bin/python tools/screeps_branch.py list
```

The known-good `default` code branch is not uploaded by this workflow. Rollback
only switches the active World branch:

```bash
PYTHONPATH=ai ai/.venv/bin/python tools/screeps_branch.py activate default --production
```

For a live deployment test, first collect schema-v5 telemetry and
confirm all colonies/remotes, player identity, population demand, CPU, bucket,
and payload. Then enable only the needed policy, issue one action for one existing
remote, disable automatic authority after dispatch, wait through the declared
evaluation window, and inspect `operations`, `remotes`, `journal`, and `cost`.
Never combine the first remote intervention with claiming, new remote
establishment, combat, markets, or production changes.

## Phase 7A military intelligence

Telemetry schema v5 adds a read-only military foundation. Player records persist
first/last seen ticks, rooms, reservations, observed RCLs, proximity, conflict
counters, last conflict, and the current relationship. Human relationship
overrides support `ALLY`, `NEUTRAL`, `SUSPICIOUS`, `HOSTILE`, and `WAR`, and take
precedence over derived classifications.

Visible strategically relevant rooms summarize controller and safe-mode state,
tower energy, spawns/extensions, storage/terminal, separate rampart and wall
statistics, active hostile body parts, boosts, route distance, reinforcement
route, and intel age. Stale intel produces `STALE_INTEL`; it is never treated as
a current combat picture.

The deterministic feasibility layer calculates tower attack/heal falloff,
boosted hostile melee/ranged/heal/dismantle output, affordable AZC combat-template
output, fortification breach time, spawn replacement throughput, route travel
loss, and safe-mode constraints. `python -m commander.main military` renders the
local report. Phase 7A deliberately exposes no `ATTACK_ROOM` action:
`executionAuthorized` and offensive authority remain false.
