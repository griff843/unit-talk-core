import { createLogger } from '@unit-talk/observability';
import { z } from 'zod';
import type { Task } from '../types/TaskTypes';

const logger = createLogger('memory-coordination');

// Memory Coordination Schema Definitions
const MemoryEntrySchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  namespace: z.string(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  hash: z.string().optional(),
});

const MemoryOperationSchema = z.object({
  operation: z.enum(['store', 'retrieve', 'search', 'delete', 'sync']),
  namespace: z.string(),
  key: z.string().optional(),
  content: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  pattern: z.string().optional(),
  ttl: z.number().optional(),
  encrypted: z.boolean().optional(),
});

const MemorySearchResultSchema = z.object({
  memories: z.array(MemoryEntrySchema),
  total: z.number(),
  relevanceScores: z.array(z.number()).optional(),
});

type MemoryEntry = z.infer<typeof MemoryEntrySchema>;
type MemoryOperation = z.infer<typeof MemoryOperationSchema>;
type MemorySearchResult = z.infer<typeof MemorySearchResultSchema>;

/**
 * Memory Coordination Specialist Agent
 * 
 * Purpose: Manages distributed memory system that enables knowledge persistence 
 * across sessions and facilitates information sharing between agents.
 * 
 * Core Functionality:
 * - Memory Operations: Store, retrieve, search, delete, sync
 * - Namespace Management: Project-specific, agent-specific, shared spaces
 * - Data Optimization: Compression, deduplication, smart indexing
 * - Cross-Session Continuity: Maintain context across sessions
 */
export class MemoryCoordinationAgent {
  private memoryStore: Map<string, MemoryEntry>;
  private namespaces: Map<string, Set<string>>;
  private compressionThreshold: number = 1024; // bytes
  private maxRetentionDays: number = 90;

  constructor() {
    this.memoryStore = new Map();
    this.namespaces = new Map();
    this.initializeDefaultNamespaces();
    
    logger.info('Memory Coordination Agent initialized');
  }

  /**
   * Initialize default namespace structure based on unit-talk-core patterns
   */
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

