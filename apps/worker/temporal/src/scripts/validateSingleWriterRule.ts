#!/usr/bin/env tsx
/**
 * Single Writer Rule Validation Script
 * Validates that only the Promoter agent can write to unified_picks table
 *
 * Usage: tsx validateSingleWriterRule.ts
 */

import { AgentRegistry, SINGLE_WRITER_AGENT_ID } from '../agents/registry.js';
import { logger } from '@unit-talk/observability';

/**
 * Validation results interface
 */
interface ValidationResults {
  passed: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    totalAgents: number;
    singleWriterAgent: string | null;
    agentsWithUnifiedPicksRead: string[];
    agentsWithUnifiedPicksWrite: string[];
    shadowCompatibleAgents: string[];
  };
}

/**
 * Main validation function
 */
async function validateSingleWriterRule(): Promise<ValidationResults> {
  const results: ValidationResults = {
    passed: false,
    errors: [],
    warnings: [],
    summary: {
      totalAgents: 0,
      singleWriterAgent: null,
      agentsWithUnifiedPicksRead: [],
      agentsWithUnifiedPicksWrite: [],
      shadowCompatibleAgents: [],
    },
  };

  try {
    logger.info('🔍 Starting Single Writer Rule validation...');

    // Get all agents
    const allAgents = AgentRegistry.getAllAgents();
    results.summary.totalAgents = allAgents.length;

    logger.info(`📊 Found ${allAgents.length} agents to validate`);

    // Analyze agent capabilities
    for (const agent of allAgents) {
      // Check unified_picks read permissions
      if (agent.capabilities.canReadUnifiedPicks) {
        results.summary.agentsWithUnifiedPicksRead.push(agent.id);
      }

      // Check unified_picks write permissions (CRITICAL)
      if (agent.capabilities.canWriteUnifiedPicks) {
        results.summary.agentsWithUnifiedPicksWrite.push(agent.id);
      }

      // Check shadow mode support
      if (agent.capabilities.supportsShadowMode) {
        results.summary.shadowCompatibleAgents.push(agent.id);
      }

      // Validate individual agent configuration
      validateAgentConfiguration(agent, results);
    }

    // Validate single writer rule
    const singleWriterValidation = AgentRegistry.validateSingleWriterRule();

    if (!singleWriterValidation.valid) {
      results.errors.push(...singleWriterValidation.violations);
    } else {
      results.summary.singleWriterAgent = singleWriterValidation.singleWriter;
      logger.info(
        `✅ Single Writer Rule validated: ${singleWriterValidation.singleWriter}`
      );
    }

    // Additional validations
    validateDependencies(allAgents, results);
    validateShadowModeCompatibility(allAgents, results);
    validateSecurityConstraints(allAgents, results);

    // Determine overall pass/fail
    results.passed = results.errors.length === 0;

    // Log results
    logValidationResults(results);

    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.errors.push(`Validation script failed: ${errorMessage}`);
    logger.error('❌ Validation script failed', { error: errorMessage });
    return results;
  }
}

/**
 * Validate individual agent configuration
 */
function validateAgentConfiguration(
  agent: any,
  results: ValidationResults
): void {
  // Validate required fields
  if (!agent.id) {
    results.errors.push(`Agent missing required 'id' field`);
  }

  if (!agent.name) {
    results.errors.push(`Agent ${agent.id} missing required 'name' field`);
  }

  if (!agent.capabilities) {
    results.errors.push(
      `Agent ${agent.id} missing required 'capabilities' field`
    );
  }

  // Validate workflows and activities exist
  if (!agent.workflows || Object.keys(agent.workflows).length === 0) {
    results.warnings.push(`Agent ${agent.id} has no workflows defined`);
  }

  if (!agent.activities || Object.keys(agent.activities).length === 0) {
    results.warnings.push(`Agent ${agent.id} has no activities defined`);
  }

  // Validate priority range
  if (agent.priority < 1 || agent.priority > 10) {
    results.warnings.push(
      `Agent ${agent.id} priority ${agent.priority} outside recommended range (1-10)`
    );
  }
}

/**
 * Validate agent dependencies
 */
