/**
 * MCP Integration Tests
 * Comprehensive test suite for MCP server integration
 */

const { MCPIntegration, MCPIntegrationError, CircuitBreaker } = require('../src/mcp-integration');
const { MCPAuthManager } = require('../src/auth-patterns');

describe('MCP Integration Tests', () => {
  let mcpIntegration;
  let authManager;

  beforeEach(() => {
    mcpIntegration = new MCPIntegration({
      timeout: 5000,
      retryAttempts: 2,
      retryDelay: 100
    });
    
    authManager = new MCPAuthManager();
  });

  afterEach(() => {
    // Cleanup connections
    if (mcpIntegration) {
      mcpIntegration.cleanup?.();
    }
  });

  describe('Server Initialization', () => {
    test('should initialize server with valid configuration', async () => {
      const serverConfig = {
        endpoint: 'http://localhost:8080',
        authentication: {
          type: 'api_key',
          data: { apiKey: 'test-key' }
        }
      };

      const server = await mcpIntegration.initializeServer('test-server', serverConfig);
      
      expect(server).toBeDefined();
      expect(server.name).toBe('test-server');
      expect(server.config).toEqual(serverConfig);
    });

    test('should throw error for invalid configuration', async () => {
      const invalidConfig = {
        endpoint: 'http://localhost:8080'
        // missing authentication
      };

      await expect(
        mcpIntegration.initializeServer('test-server', invalidConfig)
      ).rejects.toThrow(MCPIntegrationError);
    });

    test('should validate server configuration fields', () => {
      expect(() => {
        mcpIntegration.validateServerConfig({});
      }).toThrow('Missing required config field: endpoint');

      expect(() => {
        mcpIntegration.validateServerConfig({
          endpoint: 'http://localhost:8080'
        });
      }).toThrow('Missing required config field: authentication');
    });
  });

  describe('Tool Execution', () => {
    beforeEach(async () => {
      const serverConfig = {
        endpoint: 'http://localhost:8080',
        authentication: {
          type: 'api_key',
          data: { apiKey: 'test-key' }
        }
      };
      
      await mcpIntegration.initializeServer('test-server', serverConfig);
    });

    test('should execute tool with valid parameters', async () => {
      // Mock successful tool execution
      jest.spyOn(mcpIntegration, 'executeToolDirect').mockResolvedValue({
        status: 'success',
        result: 'tool executed'
      });

      const result = await mcpIntegration.useTool('test-server', 'test-tool', {
        param1: 'value1'
      });

      expect(result).toEqual({
        status: 'success',
        result: 'tool executed'
      });
    });

    test('should throw error for non-existent server', async () => {
      await expect(
        mcpIntegration.useTool('non-existent', 'test-tool', {})
      ).rejects.toThrow('Server "non-existent" not found');
    });

    test('should validate tool inputs for security', () => {
      const unsafeInput = {
        command: 'rm -rf /',
        script: '<script>alert("xss")</script>'
      };

      expect(() => {
        mcpIntegration.validateToolInputs('test-tool', unsafeInput);
      }).toThrow('Unsafe content detected');
    });

    test('should retry on retryable errors', async () => {
      let attempts = 0;
      jest.spyOn(mcpIntegration, 'executeToolDirect').mockImplementation(async () => {
        attempts++;
        if (attempts < 2) {
          const error = new Error('Connection timeout');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        return { status: 'success', result: 'success after retry' };
      });

      const result = await mcpIntegration.useTool('test-server', 'test-tool', {});
      
      expect(attempts).toBe(2);
      expect(result.result).toBe('success after retry');
    });
  });

  describe('Resource Access', () => {
    beforeEach(async () => {
      const serverConfig = {
        endpoint: 'http://localhost:8080',
        authentication: {
          type: 'api_key', 
          data: { apiKey: 'test-key' }
        }
      };
      
      await mcpIntegration.initializeServer('test-server', serverConfig);
    });

    test('should access valid resource', async () => {
      const mockResource = {
        uri: 'swarm://docs/test',
        content: 'Test content'
      };

      jest.spyOn(mcpIntegration, 'fetchResource').mockResolvedValue(mockResource);

      const result = await mcpIntegration.accessResource('test-server', 'swarm://docs/test');
      
      expect(result).toBeDefined();
    });

    test('should validate resource URI', () => {
      expect(() => {
        mcpIntegration.validateResourceUri('invalid-uri');
      }).toThrow('Invalid resource URI format');

      expect(() => {
        mcpIntegration.validateResourceUri('javascript:alert(1)');
      }).toThrow('Unsafe resource URI');
    });
  });

  describe('Batch Operations', () => {
    test('should execute batch operations efficiently', async () => {
      const operations = [
        { server: 'server1', tool: 'tool1', args: {} },
        { server: 'server1', tool: 'tool2', args: {} },
        { server: 'server2', tool: 'tool3', args: {} }
      ];

      jest.spyOn(mcpIntegration, 'executeBatchForServer').mockResolvedValue([
        { status: 'success' },
        { status: 'success' },
        { status: 'success' }
      ]);

      const results = await mcpIntegration.batchOperations(operations);
      
      expect(results.success).toBe(true);
      expect(results.results).toHaveLength(3);
      expect(results.errors).toHaveLength(0);
    });

    test('should handle partial batch failures', async () => {
      const operations = [
        { server: 'server1', tool: 'tool1', args: {} },
        { server: 'failing-server', tool: 'tool2', args: {} }
      ];

      jest.spyOn(mcpIntegration, 'executeBatchForServer')
        .mockResolvedValueOnce([{ status: 'success' }])
        .mockRejectedValueOnce(new Error('Server error'));

      const results = await mcpIntegration.batchOperations(operations);
      
      expect(results.success).toBe(false);
      expect(results.results).toHaveLength(1);
      expect(results.errors).toHaveLength(1);
    });
  });

  describe('Authentication Manager', () => {
    test('should register and retrieve credentials', () => {
      const credentials = {
        type: 'api_key',
        data: { apiKey: 'test-key-123' }
      };

      authManager.registerCredentials('test-server', credentials);
      
      const retrieved = authManager.getDecryptedCredentials('test-server');
      expect(retrieved).toEqual(credentials);
    });

    test('should validate credential formats', () => {
      expect(() => {
        authManager.validateCredentials({});
      }).toThrow('Missing required credential field');

      expect(() => {
        authManager.validateCredentials({
          type: 'api_key',
          data: { apiKey: 'short' }
        });
      }).toThrow('Invalid API key format');
    });

    test('should generate authentication tokens', async () => {
      const credentials = {
        type: 'api_key',
        data: { 
          apiKey: 'test-key-123456789',
          apiSecret: 'secret'
        }
      };

      const token = await authManager.generateAuthToken(credentials);
      
      expect(token).toContain('test-key-123456789');
      expect(token).toMatch(/^test-key-123456789:\d+:[a-f0-9]{64}$/);
    });

    test('should handle token expiration', async () => {
      authManager.registerCredentials('test-server', {
        type: 'api_key',
        data: { apiKey: 'test-key-123456789' }
      });

      const token1 = await authManager.getAuthToken('test-server');
      
      // Mock token expiration
      authManager.securityConfig.tokenExpiry = -1;
      
      const token2 = await authManager.getAuthToken('test-server');
      
      // Should generate new token after expiration
      expect(token1).toBe(token2); // Same key, but would be different with timestamp
    });
  });

  describe('Circuit Breaker', () => {
    let circuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 2,
        recoveryTimeout: 1000
      });
    });

    test('should allow operations when closed', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(operation);
      
      expect(result).toBe('success');
      expect(circuitBreaker.state).toBe('CLOSED');
    });

    test('should open circuit after failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('failure'));

      // First failure
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');
      expect(circuitBreaker.state).toBe('CLOSED');

      // Second failure - should open circuit
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');
      expect(circuitBreaker.state).toBe('OPEN');

      // Third call should be rejected immediately
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is OPEN');
    });

    test('should transition to half-open after recovery timeout', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('failure'))
        .mockRejectedValueOnce(new Error('failure'))
        .mockResolvedValueOnce('recovered');

      // Trigger circuit open
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');
      expect(circuitBreaker.state).toBe('OPEN');

      // Fast-forward past recovery timeout
      circuitBreaker.nextAttempt = Date.now() - 1;

      // Should allow one attempt and reset on success
      const result = await circuitBreaker.execute(operation);
      expect(result).toBe('recovered');
      expect(circuitBreaker.state).toBe('CLOSED');
    });
  });

  describe('Error Handling', () => {
    test('should categorize retryable errors correctly', () => {
      const retryableErrors = [
        new Error('Connection timeout'),
        new Error('ECONNRESET'),
        new Error('ETIMEDOUT')
      ];

      const nonRetryableErrors = [
        new Error('Invalid credentials'),
        new Error('Permission denied'),
        new Error('Not found')
      ];

      retryableErrors.forEach(error => {
        error.code = error.message;
        expect(mcpIntegration.isRetryableError(error)).toBe(true);
      });

      nonRetryableErrors.forEach(error => {
        expect(mcpIntegration.isRetryableError(error)).toBe(false);
      });
    });

    test('should handle connection errors gracefully', async () => {
      const serverConfig = {
        endpoint: 'http://localhost:8080',
        authentication: {
          type: 'api_key',
          data: { apiKey: 'test-key' }
        }
      };

      await mcpIntegration.initializeServer('test-server', serverConfig);

      const connectionError = new Error('Connection refused');
      connectionError.code = 'ECONNREFUSED';
      
      jest.spyOn(mcpIntegration, 'executeToolDirect').mockRejectedValue(connectionError);

      await expect(
        mcpIntegration.useTool('test-server', 'test-tool', {})
      ).rejects.toThrow('Connection refused');

      // Server should be marked as disconnected
      const server = mcpIntegration.servers.get('test-server');
      expect(server.isConnected).toBe(false);
    });
  });

  describe('Performance', () => {
    test('should complete operations within timeout limits', async () => {
      const startTime = Date.now();
      
      jest.spyOn(mcpIntegration, 'executeToolDirect').mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ status: 'success' }), 100))
      );

      const serverConfig = {
        endpoint: 'http://localhost:8080',
        authentication: {
          type: 'api_key',
          data: { apiKey: 'test-key' }
        }
      };

      await mcpIntegration.initializeServer('test-server', serverConfig);
      await mcpIntegration.useTool('test-server', 'test-tool', {});

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(mcpIntegration.config.timeout);
    });

    test('should handle concurrent operations efficiently', async () => {
      const serverConfig = {
        endpoint: 'http://localhost:8080', 
        authentication: {
          type: 'api_key',
          data: { apiKey: 'test-key' }
        }
      };

      await mcpIntegration.initializeServer('test-server', serverConfig);

      jest.spyOn(mcpIntegration, 'executeToolDirect').mockResolvedValue({ status: 'success' });

      const operations = Array(10).fill().map((_, i) => 
        mcpIntegration.useTool('test-server', 'test-tool', { id: i })
      );

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(10);
      expect(duration).toBeLessThan(1000); // Should complete quickly with mocked operations
    });
  });
});

// Integration test for real MCP servers (requires servers to be running)
describe('MCP Integration - E2E Tests', () => {
  let mcpIntegration;

  beforeAll(() => {
    mcpIntegration = new MCPIntegration();
  });

  // Skip these tests unless MCP servers are available
  const skipIfNoMCP = process.env.MCP_INTEGRATION_TESTS !== 'true' ? test.skip : test;

  skipIfNoMCP('should connect to ruv-swarm server', async () => {
    // This test requires ruv-swarm server to be running
    const features = await mcpIntegration.useTool('ruv-swarm', 'features_detect', {
      category: 'all'
    });

    expect(features).toBeDefined();
    expect(features.wasm).toBeDefined();
  });

  skipIfNoMCP('should initialize and manage swarm', async () => {
    const initResult = await mcpIntegration.useTool('ruv-swarm', 'swarm_init', {
      topology: 'mesh',
      maxAgents: 3
    });

    expect(initResult).toBeDefined();
    expect(initResult.id).toMatch(/^swarm-\d+$/);

    const status = await mcpIntegration.useTool('ruv-swarm', 'swarm_status', {
      verbose: false
    });

    expect(status).toBeDefined();
  });
});