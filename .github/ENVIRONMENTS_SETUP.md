# GitHub Environments Setup for Unit Talk CI/CD

## Overview

This document outlines the GitHub Environments configuration required for the Unit Talk CI/CD pipeline to function securely and efficiently.

## Required Environments

### 1. `ci-testing` Environment

**Purpose**: Isolated environment for CI pipeline testing and validation

**Protection Rules**:
- Required reviewers: None (automated CI)
- Wait timer: 0 minutes
- Allowed branches: All branches (for CI runs)

**Required Secrets**:
```
# Database (for E2E shadow tests)
DATABASE_URL_TEST=postgresql://...  # Test database connection string
REDIS_URL_TEST=redis://...           # Test Redis instance

# API Services (for integration tests)
ESPN_API_KEY_TEST=test_key          # ESPN API test key (rate limited)
ODDS_API_KEY_TEST=test_key          # The Odds API test key

# External Services (disabled in CI)
DISCORD_WEBHOOK_URL_TEST=disabled   # Disabled for shadow mode
SLACK_WEBHOOK_URL_TEST=disabled     # Disabled for CI testing
```

**Required Variables**:
```
SHADOW_MODE=true                    # Always true in CI
PUBLISH_TO_DISCORD=false           # Always false in CI
NODE_ENV=test                      # Test environment
MAX_ALLOWED_PROMOTES_5MIN=20       # Flood guard limit
API_RATE_LIMIT_PER_MINUTE=100      # API rate limiting
```

### 2. `staging` Environment

**Purpose**: Staging environment for pre-production validation and ops health checks

**Protection Rules**:
- Required reviewers: 1 (ops team member)
- Wait timer: 0 minutes
- Allowed branches: `main`, `develop`, `staging/*`

**Required Secrets**:
```
# Production-like Database
DATABASE_URL_STAGING=postgresql://...     # Staging database
REDIS_URL_STAGING=redis://...            # Staging Redis

# API Services (production keys, rate limited)
ESPN_API_KEY=production_key               # Full ESPN API access
ODDS_API_KEY=production_key              # Full Odds API access
LINEAR_API_KEY=linear_token              # For ops health reporting
LINEAR_TEAM_ID=team_id                   # Linear team for issues

# External Integrations (limited)
DISCORD_WEBHOOK_URL_STAGING=staging_webhook  # Staging Discord channel
TEMPORAL_NAMESPACE=staging               # Temporal staging namespace
TEMPORAL_SERVER_URL=temporal-staging:7233

# Security & Monitoring
SENTRY_DSN=https://...                   # Error tracking
DATADOG_API_KEY=datadog_key             # Metrics and monitoring
GRAFANA_API_KEY=grafana_token           # Dashboard access
```

**Required Variables**:
```
SHADOW_MODE=false                        # Real operations in staging
PUBLISH_TO_DISCORD=true                  # Limited publishing
NODE_ENV=staging                         # Staging environment
MAX_ALLOWED_PROMOTES_5MIN=50             # Higher limit for staging
API_RATE_LIMIT_PER_MINUTE=500           # Higher rate limit
ENABLE_DEBUG_LOGS=true                   # Detailed logging
```

### 3. `production-gate` Environment

**Purpose**: Final validation gate before production deployment

**Protection Rules**:
- Required reviewers: 2 (senior developers + ops)
- Wait timer: 5 minutes
- Allowed branches: `main` only
- Deployment branch policy: `main` only

**Required Secrets**:
```
# Production Database (read-only for validation)
DATABASE_URL_READONLY=postgresql://...   # Read-only production access
REDIS_URL_READONLY=redis://...          # Read-only Redis access

# Validation Services
PRODUCTION_HEALTH_CHECK_URL=https://...  # Production health endpoint
MONITORING_API_KEY=monitoring_token      # For pre-deployment checks
```

**Required Variables**:
```
DEPLOYMENT_READINESS_CHECK=true          # Enable readiness validation
BREAKING_CHANGE_APPROVAL_REQUIRED=true   # Require manual approval for breaking changes
PRODUCTION_VALIDATION_TIMEOUT=300       # 5 minute timeout for validation
```

### 4. `production` Environment

**Purpose**: Production deployment and operations

**Protection Rules**:
- Required reviewers: 2 (ops team + senior developer)
- Wait timer: 10 minutes
- Allowed branches: `main` only
- Deployment branch policy: `main` only
- Required status checks: All CI jobs must pass

