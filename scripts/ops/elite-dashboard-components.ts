/**
 * Elite Dashboard Visual Components
 * 
 * Visual components for war-room dashboard display with professional status tiles,
 * real-time indicators, and comprehensive monitoring visualization.
 * 
 * Features:
 * - Red/Green/Yellow status indicators with pulsing animations
 * - Professional tile-based layout optimized for operations teams
 * - Real-time timestamps and data freshness indicators
 * - Responsive design for large screens and wall displays
 * - Cross-platform compatibility (Windows/Unix)
 * - Integration links to external monitoring tools
 */

import { type EliteDashboardData, type SystemStatus } from './elite-dashboard-aggregator.js';

/**
 * Status color mapping for consistent visual indicators
 */
export const StatusColors = {
  healthy: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', dot: 'bg-green-500', ring: 'ring-green-200' },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', dot: 'bg-yellow-500', ring: 'ring-yellow-200' },
  critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', dot: 'bg-red-500', ring: 'ring-red-200' },
  unknown: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800', dot: 'bg-gray-500', ring: 'ring-gray-200' }
} as const;

/**
 * Generate CSS classes for status indicators
 */
export function getStatusClasses(status: SystemStatus['status'], size: 'small' | 'medium' | 'large' = 'medium') {
  const colors = StatusColors[status] || StatusColors.unknown;
  
  const sizes = {
    small: { container: 'p-3 text-xs', dot: 'w-2 h-2', icon: 'w-4 h-4' },
    medium: { container: 'p-4 text-sm', dot: 'w-3 h-3', icon: 'w-5 h-5' },
    large: { container: 'p-6 text-base', dot: 'w-4 h-4', icon: 'w-6 h-6' }
  };

  const sizeClasses = sizes[size];

  return {
    container: `${colors.bg} ${colors.border} ${colors.text} border rounded-lg shadow-sm ${sizeClasses.container}`,
    dot: `${colors.dot} ${sizeClasses.dot} rounded-full`,
    pulsingDot: `${colors.dot} ${sizeClasses.dot} rounded-full animate-pulse`,
    text: colors.text,
    icon: sizeClasses.icon,
    ring: `${colors.ring} ring-2 ring-opacity-50`,
    glow: status === 'critical' ? 'shadow-red-500/25 shadow-lg' : 
          status === 'warning' ? 'shadow-yellow-500/25 shadow-md' : 
          'shadow-green-500/10 shadow-sm'
  };
}

/**
 * Format timestamps for display with relative time
 */
export function formatTimestamp(timestamp: string): { 
  formatted: string; 
  relative: string; 
  age: string;
  isStale: boolean;
} {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  let relative: string;
  let age: string;
  let isStale = false;

  if (diffMinutes < 1) {
    relative = 'just now';
    age = '< 1m';
  } else if (diffMinutes < 60) {
    relative = `${diffMinutes} minutes ago`;
    age = `${diffMinutes}m`;
    isStale = diffMinutes > 10; // Data older than 10 minutes is stale
  } else if (diffHours < 24) {
    relative = `${diffHours} hours ago`;
    age = `${diffHours}h`;
    isStale = diffHours > 2; // Data older than 2 hours is stale
  } else {
    relative = `${diffDays} days ago`;
    age = `${diffDays}d`;
    isStale = true; // Data older than 1 day is stale
  }

  return {
    formatted: date.toLocaleString(),
    relative,
    age,
    isStale
  };
}

/**
 * Generate system status tile HTML
 */
