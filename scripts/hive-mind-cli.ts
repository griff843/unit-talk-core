#!/usr/bin/env npx ts-node

/**
 * Hive-Mind CLI
 * 
 * Command-line interface for hive-mind operations including resume functionality.
 * Mimics the claude-flow command structure for seamless integration.
 */

import { executeHiveMindResume, getAvailableResumePoints, cleanupOldResumeStates, getMemoryAnalytics } from '../src/commands/hive-mind-resume';
import { demonstrateHiveMindResume } from '../src/demos/hive-mind-resume-demo';
import { runStandaloneDemo } from '../src/demos/memory-standalone-demo';

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
🧠 Hive-Mind CLI - Distributed Intelligence Management
=====================================================

USAGE:
  npx ts-node scripts/hive-mind-cli.ts <command> [subcommand] [options]

COMMANDS:
  hive-mind-resume              Resume hive-mind state from distributed memory
  list-resume-points            List available resume points
  cleanup                       Cleanup old resume states
  analytics                     Get memory analytics
  demo                          Run hive-mind demonstration
  memory-demo                   Run memory coordination demonstration
  help                          Show this help message

HIVE-MIND-RESUME OPTIONS:
  --session-id <id>             Specific session ID to resume
  --namespace <namespace>       Limit resume to specific namespace
  --from <timestamp>            Resume from specific time (ISO string)
  --to <timestamp>              Resume to specific time (ISO string)
  --include-expired             Include expired memories
  --priority <level>            Priority level (critical|high|medium|low)
  --output <format>             Output format (json|summary|detailed)

CLEANUP OPTIONS:
  --older-than <days>           Clean states older than N days (default: 30)

EXAMPLES:
  # Resume hive-mind with default settings
  npx ts-node scripts/hive-mind-cli.ts hive-mind-resume

  # Resume specific session with detailed output
  npx ts-node scripts/hive-mind-cli.ts hive-mind-resume --session-id demo-001 --output detailed

  # List available resume points
  npx ts-node scripts/hive-mind-cli.ts list-resume-points

  # Cleanup old states
  npx ts-node scripts/hive-mind-cli.ts cleanup --older-than 7

  # Get memory analytics
  npx ts-node scripts/hive-mind-cli.ts analytics

  # Run demonstrations
  npx ts-node scripts/hive-mind-cli.ts demo
  npx ts-node scripts/hive-mind-cli.ts memory-demo

FLAGS:
  --help, -h                    Show help
  --verbose, -v                 Verbose output
  --json                        JSON output format
  --quiet, -q                   Minimal output

`);
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
        
      case 'list-resume-points':
        await handleListResumePoints(args);
        break;
        
      case 'cleanup':
        await handleCleanup(args);
        break;
        
      case 'analytics':
        await handleAnalytics(args);
        break;
        
      case 'demo':
        await handleDemo(args);
        break;
        
      case 'memory-demo':
        await handleMemoryDemo(args);
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

/**
 * Handle hive-mind-resume command
 */
async function handleHiveMindResume(args: CliArgs): Promise<void> {
  const options = {
    sessionId: args.options.sessionId || args.options['session-id'],
    namespace: args.options.namespace,
    timeRange: (args.options.from || args.options.to) ? {
      from: args.options.from,
      to: args.options.to,
    } : undefined,
    includeExpired: args.flags.includes('include-expired'),
    priority: args.options.priority || 'medium',
    output: args.options.output || (args.flags.includes('json') ? 'json' : 'summary'),
  };

  console.log('🧠 Executing hive-mind-resume...\n');
  
  const result = await executeHiveMindResume(options);
  
  if (result.success) {
    if (options.output === 'json') {
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.log(result.data);
    }
  } else {
    console.error(`❌ Resume failed: ${result.error}`);
    process.exit(1);
  }
}

/**
 * Handle list-resume-points command
 */
async function handleListResumePoints(args: CliArgs): Promise<void> {
  console.log('📋 Listing available resume points...\n');
  
  const result = await getAvailableResumePoints();
  
  if (result.success) {
    const data = result.data as any;
    
    if (args.flags.includes('json')) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`📊 Found ${data.totalPoints} available resume points:\n`);
      
      if (data.totalPoints === 0) {
        console.log('   No resume points available. Run hive-mind-resume to create one.');
      } else {
        data.resumePoints.forEach((point: any) => {
          console.log(`   ${point.index}. Session: ${point.sessionId}`);
          console.log(`      Timestamp: ${new Date(point.resumeTimestamp).toLocaleString()}`);
          console.log(`      Memories: ${point.restoredMemories}`);
          console.log(`      Context: ${point.contextSummary}`);
          console.log('');
        });
      }
    }
  } else {
    console.error(`❌ Failed to list resume points: ${result.error}`);
    process.exit(1);
  }
}

/**
 * Handle cleanup command
 */
async function handleCleanup(args: CliArgs): Promise<void> {
  const olderThanDays = parseInt(args.options['older-than'] || args.options.olderThan) || 30;
  
  console.log(`🧹 Cleaning up resume states older than ${olderThanDays} days...\n`);
  
  const result = await cleanupOldResumeStates(olderThanDays);
  
  if (result.success) {
    const data = result.data as any;
    
    if (args.flags.includes('json')) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`✅ ${data.message}`);
    }
  } else {
    console.error(`❌ Cleanup failed: ${result.error}`);
    process.exit(1);
  }
}

/**
 * Handle analytics command
 */
async function handleAnalytics(args: CliArgs): Promise<void> {
  console.log('📊 Retrieving memory analytics...\n');
  
  const result = await getMemoryAnalytics();
  
  if (result.success) {
    const data = result.data as any;
    
    if (args.flags.includes('json')) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('📈 Memory Analytics:');
      console.log(`   💾 Total Memories: ${data.totalMemories}`);
      console.log(`   📁 Active Namespaces: ${Object.keys(data.namespaceDistribution).filter((ns: string) => data.namespaceDistribution[ns] > 0).length}`);
      console.log(`   🗜️  Compression: ${data.compressionStats.compressed} compressed, ${data.compressionStats.uncompressed} uncompressed`);
      console.log(`   ⏰ Expiring Soon: ${data.expiringEntries} entries`);
      console.log('');
      
      console.log('📁 Namespace Distribution:');
      Object.entries(data.namespaceDistribution).forEach(([namespace, count]: [string, any]) => {
        if (count > 0) {
          console.log(`   • ${namespace}: ${count} memories`);
        }
      });
    }
  } else {
    console.error(`❌ Analytics retrieval failed: ${result.error}`);
    process.exit(1);
  }
}

/**
 * Handle demo command
 */
async function handleDemo(args: CliArgs): Promise<void> {
  console.log('🎬 Running hive-mind resume demonstration...\n');
  
  try {
    await demonstrateHiveMindResume();
  } catch (error) {
    console.error('❌ Demo failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Handle memory-demo command
 */
async function handleMemoryDemo(args: CliArgs): Promise<void> {
  console.log('🎬 Running memory coordination demonstration...\n');
  
  try {
    await runStandaloneDemo();
  } catch (error) {
    console.error('❌ Memory demo failed:', error instanceof Error ? error.message : error);
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