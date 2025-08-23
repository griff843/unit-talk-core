/**
 * Memory Coordination Integration Examples
 * 
 * Demonstrates how the Memory Coordination Agent integrates with 
 * existing unit-talk-core components for knowledge persistence
 * and cross-session continuity.
 */

import { MemoryCoordinationService } from '../services/MemoryCoordinationService';
import { createLogger } from '@unit-talk/observability';

const logger = createLogger('memory-integration-examples');

// Example 1: Feed Agent Integration
export class FeedAgentMemoryIntegration {
  constructor(private memoryService: MemoryCoordinationService) {}

  /**
   * Store successful feed processing patterns for reuse
   */
  async recordSuccessfulPattern(providerName: string, processingResult: {
    duration: number;
    recordsProcessed: number;
    errorCount: number;
    optimizations: string[];
  }): Promise<void> {
    const pattern = {
      provider: providerName,
      processingTime: processingResult.duration,
      successRate: (processingResult.recordsProcessed - processingResult.errorCount) / processingResult.recordsProcessed,
      optimization: processingResult.optimizations.join(', '),
      recordedAt: new Date().toISOString(),
    };

    await this.memoryService.storeFeedProcessingPattern(pattern);
    
    // Store as learning pattern for reuse
    await this.memoryService.storeLearningPattern('strategies', {
      title: `${providerName} Processing Optimization`,
      description: `Successful processing pattern for ${providerName}`,
      context: { provider: providerName, performance: processingResult },
      solution: { optimizations: processingResult.optimizations },
      effectiveness: pattern.successRate,
    });

    logger.info(`Feed processing pattern recorded for ${providerName}`, {
      successRate: pattern.successRate,
      duration: processingResult.duration,
    });
  }

  /**
   * Retrieve best practices for a specific provider
   */
  async getBestPractices(providerName: string): Promise<{
    strategies: unknown[];
    avgProcessingTime: number;
    commonOptimizations: string[];
  }> {
    const strategies = await this.memoryService.retrievePastDecisions(
      providerName,
      'strategies'
    );

    // This would typically query stored patterns and calculate averages
    return {
      strategies,
      avgProcessingTime: 150, // Would be calculated from stored patterns
      commonOptimizations: [
        'Batch processing',
        'Connection pooling',
        'Error retry with exponential backoff'
      ],
    };
  }
}

// Example 2: Grading Agent Integration
export class GradingAgentMemoryIntegration {
  constructor(private memoryService: MemoryCoordinationService) {}

  /**
   * Store grading decisions with reasoning for future reference
   */
  async recordGradingDecision(
    rawId: string,
    unifiedId: string,
    gradingResult: {
      finalScore: number;
      factorScores: Record<string, number>;
      reasoning: string;
      metadata: Record<string, unknown>;
    }
  ): Promise<void> {
    // Store the specific grading result
    await this.memoryService.storeGradingResults({
      rawId,
      unifiedId,
      score: gradingResult.finalScore,
      factors: gradingResult.factorScores,
      reasoning: gradingResult.reasoning,
    });

    // Extract and store any new patterns discovered
    if (gradingResult.finalScore > 90) {
      await this.memoryService.storeLearningPattern('best-practices', {
        title: 'High-Quality Grading Pattern',
        description: 'Characteristics of high-scoring evaluations',
        context: {
          factors: gradingResult.factorScores,
          metadata: gradingResult.metadata,
        },
        solution: {
          pattern: 'High scores correlate with specific factor combinations',
          threshold: gradingResult.finalScore,
        },
        effectiveness: gradingResult.finalScore / 100,
      });
    }

    logger.info(`Grading decision recorded`, {
      rawId,
      unifiedId,
      score: gradingResult.finalScore,
    });
  }

  /**
   * Get similar grading cases for consistency checking
   */
  async getSimilarCases(
    factors: Record<string, number>,
    threshold: number = 0.8
  ): Promise<{
    similarCases: unknown[];
    averageScore: number;
    recommendations: string[];
  }> {
    // Query for similar grading patterns
    const pastDecisions = await this.memoryService.retrievePastDecisions(
      'grading factors'
    );

    // This would implement similarity matching logic
    return {
      similarCases: pastDecisions,
      averageScore: 0, // Would be calculated from similar cases
      recommendations: [
        'Consider factor weight adjustments',
        'Review consistency with past decisions',
        'Document reasoning for future reference'
      ],
    };
  }
}

// Example 3: Promoter Agent Integration
export class PromoterAgentMemoryIntegration {
  constructor(private memoryService: MemoryCoordinationService) {}

