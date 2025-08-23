#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface EventSchedule {
  id: string;
  league: string;
  event_name: string;
  start_time: string; // ISO 8601
  end_time?: string;
  teams: string[];
  importance: 'regular' | 'playoff' | 'championship';
}

interface FreezeRule {
  id: string;
  name: string;
  type: 'pre_event' | 'maintenance' | 'manual';
  enabled: boolean;
  conditions: {
    leagues?: string[];
    importance_levels?: string[];
    minutes_before_event?: number;
    days_of_week?: number[]; // 0 = Sunday, 6 = Saturday
    time_range?: {
      start: string; // HH:MM format
      end: string;   // HH:MM format
    };
  };
  description: string;
  contact: string;
  override_code?: string; // Emergency override
}

interface MaintenanceWindow {
  id: string;
  name: string;
  start_time: string; // ISO 8601
  end_time: string;   // ISO 8601
  reason: string;
  contact: string;
  recurring?: {
    pattern: 'daily' | 'weekly' | 'monthly';
    interval: number;
  };
}

interface FreezeStatus {
  is_frozen: boolean;
  freeze_reason: string;
  freeze_type: 'pre_event' | 'maintenance' | 'manual';
  freeze_start: string;
  freeze_end?: string;
  affected_events: string[];
  rule_applied: string;
  contact: string;
  override_available: boolean;
  override_code?: string;
}

interface FreezeReport {
  timestamp: string;
  check_duration_ms: number;
  current_status: FreezeStatus;
  upcoming_freezes: Array<{
    starts_in_minutes: number;
    duration_minutes: number;
    reason: string;
    type: string;
  }>;
  active_rules: string[];
  events_processed: number;
  maintenance_windows_active: number;
}

class FreezeEngine {
  private rules: FreezeRule[];
  private maintenanceWindows: MaintenanceWindow[];
  private eventSchedule: EventSchedule[];

  constructor() {
    this.loadRules();
    this.loadMaintenanceWindows();
    this.loadEventSchedule();
  }

  private loadRules(): void {
    const defaultRules: FreezeRule[] = [
      {
        id: 'nfl_pre_game',
        name: 'NFL Pre-Game Freeze',
        type: 'pre_event',
        enabled: true,
        conditions: {
          leagues: ['NFL'],
          minutes_before_event: 60,
          importance_levels: ['regular', 'playoff', 'championship']
        },
        description: 'Block promotions 60 minutes before NFL games',
        contact: 'nfl-ops@unit-talk.com'
      },
      {
        id: 'championship_freeze',
        name: 'Championship Event Freeze',
        type: 'pre_event',
        enabled: true,
        conditions: {
          leagues: ['NFL', 'NBA', 'MLB', 'NHL'],
          minutes_before_event: 120,
          importance_levels: ['championship']
        },
        description: 'Extended freeze for championship games',
        contact: 'championship-ops@unit-talk.com',
        override_code: 'CHAMPIONSHIP_OVERRIDE'
      },
      {
        id: 'playoff_freeze',
        name: 'Playoff Enhanced Freeze',
        type: 'pre_event',
        enabled: true,
        conditions: {
          leagues: ['NBA', 'MLB', 'NHL'],
          minutes_before_event: 90,
          importance_levels: ['playoff']
        },
        description: 'Enhanced freeze for playoff games',
        contact: 'playoff-ops@unit-talk.com'
      },
      {
        id: 'daily_maintenance',
        name: 'Daily Maintenance Window',
        type: 'maintenance',
        enabled: true,
        conditions: {
          time_range: {
            start: '03:00',
            end: '03:30'
          }
        },
        description: 'Daily system maintenance window',
        contact: 'devops@unit-talk.com'
      },
      {
        id: 'weekend_extended',
        name: 'Weekend Extended Operations',
        type: 'pre_event',
        enabled: true,
        conditions: {
          leagues: ['NFL'],
          days_of_week: [0, 1], // Sunday, Monday
          minutes_before_event: 45
        },
        description: 'Extended weekend operations for NFL',
        contact: 'weekend-ops@unit-talk.com'
      }
    ];

    this.rules = defaultRules;
  }

