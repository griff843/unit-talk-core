/**
 * Shared types for the Unit Talk Core system
 */

// Base API response structure
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

// Health check response
export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  memory: NodeJS.MemoryUsage;
}

// Metrics ingestion response
export interface MetricsResponse {
  success: boolean;
  message: string;
  duration: number;
  error?: string;
}

// Raw props structure (placeholder)
export interface RawProps {
  id: string;
  inserted_at: string;
  processed_at?: string;
  data: Record<string, any>;
}

// Unified picks structure (placeholder)
export interface UnifiedPicks {
  id: string;
  raw_id: string;
  promoted_at?: string;
  data: Record<string, any>;
}

// Database role types
export type AppRole = 'promoter' | 'anon';

// Environment types
export type NodeEnv = 'development' | 'staging' | 'production';

// Utility types
export type Nullable<T> = T | null;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Shared utility functions
 */

// Type guard for checking if a value is not null/undefined
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// Safe JSON parsing with fallback
export function safeJsonParse<T = any>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

// Format timestamp to ISO string
export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

// Generate unique ID (simple implementation)
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Delay utility for testing/demos
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Environment checking utilities
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

export function isStaging(): boolean {
  return process.env.NODE_ENV === 'staging';
}