  /**
   * Store promotion decisions and flood control metrics
   */
  async recordPromotionCycle(
    timeWindow: string,
    results: {
      promoted: number;
      rejected: number;
      floodGuardTriggered: boolean;
      averageQuality: number;
      qualityDistribution: Record<string, number>;
    }
  ): Promise<void> {
    await this.memoryService.storePromotionPattern({
      promotionRate: results.promoted,
      floodGuardTriggered: results.floodGuardTriggered,
      timeWindow,
      qualityMetrics: {
        averageScore: results.averageQuality,
        promoted: results.promoted,
        rejected: results.rejected,
        ...results.qualityDistribution,
      },
    });

    // Store flood control patterns if triggered
    if (results.floodGuardTriggered) {
      await this.memoryService.storeLearningPattern('errors', {
        title: 'Flood Control Activation',
        description: `Flood guard triggered during ${timeWindow} window`,
        context: {
          promotionRate: results.promoted,
          qualityMetrics: results.qualityDistribution,
        },
        solution: {
          action: 'Promotion rate limited',
          prevention: 'Consider quality thresholds adjustment',
        },
        effectiveness: 1.0, // Flood control worked as intended
      });
    }

    logger.info(`Promotion cycle recorded`, {
      timeWindow,
      promoted: results.promoted,
      floodGuardTriggered: results.floodGuardTriggered,
    });
  }

  /**
   * Get optimal promotion thresholds based on historical data
   */
  async getOptimalThresholds(): Promise<{
    recommendedRate: number;
    qualityThreshold: number;
    timeWindowSuggestion: string;
  }> {
    const patterns = await this.memoryService.retrievePastDecisions(
      'promotion patterns'
    );

    // This would analyze historical patterns to suggest optimal settings
    return {
      recommendedRate: 20, // Based on successful patterns
      qualityThreshold: 75,
      timeWindowSuggestion: '5-minute',
    };
  }
}

// Example 4: Cross-Session Workflow Continuity
export class WorkflowContinuityManager {
  constructor(private memoryService: MemoryCoordinationService) {}

  /**
   * Save session state before shutdown
   */
  async saveSessionState(sessionId: string, state: {
    activeWorkflows: unknown[];
    pendingTasks: unknown[];
    contextSummary: string;
    performanceMetrics: Record<string, number>;
  }): Promise<void> {
    const coordination = {
      taskAssignments: { pending: state.pendingTasks },
      performanceMetrics: state.performanceMetrics,
    };

    await this.memoryService.storeAgentCoordination(sessionId, coordination);

    // Store workflow state for continuity
    await this.memoryService.storeProjectContext('issues', {
      type: 'session-state',
      sessionId,
      activeWorkflows: state.activeWorkflows,
      contextSummary: state.contextSummary,
      timestamp: new Date().toISOString(),
    }, ['session-state', sessionId]);

    logger.info(`Session state saved for continuity`, { sessionId });
  }

  /**
   * Restore session state on startup
   */
  async restoreSessionState(sessionId?: string): Promise<{
    canContinue: boolean;
    activeWorkflows: unknown[];
    pendingTasks: unknown[];
    recommendations: string[];
  }> {
    const context = await this.memoryService.getContinuityContext(sessionId);

    const canContinue = context.pendingTasks.length > 0 || context.activeWorkflows.length > 0;

    const recommendations: string[] = [];
    if (context.pendingTasks.length > 0) {
      recommendations.push(`Resume ${context.pendingTasks.length} pending tasks`);
    }
    if (context.activeWorkflows.length > 0) {
      recommendations.push(`Continue ${context.activeWorkflows.length} active workflows`);
    }
    if (context.contextSummary && context.contextSummary !== 'No previous context available') {
      recommendations.push('Review previous context summary');
    }

    logger.info(`Session state restored`, {
      sessionId,
      canContinue,
      pendingTasks: context.pendingTasks.length,
      activeWorkflows: context.activeWorkflows.length,
    });

    return {
      canContinue,
      activeWorkflows: context.activeWorkflows,
      pendingTasks: context.pendingTasks,
      recommendations,
    };
  }
}

// Example 5: System Performance Learning
export class PerformanceLearningIntegration {
  constructor(private memoryService: MemoryCoordinationService) {}

