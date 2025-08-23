/**
 * Temporal Agent Registry - Single Source of Truth for all agents
 * Provides typed agent definitions with shadow mode support and single-writer enforcement
 */

import * as alertActivities from '../activities/AlertActivities.js';
import * as analyticsActivities from '../activities/AnalyticsActivities.js';
import * as feedActivities from '../activities/feedActivities.js';
import * as gradingActivities from '../activities/gradingActivities.js';
import * as promoterActivities from '../activities/promoterActivities.js';
import * as settlementActivities from '../activities/SettlementActivities.js';
import * as alertWorkflows from '../workflows/AlertWorkflow.js';
import * as analyticsWorkflows from '../workflows/AnalyticsWorkflow.js';
import * as feedWorkflows from '../workflows/feedWorkflow.js';
import * as gradingWorkflows from '../workflows/gradingWorkflow.js';
import * as promoterWorkflows from '../workflows/promoterWorkflow.js';
import * as settlementWorkflows from '../workflows/SettlementWorkflow.js';

/**
 * Agent capabilities and permissions
 */
export interface AgentCapabilities {
  /** Can read from raw_props table */
  canReadRawProps: boolean;
  /** Can write to raw_props table */
  canWriteRawProps: boolean;
  /** Can read from unified_picks table */
  canReadUnifiedPicks: boolean;
  /** Can write to unified_picks table (ONLY Promoter should have this) */
  canWriteUnifiedPicks: boolean;
  /** Can send external notifications */
  canSendNotifications: boolean;
  /** Can modify user balances */
  canModifyBalances: boolean;
  /** Supports shadow mode operation */
  supportsShadowMode: boolean;
  /** Can be run in dry run mode */
  supportsDryRun: boolean;
}

/**
 * Agent configuration schema
 */
export interface AgentConfig {
  /** Agent unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Agent description */
  description: string;
  /** Agent version */
  version: string;
  /** Agent capabilities */
  capabilities: AgentCapabilities;
  /** Default shadow mode setting */
  defaultShadowMode: boolean;
  /** Workflow functions */
  workflows: Record<string, Function>;
  /** Activity functions */
  activities: Record<string, Function>;
  /** Agent priority (1 = highest, 10 = lowest) */
  priority: number;
  /** Dependencies on other agents */
  dependencies: string[];
  /** Tags for categorization */
  tags: string[];
}

/**
 * Single-Writer Rule Enforcement
 * CRITICAL: Only the Promoter agent should have canWriteUnifiedPicks = true
 */
const SINGLE_WRITER_AGENT_ID = 'promoter';

/**
 * Agent Registry - Typed definitions for all agents
 */
export const AGENT_REGISTRY: Record<string, AgentConfig> = {
  /**
   * FEED AGENT - Ingestion and processing (no unified_picks writes)
   */
  feed: {
    id: 'feed',
    name: 'Feed Agent',
    description: 'Handles data ingestion and processing from external sources',
    version: '1.0.0',
    capabilities: {
      canReadRawProps: true,
      canWriteRawProps: true,
      canReadUnifiedPicks: false,
      canWriteUnifiedPicks: false, // ✅ Compliant with single-writer rule
      canSendNotifications: false,
      canModifyBalances: false,
      supportsShadowMode: true,
      supportsDryRun: true,
    },
    defaultShadowMode: false,
    workflows: feedWorkflows,
    activities: feedActivities,
    priority: 1, // Highest priority - data ingestion
    dependencies: [],
    tags: ['ingestion', 'data', 'core'],
  },

  /**
   * GRADING AGENT - Analysis and scoring (no unified_picks writes)
   */
  grading: {
    id: 'grading',
    name: 'Grading Agent',
    description: 'Performs pick analysis, scoring, and grading',
    version: '1.0.0',
    capabilities: {
      canReadRawProps: true,
      canWriteRawProps: true, // Can mark as processed
      canReadUnifiedPicks: true, // Can read for analysis
      canWriteUnifiedPicks: false, // ✅ Compliant with single-writer rule
      canSendNotifications: false,
      canModifyBalances: false,
      supportsShadowMode: true,
      supportsDryRun: true,
    },
    defaultShadowMode: false,
    workflows: gradingWorkflows,
    activities: gradingActivities,
    priority: 2,
    dependencies: ['feed'],
    tags: ['analysis', 'scoring', 'ml', 'core'],
  },

  /**
   * PROMOTER AGENT - The ONLY agent that can write to unified_picks
   */
  promoter: {
    id: 'promoter',
    name: 'Promoter Agent',
    description: 'Promotes qualified picks to unified_picks (SINGLE WRITER)',
    version: '1.0.0',
    capabilities: {
      canReadRawProps: true,
      canWriteRawProps: true, // Can update promotion status
      canReadUnifiedPicks: true,
      canWriteUnifiedPicks: true, // ⚠️  ONLY agent with this permission
      canSendNotifications: true, // Can notify about promotions
      canModifyBalances: false,
      supportsShadowMode: true,
      supportsDryRun: true,
    },
    defaultShadowMode: false,
    workflows: promoterWorkflows,
    activities: promoterActivities,
    priority: 3,
    dependencies: ['grading'],
    tags: ['promotion', 'single-writer', 'critical'],
  },

  /**
   * SETTLEMENT AGENT - Settlement processing (reads unified_picks, no writes)
   */
  settlement: {
    id: 'settlement',
    name: 'Settlement Agent',
    description: 'Handles bet settlement and payout processing',
    version: '1.0.0',
    capabilities: {
      canReadRawProps: false,
      canWriteRawProps: false,
      canReadUnifiedPicks: true, // Reads picks for settlement
      canWriteUnifiedPicks: false, // ✅ Compliant with single-writer rule
      canSendNotifications: true,
      canModifyBalances: true, // Can update user balances
      supportsShadowMode: true,
      supportsDryRun: true,
    },
    defaultShadowMode: false,
    workflows: settlementWorkflows,
    activities: settlementActivities,
    priority: 4,
    dependencies: ['promoter'],
    tags: ['settlement', 'financial', 'critical'],
  },

  /**
   * ANALYTICS AGENT - Reporting and analysis (read-only in shadow mode)
   */
  analytics: {
    id: 'analytics',
    name: 'Analytics Agent',
    description: 'Provides analytics, reporting, and performance metrics',
    version: '1.0.0',
    capabilities: {
      canReadRawProps: true,
      canWriteRawProps: false,
      canReadUnifiedPicks: true,
      canWriteUnifiedPicks: false, // ✅ Compliant with single-writer rule
      canSendNotifications: false,
      canModifyBalances: false,
      supportsShadowMode: true,
      supportsDryRun: true,
    },
    defaultShadowMode: false,
    workflows: analyticsWorkflows,
    activities: analyticsActivities,
    priority: 7,
    dependencies: [],
    tags: ['analytics', 'reporting', 'metrics'],
  },

  /**
   * ALERT AGENT - Notification management
   */
  alert: {
    id: 'alert',
    name: 'Alert Agent',
    description: 'Manages notifications and alerts across multiple channels',
    version: '1.0.0',
    capabilities: {
      canReadRawProps: true,
      canWriteRawProps: false,
      canReadUnifiedPicks: true,
      canWriteUnifiedPicks: false, // ✅ Compliant with single-writer rule
      canSendNotifications: true,
      canModifyBalances: false,
      supportsShadowMode: true,
      supportsDryRun: true,
    },
    defaultShadowMode: false,
    workflows: alertWorkflows,
    activities: alertActivities,
    priority: 8,
    dependencies: [],
    tags: ['notifications', 'alerts', 'communication'],
  },
};

