// scripts/toggles/storage.ts
// File-based storage for toggles with Windows-safe operations and atomic writes

import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { createWriteStream, existsSync } from 'node:fs';
import type {
  ToggleConfig,
  ToggleAuditEntry,
  ToggleState,
  ToggleProposal,
  ToggleValidationResult,
} from './types.js';

export class ToggleStorage {
  private readonly togglesPath: string;
  private readonly auditPath: string;
  private readonly lockPath: string;

  constructor(baseDir: string = 'out/ops') {
    this.togglesPath = join(baseDir, 'toggles.json');
    this.auditPath = join(baseDir, 'toggles.audit.jsonl');
    this.lockPath = join(baseDir, '.toggles.lock');
  }

  /**
   * Initialize storage directory and files
   */
  async initialize(): Promise<void> {
    const dir = dirname(this.togglesPath);
    await fs.mkdir(dir, { recursive: true });

    // Create empty files if they don't exist
    if (!existsSync(this.togglesPath)) {
      const initialConfig: ToggleConfig = {
        currentToggles: {},
        pendingProposals: {},
        version: 0,
        lastUpdated: new Date().toISOString(),
      };
      await this.writeToggleConfig(initialConfig);
    }

    if (!existsSync(this.auditPath)) {
      // Create empty audit log
      await fs.writeFile(this.auditPath, '');
    }
  }

