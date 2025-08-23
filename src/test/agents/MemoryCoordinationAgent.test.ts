import { describe, it, expect, beforeEach } from '@jest/globals';
import { MemoryCoordinationAgent } from '../../agents/MemoryCoordinationAgent';

describe('MemoryCoordinationAgent', () => {
  let agent: MemoryCoordinationAgent;

  beforeEach(() => {
    agent = new MemoryCoordinationAgent();
  });

  describe('Memory Storage Operations', () => {
    it('should store memory successfully', async () => {
      const operation = {
        operation: 'store' as const,
        namespace: 'test/namespace',
        key: 'test-key',
        content: { data: 'test content' },
        tags: ['test', 'memory'],
        ttl: 3600, // 1 hour
      };

      const memoryId = await agent.storeMemory(operation);
      expect(memoryId).toMatch(/^test\/namespace\/test-key$/);
    });

    it('should store memory with compression for large content', async () => {
      const largeContent = 'x'.repeat(2000); // Exceed compression threshold
      
      const operation = {
        operation: 'store' as const,
        namespace: 'test/namespace',
        key: 'large-content',
        content: { data: largeContent },
        tags: ['test', 'large'],
      };

      const memoryId = await agent.storeMemory(operation);
      expect(memoryId).toBeDefined();

      // Retrieve and verify content is correctly decompressed
      const retrieved = await agent.retrieveMemory({
        operation: 'retrieve',
        namespace: 'test/namespace',
        key: 'large-content',
      });

      expect(retrieved).toBeDefined();
      const parsedContent = JSON.parse(retrieved!.content);
      expect(parsedContent.data).toBe(largeContent);
    });

    it('should handle memory expiration', async () => {
      const operation = {
        operation: 'store' as const,
        namespace: 'test/namespace',
        key: 'expiring-key',
        content: { data: 'expiring content' },
        ttl: 1, // 1 second
      };

      const memoryId = await agent.storeMemory(operation);
      expect(memoryId).toBeDefined();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      const retrieved = await agent.retrieveMemory({
        operation: 'retrieve',
        namespace: 'test/namespace',
        key: 'expiring-key',
      });

      expect(retrieved).toBeNull();
    });
  });

  describe('Memory Retrieval Operations', () => {
    beforeEach(async () => {
      // Setup test data
      await agent.storeMemory({
        operation: 'store',
        namespace: 'test/namespace',
        key: 'retrieve-test',
        content: { message: 'hello world' },
        tags: ['greeting', 'test'],
      });
    });

    it('should retrieve memory by key', async () => {
      const retrieved = await agent.retrieveMemory({
        operation: 'retrieve',
        namespace: 'test/namespace',
        key: 'retrieve-test',
      });

      expect(retrieved).toBeDefined();
      expect(retrieved!.namespace).toBe('test/namespace');
      
      const content = JSON.parse(retrieved!.content);
      expect(content.message).toBe('hello world');
    });

    it('should return null for non-existent memory', async () => {
      const retrieved = await agent.retrieveMemory({
        operation: 'retrieve',
        namespace: 'test/namespace',
        key: 'non-existent',
      });

      expect(retrieved).toBeNull();
    });
  });

  describe('Memory Search Operations', () => {
    beforeEach(async () => {
      // Setup test data
      const testData = [
        {
          key: 'search-1',
          content: { type: 'grading', score: 95, subject: 'math' },
          tags: ['grading', 'math', 'high-score'],
        },
        {
          key: 'search-2',
          content: { type: 'grading', score: 78, subject: 'science' },
          tags: ['grading', 'science', 'medium-score'],
        },
        {
          key: 'search-3',
          content: { type: 'feed', provider: 'espn', status: 'success' },
          tags: ['feed', 'espn', 'success'],
        },
      ];

      for (const data of testData) {
        await agent.storeMemory({
          operation: 'store',
          namespace: 'test/search',
          key: data.key,
          content: data.content,
          tags: data.tags,
        });
      }
    });

    it('should search by pattern', async () => {
      const results = await agent.searchMemories({
        operation: 'search',
        namespace: 'test/search',
        pattern: 'grading',
      });

      expect(results.memories).toHaveLength(2);
      expect(results.total).toBe(2);
      
      const contents = results.memories.map(m => JSON.parse(m.content));
      expect(contents.every(c => c.type === 'grading')).toBe(true);
    });

    it('should search by tags', async () => {
      const results = await agent.searchMemories({
        operation: 'search',
        namespace: 'test/search',
        tags: ['math'],
      });

      expect(results.memories).toHaveLength(1);
      
      const content = JSON.parse(results.memories[0].content);
      expect(content.subject).toBe('math');
    });

    it('should search by multiple tags', async () => {
      const results = await agent.searchMemories({
        operation: 'search',
        namespace: 'test/search',
        tags: ['grading', 'high-score'],
      });

      expect(results.memories).toHaveLength(1);
      
      const content = JSON.parse(results.memories[0].content);
      expect(content.score).toBe(95);
    });

    it('should return empty results for non-matching search', async () => {
      const results = await agent.searchMemories({
        operation: 'search',
        namespace: 'test/search',
        pattern: 'nonexistent',
      });

      expect(results.memories).toHaveLength(0);
      expect(results.total).toBe(0);
    });
  });

  describe('Memory Deletion Operations', () => {
    beforeEach(async () => {
      await agent.storeMemory({
        operation: 'store',
        namespace: 'test/delete',
        key: 'delete-me',
        content: { data: 'to be deleted' },
      });
    });

    it('should delete memory by key', async () => {
      const deleted = await agent.deleteMemory({
        operation: 'delete',
        namespace: 'test/delete',
        key: 'delete-me',
      });

      expect(deleted).toBe(true);

      // Verify deletion
      const retrieved = await agent.retrieveMemory({
        operation: 'retrieve',
        namespace: 'test/delete',
        key: 'delete-me',
      });

      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent memory', async () => {
      const deleted = await agent.deleteMemory({
        operation: 'delete',
        namespace: 'test/delete',
        key: 'non-existent',
      });

      expect(deleted).toBe(false);
    });
  });

  describe('Task Integration', () => {
    it('should store task state', async () => {
      const task = {
        id: 'task-123',
        title: 'Test Task',
        status: 'in-progress' as const,
        priority: 'high' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const memoryId = await agent.storeTaskState(task);
      expect(memoryId).toMatch(/^coordination\/tasks\/task-task-123$/);

      // Verify storage
      const retrieved = await agent.retrieveMemory({
        operation: 'retrieve',
        namespace: 'coordination/tasks',
        key: `task-${task.id}`,
      });

      expect(retrieved).toBeDefined();
      const storedTask = JSON.parse(retrieved!.content);
      expect(storedTask.id).toBe(task.id);
      expect(storedTask.status).toBe(task.status);
    });
  });

  describe('SPARC Integration', () => {
    it('should store SPARC phase outputs', async () => {
      const phaseOutput = {
        phase: 'specification',
        requirements: ['req1', 'req2'],
        timestamp: new Date().toISOString(),
      };

      const memoryId = await agent.storeSPARCPhase('specification', phaseOutput, 'project-123');
      expect(memoryId).toMatch(/^project\/project-123\/sparc\/phase-specification$/);

      // Verify storage with correct tags
      const results = await agent.searchMemories({
        operation: 'search',
        namespace: 'project/project-123/sparc',
        tags: ['sparc', 'specification'],
      });

      expect(results.memories).toHaveLength(1);
      const stored = JSON.parse(results.memories[0].content);
      expect(stored.phase).toBe('specification');
    });
  });

  describe('Performance Baseline Storage', () => {
    it('should store performance baselines', async () => {
      const metrics = {
        service: 'grading-agent',
        avgResponseTime: 150,
        throughput: 1000,
        errorRate: 0.01,
        timestamp: new Date().toISOString(),
      };

      const memoryId = await agent.storePerformanceBaseline('grading-agent', metrics);
      expect(memoryId).toMatch(/^patterns\/performance\/baseline-grading-agent$/);

      // Verify storage
      const results = await agent.searchMemories({
        operation: 'search',
        namespace: 'patterns/performance',
        tags: ['performance', 'baseline', 'grading-agent'],
      });

      expect(results.memories).toHaveLength(1);
      const stored = JSON.parse(results.memories[0].content);
      expect(stored.service).toBe('grading-agent');
      expect(stored.avgResponseTime).toBe(150);
    });
  });

  describe('Memory Analytics', () => {
    beforeEach(async () => {
      // Setup test data across multiple namespaces
      const testData = [
        { namespace: 'project/test', key: 'p1', content: { data: 'project1' } },
        { namespace: 'project/test', key: 'p2', content: { data: 'project2' } },
        { namespace: 'coordination/test', key: 'c1', content: { data: 'coord1' } },
      ];

      for (const data of testData) {
        await agent.storeMemory({
          operation: 'store',
          namespace: data.namespace,
          key: data.key,
          content: data.content,
        });
      }
    });

    it('should provide memory analytics', () => {
      const analytics = agent.getMemoryAnalytics();

      expect(analytics.totalMemories).toBeGreaterThan(0);
      expect(analytics.namespaceDistribution).toBeDefined();
      expect(analytics.compressionStats).toBeDefined();
      expect(analytics.expiringEntries).toBeDefined();

      // Check namespace distribution
      expect(analytics.namespaceDistribution['project/test']).toBe(2);
      expect(analytics.namespaceDistribution['coordination/test']).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid operations gracefully', async () => {
      await expect(agent.storeMemory({
        operation: 'invalid' as any,
        namespace: 'test',
        content: { data: 'test' },
      })).rejects.toThrow();
    });

    it('should handle malformed memory operations', async () => {
      await expect(agent.retrieveMemory({
        operation: 'retrieve',
        namespace: '', // Invalid empty namespace
        key: 'test',
      })).resolves.toBeNull();
    });
  });
});