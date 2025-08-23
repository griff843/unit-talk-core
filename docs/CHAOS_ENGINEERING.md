# Chaos Engineering Framework

## Overview

Unit Talk's Chaos Engineering Framework provides comprehensive game-day failure rehearsal capabilities with safety-first design and extensive monitoring. The framework validates system resilience through controlled injection of failure modes while maintaining production safety standards.

## Key Features

- **Safety-First Design**: Environment validation, flag compliance, automatic rollback
- **Comprehensive Failure Modes**: Network, database, queue, resource, and API chaos
- **Real-time Monitoring**: System health tracking with automatic threshold alerts
- **SLO Integration**: Burn-rate monitoring and compliance validation
- **Discord Compliance**: Enforces `PUBLISH_TO_DISCORD=false` during chaos
- **Automated Reporting**: Detailed resilience metrics and recommendations

## Architecture

```
chaos-runner.js          # Main orchestrator with 6-phase execution
├── chaos.js             # Core chaos injection engine
├── chaos-monitor.js     # Real-time system monitoring
└── Generated Reports    # Comprehensive test analysis
```

### Core Components

1. **ChaosEngineeringFramework** (`chaos.js`)
   - Failure mode injection
   - Safety validation
   - Recovery procedures
   - Metrics collection

2. **ChaosMonitor** (`chaos-monitor.js`)
   - Real-time health monitoring
   - SLO violation detection
   - Alert threshold management
   - Performance metrics

3. **ChaosTestRunner** (`chaos-runner.js`)
   - End-to-end test orchestration
   - Pre/post validation
   - Comprehensive reporting
   - Integration with existing ops tools

## Available Chaos Modes

### Network & API Chaos
- **vendor-lag**: External API delays (500ms - 30s latency)
- **network-partition**: Connectivity interruptions and splits

### Database Chaos  
- **db-slow**: Query delays and connection throttling (100ms - 15s)

### Processing Chaos
- **queue-spike**: High-volume message generation (50-1000 msg/s)

### Resource Chaos
- **resource-exhaustion**: Memory/CPU pressure simulation (60-90% usage)

### Predefined Scenarios
- **quick-resilience**: 2-minute light chaos across modes
- **standard-chaos**: 3-minute medium intensity test
- **comprehensive**: 5-minute full system stress test
- **network-storm**: 4-minute network-focused chaos

## Usage Examples

### Quick Start
```bash
# Run basic resilience test with monitoring
node scripts/ops/chaos-runner.js --test quick --monitor

# Run comprehensive test with full validation
node scripts/ops/chaos-runner.js --test comprehensive --monitor --validate-all
```

### Individual Mode Testing
```bash
# Test API latency resilience
node scripts/ops/chaos-runner.js --test vendor-lag --severity heavy --duration 300

# Test database performance under pressure
node scripts/ops/chaos-runner.js --test db-slow --severity medium --monitor
```

### Scenario Testing
```bash
# Network-focused chaos scenario
node scripts/ops/chaos-runner.js --scenario network-storm --validate-all

# Full system stress test
node scripts/ops/chaos-runner.js --scenario comprehensive --monitor --validate-all
```

### Standalone Components
```bash
# Run chaos framework directly
node scripts/ops/chaos.js --mode vendor-lag --severity heavy --duration 300

# Run monitoring only
node scripts/ops/chaos-monitor.js --duration 600 --continuous
```

## Six-Phase Test Execution

### Phase 1: Pre-Flight Checks
- Environment validation (staging only)
- Database connectivity verification
- API health confirmation
- Docker services status
- Discord flag compliance (`SHADOW_MODE=true`, `PUBLISH_TO_DISCORD=false`)
- Baseline SLO establishment

### Phase 2: Monitoring Startup
- Real-time metrics collection (5s interval)
- Alert threshold configuration
- Baseline health recording
- Integration with existing SLO monitoring

### Phase 3: Chaos Execution
- Controlled failure injection
- Safety threshold monitoring
- Automatic rollback triggers
- Recovery procedure tracking

### Phase 4: Monitoring Collection
- Health data aggregation
- Alert summary compilation
- SLO violation analysis
- Performance impact assessment

### Phase 5: Post-Chaos Validation
- System recovery verification
- Parity invariant checking
- Discord compliance validation
- Exposure limit verification
- Data integrity confirmation

### Phase 6: Comprehensive Reporting
- Resilience metrics calculation
- Recommendation generation
- Detailed test analysis
- Integration with ops dashboards

## Safety Features

### Environment Protection
- **Production Block**: Automatic rejection in production environments
- **Flag Validation**: Enforces shadow mode and Discord compliance
- **Service Verification**: Confirms required services are available

### Real-Time Safety
- **Critical Thresholds**: Auto-rollback on error rate >50%, response time >10s
- **Resource Monitoring**: Memory >90%, CPU >95% triggers emergency stop
- **Health Tracking**: Continuous system health validation

### Recovery Mechanisms
- **Automatic Rollback**: Controlled restoration of all chaos effects
- **Emergency Procedures**: Immediate chaos termination on critical failures
- **System Stabilization**: Post-chaos recovery waiting periods

