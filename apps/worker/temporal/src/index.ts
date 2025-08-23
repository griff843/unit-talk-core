/**
 * Temporal Worker Entry Point
 * Exports all workflows, activities, and agent registry with single-writer rule enforcement
 */

// Export agent registry
export * from './agents/registry.js';

// Export all workflows
export * from './workflows/feedWorkflow.js';
export * from './workflows/gradingWorkflow.js';
export * from './workflows/promoterWorkflow.js';
export * from './workflows/AnalyticsWorkflow.js';
export * from './workflows/AlertWorkflow.js';
export * from './workflows/SettlementWorkflow.js';

// Export all activities
export * from './activities/feedActivities.js';
export * from './activities/gradingActivities.js';
export * from './activities/promoterActivities.js';
export * from './activities/AnalyticsActivities.js';
export * from './activities/AlertActivities.js';
export * from './activities/SettlementActivities.js';

// Export all adapters
export * from './adapters/feedAdapter.js';
export * from './adapters/gradingAdapter.js';
export * from './adapters/promoterAdapter.js';
export * from './adapters/analyticsAdapter.js';
export * from './adapters/alertAdapter.js';
export * from './adapters/settlementAdapter.js';

// Export validation utilities
export * from './scripts/validateSingleWriterRule.js';

/**
 * Temporal Worker Configuration
 */
import { AgentRegistry } from './agents/registry.js';

// Validate single-writer rule on module load
const validation = AgentRegistry.validateSingleWriterRule();
if (!validation.valid) {
  console.error('🚨 CRITICAL: Single Writer Rule Violation Detected!');
  console.error('Violations:', validation.violations);
  throw new Error(
    `Single Writer Rule Violation: ${validation.violations.join(', ')}`
  );
}

console.log('✅ Single Writer Rule validated successfully');
console.log(`📋 Registered ${AgentRegistry.getAllAgents().length} agents`);
console.log(`🎯 Single Writer: ${validation.singleWriter}`);

/**
 * Export workflow and activity functions for Temporal worker
 */
export const workflows = {
  // Feed workflows
  feedWorkflow: require('./workflows/feedWorkflow.js').feedWorkflow,
  feedStatisticsWorkflow: require('./workflows/feedWorkflow.js')
    .feedStatisticsWorkflow,
  feedHealthCheckWorkflow: require('./workflows/feedWorkflow.js')
    .feedHealthCheckWorkflow,

  // Grading workflows
  gradingWorkflow: require('./workflows/gradingWorkflow.js').gradingWorkflow,
  gradingHealthCheckWorkflow: require('./workflows/gradingWorkflow.js')
    .gradingHealthCheckWorkflow,

  // Promoter workflows (SINGLE WRITER)
  promoterWorkflow: require('./workflows/promoterWorkflow.js').promoterWorkflow,
  promoterHealthCheckWorkflow: require('./workflows/promoterWorkflow.js')
    .promoterHealthCheckWorkflow,

  // Analytics workflows
  analyticsWorkflow: require('./workflows/AnalyticsWorkflow.js')
    .analyticsWorkflow,
  analyticsHealthCheckWorkflow: require('./workflows/AnalyticsWorkflow.js')
    .analyticsHealthCheckWorkflow,

  // Alert workflows
  alertWorkflow: require('./workflows/AlertWorkflow.js').alertWorkflow,
  alertHealthCheckWorkflow: require('./workflows/AlertWorkflow.js')
    .alertHealthCheckWorkflow,

  // Settlement workflows
  settlementWorkflow: require('./workflows/SettlementWorkflow.js')
    .settlementWorkflow,
  settlementHealthCheckWorkflow: require('./workflows/SettlementWorkflow.js')
    .settlementHealthCheckWorkflow,
};

export const activities = {
  // Feed activities
  ...require('./activities/feedActivities.js'),

  // Grading activities
  ...require('./activities/gradingActivities.js'),

  // Promoter activities (SINGLE WRITER)
  ...require('./activities/promoterActivities.js'),

  // Analytics activities
  ...require('./activities/AnalyticsActivities.js'),

  // Alert activities
  ...require('./activities/AlertActivities.js'),

  // Settlement activities
  ...require('./activities/SettlementActivities.js'),
};

/**
 * Agent registry for runtime access
 */
export const agentRegistry = AgentRegistry;

/**
 * Shadow mode utilities
 */
export const shadowMode = {
  /**
   * Get all shadow-compatible agents
   */
  getCompatibleAgents: () => AgentRegistry.getShadowCompatibleAgents(),

  /**
   * Check if agent supports shadow mode
   */
  supportsAgent: (agentId: string) => AgentRegistry.supportsShadowMode(agentId),

  /**
   * Get agents that can safely run in shadow mode
   */
  getSafeAgents: () =>
    AgentRegistry.getAgentsByCapability('supportsShadowMode', true),
};

/**
 * Single-writer utilities
 */
export const singleWriter = {
  /**
   * Get the agent that can write to unified_picks
   */
  getWriterAgent: () => {
    const writers = AgentRegistry.getAgentsByCapability(
      'canWriteUnifiedPicks',
      true
    );
    return writers.length === 1 ? writers[0] : null;
  },

  /**
   * Validate single-writer rule
   */
  validate: () => AgentRegistry.validateSingleWriterRule(),

  /**
   * Get agents that can read from unified_picks
   */
  getReaderAgents: () =>
    AgentRegistry.getAgentsByCapability('canReadUnifiedPicks', true),
};

console.log('🚀 Temporal worker module loaded successfully');
console.log(`📊 Available workflows: ${Object.keys(workflows).length}`);
console.log(`⚡ Available activities: ${Object.keys(activities).length}`);
console.log(
  `🛡️ Shadow mode agents: ${shadowMode.getCompatibleAgents().length}`
);
console.log(
  `✍️ Single writer: ${singleWriter.getWriterAgent()?.name || 'NONE'}`
);
