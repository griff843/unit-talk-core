import { z } from 'zod';

/**
 * Environment variable validation schema with comprehensive validation rules
 * This schema ensures fail-closed startup - invalid configuration prevents startup
 */

// Custom validation helpers
const portSchema = z
  .string()
  .transform(Number)
  .pipe(
    z
      .number()
      .min(1024, 'Port must be >= 1024')
      .max(65535, 'Port must be <= 65535')
  );

const booleanSchema = z.string().transform(val => {
  const lower = val.toLowerCase();
  if (lower === 'true' || lower === '1') return true;
  if (lower === 'false' || lower === '0') return false;
  throw new Error(`Invalid boolean value: ${val}. Use 'true' or 'false'`);
});

const positiveIntSchema = z
  .string()
  .transform(Number)
  .pipe(z.number().positive('Must be a positive integer'));

const durationSchema = z
  .string()
  .regex(/^\d+[smhd]?$/, 'Invalid duration format. Use: 30s, 5m, 1h, 7d');

// Main configuration schema
const configSchema = z.object({
  // =============================================================================
  // CORE APPLICATION SETTINGS
  // =============================================================================
  NODE_ENV: z
    .enum(['development', 'staging', 'production'], {
      errorMap: () => ({
        message: 'NODE_ENV must be: development, staging, or production',
      }),
    })
    .default('development'),

  API_PORT: portSchema.default('3000'),

  WORKER_CONCURRENCY: positiveIntSchema.default('5'),
  WORKER_MAX_RETRIES: positiveIntSchema.default('3'),

  // =============================================================================
  // DATABASE & STORAGE CONFIGURATION
  // =============================================================================
  DATABASE_URL: z
    .string()
    .url('DATABASE_URL must be a valid PostgreSQL connection string')
    .refine(
      url => url.startsWith('postgresql://') || url.startsWith('postgres://'),
      'DATABASE_URL must be a PostgreSQL connection string'
    ),

  SUPABASE_URL: z
    .string()
    .url('SUPABASE_URL must be a valid HTTPS URL')
    .refine(
      url => url.includes('supabase.co') || url.includes('localhost'),
      'SUPABASE_URL should be a Supabase URL or localhost for development'
    ),

  SUPABASE_ANON_KEY: z.string().min(10).max(2048),

  SUPABASE_SERVICE_KEY: z.string().min(10).max(2048),
  
  // Alternative name for SUPABASE_SERVICE_KEY (backwards compatibility)
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10).max(2048).optional(),

  DB_POOL_MIN: positiveIntSchema.default('2'),
  DB_POOL_MAX: positiveIntSchema.default('10'),

  // =============================================================================
  // FEATURE FLAGS & OPERATIONAL MODES
  // =============================================================================
  SHADOW_MODE: booleanSchema.default('true'),
  PUBLISH_TO_DISCORD: booleanSchema.default('false'),
  ALLOW_PROMOTION_IN_SHADOW: booleanSchema.default('false'),
  MAX_ALLOWED_PROMOTES_5MIN: positiveIntSchema.default('20'),
  
  // Row Level Security session variables
  APP_ROLE_FOR_TASK: z.string().default('promoter'),
  APP_TENANT_ID: z.string().default('public'),
  ENABLE_DEBUG_ROUTES: booleanSchema.default('false'),
  ENABLE_ADMIN_ROUTES: booleanSchema.default('false'),

  // =============================================================================
  // TEMPORAL WORKFLOW ENGINE
  // =============================================================================
  TEMPORAL_SERVER_ADDRESS: z
    .string()
    .regex(
      /^[\w.-]+:\d+$/,
      'TEMPORAL_SERVER_ADDRESS must be in format host:port'
    )
    .default('localhost:7233'),

  TEMPORAL_TASK_QUEUE: z
    .string()
    .min(1, 'TEMPORAL_TASK_QUEUE cannot be empty')
    .default('unit-talk-queue'),

  TEMPORAL_NAMESPACE: z.string().default('default'),
  TEMPORAL_CLIENT_TIMEOUT: positiveIntSchema.default('30'),

  // =============================================================================
  // OBSERVABILITY & MONITORING
  // =============================================================================
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'], {
      errorMap: () => ({
        message: 'LOG_LEVEL must be: debug, info, warn, or error',
      }),
    })
    .default('info'),

  LOG_FORMAT: z.enum(['json', 'text']).default('json'),

  OTEL_ENABLED: booleanSchema.default('false'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),

  HEALTH_CHECK_TIMEOUT: positiveIntSchema.default('5'),
  HEALTH_CHECK_INTERVAL: positiveIntSchema.default('30'),

  // =============================================================================
  // EXTERNAL SERVICE INTEGRATIONS (optional in development)
  // =============================================================================
  LINEAR_API_KEY: z.string().optional(),
  LINEAR_TEAM_ID: z.string().optional(),

  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_CHANNEL_PICKS: z.string().optional(),
  DISCORD_CHANNEL_ALERTS: z.string().optional(),

  ESPN_API_KEY: z.string().optional(),
  ODDS_API_KEY: z.string().optional(),
  PROVIDER_RATE_LIMIT: positiveIntSchema.default('100'),

  // =============================================================================
  // SECURITY & AUTHENTICATION
  // =============================================================================
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters for security')
    .default('development-jwt-secret-min-32-chars-please-change-in-prod'),

  JWT_EXPIRES_IN: durationSchema.default('24h'),

  RATE_LIMIT_WINDOW_MS: positiveIntSchema.default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: positiveIntSchema.default('100'),

  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000,http://localhost:3001'),
  CORS_CREDENTIALS: booleanSchema.default('true'),

  // =============================================================================
  // INFRASTRUCTURE & PERFORMANCE
  // =============================================================================
  REDIS_URL: z
    .string()
    .url('REDIS_URL must be a valid Redis connection string')
    .optional(),
  REDIS_TTL: positiveIntSchema.default('3600'),

  METRICS_PORT: portSchema.default('9090'),
  METRICS_PATH: z.string().default('/metrics'),

  MAX_REQUEST_SIZE: z.string().default('10mb'),
  REQUEST_TIMEOUT: positiveIntSchema.default('30'),
  KEEP_ALIVE_TIMEOUT: positiveIntSchema.default('5'),

  // =============================================================================
  // TESTING & DEVELOPMENT
  // =============================================================================
  TEST_DATABASE_URL: z.string().url().optional(),
  E2E_TIMEOUT: positiveIntSchema.default('30000'),
  E2E_RETRY_ATTEMPTS: positiveIntSchema.default('2'),
  DEV_ENABLE_PLAYGROUND: booleanSchema.default('true'),
  DEV_MOCK_EXTERNAL_APIS: booleanSchema.default('false'),
});

