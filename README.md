# Unit Talk Core

Production-caliber monorepo with Fortune-100 standard DevOps baseline, Temporal workflow orchestration, and comprehensive testing infrastructure.

## 🚀 Quick Start

```bash
# Prerequisites: Node 20 LTS
nvm use  # or use Node 20.11.0

# Install dependencies
npm ci

# Start development environment (Mac/Linux)
./dev.sh up

# Start development environment (Windows)
.\dev.ps1 up
```


### Windows Quickstart

- Use the helper script to start the stack with Temporal and worker handling:
  - `npm run dev:win` (runs `./dev.ps1` under PowerShell)
- If you prefer to run just the worker locally without Docker:
  - `npx tsx apps/worker/src/worker.ts`
- Tips:
  - Ensure Node 20 is active (e.g., `nvm use 20`)
  - If shells complain about execution policy, start PowerShell as Administrator and run: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## 🔧 One-Command Development

The `dev.ps1` and `dev.sh` scripts provide unified control over the entire Temporal stack:

```bash
# Windows
.\dev.ps1 up        # Start Temporal stack with health checks
.\dev.ps1 down      # Stop all services and cleanup
.\dev.ps1 logs      # View logs for all services
.\dev.ps1 phase:a   # Run Phase A (Shadow mode, no promotions)
.\dev.ps1 phase:b   # Run Phase B (Live mode, muted communications)
.\dev.ps1 phase:c   # Run Phase C (Full E2E, muted communications)

# Mac/Linux
./dev.sh up        # Start Temporal stack with health checks
./dev.sh down      # Stop all services and cleanup
./dev.sh logs      # View logs for all services
./dev.sh phase:a   # Run Phase A (Shadow mode, no promotions)
./dev.sh phase:b   # Run Phase B (Live mode, muted communications)
./dev.sh phase:c   # Run Phase C (Full E2E, muted communications)
```

### Rollback & Emergency Procedures

```bash
# Emergency stop (immediate)
.\dev.ps1 down      # Windows
./dev.sh down       # Mac/Linux

# View service status
docker compose ps

# Emergency mute (disable all external communications)
# Set in .env.local:
PUBLISH_TO_DISCORD=false
SHADOW_MODE=true
```

## 📦 Docker Services & Ports

| Service | Port | Description |
|---------|------|-------------|
| Temporal Server | 7233 | Workflow orchestration gRPC API |
| Temporal UI | 8080 | Web interface for workflow monitoring |
| Temporal Postgres | 5432 | Temporal state storage |
| API | 3000 | HTTP API with metrics endpoint |
| Worker | - | Temporal worker (no exposed port) |

## Status & Ops

