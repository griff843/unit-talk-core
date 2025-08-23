import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { MemoryCoordinationService } from '../../services/MemoryCoordinationService';

describe('MemoryCoordinationService', () => {
  let service: MemoryCoordinationService;

  beforeEach(async () => {
    service = new MemoryCoordinationService();
    await service.initialize();
  });

  afterEach(async () => {
    // Cleanup after each test
    await service.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const newService = new MemoryCoordinationService();
      await expect(newService.initialize()).resolves.not.toThrow();
    });

    it('should not initialize twice', async () => {
      await expect(service.initialize()).resolves.not.toThrow();
      // Should not throw on second initialization
    });

    it('should throw when using uninitialized service', async () => {
      const uninitializedService = new MemoryCoordinationService();
      
      await expect(
        uninitializedService.storeProjectContext('architecture', { test: 'data' })
      ).rejects.toThrow('not initialized');
    });
  });

  describe('Project Context Management', () => {
    it('should store architecture decisions', async () => {
      const architectureData = {
        pattern: 'single-writer',
        component: 'promoter-agent',
        rationale: 'Ensures data consistency',
        impact: 'high',
      };

      const memoryId = await service.storeProjectContext(
        'architecture',
        architectureData,
        ['single-writer', 'promoter']
      );

      expect(memoryId).toBeDefined();
      expect(memoryId).toContain('project/unit-talk-core');
    });

    it('should store API contracts', async () => {
      const apiContract = {
        endpoint: '/api/smart/submit',
        method: 'POST',
        schema: 'SmartFormSubmission',
        validation: 'zod',
      };

      const memoryId = await service.storeProjectContext(
        'api-contracts',
        apiContract,
        ['api', 'smart-form']
      );

      expect(memoryId).toBeDefined();
    });

    it('should store configuration details', async () => {
      const config = {
        database: 'supabase',
        shadowMode: true,
        publishGuard: 'PUBLISH_TO_DISCORD=false',
      };

      const memoryId = await service.storeProjectContext(
        'configuration',
        config,
        ['database', 'shadow']
      );

      expect(memoryId).toBeDefined();
    });

    it('should store dependency information', async () => {
      const dependencies = {
        type: 'runtime',
        package: '@unit-talk/observability',
        version: '1.0.0',
        purpose: 'logging and tracing',
      };

      const memoryId = await service.storeProjectContext(
        'dependencies',
        dependencies,
        ['runtime', 'observability']
      );

      expect(memoryId).toBeDefined();
    });

    it('should store known issues', async () => {
      const issue = {
        title: 'Race condition in promoter',
        severity: 'high',
        impact: 'data integrity',
        mitigation: 'single writer pattern',
        status: 'resolved',
      };

      const memoryId = await service.storeProjectContext(
        'issues',
        issue,
        ['race-condition', 'promoter', 'resolved']
      );

      expect(memoryId).toBeDefined();
    });
  });

  describe('Agent Coordination', () => {
    it('should store task assignments', async () => {
      const swarmId = 'swarm-001';
      const coordinationData = {
        taskAssignments: {
          'agent-1': ['task-1', 'task-2'],
          'agent-2': ['task-3'],
        },
        performanceMetrics: {
          throughput: 150,
          errorRate: 0.02,
        },
      };

      const memoryIds = await service.storeAgentCoordination(swarmId, coordinationData);
      expect(memoryIds).toHaveLength(2);
      expect(memoryIds.every(id => id.includes(`coordination/${swarmId}`))).toBe(true);
    });

    it('should store communication logs', async () => {
      const swarmId = 'swarm-002';
      const coordinationData = {
        communicationLogs: [
          {
            timestamp: new Date().toISOString(),
            from: 'agent-1',
            to: 'agent-2',
            message: 'Task completed',
          },
        ],
      };

      const memoryIds = await service.storeAgentCoordination(swarmId, coordinationData);
      expect(memoryIds).toHaveLength(1);
    });

    it('should handle empty coordination data', async () => {
      const swarmId = 'swarm-003';
      const coordinationData = {};

      const memoryIds = await service.storeAgentCoordination(swarmId, coordinationData);
      expect(memoryIds).toHaveLength(0);
    });
  });

  describe('Learning Patterns', () => {
    it('should store successful strategies', async () => {
      const strategy = {
        title: 'Exponential Backoff Pattern',
        description: 'Retry failed operations with exponential delay',
        context: { service: 'feed-agent', failures: 'network timeout' },
        solution: { implementation: 'retry with 2^n * 100ms delay' },
        effectiveness: 0.95,
      };

      const memoryId = await service.storeLearningPattern('strategies', strategy);
      expect(memoryId).toContain('patterns/strategies');
    });

    it('should store error patterns', async () => {
      const errorPattern = {
        title: 'Database Connection Pool Exhaustion',
        description: 'Connection pool reaches maximum capacity',
        context: { service: 'grading-agent', trigger: 'high load' },
        solution: { fix: 'implement connection pooling with circuit breaker' },
        effectiveness: 0.88,
      };

      const memoryId = await service.storeLearningPattern('errors', errorPattern);
      expect(memoryId).toContain('patterns/errors');
    });

    it('should store optimization techniques', async () => {
      const optimization = {
        title: 'Redis Cache Warming',
        description: 'Pre-populate cache with frequently accessed data',
        context: { component: 'api-server', bottleneck: 'database queries' },
        solution: { implementation: 'scheduled cache warming job' },
        effectiveness: 0.73,
      };

      const memoryId = await service.storeLearningPattern('optimizations', optimization);
      expect(memoryId).toContain('patterns/optimizations');
    });
  });

  describe('Past Decision Retrieval', () => {
    beforeEach(async () => {
      // Setup test data
      await service.storeProjectContext('architecture', {
        decision: 'Use single writer pattern',
        component: 'promoter',
        rationale: 'Prevent race conditions',
      }, ['architecture', 'single-writer']);

      await service.storeProjectContext('api-contracts', {
        decision: 'Use Zod for validation',
        component: 'smart-form',
        rationale: 'Type safety and validation',
      }, ['api', 'validation']);
    });

    it('should retrieve past decisions by query', async () => {
      const decisions = await service.retrievePastDecisions('single writer');
      
      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions.some(d => 
        typeof d === 'object' && d !== null && 'decision' in d
      )).toBe(true);
    });

    it('should retrieve past decisions by category', async () => {
      const decisions = await service.retrievePastDecisions('validation', 'api-contracts');
      
      expect(decisions.length).toBeGreaterThan(0);
    });

    it('should return empty array for non-matching queries', async () => {
      const decisions = await service.retrievePastDecisions('nonexistent pattern');
      
      expect(decisions).toEqual([]);
    });
  });

  describe('Cross-Session Continuity', () => {
    it('should get continuity context', async () => {
      const context = await service.getContinuityContext();
      
      expect(context).toBeDefined();
      expect(context.lastSession).toBeDefined();
      expect(Array.isArray(context.pendingTasks)).toBe(true);
      expect(Array.isArray(context.activeWorkflows)).toBe(true);
      expect(typeof context.contextSummary).toBe('string');
    });

    it('should get continuity context for specific session', async () => {
      const sessionId = 'test-session-123';
      const context = await service.getContinuityContext(sessionId);
      
      expect(context).toBeDefined();
    });
  });

  describe('Unit-Talk-Core Integrations', () => {
    describe('Grading Results', () => {
      it('should store grading results', async () => {
        const result = {
          rawId: 'raw-123',
          unifiedId: 'unified-456',
          score: 87.5,
          factors: {
            accuracy: 0.9,
            consistency: 0.85,
            timeliness: 0.88,
          },
          reasoning: 'High accuracy with good consistency metrics',
        };

        const memoryId = await service.storeGradingResults(result);
        expect(memoryId).toContain('patterns/grading');
        expect(memoryId).toContain(result.unifiedId);
      });
    });

    describe('Feed Processing Patterns', () => {
      it('should store feed processing patterns', async () => {
        const pattern = {
          provider: 'ESPN',
          processingTime: 150,
          successRate: 0.95,
          errorPattern: 'Occasional timeout on large payloads',
          optimization: 'Implement chunked processing',
        };

        const memoryId = await service.storeFeedProcessingPattern(pattern);
        expect(memoryId).toContain('patterns/feed-processing');
        expect(memoryId).toContain(pattern.provider);
      });

      it('should store feed processing patterns without optional fields', async () => {
        const pattern = {
          provider: 'TheOddsAPI',
          processingTime: 200,
          successRate: 0.92,
        };

        const memoryId = await service.storeFeedProcessingPattern(pattern);
        expect(memoryId).toContain('patterns/feed-processing');
      });
    });

    describe('Promotion Patterns', () => {
      it('should store promotion patterns', async () => {
        const pattern = {
          promotionRate: 25,
          floodGuardTriggered: false,
          timeWindow: '5-minute',
          qualityMetrics: {
            averageScore: 82.3,
            scoreVariance: 15.2,
            passingRate: 0.78,
          },
        };

        const memoryId = await service.storePromotionPattern(pattern);
        expect(memoryId).toContain('patterns/promotion');
      });

      it('should store promotion patterns with flood guard triggered', async () => {
        const pattern = {
          promotionRate: 100,
          floodGuardTriggered: true,
          timeWindow: '5-minute',
          qualityMetrics: {
            averageScore: 45.1,
            scoreVariance: 28.7,
            passingRate: 0.23,
          },
        };

        const memoryId = await service.storePromotionPattern(pattern);
        expect(memoryId).toContain('patterns/promotion');
      });
    });
  });

  describe('Analytics', () => {
    beforeEach(async () => {
      // Setup some test data
      await service.storeProjectContext('architecture', { test: 'data1' });
      await service.storeGradingResults({
        rawId: 'raw-1',
        unifiedId: 'unified-1',
        score: 85,
        factors: { accuracy: 0.85 },
        reasoning: 'test',
      });
    });

    it('should provide memory analytics', () => {
      const analytics = service.getAnalytics();
      
      expect(analytics).toBeDefined();
      expect(analytics.totalMemories).toBeGreaterThan(0);
      expect(analytics.namespaceDistribution).toBeDefined();
      expect(analytics.compressionStats).toBeDefined();
      expect(analytics.expiringEntries).toBeDefined();
    });

    it('should show namespace distribution', () => {
      const analytics = service.getAnalytics();
      
      expect(analytics.namespaceDistribution['project/unit-talk-core']).toBeGreaterThan(0);
      expect(analytics.namespaceDistribution['patterns/grading']).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid memory operations gracefully', async () => {
      await expect(
        service.storeProjectContext('architecture', null)
      ).rejects.toThrow();
    });

    it('should handle malformed grading results', async () => {
      await expect(
        service.storeGradingResults({
          rawId: '', // Invalid empty ID
          unifiedId: '',
          score: -1, // Invalid score
          factors: {},
          reasoning: '',
        })
      ).resolves.toBeDefined(); // Should still store but with validation warnings
    });
  });

  describe('Cleanup Operations', () => {
    it('should perform cleanup successfully', async () => {
      await expect(service.cleanup()).resolves.not.toThrow();
    });
  });
});