## Configuration

### Chaos Modes Configuration
Located in `chaos.js` CHAOS_CONFIG object:
```javascript
modes: {
  'vendor-lag': {
    parameters: {
      latency: { light: {min: 500, max: 2000} },
      dropRate: { light: 0.05 }
    }
  }
}
```

### Safety Thresholds
```javascript
safety: {
  criticalThresholds: {
    errorRate: 0.5,      // 50% error rate
    responseTime: 10000, // 10s response time
    memoryUsage: 0.9,    // 90% memory usage
    cpuUsage: 0.95       // 95% CPU usage
  }
}
```

### Monitoring Configuration
```javascript
monitorOptions: {
  interval: 5000,        // 5 second monitoring interval
  alertThreshold: 0.8,   // 80% resource alert threshold
  continuous: true       // Continuous monitoring mode
}
```

## Integration Points

### SLO Monitoring
- Integrates with `scripts/ops/slo-monitor.ts`
- Validates burn-rate increases during chaos
- Compares against targets in `config/slo.json`

### Operational Scripts
- Uses `scripts/ops/parity-check.ts` for invariant validation
- Leverages `scripts/ops/ops-all.ts` for system verification
- Integrates with existing Docker Compose services

### Reporting System
- Outputs to standard `out/ops/` directory structure
- Compatible with existing operational dashboards
- Follows established JSON report format

## Output Structure

### Main Test Report (`out/ops/chaos-test-report.json`)
```json
{
  "metadata": {
    "timestamp": "2025-01-XX",
    "test_duration_seconds": 300,
    "overall_success": true
  },
  "phases": {
    "pre_flight_checks": { "allPassed": true },
    "chaos_execution": { "success": true },
    "monitoring": { "totalAlerts": 5 },
    "post_validation": { "allPassed": true }
  },
  "resilience_metrics": {
    "system_recovery_time": 15,
    "alert_volume": 5,
    "critical_incidents": 0,
    "parity_maintained": true
  }
}
```

### Monitoring Report (`out/ops/chaos-monitor.json`)
- Real-time health metrics
- Alert history and analysis
- SLO violation tracking
- Performance trend analysis

### Chaos Execution Log (`out/ops/chaos.json`)
- Detailed chaos injection log
- Recovery procedure execution
- Safety threshold events
- System metric history

## Best Practices

### Test Scheduling
1. **Development**: Run quick tests during feature development
2. **Staging**: Execute comprehensive tests before releases
3. **Production Planning**: Use results to plan production resilience

### Progressive Testing
1. Start with `quick-resilience` tests
2. Graduate to `standard-chaos` for regular testing
3. Run `comprehensive` tests for major releases
4. Use individual modes for targeted investigation

### Result Analysis
1. Monitor alert volume trends over time
2. Track system recovery time improvements
3. Validate SLO compliance under stress
4. Use recommendations for system hardening

### Integration with CI/CD
```yaml
# Example GitHub Actions integration
- name: Chaos Engineering Test
  run: |
    node scripts/ops/chaos-runner.js --test standard-chaos --monitor
    if [ $? -ne 0 ]; then
      echo "Chaos test failed - system requires hardening"
      exit 1
    fi
```

## Troubleshooting

### Common Issues

**Pre-flight Failures**
- Check environment variables (`SHADOW_MODE=true`, `PUBLISH_TO_DISCORD=false`)
- Verify Docker services are running
- Confirm database connectivity

**Chaos Execution Failures**
- Review system resource availability
- Check for conflicting processes
- Verify network connectivity

**Monitoring Issues**
- Confirm API endpoints are accessible
- Check disk space in output directory
- Verify monitoring interval settings

### Emergency Recovery

If chaos testing goes wrong:
1. **Immediate**: Press Ctrl+C to trigger emergency rollback
2. **Manual Cleanup**: Run `docker-compose restart` to reset services
3. **Validation**: Use `node scripts/ops/chaos-runner.js --validate-all` to verify recovery

## Development and Extension

### Adding New Chaos Modes
1. Define mode in `CHAOS_CONFIG.modes`
2. Implement execution method in `ChaosEngineeringFramework`
3. Add recovery procedure registration
4. Update help documentation

### Custom Scenarios
1. Add scenario to `CHAOS_CONFIG.scenarios`
2. Define phases with modes, severity, and duration
3. Test with monitoring enabled
4. Document expected behavior

### Monitoring Extensions
1. Extend `collectMetrics()` for new data sources
2. Add custom alert conditions in `checkAlerts()`
3. Implement specialized validators
4. Update report generation

## Related Documentation

- [SLO Monitoring](./SLO_MONITORING.md) - SLO integration and burn-rate analysis
- [Operational Scripts](../scripts/ops/README.md) - Integration with existing ops tools
- [Environment Setup](./ENVIRONMENT_SETUP.md) - Required configuration and services
- [System Health](./SYSTEM_HEALTH_REPORT.md) - Health monitoring and alerting

For questions or issues with chaos engineering, consult the operational runbooks or create an issue in the project repository.