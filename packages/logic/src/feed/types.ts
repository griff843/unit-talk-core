import { z } from 'zod';

/**
 * Raw feed data before processing
 */
export const RawFeedDataSchema = z.object({
  source: z.string().min(1, 'Source is required'),
  type: z.string().min(1, 'Type is required'),
  content: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  url: z.string().url().optional(),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type RawFeedData = z.infer<typeof RawFeedDataSchema>;

/**
 * Processed feed item ready for raw_props insertion
 */
export interface ProcessedFeedItem {
  readonly id: string; // Generated unique ID
  readonly source: string;
  readonly type: string;
  readonly payload: Record<string, unknown>; // Enriched data for raw_props.data
  readonly insertedAt: Date;
  readonly processingScore: number; // Quality/priority score (0-1)
  readonly metadata: {
    readonly originalTimestamp?: string;
    readonly processingVersion: string;
    readonly enrichmentFlags: string[];
  };
}

/**
 * Feed processing configuration
 */
export interface FeedProcessingConfig {
  readonly enableContentNormalization: boolean;
  readonly enableDeduplication: boolean;
  readonly maxContentLength: number;
  readonly requiredFields: string[];
  readonly allowedSources: string[];
  readonly blockedSources: string[];
  readonly qualityThresholds: {
    readonly minContentLength: number;
    readonly minFieldCompleteness: number;
  };
  readonly enrichment: {
    readonly addTimestamps: boolean;
    readonly normalizeUrls: boolean;
    readonly extractKeywords: boolean;
  };
}

/**
 * Feed processing result
 */
export interface FeedProcessingResult {
  readonly processedItems: ProcessedFeedItem[];
  readonly rejectedItems: Array<{
    readonly item: RawFeedData;
    readonly reason: string;
    readonly validationErrors?: string[];
  }>;
  readonly statistics: {
    readonly totalInput: number;
    readonly processed: number;
    readonly rejected: number;
    readonly averageProcessingScore: number;
    readonly enrichmentApplied: number;
  };
  readonly metadata: {
    readonly processingStarted: Date;
    readonly processingCompleted: Date;
    readonly configUsed: FeedProcessingConfig;
    readonly processingVersion: string;
  };
}

/**
 * Feed source configuration
 */
export interface FeedSourceConfig {
  readonly sourceId: string;
  readonly enabled: boolean;
  readonly priority: number; // 1-10, higher = more important
  readonly rateLimit: {
    readonly maxItemsPerMinute: number;
    readonly maxItemsPerHour: number;
  };
  readonly validation: {
    readonly strictMode: boolean;
    readonly requiredFields: string[];
    readonly allowedTypes: string[];
  };
  readonly processing: {
    readonly enableNormalization: boolean;
    readonly enableEnrichment: boolean;
    readonly customRules: string[];
  };
}

/**
 * Feed item deduplication result
 */
export interface DeduplicationResult {
  readonly uniqueItems: ProcessedFeedItem[];
  readonly duplicateItems: Array<{
    readonly item: ProcessedFeedItem;
    readonly duplicateOf: string; // ID of the original item
    readonly similarity: number; // 0-1 similarity score
  }>;
  readonly statistics: {
    readonly totalInput: number;
    readonly unique: number;
    readonly duplicates: number;
    readonly deduplicationRate: number;
  };
}

/**
 * Content normalization result
 */
export interface ContentNormalizationResult {
  readonly normalizedContent: string;
  readonly originalLength: number;
  readonly normalizedLength: number;
  readonly transformationsApplied: string[];
  readonly qualityScore: number; // 0-1
}

/**
 * Feed processing errors
 */
export class FeedProcessingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly sourceItem?: RawFeedData,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FeedProcessingError';
  }
}

// Constants for feed processing
export const FEED_CONSTANTS = {
  DEFAULT_MAX_CONTENT_LENGTH: 10000,
  DEFAULT_MIN_CONTENT_LENGTH: 10,
  DEFAULT_MIN_FIELD_COMPLETENESS: 0.6,
  DEFAULT_PROCESSING_VERSION: '1.0.0',
  DEFAULT_DEDUPLICATION_THRESHOLD: 0.8,
  SUPPORTED_CONTENT_TYPES: [
    'news',
    'analysis',
    'prediction',
    'market_data',
    'social_sentiment',
    'technical_analysis',
  ] as const,
  REQUIRED_FIELDS: ['source', 'type'] as const,
  ENRICHMENT_FLAGS: [
    'timestamp_added',
    'content_normalized',
    'keywords_extracted',
    'quality_scored',
    'deduplication_checked',
  ] as const,
} as const;

// Re-export for convenience
export type SupportedContentType = typeof FEED_CONSTANTS.SUPPORTED_CONTENT_TYPES[number];
export type EnrichmentFlag = typeof FEED_CONSTANTS.ENRICHMENT_FLAGS[number];