  private loadMaintenanceWindows(): void {
    const defaultWindows: MaintenanceWindow[] = [
      {
        id: 'daily_db_maintenance',
        name: 'Database Maintenance',
        start_time: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), // 3 hours from now
        end_time: new Date(Date.now() + 3.5 * 60 * 60 * 1000).toISOString(), // 3.5 hours from now
        reason: 'Daily database optimization and backup',
        contact: 'dba@unit-talk.com',
        recurring: {
          pattern: 'daily',
          interval: 1
        }
      },
      {
        id: 'weekly_system_update',
        name: 'Weekly System Updates',
        start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        end_time: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(), // Tomorrow + 1 hour
        reason: 'Weekly security patches and system updates',
        contact: 'security@unit-talk.com',
        recurring: {
          pattern: 'weekly',
          interval: 1
        }
      }
    ];

    this.maintenanceWindows = defaultWindows;
  }

  private loadEventSchedule(): void {
    // Mock event schedule - would normally come from feed adapter
    const mockEvents: EventSchedule[] = [
      {
        id: 'nfl_001',
        league: 'NFL',
        event_name: 'Patriots @ Bills',
        start_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
        teams: ['Patriots', 'Bills'],
        importance: 'regular'
      },
      {
        id: 'nba_001',
        league: 'NBA',
        event_name: 'Lakers @ Warriors',
        start_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
        teams: ['Lakers', 'Warriors'],
        importance: 'playoff'
      },
      {
        id: 'nfl_championship',
        league: 'NFL',
        event_name: 'Super Bowl',
        start_time: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours from now
        teams: ['TBD', 'TBD'],
        importance: 'championship'
      }
    ];

    this.eventSchedule = mockEvents;
  }

  public async checkFreezeStatus(): Promise<FreezeReport> {
    const startTime = Date.now();
    const now = new Date();

    console.log('❄️  Checking freeze rules and maintenance windows...');

    // Check maintenance windows
    const activeMaintenanceWindows = this.getActiveMaintenanceWindows(now);
    
    // Check pre-event freezes
    const preEventFreezes = this.checkPreEventFreezes(now);
    
    // Check manual freezes (would come from dashboard/operator)
    const manualFreezes = this.checkManualFreezes(now);

    // Determine current freeze status
    const currentStatus = this.determineFreezeStatus(
      activeMaintenanceWindows,
      preEventFreezes,
      manualFreezes,
      now
    );

    // Calculate upcoming freezes
    const upcomingFreezes = this.calculateUpcomingFreezes(now);

    const report: FreezeReport = {
      timestamp: now.toISOString(),
      check_duration_ms: Date.now() - startTime,
      current_status: currentStatus,
      upcoming_freezes: upcomingFreezes,
      active_rules: this.getActiveRuleIds(),
      events_processed: this.eventSchedule.length,
      maintenance_windows_active: activeMaintenanceWindows.length
    };

    console.log(`✅ Freeze check completed in ${report.check_duration_ms}ms`);
    console.log(`❄️  Freeze active: ${currentStatus.is_frozen ? 'YES' : 'NO'}`);
    
    if (currentStatus.is_frozen) {
      console.log(`📋 Reason: ${currentStatus.freeze_reason}`);
      console.log(`👤 Contact: ${currentStatus.contact}`);
      console.log(`🕐 Started: ${currentStatus.freeze_start}`);
      if (currentStatus.freeze_end) {
        console.log(`🕑 Ends: ${currentStatus.freeze_end}`);
      }
    }

    console.log(`📅 Upcoming freezes: ${upcomingFreezes.length}`);

    return report;
  }

  private getActiveMaintenanceWindows(now: Date): MaintenanceWindow[] {
    return this.maintenanceWindows.filter(window => {
      const start = new Date(window.start_time);
      const end = new Date(window.end_time);
      return now >= start && now <= end;
    });
  }

  private checkPreEventFreezes(now: Date): Array<{rule: FreezeRule, event: EventSchedule}> {
    const activePreEventFreezes: Array<{rule: FreezeRule, event: EventSchedule}> = [];

    for (const rule of this.rules.filter(r => r.type === 'pre_event' && r.enabled)) {
      for (const event of this.eventSchedule) {
        if (this.doesRuleApplyToEvent(rule, event, now)) {
          const eventStart = new Date(event.start_time);
          const minutesUntilEvent = (eventStart.getTime() - now.getTime()) / (1000 * 60);
          
          if (minutesUntilEvent <= (rule.conditions.minutes_before_event || 60) && minutesUntilEvent >= 0) {
            activePreEventFreezes.push({ rule, event });
          }
        }
      }
    }

    return activePreEventFreezes;
  }

  private doesRuleApplyToEvent(rule: FreezeRule, event: EventSchedule, now: Date): boolean {
    // Check league match
    if (rule.conditions.leagues && !rule.conditions.leagues.includes(event.league)) {
      return false;
    }

    // Check importance level
    if (rule.conditions.importance_levels && !rule.conditions.importance_levels.includes(event.importance)) {
      return false;
    }

    // Check day of week
    if (rule.conditions.days_of_week) {
      const eventDay = new Date(event.start_time).getDay();
      if (!rule.conditions.days_of_week.includes(eventDay)) {
        return false;
      }
    }

    // Check time range
    if (rule.conditions.time_range) {
      const eventTime = new Date(event.start_time);
      const eventHour = eventTime.getHours();
      const eventMinute = eventTime.getMinutes();
      const eventTimeStr = `${eventHour.toString().padStart(2, '0')}:${eventMinute.toString().padStart(2, '0')}`;
      
      const start = rule.conditions.time_range.start;
      const end = rule.conditions.time_range.end;
      
      if (eventTimeStr < start || eventTimeStr > end) {
        return false;
      }
    }

    return true;
  }

  private checkManualFreezes(now: Date): Array<{reason: string, contact: string}> {
    // Check for manual freeze file or dashboard state
    const manualFreezePath = join(process.cwd(), 'out', 'ops', 'manual-freeze.json');
    
    if (existsSync(manualFreezePath)) {
      try {
        const manualFreeze = JSON.parse(readFileSync(manualFreezePath, 'utf-8'));
        if (manualFreeze.active && new Date(manualFreeze.expires_at) > now) {
          return [{
            reason: manualFreeze.reason || 'Manual freeze activated',
            contact: manualFreeze.contact || 'ops@unit-talk.com'
          }];
        }
      } catch (error) {
        console.warn('⚠️  Failed to read manual freeze file:', error);
      }
    }

    return [];
  }

  private determineFreezeStatus(
    maintenanceWindows: MaintenanceWindow[],
    preEventFreezes: Array<{rule: FreezeRule, event: EventSchedule}>,
    manualFreezes: Array<{reason: string, contact: string}>,
    now: Date
  ): FreezeStatus {
    // Priority: Manual > Maintenance > Pre-event
    
    if (manualFreezes.length > 0) {
      return {
        is_frozen: true,
        freeze_reason: manualFreezes[0].reason,
        freeze_type: 'manual',
        freeze_start: now.toISOString(),
        affected_events: [],
        rule_applied: 'manual_freeze',
        contact: manualFreezes[0].contact,
        override_available: false
      };
    }

    if (maintenanceWindows.length > 0) {
      const window = maintenanceWindows[0];
      return {
        is_frozen: true,
        freeze_reason: window.reason,
        freeze_type: 'maintenance',
        freeze_start: window.start_time,
        freeze_end: window.end_time,
        affected_events: [],
        rule_applied: window.id,
        contact: window.contact,
        override_available: false
      };
    }

    if (preEventFreezes.length > 0) {
      const freeze = preEventFreezes[0];
      return {
        is_frozen: true,
        freeze_reason: `${freeze.rule.description} - ${freeze.event.event_name}`,
        freeze_type: 'pre_event',
        freeze_start: now.toISOString(),
        freeze_end: freeze.event.start_time,
        affected_events: [freeze.event.id],
        rule_applied: freeze.rule.id,
        contact: freeze.rule.contact,
        override_available: !!freeze.rule.override_code,
        override_code: freeze.rule.override_code
      };
    }

    return {
      is_frozen: false,
      freeze_reason: 'No active freeze conditions',
      freeze_type: 'pre_event',
      freeze_start: now.toISOString(),
      affected_events: [],
      rule_applied: 'none',
      contact: 'ops@unit-talk.com',
      override_available: false
    };
  }

  private calculateUpcomingFreezes(now: Date): Array<{
    starts_in_minutes: number;
    duration_minutes: number;
    reason: string;
    type: string;
  }> {
    const upcoming = [];

    // Check upcoming maintenance windows
    for (const window of this.maintenanceWindows) {
      const start = new Date(window.start_time);
      const end = new Date(window.end_time);
      const minutesUntilStart = (start.getTime() - now.getTime()) / (1000 * 60);
      
      if (minutesUntilStart > 0 && minutesUntilStart <= 24 * 60) { // Next 24 hours
        upcoming.push({
          starts_in_minutes: Math.round(minutesUntilStart),
          duration_minutes: Math.round((end.getTime() - start.getTime()) / (1000 * 60)),
          reason: window.reason,
          type: 'maintenance'
        });
      }
    }

    // Check upcoming pre-event freezes
    for (const rule of this.rules.filter(r => r.type === 'pre_event' && r.enabled)) {
      for (const event of this.eventSchedule) {
        if (this.doesRuleApplyToEvent(rule, event, now)) {
          const eventStart = new Date(event.start_time);
          const freezeStart = new Date(eventStart.getTime() - (rule.conditions.minutes_before_event || 60) * 60 * 1000);
          const minutesUntilFreeze = (freezeStart.getTime() - now.getTime()) / (1000 * 60);
          
          if (minutesUntilFreeze > 0 && minutesUntilFreeze <= 24 * 60) { // Next 24 hours
            upcoming.push({
              starts_in_minutes: Math.round(minutesUntilFreeze),
              duration_minutes: rule.conditions.minutes_before_event || 60,
              reason: `${rule.description} - ${event.event_name}`,
              type: 'pre_event'
            });
          }
        }
      }
    }

    return upcoming.sort((a, b) => a.starts_in_minutes - b.starts_in_minutes);
  }

  private getActiveRuleIds(): string[] {
    return this.rules.filter(r => r.enabled).map(r => r.id);
  }

  public async saveFreezeReport(report: FreezeReport): Promise<void> {
    const outputPath = join(process.cwd(), 'out', 'ops', 'freeze.json');
    
    try {
      writeFileSync(outputPath, JSON.stringify(report, null, 2));
      console.log(`📁 Freeze report saved to ${outputPath}`);
    } catch (error) {
      console.error('❌ Failed to save freeze report:', error);
      throw error;
    }
  }

  public async setManualFreeze(reason: string, durationMinutes: number, contact: string): Promise<void> {
    const manualFreezePath = join(process.cwd(), 'out', 'ops', 'manual-freeze.json');
    
    const manualFreeze = {
      active: true,
      reason,
      contact,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + durationMinutes * 60 * 1000).toISOString(),
      duration_minutes: durationMinutes
    };

    try {
      writeFileSync(manualFreezePath, JSON.stringify(manualFreeze, null, 2));
      console.log(`❄️  Manual freeze activated for ${durationMinutes} minutes`);
      console.log(`📋 Reason: ${reason}`);
      console.log(`👤 Contact: ${contact}`);
    } catch (error) {
      console.error('❌ Failed to set manual freeze:', error);
      throw error;
    }
  }

  public async clearManualFreeze(): Promise<void> {
    const manualFreezePath = join(process.cwd(), 'out', 'ops', 'manual-freeze.json');
    
    if (existsSync(manualFreezePath)) {
      const manualFreeze = {
        active: false,
        cleared_at: new Date().toISOString()
      };
      
      try {
        writeFileSync(manualFreezePath, JSON.stringify(manualFreeze, null, 2));
        console.log('✅ Manual freeze cleared');
      } catch (error) {
        console.error('❌ Failed to clear manual freeze:', error);
        throw error;
      }
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';

  try {
    const engine = new FreezeEngine();

    switch (command) {
      case 'check':
        const report = await engine.checkFreezeStatus();
        await engine.saveFreezeReport(report);
        
        if (report.current_status.is_frozen) {
          console.log(`❄️  FREEZE ACTIVE: ${report.current_status.freeze_reason}`);
          process.exit(1); // Exit with error code when frozen
        }
        break;

      case 'freeze':
        const reason = args[1] || 'Manual freeze';
        const duration = parseInt(args[2] || '60');
        const contact = args[3] || 'ops@unit-talk.com';
        await engine.setManualFreeze(reason, duration, contact);
        break;

      case 'unfreeze':
        await engine.clearManualFreeze();
        break;

      case 'upcoming':
        const upcomingReport = await engine.checkFreezeStatus();
        console.log('📅 Upcoming freeze windows:');
        for (const freeze of upcomingReport.upcoming_freezes) {
          console.log(`  ${freeze.starts_in_minutes}min: ${freeze.reason} (${freeze.duration_minutes}min)`);
        }
        break;

      default:
        console.log('Usage: freeze-rules.ts [check|freeze|unfreeze|upcoming]');
        console.log('  check                                  - Check freeze status (default)');
        console.log('  freeze <reason> <duration> <contact>  - Set manual freeze');
        console.log('  unfreeze                               - Clear manual freeze');
        console.log('  upcoming                               - Show upcoming freezes');
        process.exit(1);
    }

  } catch (error) {
    console.error('❌ Freeze check failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { FreezeEngine, FreezeReport, FreezeStatus };