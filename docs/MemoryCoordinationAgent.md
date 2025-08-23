# Memory Coordination Specialist Agent

The Memory Coordination Specialist Agent provides distributed memory management capabilities for the unit-talk-core system, enabling knowledge persistence across sessions and facilitating information sharing between agents.

## Overview

This agent implements a comprehensive memory system that supports:
- **Knowledge Persistence**: Store and retrieve information across sessions
- **Agent Coordination**: Share data between different agents and workflows  
- **Learning Patterns**: Capture successful strategies and solutions for reuse
- **Cross-Session Continuity**: Maintain context and state between system restarts
- **Performance Optimization**: Intelligent caching, compression, and data management

## Architecture

### Core Components

```
Memory Coordination System
├── MemoryCoordinationAgent        # Core memory operations and storage
├── MemoryCoordinationService      # Service layer with typed interfaces  
├── Integration Examples           # Usage patterns with existing components
└── Test Suite                    # Comprehensive validation and testing
```

### Memory Hierarchies

```
Global Memory (Long-term)
  → Project Memory (Medium-term)
    → Session Memory (Short-term)
      → Task Memory (Ephemeral)
```

## Key Features

### 1. Memory Operations

**Store**: Save data with optional TTL and encryption
```typescript
await memoryService.storeProjectContext('architecture', {
  pattern: 'single-writer',
  component: 'promoter-agent',
  rationale: 'Ensures data consistency'
}, ['single-writer', 'promoter']);
```

**Retrieve**: Fetch stored data by key or pattern  
```typescript
const decisions = await memoryService.retrievePastDecisions('single writer');
```

**Search**: Find relevant memories using patterns and tags
```typescript
const results = await agent.searchMemories({
  operation: 'search',
  namespace: 'patterns/grading',
  tags: ['high-score', 'best-practices']
});
```

### 2. Namespace Management

The system organizes memories into logical namespaces:

- `project/unit-talk-core` - Project-specific decisions and architecture
- `coordination/{swarm-id}` - Agent coordination and task assignments
- `patterns/{category}` - Learning patterns and best practices  
- `agents/{agent-name}` - Agent-specific memory areas
- `session/{session-id}` - Session-specific state and context
- `shared/global` - Shared collaboration spaces

### 3. Data Optimization

**Automatic Compression**: Large entries are compressed automatically
```typescript
// Automatic compression for content > 1024 bytes
const memoryId = await agent.storeMemory({
  operation: 'store',
  namespace: 'patterns/large-data',
  content: largeDataObject, // Will be compressed automatically
});
```

**Smart Indexing**: Fast retrieval through intelligent indexing
**Memory Analytics**: Usage tracking and optimization insights
```typescript
const analytics = memoryService.getAnalytics();
console.log(analytics.namespaceDistribution);
console.log(analytics.compressionStats);
```

## Integration Patterns

### With Task Orchestrator

Store and retrieve task states across system restarts:
```typescript
// Store task state
await agent.storeTaskState({
  id: 'task-123',
  status: 'in-progress',
  priority: 'high'
});

// Retrieve for continuity
const context = await memoryService.getContinuityContext();
```

### With SPARC Agents

Persist phase outputs and maintain architectural decisions:
```typescript
// Store SPARC phase output
await agent.storeSPARCPhase('specification', {
  requirements: ['req1', 'req2'],
  constraints: ['const1']
}, 'project-123');
```

### With Performance Analyzer

Store baselines and track optimization history:
```typescript
// Store performance baseline
await agent.storePerformanceBaseline('grading-agent', {
  avgResponseTime: 150,
  throughput: 1000,
  errorRate: 0.01
});
```

## Unit-Talk-Core Specific Integrations

### Feed Agent Integration

Store successful feed processing patterns:
```typescript
const feedIntegration = new FeedAgentMemoryIntegration(memoryService);

await feedIntegration.recordSuccessfulPattern('ESPN', {
  duration: 145,
  recordsProcessed: 1000,
  errorCount: 5,
  optimizations: ['batching', 'connection-pooling']
});

// Retrieve best practices
const practices = await feedIntegration.getBestPractices('ESPN');
```

