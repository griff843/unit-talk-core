/**
 * MCP Integration Module
 * Provides secure, efficient communication with MCP servers
 */

class MCPIntegration {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };
    this.servers = new Map();
    this.connectionPool = new Map();
    this.circuitBreaker = new CircuitBreaker();
  }

  /**
   * Initialize MCP server connection
   * @param {string} serverName - Name of the MCP server
   * @param {Object} serverConfig - Server configuration
   */
  async initializeServer(serverName, serverConfig) {
    try {
      const server = {
        name: serverName,
        config: serverConfig,
        isConnected: false,
        lastPing: null,
        retryCount: 0
      };

      // Validate server configuration
      this.validateServerConfig(serverConfig);
      
      // Establish connection
      await this.connectToServer(server);
      
      this.servers.set(serverName, server);
      console.log(`✅ MCP server "${serverName}" initialized successfully`);
      
      return server;
    } catch (error) {
      console.error(`❌ Failed to initialize MCP server "${serverName}":`, error);
      throw new MCPIntegrationError(`Server initialization failed: ${error.message}`);
    }
  }

  /**
   * Use MCP tool with proper error handling and retry logic
   * @param {string} serverName - Target MCP server
   * @param {string} toolName - Tool to execute
   * @param {Object} arguments - Tool arguments
   */
  async useTool(serverName, toolName, toolArguments = {}) {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new MCPIntegrationError(`Server "${serverName}" not found`);
    }

    return this.circuitBreaker.execute(async () => {
      try {
        // Validate inputs
        this.validateToolInputs(toolName, toolArguments);
        
        // Check server connection
        await this.ensureServerConnected(server);
        
        // Execute tool with retry logic
        return await this.executeWithRetry(server, toolName, toolArguments);
        
      } catch (error) {
        this.handleToolError(server, error);
        throw error;
      }
    });
  }

  /**
   * Access MCP resource with proper validation
   * @param {string} serverName - Target MCP server
   * @param {string} resourceUri - Resource URI
   */
  async accessResource(serverName, resourceUri) {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new MCPIntegrationError(`Server "${serverName}" not found`);
    }

    try {
      // Validate resource URI
      this.validateResourceUri(resourceUri);
      
      // Check server connection
      await this.ensureServerConnected(server);
      
      // Fetch resource with error handling
      const resource = await this.fetchResource(server, resourceUri);
      
      return this.processResource(resource);
      
    } catch (error) {
      console.error(`❌ Failed to access resource "${resourceUri}":`, error);
      throw new MCPIntegrationError(`Resource access failed: ${error.message}`);
    }
  }

  /**
   * Batch multiple operations for efficiency
   * @param {Array} operations - Array of operations to execute
   */
  async batchOperations(operations) {
    const results = [];
    const errors = [];

    // Group operations by server for optimal batching
    const serverGroups = this.groupOperationsByServer(operations);

    for (const [serverName, ops] of serverGroups) {
      try {
        const serverResults = await this.executeBatchForServer(serverName, ops);
        results.push(...serverResults);
      } catch (error) {
        errors.push({ serverName, error });
      }
    }

    return {
      results,
      errors,
      success: errors.length === 0
    };
  }

  /**
   * Validate server configuration
   */
  validateServerConfig(config) {
    const required = ['endpoint', 'authentication'];
    for (const field of required) {
      if (!config[field]) {
        throw new MCPIntegrationError(`Missing required config field: ${field}`);
      }
    }

    // Validate authentication
    if (config.authentication && !this.isValidAuth(config.authentication)) {
      throw new MCPIntegrationError('Invalid authentication configuration');
    }
  }

  /**
   * Validate tool inputs for security
   */
  validateToolInputs(toolName, args) {
    // Sanitize inputs to prevent injection attacks
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string' && this.containsUnsafeContent(value)) {
        throw new MCPIntegrationError(`Unsafe content detected in parameter: ${key}`);
      }
    }
  }

  /**
   * Execute tool with retry logic
   */
  async executeWithRetry(server, toolName, args) {
    let lastError;
    
    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        const result = await this.executeToolDirect(server, toolName, args);
        
        // Reset retry count on success
        server.retryCount = 0;
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (!this.isRetryableError(error) || attempt === this.config.retryAttempts - 1) {
          throw error;
        }
        
        // Exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Handle tool execution errors
   */
  handleToolError(server, error) {
    server.retryCount++;
    
    if (this.isConnectionError(error)) {
      server.isConnected = false;
    }
    
    // Log error with context
    console.error(`❌ Tool execution failed for server "${server.name}":`, {
      error: error.message,
      retryCount: server.retryCount,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableCodes = ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED'];
    return retryableCodes.some(code => error.code === code) || 
           error.message.includes('timeout') ||
           error.message.includes('connection');
  }

  /**
   * Utility method for delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit Breaker for fault tolerance
 */
class CircuitBreaker {
  constructor(config = {}) {
    this.failureThreshold = config.failureThreshold || 5;
    this.recoveryTimeout = config.recoveryTimeout || 60000;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.nextAttempt = Date.now();
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.recoveryTimeout;
    }
  }
}

/**
 * Custom error class for MCP integration
 */
class MCPIntegrationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'MCPIntegrationError';
    this.code = code;
  }
}

module.exports = {
  MCPIntegration,
  MCPIntegrationError,
  CircuitBreaker
};