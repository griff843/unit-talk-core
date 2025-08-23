import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { getConfig } from '@unit-talk/config';

// Initialize OpenTelemetry SDK
let otelSdk: NodeSDK | null = null;

export function initializeTracing(serviceName: string): void {
  const config = getConfig();

  if (!config.OTEL_ENABLED) {
    console.log('OpenTelemetry disabled via config');
    return;
  }

  try {
    otelSdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.NODE_ENV,
      }),
      traceExporter: new ConsoleSpanExporter(),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    otelSdk.start();
    console.log(`OpenTelemetry initialized for ${serviceName}`);
  } catch (error) {
    console.error('Failed to initialize OpenTelemetry:', error);
  }
}

export function shutdownTracing(): Promise<void> {
  if (otelSdk) {
    return otelSdk.shutdown();
  }
  return Promise.resolve();
}

/**
 * Structured logger with configurable levels
 */
export interface LogContext {
  [key: string]: any;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private serviceName: string;
  private logLevel: LogLevel;

  constructor(serviceName: string = 'unit-talk', logLevel?: LogLevel) {
    this.serviceName = serviceName;

    try {
      const config = getConfig();
      this.logLevel = logLevel || config.LOG_LEVEL;
    } catch {
      // Fallback if config not available
      this.logLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[this.logLevel];
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    context?: LogContext
  ) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      service: this.serviceName,
      message,
      ...context,
    };

    return JSON.stringify(logEntry);
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, context));
    }
  }

  child(additionalContext: LogContext): Logger {
    const childLogger = new Logger(this.serviceName, this.logLevel);
    const originalFormatMessage = childLogger.formatMessage.bind(childLogger);

    childLogger.formatMessage = (
      level: LogLevel,
      message: string,
      context?: LogContext
    ) => {
      return originalFormatMessage(level, message, {
        ...additionalContext,
        ...context,
      });
    };

    return childLogger;
  }
}

// Create default logger instance
export const logger = new Logger();

// Create service-specific logger
export function createLogger(serviceName: string, logLevel?: LogLevel): Logger {
  return new Logger(serviceName, logLevel);
}

// Export types for external use
export type { Logger };