  /**
   * Record performance insights for system optimization
   */
  async recordPerformanceInsight(
    component: string,
    insight: {
      bottleneck: string;
      impact: 'low' | 'medium' | 'high';
      solution: string;
      measuredImprovement?: number;
      implementationCost: 'low' | 'medium' | 'high';
    }
  ): Promise<void> {
    await this.memoryService.storeLearningPattern('optimizations', {
      title: `${component} Performance Optimization`,
      description: `${insight.bottleneck} optimization in ${component}`,
      context: {
        component,
        bottleneck: insight.bottleneck,
        impact: insight.impact,
        cost: insight.implementationCost,
      },
      solution: {
        approach: insight.solution,
        improvement: insight.measuredImprovement,
      },
      effectiveness: insight.measuredImprovement ? insight.measuredImprovement / 100 : 0.5,
    });

    logger.info(`Performance insight recorded`, {
      component,
      impact: insight.impact,
      improvement: insight.measuredImprovement,
    });
  }

  /**
   * Get optimization recommendations for a component
   */
  async getOptimizationRecommendations(component: string): Promise<{
    recommendations: Array<{
      title: string;
      description: string;
      expectedImpact: string;
      implementationEffort: string;
    }>;
    priorityOrder: string[];
  }> {
    const optimizations = await this.memoryService.retrievePastDecisions(
      component,
      'optimizations'
    );

    // Process stored optimizations to generate recommendations
    const recommendations = [
      {
        title: 'Implement Connection Pooling',
        description: 'Reduce database connection overhead',
        expectedImpact: 'medium',
        implementationEffort: 'low',
      },
      {
        title: 'Add Redis Caching Layer',
        description: 'Cache frequently accessed data',
        expectedImpact: 'high',
        implementationEffort: 'medium',
      },
    ];

    return {
      recommendations,
      priorityOrder: ['high-impact-low-effort', 'high-impact-medium-effort'],
    };
  }
}

// Example Usage and Initialization
export async function initializeMemoryIntegrations(): Promise<{
  feedIntegration: FeedAgentMemoryIntegration;
  gradingIntegration: GradingAgentMemoryIntegration;
  promoterIntegration: PromoterAgentMemoryIntegration;
  workflowManager: WorkflowContinuityManager;
  performanceLearning: PerformanceLearningIntegration;
}> {
  // Initialize the memory coordination service
  const memoryService = new MemoryCoordinationService();
  await memoryService.initialize();

  // Create integration instances
  const feedIntegration = new FeedAgentMemoryIntegration(memoryService);
  const gradingIntegration = new GradingAgentMemoryIntegration(memoryService);
  const promoterIntegration = new PromoterAgentMemoryIntegration(memoryService);
  const workflowManager = new WorkflowContinuityManager(memoryService);
  const performanceLearning = new PerformanceLearningIntegration(memoryService);

  logger.info('Memory coordination integrations initialized');

  return {
    feedIntegration,
    gradingIntegration,
    promoterIntegration,
    workflowManager,
    performanceLearning,
  };
}

// Example: Complete workflow with memory coordination
export async function demonstrateWorkflowWithMemory(): Promise<void> {
  const integrations = await initializeMemoryIntegrations();

  try {
    // 1. Feed Agent processes data and records patterns
    await integrations.feedIntegration.recordSuccessfulPattern('ESPN', {
      duration: 145,
      recordsProcessed: 1000,
      errorCount: 5,
      optimizations: ['batching', 'connection-pooling'],
    });

    // 2. Grading Agent makes decision and stores reasoning
    await integrations.gradingIntegration.recordGradingDecision(
      'raw-12345',
      'unified-67890',
      {
        finalScore: 87.5,
        factorScores: { accuracy: 0.9, timeliness: 0.85 },
        reasoning: 'High accuracy with good timeliness',
        metadata: { source: 'espn', category: 'player-prop' },
      }
    );

    // 3. Promoter Agent records promotion cycle results
    await integrations.promoterIntegration.recordPromotionCycle('5-minute', {
      promoted: 15,
      rejected: 8,
      floodGuardTriggered: false,
      averageQuality: 82.3,
      qualityDistribution: { 'high': 8, 'medium': 7, 'low': 0 },
    });

    // 4. Save session state for continuity
    await integrations.workflowManager.saveSessionState('session-001', {
      activeWorkflows: [{ id: 'workflow-1', status: 'processing' }],
      pendingTasks: [{ id: 'task-1', priority: 'high' }],
      contextSummary: 'Processing ESPN feed with high success rate',
      performanceMetrics: { throughput: 150, errorRate: 0.005 },
    });

    // 5. Record performance insights
    await integrations.performanceLearning.recordPerformanceInsight('feed-agent', {
      bottleneck: 'Database connection limits',
      impact: 'medium',
      solution: 'Implement connection pooling with circuit breaker',
      measuredImprovement: 35,
      implementationCost: 'low',
    });

    logger.info('Complete workflow with memory coordination demonstrated successfully');

  } catch (error) {
    logger.error('Error in memory coordination workflow demonstration', { error });
    throw error;
  }
}