/**
 * Type definitions for validated configuration
 */
export type Config = z.infer<typeof configSchema>;
export type RawConfig = z.input<typeof configSchema>;

// Configuration validation state
let cachedConfig: Config | null = null;
let validationAttempted: boolean = false;

/**
 * Environment variable validation errors with helpful context
 */
class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: any,
    public readonly suggestion?: string
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Format Zod validation errors into helpful messages
 */
function formatValidationError(error: z.ZodError): ConfigValidationError[] {
  return error.issues.map(issue => {
    const field = issue.path.join('.');
    const value =
      issue.code === 'invalid_type' && 'received' in issue
        ? issue.received
        : 'invalid';

    let suggestion = '';

    // Provide helpful suggestions based on common errors
    if (field === 'DATABASE_URL') {
      suggestion =
        'Example: postgresql://user:password@localhost:5432/database';
    } else if (field === 'API_PORT') {
      suggestion = 'Use a port between 1024-65535, e.g., 3000';
    } else if (field.includes('_KEY') || field.includes('_SECRET')) {
      suggestion =
        'Check your environment variables and ensure secrets are set';
    } else if (field === 'NODE_ENV') {
      suggestion = 'Must be: development, staging, or production';
    }

    return new ConfigValidationError(issue.message, field, value, suggestion);
  });
}

