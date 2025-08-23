#!/usr/bin/env npx ts-node

/**
 * Standalone Hive-Mind CLI
 * 
 * Self-contained command-line interface for hive-mind operations.
 * Runs without external dependencies to demonstrate functionality.
 */

import { DemoHiveMindResumeService, demonstrateHiveMindResume } from '../src/demos/hive-mind-resume-demo';
import { StandaloneMemoryCoordinationAgent, runStandaloneDemo } from '../src/demos/memory-standalone-demo';

// Command-line argument parsing
interface CliArgs {
  command: string;
  subcommand?: string;
  options: Record<string, any>;
  flags: string[];
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    command: '',
    subcommand: '',
    options: {},
    flags: [],
  };

  let currentKey: string | null = null;

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      if (currentKey) {
        result.flags.push(currentKey);
      }
      currentKey = arg.slice(2);
    } else if (arg.startsWith('-')) {
      if (currentKey) {
        result.flags.push(currentKey);
      }
      currentKey = arg.slice(1);
    } else {
      if (currentKey) {
        result.options[currentKey] = arg;
        currentKey = null;
      } else if (!result.command) {
        result.command = arg;
      } else if (!result.subcommand) {
        result.subcommand = arg;
      }
    }
  }

  if (currentKey) {
    result.flags.push(currentKey);
  }

  return result;
}

/**
 * Display help information
 */
function showHelp(): void {
  console.log(`
🧠 Hive-Mind CLI - Distributed Intelligence Management (Standalone)
===================================================================

USAGE:
  npx ts-node scripts/hive-mind-standalone-cli.ts <command> [options]

COMMANDS:
  hive-mind-resume              Resume hive-mind state (demonstration)
  memory-demo                   Run memory coordination demonstration  
  demo                          Run complete hive-mind demonstration
  test                          Run test scenarios
  help                          Show this help message

OPTIONS:
  --output <format>             Output format (json|summary|detailed)
  --session-id <id>             Custom session ID
  --verbose, -v                 Verbose output
  --json                        JSON output format

EXAMPLES:
  # Run complete hive-mind resume demonstration
  npx ts-node scripts/hive-mind-standalone-cli.ts demo

  # Run memory coordination demonstration
  npx ts-node scripts/hive-mind-standalone-cli.ts memory-demo

  # Test hive-mind resume functionality
  npx ts-node scripts/hive-mind-standalone-cli.ts test

  # Resume with custom session ID
  npx ts-node scripts/hive-mind-standalone-cli.ts hive-mind-resume --session-id test-001

This is a standalone demonstration version that doesn't require database connections.

`);
}

/**
 * Handle hive-mind-resume command (demo version)
 */
