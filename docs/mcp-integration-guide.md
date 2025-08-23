# MCP Integration Guide

## Overview

This guide provides comprehensive instructions for integrating Model Context Protocol (MCP) servers with your applications. MCP enables secure, efficient communication between AI systems and external services.

## Available MCP Servers

### 1. ruv-swarm Server
- **Purpose**: Neural swarm orchestration and intelligent agent coordination
- **Features**: WASM-powered, no timeout mechanisms, infinite runtime capability
- **Best for**: Complex multi-agent tasks, distributed processing, neural training

### 2. IDE Server  
- **Purpose**: IDE integration and diagnostics
- **Features**: Language diagnostics, code execution, development environment integration
- **Best for**: Development workflows, code analysis, debugging

## Quick Start

### 1. Initialize ruv-swarm Integration

```javascript
// Using MCP tools (preferred in Claude Code)
mcp__ruv_swarm__swarm_init({
  topology: "mesh",        // mesh, hierarchical, ring, star
  maxAgents: 5,           // 1-100 agents
  strategy: "adaptive"     // balanced, specialized, adaptive
});
```

### 2. Spawn Agents

```javascript
// Spawn specialized agents
mcp__ruv_swarm__agent_spawn({
  type: "researcher",
  name: "Documentation Analyst",
  capabilities: ["analysis", "documentation", "pattern_recognition"]
});

mcp__ruv_swarm__agent_spawn({
  type: "coder", 
  name: "Integration Developer",
  capabilities: ["code_generation", "testing", "optimization"]
});
```

### 3. Orchestrate Tasks

```javascript
mcp__ruv_swarm__task_orchestrate({
  task: "Build comprehensive MCP integration",
  strategy: "adaptive",    // parallel, sequential, adaptive
  priority: "high",        // low, medium, high, critical
  maxAgents: 3
});
```

## Security Configuration

### Authentication Setup

```javascript
const { MCPAuthManager } = require('./src/auth-patterns');

const authManager = new MCPAuthManager();

// Register API key authentication
authManager.registerCredentials('my-server', {
  type: 'api_key',
  data: {
    apiKey: 'your-secure-api-key',
    apiSecret: 'your-api-secret' // optional for HMAC
  }
});

// Register OAuth authentication  
authManager.registerCredentials('oauth-server', {
  type: 'oauth',
  data: {
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    refreshToken: 'your-refresh-token'
  }
});
```

### Secure Token Management

```javascript
// Get authenticated token
const token = await authManager.getAuthToken('my-server');

// Use token in MCP calls
const result = await mcpIntegration.useTool('my-server', 'some-tool', {
  authorization: `Bearer ${token}`,
  ...otherParams
});
```

## Error Handling Best Practices

### Circuit Breaker Pattern

```javascript
const { MCPIntegration } = require('./src/mcp-integration');

const mcp = new MCPIntegration({
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000
});

// Circuit breaker will automatically handle failures
try {
  const result = await mcp.useTool('server', 'tool', params);
} catch (error) {
  if (error.message === 'Circuit breaker is OPEN') {
    // Handle circuit breaker state
    console.log('Service temporarily unavailable');
  } else {
    // Handle other errors
    console.error('Tool execution failed:', error);
  }
}
```

### Retry Logic

```javascript
// Built-in retry with exponential backoff
const result = await mcp.useTool('server', 'tool', params);
// Automatically retries on connection errors with backoff:
// Attempt 1: immediate
// Attempt 2: 1s delay  
// Attempt 3: 2s delay
// Attempt 4: 4s delay
```

## Performance Optimization

### Batch Operations

```javascript
// Batch multiple operations for efficiency
const operations = [
  { server: 'server1', tool: 'analyze', args: {...} },
  { server: 'server1', tool: 'process', args: {...} },
  { server: 'server2', tool: 'validate', args: {...} }
];

const results = await mcp.batchOperations(operations);
console.log(`Processed ${results.results.length} operations`);
console.log(`Errors: ${results.errors.length}`);
```

### Resource Management

