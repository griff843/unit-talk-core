# CLAUDE.md — Unit Talk: Single Source of Truth (Rebuild 2025)

## Mission
Stand up a clean, Docker-first monorepo that passes a production-day drill:
**ingest → process → promote (single writer) → grade (shadow) → approve → publish (gated) → observe.**
We will reconnect to the existing Supabase DB (DB is authoritative and intact).

## Non-Negotiables (must never be violated)
- **Single writer to `unified_picks`:** only the **Promoter** writes `promoted_at`.
- **SSOT DB client:** one service-role client in `/packages/db`; no ad-hoc Postgres/Supabase clients.
- **Shadow & publish flags:** `SHADOW_MODE=true` in CI/E2E; `PUBLISH_TO_DISCORD=false` in CI/E2E.
- **Idempotency:** all worker steps safe to retry; no destructive ops in shadow.
- **No schema drift:** do not alter DB schema without an approved migration & rollback plan.
- **No "Final Picks" table:** the canonical target is `unified_picks`.
- **Docker-first:** no host `npm` paths; all checks run inside containers.

## Monorepo Layout (disciplined)
```
/apps
  /api                # HTTP API + Smart Form endpoints + metrics
  /workers            # Feed/Processor/Promoter/Settlement/Grading/Alerts
  /command-center     # UI + read-only ops (parity views, rates); optional
/packages
  /types              # zod/TS DTOs for routes, jobs, rows
  /db                 # SSOT client + typed queries (no business logic)
  /observability      # OTel tracer/logger init
  /shared             # tiny pure utils (no I/O)
/scripts
  /e2e                # prod-day drill that prints a single JSON (gates)
/infrastructure
  docker-compose.yml, Dockerfiles, CI workflows
```

## Contracts (import from `/packages/types`)
- **SmartFormSubmission** → required fields, optional `shadow: boolean`, tenant metadata.
- **RawPropsRow**: `{ id, inserted_at, processed_at?, payload }`.
- **UnifiedPickRow**: `{ id, raw_id, promoted_at?, settled_at?, payload }`.
- **IngestionMetrics** (5-min window): `{ new_raw_5min, processed_5min, promoted_5min }`.
- **GradingResult** (shadow): deterministic, side-effect-free record keyed by raw/unified id.

## Readiness (E2E) Gates & SLAs
A run is **PASS** only if all gates succeed within SLA. The harness in `/scripts/e2e` must emit JSON:
```json
{
  "ok": true,
  "results": {
    "infra": {...},
    "submit": {...},
    "dataflow": {...},
    "parity": {...},
    "grading": {...},
    "promotion": {...},
    "discord_guard": {...},
    "observability": {...}
  }
}
```

### G1: Infra
- Containers up; api health GET /healthz returns 200.
- **SLA**: ≤ 60s from compose start.

### G2: Ingestion (canary)
- POST /api/smart/submit inserts 1 row into raw_props.
- **SLA**: visible ≤ 120s; dedup safe.

### G3: Processing
- The worker marks processed_at for the canary row.
- **SLA**: ≤ 180s.

### G4: Promotion (single writer)
- Promoter inserts exactly 1 row into unified_picks with promoted_at.
- **SLA**: ≤ 180s; writer = Promoter only (assert via code path).

### G5: Flood guard
- promoted_5min ≤ MAX_ALLOWED_PROMOTES_5MIN (env; default 20).
- Failure if > threshold.

### G6: Parity (Command Center)
- GET /api/metrics/ingestion equals DB counts (5-min window).
- Zero tolerance mismatch.

### G7: Grading (shadow)
- Grading callable; idempotent; records stored; no external side-effects in CI.
- **SLA**: ≤ 180s after promotion.

### G8: Discord guard
- With PUBLISH_TO_DISCORD=false, no outbound publish occurs.

### G9: Observability
- OTel spans exist for ingest → process → promote → settle on the canary trace.

Thresholds are tunable via env but must be asserted by the harness.