/**
 * Validate production-specific requirements
 */
function validateProductionConfig(config: Config): void {
  if (config.NODE_ENV === 'production') {
    const requiredInProd = [
      'SUPABASE_SERVICE_KEY',
      'JWT_SECRET',
      'LINEAR_API_KEY',
      'DISCORD_BOT_TOKEN',
    ];

    const missing = requiredInProd.filter(key => {
      const value = process.env[key];
      return !value || value.includes('your-') || value.includes('development');
    });

    if (missing.length > 0) {
      throw new ConfigValidationError(
        `Production environment requires: ${missing.join(', ')}`,
        'production_validation',
        missing,
        'Set these variables in GitHub Environments for production deployment'
      );
    }

    // Validate critical production flags
    if (config.SHADOW_MODE === true) {
      throw new ConfigValidationError(
        'SHADOW_MODE must be false in production',
        'SHADOW_MODE',
        true,
        'Set SHADOW_MODE=false for production deployment'
      );
    }

    if (config.ENABLE_DEBUG_ROUTES === true) {
      throw new ConfigValidationError(
        'Debug routes must be disabled in production',
        'ENABLE_DEBUG_ROUTES',
        true,
        'Set ENABLE_DEBUG_ROUTES=false for production deployment'
      );
    }
  }
}

/**
 * Get validated configuration - SSOT (Single Source of Truth) getter
 * Implements fail-closed startup: invalid configuration prevents startup
 */
export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (validationAttempted) {
    throw new Error(
      'Configuration validation already failed. Fix environment variables and restart.'
    );
  }

  validationAttempted = true;

  try {
    // Extract all environment variables (avoiding direct process.env access in app code)
    const rawConfig = Object.fromEntries(
      Object.keys(configSchema.shape).map(key => [key, process.env[key]])
    ) as RawConfig;

    // Parse and validate configuration
    const validatedConfig = configSchema.parse(rawConfig);

    // Additional production validations
    validateProductionConfig(validatedConfig);

    cachedConfig = validatedConfig;

    // Log successful validation (without sensitive data)
    const safeConfig = {
      NODE_ENV: validatedConfig.NODE_ENV,
      API_PORT: validatedConfig.API_PORT,
      SHADOW_MODE: validatedConfig.SHADOW_MODE,
      LOG_LEVEL: validatedConfig.LOG_LEVEL,
      OTEL_ENABLED: validatedConfig.OTEL_ENABLED,
    };

    console.log('✅ Configuration validated successfully:', safeConfig);

    return cachedConfig;
  } catch (error) {
    // Enhanced error reporting
    if (error instanceof z.ZodError) {
      const validationErrors = formatValidationError(error);

      console.error('\n❌ Configuration Validation Failed:');
      console.error('=====================================');

      validationErrors.forEach((err, index) => {
        console.error(`\n${index + 1}. Field: ${err.field}`);
        console.error(`   Error: ${err.message}`);
        console.error(`   Value: ${err.value}`);
        if (err.suggestion) {
          console.error(`   💡 Tip: ${err.suggestion}`);
        }
      });

      console.error('\n🔧 Fix these issues and restart the application.');
      console.error(
        '📚 See .env.example for complete configuration reference.'
      );

      // Create a comprehensive error message
      const errorMessage = `Configuration validation failed: ${validationErrors.map(e => e.field).join(', ')}`;
      throw new Error(errorMessage);
    }

    if (error instanceof ConfigValidationError) {
      console.error(`\n❌ ${error.field}: ${error.message}`);
      if (error.suggestion) {
        console.error(`💡 ${error.suggestion}`);
      }
      throw error;
    }

    console.error('❌ Unexpected configuration error:', error);
    throw new Error(
      'Failed to load configuration. Check environment variables.'
    );
  }
}

