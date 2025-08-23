import { createLogger } from '@unit-talk/observability';
import { z } from 'zod';

import { MemoryCoordinationAgent } from '../agents/MemoryCoordinationAgent';

const logger = createLogger('memory-service');

// Service-level schemas for external interfaces
const MemoryQuerySchema = z.object({
  namespace: z.string(),
  key: z.string().optional(),
  pattern: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().optional(),
});

const MemoryStoreRequestSchema = z.object({
  namespace: z.string(),
  key: z.string().optional(),
  content: z.unknown(),
  tags: z.array(z.string()).optional(),
  ttl: z.number().optional(),
  encrypted: z.boolean().optional(),
});

type MemoryQuery = z.infer<typeof MemoryQuerySchema>;
type MemoryStoreRequest = z.infer<typeof MemoryStoreRequestSchema>;

/**
 * Memory Coordination Service
 * 
 * Service layer that provides high-level memory coordination capabilities
 * for the unit-talk-core system. Integrates with existing infrastructure
 * and provides typed interfaces for memory operations.
 */
export class MemoryCoordinationService {
  private agent: MemoryCoordinationAgent;
  private initialized: boolean = false;

  constructor() {
    this.agent = new MemoryCoordinationAgent();
  }

  /**
   * Initialize the memory coordination service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Memory coordination service already initialized');
      return;
    }

    try {
      // Initialize default project contexts for unit-talk-core
      await this.initializeProjectContexts();
      
      this.initialized = true;
      logger.info('Memory coordination service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize memory coordination service', { error });
      throw new Error('Memory coordination service initialization failed');
    }
  }

  /**
   * Store project context (architecture decisions, API contracts, etc.)
   */
  async storeProjectContext(
    category: 'architecture' | 'api-contracts' | 'configuration' | 'dependencies' | 'issues',
    content: unknown,
    tags: string[] = []
  ): Promise<string> {
    this.ensureInitialized();

    const request: MemoryStoreRequest = {
      namespace: 'project/unit-talk-core',
      key: `${category}-${Date.now()}`,
      content,
      tags: ['project-context', category, ...tags],
      ttl: 30 * 24 * 60 * 60, // 30 days
    };

    return this.storeMemory(request);
  }

