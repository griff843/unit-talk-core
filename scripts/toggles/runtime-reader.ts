// scripts/toggles/runtime-reader.ts
// Runtime toggle reader - only reads applied toggles, never proposals

import { ToggleStorage } from './storage.js';
import { KNOWN_TOGGLES, type ToggleState, type KnownToggleKey } from './types.js';

export interface RuntimeToggleConfig {
  [key: string]: string | boolean | number;
}

export class RuntimeToggleReader {
  private storage: ToggleStorage;
  private cache: Map<string, { value: any; timestamp: number }> = new Map();
  private readonly cacheTimeoutMs: number;

  constructor(storageDir?: string, cacheTimeoutMs: number = 30000) { // 30 second cache
    this.storage = new ToggleStorage(storageDir);
    this.cacheTimeoutMs = cacheTimeoutMs;
  }

  /**
   * Get current value of a specific toggle
   * Returns applied value or default if not set
   * NEVER returns pending proposals
   */
  async getToggle<T = any>(key: string): Promise<T> {
    const cached = this.cache.get(key);
    const now = Date.now();

    // Return cached value if still valid
    if (cached && (now - cached.timestamp) < this.cacheTimeoutMs) {
      return cached.value as T;
    }

    // Read from storage
    const value = await this.readToggleValue(key);
    
    // Cache the value
    this.cache.set(key, { value, timestamp: now });
    
    return value as T;
  }

  /**
   * Get multiple toggles at once for efficiency
   */
  async getToggles(keys: string[]): Promise<RuntimeToggleConfig> {
    const result: RuntimeToggleConfig = {};
    
    for (const key of keys) {
      result[key] = await this.getToggle(key);
    }
    
    return result;
  }

  /**
   * Get all known toggles with their current values
   */
  async getAllToggles(): Promise<RuntimeToggleConfig> {
    const knownKeys = Object.keys(KNOWN_TOGGLES);
    return this.getToggles(knownKeys);
  }

  /**
   * Get boolean toggle with type safety
   */
  async getBooleanToggle(key: KnownToggleKey): Promise<boolean> {
    const value = await this.getToggle(key);
    
    if (typeof value === 'boolean') {
      return value;
    }
    
    // Handle string boolean values
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    
    return Boolean(value);
  }

  /**
   * Get number toggle with type safety
   */
  async getNumberToggle(key: KnownToggleKey): Promise<number> {
    const value = await this.getToggle(key);
    
    if (typeof value === 'number') {
      return value;
    }
    
    const numValue = Number(value);
    if (isNaN(numValue)) {
      // Return default value if invalid
      const defaultValue = KNOWN_TOGGLES[key]?.defaultValue;
      return typeof defaultValue === 'number' ? defaultValue : 0;
    }
    
    return numValue;
  }

  /**
   * Get string toggle with type safety
   */
  async getStringToggle(key: KnownToggleKey): Promise<string> {
    const value = await this.getToggle(key);
    return String(value);
  }

  /**
   * Clear internal cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if a toggle is currently applied (has been approved and applied)
   */
  async isToggleApplied(key: string): Promise<boolean> {
    try {
      await this.storage.initialize();
      const config = await this.storage.readToggleConfig();
      return key in config.currentToggles;
    } catch (error) {
      // If there's an error reading, assume not applied
      return false;
    }
  }

