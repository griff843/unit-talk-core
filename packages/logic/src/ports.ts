/**
 * Core ports for dependency inversion in pure business logic.
 * All I/O operations must go through these interfaces to maintain
 * determinism and testability.
 */

import { z } from 'zod';

// ===== TIME OPERATIONS =====

/**
 * Clock port for all time-related operations
 * Enables deterministic testing by injecting time dependencies
 */
export interface Clock {
  /** Get current timestamp as ISO string */
  now(): string;
  /** Get current Date object */
  nowAsDate(): Date;
  /** Get current Unix timestamp in milliseconds */
  nowAsUnix(): number;
  /** Parse ISO string to Date */
  parseISOString(isoString: string): Date;
  /** Format Date to ISO string */
  formatToISO(date: Date): string;
  /** Add duration to date */
  addDuration(date: Date, duration: Duration): Date;
  /** Get duration between two dates */
  getDuration(start: Date, end: Date): Duration;
  /** Check if date is in the past */
  isPast(date: Date): boolean;
  /** Check if date is in the future */
  isFuture(date: Date): boolean;
}

export interface Duration {
  readonly years?: number;
  readonly months?: number;
  readonly days?: number;
  readonly hours?: number;
  readonly minutes?: number;
  readonly seconds?: number;
  readonly milliseconds?: number;
}

// ===== ENVIRONMENT CONFIGURATION =====

/**
 * Environment port for configuration access
 * Provides typed, validated environment variables
 */
export interface Env {
  /** Get required string value */
  getString(key: string): string;
  /** Get optional string value with default */
  getStringOptional(key: string, defaultValue?: string): string | undefined;
  /** Get required number value */
  getNumber(key: string): number;
  /** Get optional number value with default */
  getNumberOptional(key: string, defaultValue?: number): number | undefined;
  /** Get required boolean value */
  getBoolean(key: string): boolean;
  /** Get optional boolean value with default */
  getBooleanOptional(key: string, defaultValue?: boolean): boolean | undefined;
  /** Get required JSON value (parsed) */
  getJSON<T = unknown>(key: string): T;
  /** Get optional JSON value with default */
  getJSONOptional<T = unknown>(key: string, defaultValue?: T): T | undefined;
  /** Check if environment variable exists */
  has(key: string): boolean;
  /** Get all environment variables (for debugging) */
  getAll(): Record<string, string>;
}

// ===== DATABASE OPERATIONS =====

/**
 * Generic database query interface
 * Abstracts away specific database implementations
 */
export interface DbQuery<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly sql: string;
  readonly params: TInput;
  execute(): Promise<TOutput>;
}

/**
 * Database port for all data persistence operations
 */
export interface Db {
  /** Execute a single query */
  query<TInput, TOutput>(query: DbQuery<TInput, TOutput>): Promise<TOutput>;
  /** Execute multiple queries in a transaction */
  transaction<T>(queries: DbQuery[]): Promise<T[]>;
  /** Execute a query with retry logic */
  queryWithRetry<TInput, TOutput>(
    query: DbQuery<TInput, TOutput>,
    maxRetries?: number
  ): Promise<TOutput>;
  /** Test database connectivity */
  ping(): Promise<boolean>;
  /** Get database connection status */
  getStatus(): Promise<DbStatus>;
}

export interface DbStatus {
  readonly connected: boolean;
  readonly latency: number; // milliseconds
  readonly activeConnections: number;
  readonly poolSize: number;
  readonly lastError?: string;
}

// ===== HTTP OPERATIONS =====

/**
 * HTTP request configuration
 */
export const HttpRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  timeout: z.number().positive().optional(),
  retries: z.number().nonnegative().optional(),
});

export type HttpRequest = z.infer<typeof HttpRequestSchema>;

/**
 * HTTP response structure
 */
export interface HttpResponse<T = unknown> {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly data: T;
  readonly url: string;
  readonly duration: number; // milliseconds
}

/**
 * HTTP port for external API calls
 */