```javascript
// Configure resource limits
const mcp = new MCPIntegration({
  timeout: 30000,           // 30 second timeout
  retryAttempts: 3,         // 3 retry attempts
  retryDelay: 1000,         // 1 second initial delay
  maxConcurrent: 10,        // Max concurrent operations
  poolSize: 5               // Connection pool size
});
```

## Monitoring and Diagnostics

### Status Monitoring

```javascript
// Check swarm status
const status = await mcp.useTool('ruv-swarm', 'swarm_status', {
  verbose: true
});
console.log('Swarm status:', status);

// Monitor agent performance
const metrics = await mcp.useTool('ruv-swarm', 'agent_metrics', {
  metric: 'performance'
});
console.log('Agent metrics:', metrics);
```

### Health Checks

```javascript
// Implement health check endpoint
async function healthCheck() {
  try {
    const features = await mcp.useTool('ruv-swarm', 'features_detect', {
      category: 'all'
    });
    
    return {
      status: 'healthy',
      features: features,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy', 
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}
```

## Integration Patterns

### Event-Driven Architecture

```javascript
class MCPEventManager {
  constructor(mcpIntegration) {
    this.mcp = mcpIntegration;
    this.eventHandlers = new Map();
  }

  // Register event handler
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  // Emit MCP events
  async emit(event, data) {
    const handlers = this.eventHandlers.get(event) || [];
    
    for (const handler of handlers) {
      try {
        await handler(data);
      } catch (error) {
        console.error(`Event handler failed for ${event}:`, error);
      }
    }
  }

  // Handle MCP task completion
  async handleTaskCompletion(taskId) {
    const result = await this.mcp.useTool('ruv-swarm', 'task_results', {
      taskId: taskId,
      format: 'detailed'
    });
    
    await this.emit('task:completed', { taskId, result });
  }
}
```

### Middleware Pattern

```javascript
class MCPMiddleware {
  constructor() {
    this.middlewares = [];
  }

  use(middleware) {
    this.middlewares.push(middleware);
  }

  async execute(context, next) {
    let index = 0;
    
    async function dispatch(i) {
      if (i <= index) return Promise.reject(new Error('next() called multiple times'));
      index = i;
      
      let fn = this.middlewares[i];
      if (i === this.middlewares.length) fn = next;
      if (!fn) return;
      
      return fn(context, dispatch.bind(null, i + 1));
    }
    
    return dispatch(0);
  }
}

// Usage
const middleware = new MCPMiddleware();

middleware.use(async (ctx, next) => {
  console.log('Before MCP call');
  await next();
  console.log('After MCP call');
});

middleware.use(async (ctx, next) => {
  ctx.startTime = Date.now();
  await next();
  ctx.duration = Date.now() - ctx.startTime;
});
```

## Troubleshooting

### Common Issues

1. **Connection Errors**: Check server availability and network connectivity
2. **Authentication Failures**: Verify credentials and token expiration
3. **Timeout Issues**: Adjust timeout values for long-running operations
4. **Resource Limits**: Monitor memory and CPU usage during operations

### Debug Mode

```javascript
// Enable debug logging
const mcp = new MCPIntegration({
  debug: true,
  logLevel: 'verbose'
});

// Debug specific operations
process.env.MCP_DEBUG = 'true';
```

### Error Logging

```javascript
// Implement structured logging
class MCPLogger {
  static log(level, message, context = {}) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      component: 'MCP-Integration'
    }));
  }

  static error(message, error, context = {}) {
    this.log('ERROR', message, {
      ...context,
      error: error.message,
      stack: error.stack
    });
  }

  static info(message, context = {}) {
    this.log('INFO', message, context);
  }
}
```

## Best Practices

1. **Always validate inputs** before sending to MCP servers
2. **Use batch operations** when possible for efficiency
3. **Implement proper error handling** with retry logic
4. **Monitor resource usage** and implement limits
5. **Secure credential management** with encryption
6. **Use circuit breakers** for fault tolerance
7. **Implement health checks** for monitoring
8. **Log operations** for debugging and auditing

## References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [ruv-swarm Documentation](https://github.com/ruvnet/ruv-swarm)
- [Security Best Practices](#security-configuration)
- [Performance Optimization](#performance-optimization)