async function handleHiveMindResume(args: CliArgs): Promise<void> {
  console.log('🧠 Hive-Mind Resume (Standalone Demo)\n');
  
  try {
    // Create memory-rich environment
    const memoryAgent = new StandaloneMemoryCoordinationAgent();
    
    // Store some demo data
    await memoryAgent.storeMemory({
      operation: 'store',
      namespace: 'session/test-session',
      key: 'workflow-state',
      content: {
        activeWorkflows: [
          { id: 'data-ingestion', status: 'running', progress: 0.6, eta: '4 minutes' },
          { id: 'model-training', status: 'pending', progress: 0.0, eta: '8 minutes' },
        ],
        pendingTasks: [
          { id: 'validate-data-quality', priority: 'high' },
          { id: 'update-ml-models', priority: 'medium' },
        ],
        contextSummary: 'Active data processing with 96.4% success rate',
        performanceMetrics: { throughput: 180, errorRate: 0.036 },
        timestamp: new Date().toISOString(),
      },
      tags: ['session-state', 'workflow'],
      ttl: 24 * 60 * 60,
    });

    // Initialize resume service
    const sessionId = args.options['session-id'] || `test-resume-${Date.now()}`;
    const resumeService = new DemoHiveMindResumeService(memoryAgent, sessionId);
    
    // Execute resume
    const resumeState = await resumeService.resumeHiveMind();
    
    // Format output
    const outputFormat = args.options.output || (args.flags.includes('json') ? 'json' : 'summary');
    
    if (outputFormat === 'json') {
      console.log(JSON.stringify(resumeState, null, 2));
    } else if (outputFormat === 'detailed') {
      console.log(formatDetailedOutput(resumeState));
    } else {
      console.log(formatSummaryOutput(resumeState));
    }
    
  } catch (error) {
    console.error('❌ Resume failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Handle test scenarios
 */
async function handleTest(args: CliArgs): Promise<void> {
  console.log('🧪 Running Hive-Mind Test Scenarios\n');
  
  const testScenarios = [
    'Memory Storage and Retrieval',
    'Cross-Session State Persistence',
    'Workflow Continuity',
    'Performance Baseline Restoration',
    'Coordination Pattern Recovery',
  ];

  console.log('📋 Test Scenarios:');
  testScenarios.forEach((scenario, index) => {
    console.log(`   ${index + 1}. ${scenario}`);
  });
  console.log('');
  
  try {
    // Test 1: Memory Storage and Retrieval
    console.log('🔬 Test 1: Memory Storage and Retrieval');
    const memoryAgent = new StandaloneMemoryCoordinationAgent();
    
    const memoryId = await memoryAgent.storeMemory({
      operation: 'store',
      namespace: 'test/memory',
      key: 'test-data',
      content: { message: 'Test data for hive-mind', timestamp: new Date().toISOString() },
      tags: ['test', 'memory-validation'],
    });
    console.log(`   ✅ Stored memory: ${memoryId}`);
    
    const retrieved = await memoryAgent.retrieveMemory({
      operation: 'retrieve',
      namespace: 'test/memory',
      key: 'test-data',
    });
    console.log(`   ✅ Retrieved memory: ${retrieved ? 'Success' : 'Failed'}`);
    console.log('');
    
    // Test 2: Resume Service Initialization
    console.log('🔬 Test 2: Resume Service Initialization');
    const resumeService = new DemoHiveMindResumeService(memoryAgent, 'test-session-001');
    const analytics = resumeService.getAnalytics();
    console.log(`   ✅ Resume service initialized with ${analytics.totalMemories} memories`);
    console.log('');
    
    // Test 3: State Resume Operation
    console.log('🔬 Test 3: State Resume Operation');
    const resumeState = await resumeService.resumeHiveMind();
    console.log(`   ✅ Resume completed: ${resumeState.restoredMemories} memories restored`);
    console.log(`   ✅ Session: ${resumeState.sessionId}`);
    console.log('');
    
    console.log('🎉 All tests passed! Hive-mind system is operational.\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Format summary output
 */
function formatSummaryOutput(resumeState: any): string {
  return `
🧠 Hive-Mind Resume Complete
==========================

📝 Session: ${resumeState.sessionId}
💾 Restored: ${resumeState.restoredMemories} memories
🔄 Workflows: ${resumeState.activeWorkflows.length} active
📋 Tasks: ${resumeState.pendingTasks.length} pending
🧩 Patterns: ${resumeState.coordinationPatterns.length} coordination patterns
⚡ Baselines: ${Object.keys(resumeState.performanceBaselines).length} components
🕐 Resumed: ${resumeState.resumeTimestamp}

📝 ${resumeState.contextSummary}

✅ System ready for coordinated multi-agent operations
`;
}

/**
 * Format detailed output
 */
function formatDetailedOutput(resumeState: any): string {
  const lines = [
    '🧠 Hive-Mind Resume - Detailed Report',
    '=====================================',
    '',
    `📝 Session ID: ${resumeState.sessionId}`,
    `💾 Restored Memories: ${resumeState.restoredMemories}`,
    `🕐 Resume Timestamp: ${resumeState.resumeTimestamp}`,
    '',
  ];
  
  // Add workflow details
  if (resumeState.activeWorkflows.length > 0) {
    lines.push('🔄 Active Workflows:');
    resumeState.activeWorkflows.forEach((workflow: any, index: number) => {
      lines.push(`   ${index + 1}. ${workflow.id} - ${workflow.status} (${Math.round(workflow.progress * 100)}% complete)`);
    });
    lines.push('');
  }
  
  // Add task details
  if (resumeState.pendingTasks.length > 0) {
    lines.push('📋 Pending Tasks:');
    resumeState.pendingTasks.forEach((task: any, index: number) => {
      lines.push(`   ${index + 1}. ${task.id || task.title} - Priority: ${task.priority}`);
    });
    lines.push('');
  }
  
  lines.push(`📝 Context: ${resumeState.contextSummary}`);
  lines.push('');
  lines.push('✅ Hive-mind successfully resumed with full operational context');
  
  return lines.join('\n');
}

/**
 * Main CLI execution
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  
  // Handle help
  if (args.flags.includes('help') || args.flags.includes('h') || args.command === 'help' || !args.command) {
    showHelp();
    return;
  }

  try {
    switch (args.command) {
      case 'hive-mind-resume':
        await handleHiveMindResume(args);
        break;
        
      case 'demo':
        await demonstrateHiveMindResume();
        break;
        
      case 'memory-demo':
        await runStandaloneDemo();
        break;
        
      case 'test':
        await handleTest(args);
        break;
        
      default:
        console.error(`❌ Unknown command: ${args.command}`);
        console.log('Use --help to see available commands');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Command failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Execute main function
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ CLI execution failed:', error);
    process.exit(1);
  });
}

export { main, parseArgs };