# Secure Two-Person Rule Toggle System

A cryptographically secure toggle system implementing two-person rule governance with HMAC-SHA256 signatures, append-only audit trails, and runtime safety guarantees.

## Overview

This system provides secure configuration management for critical operational toggles with the following guarantees:

- **Two-Person Rule**: Any toggle change requires approval from two different people
- **Cryptographic Non-repudiation**: All operations are HMAC-SHA256 signed for audit integrity
- **Append-Only Audit**: Complete tamper-evident trail of all operations
- **Runtime Safety**: Only approved toggles affect application behavior
- **Windows Compatibility**: Safe file operations across all platforms

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   toggle-       │    │   toggle-       │    │   runtime-      │
│   propose.ts    │───▶│   approve.ts    │───▶│   reader.ts     │
│                 │    │                 │    │                 │
│ First Approver  │    │ Second Approver │    │ Application     │
│ Creates         │    │ Reviews &       │    │ Runtime Access  │
│ Proposals       │    │ Applies Changes │    │ (Read-Only)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Storage Layer                                │
│  ┌─────────────────┐           ┌─────────────────────────────┐  │
│  │   toggles.json  │           │   toggles.audit.jsonl      │  │
│  │   (State)       │           │   (Append-Only Audit)      │  │
│  │                 │           │                             │  │
│  │ • Current       │           │ • Timestamped entries      │  │
│  │   Toggles       │           │ • Cryptographic signatures │  │
│  │ • Pending       │           │ • Complete operation log   │  │
│  │   Proposals     │           │ • Non-repudiation proof    │  │
│  └─────────────────┘           └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Initialize the System

```bash
# Generate secure HMAC key for signing
echo "TOGGLE_HMAC_KEY=$(openssl rand -hex 32)" >> .env.local

# Create data directory
mkdir -p data/toggles
```

### 2. Create a Proposal

```bash
# First person proposes a change
tsx scripts/toggles/toggle-propose.ts propose \
  --key PUBLISH_TO_DISCORD \
  --value true \
  --reason "Enable Discord publishing for production deployment" \
  --by "alice@company.com"
```

### 3. Approve the Proposal

```bash
# Second person reviews and approves
tsx scripts/toggles/toggle-approve.ts approve \
  --id prop_abc123 \
  --by "bob@company.com" \
  --comments "Approved after security review"
```

### 4. Use in Application Code

```typescript
import { Toggles } from './scripts/toggles/index.js';

// Type-safe access to toggle values
const publishEnabled = await Toggles.getBool('PUBLISH_TO_DISCORD');
const maxPromotes = await Toggles.getNumber('MAX_ALLOWED_PROMOTES_5MIN');

if (publishEnabled && !shadowMode) {
  await publishToDiscord(pick);
}
```

## Supported Toggles

The system comes with predefined toggles that map to existing environment variables:

| Toggle Key | Type | Default | Description |
|------------|------|---------|-------------|
| `PUBLISH_TO_DISCORD` | boolean | `false` | Enable Discord publishing for approved picks |
| `SHADOW_MODE` | boolean | `true` | Enable shadow mode for testing without side effects |
| `ALLOW_PROMOTION_IN_SHADOW` | boolean | `false` | Allow promotions during shadow mode |
| `MAX_ALLOWED_PROMOTES_5MIN` | number | `20` | Maximum promotions allowed in 5-minute window |
| `ENABLE_METRICS` | boolean | `true` | Enable metrics collection and reporting |

## Command Reference

### Proposal Commands

```bash
# Create a proposal
tsx scripts/toggles/toggle-propose.ts propose \
  --key <toggle-key> \
  --value <new-value> \
  --reason "<justification>" \
  --by "<proposer-email>"

# List pending proposals
tsx scripts/toggles/toggle-propose.ts list [--key <key>] [--by <proposer>]

# Show proposal details
tsx scripts/toggles/toggle-propose.ts show --id <proposal-id>

# Expire old proposals
tsx scripts/toggles/toggle-propose.ts expire [--max-age-hours 168]
```

### Approval Commands

```bash
# Approve a proposal
tsx scripts/toggles/toggle-approve.ts approve \
  --id <proposal-id> \
  --by "<approver-email>" \
  [--comments "<optional-comments>"]

# Reject a proposal
tsx scripts/toggles/toggle-approve.ts reject \
  --id <proposal-id> \
  --by "<approver-email>" \
  [--comments "<rejection-reason>"]

# List pending proposals
tsx scripts/toggles/toggle-approve.ts list [--key <key>]

# Show current toggle values
tsx scripts/toggles/toggle-approve.ts current [--key <key>]

# View toggle history
tsx scripts/toggles/toggle-approve.ts history --key <key> [--limit 20]

# Verify system integrity
tsx scripts/toggles/toggle-approve.ts verify
```

## Integration Patterns

### Environment Variable Integration

The system integrates seamlessly with existing environment variable patterns:

```typescript
import { bootstrapSecureToggles, ConfigFactory } from './scripts/toggles/index.js';

// Initialize at application startup
await bootstrapSecureToggles();

// Get configuration with toggle overrides
const config = await ConfigFactory.createConfig();

// Validate configuration
const validation = await ConfigFactory.validateConfig();
if (!validation.valid) {
  console.error('Configuration errors:', validation.errors);
  process.exit(1);
}
```

### Temporal Workflow Integration

For use with Temporal workflows, the system provides environment bridge integration:

