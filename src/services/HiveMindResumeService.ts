/**
 * Hive-Mind Resume Service
 * 
 * Implements the hive-mind-resume functionality by integrating with the 
 * Memory Coordination Agent to restore previous session state, workflows,
 * and coordination patterns.
 */

import { createLogger } from '@unit-talk/observability';
import { z } from 'zod';

import { MemoryCoordinationAgent } from '../agents/MemoryCoordinationAgent';

const logger = createLogger('hive-mind-resume');

// Resume operation schema
const ResumeOperationSchema = z.object({
  sessionId: z.string().optional(),
  namespace: z.string().optional(),
  timeRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime().optional(),
  }).optional(),
  includeExpired: z.boolean().default(false),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
});

const ResumeStateSchema = z.object({
  sessionId: z.string(),
  restoredMemories: z.number(),
  activeWorkflows: z.array(z.object({
    id: z.string(),
    status: z.string(),
    progress: z.number(),
    eta: z.string().optional(),
  })),
  pendingTasks: z.array(z.object({
    id: z.string(),
    priority: z.string(),
    estimatedTime: z.string().optional(),
  })),
  coordinationPatterns: z.array(z.object({
    pattern: z.string(),
    effectiveness: z.number(),
    lastUsed: z.string(),
  })),
  performanceBaselines: z.record(z.unknown()),
  contextSummary: z.string(),
  resumeTimestamp: z.string(),
});

type ResumeOperation = z.infer<typeof ResumeOperationSchema>;
type ResumeState = z.infer<typeof ResumeStateSchema>;

/**
 * Hive-Mind Resume Service
 * 
 * Restores distributed intelligence state across sessions by leveraging
 * the Memory Coordination Agent to reconstruct workflow context, task
 * assignments, performance patterns, and coordination intelligence.
 */
export class HiveMindResumeService {
  private memoryAgent: MemoryCoordinationAgent;
  private sessionId: string;

  constructor(sessionId?: string) {
    this.memoryAgent = new MemoryCoordinationAgent();
    this.sessionId = sessionId || `resume-session-${Date.now()}`;
    
    logger.info('Hive-Mind Resume Service initialized', {
      sessionId: this.sessionId,
    });
  }

