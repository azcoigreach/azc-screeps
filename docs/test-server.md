# Test Server

The `test-server/` directory provides a private Screeps server that closely approximates production conditions, allowing you to test code changes in a compressed time-scale under controlled conditions — without affecting the live game.

---

## Architecture

| Component | Technology |
|-----------|-----------|
| Game engine | [screepers/screeps-launcher](https://github.com/screepers/screeps-launcher) (Docker) |
| Admin utilities | [screepsmod-admin-utils](https://github.com/screepers/screepsmod-admin-utils) |
| Syntax tests | Node.js `--check` (no dependencies) |
| Integration tests | [screeps-server-mockup](https://github.com/screepers/screeps-server-mockup) + [Mocha](https://mochajs.org/) |

The Docker image bundles the same Screeps engine as the official servers. World data is kept in a named Docker volume (`azc-screeps-test-data`) so it persists across restarts.

---

## Quick Start

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) with the Compose plugin
- Node.js ≥ 18 (for upload script and tests)

### 1 – Start the server

```bash
bash test-server/scripts/start.sh
# or: npm run server:start
```

The server starts at **http://localhost:21025**.  
Default test-account credentials: `AzcTestBot` / `testpass`

### 2 – Upload bot code

```bash
bash test-server/scripts/upload.sh
# or: npm run server:upload
```

All `*.js` files from the repo root are uploaded to the `default` branch of the `AzcTestBot` account.

Override defaults with environment variables:

```bash
SERVER_USER=MyUser SERVER_PASS=mypass BOT_BRANCH=feature bash test-server/scripts/upload.sh
```

### 3 – Monitor

```bash
npm run server:logs     # live Docker logs
npm run server:status   # container health
```

Connect the [Screeps web client](http://localhost:21025) to watch the game live.

### 4 – Stop / Reset

```bash
npm run server:stop     # stop containers (world data preserved)
npm run server:reset    # ⚠️ DESTROYS world data – full clean slate
```

---

## Time Compression

The test server is configured with `tickDuration: 500` ms (half the production value of 1000 ms). This lets you observe several in-game hours in real minutes.

To change the rate, edit `test-server/screeps-launcher.yaml`:

```yaml
tickDuration: 200    # 5× faster than production
```

Then restart the server (`npm run server:stop && npm run server:start`).

---

## Running Tests

### Syntax check (no dependencies, instant)

```bash
npm run test:syntax
```

Runs `node --check` on every `*.js` file in the repo root. Catches syntax errors before you even start the server.

### Full test suite (requires `npm install`)

```bash
npm install
npm test
```

This runs:
1. **Syntax group** – same checks as above via Mocha
2. **Smoke group** – starts a `screeps-server-mockup` instance, loads the full bot module set, runs 5 ticks, and asserts no `[ERROR]` console lines are produced

> **Note:** The smoke tests require the `screeps` and `screeps-server-mockup` npm packages. Run `npm install` once before `npm test`.

---

## File Structure

```
test-server/
├── docker-compose.yml        Docker service definition
├── screeps-launcher.yaml     Private server configuration
├── .gitignore                Excludes runtime data
├── data/                     Runtime data (gitignored; use Docker volume instead)
└── scripts/
    ├── start.sh              Start server and wait for ready
    ├── stop.sh               Stop server (world preserved)
    ├── reset.sh              Wipe world data and start fresh
    └── upload.sh             Upload bot code via Screeps HTTP API

tests/
├── basic.test.js             Syntax + smoke tests (Mocha)
├── helpers/
│   └── loader.js             Loads all *.js modules for mockup server
└── scripts/
    └── syntax-check.js       Dependency-free syntax checker
```

---

## Configuration Reference

`test-server/screeps-launcher.yaml`:

| Key | Default | Description |
|-----|---------|-------------|
| `steamKey` | `""` | Steam Web API key — leave empty for local dev |
| `tickDuration` | `500` | Milliseconds per game tick |
| `mods` | `[screepsmod-admin-utils]` | Installed server mods |
| `bots.azc-screeps.username` | `AzcTestBot` | Bot account username |
| `bots.azc-screeps.password` | `testpass` | Bot account password |
| `bots.azc-screeps.spawnRoom` | `W5N5` | Room where the bot spawns |

---

## CI Integration

Add the syntax check to your CI pipeline without any server or Docker:

```yaml
# .github/workflows/test.yml
- name: Syntax check
  run: node tests/scripts/syntax-check.js
```

For full integration tests with Docker, use `npm run server:start && npm run server:upload && npm test`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Container exits immediately | `npm run server:logs` – check for port conflicts on 21025/21026 |
| Upload script gets auth error | Make sure the server is healthy (`npm run server:status`) before uploading |
| `npm test` smoke tests skipped | Run `npm install` first to get `screeps-server-mockup` |
| World data corrupted | Run `npm run server:reset` to wipe and start fresh |

---

## See Also

- [screeps-launcher docs](https://github.com/screepers/screeps-launcher)
- [screepsmod-admin-utils](https://github.com/screepers/screepsmod-admin-utils)
- [screeps-server-mockup](https://github.com/screepers/screeps-server-mockup)
- [Screeps Private Server guide](https://docs.screeps.com/server/index.html)
