# Elite Dashboard System

## Overview

The Elite Dashboard System is a comprehensive, real-time monitoring solution for the Unit Talk platform that integrates all elite monitoring systems into a single, professional war-room display suitable for operations teams.

## Architecture

### Core Components

1. **Elite Dashboard Aggregator** (`elite-dashboard-aggregator.ts`)
   - Collects data from all monitoring systems
   - Generates comprehensive dashboard data
   - Cross-platform compatibility (Windows/Unix)
   - Real-time health scoring and alert generation

2. **Visual Components** (`elite-dashboard-components.ts`)
   - Professional status tiles with red/green/yellow indicators
   - Real-time refresh with WebSocket support
   - Responsive design optimized for large screens
   - War-room mode with enhanced visibility

3. **Dashboard Server** (`elite-dashboard-server.ts`)
   - HTTP server for dashboard hosting
   - WebSocket support for real-time updates
   - API endpoints for monitoring data access
   - Cross-platform server implementation

4. **CLI Interface** (`elite-dashboard-cli.ts`)
   - Unified command-line interface
   - Commands for generation, serving, and management
   - Cross-platform script execution

5. **Integration Layer** (`elite-dashboard-integration.ts`)
   - CI/CD pipeline integration
   - Backwards compatibility with legacy systems
   - Slack/Linear integration hooks
   - GitHub Actions artifact generation

## Integrated Monitoring Systems

### ✅ Exposure Guardian
- **Purpose**: Risk management and breach detection
- **Metrics**: Total exposure, breach count, risk level
- **Alerts**: Critical exposure breaches trigger promotion blocks
- **File**: `exposure.json`

### ✅ Freeze Engine
- **Purpose**: Deployment freeze controls
- **Metrics**: Freeze status, upcoming freeze windows
- **Alerts**: Active freezes block deployments
- **File**: `freeze.json`

### ✅ Drift Detection
- **Purpose**: ML feature stability monitoring
- **Metrics**: Drift score, features with alerts, risk level
- **Alerts**: High drift triggers model retraining
- **File**: `drift.json`

### ✅ SLO Monitor
- **Purpose**: Service level objective tracking
- **Metrics**: P95 latencies, error budget consumption, compliance %
- **Alerts**: SLO violations impact error budget
- **File**: `slo.json`

### ✅ Toggle System
- **Purpose**: Feature flag management with two-person rule
- **Metrics**: Active toggles, pending proposals, system integrity
- **Alerts**: System integrity violations require attention
- **File**: Managed via toggle system APIs

### ✅ Core Services
- **Purpose**: Infrastructure health monitoring
- **Services**: API, Database, Temporal, Worker, Command Center
- **Metrics**: Response times, health status, service availability
- **Alerts**: Service failures trigger escalation

## Quick Start

### 1. Install Dependencies

```bash
npm install
# Ensure tsx is available for TypeScript execution
npm install -g tsx
```

### 2. Generate Dashboard Data

```bash
# One-time generation
npm run ops:dashboard generate

# Continuous monitoring
npm run ops:dashboard watch --refresh 30
```

### 3. Start Dashboard Server

```bash
# Start HTTP server with WebSocket support
npm run ops:dashboard serve --port 3001

# War-room mode with enhanced display
npm run ops:dashboard serve --war-room --port 3001
```

### 4. Access Dashboard

- **Main Dashboard**: http://localhost:3001
- **API Endpoint**: http://localhost:3001/api/dashboard/data
- **Health Check**: http://localhost:3001/api/health
- **Individual Systems**: http://localhost:3001/api/monitoring/{system}

## Command Reference

### CLI Commands

```bash
# Generate dashboard data once
npm run ops:dashboard generate

# Start dashboard server
npm run ops:dashboard serve [--port 3001] [--host 0.0.0.0] [--war-room]

# Watch mode - continuous generation
npm run ops:dashboard watch [--refresh 30]

# Run all monitoring systems + generate
npm run ops:dashboard monitor

# Check system status
npm run ops:dashboard status

# Clean up files
npm run ops:dashboard clean

# Show help
npm run ops:dashboard help
```

