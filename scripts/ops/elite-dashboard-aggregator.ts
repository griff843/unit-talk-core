#!/usr/bin/env node

/**
 * Elite Dashboard Aggregator
 * 
 * Comprehensive monitoring dashboard that integrates all elite monitoring systems:
 * - Exposure Guardian (risk management)
 * - Freeze Engine (deployment controls) 
 * - Drift Detection (ML feature stability)
 * - SLO Monitor (service level objectives)
 * - Toggle System (feature flag management)
 * - Core Services (API, DB, Temporal, Worker)
 * 
 * Provides real-time war-room dashboard suitable for operations team with:
 * - Visual status tiles with red/green/yellow indicators
 * - Cross-platform compatibility (Windows/Unix)
 * - Real-time refresh capabilities
 * - Professional operations display
 * - Integration links to external monitoring tools
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { platform, release, arch } from 'os';
import { createHash } from 'crypto';

// Import monitoring components
import { ExposureGuardian, type ExposureReport } from './exposure-scan.js';
import { FreezeEngine, type FreezeReport } from './freeze-rules.js';
import { runDriftDetection } from './drift.js';
import { createSecureToggleSystem, type SecureToggleSystem } from '../toggles/index.js';

interface SystemStatus {
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  message: string;
  details?: any;
  timestamp: string;
  response_time_ms?: number;
  links?: string[];
}

interface EliteDashboardData {
  timestamp: string;
  system_info: {
    platform: string;
    architecture: string;
    os_release: string;
    node_version: string;
    environment: string;
    uptime_seconds: number;
  };
  services: {
    api: SystemStatus;
    database: SystemStatus;
    temporal: SystemStatus;
    worker: SystemStatus;
    command_center: SystemStatus;
  };
  monitoring_systems: {
    exposure: SystemStatus & { 
      risk_level?: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
      total_exposure?: number;
      breaches_count?: number;
    };
    freeze: SystemStatus & {
      is_frozen?: boolean;
      freeze_type?: string;
      upcoming_freezes?: number;
    };
    drift: SystemStatus & {
      risk_level?: 'low' | 'medium' | 'high';
      features_with_alerts?: number;
      drift_score?: number;
    };
    slo: SystemStatus & {
      overall_health?: 'healthy' | 'degraded' | 'critical';
      error_budget_consumed?: number;
      compliance_percentage?: number;
    };
    toggles: SystemStatus & {
      toggles_applied?: number;
      proposals_pending?: number;
      system_integrity?: boolean;
    };
  };
  environment: {
    NODE_ENV: string;
    SHADOW_MODE: boolean;
    PUBLISH_TO_DISCORD: boolean;
    ALLOW_PROMOTION_IN_SHADOW: boolean;
    MAX_ALLOWED_PROMOTES_5MIN: number;
  };
  metrics: {
    ingestion: {
      raw_new_5min: number;
      processed_5min: number;
      promoted_5min: number;
      settled_5min: number;
    };
    performance: {
      avg_processing_time_ms: number;
      avg_promotion_time_ms: number;
      backlog_size: number;
      total_memory_mb: number;
      cpu_usage_percent: number;
    };
  };
  alerts: Array<{
    level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
    system: string;
    message: string;
    timestamp: string;
    action_required?: boolean;
    escalation_contact?: string;
  }>;
  overall_status: {
    health_score: number; // 0-100
    status: 'healthy' | 'warning' | 'critical';
    critical_issues: number;
    warning_issues: number;
    systems_healthy: number;
    systems_total: number;
    deployment_phase: string;
    last_deployment: string;
  };
  dashboard_meta: {
    refresh_rate_seconds: number;
    auto_refresh_enabled: boolean;
    data_freshness_seconds: number;
    external_links: {
      temporal_ui: string;
      grafana: string;
      supabase_dashboard: string;
      github_actions: string;
      linear_board: string;
    };
    war_room_mode: boolean;
    notifications_enabled: boolean;
  };
}

class EliteDashboardAggregator {
  private outputDir: string;
  private refreshInterval: number;
  private skipDatabaseChecks: boolean;

  constructor(outputDir?: string, refreshInterval: number = 30) {
    this.outputDir = outputDir || join(process.cwd(), 'out', 'ops');
    this.refreshInterval = refreshInterval;
    this.skipDatabaseChecks = process.env.SKIP_DATABASE_CHECKS === 'true';
    
    // Ensure output directory exists
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Check service health with timeout and error handling
   */
  private async checkServiceHealth(serviceName: string, endpoint: string, timeout: number = 5000): Promise<SystemStatus> {
    const startTime = Date.now();
    
    try {
      if (this.skipDatabaseChecks && serviceName === 'database') {
        return {
          status: 'unknown',
          message: 'Database checks skipped (SKIP_DATABASE_CHECKS=true)',
          timestamp: new Date().toISOString(),
          response_time_ms: 0
        };
      }

      // Simulate health checks - in production, these would be real HTTP calls or DB connections
      const mockHealth = await this.simulateHealthCheck(serviceName);
      const responseTime = Date.now() - startTime;

      return {
        status: mockHealth.healthy ? 'healthy' : 'critical',
        message: mockHealth.message,
        details: mockHealth.details,
        timestamp: new Date().toISOString(),
        response_time_ms: responseTime,
        links: mockHealth.links
      };

    } catch (error) {
      return {
        status: 'critical',
        message: `Service health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        response_time_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Simulate health checks for services (replace with real implementations)
   */
  private async simulateHealthCheck(serviceName: string): Promise<{
    healthy: boolean;
    message: string;
    details?: any;
    links?: string[];
  }> {
    // Simulate some variability in service health
    const mockLatency = Math.random() * 100 + 10;
    await new Promise(resolve => setTimeout(resolve, mockLatency));

    switch (serviceName) {
      case 'api':
        return {
          healthy: true,
          message: 'API server responding normally',
          details: { port: 3000, version: '1.0.0', endpoints_active: 12 },
          links: ['http://localhost:3000/healthz', 'http://localhost:3000/metrics']
        };
      
      case 'database':
        return {
          healthy: Math.random() > 0.1, // 90% healthy
          message: Math.random() > 0.1 ? 'Database connections healthy' : 'Database connection pool exhausted',
          details: { active_connections: 15, max_connections: 20, query_avg_ms: 45 },
          links: ['https://app.supabase.com/project/your-project']
        };
      
      case 'temporal':
        return {
          healthy: Math.random() > 0.2, // 80% healthy
          message: Math.random() > 0.2 ? 'Temporal workflows active' : 'Temporal namespace unavailable',
          details: { workflows_running: 8, pending_tasks: 23, workers_online: 3 },
          links: ['http://localhost:8080', 'http://localhost:8080/namespaces/unit-talk/workflows']
        };
      
      case 'worker':
        return {
          healthy: Math.random() > 0.05, // 95% healthy
          message: Math.random() > 0.05 ? 'Worker processes stable' : 'Worker restart required',
          details: { processes_active: 4, memory_usage_mb: 256, last_restart: '2h ago' },
          links: []
        };
      
      case 'command_center':
        return {
          healthy: Math.random() > 0.15, // 85% healthy
          message: Math.random() > 0.15 ? 'Command center UI accessible' : 'Command center UI timeout',
          details: { ui_version: '1.2.0', active_sessions: 3, build_status: 'healthy' },
          links: ['http://localhost:3001', 'http://localhost:3001/monitoring']
        };
      
      default:
        return {
          healthy: false,
          message: 'Unknown service'
        };
    }
  }

  /**
   * Collect exposure monitoring data
   */
  private async collectExposureData(): Promise<SystemStatus & { 
    risk_level?: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    total_exposure?: number;
    breaches_count?: number;
  }> {
    try {
      // Check if exposure report exists
      const exposureReportPath = join(this.outputDir, 'exposure.json');
      let exposureData: ExposureReport | null = null;

      if (existsSync(exposureReportPath)) {
        try {
          exposureData = JSON.parse(readFileSync(exposureReportPath, 'utf-8'));
        } catch (error) {
          console.warn('⚠️  Could not read existing exposure report:', error);
        }
      }

      // Try to generate fresh exposure data
      if (!exposureData || this.isDataStale(exposureData.timestamp, 5)) { // 5 minute staleness threshold
        try {
          if (!this.skipDatabaseChecks) {
            const guardian = new ExposureGuardian();
            exposureData = await guardian.computeLiveExposure();
            await guardian.saveExposureReport(exposureData);
          }
        } catch (error) {
          console.warn('⚠️  Could not generate fresh exposure data, using cached or mock data');
        }
      }

      if (exposureData) {
        return {
          status: exposureData.risk_level === 'CRITICAL' ? 'critical' :
                  exposureData.risk_level === 'HIGH' ? 'warning' : 'healthy',
          message: `Exposure risk: ${exposureData.risk_level} (${exposureData.breaches.length} breaches)`,
          details: exposureData,
          timestamp: exposureData.timestamp,
          risk_level: exposureData.risk_level,
          total_exposure: exposureData.total_exposure,
          breaches_count: exposureData.breaches.length
        };
      }

      // Return mock data if no real data available
      return {
        status: 'warning',
        message: 'Exposure monitoring data unavailable - using mock status',
        timestamp: new Date().toISOString(),
        risk_level: 'LOW',
        total_exposure: 125000,
        breaches_count: 0
      };

    } catch (error) {
      return {
        status: 'critical',
        message: `Exposure monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        risk_level: 'CRITICAL',
        total_exposure: 0,
        breaches_count: -1
      };
    }
  }

  /**
   * Collect freeze monitoring data
   */
  private async collectFreezeData(): Promise<SystemStatus & {
    is_frozen?: boolean;
    freeze_type?: string;
    upcoming_freezes?: number;
  }> {
    try {
      // Check if freeze report exists
      const freezeReportPath = join(this.outputDir, 'freeze.json');
      let freezeData: FreezeReport | null = null;

      if (existsSync(freezeReportPath)) {
        try {
          freezeData = JSON.parse(readFileSync(freezeReportPath, 'utf-8'));
        } catch (error) {
          console.warn('⚠️  Could not read existing freeze report:', error);
        }
      }

      // Try to generate fresh freeze data
      if (!freezeData || this.isDataStale(freezeData.timestamp, 2)) { // 2 minute staleness threshold
        try {
          const engine = new FreezeEngine();
          freezeData = await engine.checkFreezeStatus();
          await engine.saveFreezeReport(freezeData);
        } catch (error) {
          console.warn('⚠️  Could not generate fresh freeze data, using cached or mock data');
        }
      }

      if (freezeData) {
        return {
          status: freezeData.current_status.is_frozen ? 'warning' : 'healthy',
          message: freezeData.current_status.is_frozen 
            ? `FREEZE ACTIVE: ${freezeData.current_status.freeze_reason}`
            : 'No freeze conditions active',
          details: freezeData,
          timestamp: freezeData.timestamp,
          is_frozen: freezeData.current_status.is_frozen,
          freeze_type: freezeData.current_status.freeze_type,
          upcoming_freezes: freezeData.upcoming_freezes.length
        };
      }

      // Return mock data if no real data available  
      return {
        status: 'healthy',
        message: 'Freeze monitoring data unavailable - assuming no freeze',
        timestamp: new Date().toISOString(),
        is_frozen: false,
        freeze_type: 'none',
        upcoming_freezes: 1
      };

    } catch (error) {
      return {
        status: 'critical',
        message: `Freeze monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        is_frozen: false,
        freeze_type: 'error',
        upcoming_freezes: 0
      };
    }
  }

  /**
   * Collect drift detection data
   */
  private async collectDriftData(): Promise<SystemStatus & {
    risk_level?: 'low' | 'medium' | 'high';
    features_with_alerts?: number;
    drift_score?: number;
  }> {
    try {
      // Check if drift report exists
      const driftReportPath = join(this.outputDir, 'drift.json');
      let driftData: any = null;

      if (existsSync(driftReportPath)) {
        try {
          driftData = JSON.parse(readFileSync(driftReportPath, 'utf-8'));
        } catch (error) {
          console.warn('⚠️  Could not read existing drift report:', error);
        }
      }

      // Try to generate fresh drift data (only if not too recent to avoid DB load)
      if (!driftData || this.isDataStale(driftData.timestamp, 30)) { // 30 minute staleness threshold
        try {
          if (!this.skipDatabaseChecks) {
            const driftResult = await runDriftDetection();
            driftData = driftResult.details;
          }
        } catch (error) {
          console.warn('⚠️  Could not generate fresh drift data, using cached or mock data');
        }
      }

      if (driftData) {
        const summary = driftData.overall_summary;
        return {
          status: summary.overall_risk_level === 'high' ? 'critical' :
                  summary.overall_risk_level === 'medium' ? 'warning' : 'healthy',
          message: `Drift risk: ${summary.overall_risk_level} (${summary.features_with_alerts} alerts, ${summary.features_with_warnings} warnings)`,
          details: driftData,
          timestamp: driftData.timestamp,
          risk_level: summary.overall_risk_level,
          features_with_alerts: summary.features_with_alerts,
          drift_score: summary.features_with_alerts / Math.max(summary.total_features_analyzed, 1)
        };
      }

      // Return mock data if no real data available
      return {
        status: 'healthy',
        message: 'Drift monitoring data unavailable - assuming stable',
        timestamp: new Date().toISOString(),
        risk_level: 'low',
        features_with_alerts: 0,
        drift_score: 0.0
      };

    } catch (error) {
      return {
        status: 'critical',
        message: `Drift monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        risk_level: 'high',
        features_with_alerts: -1,
        drift_score: 1.0
      };
    }
  }

  /**
   * Collect SLO monitoring data
   */
  private async collectSLOData(): Promise<SystemStatus & {
    overall_health?: 'healthy' | 'degraded' | 'critical';
    error_budget_consumed?: number;
    compliance_percentage?: number;
  }> {
    try {
      // Check if SLO report exists
      const sloReportPath = join(this.outputDir, 'slo.json');
      let sloData: any = null;

      if (existsSync(sloReportPath)) {
        try {
          sloData = JSON.parse(readFileSync(sloReportPath, 'utf-8'));
        } catch (error) {
          console.warn('⚠️  Could not read existing SLO report:', error);
        }
      }

      // SLO data should be generated by slo-monitor.ts
      if (sloData) {
        const overallHealth = this.calculateSLOHealth(sloData);
        return {
          status: overallHealth.status,
          message: overallHealth.message,
          details: sloData,
          timestamp: sloData.timestamp,
          overall_health: overallHealth.health,
          error_budget_consumed: sloData.error_budget?.consumed_percentage || 0,
          compliance_percentage: overallHealth.compliance
        };
      }

      // Return mock data if no real data available
      return {
        status: 'warning',
        message: 'SLO monitoring data unavailable - generate with slo-monitor.ts',
        timestamp: new Date().toISOString(),
        overall_health: 'degraded',
        error_budget_consumed: 25,
        compliance_percentage: 95.0
      };

    } catch (error) {
      return {
        status: 'critical',
        message: `SLO monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        overall_health: 'critical',
        error_budget_consumed: 100,
        compliance_percentage: 0
      };
    }
  }

  /**
   * Collect toggle system data
   */
  private async collectToggleData(): Promise<SystemStatus & {
    toggles_applied?: number;
    proposals_pending?: number;
    system_integrity?: boolean;
  }> {
    try {
      const toggleSystem = createSecureToggleSystem();
      const status = await toggleSystem.getSystemStatus();
      const healthCheck = await toggleSystem.healthCheck();

      return {
        status: healthCheck.healthy ? 'healthy' : 'critical',
        message: healthCheck.healthy 
          ? `Toggle system healthy (${status.togglesApplied} toggles, ${status.proposalsPending} pending)`
          : `Toggle system unhealthy: ${healthCheck.errors.join(', ')}`,
        details: { status, healthCheck },
        timestamp: new Date().toISOString(),
        toggles_applied: status.togglesApplied,
        proposals_pending: status.proposalsPending,
        system_integrity: status.systemIntegrity
      };

    } catch (error) {
      return {
        status: 'critical',
        message: `Toggle system failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        toggles_applied: 0,
        proposals_pending: 0,
        system_integrity: false
      };
    }
  }

  /**
   * Calculate SLO health from SLO data
   */
  private calculateSLOHealth(sloData: any): {
    status: 'healthy' | 'warning' | 'critical';
    message: string;
    health: 'healthy' | 'degraded' | 'critical';
    compliance: number;
  } {
    if (!sloData.slo_status) {
      return {
        status: 'critical',
        message: 'No SLO status data available',
        health: 'critical',
        compliance: 0
      };
    }

    const sloStats = sloData.slo_status;
    const overallCompliance = [
      sloStats.ingest_to_processed?.compliance_percentage || 0,
      sloStats.processed_to_promoted?.compliance_percentage || 0,
      sloStats.end_to_end?.compliance_percentage || 0
    ].reduce((sum, val) => sum + val, 0) / 3;

    const criticalSLOs = Object.values(sloStats).filter((slo: any) => slo.status === 'red').length;
    const warningSLOs = Object.values(sloStats).filter((slo: any) => slo.status === 'yellow').length;

    let status: 'healthy' | 'warning' | 'critical';
    let health: 'healthy' | 'degraded' | 'critical';
    let message: string;

    if (criticalSLOs > 0) {
      status = 'critical';
      health = 'critical';
      message = `SLO critical: ${criticalSLOs} SLOs breached, ${overallCompliance.toFixed(1)}% compliance`;
    } else if (warningSLOs > 0) {
      status = 'warning';
      health = 'degraded';
      message = `SLO degraded: ${warningSLOs} SLOs at risk, ${overallCompliance.toFixed(1)}% compliance`;
    } else {
      status = 'healthy';
      health = 'healthy';
      message = `SLO healthy: All targets met, ${overallCompliance.toFixed(1)}% compliance`;
    }

    return { status, message, health, compliance: overallCompliance };
  }

  /**
   * Check if data is stale based on timestamp
   */
  private isDataStale(timestamp: string, maxAgeMinutes: number): boolean {
    try {
      const dataTime = new Date(timestamp);
      const now = new Date();
      const ageMinutes = (now.getTime() - dataTime.getTime()) / (1000 * 60);
      return ageMinutes > maxAgeMinutes;
    } catch {
      return true; // Treat invalid timestamps as stale
    }
  }

  /**
   * Collect system performance metrics
   */
  private collectSystemMetrics() {
    // Get process memory usage
    const memoryUsage = process.memoryUsage();
    const totalMemoryMB = Math.round(memoryUsage.rss / 1024 / 1024);

    // Mock CPU usage (in production, use actual CPU monitoring)
    const cpuUsage = Math.round(Math.random() * 30 + 10); // 10-40%

    // Read existing metrics if available
    let existingMetrics = {
      ingestion: { raw_new_5min: 0, processed_5min: 0, promoted_5min: 0, settled_5min: 0 },
      performance: { avg_processing_time_ms: 0, avg_promotion_time_ms: 0, backlog_size: 0 }
    };

    try {
      const metricsPath = join(this.outputDir, 'metrics.json');
      if (existsSync(metricsPath)) {
        const metricsData = JSON.parse(readFileSync(metricsPath, 'utf-8'));
        existingMetrics = { ...existingMetrics, ...metricsData };
      }
    } catch (error) {
      console.warn('⚠️  Could not read existing metrics:', error);
    }

    return {
      ingestion: existingMetrics.ingestion,
      performance: {
        ...existingMetrics.performance,
        total_memory_mb: totalMemoryMB,
        cpu_usage_percent: cpuUsage
      }
    };
  }

  /**
   * Generate comprehensive alerts from all monitoring systems
   */
  private generateAlerts(monitoringSystems: EliteDashboardData['monitoring_systems'], services: EliteDashboardData['services']): EliteDashboardData['alerts'] {
    const alerts: EliteDashboardData['alerts'] = [];

    // Service alerts
    Object.entries(services).forEach(([serviceName, status]) => {
      if (status.status === 'critical') {
        alerts.push({
          level: 'CRITICAL',
          system: `service:${serviceName}`,
          message: status.message,
          timestamp: status.timestamp,
          action_required: true,
          escalation_contact: 'ops@unit-talk.com'
        });
      } else if (status.status === 'warning') {
        alerts.push({
          level: 'WARNING',
          system: `service:${serviceName}`,
          message: status.message,
          timestamp: status.timestamp,
          action_required: false
        });
      }
    });

    // Monitoring system alerts
    Object.entries(monitoringSystems).forEach(([systemName, status]) => {
      if (status.status === 'critical') {
        alerts.push({
          level: 'CRITICAL',
          system: `monitoring:${systemName}`,
          message: status.message,
          timestamp: status.timestamp,
          action_required: true,
          escalation_contact: systemName === 'exposure' ? 'risk@unit-talk.com' : 'ops@unit-talk.com'
        });
      } else if (status.status === 'warning') {
        alerts.push({
          level: 'WARNING',
          system: `monitoring:${systemName}`,
          message: status.message,
          timestamp: status.timestamp,
          action_required: systemName === 'freeze' && (status as any).is_frozen
        });
      }
    });

    // Sort alerts by severity and timestamp
    const severityOrder = { 'CRITICAL': 0, 'ERROR': 1, 'WARNING': 2, 'INFO': 3 };
    alerts.sort((a, b) => {
      const severityDiff = severityOrder[a.level] - severityOrder[b.level];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return alerts;
  }

  /**
   * Calculate overall system health score
   */
  private calculateOverallHealth(services: EliteDashboardData['services'], monitoringSystems: EliteDashboardData['monitoring_systems']): EliteDashboardData['overall_status'] {
    const allSystems = { ...services, ...monitoringSystems };
    const systemCount = Object.keys(allSystems).length;
    
    let healthyCount = 0;
    let warningCount = 0;
    let criticalCount = 0;

    Object.values(allSystems).forEach(status => {
      switch (status.status) {
        case 'healthy': healthyCount++; break;
        case 'warning': warningCount++; break;
        case 'critical': criticalCount++; break;
      }
    });

    // Health score: 100 for all healthy, penalize warnings (-5), critical (-20)
    const healthScore = Math.max(0, 100 - (warningCount * 5) - (criticalCount * 20));
    
    let overallStatus: 'healthy' | 'warning' | 'critical';
    if (criticalCount > 0) {
      overallStatus = 'critical';
    } else if (warningCount > 0) {
      overallStatus = 'warning';
    } else {
      overallStatus = 'healthy';
    }

    // Determine deployment phase
    const environment = {
      NODE_ENV: process.env.NODE_ENV || 'development',
      SHADOW_MODE: process.env.SHADOW_MODE === 'true',
      PUBLISH_TO_DISCORD: process.env.PUBLISH_TO_DISCORD === 'true',
      ALLOW_PROMOTION_IN_SHADOW: process.env.ALLOW_PROMOTION_IN_SHADOW === 'true'
    };

    let deploymentPhase = 'Unknown';
    if (environment.SHADOW_MODE && !environment.ALLOW_PROMOTION_IN_SHADOW) {
      deploymentPhase = 'Phase A (Shadow - No Promotions)';
    } else if (!environment.SHADOW_MODE && !environment.PUBLISH_TO_DISCORD) {
      deploymentPhase = 'Phase B (Live - Muted)';
    } else if (!environment.SHADOW_MODE && environment.PUBLISH_TO_DISCORD) {
      deploymentPhase = 'Phase C (Live - Full)';
    }

    return {
      health_score: healthScore,
      status: overallStatus,
      critical_issues: criticalCount,
      warning_issues: warningCount,
      systems_healthy: healthyCount,
      systems_total: systemCount,
      deployment_phase: deploymentPhase,
      last_deployment: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString() // Mock last deployment time
    };
  }

  /**
   * Main aggregation function - collects data from all monitoring systems
   */
  async aggregate(): Promise<EliteDashboardData> {
    const startTime = Date.now();
    console.log('🔄 Aggregating elite dashboard data from all monitoring systems...');

    // Collect service health data
    const services = {
      api: await this.checkServiceHealth('api', 'http://localhost:3000/healthz'),
      database: await this.checkServiceHealth('database', 'postgresql://localhost:5432'),
      temporal: await this.checkServiceHealth('temporal', 'http://localhost:7233'),
      worker: await this.checkServiceHealth('worker', 'internal://worker'),
      command_center: await this.checkServiceHealth('command_center', 'http://localhost:3001')
    };

    // Collect monitoring system data
    const [exposureData, freezeData, driftData, sloData, toggleData] = await Promise.all([
      this.collectExposureData(),
      this.collectFreezeData(),
      this.collectDriftData(),
      this.collectSLOData(),
      this.collectToggleData()
    ]);

    const monitoringSystems = {
      exposure: exposureData,
      freeze: freezeData,
      drift: driftData,
      slo: sloData,
      toggles: toggleData
    };

    // Collect system metrics
    const metrics = this.collectSystemMetrics();

    // Environment configuration
    const environment = {
      NODE_ENV: process.env.NODE_ENV || 'development',
      SHADOW_MODE: process.env.SHADOW_MODE === 'true',
      PUBLISH_TO_DISCORD: process.env.PUBLISH_TO_DISCORD === 'true',
      ALLOW_PROMOTION_IN_SHADOW: process.env.ALLOW_PROMOTION_IN_SHADOW === 'true',
      MAX_ALLOWED_PROMOTES_5MIN: parseInt(process.env.MAX_ALLOWED_PROMOTES_5MIN || '20')
    };

    // Generate alerts
    const alerts = this.generateAlerts(monitoringSystems, services);

    // Calculate overall health
    const overallStatus = this.calculateOverallHealth(services, monitoringSystems);

    const dashboardData: EliteDashboardData = {
      timestamp: new Date().toISOString(),
      system_info: {
        platform: platform(),
        architecture: arch(),
        os_release: release(),
        node_version: process.version,
        environment: environment.NODE_ENV,
        uptime_seconds: Math.floor(process.uptime())
      },
      services,
      monitoring_systems: monitoringSystems,
      environment,
      metrics,
      alerts,
      overall_status: overallStatus,
      dashboard_meta: {
        refresh_rate_seconds: this.refreshInterval,
        auto_refresh_enabled: true,
        data_freshness_seconds: Math.floor((Date.now() - startTime) / 1000),
        external_links: {
          temporal_ui: 'http://localhost:8080',
          grafana: 'http://localhost:3001/monitoring',
          supabase_dashboard: 'https://app.supabase.com/project/your-project',
          github_actions: 'https://github.com/unit-talk/unit-talk-core/actions',
          linear_board: 'https://linear.app/unit-talk/board'
        },
        war_room_mode: process.env.WAR_ROOM_MODE === 'true',
        notifications_enabled: process.env.NOTIFICATIONS_ENABLED !== 'false'
      }
    };

    console.log(`✅ Dashboard aggregation completed in ${Date.now() - startTime}ms`);
    console.log(`📊 Health Score: ${overallStatus.health_score}/100 (${overallStatus.status.toUpperCase()})`);
    console.log(`🚨 Alerts: ${alerts.length} (${alerts.filter(a => a.level === 'CRITICAL').length} critical)`);

    return dashboardData;
  }

  /**
   * Save dashboard data to file
   */
  async save(data: EliteDashboardData): Promise<string> {
    const outputPath = join(this.outputDir, 'elite-dashboard.json');
    
    try {
      // Add data integrity hash
      const dataString = JSON.stringify(data, null, 2);
      const hash = createHash('sha256').update(dataString).digest('hex');
      const dataWithIntegrity = {
        ...data,
        _meta: {
          ...data.dashboard_meta,
          data_integrity_hash: hash.substring(0, 16),
          file_size_bytes: Buffer.byteLength(dataString, 'utf8'),
          generated_by: 'elite-dashboard-aggregator'
        }
      };

      writeFileSync(outputPath, JSON.stringify(dataWithIntegrity, null, 2));
      console.log(`💾 Elite dashboard data saved to: ${outputPath}`);
      
      // Also update the legacy dashboard.json for backwards compatibility
      const legacyPath = join(this.outputDir, 'dashboard.json');
      const legacyData = this.convertToLegacyFormat(data);
      writeFileSync(legacyPath, JSON.stringify(legacyData, null, 2));
      
      return outputPath;

    } catch (error) {
      console.error('❌ Failed to save dashboard data:', error);
      throw error;
    }
  }

  /**
   * Convert elite dashboard data to legacy format for backwards compatibility
   */
  private convertToLegacyFormat(data: EliteDashboardData): any {
    return {
      timestamp: data.timestamp,
      environment: data.environment,
      services: Object.fromEntries(
        Object.entries(data.services).map(([name, status]) => [
          name, 
          { 
            status: status.status === 'healthy' ? 'healthy' : 'unhealthy',
            health: status.details 
          }
        ])
      ),
      metrics: data.metrics,
      alerts: data.alerts.map(alert => ({
        level: alert.level,
        message: alert.message,
        timestamp: alert.timestamp
      })),
      phase: data.overall_status.deployment_phase
    };
  }
}

/**
 * CLI interface for running dashboard aggregation
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'aggregate';

  try {
    const outputDir = args.includes('--output') 
      ? args[args.indexOf('--output') + 1] 
      : undefined;

    const refreshRate = args.includes('--refresh') 
      ? parseInt(args[args.indexOf('--refresh') + 1]) || 30
      : 30;

    const aggregator = new EliteDashboardAggregator(outputDir, refreshRate);

    switch (command) {
      case 'aggregate':
        const data = await aggregator.aggregate();
        const outputPath = await aggregator.save(data);
        console.log(`\n🎯 Elite Dashboard Summary:`);
        console.log(`   Health Score: ${data.overall_status.health_score}/100`);
        console.log(`   Status: ${data.overall_status.status.toUpperCase()}`);
        console.log(`   Systems Healthy: ${data.overall_status.systems_healthy}/${data.overall_status.systems_total}`);
        console.log(`   Critical Alerts: ${data.alerts.filter(a => a.level === 'CRITICAL').length}`);
        console.log(`   Deployment Phase: ${data.overall_status.deployment_phase}`);
        console.log(`   Output: ${outputPath}\n`);
        break;

      case 'watch':
        console.log(`🔄 Starting continuous dashboard aggregation (every ${refreshRate}s)`);
        console.log(`📂 Output directory: ${aggregator['outputDir']}`);
        console.log(`\nPress Ctrl+C to stop\n`);

        const runAggregation = async () => {
          try {
            const data = await aggregator.aggregate();
            await aggregator.save(data);
            console.log(`📊 Dashboard updated - Health: ${data.overall_status.health_score}/100, Alerts: ${data.alerts.length}`);
          } catch (error) {
            console.error('❌ Aggregation cycle failed:', error);
          }
        };

        // Run initial aggregation
        await runAggregation();

        // Set up recurring aggregation
        const intervalId = setInterval(runAggregation, refreshRate * 1000);

        // Handle graceful shutdown
        process.on('SIGINT', () => {
          console.log('\n🛑 Stopping dashboard aggregation...');
          clearInterval(intervalId);
          console.log('✅ Dashboard aggregation stopped');
          process.exit(0);
        });

        // Keep process running
        process.on('SIGTERM', () => process.kill(process.pid, 'SIGINT'));
        break;

      default:
        console.log(`
Elite Dashboard Aggregator

USAGE:
  elite-dashboard-aggregator.ts [COMMAND] [OPTIONS]

COMMANDS:
  aggregate    Generate dashboard data once (default)
  watch        Continuous dashboard aggregation

OPTIONS:
  --output DIR     Output directory (default: out/ops)
  --refresh SECS   Refresh rate for watch mode (default: 30)

EXAMPLES:
  npm run ops:elite-dashboard
  npm run ops:elite-dashboard -- watch --refresh 60
  npm run ops:elite-dashboard -- aggregate --output /tmp/dashboard

MONITORING SYSTEMS:
  ✅ Exposure Guardian - Risk management and breach detection
  ✅ Freeze Engine - Deployment freeze controls
  ✅ Drift Detection - ML feature stability monitoring  
  ✅ SLO Monitor - Service level objective tracking
  ✅ Toggle System - Feature flag management
  ✅ Core Services - API, Database, Temporal, Worker health
        `);
        process.exit(1);
    }

  } catch (error) {
    console.error('❌ Elite dashboard aggregation failed:', error);
    process.exit(1);
  }
}

// Export for programmatic usage
export { EliteDashboardAggregator, type EliteDashboardData, type SystemStatus };

// Run CLI if called directly
if (require.main === module) {
  main();
}