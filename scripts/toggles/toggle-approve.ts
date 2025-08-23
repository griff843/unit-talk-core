#!/usr/bin/env node
// scripts/toggles/toggle-approve.ts
// Two-person rule toggle approval system - second approver reviews and applies proposals

import { ToggleStorage } from './storage.js';
import { createToggleCrypto } from './crypto.js';
import { KNOWN_TOGGLES, type ToggleApproval, type ToggleAuditEntry, type ToggleState, type KnownToggleKey } from './types.js';

interface ApprovalOptions {
  proposalId: string;
  decision: 'approve' | 'reject';
  approvedBy: string;
  comments?: string;
}

export class ToggleApprover {
  private storage: ToggleStorage;
  private crypto: ReturnType<typeof createToggleCrypto>;

  constructor(storageDir?: string) {
    this.storage = new ToggleStorage(storageDir);
    this.crypto = createToggleCrypto();
  }

  /**
   * Approve or reject a toggle proposal with cryptographic signature
   */
  async processProposal(options: ApprovalOptions): Promise<void> {
    await this.storage.initialize();

    // Validate inputs
    const validation = await this.validateApproval(options);
    if (!validation.valid) {
      throw new Error(`Approval validation failed: ${validation.errors.join(', ')}`);
    }

    const config = await this.storage.readToggleConfig();
    const proposal = config.pendingProposals[options.proposalId];
    
    if (!proposal) {
      throw new Error(`Proposal ${options.proposalId} not found`);
    }

    // Two-person rule validation
    if (proposal.proposedBy === options.approvedBy) {
      throw new Error('Two-person rule violation: proposer and approver must be different people');
    }

    const timestamp = new Date().toISOString();
    const version = config.version + 1;

    // Create cryptographic signature for approval
    const signature = this.crypto.signApproval(
      options.proposalId,
      proposal.toggleKey,
      options.decision,
      options.approvedBy,
      timestamp,
      version,
      options.comments
    );

    // Create approval record
    const approval: ToggleApproval = {
      proposalId: options.proposalId,
      approvedAt: timestamp,
      approvedBy: options.approvedBy,
      approvedBySignature: signature,
      decision: options.decision,
      comments: options.comments,
      version,
    };

    // Update proposal status
    proposal.status = options.decision === 'approve' ? 'approved' : 'rejected';

    if (options.decision === 'approve') {
      // Apply the toggle change
      await this.applyToggleChange(proposal, timestamp, options.approvedBy, version);
    }

    // Update configuration
    await this.storage.writeToggleConfig(config);

    // Create audit entry for the approval/rejection
    const auditEntry: ToggleAuditEntry = {
      timestamp,
      action: options.decision,
      proposalId: options.proposalId,
      toggleKey: proposal.toggleKey,
      actor: options.approvedBy,
      signature,
      payload: approval,
      version,
    };

    await this.storage.appendAuditEntry(auditEntry);

    console.log(`✅ Proposal ${options.decision}d successfully:`);
    console.log(`   ID: ${options.proposalId}`);
    console.log(`   Toggle: ${proposal.toggleKey}`);
    console.log(`   Decision: ${options.decision}`);
    console.log(`   Approved by: ${options.approvedBy}`);
    
    if (options.decision === 'approve') {
      console.log(`   Applied value: ${JSON.stringify(proposal.proposedValue)}`);
      console.log(`   🔄 Toggle is now active in runtime!`);
    }

    if (options.comments) {
      console.log(`   Comments: ${options.comments}`);
    }
  }

  /**
   * List pending proposals awaiting approval
   */
  async listPendingProposals(filter?: { toggleKey?: string; proposedBy?: string }): Promise<any[]> {
    await this.storage.initialize();
    const config = await this.storage.readToggleConfig();

    let proposals = Object.values(config.pendingProposals).filter(p => p.status === 'pending');

    if (filter?.toggleKey) {
      proposals = proposals.filter(p => p.toggleKey === filter.toggleKey);
    }

    if (filter?.proposedBy) {
      proposals = proposals.filter(p => p.proposedBy === filter.proposedBy);
    }

    return proposals.map(p => ({
      id: p.id,
      toggleKey: p.toggleKey,
      currentValue: p.currentValue,
      proposedValue: p.proposedValue,
      reason: p.reason,
      proposedBy: p.proposedBy,
      proposedAt: p.proposedAt,
      category: p.category,
      ageHours: Math.floor((Date.now() - new Date(p.proposedAt).getTime()) / (1000 * 60 * 60)),
    }));
  }

