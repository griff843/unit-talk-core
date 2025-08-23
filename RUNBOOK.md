# Unit Talk Operations Runbook

## Overview

This runbook provides comprehensive operational guidance for Unit Talk's Docker-first monorepo, covering staging environment setup, database operations, monitoring, and emergency procedures. Unit Talk implements a clean ingestion pipeline: **ingest → process → promote (single writer) → grade (shadow) → approve → publish (gated) → observe**.

## Quick Reference

### Essential Commands

```bash
# Environment & Dependencies
npm install                    # Install all dependencies
npm run type-check            # TypeScript validation
npm run lint                  # Code linting
npm run build                 # Build all workspaces

# Database Operations
npm run migrate:up            # Apply database migrations
npm run migrate:down          # Rollback last migration
npm run migrate:dry-run       # Preview migration status
npm run db:seed:canary        # Seed test data

# Testing & Validation
npm run test                  # Run all tests
npm run accept:all            # Run all acceptance tests
npm run e2e:shadow            # Shadow E2E test
npm run test:pipeline:e2e     # Pipeline end-to-end test

# Monitoring & Operations
npm run ops:all               # All health checks
npm run ops:parity            # Data flow validation
npm run ops:rls               # Security policy check
npm run ops:temporal          # Workflow health
npm run canary:shadow         # 30-minute shadow test
npm run canary:monitor        # Continuous monitoring
```

## Staging Environment Setup

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL database access
- Environment variables configured

### Initial Setup

```bash
# 1. Clone and install
git clone <repository-url>
cd unit-talk-core
npm install

# 2. Environment configuration
cp .env.example .env
# Edit .env with your configuration (see Environment Variables section)

# 3. Database setup
npm run migrate:up
npm run db:seed:canary

# 4. Validate setup
npm run accept:env            # Test environment variables
npm run accept:psql           # Test database connection
npm run accept:migration      # Verify migrations
```

### Environment Variables

**Required Variables:**

```bash
# Database Configuration
DATABASE_URL="postgresql://user:pass@host:port/database"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJ..."
SUPABASE_SERVICE_KEY="eyJhbGciOiJ..."

# API Configuration
API_PORT=3000
NODE_ENV="staging"

# Feature Flags (Critical for CI/E2E)
SHADOW_MODE=true              # Required for CI/E2E
PUBLISH_TO_DISCORD=false      # Required for CI/E2E

# Security & Compliance

# Linear Alerting Integration

- GitHub Actions will automatically open/update a Linear issue when:
  - The hourly ops workflow detects a failure or a breach in out/ops/*.json
  - Any CI job in .github/workflows/ci.yml fails (summary job posts to Linear)
- De-duplication: issues are grouped per repo + breach name per day (24h signature)

Required secrets (set in GitHub Environments, e.g. staging, production):
- LINEAR_API_KEY (Linear personal API key)
- LINEAR_TEAM_ID (Linear team ID)

Local .env example entries are present in .env.example for reference only; do not store secrets in the repo.

MAX_ALLOWED_PROMOTES_5MIN=20  # Flood guard (default)
```

**Optional Variables:**

```bash
# Temporal Configuration
TEMPORAL_SERVER_ADDRESS="localhost:7233"
TEMPORAL_TASK_QUEUE="unit-talk-queue"
TEMPORAL_NAMESPACE="default"

# Monitoring
LOG_LEVEL="info"
API_BASE_URL="http://localhost:3000"

# Canary Testing
CANARY_DURATION=10            # Minutes
CANARY_INTERVAL=60            # Seconds
```

## Database Operations

### Migration Management

**Apply Migrations:**

```bash
# Standard migration
npm run migrate:up

# Check migration status first
npm run migrate:dry-run

# View what will be applied
ls migrations/
# 001_baseline.sql - Creates tables, RLS, policies
```

**Rollback Migrations:**

```bash
# Rollback last migration
npm run migrate:down

# Always check what will be affected
npm run migrate:dry-run
```

