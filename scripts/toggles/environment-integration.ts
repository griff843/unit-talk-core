// scripts/toggles/environment-integration.ts
// Integration layer between secure toggles and existing environment variable system

import { Toggles, ToggleEnvironmentBridge } from './runtime-reader.js';
import { KNOWN_TOGGLES, type KnownToggleKey } from './types.js';

/**
 * Enhanced environment loader that prioritizes secure toggles over environment variables
 */
export class SecureEnvironmentLoader {
  private bridge: ToggleEnvironmentBridge;
  private cachedConfig: Record<string, string> | null = null;
  private cacheTimestamp: number = 0;
  private readonly cacheTtlMs: number;

  constructor(cacheTtlMs: number = 60000) { // 1 minute cache
    this.bridge = new ToggleEnvironmentBridge();
    this.cacheTtlMs = cacheTtlMs;
  }

  /**
   * Get configuration value with secure toggle priority
   * 1. Check secure toggles (if approved and applied)
   * 2. Fall back to environment variables
   * 3. Fall back to default values
   */
  async get(key: string): Promise<string | undefined> {
    // Use cached config if available and fresh
    const now = Date.now();
    if (this.cachedConfig && (now - this.cacheTimestamp) < this.cacheTtlMs) {
      return this.cachedConfig[key];
    }

    return this.bridge.getValueWithEnvFallback(key);
  }

  /**
   * Get boolean configuration value
   */
  async getBool(key: string, defaultValue: boolean = false): Promise<boolean> {
    const value = await this.get(key);
    
    if (value === undefined) {
      return defaultValue;
    }
    
    return value.toLowerCase() === 'true';
  }

  /**
   * Get number configuration value
   */
  async getNumber(key: string, defaultValue: number = 0): Promise<number> {
    const value = await this.get(key);
    
    if (value === undefined) {
      return defaultValue;
    }
    
    const numValue = Number(value);
    return isNaN(numValue) ? defaultValue : numValue;
  }

  /**
   * Get string configuration value
   */
  async getString(key: string, defaultValue: string = ''): Promise<string> {
    const value = await this.get(key);
    return value ?? defaultValue;
  }

  /**
   * Get all configuration as a merged object
   * Toggles override environment variables
   */
  async getAll(): Promise<Record<string, string>> {
    const now = Date.now();
    
    if (!this.cachedConfig || (now - this.cacheTimestamp) >= this.cacheTtlMs) {
      this.cachedConfig = await this.bridge.createMergedConfig();
      this.cacheTimestamp = now;
    }
    
    return { ...this.cachedConfig };
  }

  /**
   * Refresh the cached configuration
   */
  async refresh(): Promise<void> {
    this.cachedConfig = await this.bridge.createMergedConfig();
    this.cacheTimestamp = Date.now();
    Toggles.clearCache(); // Also clear toggle cache
  }

  /**
   * Create a snapshot for debugging
   */
  async createDebugSnapshot(): Promise<{
    timestamp: string;
    toggleStates: any;
    environmentVariables: Record<string, string>;
    mergedConfig: Record<string, string>;
    conflicts: Array<{ key: string; toggleValue: any; envValue: string }>;
  }> {
    const toggleSnapshot = await Toggles.createSnapshot();
    const envVars: Record<string, string> = {};
    const conflicts: Array<{ key: string; toggleValue: any; envValue: string }> = [];
    
    // Extract relevant environment variables
    for (const key of Object.keys(KNOWN_TOGGLES)) {
      if (process.env[key]) {
        envVars[key] = process.env[key]!;
        
        // Check for conflicts
        if (toggleSnapshot.toggles[key] !== undefined) {
          const toggleValue = String(toggleSnapshot.toggles[key]);
          const envValue = process.env[key]!;
          
          if (toggleValue !== envValue) {
            conflicts.push({
              key,
              toggleValue: toggleSnapshot.toggles[key],
              envValue,
            });
          }
        }
      }
    }
    
    const mergedConfig = await this.getAll();
    
    return {
      timestamp: new Date().toISOString(),
      toggleStates: toggleSnapshot,
      environmentVariables: envVars,
      mergedConfig,
      conflicts,
    };
  }
}

/**
 * Legacy environment variable compatibility layer
 * Maintains backward compatibility while enabling secure toggle override
 */
export class LegacyEnvironmentCompat {
  private loader: SecureEnvironmentLoader;
  private originalEnv: Record<string, string | undefined>;

  constructor() {
    this.loader = new SecureEnvironmentLoader();
    this.originalEnv = { ...process.env };
  }