**Required Secrets**:
```
# Production Database & Infrastructure
DATABASE_URL=postgresql://...            # Production database
REDIS_URL=redis://...                   # Production Redis
TEMPORAL_NAMESPACE=production           # Production Temporal
TEMPORAL_SERVER_URL=temporal:7233

# External API Services (production)
ESPN_API_KEY=production_espn_key        # Production ESPN API
ODDS_API_KEY=production_odds_key        # Production Odds API

# Communication & Notifications
DISCORD_WEBHOOK_URL=prod_discord        # Production Discord channel
SLACK_WEBHOOK_URL=prod_slack            # Production Slack alerts
LINEAR_API_KEY=linear_production        # Linear production issues
LINEAR_TEAM_ID=prod_team_id

# Monitoring & Observability
SENTRY_DSN=https://prod.sentry.io/...   # Production error tracking
DATADOG_API_KEY=prod_datadog_key        # Production monitoring
GRAFANA_API_KEY=prod_grafana_token      # Production dashboards
NEW_RELIC_LICENSE_KEY=newrelic_key      # Application monitoring

# Security & Auth
JWT_SECRET=production_jwt_secret         # Production JWT signing
ENCRYPTION_KEY=production_encryption     # Data encryption key
SUPABASE_SERVICE_ROLE_KEY=supabase_key  # Database service role

# Feature Flags & Configuration
FEATURE_FLAGS_API_KEY=launchdarkly_key  # Feature flag service
CONFIGURATION_API_KEY=config_service    # External configuration
```

**Required Variables**:
```
NODE_ENV=production                      # Production environment
SHADOW_MODE=false                       # Real operations
PUBLISH_TO_DISCORD=true                 # Full publishing enabled
MAX_ALLOWED_PROMOTES_5MIN=100           # Production rate limits
API_RATE_LIMIT_PER_MINUTE=1000         # Production API limits
ENABLE_DEBUG_LOGS=false                 # Disable debug logging
DEPLOYMENT_NOTIFICATION_ENABLED=true    # Enable deployment notifications
HEALTH_CHECK_INTERVAL_SECONDS=30        # Production health check frequency
```

## Environment Setup Instructions

### Step 1: Create Environments

1. Navigate to your repository on GitHub
2. Go to Settings → Environments
3. Click "New environment" for each environment listed above
4. Configure protection rules as specified

### Step 2: Configure Secrets and Variables

For each environment:

1. Click on the environment name
2. Add all required secrets in the "Environment secrets" section
3. Add all required variables in the "Environment variables" section
4. Ensure sensitive values use GitHub Secrets, not variables

### Step 3: Validate Environment Setup

Run this validation script in your repository:

```bash
# Validate environment configuration
npm run ci:validate-environments
```

### Step 4: Test Environment Access

Create a test workflow to validate environment access:

```yaml
# .github/workflows/environment-test.yml
name: Environment Validation Test

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to test'
        required: true
        default: 'ci-testing'
        type: choice
        options:
          - ci-testing
          - staging
          - production-gate
          - production

jobs:
  test-environment:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    
    steps:
      - name: Test environment access
        run: |
          echo "Testing environment: ${{ inputs.environment }}"
          echo "DATABASE_URL is set: ${{ secrets.DATABASE_URL != '' }}"
          echo "NODE_ENV: ${{ vars.NODE_ENV }}"
          echo "SHADOW_MODE: ${{ vars.SHADOW_MODE }}"
```

## Security Best Practices

### Secret Management
- **Never hardcode secrets** in workflow files
- Use **environment-specific secrets** for different deployment stages
- **Rotate secrets regularly** (every 90 days for production)
- **Use least-privilege access** for each environment

### Environment Isolation
- **Separate databases** for each environment
- **Different API keys** for external services by environment
- **Isolated infrastructure** (containers, networks, storage)
- **Environment-specific monitoring** and alerting

### Access Control
- **Review requirements** for sensitive environments (staging, production)
- **Branch protection** rules aligned with environment access
- **Audit logging** enabled for all environment access
- **Regular access reviews** (quarterly)

## Troubleshooting

### Common Issues

1. **Secret not available in workflow**
   ```
   Error: Secret DATABASE_URL is not set
   ```
   - Verify secret is set in the correct environment
   - Check environment name matches workflow environment setting
   - Ensure workflow has access to the environment

2. **Environment protection rule blocking deployment**
   ```
   Error: Environment protection rule requires review
   ```
   - Add required reviewers to environment settings
   - Ensure proper branch protection is configured
   - Check if wait timer is configured correctly

3. **Database connection fails in CI**
   ```
   Error: Connection refused to database
   ```
   - Verify DATABASE_URL_TEST is correctly formatted
   - Check if database service is running in CI
   - Validate network connectivity in GitHub Actions

### Validation Commands

```bash
# Test database connection
npm run db:test-connection

# Validate all environment variables
npm run env:validate

# Test external API connections
npm run api:test-connections

# Validate CI/CD pipeline
npm run ci:validate-complete
```

## Maintenance

### Monthly Tasks
- Review and rotate non-production secrets
- Validate environment access logs
- Update rate limits based on usage patterns

### Quarterly Tasks
- Rotate production secrets
- Review environment access permissions
- Update environment protection rules
- Audit secret usage and cleanup unused secrets

### Annual Tasks
- Complete security audit of all environments
- Update all external API keys
- Review and update environment architecture
- Document any environment changes

## Support

For issues with environment setup:
1. Check this documentation first
2. Review GitHub Actions workflow logs
3. Validate secret/variable configuration
4. Contact the ops team for production environment issues

---

**Last Updated**: 2025-01-23
**Maintained By**: DevOps Team
**Review Schedule**: Quarterly