  /**
   * Read current toggle configuration with file locking
   */
  async readToggleConfig(): Promise<ToggleConfig> {
    await this.waitForLock();
    
    try {
      const data = await fs.readFile(this.togglesPath, 'utf-8');
      const config = JSON.parse(data) as ToggleConfig;
      
      // Validate structure
      if (!config.currentToggles || !config.pendingProposals || typeof config.version !== 'number') {
        throw new Error('Invalid toggle configuration format');
      }
      
      return config;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // File doesn't exist, return default config
        return {
          currentToggles: {},
          pendingProposals: {},
          version: 0,
          lastUpdated: new Date().toISOString(),
        };
      }
      throw error;
    }
  }

  /**
   * Write toggle configuration atomically with Windows-safe temp file approach
   */
  async writeToggleConfig(config: ToggleConfig): Promise<void> {
    await this.acquireLock();
    
    try {
      const tempPath = `${this.togglesPath}.tmp`;
      
      // Update version and timestamp
      config.version += 1;
      config.lastUpdated = new Date().toISOString();
      
      // Write to temp file first (atomic on Windows)
      await fs.writeFile(tempPath, JSON.stringify(config, null, 2), 'utf-8');
      
      // Atomic move from temp to final location
      await fs.rename(tempPath, this.togglesPath);
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Append audit entry to JSONL file with Windows-safe append
   */
  async appendAuditEntry(entry: ToggleAuditEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    
    // Use append flag for atomic append operation
    await fs.appendFile(this.auditPath, line, 'utf-8');
  }

  /**
   * Read audit log with optional filtering
   */
  async readAuditLog(filter?: {
    toggleKey?: string;
    actor?: string;
    action?: string;
    since?: Date;
    limit?: number;
  }): Promise<ToggleAuditEntry[]> {
    try {
      const data = await fs.readFile(this.auditPath, 'utf-8');
      const lines = data.trim().split('\n').filter(line => line.trim());
      
      let entries = lines.map(line => JSON.parse(line) as ToggleAuditEntry);
      
      // Apply filters
      if (filter) {
        if (filter.toggleKey) {
          entries = entries.filter(e => e.toggleKey === filter.toggleKey);
        }
        
        if (filter.actor) {
          entries = entries.filter(e => e.actor === filter.actor);
        }
        
        if (filter.action) {
          entries = entries.filter(e => e.action === filter.action);
        }
        
        if (filter.since) {
          entries = entries.filter(e => new Date(e.timestamp) >= filter.since!);
        }
        
        if (filter.limit && filter.limit > 0) {
          entries = entries.slice(-filter.limit); // Get most recent
        }
      }
      
      return entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return []; // No audit log yet
      }
      throw error;
    }
  }

  /**
   * Validate storage integrity
   */
  async validateStorage(): Promise<ToggleValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Validate toggles.json
      const config = await this.readToggleConfig();
      
      if (!config.currentToggles || typeof config.currentToggles !== 'object') {
        errors.push('Invalid currentToggles structure');
      }
      
      if (!config.pendingProposals || typeof config.pendingProposals !== 'object') {
        errors.push('Invalid pendingProposals structure');
      }
      
      if (typeof config.version !== 'number' || config.version < 0) {
        errors.push('Invalid version number');
      }
      
      // Validate audit log format
      try {
        const auditEntries = await this.readAuditLog();
        
        for (const entry of auditEntries) {
          if (!entry.timestamp || !entry.action || !entry.toggleKey || !entry.actor) {
            errors.push(`Invalid audit entry: missing required fields`);
            break;
          }
          
          if (!['propose', 'approve', 'reject', 'apply', 'expire'].includes(entry.action)) {
            errors.push(`Invalid audit entry: unknown action ${entry.action}`);
          }
        }
      } catch (auditError) {
        errors.push(`Audit log validation failed: ${(auditError as Error).message}`);
      }
      
      // Check for orphaned proposals
      const now = new Date();
      for (const [id, proposal] of Object.entries(config.pendingProposals)) {
        const proposedAt = new Date(proposal.proposedAt);
        const hoursSinceProposal = (now.getTime() - proposedAt.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceProposal > 24) {
          warnings.push(`Proposal ${id} has been pending for over 24 hours`);
        }
        
        if (proposal.status === 'pending' && hoursSinceProposal > 168) { // 7 days
          warnings.push(`Proposal ${id} should be expired after 7 days`);
        }
      }
      
    } catch (error) {
      errors.push(`Storage validation failed: ${(error as Error).message}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Backup current storage to timestamped files
   */
  async createBackup(): Promise<{ togglesBackup: string; auditBackup: string }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = dirname(this.togglesPath);
    
    const togglesBackup = join(dir, `toggles.${timestamp}.backup.json`);
    const auditBackup = join(dir, `toggles.audit.${timestamp}.backup.jsonl`);
    
    await Promise.all([
      fs.copyFile(this.togglesPath, togglesBackup),
      fs.copyFile(this.auditPath, auditBackup),
    ]);
    
    return { togglesBackup, auditBackup };
  }

  /**
   * Acquire file lock for atomic operations
   */
  private async acquireLock(timeoutMs: number = 5000): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeoutMs) {
      try {
        await fs.writeFile(this.lockPath, process.pid.toString(), { flag: 'wx' });
        return; // Successfully acquired lock
      } catch (error) {
        if ((error as any).code === 'EEXIST') {
          // Lock file exists, wait and retry
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        throw error;
      }
    }
    
    throw new Error('Failed to acquire file lock within timeout');
  }

  /**
   * Release file lock
   */
  private async releaseLock(): Promise<void> {
    try {
      await fs.unlink(this.lockPath);
    } catch (error) {
      // Lock file might not exist, which is fine
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Wait for lock to be released
   */
  private async waitForLock(timeoutMs: number = 5000): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeoutMs) {
      try {
        await fs.access(this.lockPath);
        // Lock exists, wait
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        if ((error as any).code === 'ENOENT') {
          // Lock doesn't exist, we're good
          return;
        }
        throw error;
      }
    }
    
    throw new Error('Timeout waiting for lock to be released');
  }

  /**
   * Clean up old backup files (keep last N backups)
   */
  async cleanupBackups(keepCount: number = 10): Promise<void> {
    try {
      const dir = dirname(this.togglesPath);
      const files = await fs.readdir(dir);
      
      const backupFiles = files
        .filter(f => f.includes('.backup.'))
        .map(f => ({
          name: f,
          path: join(dir, f),
          mtime: 0, // Will be populated below
        }));
      
      // Get file stats for sorting by modification time
      for (const file of backupFiles) {
        const stat = await fs.stat(file.path);
        file.mtime = stat.mtime.getTime();
      }
      
      // Sort by modification time (newest first) and remove old ones
      backupFiles.sort((a, b) => b.mtime - a.mtime);
      
      for (const file of backupFiles.slice(keepCount)) {
        await fs.unlink(file.path);
      }
    } catch (error) {
      // Non-critical operation, just log the error
      console.warn('Failed to cleanup backups:', error);
    }
  }
}