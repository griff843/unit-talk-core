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