  /**
   * Initialize compatibility layer by updating process.env with toggle values
   * This allows existing code to work without changes
   */
  async initialize(): Promise<void> {
    try {
      const mergedConfig = await this.loader.getAll();
      
      // Update process.env with merged values
      for (const [key, value] of Object.entries(mergedConfig)) {
        // Only update known toggle keys to avoid pollution
        if (key in KNOWN_TOGGLES) {
          process.env[key] = value;
        }
      }
      
      console.log('🔒 Secure toggle environment initialized');
      
      // Log any overrides for audit purposes
      const snapshot = await this.loader.createDebugSnapshot();
      if (snapshot.conflicts.length > 0) {
        console.log(`🔄 Toggle overrides active for: ${snapshot.conflicts.map(c => c.key).join(', ')}`);
      }
      
    } catch (error) {
      console.warn('Failed to initialize secure toggle environment:', error);
      // Continue with original environment variables
    }
  }

  /**
   * Restore original environment variables
   */
  restore(): void {
    for (const [key, value] of Object.entries(this.originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  /**
   * Get configuration with fallback chain
   */
  async getConfig(): Promise<Record<string, string>> {
    return this.loader.getAll();
  }
}

/**
 * Bootstrap function for application startup
 * Call this early in your application lifecycle
 */
export async function bootstrapSecureToggles(): Promise<void> {
  const compat = new LegacyEnvironmentCompat();
  await compat.initialize();
}

/**
 * Environment configuration factory with secure toggle integration
 */
export class ConfigFactory {
  private static loader: SecureEnvironmentLoader | null = null;

  /**
   * Get singleton configuration loader
   */
  static getLoader(): SecureEnvironmentLoader {
    if (!this.loader) {
      this.loader = new SecureEnvironmentLoader();
    }
    return this.loader;
  }

  /**
   * Create typed configuration object for application use
   */
  static async createConfig(): Promise<{
    // Runtime flags
    publishToDiscord: boolean;
    shadowMode: boolean;
    allowPromotionInShadow: boolean;
    enableMetrics: boolean;
    
    // Limits
    maxAllowedPromotes5Min: number;
    
    // System
    nodeEnv: string;
    logLevel: string;
    
    // Temporal
    temporalAddress: string;
    temporalNamespace: string;
    temporalTaskQueue: string;
  }> {
    const loader = this.getLoader();
    
    return {
      // Secure toggle-controlled values
      publishToDiscord: await loader.getBool('PUBLISH_TO_DISCORD', false),
      shadowMode: await loader.getBool('SHADOW_MODE', true),
      allowPromotionInShadow: await loader.getBool('ALLOW_PROMOTION_IN_SHADOW', false),
      enableMetrics: await loader.getBool('ENABLE_METRICS', true),
      maxAllowedPromotes5Min: await loader.getNumber('MAX_ALLOWED_PROMOTES_5MIN', 20),
      
      // Standard environment variables (not toggle-controlled)
      nodeEnv: await loader.getString('NODE_ENV', 'development'),
      logLevel: await loader.getString('LOG_LEVEL', 'info'),
      temporalAddress: await loader.getString('TEMPORAL_ADDRESS', '127.0.0.1:7233'),
      temporalNamespace: await loader.getString('TEMPORAL_NAMESPACE', 'default'),
      temporalTaskQueue: await loader.getString('TEMPORAL_TASK_QUEUE', 'unit-talk'),
    };
  }

  /**
   * Validate configuration and report any issues
   */
  static async validateConfig(): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    config: any;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      const config = await this.createConfig();
      const snapshot = await this.getLoader().createDebugSnapshot();
      
      // Validate required values
      if (!config.temporalAddress) {
        errors.push('TEMPORAL_ADDRESS is required');
      }
      
      if (!config.temporalNamespace) {
        errors.push('TEMPORAL_NAMESPACE is required');
      }
      
      if (!config.temporalTaskQueue) {
        errors.push('TEMPORAL_TASK_QUEUE is required');
      }
      
      // Validate secure toggle consistency
      if (snapshot.conflicts.length > 0) {
        warnings.push(`Environment/toggle conflicts: ${snapshot.conflicts.map(c => c.key).join(', ')}`);
      }
      
      // Validate runtime logic
      if (!config.shadowMode && config.allowPromotionInShadow) {
        warnings.push('ALLOW_PROMOTION_IN_SHADOW=true with SHADOW_MODE=false may cause issues');
      }
      
      if (config.publishToDiscord && config.shadowMode) {
        warnings.push('Discord publishing enabled in shadow mode - ensure this is intentional');
      }
      
      if (config.maxAllowedPromotes5Min <= 0) {
        errors.push('MAX_ALLOWED_PROMOTES_5MIN must be greater than 0');
      }
      
      if (config.maxAllowedPromotes5Min > 1000) {
        warnings.push('MAX_ALLOWED_PROMOTES_5MIN is very high - ensure this is intentional');
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        config,
      };
      
    } catch (error) {
      errors.push(`Configuration validation failed: ${(error as Error).message}`);
      
      return {
        valid: false,
        errors,
        warnings,
        config: null,
      };
    }
  }

  /**
   * Hot reload configuration (useful for development)
   */
  static async hotReload(): Promise<void> {
    if (this.loader) {
      await this.loader.refresh();
    }
  }
}

// Export singleton instances for convenience
export const Config = ConfigFactory.getLoader();
export const secureEnvironment = new LegacyEnvironmentCompat();