/**
 * Dashboard SLO Integration Component
 * 
 * Provides React-compatible components and utilities for displaying
 * SLO status and trends in the Unit Talk command center dashboard.
 */

import { DashboardSLOData } from './slo-reporter.js';

export interface SLOStatusIndicatorProps {
  status: 'green' | 'yellow' | 'red';
  label: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  compliancePercentage: number;
  size?: 'small' | 'medium' | 'large';
}

export interface SLOTrendChartData {
  timestamp: string;
  p95_latency: number;
  compliance_score: number;
}

export interface SLODashboardSectionProps {
  sloData: DashboardSLOData;
  refreshInterval?: number;
  showTrends?: boolean;
  compact?: boolean;
}

/**
 * Generate CSS classes for SLO status indicators
 */
export function getSLOStatusClasses(status: 'green' | 'yellow' | 'red', size: string = 'medium'): {
  container: string;
  indicator: string;
  value: string;
  label: string;
} {
  const baseSize = {
    small: 'text-xs p-1',
    medium: 'text-sm p-2',
    large: 'text-base p-3'
  };

  const statusColors = {
    green: {
      container: 'bg-green-50 border-green-200',
      indicator: 'bg-green-500',
      value: 'text-green-800',
      label: 'text-green-600'
    },
    yellow: {
      container: 'bg-yellow-50 border-yellow-200', 
      indicator: 'bg-yellow-500',
      value: 'text-yellow-800',
      label: 'text-yellow-600'
    },
    red: {
      container: 'bg-red-50 border-red-200',
      indicator: 'bg-red-500', 
      value: 'text-red-800',
      label: 'text-red-600'
    }
  };

  return {
    container: `border rounded-lg ${baseSize[size as keyof typeof baseSize]} ${statusColors[status].container}`,
    indicator: `w-3 h-3 rounded-full ${statusColors[status].indicator}`,
    value: `font-semibold ${statusColors[status].value}`,
    label: `text-xs ${statusColors[status].label}`
  };
}

/**
 * Format latency values for display
 */
export function formatLatency(latencySeconds: number): string {
  if (latencySeconds < 1) {
    return `${Math.round(latencySeconds * 1000)}ms`;
  } else if (latencySeconds < 60) {
    return `${latencySeconds.toFixed(1)}s`;
  } else {
    const minutes = Math.floor(latencySeconds / 60);
    const seconds = latencySeconds % 60;
    return `${minutes}m ${seconds.toFixed(0)}s`;
  }
}

/**
 * Format compliance percentage for display
 */
export function formatCompliance(percentage: number): string {
  if (percentage >= 99.5) {
    return '99.9%'; // Round up for display
  } else if (percentage >= 95) {
    return `${percentage.toFixed(1)}%`;
  } else {
    return `${percentage.toFixed(2)}%`;
  }
}

/**
 * Generate HTML structure for SLO status indicator
 */
export function generateSLOStatusHTML(props: SLOStatusIndicatorProps): string {
  const classes = getSLOStatusClasses(props.status, props.size);
  const formattedValue = formatLatency(props.currentValue);
  const formattedTarget = formatLatency(props.targetValue);
  const formattedCompliance = formatCompliance(props.compliancePercentage);

  return `
    <div class="${classes.container}">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center space-x-2">
          <div class="${classes.indicator}"></div>
          <span class="${classes.label}">${props.label}</span>
        </div>
        <span class="${classes.value}">${formattedCompliance}</span>
      </div>
      <div class="text-xs text-gray-600">
        <div>Current: <span class="${classes.value}">${formattedValue}</span></div>
        <div>Target: <span class="text-gray-500">${formattedTarget}</span></div>
      </div>
    </div>
  `;
}

/**
 * Generate complete SLO dashboard section HTML
 */