  /**
   * Resume hive-mind state from previous sessions
   */
  async resumeHiveMind(operation?: ResumeOperation): Promise<ResumeState> {
    try {
      const validatedOp = ResumeOperationSchema.parse(operation || {});
      
      logger.info('Starting hive-mind resume operation', {
        sessionId: this.sessionId,
        operation: validatedOp,
      });

      // Step 1: Restore active workflows
      const workflows = await this.restoreActiveWorkflows(validatedOp);
      
      // Step 2: Restore pending tasks  
      const tasks = await this.restorePendingTasks(validatedOp);
      
      // Step 3: Restore coordination patterns
      const patterns = await this.restoreCoordinationPatterns(validatedOp);
      
      // Step 4: Restore performance baselines
      const baselines = await this.restorePerformanceBaselines(validatedOp);
      
      // Step 5: Generate context summary
      const contextSummary = await this.generateContextSummary();
      
      // Step 6: Count restored memories
      const memoryCount = await this.countRestoredMemories();

      const resumeState: ResumeState = {
        sessionId: this.sessionId,
        restoredMemories: memoryCount,
        activeWorkflows: workflows,
        pendingTasks: tasks,
        coordinationPatterns: patterns,
        performanceBaselines: baselines,
        contextSummary,
        resumeTimestamp: new Date().toISOString(),
      };

      // Store the resume operation for future reference
      await this.storeResumeState(resumeState);

      logger.info('Hive-mind resume completed successfully', {
        restoredMemories: memoryCount,
        activeWorkflows: workflows.length,
        pendingTasks: tasks.length,
        coordinationPatterns: patterns.length,
      });

      return resumeState;

    } catch (error) {
      logger.error('Failed to resume hive-mind state', { error, operation });
      throw new Error(`Hive-mind resume failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Restore active workflows from memory
   */
  private async restoreActiveWorkflows(operation: ResumeOperation): Promise<ResumeState['activeWorkflows']> {
    const workflows: ResumeState['activeWorkflows'] = [];
    
    try {
      // Search for workflow states across multiple namespaces
      const namespaces = ['session/current', 'session/demo-session', 'coordination/swarm-001'];
      
      for (const namespace of namespaces) {
        const searchResult = await this.memoryAgent.searchMemories({
          operation: 'search',
          namespace,
          tags: ['workflow', 'session-state'],
        });

        for (const memory of searchResult.memories) {
          try {
            const content = JSON.parse(memory.content);
            if (content.activeWorkflows && Array.isArray(content.activeWorkflows)) {
              workflows.push(...content.activeWorkflows);
            }
          } catch (parseError) {
            logger.warn('Failed to parse workflow memory', { 
              memoryId: memory.id, 
              parseError 
            });
          }
        }
      }

      logger.info(`Restored ${workflows.length} active workflows`);
      return workflows;

    } catch (error) {
      logger.error('Failed to restore workflows', { error });
      return [];
    }
  }

  /**
   * Restore pending tasks from memory
   */
  private async restorePendingTasks(operation: ResumeOperation): Promise<ResumeState['pendingTasks']> {
    const tasks: ResumeState['pendingTasks'] = [];
    
    try {
      // Search for task-related memories
      const searchResult = await this.memoryAgent.searchMemories({
        operation: 'search',
        namespace: 'coordination/tasks',
        tags: ['task', 'orchestration'],
      });

      for (const memory of searchResult.memories) {
        try {
          const content = JSON.parse(memory.content);
          if (content.status === 'pending' || content.status === 'in-progress') {
            tasks.push({
              id: content.id,
              priority: content.priority || 'medium',
              estimatedTime: content.metadata?.estimatedTime,
            });
          }
        } catch (parseError) {
          logger.warn('Failed to parse task memory', { 
            memoryId: memory.id, 
            parseError 
          });
        }
      }

      // Also check session namespaces for pending tasks
      const sessionSearchResult = await this.memoryAgent.searchMemories({
        operation: 'search',
        namespace: 'session/demo-session',
        pattern: 'pendingTasks',
      });

      for (const memory of sessionSearchResult.memories) {
        try {
          const content = JSON.parse(memory.content);
          if (content.pendingTasks && Array.isArray(content.pendingTasks)) {
            tasks.push(...content.pendingTasks);
          }
        } catch (parseError) {
          logger.warn('Failed to parse session task memory', { 
            memoryId: memory.id, 
            parseError 
          });
        }
      }

      logger.info(`Restored ${tasks.length} pending tasks`);
      return tasks;

    } catch (error) {
      logger.error('Failed to restore tasks', { error });
      return [];
    }
  }

  /**
   * Restore coordination patterns from memory
   */
  private async restoreCoordinationPatterns(operation: ResumeOperation): Promise<ResumeState['coordinationPatterns']> {
    const patterns: ResumeState['coordinationPatterns'] = [];
    
    try {
      // Search for pattern memories across strategy and optimization namespaces
      const namespaces = ['patterns/strategies', 'patterns/optimization', 'patterns/grading', 
                          'patterns/feed-processing', 'patterns/promotion'];
      
      for (const namespace of namespaces) {
        const searchResult = await this.memoryAgent.searchMemories({
          operation: 'search',
          namespace,
        });

        for (const memory of searchResult.memories) {
          try {
            const content = JSON.parse(memory.content);
            patterns.push({
              pattern: content.title || content.pattern || memory.id,
              effectiveness: content.effectiveness || content.measuredImprovement || 0.8,
              lastUsed: memory.createdAt,
            });
          } catch (parseError) {
            logger.warn('Failed to parse pattern memory', { 
              memoryId: memory.id, 
              parseError 
            });
          }
        }
      }

      logger.info(`Restored ${patterns.length} coordination patterns`);
      return patterns;

    } catch (error) {
      logger.error('Failed to restore coordination patterns', { error });
      return [];
    }
  }

  /**
   * Restore performance baselines from memory
   */
  private async restorePerformanceBaselines(operation: ResumeOperation): Promise<ResumeState['performanceBaselines']> {
    const baselines: ResumeState['performanceBaselines'] = {};
    
    try {
      // Search for performance-related memories
      const searchResult = await this.memoryAgent.searchMemories({
        operation: 'search',
        namespace: 'patterns/performance',
        tags: ['performance', 'baseline'],
      });

      for (const memory of searchResult.memories) {
        try {
          const content = JSON.parse(memory.content);
          const key = content.service || memory.id;
          baselines[key] = content;
        } catch (parseError) {
          logger.warn('Failed to parse performance baseline memory', { 
            memoryId: memory.id, 
            parseError 
          });
        }
      }

      // Also check agent-specific performance data
      const agentNamespaces = ['agents/feed-agent', 'agents/grading-agent', 'agents/promoter-agent'];
      
      for (const namespace of agentNamespaces) {
        const agentSearchResult = await this.memoryAgent.searchMemories({
          operation: 'search',
          namespace,
          pattern: 'performance',
        });

        for (const memory of agentSearchResult.memories) {
          try {
            const content = JSON.parse(memory.content);
            if (content.performanceMetrics) {
              const agentName = namespace.split('/')[1];
              baselines[agentName] = content.performanceMetrics;
            }
          } catch (parseError) {
            logger.warn('Failed to parse agent performance memory', { 
              memoryId: memory.id, 
              parseError 
            });
          }
        }
      }

      logger.info(`Restored performance baselines for ${Object.keys(baselines).length} components`);
      return baselines;

    } catch (error) {
      logger.error('Failed to restore performance baselines', { error });
      return {};
    }
  }

  /**
   * Generate context summary from restored memories
   */
  private async generateContextSummary(): Promise<string> {
    try {
      const analytics = this.memoryAgent.getMemoryAnalytics();
      
      const activePatternsCount = analytics.namespaceDistribution['patterns/strategies'] || 0;
      const feedProcessingCount = analytics.namespaceDistribution['patterns/feed-processing'] || 0;
      const gradingCount = analytics.namespaceDistribution['patterns/grading'] || 0;
      const promotionCount = analytics.namespaceDistribution['patterns/promotion'] || 0;
      
      let summary = `Hive-mind state restored with ${analytics.totalMemories} memories across ${Object.keys(analytics.namespaceDistribution).length} namespaces. `;
      
      if (activePatternsCount > 0) {
        summary += `${activePatternsCount} active coordination patterns available. `;
      }
      
      if (feedProcessingCount > 0) {
        summary += `Feed processing optimizations ready (${feedProcessingCount} patterns). `;
      }
      
      if (gradingCount > 0) {
        summary += `Grading intelligence patterns active (${gradingCount} patterns). `;
      }
      
      if (promotionCount > 0) {
        summary += `Promotion control mechanisms restored (${promotionCount} patterns). `;
      }

      summary += `System ready for coordinated multi-agent operations with ${analytics.compressionStats.compressed + analytics.compressionStats.uncompressed} stored intelligence patterns.`;
      
      return summary;

    } catch (error) {
      logger.error('Failed to generate context summary', { error });
      return 'Hive-mind state partially restored. Context summary unavailable.';
    }
  }

  /**
   * Count total restored memories
   */
  private async countRestoredMemories(): Promise<number> {
    try {
      const analytics = this.memoryAgent.getMemoryAnalytics();
      return analytics.totalMemories;
    } catch (error) {
      logger.error('Failed to count restored memories', { error });
      return 0;
    }
  }

  /**
   * Store the resume state for future reference
   */
  private async storeResumeState(state: ResumeState): Promise<void> {
    try {
      await this.memoryAgent.storeMemory({
        operation: 'store',
        namespace: 'coordination/resume-operations',
        key: `resume-${this.sessionId}`,
        content: state,
        tags: ['resume-state', 'hive-mind', 'coordination'],
        ttl: 7 * 24 * 60 * 60, // 7 days
      });

      logger.info('Resume state stored for future reference', {
        sessionId: this.sessionId,
      });
    } catch (error) {
      logger.warn('Failed to store resume state', { error });
    }
  }

  /**
   * Get available resume points
   */
  async getAvailableResumePoints(): Promise<Array<{
    sessionId: string;
    resumeTimestamp: string;
    restoredMemories: number;
    contextSummary: string;
  }>> {
    try {
      const searchResult = await this.memoryAgent.searchMemories({
        operation: 'search',
        namespace: 'coordination/resume-operations',
        tags: ['resume-state'],
      });

      const resumePoints = [];
      for (const memory of searchResult.memories) {
        try {
          const content = JSON.parse(memory.content);
          resumePoints.push({
            sessionId: content.sessionId,
            resumeTimestamp: content.resumeTimestamp,
            restoredMemories: content.restoredMemories,
            contextSummary: content.contextSummary,
          });
        } catch (parseError) {
          logger.warn('Failed to parse resume point', { 
            memoryId: memory.id, 
            parseError 
          });
        }
      }

      resumePoints.sort((a, b) => 
        new Date(b.resumeTimestamp).getTime() - new Date(a.resumeTimestamp).getTime()
      );

      return resumePoints;

    } catch (error) {
      logger.error('Failed to get available resume points', { error });
      return [];
    }
  }

  /**
   * Clear old resume states (cleanup)
   */
  async cleanupOldResumeStates(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const searchResult = await this.memoryAgent.searchMemories({
        operation: 'search',
        namespace: 'coordination/resume-operations',
        tags: ['resume-state'],
      });

      let cleanedCount = 0;
      for (const memory of searchResult.memories) {
        try {
          const content = JSON.parse(memory.content);
          const resumeDate = new Date(content.resumeTimestamp);
          
          if (resumeDate < cutoffDate) {
            await this.memoryAgent.deleteMemory({
              operation: 'delete',
              namespace: 'coordination/resume-operations',
              key: `resume-${content.sessionId}`,
            });
            cleanedCount++;
          }
        } catch (parseError) {
          logger.warn('Failed to parse resume state for cleanup', { 
            memoryId: memory.id, 
            parseError 
          });
        }
      }

      logger.info(`Cleaned up ${cleanedCount} old resume states`);
      return cleanedCount;

    } catch (error) {
      logger.error('Failed to cleanup old resume states', { error });
      return 0;
    }
  }

  /**
   * Get memory analytics
   */
  getAnalytics() {
    return this.memoryAgent.getMemoryAnalytics();
  }
}

export default HiveMindResumeService;