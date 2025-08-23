/**
 * Hive-Mind Resume Command
 * 
 * Claude Flow command implementation for the hive-mind-resume functionality.
 * Integrates with the Memory Coordination Agent to restore distributed
 * intelligence state across sessions.
 */

import { HiveMindResumeService } from '../services/HiveMindResumeService';
import { createLogger } from '@unit-talk/observability';

const logger = createLogger('hive-mind-resume-command');

interface ResumeOptions {
  sessionId?: string;
  namespace?: string;
  timeRange?: {
    from: string;
    to?: string;
  };
  includeExpired?: boolean;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  output?: 'json' | 'summary' | 'detailed';
}

interface CommandResult {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: string;
}

/**
 * Execute hive-mind-resume command
 */
export async function executeHiveMindResume(options: ResumeOptions = {}): Promise<CommandResult> {
  const startTime = new Date();
  
  try {
    logger.info('Executing hive-mind-resume command', { options });
    
    // Initialize resume service
    const resumeService = new HiveMindResumeService(options.sessionId);
    
    // Prepare resume operation
    const resumeOperation = {
      sessionId: options.sessionId,
      namespace: options.namespace,
      timeRange: options.timeRange,
      includeExpired: options.includeExpired || false,
      priority: options.priority || 'medium',
    };
    
    // Execute resume
    const resumeState = await resumeService.resumeHiveMind(resumeOperation);
    
    // Format output based on requested format
    let result;
    switch (options.output) {
      case 'json':
        result = resumeState;
        break;
      
      case 'detailed':
        result = formatDetailedOutput(resumeState);
        break;
        
      case 'summary':
      default:
        result = formatSummaryOutput(resumeState);
        break;
    }
    
    const duration = Date.now() - startTime.getTime();
    logger.info('Hive-mind resume completed successfully', {
      sessionId: resumeState.sessionId,
      restoredMemories: resumeState.restoredMemories,
      duration,
    });
    
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
    
  } catch (error) {
    const duration = Date.now() - startTime.getTime();
    logger.error('Hive-mind resume failed', { error, duration, options });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Format summary output
 */
function formatSummaryOutput(resumeState: any): string {
  const lines = [
    '🧠 Hive-Mind Resume Complete',
    '==========================',
    '',
    `📝 Session: ${resumeState.sessionId}`,
    `💾 Restored: ${resumeState.restoredMemories} memories`,
    `🔄 Workflows: ${resumeState.activeWorkflows.length} active`,
    `📋 Tasks: ${resumeState.pendingTasks.length} pending`,
    `🧩 Patterns: ${resumeState.coordinationPatterns.length} coordination patterns`,
    `⚡ Baselines: ${Object.keys(resumeState.performanceBaselines).length} components`,
    `🕐 Resumed: ${resumeState.resumeTimestamp}`,
    '',
    `📝 ${resumeState.contextSummary}`,
    '',
    '✅ System ready for coordinated multi-agent operations',
  ];
  
  return lines.join('\n');
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
  
  // Active workflows
  if (resumeState.activeWorkflows.length > 0) {
    lines.push('🔄 Active Workflows:');
    resumeState.activeWorkflows.forEach((workflow: any, index: number) => {
      lines.push(`   ${index + 1}. ${workflow.id} - ${workflow.status} (${Math.round(workflow.progress * 100)}% complete)`);
      if (workflow.eta) {
        lines.push(`      ETA: ${workflow.eta}`);
      }
    });
    lines.push('');
  }
  
  // Pending tasks
  if (resumeState.pendingTasks.length > 0) {
    lines.push('📋 Pending Tasks:');
    resumeState.pendingTasks.slice(0, 10).forEach((task: any, index: number) => {
      lines.push(`   ${index + 1}. ${task.id || task.title} - Priority: ${task.priority}`);
      if (task.estimatedTime) {
        lines.push(`      Est. Time: ${task.estimatedTime}`);
      }
    });
    if (resumeState.pendingTasks.length > 10) {
      lines.push(`   ... and ${resumeState.pendingTasks.length - 10} more tasks`);
    }
    lines.push('');
  }
  
  // Coordination patterns
  if (resumeState.coordinationPatterns.length > 0) {
    lines.push('🧩 Coordination Patterns:');
    resumeState.coordinationPatterns.forEach((pattern: any, index: number) => {
      lines.push(`   ${index + 1}. ${pattern.pattern}`);
      lines.push(`      Effectiveness: ${Math.round(pattern.effectiveness * 100)}%`);
      lines.push(`      Last Used: ${new Date(pattern.lastUsed).toLocaleString()}`);
    });
    lines.push('');
  }
  
  // Performance baselines
  if (Object.keys(resumeState.performanceBaselines).length > 0) {
    lines.push('⚡ Performance Baselines:');
    Object.entries(resumeState.performanceBaselines).forEach(([component, metrics]: [string, any]) => {
      lines.push(`   • ${component}:`);
      if (metrics.throughput) lines.push(`     Throughput: ${metrics.throughput} req/min`);
      if (metrics.avgResponseTime) lines.push(`     Avg Response: ${metrics.avgResponseTime}ms`);
      if (metrics.errorRate !== undefined) lines.push(`     Error Rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
      if (metrics.successRate !== undefined) lines.push(`     Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
    });
    lines.push('');
  }
  
  // Context summary
  lines.push('📝 Context Summary:');
  lines.push(`   ${resumeState.contextSummary}`);
  lines.push('');
  
  lines.push('✅ Hive-mind successfully resumed with full operational context');
  
  return lines.join('\n');
}

/**
 * Get available resume points
 */
export async function getAvailableResumePoints(): Promise<CommandResult> {
  try {
    logger.info('Getting available resume points');
    
    const resumeService = new HiveMindResumeService();
    const resumePoints = await resumeService.getAvailableResumePoints();
    
    const formattedPoints = resumePoints.map((point, index) => ({
      index: index + 1,
      sessionId: point.sessionId,
      resumeTimestamp: point.resumeTimestamp,
      restoredMemories: point.restoredMemories,
      contextSummary: point.contextSummary.substring(0, 100) + (point.contextSummary.length > 100 ? '...' : ''),
    }));
    
    return {
      success: true,
      data: {
        totalPoints: resumePoints.length,
        resumePoints: formattedPoints,
      },
      timestamp: new Date().toISOString(),
    };
    
  } catch (error) {
    logger.error('Failed to get available resume points', { error });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Cleanup old resume states
 */
export async function cleanupOldResumeStates(olderThanDays: number = 30): Promise<CommandResult> {
  try {
    logger.info('Cleaning up old resume states', { olderThanDays });
    
    const resumeService = new HiveMindResumeService();
    const cleanedCount = await resumeService.cleanupOldResumeStates(olderThanDays);
    
    return {
      success: true,
      data: {
        cleanedCount,
        olderThanDays,
        message: `Successfully cleaned up ${cleanedCount} old resume states older than ${olderThanDays} days`,
      },
      timestamp: new Date().toISOString(),
    };
    
  } catch (error) {
    logger.error('Failed to cleanup old resume states', { error, olderThanDays });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Get memory analytics
 */
export async function getMemoryAnalytics(): Promise<CommandResult> {
  try {
    logger.info('Getting memory analytics');
    
    const resumeService = new HiveMindResumeService();
    const analytics = resumeService.getAnalytics();
    
    return {
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    };
    
  } catch (error) {
    logger.error('Failed to get memory analytics', { error });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString(),
    };
  }
}

// Command interface for claude-flow integration
export const hiveMindResumeCommand = {
  name: 'hive-mind-resume',
  description: 'Resume hive-mind state from distributed memory',
  execute: executeHiveMindResume,
  subcommands: {
    'list-resume-points': getAvailableResumePoints,
    'cleanup': cleanupOldResumeStates,
    'analytics': getMemoryAnalytics,
  },
};

export default hiveMindResumeCommand;