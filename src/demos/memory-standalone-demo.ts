/**
 * Standalone Memory Coordination Agent Demonstration
 * 
 * This demo runs independently without external dependencies
 * to showcase the Memory Coordination Agent capabilities.
 */

import { z } from 'zod';

// Standalone logger implementation for demo
const createLogger = (name: string) => ({
  info: (message: string, data?: any) => console.log(`[${name}] INFO: ${message}`, data || ''),
  error: (message: string, data?: any) => console.error(`[${name}] ERROR: ${message}`, data || ''),
  debug: (message: string, data?: any) => console.log(`[${name}] DEBUG: ${message}`, data || ''),
  warn: (message: string, data?: any) => console.warn(`[${name}] WARN: ${message}`, data || ''),
});

// Task types for standalone demo
const TaskStatusSchema = z.enum(['pending', 'in-progress', 'completed', 'cancelled', 'blocked']);
const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  assignedTo: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  dueDate: z.string().optional(),
});

type Task = z.infer<typeof TaskSchema>;

// Memory Coordination Agent (simplified for demo)
class StandaloneMemoryCoordinationAgent {
  private memoryStore: Map<string, any>;
  private namespaces: Map<string, Set<string>>;
  private logger: ReturnType<typeof createLogger>;
  private compressionThreshold: number = 1024;

  constructor() {
    this.memoryStore = new Map();
    this.namespaces = new Map();
    this.logger = createLogger('memory-coordination');
    this.initializeDefaultNamespaces();
    this.logger.info('Memory Coordination Agent initialized');
  }

  private initializeDefaultNamespaces(): void {
    const defaultNamespaces = [
      'project/unit-talk-core',
      'coordination/swarm-001',
      'patterns/grading',
      'patterns/feed-processing', 
      'patterns/promotion',
      'agents/feed-agent',
      'agents/grading-agent',
      'agents/promoter-agent',
      'session/current',
      'shared/global'
    ];

    defaultNamespaces.forEach(namespace => {
      this.namespaces.set(namespace, new Set());
    });
  }

  async storeMemory(operation: {
    operation: 'store';
    namespace: string;
    key?: string;
    content: any;
    tags?: string[];
    ttl?: number;
  }): Promise<string> {
    const memoryId = this.generateMemoryId(operation.namespace, operation.key);
    const content = JSON.stringify(operation.content);
    const compressed = content.length > this.compressionThreshold 
      ? `compressed:${content}` 
      : content;

    const memory = {
      id: memoryId,
      content: compressed,
      namespace: operation.namespace,
      tags: operation.tags || [],
      metadata: {
        originalSize: content.length,
        compressed: compressed !== content,
        createdBy: 'memory-coordination-agent',
        ttl: operation.ttl,
      },
      createdAt: new Date().toISOString(),
      expiresAt: operation.ttl 
        ? new Date(Date.now() + operation.ttl * 1000).toISOString()
        : undefined,
      hash: this.generateHash(content),
    };

    this.memoryStore.set(memoryId, memory);
    this.addToNamespace(operation.namespace, memoryId);

    this.logger.info(`Memory stored: ${memoryId} in namespace ${operation.namespace}`, {
      size: content.length,
      compressed: compressed !== content,
      ttl: operation.ttl,
    });

    return memoryId;
  }

  async retrieveMemory(operation: {
    operation: 'retrieve';
    namespace: string;
    key: string;
  }): Promise<any> {
    const memoryId = this.generateMemoryId(operation.namespace, operation.key);
    const memory = this.memoryStore.get(memoryId);

    if (!memory) {
      this.logger.debug(`Memory not found: ${memoryId}`);
      return null;
    }

    // Check expiration
    if (memory.expiresAt && new Date() > new Date(memory.expiresAt)) {
      this.memoryStore.delete(memoryId);
      this.removeFromNamespace(operation.namespace, memoryId);
      this.logger.debug(`Expired memory removed: ${memoryId}`);
      return null;
    }

    // Decompress if necessary
    const decompressedMemory = {
      ...memory,
      content: memory.metadata?.compressed 
        ? memory.content.slice(11) // Remove "compressed:" prefix
        : memory.content,
    };

    this.logger.debug(`Memory retrieved: ${memoryId}`);
    return decompressedMemory;
  }