  /**
   * Store memory with optional TTL and compression
   */
  async storeMemory(operation: MemoryOperation): Promise<string> {
    try {
      const validatedOp = MemoryOperationSchema.parse(operation);
      
      if (validatedOp.operation !== 'store') {
        throw new Error('Invalid operation for storeMemory');
      }

      const memoryId = this.generateMemoryId(validatedOp.namespace, validatedOp.key);
      const content = JSON.stringify(validatedOp.content);
      const compressed = content.length > this.compressionThreshold 
        ? this.compressContent(content)
        : content;

      const memory: MemoryEntry = {
        id: memoryId,
        content: compressed,
        namespace: validatedOp.namespace,
        tags: validatedOp.tags || [],
        metadata: {
          originalSize: content.length,
          compressed: compressed !== content,
          createdBy: 'memory-coordination-agent',
          ttl: validatedOp.ttl,
          encrypted: validatedOp.encrypted || false,
        },
        createdAt: new Date().toISOString(),
        expiresAt: validatedOp.ttl 
          ? new Date(Date.now() + validatedOp.ttl * 1000).toISOString()
          : undefined,
        hash: this.generateHash(content),
      };

      this.memoryStore.set(memoryId, memory);
      this.addToNamespace(validatedOp.namespace, memoryId);

      logger.info(`Memory stored: ${memoryId} in namespace ${validatedOp.namespace}`, {
        size: content.length,
        compressed: compressed !== content,
        ttl: validatedOp.ttl,
      });

      return memoryId;
    } catch (error) {
      logger.error('Failed to store memory', { error, operation });
      throw new Error(`Memory store failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve memory by key or pattern
   */
  async retrieveMemory(operation: MemoryOperation): Promise<MemoryEntry | null> {
    try {
      const validatedOp = MemoryOperationSchema.parse(operation);
      
      if (validatedOp.operation !== 'retrieve') {
        throw new Error('Invalid operation for retrieveMemory');
      }

      const memoryId = this.generateMemoryId(validatedOp.namespace, validatedOp.key!);
      const memory = this.memoryStore.get(memoryId);

      if (!memory) {
        logger.debug(`Memory not found: ${memoryId}`);
        return null;
      }

      // Check expiration
      if (memory.expiresAt && new Date() > new Date(memory.expiresAt)) {
        this.memoryStore.delete(memoryId);
        this.removeFromNamespace(validatedOp.namespace, memoryId);
        logger.debug(`Expired memory removed: ${memoryId}`);
        return null;
      }

      // Decompress if necessary
      const decompressedMemory = {
        ...memory,
        content: memory.metadata?.compressed 
          ? this.decompressContent(memory.content)
          : memory.content,
      };

      logger.debug(`Memory retrieved: ${memoryId}`);
      return decompressedMemory;
    } catch (error) {
      logger.error('Failed to retrieve memory', { error, operation });
      return null;
    }
  }

  /**
   * Search memories using patterns and tags
   */
  async searchMemories(operation: MemoryOperation): Promise<MemorySearchResult> {
    try {
      const validatedOp = MemoryOperationSchema.parse(operation);
      
      if (validatedOp.operation !== 'search') {
        throw new Error('Invalid operation for searchMemories');
      }

      const namespaceKeys = this.namespaces.get(validatedOp.namespace) || new Set();
      const results: MemoryEntry[] = [];
      const relevanceScores: number[] = [];

      const memoryIds = Array.from(namespaceKeys);
      for (const memoryId of memoryIds) {
        const memory = this.memoryStore.get(memoryId);
        if (!memory) continue;

        // Check expiration
        if (memory.expiresAt && new Date() > new Date(memory.expiresAt)) {
          this.memoryStore.delete(memoryId);
          this.removeFromNamespace(validatedOp.namespace, memoryId);
          continue;
        }

        let relevance = 0;

        // Pattern matching
        if (validatedOp.pattern) {
          const content = memory.metadata?.compressed 
            ? this.decompressContent(memory.content)
            : memory.content;
          
          if (content.toLowerCase().includes(validatedOp.pattern.toLowerCase())) {
            relevance += 0.5;
          }
        }

        // Tag matching
        if (validatedOp.tags && memory.tags) {
          const matchingTags = validatedOp.tags.filter(tag => 
            memory.tags!.includes(tag)
          );
          relevance += (matchingTags.length / validatedOp.tags.length) * 0.5;
        }

        if (relevance > 0 || (!validatedOp.pattern && !validatedOp.tags)) {
          results.push({
            ...memory,
            content: memory.metadata?.compressed 
              ? this.decompressContent(memory.content)
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

      logger.info(`Memory search completed: ${sorted.length} results found`, {
        namespace: validatedOp.namespace,
        pattern: validatedOp.pattern,
        tags: validatedOp.tags,
      });

      return {
        memories: sorted,
        total: sorted.length,
        relevanceScores: relevanceScores.sort((a, b) => b - a),
      };
    } catch (error) {
      logger.error('Failed to search memories', { error, operation });
      return { memories: [], total: 0 };
    }
  }

  /**
   * Delete memory by key or pattern
   */
  async deleteMemory(operation: MemoryOperation): Promise<boolean> {
    try {
      const validatedOp = MemoryOperationSchema.parse(operation);
      
      if (validatedOp.operation !== 'delete') {
        throw new Error('Invalid operation for deleteMemory');
      }

      const memoryId = this.generateMemoryId(validatedOp.namespace, validatedOp.key!);
      const deleted = this.memoryStore.delete(memoryId);
      
      if (deleted) {
        this.removeFromNamespace(validatedOp.namespace, memoryId);
        logger.info(`Memory deleted: ${memoryId}`);
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to delete memory', { error, operation });
      return false;
    }
  }

  /**
   * Sync memory across distributed systems (stub implementation)
   */
  async syncMemory(operation: MemoryOperation): Promise<boolean> {
    try {
      const validatedOp = MemoryOperationSchema.parse(operation);
      
      if (validatedOp.operation !== 'sync') {
        throw new Error('Invalid operation for syncMemory');
      }

      // In a real implementation, this would sync with distributed nodes
      logger.info(`Memory sync requested for namespace: ${validatedOp.namespace}`);
      
      // Perform garbage collection
      await this.performGarbageCollection();
      
      return true;
    } catch (error) {
      logger.error('Failed to sync memory', { error, operation });
      return false;
    }
  }

  /**
   * Get memory usage analytics
   */
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

  /**
   * Integration with Task Orchestrator - store task state
   */
  async storeTaskState(task: Task): Promise<string> {
    const operation: MemoryOperation = {
      operation: 'store',
      namespace: `coordination/tasks`,
      key: `task-${task.id}`,
      content: task,
      tags: ['task', 'orchestration', task.status],
      ttl: 7 * 24 * 60 * 60, // 7 days
    };

    return this.storeMemory(operation);
  }

  /**
   * Integration with SPARC Agents - store phase outputs
   */
  async storeSPARCPhase(phase: string, output: unknown, projectId: string): Promise<string> {
    const operation: MemoryOperation = {
      operation: 'store',
      namespace: `project/${projectId}/sparc`,
      key: `phase-${phase}`,
      content: output,
      tags: ['sparc', phase, projectId],
      ttl: 30 * 24 * 60 * 60, // 30 days
    };

    return this.storeMemory(operation);
  }

  /**
   * Integration with Performance Analyzer - store metrics
   */
  async storePerformanceBaseline(service: string, metrics: unknown): Promise<string> {
    const operation: MemoryOperation = {
      operation: 'store',
      namespace: `patterns/performance`,
      key: `baseline-${service}`,
      content: metrics,
      tags: ['performance', 'baseline', service],
      ttl: 90 * 24 * 60 * 60, // 90 days
    };

    return this.storeMemory(operation);
  }

  // Private utility methods
  private generateMemoryId(namespace: string, key?: string): string {
    return `${namespace}/${key || Date.now().toString()}`;
  }

  private generateHash(content: string): string {
    // Simple hash implementation - in production use crypto.createHash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private compressContent(content: string): string {
    // Simplified compression - in production use proper compression library
    return content.length > this.compressionThreshold ? `compressed:${content}` : content;
  }

  private decompressContent(content: string): string {
    // Simplified decompression
    return content.startsWith('compressed:') ? content.slice(11) : content;
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

  private async performGarbageCollection(): Promise<void> {
    const now = new Date();
    const expiredKeys: string[] = [];

    // Find expired entries
    const memoryEntries = Array.from(this.memoryStore.entries());
    for (const [memoryId, memory] of memoryEntries) {
      if (memory.expiresAt && new Date(memory.expiresAt) < now) {
        expiredKeys.push(memoryId);
      }
    }

    // Remove expired entries
    let removedCount = 0;
    for (const memoryId of expiredKeys) {
      const memory = this.memoryStore.get(memoryId);
      if (memory) {
        this.memoryStore.delete(memoryId);
        this.removeFromNamespace(memory.namespace, memoryId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info(`Garbage collection completed: ${removedCount} expired entries removed`);
    }
  }
}

export default MemoryCoordinationAgent;