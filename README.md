# Unit Talk Core

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
