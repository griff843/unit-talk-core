// scripts/toggles/types.ts
// TypeScript definitions for the two-person rule toggle system

export interface ToggleState {
  id: string;
  key: string;
  value: string | boolean | number;
  description: string;
  category: 'runtime' | 'security' | 'limits' | 'features';
  appliedAt: string; // ISO timestamp
  appliedBy: string; // User/system identifier
  version: number; // Monotonic counter for replay protection
}

export interface ToggleProposal {
  id: string;
  toggleKey: string;
  currentValue: string | boolean | number;
  proposedValue: string | boolean | number;
  reason: string;
  category: 'runtime' | 'security' | 'limits' | 'features';
  proposedAt: string; // ISO timestamp
  proposedBy: string; // First approver identifier
  proposedBySignature: string; // HMAC signature
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  version: number; // Monotonic counter
}

export interface ToggleApproval {
  proposalId: string;
  approvedAt: string; // ISO timestamp
  approvedBy: string; // Second approver identifier
  approvedBySignature: string; // HMAC signature
  decision: 'approve' | 'reject';
  comments?: string;
  version: number; // Must match proposal version
}

export interface ToggleAuditEntry {
  timestamp: string; // ISO timestamp
  action: 'propose' | 'approve' | 'reject' | 'apply' | 'expire';
  proposalId?: string;
  toggleKey: string;
  actor: string; // User/system identifier
  signature: string; // HMAC signature for non-repudiation
  payload: ToggleProposal | ToggleApproval | ToggleState;
  version: number; // Global monotonic counter
}

export interface ToggleConfig {
  currentToggles: Record<string, ToggleState>;
  pendingProposals: Record<string, ToggleProposal>;
  version: number; // Global version counter
  lastUpdated: string;
}

export interface SignaturePayload {
  action: string;
  toggleKey: string;
  value: any;
  timestamp: string;
  actor: string;
  version: number;
  nonce?: string; // Additional entropy for signature uniqueness
}

export interface ToggleValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Predefined toggle keys with validation rules
export const KNOWN_TOGGLES = {
  PUBLISH_TO_DISCORD: {
    type: 'boolean' as const,
    category: 'runtime' as const,
    description: 'Enable Discord publishing for approved picks',
    defaultValue: false,
    requiresTwoPersonRule: true,
  },
  MAX_ALLOWED_PROMOTES_5MIN: {
    type: 'number' as const,
    category: 'limits' as const,
    description: 'Maximum promotions allowed in 5-minute window',
    defaultValue: 20,
    minValue: 1,
    maxValue: 100,
    requiresTwoPersonRule: true,
  },
  SHADOW_MODE: {
    type: 'boolean' as const,
    category: 'runtime' as const,
    description: 'Enable shadow mode for testing without side effects',
    defaultValue: true,
    requiresTwoPersonRule: true,
  },
  ALLOW_PROMOTION_IN_SHADOW: {
    type: 'boolean' as const,
    category: 'security' as const,
    description: 'Allow promotions during shadow mode',
    defaultValue: false,
    requiresTwoPersonRule: true,
  },
  ENABLE_METRICS: {
    type: 'boolean' as const,
    category: 'features' as const,
    description: 'Enable metrics collection and reporting',
    defaultValue: true,
    requiresTwoPersonRule: false,
  },
} as const;

export type KnownToggleKey = keyof typeof KNOWN_TOGGLES;
export type ToggleType = 'string' | 'boolean' | 'number';