### Grading Agent Integration

Store grading decisions with reasoning:
```typescript  
const gradingIntegration = new GradingAgentMemoryIntegration(memoryService);

await gradingIntegration.recordGradingDecision('raw-123', 'unified-456', {
  finalScore: 87.5,
  factorScores: { accuracy: 0.9, timeliness: 0.85 },
  reasoning: 'High accuracy with good timeliness'
});
```

### Promoter Agent Integration

Track promotion patterns and flood control:
```typescript
const promoterIntegration = new PromoterAgentMemoryIntegration(memoryService);

await promoterIntegration.recordPromotionCycle('5-minute', {
  promoted: 15,
  rejected: 8,
  floodGuardTriggered: false,
  averageQuality: 82.3
});
```

## Memory Patterns

### 1. Project Context
Store architectural decisions, API contracts, and configurations:
```typescript
// Architecture decisions
await memoryService.storeProjectContext('architecture', {
  decision: 'Use single writer pattern',
  rationale: 'Prevent race conditions in unified_picks table'
});

// API contracts  
await memoryService.storeProjectContext('api-contracts', {
  endpoint: '/api/smart/submit',
  schema: 'SmartFormSubmission'
});
```

### 2. Learning & Patterns
Capture successful strategies and solutions:
```typescript
await memoryService.storeLearningPattern('strategies', {
  title: 'Exponential Backoff Pattern',
  description: 'Retry failed operations with exponential delay',
  effectiveness: 0.95
});
```

### 3. Cross-Session Continuity
Maintain workflow state across restarts:
```typescript
// Save session state
await workflowManager.saveSessionState('session-001', {
  activeWorkflows: [workflow1, workflow2],
  pendingTasks: [task1, task2],
  contextSummary: 'Processing ESPN feed with high success rate'
});

// Restore on startup
const restored = await workflowManager.restoreSessionState('session-001');
```

## Security & Privacy

### Data Protection
- **TTL-based Expiration**: Automatic cleanup of expired data
- **Namespace Isolation**: Secure boundaries between different contexts
- **Content Validation**: Schema validation for all stored data
- **Access Control**: Namespace-based permissions

### Compliance Features
- **Data Retention Policies**: Configurable retention periods
- **Audit Logging**: Track all memory operations
- **Cleanup Capabilities**: Manual and automatic data purging

## Performance Optimization

### Caching Strategy
- **Hot Data**: Frequently accessed memories kept in fast storage
- **Compression**: Automatic compression for large content
- **Lazy Loading**: On-demand memory retrieval
- **Batch Operations**: Efficient bulk operations

### Scalability Features
- **Namespace Partitioning**: Logical separation for performance
- **Memory Analytics**: Usage monitoring and optimization
- **Garbage Collection**: Automatic cleanup of expired entries

## Usage Examples

### Basic Usage
```typescript
import { MemoryCoordinationService } from './services/MemoryCoordinationService';

// Initialize service
const memoryService = new MemoryCoordinationService();
await memoryService.initialize();

// Store project context
await memoryService.storeProjectContext('architecture', {
  pattern: 'single-writer',
  component: 'promoter'
});

// Retrieve past decisions
const decisions = await memoryService.retrievePastDecisions('single writer');
```

### Advanced Integration
```typescript
import { initializeMemoryIntegrations } from './examples/MemoryCoordinationIntegration';

// Initialize all integrations
const integrations = await initializeMemoryIntegrations();

// Use feed integration
await integrations.feedIntegration.recordSuccessfulPattern('ESPN', results);

// Use grading integration  
await integrations.gradingIntegration.recordGradingDecision(rawId, unifiedId, result);
```

## Testing

Comprehensive test suite covering:
- **Unit Tests**: Agent and service layer validation
- **Integration Tests**: Component interaction testing  
- **Performance Tests**: Memory usage and optimization validation
- **Error Handling**: Graceful failure scenarios

```bash
# Run memory coordination tests
npm test -- --testPathPattern=MemoryCoordination

# Run specific test suites
npm test src/test/agents/MemoryCoordinationAgent.test.ts
npm test src/test/services/MemoryCoordinationService.test.ts
```

