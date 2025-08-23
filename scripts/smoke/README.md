# Smoke Testing Framework

Comprehensive agent and workflow validation system with shadow/dry-run capabilities.

## Overview

This smoke testing framework provides comprehensive validation for all agents and workflows in the Unit Talk system. It ensures system reliability through systematic testing with shadow mode support and production-safe validation.

## Architecture

```
scripts/
├── agents/
│   └── smoke-runner.ts          # Agent smoke test executor
├── workflows/
│   └── smoke-runner.ts          # Workflow smoke test executor
└── smoke/
    ├── smoke-summary.ts         # Combined result aggregator
    ├── smoke-orchestrator.ts    # Test coordination & execution
    └── README.md               # This file

out/smoke/                      # Test output directory
├── agents/
│   ├── agents-smoke.json       # Detailed agent test results
│   └── agents-summary.json     # Agent test summary
├── workflows/
│   ├── workflows-smoke.json    # Detailed workflow test results
│   └── workflows-summary.json  # Workflow test summary
├── smoke-summary.json          # Combined test summary
└── smoke-dashboard.json        # Dashboard integration data
```

## Features

### 🤖 Agent Testing
- **Shadow mode validation** - Ensures no production side effects
- **Canary data processing** - Tests with synthetic data
- **Single writer compliance** - Validates promoter-only unified_picks writes
- **Error handling verification** - Tests error recovery mechanisms
- **Performance baselines** - Validates response time requirements
- **Dry run capabilities** - Tests simulation modes

### 🔄 Workflow Testing
- **End-to-end validation** - Tests complete workflow execution
- **State transition verification** - Validates workflow state progression
- **Rollback capability testing** - Tests workflow cancellation and recovery
- **Dependency chain validation** - Ensures workflow dependencies are satisfied
- **Performance benchmarking** - Measures workflow execution times
- **Compensation testing** - Validates saga pattern implementations

### 📊 Comprehensive Reporting
- **Unified summary reports** - Combined agent and workflow results
- **Dashboard integration** - Metrics for monitoring systems
- **CI/CD integration** - Non-blocking validation in pipelines
- **Performance tracking** - Historical performance data
- **Error analysis** - Detailed failure diagnostics

## Quick Start

### Run All Tests
```bash
# Complete smoke test suite with orchestration
npm run smoke:all

# Alternative: run orchestrator directly
npm run smoke:orchestrator
```

### Run Individual Test Suites
```bash
# Agent tests only
npm run smoke:agents

# Workflow tests only
npm run smoke:workflows

# Generate summary from existing results
npm run smoke:summary
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SHADOW_MODE` | `true` | Run tests in shadow mode (no side effects) |
| `DRY_RUN` | `true` | Enable dry run mode for all tests |
| `AGENT_PERF_THRESHOLD_MS` | `5000` | Agent performance threshold in milliseconds |
| `WORKFLOW_PERF_THRESHOLD_MS` | `10000` | Workflow performance threshold in milliseconds |
| `PUBLISH_TO_DISCORD` | `false` | Disable external notifications in tests |
| `ALLOW_PROMOTION_IN_SHADOW` | `false` | Disable promotions in shadow mode |

### Command Line Options (Orchestrator)

```bash
tsx scripts/smoke/smoke-orchestrator.ts [options]

Options:
  --no-agents         Skip agent smoke tests
  --no-workflows      Skip workflow smoke tests
  --no-summary        Skip summary generation
  --sequential        Run tests sequentially instead of parallel
  --fail-fast         Stop on first failure
  --timeout <minutes> Set timeout in minutes (default: 10)
  --output-dir <dir>  Set output directory (default: out/smoke)
  --help              Show help message
```

## Test Categories

### Agent Tests

Each agent is tested across multiple dimensions:

1. **Shadow Mode Compliance**
   - Verifies shadow mode is properly respected
   - Ensures no production side effects occur
   - Validates shadow metadata propagation

2. **Canary Data Processing**
   - Tests with synthetic canary data
   - Validates data processing capabilities
   - Ensures proper input/output handling

3. **Error Handling**
   - Tests invalid input rejection
   - Validates error message quality
   - Ensures graceful failure modes

4. **Performance Baseline**
   - Measures processing time for standard workloads
   - Validates against configured thresholds
   - Tracks performance trends over time

5. **Single Writer Compliance**
   - Enforces single writer rule for unified_picks
   - Validates only promoter agent can write
   - Prevents data corruption scenarios

6. **Dry Run Capability**
   - Tests simulation without side effects
   - Validates dry run flag propagation
   - Ensures "what-if" scenario testing

### Workflow Tests

Each workflow undergoes comprehensive validation:

1. **Canary Execution**
   - Full end-to-end execution with test data
   - Validates workflow completion
   - Tests with realistic input scenarios

2. **State Transitions**
   - Verifies proper workflow state progression
   - Tests state persistence and recovery
   - Validates temporal workflow semantics

3. **Error Recovery**
   - Tests workflow failure handling
   - Validates retry policies
   - Ensures proper error propagation

4. **Rollback Capability**
   - Tests workflow cancellation
   - Validates compensation actions
   - Ensures saga pattern compliance

5. **Performance Baseline**
   - Measures end-to-end execution time
   - Validates against SLA requirements
   - Tracks performance degradation

6. **Shadow Mode Compliance**
   - Ensures shadow flag propagation
   - Validates no external side effects
   - Tests shadow-aware activities