/**
 * Agent registry utility functions
 */
export class AgentRegistry {
  /**
   * Get agent by ID with type safety
   */
  static getAgent(agentId: string): AgentConfig | null {
    return AGENT_REGISTRY[agentId] || null;
  }

  /**
   * Get all agents sorted by priority
   */
  static getAllAgents(): AgentConfig[] {
    return Object.values(AGENT_REGISTRY).sort(
      (a, b) => a.priority - b.priority
    );
  }

  /**
   * Get agents by tag
   */
  static getAgentsByTag(tag: string): AgentConfig[] {
    return Object.values(AGENT_REGISTRY)
      .filter(agent => agent.tags.includes(tag))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get agents by capability
   */
  static getAgentsByCapability(
    capability: keyof AgentCapabilities,
    value: boolean = true
  ): AgentConfig[] {
    return Object.values(AGENT_REGISTRY)
      .filter(agent => agent.capabilities[capability] === value)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Validate single-writer rule compliance
   * CRITICAL: Ensures only one agent can write to unified_picks
   */
  static validateSingleWriterRule(): {
    valid: boolean;
    violations: string[];
    singleWriter: string | null;
  } {
    const writersToUnifiedPicks = Object.values(AGENT_REGISTRY)
      .filter(agent => agent.capabilities.canWriteUnifiedPicks)
      .map(agent => agent.id);

    const valid =
      writersToUnifiedPicks.length === 1 &&
      writersToUnifiedPicks[0] === SINGLE_WRITER_AGENT_ID;

    const violations: string[] = [];

    if (writersToUnifiedPicks.length === 0) {
      violations.push('No agent has canWriteUnifiedPicks permission');
    } else if (writersToUnifiedPicks.length > 1) {
      violations.push(
        `Multiple agents can write to unified_picks: ${writersToUnifiedPicks.join(', ')}`
      );
    } else if (writersToUnifiedPicks[0] !== SINGLE_WRITER_AGENT_ID) {
      violations.push(
        `Wrong agent has canWriteUnifiedPicks: ${writersToUnifiedPicks[0]} (expected: ${SINGLE_WRITER_AGENT_ID})`
      );
    }

    return {
      valid,
      violations,
      singleWriter:
        writersToUnifiedPicks.length === 1 ? writersToUnifiedPicks[0] : null,
    };
  }

  /**
   * Get agent dependency chain
   */
  static getDependencyChain(agentId: string): string[] {
    const agent = this.getAgent(agentId);
    if (!agent) return [];

    const chain: string[] = [];
    const visited = new Set<string>();

    const traverse = (id: string) => {
      if (visited.has(id)) return; // Avoid cycles
      visited.add(id);

      const currentAgent = this.getAgent(id);
      if (!currentAgent) return;

      for (const depId of currentAgent.dependencies) {
        traverse(depId);
        if (!chain.includes(depId)) {
          chain.push(depId);
        }
      }
    };

    traverse(agentId);
    return chain;
  }

  /**
   * Check if agent supports shadow mode
   */
  static supportsShadowMode(agentId: string): boolean {
    const agent = this.getAgent(agentId);
    return agent?.capabilities.supportsShadowMode || false;
  }

  /**
   * Get shadow-compatible agents
   */
  static getShadowCompatibleAgents(): AgentConfig[] {
    return this.getAgentsByCapability('supportsShadowMode', true);
  }
}

/**
 * Export types and constants
 */
export type AgentId = keyof typeof AGENT_REGISTRY;
export const AGENT_IDS = Object.keys(AGENT_REGISTRY) as AgentId[];
export { SINGLE_WRITER_AGENT_ID };

/**
 * Validate registry on module load
 */
const validation = AgentRegistry.validateSingleWriterRule();
if (!validation.valid) {
  throw new Error(
    `Agent Registry Single-Writer Rule Violation: ${validation.violations.join(', ')}`
  );
}
