#!/usr/bin/env node

/**
 * Elite Dashboard CLI
 * 
 * Command-line interface for managing the elite dashboard system.
 * Provides unified commands for generating, serving, and managing
 * the comprehensive monitoring dashboard.
 * 
 * Cross-platform compatibility with Windows and Unix systems.
 */

import { spawn, exec } from 'child_process';
import { platform } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface CLICommand {
  name: string;
  description: string;
  aliases?: string[];
  handler: (args: string[]) => Promise<void>;
}

class EliteDashboardCLI {
  private outputDir: string;
  private isWindows: boolean;

  constructor() {
    this.outputDir = join(process.cwd(), 'out', 'ops');
    this.isWindows = platform() === 'win32';
    
    // Ensure output directory exists
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Execute system command with cross-platform compatibility
   */
  private async executeCommand(command: string, args: string[] = [], options: any = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: 'inherit',
        shell: this.isWindows,
        ...options
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get the correct script runner for the platform
   */
  private getScriptRunner(): string {
    return this.isWindows ? 'tsx' : 'tsx';
  }

  /**
   * Generate dashboard data
   */
  private async generate(args: string[]): Promise<void> {
    console.log('🔄 Generating elite dashboard data...');
    
    const runner = this.getScriptRunner();
    const scriptPath = join(__dirname, 'elite-dashboard-aggregator.ts');
    const scriptArgs = ['aggregate', ...args];

    try {
      await this.executeCommand(runner, [scriptPath, ...scriptArgs]);
      console.log('✅ Dashboard data generated successfully');
    } catch (error) {
      console.error('❌ Failed to generate dashboard data:', error);
      throw error;
    }
  }

  /**
   * Start dashboard server
   */
  private async serve(args: string[]): Promise<void> {
    console.log('🚀 Starting elite dashboard server...');
    
    const runner = this.getScriptRunner();
    const scriptPath = join(__dirname, 'elite-dashboard-server.ts');

    try {
      await this.executeCommand(runner, [scriptPath, ...args]);
    } catch (error) {
      console.error('❌ Dashboard server failed:', error);
      throw error;
    }
  }

  /**
   * Watch mode - continuous generation
   */
  private async watch(args: string[]): Promise<void> {
    console.log('👀 Starting dashboard watch mode...');
    
    const runner = this.getScriptRunner();
    const scriptPath = join(__dirname, 'elite-dashboard-aggregator.ts');
    const scriptArgs = ['watch', ...args];

    try {
      await this.executeCommand(runner, [scriptPath, ...scriptArgs]);
    } catch (error) {
      console.error('❌ Watch mode failed:', error);
      throw error;
    }
  }

  /**
   * Run all monitoring systems
   */
  private async monitor(args: string[]): Promise<void> {
    console.log('📊 Running all monitoring systems...');
    
    const runner = this.getScriptRunner();
    const scripts = [
      'exposure-scan.ts',
      'freeze-rules.ts', 
      'drift.ts',
      'slo-monitor.ts'
    ];

    for (const script of scripts) {
      const scriptPath = join(__dirname, script);
      if (existsSync(scriptPath)) {
        try {
          console.log(`🔍 Running ${script}...`);
          await this.executeCommand(runner, [scriptPath, ...args]);
          console.log(`✅ ${script} completed`);
        } catch (error) {
          console.warn(`⚠️  ${script} failed:`, error);
        }
      } else {
        console.warn(`⚠️  Script not found: ${script}`);
      }
    }

    // Generate dashboard with fresh data
    await this.generate(args);
  }

  /**
   * Status check - show current system status
   */
  private async status(args: string[]): Promise<void> {
    console.log('📋 Checking elite dashboard status...\n');

    // Check if output files exist
    const files = [
      'elite-dashboard.json',
      'dashboard.json',
      'exposure.json',
      'freeze.json',
      'drift.json',
      'slo.json'
    ];

    console.log('📁 Dashboard Files:');
    for (const file of files) {
      const filePath = join(this.outputDir, file);
      const exists = existsSync(filePath);
      const status = exists ? '✅' : '❌';
      console.log(`   ${status} ${file} ${exists ? '(exists)' : '(missing)'}`);
    }

    // Try to load elite dashboard data for summary
    const eliteDashboardPath = join(this.outputDir, 'elite-dashboard.json');
    if (existsSync(eliteDashboardPath)) {
      try {
        const { readFileSync } = await import('fs');
        const data = JSON.parse(readFileSync(eliteDashboardPath, 'utf-8'));
        
        console.log('\n📊 System Health Summary:');
        console.log(`   Health Score: ${data.overall_status.health_score}/100`);
        console.log(`   Status: ${data.overall_status.status.toUpperCase()}`);
        console.log(`   Systems Healthy: ${data.overall_status.systems_healthy}/${data.overall_status.systems_total}`);
        console.log(`   Critical Alerts: ${data.alerts.filter((a: any) => a.level === 'CRITICAL').length}`);
        console.log(`   Warning Alerts: ${data.alerts.filter((a: any) => a.level === 'WARNING').length}`);
        console.log(`   Last Updated: ${new Date(data.timestamp).toLocaleString()}`);
        console.log(`   Deployment Phase: ${data.overall_status.deployment_phase}`);
        
        if (data.alerts.filter((a: any) => a.level === 'CRITICAL').length > 0) {
          console.log('\n🚨 Critical Alerts:');
          data.alerts.filter((a: any) => a.level === 'CRITICAL').slice(0, 3).forEach((alert: any) => {
            console.log(`   - ${alert.system}: ${alert.message}`);
          });
        }
      } catch (error) {
        console.warn('⚠️  Could not parse dashboard data:', error);
      }
    }

    // Check if server is running
    console.log('\n🔌 Server Status:');
    try {
      const response = await fetch('http://localhost:3001/api/health');
      if (response.ok) {
        const health = await response.json();
        console.log('   ✅ Dashboard server is running');
        console.log(`   📡 WebSocket clients: ${health.dashboard_config.connected_clients}`);
        console.log(`   ⚡ Uptime: ${Math.floor(health.uptime_seconds / 3600)}h ${Math.floor((health.uptime_seconds % 3600) / 60)}m`);
      }
    } catch (error) {
      console.log('   ❌ Dashboard server is not running');
      console.log('   💡 Start with: npm run ops:dashboard serve');
    }
  }

  /**
   * Clean up dashboard files
   */
  private async clean(args: string[]): Promise<void> {
    console.log('🧹 Cleaning up dashboard files...');

    const { unlinkSync } = await import('fs');
    const files = [
      'elite-dashboard.json',
      'dashboard.json',
      'exposure.json',
      'freeze.json',
      'drift.json',
      'slo.json',
      'slo-report*.json'
    ];

    let cleanedCount = 0;
    for (const file of files) {
      const filePath = join(this.outputDir, file);
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
          console.log(`   🗑️  Removed ${file}`);
          cleanedCount++;
        } catch (error) {
          console.warn(`   ⚠️  Failed to remove ${file}:`, error);
        }
      }
    }

    console.log(`✅ Cleaned up ${cleanedCount} files`);
  }

