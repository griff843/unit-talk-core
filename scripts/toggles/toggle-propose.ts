#!/usr/bin/env node
// scripts/toggles/toggle-propose.ts
// Two-person rule toggle proposal system - first approver creates proposals

import { randomBytes } from 'node:crypto';
import { ToggleStorage } from './storage.js';
import { createToggleCrypto } from './crypto.js';
import { KNOWN_TOGGLES, type ToggleProposal, type ToggleAuditEntry, type KnownToggleKey } from './types.js';

interface ProposalOptions {
  toggleKey: string;
  proposedValue: string | boolean | number;
  reason: string;
  proposedBy: string;
  expiresInHours?: number;
}

export class ToggleProposer {
  private storage: ToggleStorage;
  private crypto: ReturnType<typeof createToggleCrypto>;

  constructor(storageDir?: string) {
    this.storage = new ToggleStorage(storageDir);
    this.crypto = createToggleCrypto();
  }

  /**
   * Create a new toggle proposal with cryptographic signature
   */
  async propose(options: ProposalOptions): Promise<string> {
    await this.storage.initialize();

    // Validate inputs
    const validation = await this.validateProposal(options);
    if (!validation.valid) {
      throw new Error(`Proposal validation failed: ${validation.errors.join(', ')}`);
    }

    const config = await this.storage.readToggleConfig();
    const proposalId = this.generateProposalId();
    const timestamp = new Date().toISOString();
    const version = config.version + 1;

    // Get current value for comparison
    const currentValue = config.currentToggles[options.toggleKey]?.value ?? 
      this.getDefaultValue(options.toggleKey as KnownToggleKey);

    // Create cryptographic signature
    const signature = this.crypto.signProposal(
      options.toggleKey,
      currentValue,
      options.proposedValue,
      options.proposedBy,
      timestamp,
      version,
      options.reason
    );

    // Create proposal
    const proposal: ToggleProposal = {
      id: proposalId,
      toggleKey: options.toggleKey,
      currentValue,
      proposedValue: options.proposedValue,
      reason: options.reason,
      category: this.getToggleCategory(options.toggleKey as KnownToggleKey),
      proposedAt: timestamp,
      proposedBy: options.proposedBy,
      proposedBySignature: signature,
      status: 'pending',
      version,
    };

    // Add to pending proposals
    config.pendingProposals[proposalId] = proposal;
    await this.storage.writeToggleConfig(config);

    // Create audit entry
    const auditEntry: ToggleAuditEntry = {
      timestamp,
      action: 'propose',
      proposalId,
      toggleKey: options.toggleKey,
      actor: options.proposedBy,
      signature,
      payload: proposal,
      version,
    };

    await this.storage.appendAuditEntry(auditEntry);

    console.log(`✅ Proposal created successfully:`);
    console.log(`   ID: ${proposalId}`);
    console.log(`   Toggle: ${options.toggleKey}`);
    console.log(`   Current: ${JSON.stringify(currentValue)}`);
    console.log(`   Proposed: ${JSON.stringify(options.proposedValue)}`);
    console.log(`   Reason: ${options.reason}`);
    console.log(`   Proposed by: ${options.proposedBy}`);
    console.log(`   Status: pending approval`);

    return proposalId;
  }

  /**
   * List all pending proposals
   */
  async listProposals(filter?: { toggleKey?: string; proposedBy?: string }): Promise<ToggleProposal[]> {
    await this.storage.initialize();
    const config = await this.storage.readToggleConfig();

    let proposals = Object.values(config.pendingProposals);

    if (filter?.toggleKey) {
      proposals = proposals.filter(p => p.toggleKey === filter.toggleKey);
    }

    if (filter?.proposedBy) {
      proposals = proposals.filter(p => p.proposedBy === filter.proposedBy);
    }

    return proposals.sort((a, b) => new Date(a.proposedAt).getTime() - new Date(b.proposedAt).getTime());
  }

  /**
   * Get details of a specific proposal
   */
  async getProposal(proposalId: string): Promise<ToggleProposal | null> {
    await this.storage.initialize();
    const config = await this.storage.readToggleConfig();
    return config.pendingProposals[proposalId] || null;
  }

