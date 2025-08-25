# Schedules Runbook

This runbook covers dual-mode automation for maintenance tasks via Temporal Schedules (preferred) or Cron Workflows (fallback).

## Prereqs
- Temporal server reachable (TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE)
- Worker running: `npx tsx apps/worker/src/worker.ts`

## Detect capability
- Doctor prints server version and mode:

```
npm run schedules:doctor
# Temporal Server: 1.x.y
# MODE=schedules|cron
```

## Initialize
- Creates/updates 3 maintenance tasks. Uses Schedules when supported, falls back to Cron Workflows.
```
npm run schedules:init
```

## Manage
- List, trigger, pause, resume, delete by ID. Works with Schedules; if using cron fallback, use Temporal UI to manage workflows.
```
npm run schedules:list
npm run schedules:trigger maintenance.normalizer.5m
npm run schedules:pause maintenance.ttl.hourly
npm run schedules:resume maintenance.ttl.hourly
npm run schedules:delete maintenance.archive.daily
```

IDs:
- maintenance.normalizer.5m (*/5 * * * *)
- maintenance.ttl.hourly (0 * * * *)
- maintenance.archive.daily (10 3 * * *)

## Bumping normalization safely
- Environment knobs (read by maintenance normalize activity):
  - NORMALIZE_BATCH (requested)
  - NORMALIZE_BATCH_CAP (hard cap)
  - NORMALIZE_MAX_ROWS_PER_MINUTE (rate)
- All runs emit telemetry in artifacts: `batch_requested`, `batch_cap`, `batch_size`, `max_rows_per_minute`.
- Raise limits gradually and monitor artifacts.

### Throughput tuning
- Target: unprocessed_48h = 0 (no backlog older than 48 hours)
- Start conservative: e.g., NORMALIZE_BATCH=2000, NORMALIZE_BATCH_CAP=5000, NORMALIZE_MAX_ROWS_PER_MINUTE=15000
- Increase NORMALIZE_BATCH in small steps; if hitting cap often, raise NORMALIZE_BATCH_CAP.
- Keep NORMALIZE_MAX_ROWS_PER_MINUTE within DB capacity; monitor errors/time in artifacts.
- Observe out/ops/maintenance/summary.jsonl to confirm steady progress without spikes in errors.

## Artifacts
- Per-run JSONs: `out/ops/maintenance/*.json`
- Summary log: `out/ops/maintenance/summary.jsonl`
- Doctor hint: `out/dev/schedules-doctor.json`

## Dashboard
- `scripts/ops/emit-dashboard.js` reads doctor hint or `MAINTENANCE_MODE` and emits:
```
dashboard.maintenance.mode = "schedules" | "cron"
```

## Troubleshooting
- If schedules are unsupported, doctor shows MODE=cron and init falls back to cron workflows.
- Ensure worker is running on the correct task queue (TEMPORAL_TASK_QUEUE, default `unit-talk`).