  /**
   * Show help information
   */
  private async help(args: string[]): Promise<void> {
    console.log(`
🎯 Elite Dashboard CLI

USAGE:
  npm run ops:dashboard <command> [options]
  node scripts/ops/elite-dashboard-cli.ts <command> [options]

COMMANDS:
  generate, gen        Generate dashboard data once
  serve, server        Start dashboard HTTP server
  watch, w            Continuous dashboard generation
  monitor, mon        Run all monitoring systems + generate
  status, st          Show current dashboard status
  clean               Clean up dashboard files
  help, h             Show this help message

OPTIONS:
  --port PORT         Server port (default: 3001)
  --host HOST         Server host (default: 0.0.0.0)
  --output DIR        Output directory (default: out/ops)
  --refresh SECS      Refresh interval (default: 30)
  --war-room          Enable war-room display mode
  --no-websocket      Disable WebSocket updates
  --no-cors           Disable CORS headers

EXAMPLES:
  npm run ops:dashboard generate
  npm run ops:dashboard serve --port 8080
  npm run ops:dashboard watch --refresh 60
  npm run ops:dashboard monitor
  npm run ops:dashboard status

MONITORING SYSTEMS:
  ✅ Exposure Guardian - Risk management monitoring
  ✅ Freeze Engine - Deployment freeze controls
  ✅ Drift Detection - ML feature stability
  ✅ SLO Monitor - Service level objectives
  ✅ Toggle System - Feature flag management
  ✅ Core Services - API, DB, Temporal, Worker health

DASHBOARD FEATURES:
  📊 Real-time status tiles with visual indicators
  🚨 Alert management with severity levels
  📡 WebSocket real-time updates
  🔗 Integration links to external tools
  🎛️  Professional war-room display
  🔄 Auto-refresh with configurable intervals
  💻 Cross-platform compatibility

For more information, see: https://github.com/unit-talk/unit-talk-core/docs/elite-dashboard
    `);
  }

  /**
   * Available commands
   */
  private get commands(): CLICommand[] {
    return [
      {
        name: 'generate',
        aliases: ['gen'],
        description: 'Generate dashboard data once',
        handler: this.generate.bind(this)
      },
      {
        name: 'serve',
        aliases: ['server'],
        description: 'Start dashboard HTTP server',
        handler: this.serve.bind(this)
      },
      {
        name: 'watch',
        aliases: ['w'],
        description: 'Continuous dashboard generation',
        handler: this.watch.bind(this)
      },
      {
        name: 'monitor',
        aliases: ['mon'],
        description: 'Run all monitoring systems + generate',
        handler: this.monitor.bind(this)
      },
      {
        name: 'status',
        aliases: ['st'],
        description: 'Show current dashboard status',
        handler: this.status.bind(this)
      },
      {
        name: 'clean',
        description: 'Clean up dashboard files',
        handler: this.clean.bind(this)
      },
      {
        name: 'help',
        aliases: ['h'],
        description: 'Show help message',
        handler: this.help.bind(this)
      }
    ];
  }

  /**
   * Run CLI with given arguments
   */
  async run(args: string[]): Promise<void> {
    if (args.length === 0) {
      await this.help([]);
      return;
    }

    const commandName = args[0];
    const commandArgs = args.slice(1);

    // Find command by name or alias
    const command = this.commands.find(cmd => 
      cmd.name === commandName || (cmd.aliases && cmd.aliases.includes(commandName))
    );

    if (!command) {
      console.error(`❌ Unknown command: ${commandName}`);
      console.error('💡 Run "npm run ops:dashboard help" to see available commands');
      process.exit(1);
    }

    try {
      await command.handler(commandArgs);
    } catch (error) {
      console.error(`❌ Command "${commandName}" failed:`, error);
      process.exit(1);
    }
  }
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const cli = new EliteDashboardCLI();
  
  try {
    await cli.run(args);
  } catch (error) {
    console.error('❌ CLI execution failed:', error);
    process.exit(1);
  }
}

// Export for testing
export { EliteDashboardCLI };

// Run CLI if called directly
if (require.main === module) {
  main();
}