[![CI](https://github.com/griff843/unit-talk-core/actions/workflows/ci.yml/badge.svg)](https://github.com/griff843/unit-talk-core/actions/workflows/ci.yml)
[![Nightly Ops](https://github.com/griff843/unit-talk-core/actions/workflows/ops-nightly.yml/badge.svg)](https://github.com/griff843/unit-talk-core/actions/workflows/ops-nightly.yml)
[![Staging Smokes](https://github.com/griff843/unit-talk-core/actions/workflows/staging-smoke.yml/badge.svg)](https://github.com/griff843/unit-talk-core/actions/workflows/staging-smoke.yml)

## Alerting & Linear Auto-ticketing

- Nightly ops workflow runs hourly and on demand: .github/workflows/ops-nightly.yml
- CI failure auto-ticketing posts a summary to Linear: final job ci-summary in .github/workflows/ci.yml
- Script used by both: scripts/ci/report-to-linear.{ts,js}

Secrets required (set in GitHub Environments, not in repo):
- LINEAR_API_KEY
- LINEAR_TEAM_ID

See RUNBOOK.md for setup instructions.

## Operations

- Run all checks and produce a single JSON report:
  - npm run ops:all
  - Writes out/ops/ops.json with ok/breaches and component details

## Env validation and smoke probes

- Validate env: npm run env:validate (writes out/env/validate.json)
- Run smoke probes (Windows-safe): npm run smoke:all (writes out/smoke/*.json)
- Live checks (non-shadow only): Temporal (describeTaskQueue) and Supabase/DB policy probe run inside ops:all
- Discord smoke honors SHADOW_MODE and PUBLISH_TO_DISCORD flags (dry-run by default)

## Environment Variables & Configuration

### Core Operation Flags
- **SHADOW_MODE**: Controls shadow mode behavior (default: `false`)
  - `true`: Runs in shadow mode for safe testing, may use seed sidecar fallback for processed counts if `processed_at` is missing
  - `false`: Live mode with full database writes
- **PUBLISH_TO_DISCORD**: Controls Discord publishing (default: `false`)
  - Should be `false` for all CI/E2E testing environments
- **ALLOW_PROMOTION_IN_SHADOW**: Advanced testing flag (default: `false`)
  - `false`: No promotions are written to DB in shadow mode (recommended)
  - `true`: Promotions are written but marked with shadow context (advanced testing only)

### Processing Counts in Shadow Mode
In `SHADOW_MODE=true`, processed counts may use fallback strategies when `processed_at` columns are missing:
1. Primary: Direct `processed_at` column count
2. Fallback: Seed sidecar data (from recent seeding operations)
3. Final fallback: Raw ingestion count mirror (shadow mode only)

## Environment & Validation

- Migrations and direct DB scripts use DATABASE_URL_DIRECT (non-pooling URI) when present; otherwise they fall back to DATABASE_URL.
- Quick verification commands:
  - npm run db:verify:shape
  - npm run db:verify:session


## DB Verify & Patch

- What it checks:
  - db:verify:shape -> presence of tables, required columns, and important indexes
  - db:verify:session -> current app.role/app.tenant_id session and basic RLS read
- JSON outputs (non-blocking even on error):
  - out/db/verify-shape.json
  - out/db/verify-session.json
- CI always uploads db-verification artifact (non-blocking)
- If shape is missing on a fresh DB, run one-time patch:
  - **npm run db:patch:shape** (creates/updates core tables and required columns)

### Column Checking System

The verification system validates required columns for core operations:
- **raw_props**: `inserted_at`, `processed_at` (required for ingestion workflow)
- **unified_picks**: `promoted_at`, `raw_id` (required for promotion pipeline)

Produces diagnostic output in `out/db/column-check.json` for troubleshooting schema issues.

## How to run

- Local (shadow, Windows-safe):
  - PowerShell: `$Env:SHADOW_MODE="true"; $Env:PUBLISH_TO_DISCORD="false"; npm ci; npm run ops:all`
  - Outputs: out/ops/ops.json and out/ops/dashboard.json
- Simulate live failure (non-shadow):
  - PowerShell: `$Env:SHADOW_MODE="false"; $Env:TEMPORAL_SERVER_ADDRESS="localhost:9999"; $Env:TEMPORAL_TASK_QUEUE="unit-talk-dev"; npm run ops:all`
  - Expect ok:false with temporal-live-breach

Discord posts only when PUBLISH_TO_DISCORD=true and DISCORD_WEBHOOK_URL is set in the environment.

GitHub Environments (staging/production) secrets to set:
- TEMPORAL_SERVER_ADDRESS (e.g., localhost:7233)
- TEMPORAL_TASK_QUEUE (e.g., unit-talk)
- DISCORD_WEBHOOK_URL (if PUBLISH_TO_DISCORD=true)

## 🎯 Ops Acceptance Phases

### Phase A: Shadow Mode (No Promotions)
```bash
# Docker
docker compose run --rm ops npm run ops:phase:a

# Local
npm run ops:phase:a
```
- **Shadow Mode**: `true`
- **Promotions**: Blocked
- **Discord**: Disabled
- **Purpose**: Safe testing without side effects

### Phase B: Live Mode (Muted Communications)
```bash
# Docker
docker compose run --rm ops npm run ops:phase:b

# Local
npm run ops:phase:b
```
- **Shadow Mode**: `false`
- **Promotions**: Enabled (Promoter only)
- **Discord**: Disabled
- **Purpose**: Production data flow without external notifications

### Phase C: Full Production Mode
```bash
# Docker
docker compose run --rm ops npm run ops:phase:c

# Local
npm run ops:phase:c
```
- **Shadow Mode**: `false`
- **Promotions**: Enabled
- **Discord**: Enabled (requires webhook)
- **Purpose**: Complete production operations

## 📊 Artifacts & Monitoring

All operations produce artifacts in the `out/` directory:

- `out/ops/audit-devops.json` - DevOps baseline audit
- `out/ops/acceptance.json` - Acceptance test results
- `out/ops/promoter.json` - Promoter operation metrics
- `out/ops/dashboard.json` - System dashboard snapshot
- `out/ops/metrics.json` - 5-minute window metrics
- `out/dev/agent-inventory.json` - Agent inventory (if present)

## 🔧 Development Commands

```bash
# Start dev environment with Temporal
./dev.sh up        # Mac/Linux
.\dev.ps1 up       # Windows

# View logs
./dev.sh logs      # Mac/Linux
.\dev.ps1 logs     # Windows

# Run ops phases
./dev.sh phase:a   # Shadow mode testing
./dev.sh phase:b   # Live mode (muted)
./dev.sh phase:c   # Full production

# Stop everything
./dev.sh down      # Mac/Linux
.\dev.ps1 down     # Windows
```

## 🔐 Security

See [SECURITY.md](./SECURITY.md) for:
- Security policy and vulnerability reporting
- Best practices for contributors
- Dependency management
- Compliance information

## 📚 Documentation

- [RUNBOOK.md](./RUNBOOK.md) - Operational procedures and troubleshooting
- [SECURITY.md](./SECURITY.md) - Security policies and guidelines
- [docs/HIVE_MIND_RESUME.md](./docs/HIVE_MIND_RESUME.md) - System architecture (if present)