  /**
   * Expire old pending proposals (cleanup utility)
   */
  async expireOldProposals(maxAgeHours: number = 168): Promise<string[]> {
    await this.storage.initialize();
    const config = await this.storage.readToggleConfig();
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    const expiredIds: string[] = [];

    for (const [id, proposal] of Object.entries(config.pendingProposals)) {
      if (proposal.status === 'pending' && new Date(proposal.proposedAt) < cutoff) {
        proposal.status = 'expired';
        expiredIds.push(id);

        // Create audit entry for expiration
        const auditEntry: ToggleAuditEntry = {
          timestamp: new Date().toISOString(),
          action: 'expire',
          proposalId: id,
          toggleKey: proposal.toggleKey,
          actor: 'system',
          signature: this.crypto.signApplication(
            proposal.toggleKey,
            'expired',
            'system',
            new Date().toISOString(),
            config.version + 1
          ),
          payload: proposal,
          version: config.version + 1,
        };

        await this.storage.appendAuditEntry(auditEntry);
      }
    }

    if (expiredIds.length > 0) {
      await this.storage.writeToggleConfig(config);
    }

    return expiredIds;
  }

  /**
   * Validate proposal inputs
   */
  private async validateProposal(options: ProposalOptions): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate toggle key
    if (!options.toggleKey || typeof options.toggleKey !== 'string') {
      errors.push('Toggle key is required and must be a string');
    } else if (!KNOWN_TOGGLES[options.toggleKey as KnownToggleKey]) {
      errors.push(`Unknown toggle key: ${options.toggleKey}`);
    }

    // Validate proposed value type
    const toggleConfig = KNOWN_TOGGLES[options.toggleKey as KnownToggleKey];
    if (toggleConfig) {
      const valueType = typeof options.proposedValue;
      if (valueType !== toggleConfig.type) {
        errors.push(`Value type mismatch: expected ${toggleConfig.type}, got ${valueType}`);
      }

      // Additional validation based on type
      if (toggleConfig.type === 'number') {
        const numValue = Number(options.proposedValue);
        if ('minValue' in toggleConfig && numValue < toggleConfig.minValue!) {
          errors.push(`Value ${numValue} is below minimum ${toggleConfig.minValue}`);
        }
        if ('maxValue' in toggleConfig && numValue > toggleConfig.maxValue!) {
          errors.push(`Value ${numValue} is above maximum ${toggleConfig.maxValue}`);
        }
      }
    }

    // Validate reason
    if (!options.reason || typeof options.reason !== 'string' || options.reason.trim().length < 10) {
      errors.push('Reason is required and must be at least 10 characters');
    }

    // Validate proposer
    if (!options.proposedBy || typeof options.proposedBy !== 'string') {
      errors.push('Proposer identification is required');
    }

    // Check if there's already a pending proposal for this toggle
    const config = await this.storage.readToggleConfig();
    const existingProposal = Object.values(config.pendingProposals).find(
      p => p.toggleKey === options.toggleKey && p.status === 'pending'
    );
    
    if (existingProposal) {
      errors.push(`There is already a pending proposal for ${options.toggleKey} (ID: ${existingProposal.id})`);
    }