**Migration Structure:**

- `migrations/001_baseline.sql` - Core schema with RLS policies
- `packages/db/scripts/migrate.ts` - Migration runner
- Migration tracking in `_migrations` table

### Database Schema

**Core Tables:**

```sql
-- Raw ingestion data
raw_props (
    id UUID PRIMARY KEY,
    inserted_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    data JSONB NOT NULL
);

-- Promoted picks (single writer: Promoter only)
unified_picks (
    id UUID PRIMARY KEY,
    raw_id UUID REFERENCES raw_props(id),
    promoted_at TIMESTAMPTZ DEFAULT NOW(),
    data JSONB NOT NULL
);
```

**Security Policies:**

- RLS enabled on `unified_picks`
- Promoter role enforcement via trigger
- Policy check: `app.role = 'promoter'`

### Seed Data

```bash
# Load canary test data
npm run db:seed:canary

# Manual seeding
psql "$DATABASE_URL" -f scripts/db/seed-canary.sql
```

## E2E Testing & Validation

### Acceptance Test Suite

**Run All Tests:**

```bash
npm run accept:all
```

**Individual Tests:**

```bash
npm run accept:env        # Environment variables
npm run accept:psql       # Database connectivity
npm run accept:migration  # Migration status
npm run accept:metrics    # API metrics endpoint
npm run accept:security   # Security policies
```

**Test Output:**

- Results in `scripts/e2e/out/acceptance/`
- JSON format with pass/fail status
- Detailed error messages and context

### Shadow Testing

**Shadow Run (CI/E2E Safe):**

```bash
# Runs with SHADOW_MODE=true, PUBLISH_TO_DISCORD=false
npm run e2e:shadow

# Direct execution
tsx scripts/e2e/src/shadow-run.ts
```

**Shadow Features:**

- No external side effects
- Safe for CI environments
- Discord publishing disabled
- Full pipeline validation

### Canary System

**30-Minute Shadow Canary:**

```bash
npm run canary:shadow
```

- Samples every 2 minutes (15 total samples)
- Tests API availability and data parity
- Validates promotion activity
- Output: `out/canary/report.json` + `samples.ndjson`

**Continuous Monitoring:**

```bash
npm run canary:monitor
# Configurable duration and interval
# Health scoring algorithm
# Production monitoring ready
```

## Operations & Monitoring

### Health Checks

**All Checks:**

```bash
npm run ops:all

### How to run locally (Ops)

- Install deps: npm ci
- Run all checks: npm run ops:all
- Output: out/ops/ops.json (validated against scripts/ops/schema.ts)
- Exit code: 0 when ok:true (no breaches), 1 when breaches exist

To inspect quickly on Windows:
- type .\out\ops\ops.json | more

### Troubleshoot breaches

- parity-breach: Check data parity and metrics; rerun npm run ops:parity
- rls-violations: Review RLS policies and recent violations; rerun npm run ops:rls
- temporal-health: Inspect Temporal backlog/failures; rerun npm run ops:temporal

All checks have a 60s timeout per task to prevent hangs.

# Parallel execution of all health checks
# 30-second timeout per check
# Unified reporting
```

**Individual Checks:**

```bash
npm run ops:parity     # Data flow parity validation
npm run ops:rls        # RLS policy compliance
npm run ops:temporal   # Workflow system health
```

**Check Details:**

- **Parity**: Validates `raw_new_5min >= processed_5min >= promoted_5min`
- **RLS**: Monitors for SQLSTATE 42501 violations
- **Temporal**: Server health, failed workflows, backlog age

### Monitoring Integration

**CI/CD Pipeline:**

```yaml
# GitHub Actions example
- name: Operations Health Check
  run: |
    npm run ops:all
    if [ $? -ne 0 ]; then
      echo "❌ Operations health check failed"
      cat out/ops/ops-all.json
      exit 1
    fi
```

**Production Monitoring:**

