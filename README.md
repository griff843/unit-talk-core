# Unit Talk Core


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

GitHub Environments (staging/production) secrets to set:
- TEMPORAL_SERVER_ADDRESS (e.g., localhost:7233)
- TEMPORAL_TASK_QUEUE (e.g., unit-talk)
- DISCORD_WEBHOOK_URL (if PUBLISH_TO_DISCORD=true)