export function generateSLODashboardHTML(sloData: DashboardSLOData, options?: {
  showTrends?: boolean;
  compact?: boolean;
  title?: string;
}): string {
  const { showTrends = true, compact = false, title = 'Service Level Objectives' } = options || {};

  const ingestToProcessed = generateSLOStatusHTML({
    status: sloData.slo_status.ingest_to_processed.status,
    label: 'Ingest → Processed',
    currentValue: sloData.slo_status.ingest_to_processed.current_p95,
    targetValue: sloData.slo_status.ingest_to_processed.target_p95,
    unit: 'seconds',
    compliancePercentage: sloData.slo_status.ingest_to_processed.compliance_percentage,
    size: compact ? 'small' : 'medium'
  });

  const processedToPromoted = generateSLOStatusHTML({
    status: sloData.slo_status.processed_to_promoted.status,
    label: 'Processed → Promoted',
    currentValue: sloData.slo_status.processed_to_promoted.current_p95,
    targetValue: sloData.slo_status.processed_to_promoted.target_p95,
    unit: 'seconds',
    compliancePercentage: sloData.slo_status.processed_to_promoted.compliance_percentage,
    size: compact ? 'small' : 'medium'
  });

  const endToEnd = generateSLOStatusHTML({
    status: sloData.slo_status.end_to_end.status,
    label: 'End-to-End Pipeline',
    currentValue: sloData.slo_status.end_to_end.current_p95,
    targetValue: sloData.slo_status.end_to_end.target_p95,
    unit: 'seconds',
    compliancePercentage: sloData.slo_status.end_to_end.compliance_percentage,
    size: compact ? 'small' : 'medium'
  });

  const errorBudgetColor = sloData.error_budget.consumed_percentage > 80 ? 'text-red-600' :
                          sloData.error_budget.consumed_percentage > 50 ? 'text-yellow-600' : 'text-green-600';

  const trendsSection = showTrends ? `
    <div class="mt-6">
      <h4 class="text-sm font-medium text-gray-700 mb-3">Trends (Last 24h)</h4>
      <div class="text-xs text-gray-500">
        <p>Trend visualization would be implemented with a charting library</p>
        <p>Data points available: ${Object.keys(sloData.trends).length} metrics</p>
        <p>Sample count: ${Object.values(sloData.trends)[0]?.length || 0} measurements</p>
      </div>
    </div>
  ` : '';

  return `
    <div class="slo-dashboard-section bg-white rounded-lg shadow p-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-gray-800">${title}</h3>
        <span class="text-xs text-gray-500" title="Last updated: ${sloData.timestamp}">
          Updated: ${new Date(sloData.timestamp).toLocaleTimeString()}
        </span>
      </div>
      
      <div class="grid grid-cols-1 ${compact ? 'md:grid-cols-3' : 'md:grid-cols-1'} gap-3 mb-4">
        ${ingestToProcessed}
        ${processedToPromoted}
        ${endToEnd}
      </div>

      <div class="border-t pt-4">
        <h4 class="text-sm font-medium text-gray-700 mb-2">Error Budget</h4>
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-600">Consumed:</span>
          <span class="${errorBudgetColor} font-semibold">
            ${sloData.error_budget.consumed_percentage.toFixed(1)}%
          </span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-600">Remaining Days:</span>
          <span class="text-gray-800 font-semibold">
            ${sloData.error_budget.remaining_days} days
          </span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
          <div 
            class="h-2 rounded-full ${sloData.error_budget.consumed_percentage > 80 ? 'bg-red-500' : 
                                      sloData.error_budget.consumed_percentage > 50 ? 'bg-yellow-500' : 'bg-green-500'}"
            style="width: ${sloData.error_budget.consumed_percentage}%">
          </div>
        </div>
      </div>

      ${trendsSection}
    </div>
  `;
}

/**
 * Generate JavaScript code for real-time SLO updates
 */
