# Environment Setup Guide

This guide covers secure environment management for the Unit Talk Core system.

## 📋 Quick Setup

1. **Copy the example file**: `cp .env.example .env`
2. **Fill in required values** (see sections below)
3. **Test configuration**: `npm run build` (validates config on startup)

## 🔐 Security Model

### Environment-Specific Configuration

| Environment | Secrets Storage | Shadow Mode | Debug Routes |
|-------------|----------------|-------------|--------------|
| Development | Local `.env` file | `true` (safe) | `true` (allowed) |
| Staging | GitHub Environments | `true` (safe) | `false` (required) |
| Production | GitHub Environments | `false` (required) | `false` (required) |

### GitHub Environments Setup

1. **Navigate to**: Repository → Settings → Environments
2. **Create environments**: `staging` and `production`
3. **Add protection rules**:
   - Production: Require reviewers
   - Staging: Auto-deploy from specific branches

## 🔑 Critical Environment Variables

### DATABASE_URL
- **Purpose**: Primary PostgreSQL connection string
- **Security**: Contains credentials - never commit to git
- **Format**: `postgresql://user:password@host:port/database`
- **Example**: `postgresql://postgres:mypassword@localhost:5432/unit_talk`

### SUPABASE_SERVICE_KEY
- **Purpose**: Server-side Supabase operations with admin privileges
- **Security**: ⚠️ **HIGHLY SENSITIVE** - Full database access
- **Required in**: All environments
- **Length**: 100+ characters starting with `eyJ`

### JWT_SECRET
- **Purpose**: Signing JSON Web Tokens for authentication
- **Security**: Must be cryptographically random (min 32 chars)
- **Generate**: `openssl rand -base64 32`
- **Production**: Never use development default

### SHADOW_MODE
- **Purpose**: Controls whether operations have real side effects
- **Values**: `true` = safe mode, `false` = real operations
- **Critical**: Must be `true` in CI/E2E tests, `false` in production

### PUBLISH_TO_DISCORD
- **Purpose**: Controls Discord message publishing
- **Values**: `true` = send messages, `false` = suppress
- **Critical**: Must be `false` in CI/E2E tests to prevent spam

## 📊 Configuration Categories

### Core Application
```bash
NODE_ENV=development              # Runtime environment
API_PORT=3000                    # HTTP server port
WORKER_CONCURRENCY=5             # Parallel worker processes  
WORKER_MAX_RETRIES=3             # Failed operation retries
```

### Database & Storage
```bash
DATABASE_URL=postgresql://...     # Primary database
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...          # Client-side key
SUPABASE_SERVICE_KEY=eyJ...       # Server-side key (sensitive)
DB_POOL_MIN=2                     # Connection pool minimum
DB_POOL_MAX=10                    # Connection pool maximum
```

### Feature Flags
```bash
SHADOW_MODE=true                  # Safe mode for CI/testing
PUBLISH_TO_DISCORD=false          # Message publishing control
MAX_ALLOWED_PROMOTES_5MIN=20      # Flood protection
ENABLE_DEBUG_ROUTES=false         # Debug endpoints (dev only)
ENABLE_ADMIN_ROUTES=false         # Admin operations
```

### Temporal Workflow Engine
```bash
TEMPORAL_SERVER_ADDRESS=localhost:7233  # Temporal server
TEMPORAL_TASK_QUEUE=unit-talk-queue     # Queue name
TEMPORAL_NAMESPACE=default              # Namespace
TEMPORAL_CLIENT_TIMEOUT=30              # Operation timeout (seconds)
```

### Observability & Monitoring
```bash
LOG_LEVEL=info                    # debug|info|warn|error
LOG_FORMAT=json                   # json|text
OTEL_ENABLED=false               # OpenTelemetry tracing
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
HEALTH_CHECK_TIMEOUT=5           # Health check timeout
HEALTH_CHECK_INTERVAL=30         # Health check frequency
```

### External Services
```bash
# Linear (Project Management)
LINEAR_API_KEY=lin_api_...        # Linear API token
LINEAR_TEAM_ID=abc123...          # Team identifier

# Discord (Notifications)
DISCORD_BOT_TOKEN=BOT...          # Discord bot token
DISCORD_GUILD_ID=123...           # Server ID
DISCORD_CHANNEL_PICKS=456...      # Pick notifications
DISCORD_CHANNEL_ALERTS=789...     # System alerts

# Sports Data
ESPN_API_KEY=...                  # ESPN API access
ODDS_API_KEY=...                  # The Odds API key
PROVIDER_RATE_LIMIT=100           # Requests per minute
```

### Security & Authentication
```bash
JWT_SECRET=random-32-char-string  # Token signing key
JWT_EXPIRES_IN=24h               # Token lifetime
RATE_LIMIT_WINDOW_MS=900000      # Rate limit window (15min)
RATE_LIMIT_MAX_REQUESTS=100      # Max requests per window
CORS_ORIGIN=http://localhost:3000 # Allowed origins
CORS_CREDENTIALS=true            # CORS credentials
```