/**
 * Reset configuration cache (useful for testing)
 */
export function resetConfigCache(): void {
  cachedConfig = null;
  validationAttempted = false;
}

/**
 * Validate configuration without caching (useful for testing)
 */
export function validateConfig(envVars?: Record<string, string>): Config {
  const testRawConfig = envVars
    ? Object.fromEntries(
        Object.keys(configSchema.shape).map(key => [key, envVars[key]])
      )
    : Object.fromEntries(
        Object.keys(configSchema.shape).map(key => [key, process.env[key]])
      );

  return configSchema.parse(testRawConfig);
}

/**
 * Strongly-typed configuration getters for common use cases
 * Provides grouped access to related configuration values
 */
export const config = {
  /** API and server configuration */
  get api() {
    const cfg = getConfig();
    return {
      port: cfg.API_PORT,
      nodeEnv: cfg.NODE_ENV,
      maxRequestSize: cfg.MAX_REQUEST_SIZE,
      requestTimeout: cfg.REQUEST_TIMEOUT,
      keepAliveTimeout: cfg.KEEP_ALIVE_TIMEOUT,
    };
  },

  /** Database and storage configuration */
  get database() {
    const cfg = getConfig();
    return {
      url: cfg.DATABASE_URL,
      poolMin: cfg.DB_POOL_MIN,
      poolMax: cfg.DB_POOL_MAX,
      supabase: {
        url: cfg.SUPABASE_URL,
        anonKey: cfg.SUPABASE_ANON_KEY,
        serviceKey: cfg.SUPABASE_SERVICE_KEY,
      },
      rls: {
        appRole: cfg.APP_ROLE_FOR_TASK,
        tenantId: cfg.APP_TENANT_ID,
      },
    };
  },

  /** Worker and processing configuration */
  get worker() {
    const cfg = getConfig();
    return {
      concurrency: cfg.WORKER_CONCURRENCY,
      maxRetries: cfg.WORKER_MAX_RETRIES,
    };
  },

  /** Temporal workflow engine configuration */
  get temporal() {
    const cfg = getConfig();
    return {
      serverAddress: cfg.TEMPORAL_SERVER_ADDRESS,
      taskQueue: cfg.TEMPORAL_TASK_QUEUE,
      namespace: cfg.TEMPORAL_NAMESPACE,
      clientTimeout: cfg.TEMPORAL_CLIENT_TIMEOUT,
    };
  },

  /** Feature flags and operational modes */
  get features() {
    const cfg = getConfig();
    return {
      shadowMode: cfg.SHADOW_MODE,
      publishToDiscord: cfg.PUBLISH_TO_DISCORD,
      allowPromotionInShadow: cfg.ALLOW_PROMOTION_IN_SHADOW,
      maxPromotesPer5Min: cfg.MAX_ALLOWED_PROMOTES_5MIN,
      enableDebugRoutes: cfg.ENABLE_DEBUG_ROUTES,
      enableAdminRoutes: cfg.ENABLE_ADMIN_ROUTES,
    };
  },

  /** Observability and monitoring configuration */
  get observability() {
    const cfg = getConfig();
    return {
      logLevel: cfg.LOG_LEVEL,
      logFormat: cfg.LOG_FORMAT,
      otelEnabled: cfg.OTEL_ENABLED,
      otelEndpoint: cfg.OTEL_EXPORTER_OTLP_ENDPOINT,
      healthCheckTimeout: cfg.HEALTH_CHECK_TIMEOUT,
      healthCheckInterval: cfg.HEALTH_CHECK_INTERVAL,
    };
  },

  /** Security and authentication configuration */
  get security() {
    const cfg = getConfig();
    return {
      jwtSecret: cfg.JWT_SECRET,
      jwtExpiresIn: cfg.JWT_EXPIRES_IN,
      rateLimitWindowMs: cfg.RATE_LIMIT_WINDOW_MS,
      rateLimitMaxRequests: cfg.RATE_LIMIT_MAX_REQUESTS,
      corsOrigin: cfg.CORS_ORIGIN.split(','),
      corsCredentials: cfg.CORS_CREDENTIALS,
    };
  },

  /** External service integrations */
  get integrations() {
    const cfg = getConfig();
    return {
      linear: {
        apiKey: cfg.LINEAR_API_KEY,
        teamId: cfg.LINEAR_TEAM_ID,
      },
      discord: {
        botToken: cfg.DISCORD_BOT_TOKEN,
        guildId: cfg.DISCORD_GUILD_ID,
        channelPicks: cfg.DISCORD_CHANNEL_PICKS,
        channelAlerts: cfg.DISCORD_CHANNEL_ALERTS,
      },
      sportsData: {
        espnApiKey: cfg.ESPN_API_KEY,
        oddsApiKey: cfg.ODDS_API_KEY,
        rateLimit: cfg.PROVIDER_RATE_LIMIT,
      },
    };
  },

  /** Infrastructure and performance configuration */
  get infrastructure() {
    const cfg = getConfig();
    return {
      redis: {
        url: cfg.REDIS_URL,
        ttl: cfg.REDIS_TTL,
      },
      metrics: {
        port: cfg.METRICS_PORT,
        path: cfg.METRICS_PATH,
      },
    };
  },

  /** Testing and development configuration */
  get development() {
    const cfg = getConfig();
    return {
      testDatabaseUrl: cfg.TEST_DATABASE_URL,
      e2eTimeout: cfg.E2E_TIMEOUT,
      e2eRetryAttempts: cfg.E2E_RETRY_ATTEMPTS,
      enablePlayground: cfg.DEV_ENABLE_PLAYGROUND,
      mockExternalApis: cfg.DEV_MOCK_EXTERNAL_APIS,
    };
  },
} as const;