export function generateSLOUpdateScript(refreshInterval: number = 30000): string {
  return `
    class SLODashboard {
      constructor(refreshInterval = ${refreshInterval}) {
        this.refreshInterval = refreshInterval;
        this.isUpdating = false;
        this.lastUpdateTime = null;
      }

      async fetchSLOData() {
        try {
          const response = await fetch('/out/ops/slo.json');
          if (!response.ok) {
            throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
          }
          return await response.json();
        } catch (error) {
          console.error('Failed to fetch SLO data:', error);
          return null;
        }
      }

      updateSLODisplay(sloData) {
        if (!sloData) return;

        // Update timestamp
        const timestampElements = document.querySelectorAll('.slo-last-updated');
        const updateTime = new Date(sloData.timestamp).toLocaleTimeString();
        timestampElements.forEach(el => {
          el.textContent = \`Updated: \${updateTime}\`;
        });

        // Update individual SLO status indicators
        this.updateSLOIndicator('ingest-to-processed', sloData.slo_status.ingest_to_processed);
        this.updateSLOIndicator('processed-to-promoted', sloData.slo_status.processed_to_promoted);
        this.updateSLOIndicator('end-to-end', sloData.slo_status.end_to_end);

        // Update error budget
        this.updateErrorBudget(sloData.error_budget);

        this.lastUpdateTime = Date.now();
      }

      updateSLOIndicator(metricId, sloStatus) {
        const container = document.querySelector(\`[data-slo-metric="\${metricId}"]\`);
        if (!container) return;

        // Update status indicator color
        const indicator = container.querySelector('.slo-status-indicator');
        if (indicator) {
          indicator.className = \`slo-status-indicator w-3 h-3 rounded-full bg-\${sloStatus.status}-500\`;
        }

        // Update current value
        const currentValue = container.querySelector('.slo-current-value');
        if (currentValue) {
          currentValue.textContent = this.formatLatency(sloStatus.current_p95);
        }

        // Update compliance percentage
        const compliance = container.querySelector('.slo-compliance');
        if (compliance) {
          compliance.textContent = \`\${sloStatus.compliance_percentage.toFixed(1)}%\`;
        }
      }

      updateErrorBudget(errorBudget) {
        const consumedElement = document.querySelector('.error-budget-consumed');
        const remainingElement = document.querySelector('.error-budget-remaining');
        const progressBar = document.querySelector('.error-budget-progress');

        if (consumedElement) {
          consumedElement.textContent = \`\${errorBudget.consumed_percentage.toFixed(1)}%\`;
        }

        if (remainingElement) {
          remainingElement.textContent = \`\${errorBudget.remaining_days} days\`;
        }

        if (progressBar) {
          progressBar.style.width = \`\${errorBudget.consumed_percentage}%\`;
          // Update color based on consumption
          const colorClass = errorBudget.consumed_percentage > 80 ? 'bg-red-500' :
                            errorBudget.consumed_percentage > 50 ? 'bg-yellow-500' : 'bg-green-500';
          progressBar.className = \`h-2 rounded-full \${colorClass}\`;
        }
      }

      formatLatency(latencySeconds) {
        if (latencySeconds < 1) {
          return \`\${Math.round(latencySeconds * 1000)}ms\`;
        } else if (latencySeconds < 60) {
          return \`\${latencySeconds.toFixed(1)}s\`;
        } else {
          const minutes = Math.floor(latencySeconds / 60);
          const seconds = latencySeconds % 60;
          return \`\${minutes}m \${seconds.toFixed(0)}s\`;
        }
      }

      async startAutoRefresh() {
        console.log(\`Starting SLO dashboard auto-refresh (interval: \${this.refreshInterval}ms)\`);
        
        // Initial update
        const initialData = await this.fetchSLOData();
        this.updateSLODisplay(initialData);

        // Set up periodic updates
        setInterval(async () => {
          if (!this.isUpdating) {
            this.isUpdating = true;
            try {
              const sloData = await this.fetchSLOData();
              this.updateSLODisplay(sloData);
            } finally {
              this.isUpdating = false;
            }
          }
        }, this.refreshInterval);
      }

      getStatus() {
        return {
          isUpdating: this.isUpdating,
          lastUpdateTime: this.lastUpdateTime,
          refreshInterval: this.refreshInterval
        };
      }
    }

    // Initialize SLO dashboard when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        window.slodashboard = new SLODashboard();
        window.slodashboard.startAutoRefresh();
      });
    } else {
      window.slodasboard = new SLODashboard();
      window.slodasboard.startAutoRefresh();
    }
  `;
}

/**
 * Utility functions for dashboard integration
 */
export const SLODashboardUtils = {
  formatLatency,
  formatCompliance,
  getSLOStatusClasses,
  generateSLOStatusHTML,
  generateSLODashboardHTML,
  generateSLOUpdateScript
};

export default SLODashboardUtils;