    // Validate two-person rule requirement
    if (toggleConfig?.requiresTwoPersonRule === false) {
      errors.push(`Toggle ${options.toggleKey} does not require two-person approval`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Generate unique proposal ID
   */
  private generateProposalId(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(4).toString('hex');
    return `prop_${timestamp}_${random}`;
  }

  /**
   * Get default value for a toggle key
   */
  private getDefaultValue(key: KnownToggleKey): any {
    const config = KNOWN_TOGGLES[key];
    return config?.defaultValue ?? null;
  }

  /**
   * Get category for a toggle key
   */
  private getToggleCategory(key: KnownToggleKey): 'runtime' | 'security' | 'limits' | 'features' {
    const config = KNOWN_TOGGLES[key];
    return config?.category ?? 'runtime';
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`Usage: toggle-propose <command> [options]

Commands:
  propose --key <key> --value <value> --reason <reason> --by <proposer>
  list [--key <key>] [--by <proposer>]
  show --id <proposal-id>
  expire [--max-age-hours <hours>]

Examples:
  toggle-propose propose --key PUBLISH_TO_DISCORD --value true --reason "Enable Discord publishing for production" --by "alice@company.com"
  toggle-propose list --key SHADOW_MODE
  toggle-propose show --id prop_abc123
  toggle-propose expire --max-age-hours 168`);
    process.exit(1);
  }

  const proposer = new ToggleProposer();
  const command = args[0];

  try {
    switch (command) {
      case 'propose':
        const toggleKey = getArgValue(args, '--key');
        const rawValue = getArgValue(args, '--value');
        const reason = getArgValue(args, '--reason');
        const proposedBy = getArgValue(args, '--by');

        if (!toggleKey || !rawValue || !reason || !proposedBy) {
          console.error('Missing required arguments for propose command');
          process.exit(1);
        }

        // Parse value based on type
        let proposedValue: any = rawValue;
        if (rawValue === 'true') proposedValue = true;
        else if (rawValue === 'false') proposedValue = false;
        else if (!isNaN(Number(rawValue))) proposedValue = Number(rawValue);

        const proposalId = await proposer.propose({
          toggleKey,
          proposedValue,
          reason,
          proposedBy,
        });

        console.log(`\n⚠️  REQUIRES APPROVAL: Proposal ${proposalId} needs a second approver`);
        console.log(`   Use: toggle-approve --id ${proposalId} --decision approve --by <second-approver>`);
        break;

      case 'list':
        const keyFilter = getArgValue(args, '--key');
        const byFilter = getArgValue(args, '--by');
        
        const proposals = await proposer.listProposals({
          toggleKey: keyFilter || undefined,
          proposedBy: byFilter || undefined,
        });

        if (proposals.length === 0) {
          console.log('No pending proposals found');
        } else {
          console.log(`Found ${proposals.length} proposal(s):\n`);
          proposals.forEach(p => {
            console.log(`ID: ${p.id}`);
            console.log(`  Toggle: ${p.toggleKey}`);
            console.log(`  Current: ${JSON.stringify(p.currentValue)} → Proposed: ${JSON.stringify(p.proposedValue)}`);
            console.log(`  Reason: ${p.reason}`);
            console.log(`  Proposed by: ${p.proposedBy} at ${p.proposedAt}`);
            console.log(`  Status: ${p.status}`);
            console.log('');
          });
        }
        break;

      case 'show':
        const proposalId2 = getArgValue(args, '--id');
        if (!proposalId2) {
          console.error('Missing --id argument');
          process.exit(1);
        }

        const proposal = await proposer.getProposal(proposalId2);
        if (!proposal) {
          console.log(`Proposal ${proposalId2} not found`);
          process.exit(1);
        }

        console.log(`Proposal Details:`);
        console.log(`  ID: ${proposal.id}`);
        console.log(`  Toggle: ${proposal.toggleKey}`);
        console.log(`  Current Value: ${JSON.stringify(proposal.currentValue)}`);
        console.log(`  Proposed Value: ${JSON.stringify(proposal.proposedValue)}`);
        console.log(`  Reason: ${proposal.reason}`);
        console.log(`  Category: ${proposal.category}`);
        console.log(`  Proposed By: ${proposal.proposedBy}`);
        console.log(`  Proposed At: ${proposal.proposedAt}`);
        console.log(`  Status: ${proposal.status}`);
        console.log(`  Version: ${proposal.version}`);
        break;

      case 'expire':
        const maxAgeStr = getArgValue(args, '--max-age-hours') || '168';
        const maxAge = parseInt(maxAgeStr, 10);
        
        const expired = await proposer.expireOldProposals(maxAge);
        console.log(`Expired ${expired.length} old proposal(s)`);
        if (expired.length > 0) {
          console.log(`Expired IDs: ${expired.join(', ')}`);
        }
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

function getArgValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}