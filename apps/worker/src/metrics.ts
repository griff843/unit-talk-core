import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

// Create a Registry which registers the metrics
const register = new Registry();

// Add default metrics
collectDefaultMetrics({ register });

// Worker-specific metrics
const workflowsStarted = new Counter({
  name: 'temporal_workflows_started_total',
  help: 'Total number of workflows started',
  labelNames: ['workflow_type'],
  registers: [register]
});

const workflowsCompleted = new Counter({
  name: 'temporal_workflows_completed_total',
  help: 'Total number of workflows completed',
  labelNames: ['workflow_type', 'status'],
  registers: [register]
});

const workflowDuration = new Histogram({
  name: 'temporal_workflow_duration_seconds',
  help: 'Duration of workflow execution in seconds',
  labelNames: ['workflow_type'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register]
});

const activitiesExecuted = new Counter({
  name: 'temporal_activities_executed_total',
  help: 'Total number of activities executed',
  labelNames: ['activity_type'],
  registers: [register]
});

const activityDuration = new Histogram({
  name: 'temporal_activity_duration_seconds',
  help: 'Duration of activity execution in seconds',
  labelNames: ['activity_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

const activityFailures = new Counter({
  name: 'temporal_activity_failures_total',
  help: 'Total number of activity failures',
  labelNames: ['activity_type', 'error_type'],
  registers: [register]
});

const taskQueueBacklog = new Gauge({
  name: 'temporal_task_queue_backlog',
  help: 'Current size of Temporal task queue backlog',
  labelNames: ['task_queue'],
  registers: [register]
});

const workerUtilization = new Gauge({
  name: 'temporal_worker_utilization',
  help: 'Worker utilization percentage',
  registers: [register]
});

const processingBacklog = new Gauge({
  name: 'processing_backlog',
  help: 'Number of items waiting to be processed',
  registers: [register]
});

const promotionBacklog = new Gauge({
  name: 'promotion_backlog',
  help: 'Number of items waiting to be promoted',
  registers: [register]
});

// Track workflow execution
export const trackWorkflowStart = (workflowType: string) => {
  workflowsStarted.inc({ workflow_type: workflowType });
};

export const trackWorkflowComplete = (workflowType: string, status: 'success' | 'failure') => {
  workflowsCompleted.inc({ workflow_type: workflowType, status });
};

export const trackWorkflowDuration = (workflowType: string, durationSeconds: number) => {
  workflowDuration.observe({ workflow_type: workflowType }, durationSeconds);
};

// Track activity execution
export const trackActivityExecution = (activityType: string) => {
  activitiesExecuted.inc({ activity_type: activityType });
};

export const trackActivityDuration = (activityType: string, durationSeconds: number) => {
  activityDuration.observe({ activity_type: activityType }, durationSeconds);
};

export const trackActivityFailure = (activityType: string, errorType: string) => {
  activityFailures.inc({ activity_type: activityType, error_type: errorType });
};

// Update gauge metrics
export const updateTaskQueueBacklog = (taskQueue: string, size: number) => {
  taskQueueBacklog.set({ task_queue: taskQueue }, size);
};

export const updateWorkerUtilization = (utilization: number) => {
  workerUtilization.set(utilization);
};

export const updateProcessingBacklog = (size: number) => {
  processingBacklog.set(size);
};

export const updatePromotionBacklog = (size: number) => {
  promotionBacklog.set(size);
};

// Get metrics for export
export const getMetrics = async (): Promise<string> => {
  return register.metrics();
};

export const getMetricsJSON = async (): Promise<any> => {
  return register.getMetricsAsJSON();
};

// Health check for worker
export const getWorkerHealth = () => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
      TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE,
      TEMPORAL_TASK_QUEUE: process.env.TEMPORAL_TASK_QUEUE,
      SHADOW_MODE: process.env.SHADOW_MODE === 'true',
      PUBLISH_TO_DISCORD: process.env.PUBLISH_TO_DISCORD === 'true'
    },
    metrics: {
      workflows_started: workflowsStarted.hashMap,
      workflows_completed: workflowsCompleted.hashMap,
      activities_executed: activitiesExecuted.hashMap,
      activity_failures: activityFailures.hashMap,
      worker_utilization: workerUtilization.hashMap
    }
  };
};

// Export metrics instance for use in worker
export const workerMetrics = {
  trackWorkflowStart,
  trackWorkflowComplete,
  trackWorkflowDuration,
  trackActivityExecution,
  trackActivityDuration,
  trackActivityFailure,
  updateTaskQueueBacklog,
  updateWorkerUtilization,
  updateProcessingBacklog,
  updatePromotionBacklog,
  getMetrics,
  getMetricsJSON,
  getWorkerHealth,
  register
};

export default workerMetrics;