# SLO Monitoring System

Comprehensive latency SLO and burn-rate monitoring system for the Unit Talk pipeline, based on Temporal monitoring patterns.

## Overview

The SLO monitoring system measures real-time latency across three critical pipeline stages:

1. **Ingest → Processed**: `raw_props.inserted_at` → `raw_props.processed_at`
2. **Processed → Promoted**: `raw_props.processed_at` → `unified_picks.promoted_at` 
3. **End-to-End**: `raw_props.inserted_at` → `unified_picks.promoted_at`

## Architecture

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  SLO Collector  │───▶│  SLO Monitor    │───▶│  SLO Reporter   │
│  (Data Layer)   │    │  (Measurement)  │    │  (Output)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Database      │    │ Percentile      │    │ Dashboard       │
│   Queries       │    │ Calculation     │    │ Integration     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### File Structure

```
packages/observability/src/
├── slo-monitor.ts       # Core SLO measurement engine
├── slo-collector.ts     # Database data collection
├── slo-reporter.ts      # Report generation and export
├── dashboard-slo.ts     # Dashboard integration components
└── index.ts             # Package exports

config/
└── slo.json            # SLO targets and configuration

scripts/ops/
├── slo-monitor.ts      # CLI tool for SLO operations
├── slo-monitor.ps1     # Windows PowerShell wrapper
└── slo-ci-comment.ts   # CI/CD comment generation

out/ops/
├── slo.json            # Dashboard SLO data
└── slo-report-*.json   # Historical SLO reports
```

## Configuration

### SLO Targets (`config/slo.json`)

```json
{
  "slo_targets": {
    "ingest_to_processed_latency": {
      "targets": {
        "p50": 120,    // 2 minutes
        "p95": 300,    // 5 minutes  
        "p99": 600     // 10 minutes
      },
      "breach_thresholds": {
        "warning": 0.1,    // 10% breach rate
        "critical": 0.05   // 5% breach rate
      }
    },
    "processed_to_promoted_latency": {
      "targets": {
        "p50": 60,     // 1 minute
        "p95": 180,    // 3 minutes
        "p99": 300     // 5 minutes
      }
    },
    "end_to_end_latency": {
      "targets": {
        "p50": 180,    // 3 minutes
        "p95": 480,    // 8 minutes
        "p99": 900     // 15 minutes
      }
    }
  }
}
```

### Burn Rate Calculation

Error budget burn rate is calculated using:
- **Short Window**: 5-minute breach rate
- **Long Window**: 1-hour breach rate  
- **Monthly Budget**: Projects current burn rate over 30 days

**Alerting Thresholds**:
- Fast burn: 14.4x short-term, 6x long-term (2% budget in 1 hour)
- Slow burn: 6x short-term, 1x long-term (5% budget in 6 hours)

## Usage

### Command Line Interface

```bash
# Generate current SLO report
npm run ops:slo

# Generate 48-hour report
npm run ops:slo -- --period 48

# Dashboard data only
npm run ops:slo -- --dashboard

# Continuous monitoring
npm run ops:slo -- --continuous

# Test with mock data
npm run ops:slo -- --mock-data --verbose
```

### Windows PowerShell

```powershell
# Basic SLO report
.\scripts\ops\slo-monitor.ps1

# With options
.\scripts\ops\slo-monitor.ps1 -Period 48 -Verbose

# Continuous monitoring
.\scripts\ops\slo-monitor.ps1 -Continuous

# Test mode
.\scripts\ops\slo-monitor.ps1 -MockData -Dashboard
```

### CI/CD Integration

```bash
# Generate markdown comment
npm run ops:slo-comment

# JSON format for API posting
npm run ops:slo-comment -- --format json

# With PR context
npm run ops:slo-comment -- --pr 123

# Save to file
npm run ops:slo-comment -- --output comment.md
```

## Dashboard Integration

### HTML Integration

```html
<!-- Include SLO dashboard section -->
<div id="slo-section"></div>

<script>
// Load and display SLO data
fetch('/out/ops/slo.json')
  .then(response => response.json())
  .then(sloData => {
    document.getElementById('slo-section').innerHTML = 
      generateSLODashboardHTML(sloData, { compact: true });
  });
</script>
```

### React Component Example

```tsx
import { useEffect, useState } from 'react';
import { DashboardSLOData } from '@unit-talk/observability/slo-reporter';

function SLODashboard() {
  const [sloData, setSloData] = useState<DashboardSLOData | null>(null);

  useEffect(() => {
    const loadSLOData = async () => {
      const response = await fetch('/out/ops/slo.json');
      const data = await response.json();
      setSloData(data);
    };

    loadSLOData();
    const interval = setInterval(loadSLOData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (!sloData) return <div>Loading SLO data...</div>;

  return (
    <div className="slo-dashboard">
      <h3>Service Level Objectives</h3>
      
      <div className="grid grid-cols-3 gap-4">
        {/* SLO status indicators */}
        <SLOStatusCard 
          title="Ingest → Processed"
          data={sloData.slo_status.ingest_to_processed}
        />
        <SLOStatusCard 
          title="Processed → Promoted"
          data={sloData.slo_status.processed_to_promoted}
        />
        <SLOStatusCard 
          title="End-to-End"
          data={sloData.slo_status.end_to_end}
        />
      </div>

      {/* Error budget */}
      <ErrorBudgetCard budget={sloData.error_budget} />
    </div>
  );
}
```