```bash
# Cron job (every 5 minutes)
*/5 * * * * cd /app && npm run ops:all

# Slack alerting
npm run ops:all || curl -X POST $SLACK_WEBHOOK \
  -d '{"text":"Unit Talk ops check failed"}'
```

### Output Locations

### Investigate schema issues (DB verification)

- Run schema checks: `npm run db:verify:shape` and `npm run db:verify:session`
- Inspect artifact `db-verification` from CI (non-blocking)
- If columns/indexes are missing on a new DB, apply one-time patch: `npm run db:patch:shape`
- Re-run verifiers and confirm out/db/*.json show ok:true or enumerate what remains missing


- Health checks: `out/ops/*.json`
- Canary results: `out/canary/*.json`
- Acceptance tests: `scripts/e2e/out/acceptance/*.json`

## Rollback Procedures

### Configuration Rollback (Immediate)

**Shadow Mode Activation:**

```bash
# Emergency shadow mode (disables publishing)
export SHADOW_MODE=true
export PUBLISH_TO_DISCORD=false

# Restart services to apply
# No database changes required
```

**Flood Guard Activation:**

```bash
# Reduce promotion rate
export MAX_ALLOWED_PROMOTES_5MIN=5

# Monitor with parity check
npm run ops:parity
```

### Database Migration Rollback

**Rollback Process:**

```bash
# 1. Check current migration status
npm run migrate:dry-run

# 2. Rollback last migration
npm run migrate:down

# 3. Verify rollback
npm run migrate:dry-run
npm run accept:migration

# 4. Test system functionality
npm run accept:all
```

**Rollback Validation:**

```bash
# Verify table structure
psql "$DATABASE_URL" -c "\dt"

# Check RLS policies
psql "$DATABASE_URL" -c "\d+ unified_picks"

# Test write permissions
npm run ops:rls
```

### Application Rollback

**Service Restart:**

```bash
# Stop services
pkill -f "node.*unit-talk"

# Reset to shadow mode
export SHADOW_MODE=true
export PUBLISH_TO_DISCORD=false

# Restart with previous configuration
npm run dev
```

**Validation After Rollback:**

```bash
# Health check
npm run ops:all

# End-to-end validation
npm run e2e:shadow

# Canary test
npm run canary:monitor
```

## Troubleshooting Guide

### Common Issues

#### 1. Database Connection Issues

**Symptoms:**

- `accept:psql` fails
- Migration errors
- API database errors

**Diagnosis:**

```bash
# Test direct connection
psql "$DATABASE_URL" -c "SELECT 1;"

# Check environment variables
npm run accept:env

# Verify database exists
psql "$DATABASE_URL" -c "\l"
```

**Solutions:**

- Verify `DATABASE_URL` format
- Check network connectivity
- Validate database user permissions
- Ensure PostgreSQL server is running

#### 2. RLS Policy Violations

**Symptoms:**

- `ops:rls` reports violations
- Write operations fail with insufficient_privilege

**Diagnosis:**

```bash
# Monitor RLS violations
npm run ops:rls

# Check current app.role setting
psql "$DATABASE_URL" -c "SELECT current_setting('app.role', true);"

# Verify promoter role enforcement
tsx scripts/e2e/src/non-promoter-write.ts
```

**Solutions:**

```bash
# Set correct app.role for promoter
psql "$DATABASE_URL" -c "SET app.role = 'promoter';"

# Verify RLS policy
psql "$DATABASE_URL" -c "\d+ unified_picks"

# Check trigger function
psql "$DATABASE_URL" -c "\df+ enforce_promoter_role"
```

#### 3. Parity Violations

**Symptoms:**

- `ops:parity` fails
- Data inconsistency detected
- Promotion pipeline issues

**Diagnosis:**

```bash
# Check current metrics
npm run ops:parity

# Fetch raw metrics
curl "http://localhost:3000/api/metrics/ingestion?window=5"

# Monitor promotion flood guard
grep "promoted_5min" out/ops/parity.json
```

**Solutions:**

- Check API server status
- Verify worker processes running
- Monitor promotion rate limits
- Investigate processing delays

#### 4. API Health Issues

**Symptoms:**

- Health checks timeout
- `/healthz` returns non-200
- Metrics endpoint unavailable

**Diagnosis:**

```bash
# Direct health check
curl -v "http://localhost:3000/healthz"

# Check API server logs
npm run dev 2>&1 | grep -i error

# Verify port configuration
netstat -tlnp | grep 3000
```

**Solutions:**

- Restart API server
- Check port conflicts
- Verify environment configuration
- Review application logs

#### 5. Temporal Workflow Issues

**Symptoms:**

- `ops:temporal` fails
- Workflow execution errors
- Task queue backlog

**Diagnosis:**

```bash
# Check Temporal server
curl -v "http://localhost:8233/health"

# Monitor workflow health
npm run ops:temporal

# Check task queue
temporal workflow list -q unit-talk-queue
```

**Solutions:**

- Restart Temporal server
- Clear task queue backlog
- Check workflow definitions
- Verify worker connectivity

### Performance Issues

#### Slow Response Times

```bash
# Monitor response times
npm run canary:monitor

# Check database performance
psql "$DATABASE_URL" -c "
  SELECT query, mean_time, calls
  FROM pg_stat_statements
  ORDER BY mean_time DESC LIMIT 10;
"

# Profile API endpoints
curl -w "@curl-format.txt" "http://localhost:3000/api/metrics/ingestion"
```

#### High Resource Usage

```bash
# Monitor system resources
top -p $(pgrep -f node)

# Check database connections
psql "$DATABASE_URL" -c "
  SELECT count(*) as connections, state
  FROM pg_stat_activity
  GROUP BY state;
"

# Monitor disk space
df -h
```

### Security Incidents

#### Unauthorized Access Attempts

```bash
# Check RLS violations
npm run ops:rls

# Monitor failed authentication
grep "insufficient_privilege" /var/log/postgresql/*.log

# Review access patterns
psql "$DATABASE_URL" -c "
  SELECT * FROM pg_stat_activity
  WHERE state = 'active' AND query LIKE '%unified_picks%';
"
```

#### Data Integrity Issues

```bash
# Validate data consistency
npm run ops:parity

# Check promotion counts
psql "$DATABASE_URL" -c "
  SELECT COUNT(*) as promotions_last_hour
  FROM unified_picks
  WHERE promoted_at > NOW() - INTERVAL '1 hour';
"

# Audit recent changes
psql "$DATABASE_URL" -c "
  SELECT * FROM unified_picks
  WHERE promoted_at > NOW() - INTERVAL '1 hour'
  ORDER BY promoted_at DESC;
"
```

## Emergency Contacts & Escalation

### Immediate Actions (< 5 minutes)

1. **Enable Shadow Mode:**

   ```bash
   export SHADOW_MODE=true
   export PUBLISH_TO_DISCORD=false
   ```

2. **Run Health Check:**

   ```bash
   npm run ops:all
   ```

3. **Activate Flood Guard:**
   ```bash
   export MAX_ALLOWED_PROMOTES_5MIN=5
   ```

### Documentation & Logs

- **Runbook**: This document
- **Operations Logs**: `out/ops/*.json`
- **Canary Results**: `out/canary/*.json`
- **Database Logs**: PostgreSQL server logs
- **Application Logs**: stdout/stderr from services

### Recovery Validation

After any incident resolution:

```bash
# Full system validation
npm run accept:all
npm run ops:all
npm run canary:shadow

# Extended monitoring
npm run canary:monitor
```

---

## References

- [CLAUDE.md](./CLAUDE.md) - System architecture and contracts
- [Operations README](./scripts/ops/README.md) - Detailed ops monitoring
- [Canary README](./scripts/canary/README.md) - Canary system guide
- [E2E Scripts](./scripts/e2e/src/) - Acceptance test implementation