function validateDependencies(agents: any[], results: ValidationResults): void {
  const agentIds = new Set(agents.map(a => a.id));

  for (const agent of agents) {
    for (const depId of agent.dependencies || []) {
      if (!agentIds.has(depId)) {
        results.errors.push(
          `Agent ${agent.id} depends on non-existent agent: ${depId}`
        );
      }
    }

    // Check for circular dependencies (basic check)
    const dependencyChain = AgentRegistry.getDependencyChain(agent.id);
    if (dependencyChain.includes(agent.id)) {
      results.errors.push(`Agent ${agent.id} has circular dependency`);
    }
  }
}

/**
 * Validate shadow mode compatibility
 */
function validateShadowModeCompatibility(
  agents: any[],
  results: ValidationResults
): void {
  for (const agent of agents) {
    // Agents that can modify external state should support shadow mode
    if (
      (agent.capabilities.canSendNotifications ||
        agent.capabilities.canModifyBalances ||
        agent.capabilities.canWriteUnifiedPicks) &&
      !agent.capabilities.supportsShadowMode
    ) {
      results.warnings.push(
        `Agent ${agent.id} can modify external state but doesn't support shadow mode`
      );
    }

    // Critical agents should support dry run
    if (
      (agent.capabilities.canWriteUnifiedPicks ||
        agent.capabilities.canModifyBalances) &&
      !agent.capabilities.supportsDryRun
    ) {
      results.warnings.push(
        `Critical agent ${agent.id} should support dry run mode`
      );
    }
  }
}

/**
 * Validate security constraints
 */
function validateSecurityConstraints(
  agents: any[],
  results: ValidationResults
): void {
  // Ensure only specific agents can modify financial state
  const financialAgents = agents.filter(a => a.capabilities.canModifyBalances);
  const expectedFinancialAgents = ['settlement'];

  for (const agent of financialAgents) {
    if (!expectedFinancialAgents.includes(agent.id)) {
      results.warnings.push(
        `Unexpected agent ${agent.id} has financial modification permissions`
      );
    }
  }

  // Ensure notification permissions are appropriate
  const notificationAgents = agents.filter(
    a => a.capabilities.canSendNotifications
  );
  if (notificationAgents.length === 0) {
    results.warnings.push('No agents have notification permissions');
  }
}

/**
 * Log validation results
 */
function logValidationResults(results: ValidationResults): void {
  logger.info('🔍 Single Writer Rule Validation Results');
  logger.info('================================================');

  // Summary
  logger.info('📊 Summary:');
  logger.info(`  Total Agents: ${results.summary.totalAgents}`);
  logger.info(
    `  Single Writer Agent: ${results.summary.singleWriterAgent || 'NONE'}`
  );
  logger.info(
    `  Agents with unified_picks read: ${results.summary.agentsWithUnifiedPicksRead.join(', ')}`
  );
  logger.info(
    `  Agents with unified_picks write: ${results.summary.agentsWithUnifiedPicksWrite.join(', ')}`
  );
  logger.info(
    `  Shadow compatible agents: ${results.summary.shadowCompatibleAgents.join(', ')}`
  );

  // Errors
  if (results.errors.length > 0) {
    logger.error(`❌ ${results.errors.length} Error(s):`);
    results.errors.forEach((error, index) => {
      logger.error(`  ${index + 1}. ${error}`);
    });
  }

  // Warnings
  if (results.warnings.length > 0) {
    logger.warn(`⚠️  ${results.warnings.length} Warning(s):`);
    results.warnings.forEach((warning, index) => {
      logger.warn(`  ${index + 1}. ${warning}`);
    });
  }

  // Overall result
  if (results.passed) {
    logger.info('✅ Single Writer Rule Validation: PASSED');
  } else {
    logger.error('❌ Single Writer Rule Validation: FAILED');
  }

  logger.info('================================================');
}

/**
 * Run validation if script is executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  validateSingleWriterRule()
    .then(results => {
      process.exit(results.passed ? 0 : 1);
    })
    .catch(error => {
      logger.error('Validation script crashed', { error });
      process.exit(1);
    });
}

export { validateSingleWriterRule, ValidationResults };