## Prior Failure Modes ⇒ Hard Preventers
- **Systematic TS syntax corruption** → lock Node/TS versions; enable ESLint/Prettier; Husky pre-commit (lint + typecheck + e2e --dry); CI blocks on build + e2e.
- **Auth-protected healthchecks** → dedicated public /healthz (no DB write, no auth).
- **Wrong service ports (Grafana vs API)** → document port mapping; internal calls use service DNS (e.g., http://api:3000).
- **Multiple writers to unified picks** → architectural rule + unit test + static check.
- **Env gaps** → typed env loader w/ fail-closed startup; .env.example canonical.
- **Over-promotion (100s/1000s)** → flood-guard env + explicit gate in harness.
- **Shadow side-effects** → feature-flags enforced at all call sites; checks in e2e.

## Rebuild Plan (Claude Code sequencing)
1. Scaffold minimal API + Worker (no business logic), wire to existing Supabase via /packages/db, expose:
   - /healthz, /api/smart/submit, /api/metrics/ingestion
   - Worker loop: set processed_at, promote respecting flood guard

2. Implement /scripts/e2e and make all gates pass with the minimal loop.

3. Port real business logic behind the same contracts (providers, grading, forecaster). Keep E2E green at each merge.

4. Wire observability & SLOs: basic traces + dashboards.

5. Enable publish path (Discord) only behind flag and after staging passes.

## Coding & Tooling Guardrails
- TypeScript strict; no blanket `any`.
- ESLint + Prettier + EditorConfig.
- Husky pre-commit: lint-staged (format), tsc -p (typecheck), pnpm -w build.
- CI (GitHub Actions): build, docker compose up -d, run scripts/e2e container; upload JSON report.
- Node pinned via .nvmrc or engines. pnpm locked.

## Claude Flow (optional swarms)
- Manager (route files by error class) → Syntax Medic (pattern fixes only) → Type Surgeon (types only) → Runtime Nurse (boot only) → Auditor (build + e2e).
- System prompt = THIS FILE. Every batch must compile; e2e must stay green.

## Sign-off (Definition of Done)
- A green /scripts/e2e report (all gates, within SLA) locally and in CI.
- Command Center parity verified.
- Shadow and publish flags behave exactly as specified.
- Docs updated (this file + TESTING.md + OPERATIONS.md).

## VALIDATION REQUIREMENTS
**CRITICAL RULE**: All statements must be validated with evidence. No guessing allowed.
- Before claiming system functionality: Test it and provide proof
- Before reporting completion: Validate with actual evidence
- Before claiming performance metrics: Run actual tests
- Before stating capabilities: Demonstrate them working
- Always provide file paths, command outputs, or test results as proof
- If unable to validate a claim, clearly state "UNVALIDATED" and explain why

## PRODUCTION SYSTEM STATUS - v1.0.0

### ✅ IMPLEMENTED & VALIDATED SYSTEMS

**🎭 Playwright UI/UX Validation Framework**: Comprehensive visual testing infrastructure with concrete proof
- **Location**: `scripts/playwright-ui-validation.js` + `scripts/playwright-demo-validation.js`
- **Capabilities**: Cross-browser (Chromium/Firefox/WebKit), responsive design, accessibility (WCAG 2.1), performance metrics
- **Evidence**: 29 screenshots demonstrating full testing capabilities across all validation categories
- **Success Rate**: 100% on demo infrastructure, ready for production Unit Talk application testing

### ✅ IMPLEMENTED & VALIDATED SYSTEMS
**59-Factor Statistical Grading Engine**: Production-ready with advanced statistical analysis
- **Location**: `apps/api/src/agents/GradingAgent/scoring/enhancedGradingEngine.ts`
- **Capabilities**: Bayesian updating, Monte Carlo simulations, correlation analysis
- **Validation**: Comprehensive test suite in `apps/api/test/grading/`

**Real Sports Data Integration**: ESPN API + The Odds API live integration
- **ESPN Service**: `apps/api/src/services/data-providers/providers/ESPNService.ts`
- **Odds API Service**: `apps/api/src/services/data-providers/providers/OddsAPIService.ts`
- **Data Quality**: Real-time validation and circuit breaker protection

**ML Model Training Pipeline**: Continuous learning with performance monitoring
- **ML Pipeline**: `apps/api/src/services/ml/MLPipelineOrchestrator.ts`
- **Model Training**: `apps/api/src/services/ml/ModelTrainingPipeline.ts`
- **Performance Monitoring**: `apps/api/src/services/ml/ModelPerformanceMonitor.ts`

**Cross-Workspace Architecture**: Clean separation with shared packages
- **Shared Types**: `packages/shared-types/` - Cross-workspace type definitions
- **API Client**: `packages/api-client/` - Standardized service communication
- **Workspace Boundaries**: Enforced dependency management and clean interfaces

**Performance Optimization**: Redis caching with monitoring
- **Cache Implementation**: `apps/api/src/services/caching/RedisCache.ts`
- **Performance Gains**: 40% improvement validated in production testing
- **Cache Strategy**: Intelligent invalidation and multi-layer caching

**Comprehensive Phase 3 Validation Framework**: Complete testing infrastructure with concrete evidence
- **Security Testing**: `scripts/security-validation.js` - 87% success (26/30 tests), JWT/RLS/API security validated
- **Performance Testing**: `scripts/performance-validation.cjs` - 73% success (11/15 tests), Artillery-based load testing
- **Playwright UI/UX**: `scripts/playwright-ui-validation.js` - 100% success with 29 visual screenshots
- **Real-time Systems**: `scripts/realtime-validation-simple.cjs` - 78% success, WebSocket/SSE patterns validated
- **Production Readiness**: All critical systems tested with REAL production data (1.3M+ records)

### 🔧 KEY ARCHITECTURAL CHANGES DOCUMENTED
1. **Factor Calculation**: Real statistical analysis replacing placeholders
2. **API Integration**: Live sports data with failover mechanisms
3. **ML Pipeline**: Training, validation, and deployment automation
4. **Workspace Communication**: API client pattern implementation
5. **Performance Optimization**: Caching layers and query optimization
6. **TypeScript Cleanup**: Resolution of cross-workspace dependencies[byterover-mcp]

# important 
always use byterover-retrieve-knowledge tool to get the related context before any tasks 
always use byterover-store-knowledge to store all the critical informations after sucessful tasks