export interface Http {
  /** Execute HTTP request */
  request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;
  /** Execute GET request */
  get<T = unknown>(
    url: string,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>>;
  /** Execute POST request */
  post<T = unknown>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>>;
  /** Execute PUT request */
  put<T = unknown>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>>;
  /** Execute PATCH request */
  patch<T = unknown>(
    url: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>>;
  /** Execute DELETE request */
  delete<T = unknown>(
    url: string,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>>;
  /** Test connectivity to a URL */
  ping(url: string): Promise<boolean>;
}

// ===== FILE SYSTEM OPERATIONS =====

/**
 * File metadata
 */
export interface FileMetadata {
  readonly path: string;
  readonly size: number;
  readonly createdAt: Date;
  readonly modifiedAt: Date;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly permissions: string;
}

/**
 * File system port for file operations
 */
export interface Files {
  /** Read file as string */
  readText(path: string): Promise<string>;
  /** Read file as binary buffer */
  readBinary(path: string): Promise<Uint8Array>;
  /** Write text to file */
  writeText(path: string, content: string): Promise<void>;
  /** Write binary data to file */
  writeBinary(path: string, data: Uint8Array): Promise<void>;
  /** Append text to file */
  appendText(path: string, content: string): Promise<void>;
  /** Check if file/directory exists */
  exists(path: string): Promise<boolean>;
  /** Get file metadata */
  getMetadata(path: string): Promise<FileMetadata>;
  /** List directory contents */
  listDirectory(path: string): Promise<string[]>;
  /** Create directory (recursive) */
  createDirectory(path: string): Promise<void>;
  /** Delete file or directory */
  delete(path: string): Promise<void>;
  /** Copy file or directory */
  copy(source: string, destination: string): Promise<void>;
  /** Move/rename file or directory */
  move(source: string, destination: string): Promise<void>;
}

// ===== EXTERNAL EVENTS =====

/**
 * External event structure
 */
export interface ExternalEvent<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly timestamp: string;
  readonly data: T;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Event subscription configuration
 */
export interface EventSubscription {
  readonly id: string;
  readonly eventTypes: string[];
  readonly sources?: string[];
  readonly active: boolean;
  readonly createdAt: Date;
}

/**
 * External events port for pub/sub operations
 */
export interface External {
  /** Publish an event */
  publish<T = unknown>(
    event: Omit<ExternalEvent<T>, 'id' | 'timestamp'>
  ): Promise<string>;
  /** Subscribe to events */
  subscribe(
    eventTypes: string[],
    handler: (event: ExternalEvent) => Promise<void>,
    sources?: string[]
  ): Promise<EventSubscription>;
  /** Unsubscribe from events */
  unsubscribe(subscriptionId: string): Promise<void>;
  /** Get active subscriptions */
  getSubscriptions(): Promise<EventSubscription[]>;
  /** Get event history */
  getEventHistory(
    eventTypes?: string[],
    sources?: string[],
    since?: Date
  ): Promise<ExternalEvent[]>;
  /** Test external connectivity */
  ping(): Promise<boolean>;
}

// ===== COMBINED PORTS TYPE =====

/**
 * Combined ports interface containing all dependencies
 * This is what business logic functions should receive
 */
export interface Ports {
  readonly clock: Clock;
  readonly env: Env;
  readonly db: Db;
  readonly http: Http;
  readonly files: Files;
  readonly external: External;
}

// ===== PORT VALIDATION =====

/**
 * Validate that all required ports are provided
 */
export function validatePorts(ports: Partial<Ports>): asserts ports is Ports {
  const requiredPorts = [
    'clock',
    'env',
    'db',
    'http',
    'files',
    'external',
  ] as const;

  for (const portName of requiredPorts) {
    if (!ports[portName]) {
      throw new Error(`Missing required port: ${portName}`);
    }
  }
}

/**
 * Create a type-safe partial ports object for testing
 */
export function createTestPorts(overrides: Partial<Ports> = {}): Ports {
  const defaultPorts: Ports = {
    clock: createMockClock(),
    env: createMockEnv(),
    db: createMockDb(),
    http: createMockHttp(),
    files: createMockFiles(),
    external: createMockExternal(),
  };

  return { ...defaultPorts, ...overrides };
}

// ===== MOCK IMPLEMENTATIONS FOR TESTING =====

function createMockClock(): Clock {
  const fixedDate = new Date('2024-01-01T00:00:00.000Z');
  return {
    now: () => fixedDate.toISOString(),
    nowAsDate: () => new Date(fixedDate),
    nowAsUnix: () => fixedDate.getTime(),
    parseISOString: (iso: string) => new Date(iso),
    formatToISO: (date: Date) => date.toISOString(),
    addDuration: (date: Date, duration: Duration) => {
      const result = new Date(date);
      if (duration.milliseconds)
        result.setMilliseconds(
          result.getMilliseconds() + duration.milliseconds
        );
      if (duration.seconds)
        result.setSeconds(result.getSeconds() + duration.seconds);
      if (duration.minutes)
        result.setMinutes(result.getMinutes() + duration.minutes);
      if (duration.hours) result.setHours(result.getHours() + duration.hours);
      if (duration.days) result.setDate(result.getDate() + duration.days);
      if (duration.months) result.setMonth(result.getMonth() + duration.months);
      if (duration.years)
        result.setFullYear(result.getFullYear() + duration.years);
      return result;
    },
    getDuration: (start: Date, end: Date) => ({
      milliseconds: end.getTime() - start.getTime(),
    }),
    isPast: (date: Date) => date < fixedDate,
    isFuture: (date: Date) => date > fixedDate,
  };
}

function createMockEnv(): Env {
  const mockEnv: Record<string, string> = {};
  return {
    getString: (key: string) => mockEnv[key] || `mock-${key}`,
    getStringOptional: (key: string, defaultValue?: string) =>
      mockEnv[key] || defaultValue,
    getNumber: (key: string) => parseInt(mockEnv[key] || '0', 10),
    getNumberOptional: (key: string, defaultValue?: number) =>
      mockEnv[key] ? parseInt(mockEnv[key], 10) : defaultValue,
    getBoolean: (key: string) => mockEnv[key] === 'true',
    getBooleanOptional: (key: string, defaultValue?: boolean) =>
      mockEnv[key] ? mockEnv[key] === 'true' : defaultValue,
    getJSON: <T>(key: string): T => JSON.parse(mockEnv[key] || '{}') as T,
    getJSONOptional: <T>(key: string, defaultValue?: T): T | undefined =>
      mockEnv[key] ? (JSON.parse(mockEnv[key]) as T) : defaultValue,
    has: (key: string) => key in mockEnv,
    getAll: () => ({ ...mockEnv }),
  };
}

function createMockDb(): Db {
  return {
    query: async (): Promise<any> => ({}),
    transaction: async (): Promise<any[]> => [],
    queryWithRetry: async (): Promise<any> => ({}),
    ping: async () => true,
    getStatus: async () => ({
      connected: true,
      latency: 10,
      activeConnections: 1,
      poolSize: 10,
    }),
  };
}

function createMockHttp(): Http {
  const mockResponse = <T>(data: T): HttpResponse<T> => ({
    status: 200,
    statusText: 'OK',
    headers: {},
    data,
    url: 'http://mock-url.com',
    duration: 100,
  });

  return {
    request: async <T>(): Promise<HttpResponse<T>> => mockResponse({} as T),
    get: async <T>(): Promise<HttpResponse<T>> => mockResponse({} as T),
    post: async <T>(): Promise<HttpResponse<T>> => mockResponse({} as T),
    put: async <T>(): Promise<HttpResponse<T>> => mockResponse({} as T),
    patch: async <T>(): Promise<HttpResponse<T>> => mockResponse({} as T),
    delete: async <T>(): Promise<HttpResponse<T>> => mockResponse({} as T),
    ping: async () => true,
  };
}

function createMockFiles(): Files {
  return {
    readText: async () => 'mock content',
    readBinary: async () => new Uint8Array([1, 2, 3]),
    writeText: async () => {},
    writeBinary: async () => {},
    appendText: async () => {},
    exists: async () => true,
    getMetadata: async (path: string): Promise<FileMetadata> => ({
      path,
      size: 100,
      createdAt: new Date(),
      modifiedAt: new Date(),
      isDirectory: false,
      isFile: true,
      permissions: 'rw-r--r--',
    }),
    listDirectory: async () => ['file1.txt', 'file2.txt'],
    createDirectory: async () => {},
    delete: async () => {},
    copy: async () => {},
    move: async () => {},
  };
}

function createMockExternal(): External {
  return {
    publish: async (): Promise<string> => 'mock-event-id',
    subscribe: async (): Promise<EventSubscription> => ({
      id: 'mock-subscription-id',
      eventTypes: ['test'],
      active: true,
      createdAt: new Date(),
    }),
    unsubscribe: async () => {},
    getSubscriptions: async () => [],
    getEventHistory: async () => [],
    ping: async () => true,
  };
}

// ===== UTILITY TYPES =====

/**
 * Extract the data type from an HttpResponse
 */
export type ExtractHttpData<T> = T extends HttpResponse<infer U> ? U : never;

/**
 * Extract the input type from a DbQuery
 */
export type ExtractDbInput<T> = T extends DbQuery<infer U, any> ? U : never;

/**
 * Extract the output type from a DbQuery
 */
export type ExtractDbOutput<T> = T extends DbQuery<any, infer U> ? U : never;

/**
 * Extract the event data type from an ExternalEvent
 */
export type ExtractEventData<T> = T extends ExternalEvent<infer U> ? U : never;

// ===== ERROR TYPES =====

/**
 * Base error for all port-related errors
 */
export abstract class PortError extends Error {
  abstract readonly code: string;
  abstract readonly port: keyof Ports;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Clock-related errors
 */
export class ClockError extends PortError {
  readonly code = 'CLOCK_ERROR';
  readonly port = 'clock' as const;
}

/**
 * Environment-related errors
 */
export class EnvError extends PortError {
  readonly code = 'ENV_ERROR';
  readonly port = 'env' as const;
}

/**
 * Database-related errors
 */
export class DbError extends PortError {
  readonly code = 'DB_ERROR';
  readonly port = 'db' as const;
}

/**
 * HTTP-related errors
 */
export class HttpError extends PortError {
  readonly code = 'HTTP_ERROR';
  readonly port = 'http' as const;

  constructor(
    message: string,
    public readonly status?: number,
    public readonly response?: HttpResponse,
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

/**
 * File system-related errors
 */
export class FilesError extends PortError {
  readonly code = 'FILES_ERROR';
  readonly port = 'files' as const;
}

/**
 * External events-related errors
 */
export class ExternalError extends PortError {
  readonly code = 'EXTERNAL_ERROR';
  readonly port = 'external' as const;
}