  /**
   * Get metadata about a toggle (when it was applied, by whom, etc.)
   */
  async getToggleMetadata(key: string): Promise<ToggleState | null> {
    try {
      await this.storage.initialize();
      const config = await this.storage.readToggleConfig();
      return config.currentToggles[key] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Create a snapshot of current toggle state for logging/debugging
   */
  async createSnapshot(): Promise<{
    timestamp: string;
    toggles: RuntimeToggleConfig;
    metadata: Record<string, ToggleState | null>;
  }> {
    const knownKeys = Object.keys(KNOWN_TOGGLES);
    const toggles = await this.getToggles(knownKeys);
    
    const metadata: Record<string, ToggleState | null> = {};
    for (const key of knownKeys) {
      metadata[key] = await this.getToggleMetadata(key);
    }
    
    return {
      timestamp: new Date().toISOString(),
      toggles,
      metadata,
    };
  }

  /**
   * Validate runtime configuration against known toggle definitions
   */
  async validateRuntimeConfig(): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      const allToggles = await this.getAllToggles();
      
      for (const [key, value] of Object.entries(allToggles)) {
        const knownKey = key as KnownToggleKey;
        const toggleDef = KNOWN_TOGGLES[knownKey];
        
        if (!toggleDef) {
          warnings.push(`Unknown toggle key: ${key}`);
          continue;
        }
        
        // Type validation
        const expectedType = toggleDef.type;
        const actualType = typeof value;
        
        if (actualType !== expectedType) {
          errors.push(`Type mismatch for ${key}: expected ${expectedType}, got ${actualType}`);
        }
        
        // Range validation for numbers
        if (expectedType === 'number' && typeof value === 'number') {
          if ('minValue' in toggleDef && value < toggleDef.minValue!) {
            errors.push(`Value for ${key} (${value}) is below minimum (${toggleDef.minValue})`);
          }
          
          if ('maxValue' in toggleDef && value > toggleDef.maxValue!) {
            errors.push(`Value for ${key} (${value}) is above maximum (${toggleDef.maxValue})`);
          }
        }
      }
      
    } catch (error) {
      errors.push(`Runtime validation failed: ${(error as Error).message}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Internal method to read toggle value from storage
   */
  private async readToggleValue(key: string): Promise<any> {
    try {
      await this.storage.initialize();
      const config = await this.storage.readToggleConfig();
      
      // Check if toggle is applied
      const appliedToggle = config.currentToggles[key];
      if (appliedToggle) {
        return appliedToggle.value;
      }
      
      // Return default value if not applied
      const knownKey = key as KnownToggleKey;
      const toggleDef = KNOWN_TOGGLES[knownKey];
      
      if (toggleDef) {
        return toggleDef.defaultValue;
      }
      
      // Unknown toggle, return null
      return null;
      
    } catch (error) {
      // If there's any error, return default value or null
      const knownKey = key as KnownToggleKey;
      const toggleDef = KNOWN_TOGGLES[knownKey];
      
      if (toggleDef) {
        return toggleDef.defaultValue;
      }
      
      return null;
    }
  }
}

// Singleton instance for easy access throughout the application
let globalReader: RuntimeToggleReader | null = null;

/**
 * Get the global runtime toggle reader instance
 */
export function getGlobalToggleReader(storageDir?: string): RuntimeToggleReader {
  if (!globalReader) {
    globalReader = new RuntimeToggleReader(storageDir);
  }
  return globalReader;
}

/**
 * Convenience functions for common toggle operations
 */
export const Toggles = {
  async get<T = any>(key: string): Promise<T> {
    return getGlobalToggleReader().getToggle<T>(key);
  },
  
  async getBool(key: KnownToggleKey): Promise<boolean> {
    return getGlobalToggleReader().getBooleanToggle(key);
  },
  
  async getNumber(key: KnownToggleKey): Promise<number> {
    return getGlobalToggleReader().getNumberToggle(key);
  },
  
  async getString(key: KnownToggleKey): Promise<string> {
    return getGlobalToggleReader().getStringToggle(key);
  },
  
  async getAll(): Promise<RuntimeToggleConfig> {
    return getGlobalToggleReader().getAllToggles();
  },
  
  clearCache(): void {
    getGlobalToggleReader().clearCache();
  },
  
  async createSnapshot() {
    return getGlobalToggleReader().createSnapshot();
  },
};

/**
 * Environment variable integration helpers
 */
export class ToggleEnvironmentBridge {
  private reader: RuntimeToggleReader;
  
  constructor(reader?: RuntimeToggleReader) {
    this.reader = reader || getGlobalToggleReader();
  }
  
  /**
   * Update process.env with current toggle values
   * This allows existing environment-based code to work transparently
   */
  async updateProcessEnv(): Promise<void> {
    const toggles = await this.reader.getAllToggles();
    
    for (const [key, value] of Object.entries(toggles)) {
      process.env[key] = String(value);
    }
  }
  
  /**
   * Get a value that checks toggles first, then falls back to environment variables
   */
  async getValueWithEnvFallback(key: string): Promise<string | undefined> {
    try {
      const toggleValue = await this.reader.getToggle(key);
      if (toggleValue !== null && toggleValue !== undefined) {
        return String(toggleValue);
      }
    } catch (error) {
      // Fall through to environment variable
    }
    
    return process.env[key];
  }
  
  /**
   * Create a configuration object that merges toggles and environment variables
   */
  async createMergedConfig(): Promise<Record<string, string>> {
    const config: Record<string, string> = {};
    
    // Start with environment variables
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        config[key] = value;
      }
    }
    
    // Override with toggle values
    const toggles = await this.reader.getAllToggles();
    for (const [key, value] of Object.entries(toggles)) {
      config[key] = String(value);
    }
    
    return config;
  }
}