export function generateSystemStatusTile(name: string, status: SystemStatus, size: 'small' | 'medium' | 'large' = 'medium'): string {
  const classes = getStatusClasses(status.status, size);
  const timestamp = formatTimestamp(status.timestamp);
  const responseTime = status.response_time_ms ? `${status.response_time_ms}ms` : 'N/A';

  const statusIcon = {
    healthy: '✅',
    warning: '⚠️',
    critical: '🚨',
    unknown: '❓'
  }[status.status];

  const linksHtml = status.links && status.links.length > 0 ? `
    <div class="mt-2 flex flex-wrap gap-1">
      ${status.links.map(link => `
        <a href="${link}" target="_blank" 
           class="inline-flex items-center px-2 py-1 text-xs rounded ${classes.text} hover:underline">
          🔗 Monitor
        </a>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="${classes.container} ${classes.glow} transition-all duration-300">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center space-x-2">
          <div class="${status.status === 'critical' ? classes.pulsingDot : classes.dot}"></div>
          <h3 class="font-semibold uppercase tracking-wide">${name}</h3>
          <span class="text-lg">${statusIcon}</span>
        </div>
        <div class="text-right">
          <div class="text-xs opacity-75">${responseTime}</div>
          <div class="text-xs ${timestamp.isStale ? 'text-red-500' : 'opacity-75'}">${timestamp.age}</div>
        </div>
      </div>
      
      <div class="mb-2">
        <p class="text-sm font-medium">${status.message}</p>
      </div>
      
      ${status.details ? `
        <div class="text-xs opacity-75 space-y-1">
          ${Object.entries(status.details).slice(0, 3).map(([key, value]) => 
            typeof value === 'object' ? '' :
            `<div>${key.replace(/_/g, ' ')}: <span class="font-mono">${value}</span></div>`
          ).join('')}
        </div>
      ` : ''}
      
      ${linksHtml}
      
      <div class="mt-2 pt-2 border-t border-gray-200 text-xs opacity-50">
        Last updated: ${timestamp.relative}
      </div>
    </div>
  `;
}

/**
 * Generate monitoring system tile with specialized metrics
 */
export function generateMonitoringTile(name: string, status: SystemStatus & Record<string, any>, size: 'small' | 'medium' | 'large' = 'medium'): string {
  const classes = getStatusClasses(status.status, size);
  const timestamp = formatTimestamp(status.timestamp);

  // System-specific metrics display
  let metricsHtml = '';
  
  switch (name.toLowerCase()) {
    case 'exposure':
      metricsHtml = `
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>Risk: <span class="font-mono font-bold ${status.risk_level === 'CRITICAL' ? 'text-red-600' : ''}">${status.risk_level || 'N/A'}</span></div>
          <div>Breaches: <span class="font-mono">${status.breaches_count ?? 'N/A'}</span></div>
          <div class="col-span-2">Exposure: <span class="font-mono">$${(status.total_exposure || 0).toLocaleString()}</span></div>
        </div>
      `;
      break;
      
    case 'freeze':
      metricsHtml = `
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>Status: <span class="font-mono font-bold ${status.is_frozen ? 'text-yellow-600' : 'text-green-600'}">${status.is_frozen ? 'FROZEN' : 'ACTIVE'}</span></div>
          <div>Type: <span class="font-mono">${status.freeze_type || 'N/A'}</span></div>
          <div class="col-span-2">Upcoming: <span class="font-mono">${status.upcoming_freezes ?? 0} freeze windows</span></div>
        </div>
      `;
      break;
      
    case 'drift':
      metricsHtml = `
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>Risk: <span class="font-mono font-bold ${status.risk_level === 'high' ? 'text-red-600' : ''}">${status.risk_level || 'N/A'}</span></div>
          <div>Alerts: <span class="font-mono">${status.features_with_alerts ?? 'N/A'}</span></div>
          <div class="col-span-2">Drift Score: <span class="font-mono">${((status.drift_score || 0) * 100).toFixed(1)}%</span></div>
        </div>
      `;
      break;
      
    case 'slo':
      metricsHtml = `
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>Health: <span class="font-mono font-bold ${status.overall_health === 'critical' ? 'text-red-600' : ''}">${status.overall_health || 'N/A'}</span></div>
          <div>Budget: <span class="font-mono">${status.error_budget_consumed ?? 'N/A'}%</span></div>
          <div class="col-span-2">Compliance: <span class="font-mono">${(status.compliance_percentage || 0).toFixed(1)}%</span></div>
        </div>
      `;
      break;
      
    case 'toggles':
      metricsHtml = `
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>Active: <span class="font-mono">${status.toggles_applied ?? 'N/A'}</span></div>
          <div>Pending: <span class="font-mono">${status.proposals_pending ?? 'N/A'}</span></div>
          <div class="col-span-2">Integrity: <span class="font-mono font-bold ${status.system_integrity ? 'text-green-600' : 'text-red-600'}">${status.system_integrity ? 'VALID' : 'INVALID'}</span></div>
        </div>
      `;
      break;
  }

  const statusIcon = {
    healthy: '✅',
    warning: '⚠️',
    critical: '🚨',
    unknown: '❓'
  }[status.status];

  return `
    <div class="${classes.container} ${classes.glow} transition-all duration-300">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center space-x-2">
          <div class="${status.status === 'critical' ? classes.pulsingDot : classes.dot}"></div>
          <h3 class="font-semibold uppercase tracking-wide text-sm">${name}</h3>
          <span class="text-xl">${statusIcon}</span>
        </div>
        <div class="text-xs ${timestamp.isStale ? 'text-red-500' : 'opacity-75'}">${timestamp.age}</div>
      </div>
      
      <div class="mb-3">
        <p class="text-sm font-medium">${status.message}</p>
      </div>
      
      ${metricsHtml}
      
      <div class="mt-3 pt-2 border-t border-gray-200 text-xs opacity-50">
        Last updated: ${timestamp.relative}
      </div>
    </div>
  `;
}

/**
 * Generate overall health summary tile
 */
export function generateHealthSummaryTile(overallStatus: EliteDashboardData['overall_status']): string {
  const healthColor = overallStatus.health_score >= 90 ? 'text-green-600' : 
                      overallStatus.health_score >= 70 ? 'text-yellow-600' : 'text-red-600';
  
  const statusColor = overallStatus.status === 'healthy' ? 'bg-green-500' :
                      overallStatus.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500';

  return `
    <div class="bg-white border border-gray-200 rounded-lg shadow-lg p-6 col-span-full">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-gray-800">SYSTEM HEALTH OVERVIEW</h2>
        <div class="flex items-center space-x-2">
          <div class="${statusColor} w-4 h-4 rounded-full ${overallStatus.status === 'critical' ? 'animate-pulse' : ''}"></div>
          <span class="text-lg font-bold ${healthColor}">${overallStatus.health_score}/100</span>
        </div>
      </div>
      
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-green-600">${overallStatus.systems_healthy}</div>
          <div class="text-sm text-gray-600">Healthy Systems</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-yellow-600">${overallStatus.warning_issues}</div>
          <div class="text-sm text-gray-600">Warnings</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-red-600">${overallStatus.critical_issues}</div>
          <div class="text-sm text-gray-600">Critical Issues</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold text-gray-600">${overallStatus.systems_total}</div>
          <div class="text-sm text-gray-600">Total Systems</div>
        </div>
      </div>
      
      <div class="bg-gray-50 rounded-lg p-3">
        <div class="flex items-center justify-between text-sm">
          <span class="font-medium">Deployment Phase:</span>
          <span class="font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded">${overallStatus.deployment_phase}</span>
        </div>
        <div class="flex items-center justify-between text-sm mt-2">
          <span class="font-medium">Last Deployment:</span>
          <span class="font-mono">${formatTimestamp(overallStatus.last_deployment).relative}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate alerts panel
 */
export function generateAlertsPanel(alerts: EliteDashboardData['alerts']): string {
  if (alerts.length === 0) {
    return `
      <div class="bg-green-50 border border-green-200 rounded-lg p-4">
        <div class="flex items-center">
          <div class="bg-green-500 w-3 h-3 rounded-full mr-2"></div>
          <h3 class="font-semibold text-green-800">No Active Alerts</h3>
        </div>
        <p class="text-sm text-green-700 mt-1">All systems operating normally</p>
      </div>
    `;
  }

  const criticalAlerts = alerts.filter(a => a.level === 'CRITICAL');
  const warningAlerts = alerts.filter(a => a.level === 'WARNING');

  return `
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-gray-800">ACTIVE ALERTS</h3>
        <div class="flex space-x-2">
          <span class="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">${criticalAlerts.length} Critical</span>
          <span class="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">${warningAlerts.length} Warning</span>
        </div>
      </div>
      
      <div class="max-h-64 overflow-y-auto space-y-2">
        ${alerts.slice(0, 10).map(alert => {
          const alertColors = {
            CRITICAL: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', dot: 'bg-red-500' },
            ERROR: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', dot: 'bg-red-500' },
            WARNING: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', dot: 'bg-yellow-500' },
            INFO: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', dot: 'bg-blue-500' }
          }[alert.level] || { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800', dot: 'bg-gray-500' };

          return `
            <div class="${alertColors.bg} ${alertColors.border} border rounded-lg p-3 ${alert.level === 'CRITICAL' ? 'shadow-red-500/25 shadow-lg' : ''}">
              <div class="flex items-start justify-between">
                <div class="flex items-start space-x-2">
                  <div class="${alertColors.dot} w-2 h-2 rounded-full mt-2 ${alert.level === 'CRITICAL' ? 'animate-pulse' : ''}"></div>
                  <div class="flex-1">
                    <div class="flex items-center space-x-2 mb-1">
                      <span class="text-xs font-mono ${alertColors.text} opacity-75">${alert.system}</span>
                      <span class="text-xs ${alertColors.text} font-bold">${alert.level}</span>
                    </div>
                    <p class="text-sm ${alertColors.text} font-medium">${alert.message}</p>
                    ${alert.escalation_contact ? `
                      <div class="text-xs ${alertColors.text} opacity-75 mt-1">
                        Contact: ${alert.escalation_contact}
                      </div>
                    ` : ''}
                  </div>
                </div>
                <div class="text-xs ${alertColors.text} opacity-75 text-right">
                  ${formatTimestamp(alert.timestamp).age}
                  ${alert.action_required ? `<div class="text-red-600 font-bold mt-1">ACTION REQUIRED</div>` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
        
        ${alerts.length > 10 ? `
          <div class="text-center text-sm text-gray-500 py-2">
            ... and ${alerts.length - 10} more alerts
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Generate metrics overview panel
 */
export function generateMetricsPanel(metrics: EliteDashboardData['metrics']): string {
  return `
    <div class="bg-white border border-gray-200 rounded-lg p-4">
      <h3 class="font-semibold text-gray-800 mb-3">SYSTEM METRICS</h3>
      
      <div class="space-y-3">
        <div>
          <h4 class="text-sm font-medium text-gray-700 mb-2">Ingestion (5min window)</h4>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>Raw: <span class="font-mono">${metrics.ingestion.raw_new_5min}</span></div>
            <div>Processed: <span class="font-mono">${metrics.ingestion.processed_5min}</span></div>
            <div>Promoted: <span class="font-mono">${metrics.ingestion.promoted_5min}</span></div>
            <div>Settled: <span class="font-mono">${metrics.ingestion.settled_5min}</span></div>
          </div>
        </div>
        
        <div class="border-t pt-3">
          <h4 class="text-sm font-medium text-gray-700 mb-2">Performance</h4>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>Proc Time: <span class="font-mono">${metrics.performance.avg_processing_time_ms}ms</span></div>
            <div>Promo Time: <span class="font-mono">${metrics.performance.avg_promotion_time_ms}ms</span></div>
            <div>Backlog: <span class="font-mono">${metrics.performance.backlog_size}</span></div>
            <div>Memory: <span class="font-mono">${metrics.performance.total_memory_mb}MB</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate external links panel
 */
export function generateExternalLinksPanel(links: EliteDashboardData['dashboard_meta']['external_links']): string {
  const linkData = [
    { name: 'Temporal UI', url: links.temporal_ui, icon: '⚡', description: 'Workflow monitoring' },
    { name: 'Grafana', url: links.grafana, icon: '📊', description: 'System metrics' },
    { name: 'Supabase', url: links.supabase_dashboard, icon: '🗄️', description: 'Database console' },
    { name: 'GitHub Actions', url: links.github_actions, icon: '🚀', description: 'CI/CD pipeline' },
    { name: 'Linear Board', url: links.linear_board, icon: '📋', description: 'Project management' }
  ];

  return `
    <div class="bg-white border border-gray-200 rounded-lg p-4">
      <h3 class="font-semibold text-gray-800 mb-3">EXTERNAL MONITORING</h3>
      
      <div class="space-y-2">
        ${linkData.map(link => `
          <a href="${link.url}" target="_blank" 
             class="flex items-center justify-between p-2 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors duration-200 group">
            <div class="flex items-center space-x-3">
              <span class="text-lg">${link.icon}</span>
              <div>
                <div class="text-sm font-medium text-gray-800 group-hover:text-blue-800">${link.name}</div>
                <div class="text-xs text-gray-500">${link.description}</div>
              </div>
            </div>
            <span class="text-gray-400 group-hover:text-blue-600">↗</span>
          </a>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Generate complete dashboard HTML
 */
export function generateEliteDashboardHTML(data: EliteDashboardData): string {
  const timestamp = formatTimestamp(data.timestamp);
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Unit Talk - Elite Operations Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
      body { font-family: 'Inter', sans-serif; }
      .font-mono { font-family: 'JetBrains Mono', monospace; }
      .war-room-bg { background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); }
      .pulse-critical { animation: pulse-critical 2s infinite; }
      @keyframes pulse-critical {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      .blink { animation: blink 1s infinite; }
      @keyframes blink {
        50% { opacity: 0; }
      }
    </style>
</head>
<body class="war-room-bg min-h-screen">
    <!-- Header -->
    <div class="bg-white shadow-md border-b-4 border-blue-600">
        <div class="max-w-7xl mx-auto px-4 py-4">
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-4">
                    <h1 class="text-2xl font-bold text-gray-800">Unit Talk Elite Operations Dashboard</h1>
                    <div class="flex items-center space-x-2">
                        <div class="${data.overall_status.status === 'healthy' ? 'bg-green-500' : 
                                     data.overall_status.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'} 
                                   w-3 h-3 rounded-full ${data.overall_status.status === 'critical' ? 'blink' : ''}"></div>
                        <span class="text-sm font-mono ${data.overall_status.status === 'healthy' ? 'text-green-600' : 
                                                         data.overall_status.status === 'warning' ? 'text-yellow-600' : 'text-red-600'}">
                            ${data.overall_status.status.toUpperCase()}
                        </span>
                    </div>
                </div>
                
                <div class="flex items-center space-x-4 text-sm">
                    <div class="flex items-center space-x-2">
                        <span class="text-gray-600">Health Score:</span>
                        <span class="font-bold text-lg ${data.overall_status.health_score >= 90 ? 'text-green-600' : 
                                                         data.overall_status.health_score >= 70 ? 'text-yellow-600' : 'text-red-600'}">
                            ${data.overall_status.health_score}/100
                        </span>
                    </div>
                    <div class="text-gray-500">
                        <span class="font-mono">${timestamp.formatted}</span>
                    </div>
                    <div class="flex items-center space-x-1">
                        <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span class="text-xs text-gray-600">Auto-refresh: ${data.dashboard_meta.refresh_rate_seconds}s</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Main Dashboard -->
    <div class="max-w-7xl mx-auto px-4 py-6">
        <!-- Overall Health Summary -->
        <div class="mb-6">
            ${generateHealthSummaryTile(data.overall_status)}
        </div>

        <!-- Core Services -->
        <div class="mb-6">
            <h2 class="text-lg font-bold text-gray-800 mb-4">CORE SERVICES</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                ${Object.entries(data.services).map(([name, status]) => 
                    generateSystemStatusTile(name, status, 'medium')
                ).join('')}
            </div>
        </div>

        <!-- Monitoring Systems -->
        <div class="mb-6">
            <h2 class="text-lg font-bold text-gray-800 mb-4">ELITE MONITORING SYSTEMS</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                ${Object.entries(data.monitoring_systems).map(([name, status]) => 
                    generateMonitoringTile(name, status, 'medium')
                ).join('')}
            </div>
        </div>

        <!-- Bottom Panel: Alerts, Metrics, Links -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Alerts -->
            <div class="lg:col-span-2">
                ${generateAlertsPanel(data.alerts)}
            </div>
            
            <!-- Side Panel -->
            <div class="space-y-4">
                ${generateMetricsPanel(data.metrics)}
                ${generateExternalLinksPanel(data.dashboard_meta.external_links)}
            </div>
        </div>

        <!-- System Info Footer -->
        <div class="mt-8 pt-4 border-t border-gray-200">
            <div class="flex items-center justify-between text-sm text-gray-500">
                <div class="space-x-4">
                    <span>Platform: ${data.system_info.platform} ${data.system_info.architecture}</span>
                    <span>Node: ${data.system_info.node_version}</span>
                    <span>Uptime: ${Math.floor(data.system_info.uptime_seconds / 3600)}h ${Math.floor((data.system_info.uptime_seconds % 3600) / 60)}m</span>
                </div>
                <div class="space-x-4">
                    <span>Environment: ${data.environment.NODE_ENV}</span>
                    <span>Phase: ${data.overall_status.deployment_phase}</span>
                    <span class="font-mono">Data Hash: ${(data as any)._meta?.data_integrity_hash || 'N/A'}</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Auto-refresh Script -->
    <script>
        // Auto-refresh functionality
        let refreshEnabled = ${data.dashboard_meta.auto_refresh_enabled};
        const refreshInterval = ${data.dashboard_meta.refresh_rate_seconds * 1000};
        let refreshTimer;

        function startAutoRefresh() {
            if (!refreshEnabled) return;
            
            refreshTimer = setInterval(() => {
                // Add visual indicator before refresh
                document.body.style.opacity = '0.9';
                
                setTimeout(() => {
                    window.location.reload();
                }, 200);
            }, refreshInterval);
        }

        function toggleAutoRefresh() {
            refreshEnabled = !refreshEnabled;
            if (refreshEnabled) {
                startAutoRefresh();
                console.log('Auto-refresh enabled');
            } else {
                clearInterval(refreshTimer);
                console.log('Auto-refresh disabled');
            }
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'r' && e.ctrlKey) {
                e.preventDefault();
                window.location.reload();
            }
            if (e.key === 't' && e.ctrlKey) {
                e.preventDefault();
                toggleAutoRefresh();
            }
        });

        // Start auto-refresh
        startAutoRefresh();

        // Page load performance tracking
        window.addEventListener('load', () => {
            const loadTime = performance.now();
            console.log(\`Dashboard loaded in \${loadTime.toFixed(0)}ms\`);
            
            // Add load time indicator
            const footer = document.querySelector('.mt-8.pt-4');
            if (footer) {
                const loadIndicator = document.createElement('div');
                loadIndicator.className = 'text-xs text-gray-400 text-center mt-2';
                loadIndicator.textContent = \`Page loaded in \${loadTime.toFixed(0)}ms | Press Ctrl+R to refresh, Ctrl+T to toggle auto-refresh\`;
                footer.appendChild(loadIndicator);
            }
        });

        // Critical alert sound notification (optional)
        const criticalAlerts = ${data.alerts.filter(a => a.level === 'CRITICAL').length};
        if (criticalAlerts > 0 && ${data.dashboard_meta.notifications_enabled}) {
            // Simple audio notification for critical alerts
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+Hvt2EcBSF+z/LNeSsFJIHO8tiJNwgZZLvt559NEAxPqOPwtmMcBTiP2PLLeSsFJIHO8tiJNwgZZLvt559NEHR');
                audio.volume = 0.1;
                audio.play().catch(() => {}); // Ignore play errors
            } catch (e) {
                console.log('Audio notification not available');
            }
        }
    </script>
</body>
</html>
  `;
}

/**
 * Utility functions for dashboard components
 */
export const DashboardComponents = {
  StatusColors,
  getStatusClasses,
  formatTimestamp,
  generateSystemStatusTile,
  generateMonitoringTile,
  generateHealthSummaryTile,
  generateAlertsPanel,
  generateMetricsPanel,
  generateExternalLinksPanel,
  generateEliteDashboardHTML
};

export default DashboardComponents;