  async searchMemories(operation: {
    operation: 'search';
    namespace: string;
    pattern?: string;
    tags?: string[];
  }): Promise<{ memories: any[]; total: number; relevanceScores?: number[] }> {
    const namespaceKeys = this.namespaces.get(operation.namespace) || new Set();
    const results: any[] = [];
    const relevanceScores: number[] = [];

    const memoryIds = Array.from(namespaceKeys);
    for (const memoryId of memoryIds) {
      const memory = this.memoryStore.get(memoryId);
      if (!memory) continue;

      // Check expiration
      if (memory.expiresAt && new Date() > new Date(memory.expiresAt)) {
        this.memoryStore.delete(memoryId);
        this.removeFromNamespace(operation.namespace, memoryId);
        continue;
      }

      let relevance = 0;

      // Pattern matching
      if (operation.pattern) {
        const content = memory.metadata?.compressed 
          ? memory.content.slice(11)
          : memory.content;
        
        if (content.toLowerCase().includes(operation.pattern.toLowerCase())) {
          relevance += 0.5;
        }
      }

      // Tag matching
      if (operation.tags && memory.tags) {
        const matchingTags = operation.tags.filter(tag => 
          memory.tags.includes(tag)
        );
        relevance += (matchingTags.length / operation.tags.length) * 0.5;
      }

      if (relevance > 0 || (!operation.pattern && !operation.tags)) {
        results.push({
          ...memory,
          content: memory.metadata?.compressed 
            ? memory.content.slice(11)
            : memory.content,
        });
        relevanceScores.push(relevance);
      }
    }

    // Sort by relevance
    const sorted = results
      .map((memory, index) => ({ memory, score: relevanceScores[index] }))
      .sort((a, b) => b.score - a.score)
      .map(item => item.memory);

    this.logger.info(`Memory search completed: ${sorted.length} results found`, {
      namespace: operation.namespace,
      pattern: operation.pattern,
      tags: operation.tags,
    });

    return {
      memories: sorted,
      total: sorted.length,
      relevanceScores: relevanceScores.sort((a, b) => b - a),
    };
  }

  getMemoryAnalytics(): {
    totalMemories: number;
    namespaceDistribution: Record<string, number>;
    compressionStats: { compressed: number; uncompressed: number };
    expiringEntries: number;
  } {
    const analytics = {
      totalMemories: this.memoryStore.size,
      namespaceDistribution: {} as Record<string, number>,
      compressionStats: { compressed: 0, uncompressed: 0 },
      expiringEntries: 0,
    };

    // Calculate namespace distribution
    const namespaceEntries = Array.from(this.namespaces.entries());
    for (const [namespace, keys] of namespaceEntries) {
      analytics.namespaceDistribution[namespace] = keys.size;
    }

    // Calculate compression stats and expiring entries
    const now = new Date();
    const memories = Array.from(this.memoryStore.values());
    for (const memory of memories) {
      if (memory.metadata?.compressed) {
        analytics.compressionStats.compressed++;
      } else {
        analytics.compressionStats.uncompressed++;
      }

      if (memory.expiresAt && new Date(memory.expiresAt) < new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
        analytics.expiringEntries++;
      }
    }

    return analytics;
  }

  async storeTaskState(task: Task): Promise<string> {
    const operation = {
      operation: 'store' as const,
      namespace: 'coordination/tasks',
      key: `task-${task.id}`,
      content: task,
      tags: ['task', 'orchestration', task.status],
      ttl: 7 * 24 * 60 * 60, // 7 days
    };

    return this.storeMemory(operation);
  }

  private generateMemoryId(namespace: string, key?: string): string {
    return `${namespace}/${key || Date.now().toString()}`;
  }

  private generateHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  private addToNamespace(namespace: string, memoryId: string): void {
    if (!this.namespaces.has(namespace)) {
      this.namespaces.set(namespace, new Set());
    }
    this.namespaces.get(namespace)!.add(memoryId);
  }

  private removeFromNamespace(namespace: string, memoryId: string): void {
    this.namespaces.get(namespace)?.delete(memoryId);
  }
}