7. **Compensation Testing**
   - Validates saga pattern implementation
   - Tests failure scenario recovery
   - Ensures data consistency

## Output Formats

### Agent Test Results

```json
{
  "timestamp": "2025-01-23T...",
  "success": true,
  "summary": {
    "totalAgents": 6,
    "passedAgents": 6,
    "failedAgents": 0,
    "warningCount": 2,
    "totalDuration": 15432
  },
  "systemHealth": {
    "singleWriterRuleValid": true,
    "shadowCompatibleAgents": 6,
    "criticalAgentHealth": true
  },
  "agentResults": [...]
}
```

### Workflow Test Results

```json
{
  "timestamp": "2025-01-23T...",
  "success": true,
  "summary": {
    "totalWorkflows": 6,
    "passedWorkflows": 6,
    "failedWorkflows": 0,
    "averageWorkflowDuration": 2143
  },
  "systemHealth": {
    "temporalConnectivity": true,
    "workflowCoverage": 100,
    "criticalWorkflowHealth": true,
    "dependencyChainValid": true
  },
  "workflowResults": [...]
}
```

### Combined Summary

```json
{
  "timestamp": "2025-01-23T...",
  "overallSuccess": true,
  "agents": { "success": true, ... },
  "workflows": { "success": true, ... },
  "systemHealth": {
    "overallHealth": true,
    "criticalSystemsOnline": true,
    "shadowModeCompliant": true,
    "performanceWithinLimits": true
  },
  "recommendations": [...]
}
```

## CI/CD Integration

### GitHub Actions

The framework includes a comprehensive GitHub Actions workflow (`.github/workflows/smoke-tests.yml`) that:

- Runs agent and workflow tests in parallel
- Generates combined summaries
- Posts results as PR comments
- Uploads artifacts for analysis
- Provides non-blocking validation

### Pipeline Configuration

```yaml
# Example CI integration
- name: Run Smoke Tests
  run: npm run smoke:all
  continue-on-error: true  # Non-blocking
  
- name: Upload Results
  uses: actions/upload-artifact@v4
  with:
    name: smoke-test-results
    path: out/smoke/
```

## Monitoring Integration

### Dashboard Data

The framework generates dashboard-compatible metrics:

```json
{
  "timestamp": "2025-01-23T...",
  "status": "PASS",
  "environment": "SHADOW",
  "metrics": {
    "agent_tests_passed": 6,
    "agent_tests_failed": 0,
    "workflow_tests_passed": 6,
    "workflow_tests_failed": 0,
    "overall_health_score": 100
  },
  "alerts": []
}
```

### Health Score Calculation

The health score (0-100) is calculated as:
- Base score: (passed tests / total tests) × 100
- Deductions:
  - Critical systems offline: ×0.5
  - Shadow mode non-compliant: ×0.8
  - Performance issues: ×0.9

## Troubleshooting

### Common Issues

1. **Agent Tests Failing**
   ```bash
   # Check agent configuration
   npm run smoke:agents
   
   # Review detailed output
   cat out/smoke/agents/agents-smoke.json
   ```

2. **Workflow Tests Timing Out**
   ```bash
   # Increase timeout
   WORKFLOW_PERF_THRESHOLD_MS=20000 npm run smoke:workflows
   ```

3. **Shadow Mode Violations**
   ```bash
   # Verify environment variables
   echo $SHADOW_MODE $PUBLISH_TO_DISCORD
   
   # Check for external calls
   grep -r "external" out/smoke/
   ```

### Debug Mode

Enable verbose logging:
```bash
DEBUG=smoke:* npm run smoke:all
```

### Manual Test Execution

```bash
# Run specific test with custom config
tsx scripts/agents/smoke-runner.ts
tsx scripts/workflows/smoke-runner.ts
tsx scripts/smoke/smoke-summary.ts
```

## Performance Benchmarks

### Expected Performance (CI Environment)

| Test Category | Expected Duration | Threshold |
|---------------|-------------------|-----------|
| Agent Tests | 10-30s | 60s |
| Workflow Tests | 30-90s | 120s |
| Combined Summary | 1-5s | 10s |
| Total Suite | 60-180s | 300s |

### Performance Optimization

- Tests run in parallel by default
- Canary data is kept minimal
- Mock implementations for external dependencies
- Configurable timeouts and thresholds

## Security Considerations

- **Shadow Mode**: All tests run in shadow mode by default
- **Data Isolation**: Uses synthetic canary data only
- **No External Calls**: Blocks external API calls and notifications
- **Permission Validation**: Enforces single writer rule compliance
- **Audit Trail**: Comprehensive logging of all test actions

## Extending the Framework

### Adding New Agent Tests

1. Update agent registry in `apps/worker/temporal/src/agents/registry.ts`
2. Tests automatically discover new agents
3. Configure agent capabilities and shadow support

### Adding New Workflow Tests

1. Add workflow definition to `scripts/workflows/smoke-runner.ts`
2. Implement canary input generator
3. Configure dependencies and expected duration

### Custom Test Categories

```typescript
// Add new test category to agent/workflow test runners
private async testCustomFeature(target, result): Promise<void> {
  // Custom test implementation
}
```

## Support

For issues or questions:

1. Check test output in `out/smoke/` directory
2. Review GitHub Actions logs for CI failures
3. Enable debug logging for detailed analysis
4. Check system health metrics in dashboard integration

---

**Note**: This framework is designed to be production-safe with shadow mode and dry run capabilities. All tests respect the single writer rule and avoid side effects in production environments.