## Configuration

### Environment Variables
```bash
# Memory settings
MEMORY_COMPRESSION_THRESHOLD=1024
MEMORY_MAX_RETENTION_DAYS=90
MEMORY_CLEANUP_INTERVAL=3600

# Namespace settings  
MEMORY_DEFAULT_TTL=86400
MEMORY_MAX_NAMESPACE_SIZE=10000
```

### Service Configuration
```typescript
const service = new MemoryCoordinationService();
await service.initialize();

// Configure analytics
const analytics = service.getAnalytics();
```

## Monitoring & Observability

### Analytics Dashboard
The memory service provides comprehensive analytics:
- **Total Memories**: Count across all namespaces
- **Namespace Distribution**: Memory allocation by category
- **Compression Statistics**: Storage optimization metrics
- **Expiration Tracking**: Upcoming expiration notifications

### Logging
Structured logging for all memory operations:
```typescript
// Automatic logging for all operations
logger.info('Memory stored', { 
  namespace: 'project/unit-talk-core',
  size: contentLength,
  compressed: true 
});
```

## Best Practices

### Effective Memory Usage
1. **Use Clear Namespaces**: `project/auth/jwt-config` vs `temp/data`
2. **Set Appropriate TTL**: Match TTL to data lifecycle
3. **Tag Strategically**: Enable efficient searching and categorization
4. **Document Purpose**: Include metadata about data purpose
5. **Regular Cleanup**: Remove obsolete entries proactively

### Performance Optimization
1. **Batch Operations**: Group related operations together
2. **Namespace Organization**: Logical separation for faster queries
3. **Compression Awareness**: Let system handle large content automatically
4. **Analytics Monitoring**: Use analytics to optimize usage patterns

## Error Handling

The system provides robust error handling:
- **Validation Errors**: Schema validation with detailed error messages
- **Storage Failures**: Graceful handling of storage issues
- **Expiration Handling**: Automatic cleanup of expired data
- **Recovery Mechanisms**: Automatic retry and fallback patterns

## Future Enhancements

### Planned Features
- **Distributed Synchronization**: Multi-node memory coordination
- **Advanced Search**: Semantic search capabilities
- **Auto-Categorization**: Intelligent namespace assignment
- **Performance Tuning**: Adaptive optimization based on usage patterns

### Integration Opportunities
- **External Memory Stores**: Redis, MongoDB integration
- **Cloud Synchronization**: Cross-environment memory sharing
- **AI-Powered Insights**: Intelligent pattern recognition
- **Real-time Collaboration**: Live memory sharing between agents

## Troubleshooting

### Common Issues

**Memory Not Found**
```typescript
// Check namespace and key
const memory = await agent.retrieveMemory({
  operation: 'retrieve',
  namespace: 'correct/namespace',
  key: 'exact-key'
});
```

**Expired Memory**
```typescript
// Check TTL settings
const memoryId = await agent.storeMemory({
  operation: 'store',
  namespace: 'test',
  content: data,
  ttl: 3600 // 1 hour
});
```

**Search Not Working**
```typescript
// Use appropriate search parameters
const results = await agent.searchMemories({
  operation: 'search',  
  namespace: 'patterns/grading',
  pattern: 'high score',
  tags: ['best-practices']
});
```

### Debug Mode
Enable detailed logging for troubleshooting:
```bash
LOG_LEVEL=DEBUG npm start
```

## Contributing

When contributing to the Memory Coordination Agent:

1. **Follow Testing Patterns**: Write comprehensive tests for new features
2. **Maintain Documentation**: Update this README for new capabilities  
3. **Preserve Backwards Compatibility**: Ensure existing integrations continue working
4. **Performance Considerations**: Optimize for the unit-talk-core use case
5. **Security Review**: Validate data handling and access patterns

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Unit Talk system overview
- [Task Orchestration](./TaskOrchestration.md) - Task management integration
- [Performance Analysis](./PerformanceAnalysis.md) - Performance monitoring integration
- [SPARC Methodology](./SPARCMethodology.md) - Development process integration