### Infrastructure & Performance
```bash
# Redis (Caching)
REDIS_URL=redis://localhost:6379 # Redis connection
REDIS_TTL=3600                   # Default cache TTL

# Metrics
METRICS_PORT=9090                # Prometheus port
METRICS_PATH=/metrics            # Metrics endpoint

# Performance
MAX_REQUEST_SIZE=10mb            # Request body limit
REQUEST_TIMEOUT=30               # Request timeout
KEEP_ALIVE_TIMEOUT=5             # Keep-alive timeout
```

### Testing & Development
```bash
TEST_DATABASE_URL=postgresql://...  # Test database
E2E_TIMEOUT=30000                   # E2E test timeout (ms)
E2E_RETRY_ATTEMPTS=2                # Test retry count
DEV_ENABLE_PLAYGROUND=true          # API playground
DEV_MOCK_EXTERNAL_APIS=false        # Mock external calls
```

## 🚀 Deployment Checklist

### Staging Environment
- [ ] All secrets set in GitHub Environments
- [ ] `SHADOW_MODE=true` (safe testing)
- [ ] `PUBLISH_TO_DISCORD=false` (no spam)
- [ ] `ENABLE_DEBUG_ROUTES=false`
- [ ] Database connection valid
- [ ] External API keys configured

### Production Environment  
- [ ] All production secrets set
- [ ] `SHADOW_MODE=false` (real operations)
- [ ] `PUBLISH_TO_DISCORD=true` (actual notifications)
- [ ] `ENABLE_DEBUG_ROUTES=false` (security)
- [ ] `ENABLE_ADMIN_ROUTES=false` (unless needed)
- [ ] Strong `JWT_SECRET` (not development default)
- [ ] Production database configured
- [ ] Monitoring endpoints configured

## 🔍 Validation & Troubleshooting

### Configuration Validation
The system validates all environment variables at startup and provides detailed error messages:

```bash
# Test configuration validation
npm run build

# Expected output for valid config:
✅ Configuration validated successfully: {
  NODE_ENV: 'development',
  API_PORT: 3000,
  SHADOW_MODE: true,
  LOG_LEVEL: 'info',
  OTEL_ENABLED: false
}
```

### Common Validation Errors

**❌ DATABASE_URL validation failed**
- Fix: Ensure URL starts with `postgresql://` or `postgres://`
- Example: `postgresql://user:pass@localhost:5432/db`

**❌ Port validation failed**  
- Fix: Use ports between 1024-65535
- Avoid: Reserved ports (80, 443, 3001-3010)

**❌ Boolean validation failed**
- Fix: Use exactly `true` or `false` (lowercase)
- Invalid: `TRUE`, `True`, `1`, `0`, `yes`, `no`

**❌ Production validation failed**
- Fix: Set required production secrets in GitHub Environments
- Required: `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `LINEAR_API_KEY`, `DISCORD_BOT_TOKEN`

### Debug Mode
```bash
# Enable detailed validation logging
LOG_LEVEL=debug npm run build
```

### Safe Configuration Check
```javascript
import { envUtils } from '@unit-talk/config';

// Check configuration without exposing secrets
console.log(envUtils.getSafeConfig());
```

## 🔧 Advanced Usage

### Custom Validation
```typescript
import { validateConfig } from '@unit-talk/config';

// Validate specific environment variables
const testConfig = validateConfig({
  NODE_ENV: 'production',
  API_PORT: '3000',
  DATABASE_URL: 'postgresql://test:test@localhost/test'
});
```

### Configuration Utilities
```typescript
import { config, envUtils } from '@unit-talk/config';

// Environment checks
if (envUtils.isProduction()) {
  // Production-only logic
}

// Feature flags
if (envUtils.isShadowMode()) {
  // Safe mode operations
}

// Grouped configuration access
const dbConfig = config.database.supabase;
const apiConfig = config.api;
```

## 📚 Additional Resources

- [Unit Talk Core RUNBOOK](../RUNBOOK.md) - Operational procedures
- [GitHub Environments Documentation](https://docs.github.com/en/actions/deployment/targeting-different-environments)
- [Supabase Environment Variables](https://supabase.com/docs/guides/getting-started/local-development)
- [Temporal Configuration](https://docs.temporal.io/dev-guide/typescript/foundations)

## ⚠️ Security Reminders

1. **Never commit secrets to git** - Use `.env` for local, GitHub Environments for CI/CD
2. **Rotate secrets regularly** - Especially in production environments
3. **Use strong, random secrets** - Generate with cryptographic tools
4. **Monitor configuration drift** - Validate changes through CI/CD
5. **Principle of least privilege** - Only provide necessary access levels