### Advanced Options

```bash
# Custom output directory
npm run ops:dashboard generate --output /path/to/output

# Disable WebSocket for server
npm run ops:dashboard serve --no-websocket

# Enable CORS for development
npm run ops:dashboard serve --cors

# War-room mode for large displays
npm run ops:dashboard serve --war-room
```

## API Endpoints

### Dashboard Data
- `GET /` - Main dashboard HTML
- `GET /api/dashboard/data` - Complete dashboard data JSON
- `POST /api/dashboard/refresh` - Force refresh data

### System Information
- `GET /api/health` - Server health check
- `GET /api/system/info` - System information

### Individual Monitoring Systems
- `GET /api/monitoring/exposure` - Exposure Guardian data
- `GET /api/monitoring/freeze` - Freeze Engine data
- `GET /api/monitoring/drift` - Drift Detection data
- `GET /api/monitoring/slo` - SLO Monitor data
- `GET /api/monitoring/toggles` - Toggle System data

## Integration

### CI/CD Pipeline Integration

The elite dashboard integrates seamlessly with CI/CD pipelines:

```bash
# Full integration with CI artifacts
npm run ops:dashboard-integration

# Generate CI summary only
npm run ops:dashboard-integration -- ops-all --ci
```

**Generated Artifacts:**
- `ci-health-summary.json` - Health summary for CI
- `github-actions-summary.md` - GitHub Actions summary
- `deployment-gate.json` - Deployment approval/block decision

### Backwards Compatibility

The system maintains backwards compatibility with existing monitoring:

- Legacy `dashboard.json` format is preserved
- Existing ops-all.ts integration works unchanged
- All existing monitoring scripts continue to function

### External Integrations

**Slack Notifications** (Optional):
```bash
npm run ops:dashboard-integration -- --slack
```

**Linear Issue Creation** (Optional):
```bash
npm run ops:dashboard-integration -- --linear
```

## Configuration

### Environment Variables

```bash
# Server Configuration
DASHBOARD_PORT=3001
DASHBOARD_HOST=0.0.0.0
WAR_ROOM_MODE=true

# Feature Flags
SKIP_DATABASE_CHECKS=false
SKIP_SUPABASE_EXEC_SQL=false
NOTIFICATIONS_ENABLED=true

# Integration Flags
PUBLISH_TO_DISCORD=false
SHADOW_MODE=false
ALLOW_PROMOTION_IN_SHADOW=false
MAX_ALLOWED_PROMOTES_5MIN=20
```

### File Structure

```
out/ops/
├── elite-dashboard.json      # Main elite dashboard data
├── elite-dashboard.html      # Static HTML file
├── dashboard.json           # Legacy format (backwards compatibility)
├── exposure.json            # Exposure Guardian data
├── freeze.json              # Freeze Engine data  
├── drift.json               # Drift Detection data
├── slo.json                 # SLO Monitor data
├── ci-health-summary.json   # CI/CD integration
├── github-actions-summary.md # GitHub Actions summary
└── deployment-gate.json     # Deployment approval decision
```

## War-Room Mode

War-room mode provides enhanced visibility for operations teams:

**Features:**
- Larger text and indicators
- High contrast colors
- Pulsing animations for critical alerts
- Optimized for large displays (1920px+)
- Audio notifications for critical alerts
- Keyboard shortcuts (Ctrl+R refresh, Ctrl+T toggle auto-refresh)

**Activation:**
```bash
npm run ops:dashboard serve --war-room
# or set environment variable
WAR_ROOM_MODE=true npm run ops:dashboard serve
```

## Monitoring Health Scoring

The dashboard calculates an overall health score (0-100) based on:

- **Systems Healthy**: +10 points per healthy system
- **Warning Issues**: -5 points per warning
- **Critical Issues**: -20 points per critical issue
- **Service Availability**: Based on response times
- **Alert Severity**: Weighted by impact and urgency

**Health Status Mapping:**
- **90-100**: Healthy (Green)
- **70-89**: Warning (Yellow)  
- **0-69**: Critical (Red)

## Real-Time Features

### WebSocket Updates
- Automatic client updates when data changes
- Connection health monitoring with ping/pong
- Graceful reconnection handling
- Broadcast to multiple connected clients

### Auto-Refresh
- Configurable refresh intervals (default: 30s)
- Data staleness detection
- Visual indicators for data freshness
- Manual refresh capability

### Visual Indicators
- **Green**: Healthy, no action required
- **Yellow**: Warning, monitor closely  
- **Red**: Critical, immediate action required
- **Pulsing**: Active critical alerts requiring attention
- **Gray**: Unknown status or service unavailable

## Troubleshooting

### Common Issues

**Dashboard not updating:**
```bash
# Check if server is running
npm run ops:dashboard status

# Force refresh data
curl -X POST http://localhost:3001/api/dashboard/refresh

# Restart server
npm run ops:dashboard serve
```

**Missing monitoring data:**
```bash
# Run all monitoring systems
npm run ops:dashboard monitor

# Check individual system status
npm run ops:dashboard status
```

**Permission errors (Windows):**
```bash
# Run with elevated permissions or use PowerShell
npm run ops:dashboard generate
```

### Debug Mode

Enable verbose logging:
```bash
DEBUG=elite-dashboard:* npm run ops:dashboard serve
```

## Development

### Adding New Monitoring Systems

1. **Create monitoring script** following existing patterns
2. **Add to aggregator** in `elite-dashboard-aggregator.ts`
3. **Create visual component** in `elite-dashboard-components.ts`
4. **Add API endpoint** in `elite-dashboard-server.ts`
5. **Update CLI integration** in `elite-dashboard-cli.ts`

### Testing

```bash
# Test dashboard generation
npm run ops:dashboard generate --output /tmp/test

# Test server functionality
npm run ops:dashboard serve --port 3002

# Test integration
npm run ops:dashboard-integration -- ops-all
```

## Production Deployment

### Docker Deployment

```dockerfile
# Add to existing Dockerfile
COPY scripts/ops/elite-dashboard-* /app/scripts/ops/
RUN npm install -g tsx

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1
```

### Process Management

```bash
# Using PM2
pm2 start "npm run ops:dashboard serve" --name elite-dashboard
pm2 start "npm run ops:dashboard watch" --name elite-monitor

# Systemd service
sudo systemctl enable elite-dashboard
sudo systemctl start elite-dashboard
```

### Monitoring the Monitor

- Health checks via `/api/health` endpoint
- Log monitoring for error patterns
- Resource usage monitoring (CPU, memory)
- WebSocket connection health
- Data freshness verification

## Security Considerations

- **No authentication required** for read-only dashboard
- **Internal network only** - not exposed to internet
- **Environment variable protection** - sensitive data via env vars
- **CORS control** - configurable based on deployment needs
- **Data sanitization** - all monitoring data is sanitized

## Performance

**Optimizations:**
- Caching of monitoring data
- Parallel monitoring system execution
- WebSocket connection pooling
- Static asset caching
- Efficient JSON parsing

**Resource Usage:**
- Memory: ~50-100MB
- CPU: <5% during normal operation
- Disk: <10MB for all data files
- Network: Minimal (local connections only)

---

## Support

For issues, questions, or feature requests related to the Elite Dashboard System:

1. Check the troubleshooting section above
2. Review logs in the console output
3. Ensure all dependencies are installed
4. Verify environment configuration
5. Test with basic generation/serve commands

The Elite Dashboard System is designed to be robust and fault-tolerant - it will gracefully degrade and continue providing basic monitoring even if individual components fail.