// Demonstration function
async function runStandaloneDemo(): Promise<void> {
  console.log('🧠 Standalone Memory Coordination Agent Demo');
  console.log('============================================\n');

  const agent = new StandaloneMemoryCoordinationAgent();

  try {
    // Demo 1: Store project context
    console.log('📁 Demo 1: Storing Project Context');
    console.log('----------------------------------');
    
    const architectureMemoryId = await agent.storeMemory({
      operation: 'store',
      namespace: 'project/unit-talk-core',
      key: 'single-writer-architecture',
      content: {
        decision: 'Use single writer pattern for unified_picks table',
        component: 'Promoter Agent',
        rationale: 'Prevents race conditions and ensures data consistency',
        impact: 'high',
        implementedAt: new Date().toISOString(),
      },
      tags: ['architecture', 'single-writer', 'promoter', 'data-consistency'],
      ttl: 30 * 24 * 60 * 60, // 30 days
    });
    console.log(`   ✅ Stored architecture decision: ${architectureMemoryId}\n`);

    // Demo 2: Store grading patterns
    console.log('🎯 Demo 2: Grading Pattern Storage');
    console.log('----------------------------------');

    const gradingResultId = await agent.storeTaskState({
      id: 'grading-task-001',
      title: 'High-Quality Grading Pattern Recognition',
      status: 'completed',
      priority: 'high',
      description: 'Analyze successful grading patterns for reuse',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ['grading', 'pattern-analysis', 'machine-learning'],
      metadata: {
        scoringFactors: ['accuracy', 'consistency', 'timeliness'],
        threshold: 85.0,
        sampleSize: 1000,
      },
    });
    console.log(`   ✅ Stored grading task: ${gradingResultId}\n`);

    // Demo 3: Store feed processing optimization
    console.log('📡 Demo 3: Feed Processing Optimization');
    console.log('--------------------------------------');

    const feedOptimizationId = await agent.storeMemory({
      operation: 'store',
      namespace: 'patterns/feed-processing',
      key: 'espn-optimization-v2',
      content: {
        provider: 'ESPN',
        optimization: 'Batch processing with connection pooling',
        performance: {
          before: { avgTime: 245, successRate: 0.89, errors: 11 },
          after: { avgTime: 142, successRate: 0.988, errors: 1.2 },
          improvement: '42% faster, 98.8% success rate',
        },
        implementation: {
          batchSize: 50,
          connectionPool: { min: 2, max: 10 },
          retryStrategy: 'exponential backoff',
        },
      },
      tags: ['feed-processing', 'ESPN', 'optimization', 'performance'],
      ttl: 60 * 24 * 60 * 60, // 60 days
    });
    console.log(`   ✅ Stored feed optimization: ${feedOptimizationId}\n`);

    // Demo 4: Store promoter flood control data
    console.log('🚧 Demo 4: Promoter Flood Control Data');
    console.log('--------------------------------------');

    const floodControlId = await agent.storeMemory({
      operation: 'store',
      namespace: 'patterns/promotion',
      key: 'flood-control-pattern',
      content: {
        timeWindow: '5-minute',
        thresholds: {
          maxPromotions: 20,
          qualityThreshold: 75,
          emergencyStop: 50,
        },
        lastTrigger: {
          timestamp: new Date().toISOString(),
          reason: 'Quality score below threshold',
          promoted: 8,
          rejected: 15,
          averageScore: 68.2,
        },
        effectiveness: 'Prevented promotion of 15 low-quality items',
      },
      tags: ['promotion', 'flood-control', 'quality-gate', 'safety'],
      ttl: 30 * 24 * 60 * 60, // 30 days
    });
    console.log(`   ✅ Stored flood control data: ${floodControlId}\n`);

    // Demo 5: Search operations
    console.log('🔍 Demo 5: Memory Search Operations');
    console.log('-----------------------------------');

    const architectureSearch = await agent.searchMemories({
      operation: 'search',
      namespace: 'project/unit-talk-core',
      pattern: 'single writer',
      tags: ['architecture'],
    });
    console.log(`   📊 Found ${architectureSearch.total} architecture memories`);
    console.log(`   📊 Relevance scores: ${architectureSearch.relevanceScores?.join(', ')}`);

    const optimizationSearch = await agent.searchMemories({
      operation: 'search',
      namespace: 'patterns/feed-processing',
      tags: ['optimization'],
    });
    console.log(`   📊 Found ${optimizationSearch.total} optimization patterns`);

    const qualitySearch = await agent.searchMemories({
      operation: 'search',
      namespace: 'patterns/promotion',
      pattern: 'quality',
    });
    console.log(`   📊 Found ${qualitySearch.total} quality-related memories\n`);

    // Demo 6: Memory retrieval
    console.log('📖 Demo 6: Memory Retrieval');
    console.log('----------------------------');

    const retrievedArchitecture = await agent.retrieveMemory({
      operation: 'retrieve',
      namespace: 'project/unit-talk-core',
      key: 'single-writer-architecture',
    });
    
    if (retrievedArchitecture) {
      const content = JSON.parse(retrievedArchitecture.content);
      console.log(`   📝 Retrieved decision: ${content.decision}`);
      console.log(`   🔧 Component: ${content.component}`);
      console.log(`   ⚡ Impact: ${content.impact}`);
      console.log(`   📅 Implemented: ${content.implementedAt}\n`);
    }

    // Demo 7: Cross-session workflow simulation
    console.log('🔄 Demo 7: Cross-Session Workflow Simulation');
    console.log('--------------------------------------------');

    const workflowStateId = await agent.storeMemory({
      operation: 'store',
      namespace: 'session/demo-session',
      key: 'workflow-state',
      content: {
        sessionId: 'demo-session-001',
        activeWorkflows: [
          { id: 'feed-processing', status: 'running', progress: 0.85, eta: '2 minutes' },
          { id: 'grading-evaluation', status: 'pending', progress: 0.0, eta: '5 minutes' },
          { id: 'promotion-cycle', status: 'waiting', progress: 0.0, eta: '10 minutes' },
        ],
        pendingTasks: [
          { id: 'process-espn-batch-42', priority: 'high', estimatedTime: '30s' },
          { id: 'validate-odds-consistency', priority: 'medium', estimatedTime: '2m' },
          { id: 'update-performance-metrics', priority: 'low', estimatedTime: '1m' },
        ],
        contextSummary: 'Processing batch 42 of ESPN data (850/1000 records) with 98.8% success rate. Grading queue: 23 items pending.',
        performanceMetrics: {
          throughput: 145,
          errorRate: 0.012,
          avgResponseTime: 142,
          queueDepth: 23,
        },
        timestamp: new Date().toISOString(),
      },
      tags: ['session-state', 'continuity', 'workflow', 'performance'],
      ttl: 24 * 60 * 60, // 24 hours
    });
    console.log(`   ✅ Stored workflow state: ${workflowStateId}`);

    const sessionSearch = await agent.searchMemories({
      operation: 'search',
      namespace: 'session/demo-session',
      tags: ['session-state'],
    });

    if (sessionSearch.memories.length > 0) {
      const sessionState = JSON.parse(sessionSearch.memories[0].content);
      console.log(`   🔄 Active workflows: ${sessionState.activeWorkflows.length}`);
      console.log(`   📋 Pending tasks: ${sessionState.pendingTasks.length}`);
      console.log(`   📊 Performance: ${sessionState.performanceMetrics.throughput} req/min, ${(sessionState.performanceMetrics.errorRate * 100).toFixed(1)}% error rate`);
      console.log(`   📝 Context: ${sessionState.contextSummary}\n`);
    }

    // Demo 8: Learning pattern storage
    console.log('🧠 Demo 8: Learning Pattern Storage');
    console.log('-----------------------------------');

    const learningPatternId = await agent.storeMemory({
      operation: 'store',
      namespace: 'patterns/strategies',
      key: 'circuit-breaker-pattern',
      content: {
        title: 'Circuit Breaker Pattern for Database Connections',
        description: 'Implement circuit breaker to prevent cascade failures',
        category: 'resilience',
        context: {
          problem: 'Database overload causing system-wide failures',
          component: 'all agents',
          symptoms: ['connection timeouts', 'cascade failures', 'degraded performance'],
        },
        solution: {
          pattern: 'Circuit Breaker',
          implementation: 'Monitor failure rate, open circuit at 50% failures',
          configuration: {
            failureThreshold: 0.5,
            timeout: 30000,
            resetTimeout: 60000,
          },
        },
        results: {
          failureReduction: 0.85,
          recoveryTimeImprovement: 0.70,
          overallSystemReliability: 0.95,
        },
        effectiveness: 0.92,
        implementationCost: 'medium',
        maintenanceOverhead: 'low',
      },
      tags: ['strategy', 'circuit-breaker', 'resilience', 'database', 'failure-prevention'],
      ttl: 90 * 24 * 60 * 60, // 90 days
    });
    console.log(`   ✅ Stored learning pattern: ${learningPatternId}\n`);

    // Demo 9: Memory analytics
    console.log('📊 Demo 9: Memory Analytics');
    console.log('---------------------------');

    const analytics = agent.getMemoryAnalytics();
    console.log(`   💾 Total memories: ${analytics.totalMemories}`);
    console.log(`   📁 Namespace distribution:`);
    for (const [namespace, count] of Object.entries(analytics.namespaceDistribution)) {
      if (count > 0) {
        console.log(`     • ${namespace}: ${count} memories`);
      }
    }
    console.log(`   🗜️  Compression stats: ${analytics.compressionStats.compressed} compressed, ${analytics.compressionStats.uncompressed} uncompressed`);
    console.log(`   ⏰ Expiring entries: ${analytics.expiringEntries}\n`);

    // Demo 10: Cross-component integration simulation
    console.log('🔗 Demo 10: Cross-Component Integration');
    console.log('--------------------------------------');

    // Simulate feed agent storing processing results
    await agent.storeMemory({
      operation: 'store',
      namespace: 'agents/feed-agent',
      key: 'processing-results-latest',
      content: {
        batchId: 'batch-42',
        provider: 'ESPN',
        processed: 850,
        successful: 839,
        errors: 11,
        processingTime: 142000, // milliseconds
        errorBreakdown: {
          networkTimeout: 7,
          parseError: 3,
          validationFailed: 1,
        },
        performanceMetrics: {
          avgItemTime: 167, // ms per item
          throughputPerSecond: 6.0,
          memoryUsage: '45MB',
        },
      },
      tags: ['feed-agent', 'processing-results', 'ESPN', 'batch-42'],
      ttl: 12 * 60 * 60, // 12 hours
    });

    // Simulate grading agent referencing feed results
    await agent.storeMemory({
      operation: 'store',
      namespace: 'agents/grading-agent',
      key: 'grading-batch-42-results',
      content: {
        sourceBatch: 'batch-42',
        itemsGraded: 839,
        averageScore: 82.3,
        distribution: {
          highQuality: 634, // >= 80
          mediumQuality: 185, // 60-79
          lowQuality: 20, // < 60
        },
        processingTime: 95000, // milliseconds
        promotionCandidates: 634,
        rejectedItems: 20,
        flaggedForReview: 185,
      },
      tags: ['grading-agent', 'batch-42', 'scoring-results', 'promotion-ready'],
      ttl: 24 * 60 * 60, // 24 hours
    });

    // Simulate promoter agent using grading results
    await agent.storeMemory({
      operation: 'store',
      namespace: 'agents/promoter-agent',
      key: 'promotion-cycle-latest',
      content: {
        sourceBatch: 'batch-42',
        candidates: 634,
        promoted: 18,
        deferred: 616,
        reason: 'Flood control: 5-minute limit reached',
        timeWindow: '13:45-13:50',
        floodGuardStatus: {
          triggered: true,
          threshold: 20,
          currentRate: 18,
          nextWindow: '13:50-13:55',
        },
        qualityStats: {
          promotedAvgScore: 89.2,
          deferredAvgScore: 81.7,
          qualityThreshold: 85.0,
        },
      },
      tags: ['promoter-agent', 'batch-42', 'flood-control', 'promotion-results'],
      ttl: 24 * 60 * 60, // 24 hours
    });

    console.log('   ✅ Simulated cross-component data flow:');
    console.log('     📡 Feed Agent → Processing Results');
    console.log('     🎯 Grading Agent → Scoring Results'); 
    console.log('     🚀 Promoter Agent → Promotion Decisions');
    console.log('     🔄 All data stored in coordinated memory system\n');

    // Final analytics
    const finalAnalytics = agent.getMemoryAnalytics();
    console.log('✅ Demonstration completed successfully!');
    console.log(`📊 Final statistics: ${finalAnalytics.totalMemories} memories across ${Object.keys(finalAnalytics.namespaceDistribution).filter(ns => finalAnalytics.namespaceDistribution[ns] > 0).length} active namespaces\n`);

    console.log('🎉 Key Capabilities Demonstrated:');
    console.log('  ✅ Project context storage and retrieval');
    console.log('  ✅ Agent coordination and task management');
    console.log('  ✅ Performance pattern capture and optimization');
    console.log('  ✅ Cross-session workflow continuity');
    console.log('  ✅ Learning pattern storage and reuse');
    console.log('  ✅ Multi-agent data flow coordination');
    console.log('  ✅ Memory analytics and performance monitoring');
    console.log('  ✅ Intelligent search with relevance scoring');
    console.log('  ✅ Automatic compression and TTL management');
    console.log('  ✅ Namespace isolation and organization\n');

    console.log('💡 Ready for integration with unit-talk-core system!');

  } catch (error) {
    console.error('❌ Error during demonstration:', error);
    throw error;
  }
}

// Run the demo
if (require.main === module) {
  runStandaloneDemo().catch(console.error);
}

export { runStandaloneDemo, StandaloneMemoryCoordinationAgent };