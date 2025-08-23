import { z } from 'zod';

// Environment schema with defaults and validation
const configSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  
  // API configuration
  API_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default('3000'),
  
  // Database configuration
  DATABASE_URL: z.string().url('Invalid DATABASE_URL'),
  SUPABASE_URL: z.string().url('Invalid SUPABASE_URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_KEY: z.string().min(1, 'SUPABASE_SERVICE_KEY is required'),
  
  // Temporal configuration
  TEMPORAL_SERVER_ADDRESS: z.string().default('localhost:7233'),
  TEMPORAL_TASK_QUEUE: z.string().default('unit-talk-queue'),
  
  // Feature flags
  SHADOW_MODE: z.string().transform((val) => val === 'true').default('true'),
  PUBLISH_TO_DISCORD: z.string().transform((val) => val === 'true').default('false'),
  
  // Observability
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  OTEL_ENABLED: z.string().transform((val) => val === 'true').default('false'),
});

type Config = z.infer<typeof configSchema>;
type RawConfig = z.input<typeof configSchema>;

let cachedConfig: Config | null = null;

/**
 * Get validated configuration - SSOT (Single Source of Truth) getter
 */
export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const rawConfig: RawConfig = {
      NODE_ENV: process.env.NODE_ENV,
      API_PORT: process.env.API_PORT,
      DATABASE_URL: process.env.DATABASE_URL,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
      TEMPORAL_SERVER_ADDRESS: process.env.TEMPORAL_SERVER_ADDRESS,
      TEMPORAL_TASK_QUEUE: process.env.TEMPORAL_TASK_QUEUE,
      SHADOW_MODE: process.env.SHADOW_MODE,
      PUBLISH_TO_DISCORD: process.env.PUBLISH_TO_DISCORD,
      LOG_LEVEL: process.env.LOG_LEVEL as any,
      OTEL_ENABLED: process.env.OTEL_ENABLED,
    };

    cachedConfig = configSchema.parse(rawConfig);
    return cachedConfig;
  } catch (error) {
    console.error('Configuration validation failed:', error);
    throw new Error('Invalid configuration. Please check your environment variables.');
  }
}

/**
 * Strongly-typed configuration getters for common use cases
 */
export const config = {
  get api() {
    return {
      port: getConfig().API_PORT,
      nodeEnv: getConfig().NODE_ENV,
    };
  },
  
  get database() {
    return {
      url: getConfig().DATABASE_URL,
      supabase: {
        url: getConfig().SUPABASE_URL,
        anonKey: getConfig().SUPABASE_ANON_KEY,
        serviceKey: getConfig().SUPABASE_SERVICE_KEY,
      },
    };
  },
  
  get temporal() {
    return {
      serverAddress: getConfig().TEMPORAL_SERVER_ADDRESS,
      taskQueue: getConfig().TEMPORAL_TASK_QUEUE,
    };
  },
  
  get features() {
    return {
      shadowMode: getConfig().SHADOW_MODE,
      publishToDiscord: getConfig().PUBLISH_TO_DISCORD,
    };
  },
  
  get observability() {
    return {
      logLevel: getConfig().LOG_LEVEL,
      otelEnabled: getConfig().OTEL_ENABLED,
    };
  },
} as const;

// Re-export for convenience
export { Config, RawConfig };