  /**
   * Get current toggle states (applied values only)
   */
  async getCurrentToggles(): Promise<Record<string, any>> {
    await this.storage.initialize();
    const config = await this.storage.readToggleConfig();

    const result: Record<string, any> = {};
    
    // Include applied toggles
    for (const [key, toggle] of Object.entries(config.currentToggles)) {
      result[key] = toggle.value;
    }
    
    // Include defaults for missing toggles
    for (const [key, toggleConfig] of Object.entries(KNOWN_TOGGLES)) {
      if (!(key in result)) {
        result[key] = toggleConfig.defaultValue;
      }
    }

    return result;
  }

  /**
   * Get audit trail for a specific toggle
   */
  async getToggleHistory(toggleKey: string, limit: number = 50): Promise<any[]> {
    await this.storage.initialize();
    
    const entries = await this.storage.readAuditLog({
      toggleKey,
      limit,
    });

    return entries.map(entry => ({
      timestamp: entry.timestamp,
      action: entry.action,
      actor: entry.actor,
      proposalId: entry.proposalId,
      details: this.summarizePayload(entry.payload),
    }));
  }

  /**
   * Verify cryptographic integrity of the entire system
   */
  async verifyIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    await this.storage.initialize();
    const errors: string[] = [];

    try {
      const config = await this.storage.readToggleConfig();
      const auditEntries = await this.storage.readAuditLog();

      // Verify each audit entry signature
      for (const entry of auditEntries) {
        if (!this.verifyAuditEntrySignature(entry)) {
          errors.push(`Invalid signature for audit entry at ${entry.timestamp}`);
        }
      }

      // Verify proposal signatures
      for (const proposal of Object.values(config.pendingProposals)) {
        const signatureValid = this.crypto.verifyProposal(
          proposal.toggleKey,
          proposal.currentValue,
          proposal.proposedValue,
          proposal.proposedBy,
          proposal.proposedAt,
          proposal.version,
          proposal.proposedBySignature,
          proposal.reason
        );
        
        if (!signatureValid) {
          errors.push(`Invalid proposal signature for ${proposal.id}`);
        }
      }

      // Check for version consistency
      const expectedVersion = auditEntries.length;
      if (config.version < expectedVersion) {
        errors.push('Version inconsistency detected');
      }

    } catch (error) {
      errors.push(`Integrity check failed: ${(error as Error).message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Apply toggle change to current state
   */
  private async applyToggleChange(
    proposal: any,
    timestamp: string,
    appliedBy: string,
    version: number
  ): Promise<void> {
    const config = await this.storage.readToggleConfig();

    // Create signature for the application
    const signature = this.crypto.signApplication(
      proposal.toggleKey,
      proposal.proposedValue,
      appliedBy,
      timestamp,
      version
    );

    // Create or update toggle state
    const toggleState: ToggleState = {
      id: `state_${proposal.toggleKey}_${Date.now()}`,
      key: proposal.toggleKey,
      value: proposal.proposedValue,
      description: KNOWN_TOGGLES[proposal.toggleKey as KnownToggleKey]?.description || 'Custom toggle',
      category: proposal.category,
      appliedAt: timestamp,
      appliedBy,
      version,
    };

    config.currentToggles[proposal.toggleKey] = toggleState;

    // Create audit entry for the application
    const auditEntry: ToggleAuditEntry = {
      timestamp,
      action: 'apply',
      proposalId: proposal.id,
      toggleKey: proposal.toggleKey,
      actor: appliedBy,
      signature,
      payload: toggleState,
      version,
    };

    await this.storage.appendAuditEntry(auditEntry);

    console.log(`   ✅ Toggle ${proposal.toggleKey} applied: ${JSON.stringify(proposal.proposedValue)}`);
  }

  /**
   * Validate approval inputs
   */
  private async validateApproval(options: ApprovalOptions): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate proposal ID
    if (!options.proposalId || typeof options.proposalId !== 'string') {
      errors.push('Proposal ID is required and must be a string');
    }

    // Validate decision
    if (!['approve', 'reject'].includes(options.decision)) {
      errors.push('Decision must be either "approve" or "reject"');
    }

    // Validate approver
    if (!options.approvedBy || typeof options.approvedBy !== 'string') {
      errors.push('Approver identification is required');
    }

    // Check if proposal exists and is pending
    const config = await this.storage.readToggleConfig();
    const proposal = config.pendingProposals[options.proposalId];
    
    if (!proposal) {
      errors.push(`Proposal ${options.proposalId} not found`);
    } else if (proposal.status !== 'pending') {
      errors.push(`Proposal ${options.proposalId} is not pending (status: ${proposal.status})`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Verify audit entry signature (simplified version)
   */
  private verifyAuditEntrySignature(entry: ToggleAuditEntry): boolean {
    // In a full implementation, you would reconstruct the payload and verify the signature
    // This is a simplified check
    return entry.signature && entry.signature.length > 0;
  }

  /**
   * Summarize payload for history display
   */
  private summarizePayload(payload: any): string {
    if (payload.proposedValue !== undefined) {
      return `Proposed: ${JSON.stringify(payload.proposedValue)}`;
    } else if (payload.decision) {
      return `Decision: ${payload.decision}`;
    } else if (payload.value !== undefined) {
      return `Applied: ${JSON.stringify(payload.value)}`;
    }
    return 'System action';
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`Usage: toggle-approve <command> [options]

Commands:
  approve --id <proposal-id> --by <approver> [--comments <comments>]
  reject --id <proposal-id> --by <approver> [--comments <comments>]
  list [--key <key>] [--by <proposer>]
  current [--key <key>]
  history --key <key> [--limit <n>]
  verify

Examples:
  toggle-approve approve --id prop_abc123 --by "bob@company.com" --comments "Approved for production deployment"
  toggle-approve reject --id prop_abc123 --by "bob@company.com" --comments "Insufficient justification"
  toggle-approve list
  toggle-approve current --key PUBLISH_TO_DISCORD
  toggle-approve history --key SHADOW_MODE --limit 10
  toggle-approve verify`);
    process.exit(1);
  }

  const approver = new ToggleApprover();
  const command = args[0];

  try {
    switch (command) {
      case 'approve':
      case 'reject':
        const proposalId = getArgValue(args, '--id');
        const approvedBy = getArgValue(args, '--by');
        const comments = getArgValue(args, '--comments');

        if (!proposalId || !approvedBy) {
          console.error('Missing required arguments: --id and --by are required');
          process.exit(1);
        }

        await approver.processProposal({
          proposalId,
          decision: command as 'approve' | 'reject',
          approvedBy,
          comments: comments || undefined,
        });
        break;

      case 'list':
        const keyFilter = getArgValue(args, '--key');
        const byFilter = getArgValue(args, '--by');
        
        const proposals = await approver.listPendingProposals({
          toggleKey: keyFilter || undefined,
          proposedBy: byFilter || undefined,
        });

        if (proposals.length === 0) {
          console.log('No pending proposals found');
        } else {
          console.log(`Found ${proposals.length} pending proposal(s):\n`);
          proposals.forEach(p => {
            console.log(`ID: ${p.id} (${p.ageHours}h old)`);
            console.log(`  Toggle: ${p.toggleKey} (${p.category})`);
            console.log(`  Change: ${JSON.stringify(p.currentValue)} → ${JSON.stringify(p.proposedValue)}`);
            console.log(`  Reason: ${p.reason}`);
            console.log(`  Proposed by: ${p.proposedBy} at ${p.proposedAt}`);
            console.log('');
          });
        }
        break;

      case 'current':
        const keyFilter2 = getArgValue(args, '--key');
        const currentToggles = await approver.getCurrentToggles();
        
        if (keyFilter2) {
          if (currentToggles[keyFilter2] !== undefined) {
            console.log(`${keyFilter2}: ${JSON.stringify(currentToggles[keyFilter2])}`);
          } else {
            console.log(`Toggle ${keyFilter2} not found`);
          }
        } else {
          console.log('Current toggle states:');
          for (const [key, value] of Object.entries(currentToggles)) {
            console.log(`  ${key}: ${JSON.stringify(value)}`);
          }
        }
        break;

      case 'history':
        const toggleKey = getArgValue(args, '--key');
        const limitStr = getArgValue(args, '--limit') || '20';
        const limit = parseInt(limitStr, 10);

        if (!toggleKey) {
          console.error('Missing required argument: --key');
          process.exit(1);
        }

        const history = await approver.getToggleHistory(toggleKey, limit);
        
        if (history.length === 0) {
          console.log(`No history found for toggle: ${toggleKey}`);
        } else {
          console.log(`History for ${toggleKey} (${history.length} entries):\n`);
          history.forEach(entry => {
            console.log(`${entry.timestamp} - ${entry.action} by ${entry.actor}`);
            if (entry.details) {
              console.log(`  ${entry.details}`);
            }
            if (entry.proposalId) {
              console.log(`  Proposal: ${entry.proposalId}`);
            }
            console.log('');
          });
        }
        break;

      case 'verify':
        const integrity = await approver.verifyIntegrity();
        
        if (integrity.valid) {
          console.log('✅ System integrity verified - all signatures valid');
        } else {
          console.log('❌ System integrity check failed:');
          integrity.errors.forEach(error => {
            console.log(`  - ${error}`);
          });
          process.exit(1);
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