```typescript
import { Config } from './scripts/toggles/index.js';

// In workflow or activity
const shadowMode = await Config.getBool('SHADOW_MODE');
const maxPromotes = await Config.getNumber('MAX_ALLOWED_PROMOTES_5MIN');

if (!shadowMode && promotionCount > maxPromotes) {
  throw new Error(`Promotion rate limit exceeded: ${promotionCount} > ${maxPromotes}`);
}
```

### Production Deployment

```typescript
import { initializeToggleSystem } from './scripts/toggles/index.js';

// Initialize system at startup
const { system, config, status } = await initializeToggleSystem();

console.log(`Toggle system initialized: ${status.togglesApplied} toggles active`);

// Health check endpoint
app.get('/health/toggles', async (req, res) => {
  const health = await system.healthCheck();
  res.status(health.healthy ? 200 : 500).json(health);
});
```

## Security Model

### Cryptographic Guarantees

1. **HMAC-SHA256 Signatures**: All operations signed with 256-bit keys
2. **Nonce Protection**: Unique signatures prevent replay attacks  
3. **Tamper Detection**: Any modification breaks cryptographic verification
4. **Key Rotation**: Support for KMS integration and key rotation

### Operational Security

1. **Two-Person Rule**: Enforced cryptographically, cannot be bypassed
2. **Audit Trail**: Complete immutable log of all operations
3. **Least Privilege**: Runtime only accesses approved values
4. **Fail Safe**: Defaults to secure values on any error

### Compliance Features

- **SOX Compliance**: Non-repudiation and audit trails
- **Change Management**: Formal approval process with justification
- **Segregation of Duties**: Different people for proposal and approval
- **Evidence Collection**: Cryptographic proof of all operations

## File Structure

```
scripts/toggles/
├── types.ts                    # TypeScript type definitions
├── crypto.ts                   # HMAC-SHA256 signature utilities
├── storage.ts                  # File-based storage with Windows safety
├── toggle-propose.ts           # Proposal creation (CLI + API)
├── toggle-approve.ts           # Proposal approval (CLI + API)
├── runtime-reader.ts           # Runtime toggle access (read-only)
├── environment-integration.ts  # Environment variable bridge
├── test-integration.ts         # Comprehensive test suite
├── index.ts                   # Main exports and high-level API
└── README.md                  # This documentation

data/toggles/
├── toggles.json               # Current state (proposals + applied)
├── toggles.audit.jsonl        # Append-only audit log
└── *.backup.*                 # Automatic backups
```

## Testing

Run the comprehensive integration test suite:

```bash
tsx scripts/toggles/test-integration.ts
```

This tests:
- Cryptographic signature verification
- Two-person rule enforcement  
- File storage operations (Windows-safe)
- Audit trail integrity
- Runtime access patterns
- Environment integration
- Error handling and security scenarios
- Performance characteristics

## Monitoring and Alerting

### Health Checks

```typescript
import { createSecureToggleSystem } from './scripts/toggles/index.js';

const system = createSecureToggleSystem();

// Monitor system health
const health = await system.healthCheck();
if (!health.healthy) {
  console.error('Toggle system unhealthy:', health.errors);
  // Alert operations team
}
```

### Audit Monitoring

```bash
# Monitor for new proposals
tail -f data/toggles/toggles.audit.jsonl | grep '"action":"propose"'

# Monitor for approvals
tail -f data/toggles/toggles.audit.jsonl | grep '"action":"approve"'

# Check integrity regularly
tsx scripts/toggles/toggle-approve.ts verify
```

### Metrics

The system provides these metrics for monitoring:
- Number of active toggles
- Pending proposals (should be low)
- Failed integrity checks (should be zero)
- Average approval time
- Toggle usage frequency

## Cloud KMS Integration

For production deployment, integrate with cloud KMS for key management:

```typescript
// Future enhancement - KMS integration
import { KMSClient } from '@aws-sdk/client-kms';

const kms = new KMSClient({ region: 'us-east-1' });

// Use KMS-backed signing instead of environment key
const crypto = new ToggleCrypto({
  keyProvider: new KMSKeyProvider(kms, 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012')
});
```

## Troubleshooting

### Common Issues

**"TOGGLE_HMAC_KEY environment variable is required"**
- Set a secure HMAC key in your environment
- Generate with: `openssl rand -hex 32`

**"Two-person rule violation"**
- Ensure proposer and approver are different people
- Check email addresses in commands

**"Proposal validation failed"**
- Verify toggle key exists in KNOWN_TOGGLES
- Check value type matches expected type
- Ensure reason is at least 10 characters

**"Storage validation failed"**
- Check file permissions on data directory
- Verify JSON format in toggles.json
- Check for corrupted audit log

### Recovery Procedures

**Restore from Backup**
```bash
cp data/toggles/toggles.2024-01-15T10-30-00-000Z.backup.json data/toggles/toggles.json
cp data/toggles/toggles.audit.2024-01-15T10-30-00-000Z.backup.jsonl data/toggles/toggles.audit.jsonl
```

**Reset System State**
```bash
rm -rf data/toggles/*
tsx scripts/toggles/toggle-approve.ts verify  # Will recreate empty state
```

**Key Rotation**
```bash
# Generate new key
NEW_KEY=$(openssl rand -hex 32)

# Update environment
echo "TOGGLE_HMAC_KEY=$NEW_KEY" >> .env.local

# Verify system still works
tsx scripts/toggles/toggle-approve.ts verify
```

## Contributing

When adding new toggles:

1. Add to `KNOWN_TOGGLES` in `types.ts`
2. Add type definitions if needed
3. Update this README
4. Add test cases to `test-integration.ts`
5. Test the complete workflow

## License

This secure toggle system is part of the Unit Talk Core project and follows the same licensing terms.