## Programmatic API

### Basic Usage

```typescript
import { 
  sloMonitor, 
  sloCollector, 
  sloReporter 
} from '@unit-talk/observability';

// Configure data collection
sloCollector.setDatabaseClient(dbClient);
sloCollector.start();

// Measure SLOs manually
const dataPoints = await collectLatencyData();
const measurements = await sloMonitor.measureAllSLOs(dataPoints);

// Generate reports
const report = await sloReporter.generateReport(24);
const dashboardData = await sloReporter.generateDashboardData();
```

### Custom Integration

```typescript
import { SLOMonitor, LatencyDataPoint } from '@unit-talk/observability';

const customSLOMonitor = new SLOMonitor('./custom-slo-config.json');

// Measure custom data
const customData: LatencyDataPoint[] = [
  {
    id: 'record-1',
    inserted_at: new Date('2025-01-08T10:00:00Z'),
    processed_at: new Date('2025-01-08T10:02:00Z'),
    promoted_at: new Date('2025-01-08T10:03:30Z')
  }
];

const endToEndMeasurement = await customSLOMonitor.measureEndToEndLatency(customData);
console.log(`P95 latency: ${endToEndMeasurement.latencies.p95}s`);
console.log(`Compliance: ${endToEndMeasurement.slo_compliance.overall_score * 100}%`);
```

## Output Formats

### Dashboard Data (`out/ops/slo.json`)

```json
{
  "timestamp": "2025-01-08T12:00:00.000Z",
  "slo_status": {
    "ingest_to_processed": {
      "status": "green",
      "current_p95": 85.4,
      "target_p95": 300,
      "compliance_percentage": 96.8
    },
    // ... other metrics
  },
  "trends": {
    "ingest_to_processed_latency": [
      {
        "timestamp": "2025-01-08T11:30:00.000Z",
        "p95_latency": 87.1,
        "compliance_score": 0.97
      }
    ]
  },
  "error_budget": {
    "consumed_percentage": 18.4,
    "remaining_days": 24,
    "burn_rate": 0.024
  }
}
```

### SLO Report (`out/ops/slo-report-YYYY-MM-DD.json`)

```json
{
  "timestamp": "2025-01-08T12:00:00.000Z",
  "version": "1.0.0",
  "report_period": {
    "start": "2025-01-07T12:00:00.000Z",
    "end": "2025-01-08T12:00:00.000Z",
    "duration_hours": 24
  },
  "overall_health": {
    "status": "healthy",
    "availability_score": 96.1,
    "error_budget_remaining": 81.6
  },
  "slo_summaries": [
    {
      "metric_name": "ingest_to_processed_latency",
      "current_status": "green",
      "availability": 96.8,
      "error_budget_consumed": 18.4,
      "recent_breaches": 2,
      "trend": {
        "trend_direction": "improving",
        "trend_rate": -5.2,
        "confidence": 0.89
      }
    }
  ],
  "recommendations": [
    "WARNING: processed_to_promoted_latency shows degrading trend. Consider investigation.",
    "ERROR BUDGET: end_to_end_latency has consumed 18.4% of error budget."
  ]
}
```

## Alerting Integration

### GitHub Actions

```yaml
- name: Generate SLO Comment
  run: |
    npm run ops:slo
    npm run ops:slo-comment -- --pr ${{ github.event.number }} --format json > slo-comment.json

- name: Post SLO Comment
  uses: actions/github-script@v6
  with:
    script: |
      const fs = require('fs');
      const comment = JSON.parse(fs.readFileSync('slo-comment.json', 'utf8'));
      
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: comment.markdown_comment
      });
```

### Slack Webhook

```bash
# Generate text format and post to Slack
SLO_REPORT=$(npm run ops:slo-comment -- --format text)
curl -X POST -H 'Content-type: application/json' \
  --data "{\"text\":\"$SLO_REPORT\"}" \
  $SLACK_WEBHOOK_URL
```

## Troubleshooting

### Common Issues

**No SLO data available**
```bash
# Ensure SLO data is generated first
npm run ops:slo -- --mock-data

# Check output directory
ls -la out/ops/
```

**Database connection errors**
```typescript
// Verify database client is configured
sloCollector.setDatabaseClient(yourDbClient);

// Check connection
const status = sloCollector.getHealthStatus();
console.log(status);
```

**Invalid SLO configuration**
```bash
# Validate config syntax
cat config/slo.json | jq .

# Use default config if custom config fails
npm run ops:slo -- --mock-data
```

### Debug Mode

```bash
# Enable verbose logging
export LOG_LEVEL=debug
npm run ops:slo -- --verbose

# PowerShell
$env:LOG_LEVEL="debug"
.\scripts\ops\slo-monitor.ps1 -Verbose
```

## Performance Considerations

- **Data Collection**: 30-second intervals, 1000-record batches
- **Retention**: 7 days raw measurements, 30 days hourly, 1 year daily
- **Memory Usage**: ~10MB for 1000 measurements per metric
- **Database Impact**: Read-only queries with indexes on timestamp columns

## Roadmap

- [ ] Real-time alerting integration (PagerDuty, Slack)
- [ ] Advanced trend analysis with ML predictions
- [ ] Custom SLI definitions via configuration
- [ ] Integration with Grafana/Prometheus
- [ ] Mobile dashboard support
- [ ] Multi-tenant SLO management

---

*For implementation details, see the source code in `packages/observability/src/`*