/**
 * Environment validation utilities
 */
export const envUtils = {
  /** Check if running in production */
  isProduction: () => getConfig().NODE_ENV === 'production',

  /** Check if running in development */
  isDevelopment: () => getConfig().NODE_ENV === 'development',

  /** Check if running in staging */
  isStaging: () => getConfig().NODE_ENV === 'staging',

  /** Check if shadow mode is enabled */
  isShadowMode: () => getConfig().SHADOW_MODE,

  /** Check if debug features are enabled */
  isDebugEnabled: () => getConfig().ENABLE_DEBUG_ROUTES,

  /** Check if admin routes are enabled */
  isAdminEnabled: () => getConfig().ENABLE_ADMIN_ROUTES,

  /** Get safe configuration for logging (no secrets) */
  getSafeConfig: () => {
    const cfg = getConfig();
    return {
      NODE_ENV: cfg.NODE_ENV,
      API_PORT: cfg.API_PORT,
      SHADOW_MODE: cfg.SHADOW_MODE,
      PUBLISH_TO_DISCORD: cfg.PUBLISH_TO_DISCORD,
      LOG_LEVEL: cfg.LOG_LEVEL,
      OTEL_ENABLED: cfg.OTEL_ENABLED,
      hasLinearConfig: Boolean(cfg.LINEAR_API_KEY),
      hasDiscordConfig: Boolean(cfg.DISCORD_BOT_TOKEN),
      hasRedisConfig: Boolean(cfg.REDIS_URL),
    };
  },
};

/**
 * Re-exports for convenience and backward compatibility
 */
export type { ConfigValidationError };
export default config;

/**
 * Initialize and validate configuration on module load
 * This ensures fail-closed startup behavior
 */
try {
  // Validate configuration when module is imported
  // This will throw an error if configuration is invalid, preventing startup
  getConfig();
} catch (error) {
  // In test environments, we might want to be more lenient
  if (process.env.NODE_ENV !== 'test') {
    console.error('\n🚨 STARTUP FAILED: Invalid configuration detected');
    console.error(
      'Application cannot start with invalid environment variables.'
    );
    console.error('Please fix the configuration errors and restart.\n');
    process.exit(1);
  }
}