  /**
   * Store agent coordination data
   */
  async storeAgentCoordination(
    swarmId: string,
    data: {
      taskAssignments?: unknown;
      intermediateResults?: unknown;
      communicationLogs?: unknown;
      performanceMetrics?: unknown;
      errorReports?: unknown;
    }
  ): Promise<string[]> {
    this.ensureInitialized();

    const results: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        const request: MemoryStoreRequest = {
          namespace: `coordination/${swarmId}`,
          key: `${key}-${Date.now()}`,
          content: value,
          tags: ['coordination', swarmId, key],
          ttl: 7 * 24 * 60 * 60, // 7 days
        };

        const memoryId = await this.storeMemory(request);
        results.push(memoryId);
      }
    }

    return results;
  }

  /**
   * Store learning patterns and best practices
   */
  async storeLearningPattern(
    category: 'strategies' | 'solutions' | 'errors' | 'optimizations' | 'best-practices',
    pattern: {
      title: string;
      description: string;
      context: unknown;
      solution: unknown;
      effectiveness?: number;
    }
  ): Promise<string> {
    this.ensureInitialized();

    const request: MemoryStoreRequest = {
      namespace: `patterns/${category}`,
      key: `pattern-${pattern.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      content: pattern,
      tags: ['learning-pattern', category, pattern.title],
      ttl: 90 * 24 * 60 * 60, // 90 days
    };

    return this.storeMemory(request);
  }

  /**
   * Retrieve past decisions and context
   */
  async retrievePastDecisions(query: string, category?: string): Promise<unknown[]> {
    this.ensureInitialized();

    const searchQuery: MemoryQuery = {
      namespace: 'project/unit-talk-core',
      pattern: query,
      tags: category ? ['project-context', category] : ['project-context'],
      limit: 10,
    };

    const results = await this.searchMemories(searchQuery);
    return results.memories.map(memory => {
      try {
        return JSON.parse(memory.content);
      } catch {
        return memory.content;
      }
    });
  }

  /**
   * Get cross-session continuity data
   */
  async getContinuityContext(sessionId?: string): Promise<{
    lastSession: unknown;
    pendingTasks: unknown[];
    activeWorkflows: unknown[];
    contextSummary: string;
  }> {
    this.ensureInitialized();

    const namespace = sessionId ? `session/${sessionId}` : 'session/current';
    
    const queries = [
      { key: 'last-session' },
      { pattern: 'pending-task', tags: ['task', 'pending'] },
      { pattern: 'active-workflow', tags: ['workflow', 'active'] },
      { key: 'context-summary' },
    ];

    const results = await Promise.all(
      queries.map(query => this.searchMemories({ namespace, ...query }))
    );

    return {
      lastSession: results[0].memories[0]?.content || null,
      pendingTasks: results[1].memories.map(m => m.content),
      activeWorkflows: results[2].memories.map(m => m.content),
      contextSummary: results[3].memories[0]?.content || 'No previous context available',
    };
  }

  /**
   * Integration with existing unit-talk-core components
   */
  
  /**
   * Store grading agent results and patterns
   */
  async storeGradingResults(
    result: {
      rawId: string;
      unifiedId: string;
      score: number;
      factors: Record<string, number>;
      reasoning: string;
    }
  ): Promise<string> {
    this.ensureInitialized();

    const request: MemoryStoreRequest = {
      namespace: 'patterns/grading',
      key: `grading-${result.unifiedId}-${Date.now()}`,
      content: result,
      tags: ['grading', 'scoring', 'analysis'],
      ttl: 30 * 24 * 60 * 60, // 30 days
    };

    return this.storeMemory(request);
  }

  /**
   * Store feed processing patterns and optimizations
   */
  async storeFeedProcessingPattern(
    pattern: {
      provider: string;
      processingTime: number;
      successRate: number;
      errorPattern?: string;
      optimization?: string;
    }
  ): Promise<string> {
    this.ensureInitialized();

    const request: MemoryStoreRequest = {
      namespace: 'patterns/feed-processing',
      key: `feed-${pattern.provider}-${Date.now()}`,
      content: pattern,
      tags: ['feed-processing', pattern.provider, 'performance'],
      ttl: 60 * 24 * 60 * 60, // 60 days
    };

    return this.storeMemory(request);
  }

  /**
   * Store promotion patterns and flood control metrics
   */
  async storePromotionPattern(
    pattern: {
      promotionRate: number;
      floodGuardTriggered: boolean;
      timeWindow: string;
      qualityMetrics: Record<string, number>;
    }
  ): Promise<string> {
    this.ensureInitialized();

    const request: MemoryStoreRequest = {
      namespace: 'patterns/promotion',
      key: `promotion-${Date.now()}`,
      content: pattern,
      tags: ['promotion', 'flood-control', 'quality'],
      ttl: 30 * 24 * 60 * 60, // 30 days
    };

    return this.storeMemory(request);
  }

  // Core memory operations (private - use specific methods above)
  private async storeMemory(request: MemoryStoreRequest): Promise<string> {
    const validatedRequest = MemoryStoreRequestSchema.parse(request);
    
    return this.agent.storeMemory({
      operation: 'store',
      namespace: validatedRequest.namespace,
      key: validatedRequest.key,
      content: validatedRequest.content,
      tags: validatedRequest.tags,
      ttl: validatedRequest.ttl,
      encrypted: validatedRequest.encrypted,
    });
  }

  private async searchMemories(query: MemoryQuery) {
    const validatedQuery = MemoryQuerySchema.parse(query);
    
    return this.agent.searchMemories({
      operation: 'search',
      namespace: validatedQuery.namespace,
      pattern: validatedQuery.pattern,
      tags: validatedQuery.tags,
    });
  }

  /**
   * Get memory usage analytics
   */
  getAnalytics() {
    this.ensureInitialized();
    return this.agent.getMemoryAnalytics();
  }

  /**
   * Perform cleanup and optimization
   */
  async cleanup(): Promise<void> {
    this.ensureInitialized();
    
    await this.agent.syncMemory({
      operation: 'sync',
      namespace: 'all',
    });
    
    logger.info('Memory coordination cleanup completed');
  }

  // Private initialization methods
  private async initializeProjectContexts(): Promise<void> {
    // Store initial project context about unit-talk-core architecture
    await this.storeProjectContext('architecture', {
      system: 'unit-talk-core',
      pattern: 'single-writer-principle',
      writer: 'Promoter',
      target: 'unified_picks',
      shadowMode: true,
      publishGuards: ['PUBLISH_TO_DISCORD=false'],
    }, ['architecture', 'single-writer', 'promoter']);

    await this.storeProjectContext('configuration', {
      database: 'supabase',
      clientPattern: 'single-service-role',
      location: '/packages/db',
      shadowFlags: ['SHADOW_MODE=true', 'PUBLISH_TO_DISCORD=false'],
    }, ['configuration', 'database', 'shadow']);

    await this.storeProjectContext('api-contracts', {
      smartFormSubmission: 'SmartFormSubmissionSchema',
      rawPropsRow: 'RawPropsRow',
      unifiedPickRow: 'UnifiedPickRow',
      ingestionMetrics: 'IngestionMetrics',
    }, ['api-contracts', 'schemas']);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Memory coordination service not initialized. Call initialize() first.');
    }
  }
}

// Singleton instance for unit-talk-core
export const memoryCoordination = new MemoryCoordinationService();
export default MemoryCoordinationService;