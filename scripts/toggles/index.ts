// scripts/toggles/index.ts
// Main exports for the secure two-person rule toggle system

// Core types
export type {
  ToggleState,
  ToggleProposal,
  ToggleApproval,
  ToggleAuditEntry,
  ToggleConfig,
  SignaturePayload,
  ToggleValidationResult,
  KnownToggleKey,
  ToggleType,
} from './types.js';

export { KNOWN_TOGGLES } from './types.js';

// Storage layer
export { ToggleStorage } from './storage.js';

// Cryptographic utilities
export {
  ToggleCrypto,
  createToggleCrypto,
  generateSecureKey,
  validateKeyStrength,
} from './crypto.js';

// Proposal system
export { ToggleProposer } from './toggle-propose.js';

// Approval system
export { ToggleApprover } from './toggle-approve.js';

// Runtime access
export {
  RuntimeToggleReader,
  getGlobalToggleReader,
  Toggles,
  ToggleEnvironmentBridge,
  type RuntimeToggleConfig,
} from './runtime-reader.js';

// Environment integration
export {
  SecureEnvironmentLoader,
  LegacyEnvironmentCompat,
  ConfigFactory,
  Config,
  secureEnvironment,
  bootstrapSecureToggles,
} from './environment-integration.js';

/**
 * High-level API for easy integration
 */
export class SecureToggleSystem {
  private proposer: import('./toggle-propose.js').ToggleProposer;
  private approver: import('./toggle-approve.js').ToggleApprover;
  private reader: RuntimeToggleReader;

  constructor(storageDir?: string) {
    this.proposer = new (require('./toggle-propose.js').ToggleProposer)(storageDir);
    this.approver = new (require('./toggle-approve.js').ToggleApprover)(storageDir);
    this.reader = new RuntimeToggleReader(storageDir);
  }

  /**
   * Propose a toggle change
   */
  async propose(
    toggleKey: string,
    proposedValue: string | boolean | number,
    reason: string,
    proposedBy: string
  ): Promise<string> {
    return this.proposer.propose({
      toggleKey,
      proposedValue,
      reason,
      proposedBy,
    });
  }

  /**
   * Approve or reject a proposal
   */
  async processProposal(
    proposalId: string,
    decision: 'approve' | 'reject',
    approvedBy: string,
    comments?: string
  ): Promise<void> {
    return this.approver.processProposal({
      proposalId,
      decision,
      approvedBy,
      comments,
    });
  }

  /**
   * Get current toggle value
   */
  async getToggle<T = any>(key: string): Promise<T> {
    return this.reader.getToggle<T>(key);
  }

  /**
   * List pending proposals
   */
  async listPendingProposals(): Promise<any[]> {
    return this.approver.listPendingProposals();
  }

  /**
   * Get system status
   */
  async getSystemStatus(): Promise<{
    togglesApplied: number;
    proposalsPending: number;
    systemIntegrity: boolean;
    lastValidation: string;
  }> {
    const pendingProposals = await this.listPendingProposals();
    const integrity = await this.approver.verifyIntegrity();
    const currentToggles = await this.reader.getAllToggles();

    return {
      togglesApplied: Object.keys(currentToggles).length,
      proposalsPending: pendingProposals.length,
      systemIntegrity: integrity.valid,
      lastValidation: new Date().toISOString(),
    };
  }

  /**
   * Health check for monitoring
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    version: string;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check storage
      const storage = new ToggleStorage();
      const validation = await storage.validateStorage();
      
      if (!validation.valid) {
        errors.push(...validation.errors);
      }
      warnings.push(...validation.warnings);

      // Check integrity
      const integrity = await this.approver.verifyIntegrity();
      if (!integrity.valid) {
        errors.push(...integrity.errors);
      }

      // Check runtime config
      const runtimeValidation = await this.reader.validateRuntimeConfig();
      if (!runtimeValidation.valid) {
        errors.push(...runtimeValidation.errors);
      }
      warnings.push(...runtimeValidation.warnings);

    } catch (error) {
      errors.push(`Health check failed: ${(error as Error).message}`);
    }

    return {
      healthy: errors.length === 0,
      version: '1.0.0',
      errors,
      warnings,
    };
  }
}

/**
 * Create a secure toggle system instance
 */
export function createSecureToggleSystem(storageDir?: string): SecureToggleSystem {
  return new SecureToggleSystem(storageDir);
}

/**
 * Initialize the toggle system with environment integration
 */
export async function initializeToggleSystem(storageDir?: string): Promise<{
  system: SecureToggleSystem;
  config: any;
  status: any;
}> {
  // Bootstrap environment integration
  await bootstrapSecureToggles();

  // Create system instance
  const system = createSecureToggleSystem(storageDir);

  // Load configuration
  const config = await ConfigFactory.createConfig();

  // Get system status
  const status = await system.getSystemStatus();

  return { system, config, status };
}