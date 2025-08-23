import {
  RawFeedData,
  ProcessedFeedItem,
  FeedProcessingConfig,
  FeedProcessingResult,
  ContentNormalizationResult,
  FeedProcessingError,
  FEED_CONSTANTS,
} from './types.js';
import { generateItemId, calculateContentHash } from './utils.js';

/**
 * Process raw feed data into structured items ready for raw_props insertion
 * Pure function - no I/O operations
 */
export function processFeedData(
  rawItems: RawFeedData[],
  config: FeedProcessingConfig,
  currentTime = new Date()
): FeedProcessingResult {
  const processingStarted = currentTime;
  const processedItems: ProcessedFeedItem[] = [];
  const rejectedItems: Array<{
    item: RawFeedData;
    reason: string;
    validationErrors?: string[];
  }> = [];
  
  let totalEnrichmentApplied = 0;
  
  for (const rawItem of rawItems) {
    try {
      // Step 1: Validate required fields
      const validationErrors = validateFeedItem(rawItem, config);
      if (validationErrors.length > 0) {
        rejectedItems.push({
          item: rawItem,
          reason: 'Validation failed',
          validationErrors,
        });
        continue;
      }
      
      // Step 2: Source filtering
      if (!isSourceAllowed(rawItem.source, config)) {
        rejectedItems.push({
          item: rawItem,
          reason: `Source '${rawItem.source}' not allowed`,
        });
        continue;
      }
      
      // Step 3: Content processing and normalization
      const normalizedContent = config.enableContentNormalization
        ? normalizeContent(rawItem.content || '', config)
        : { 
            normalizedContent: rawItem.content || '',
            originalLength: rawItem.content?.length || 0,
            normalizedLength: rawItem.content?.length || 0,
            transformationsApplied: [],
            qualityScore: 1.0,
          };
      
      // Step 4: Quality scoring
      const processingScore = calculateProcessingScore(rawItem, normalizedContent, config);
      
      // Step 5: Enrichment
      const enrichmentFlags: string[] = [];
      let enrichedPayload = {
        ...rawItem,
        content: normalizedContent.normalizedContent,
      };
      
      if (config.enrichment.addTimestamps) {
        enrichedPayload.processing_timestamp = currentTime.toISOString();
        enrichmentFlags.push('timestamp_added');
        totalEnrichmentApplied++;
      }
      
      if (config.enrichment.normalizeUrls && rawItem.url) {
        enrichedPayload.normalized_url = normalizeUrl(rawItem.url);
        enrichmentFlags.push('url_normalized');
      }
      
      if (config.enrichment.extractKeywords) {
        enrichedPayload.extracted_keywords = extractKeywords(normalizedContent.normalizedContent);
        enrichmentFlags.push('keywords_extracted');
      }
      
      // Add processing metadata
      enrichedPayload.processing_metadata = {
        quality_score: processingScore,
        content_hash: calculateContentHash(normalizedContent.normalizedContent),
        processing_version: FEED_CONSTANTS.DEFAULT_PROCESSING_VERSION,
        transformations_applied: normalizedContent.transformationsApplied,
      };
      
      // Step 6: Create processed item
      const processedItem: ProcessedFeedItem = {
        id: generateItemId(rawItem, currentTime),
        source: rawItem.source,
        type: rawItem.type,
        payload: enrichedPayload,
        insertedAt: currentTime,
        processingScore,
        metadata: {
          originalTimestamp: rawItem.timestamp,
          processingVersion: FEED_CONSTANTS.DEFAULT_PROCESSING_VERSION,
          enrichmentFlags,
        },
      };
      
      processedItems.push(processedItem);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      rejectedItems.push({
        item: rawItem,
        reason: `Processing error: ${errorMessage}`,
      });
    }
  }
  
  // Calculate statistics
  const averageProcessingScore = processedItems.length > 0
    ? processedItems.reduce((sum, item) => sum + item.processingScore, 0) / processedItems.length
    : 0;
  
  const result: FeedProcessingResult = {
    processedItems,
    rejectedItems,
    statistics: {
      totalInput: rawItems.length,
      processed: processedItems.length,
      rejected: rejectedItems.length,
      averageProcessingScore: Number(averageProcessingScore.toFixed(3)),
      enrichmentApplied: totalEnrichmentApplied,
    },
    metadata: {
      processingStarted,
      processingCompleted: new Date(currentTime.getTime() + 1), // Simulate processing time
      configUsed: config,
      processingVersion: FEED_CONSTANTS.DEFAULT_PROCESSING_VERSION,
    },
  };
  
  return result;
}

/**
 * Create default feed processing configuration
 * Pure function - no environment dependencies
 */
export function createDefaultFeedConfig(
  overrides: Partial<FeedProcessingConfig> = {}
): FeedProcessingConfig {
  return {
    enableContentNormalization: overrides.enableContentNormalization ?? true,
    enableDeduplication: overrides.enableDeduplication ?? true,
    maxContentLength: overrides.maxContentLength ?? FEED_CONSTANTS.DEFAULT_MAX_CONTENT_LENGTH,
    requiredFields: overrides.requiredFields ?? [...FEED_CONSTANTS.REQUIRED_FIELDS],
    allowedSources: overrides.allowedSources ?? [],
    blockedSources: overrides.blockedSources ?? [],
    qualityThresholds: {
      minContentLength: FEED_CONSTANTS.DEFAULT_MIN_CONTENT_LENGTH,
      minFieldCompleteness: FEED_CONSTANTS.DEFAULT_MIN_FIELD_COMPLETENESS,
      ...overrides.qualityThresholds,
    },
    enrichment: {
      addTimestamps: true,
      normalizeUrls: true,
      extractKeywords: false, // Expensive operation, disabled by default
      ...overrides.enrichment,
    },
  };
}

/**
 * Validate feed item against configuration requirements
 * Pure function - validation logic only
 */
function validateFeedItem(
  item: RawFeedData,
  config: FeedProcessingConfig
): string[] {
  const errors: string[] = [];
  
  // Check required fields
  for (const field of config.requiredFields) {
    if (!item[field as keyof RawFeedData]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Check content length limits
  const content = item.content || '';
  if (content.length > config.maxContentLength) {
    errors.push(`Content exceeds maximum length: ${content.length} > ${config.maxContentLength}`);
  }
  
  if (content.length > 0 && content.length < config.qualityThresholds.minContentLength) {
    errors.push(`Content below minimum length: ${content.length} < ${config.qualityThresholds.minContentLength}`);
  }
  
  // Check type validity
  if (item.type && !FEED_CONSTANTS.SUPPORTED_CONTENT_TYPES.includes(item.type as any)) {
    errors.push(`Unsupported content type: ${item.type}`);
  }
  
  // Check URL format if present
  if (item.url) {
    try {
      new URL(item.url);
    } catch {
      errors.push(`Invalid URL format: ${item.url}`);
    }
  }
  
  return errors;
}

/**
 * Check if source is allowed based on configuration
 * Pure function - source filtering logic
 */
function isSourceAllowed(
  source: string,
  config: FeedProcessingConfig
): boolean {
  // Check blocked sources first
  if (config.blockedSources.includes(source)) {
    return false;
  }
  
  // If allowedSources is specified, source must be in the list
  if (config.allowedSources.length > 0) {
    return config.allowedSources.includes(source);
  }
  
  // If no allowed sources specified, all sources are allowed (except blocked)
  return true;
}

/**
 * Normalize content for consistency and quality
 * Pure function - text processing
 */
function normalizeContent(
  content: string,
  config: FeedProcessingConfig
): ContentNormalizationResult {
  if (!content) {
    return {
      normalizedContent: '',
      originalLength: 0,
      normalizedLength: 0,
      transformationsApplied: [],
      qualityScore: 0,
    };
  }
  
  const originalLength = content.length;
  let normalized = content;
  const transformationsApplied: string[] = [];
  
  // Remove excessive whitespace
  const beforeWhitespace = normalized;
  normalized = normalized.replace(/\s+/g, ' ').trim();
  if (normalized !== beforeWhitespace) {
    transformationsApplied.push('whitespace_normalized');
  }
  
  // Remove HTML tags if present
  const beforeHtml = normalized;
  normalized = normalized.replace(/<[^>]*>/g, '');
  if (normalized !== beforeHtml) {
    transformationsApplied.push('html_stripped');
  }
  
  // Truncate if too long
  if (normalized.length > config.maxContentLength) {
    normalized = normalized.substring(0, config.maxContentLength - 3) + '...';
    transformationsApplied.push('truncated');
  }
  
  // Calculate quality score based on content characteristics
  const qualityScore = calculateContentQuality(normalized);
  
  return {
    normalizedContent: normalized,
    originalLength,
    normalizedLength: normalized.length,
    transformationsApplied,
    qualityScore,
  };
}

/**
 * Calculate processing score for prioritization
 * Pure function - scoring algorithm
 */
function calculateProcessingScore(
  item: RawFeedData,
  normalizedContent: ContentNormalizationResult,
  config: FeedProcessingConfig
): number {
  let score = 0;
  const weights = { content: 0.4, completeness: 0.3, source: 0.2, freshness: 0.1 };
  
  // Content quality (0.4 weight)
  score += normalizedContent.qualityScore * weights.content;
  
  // Field completeness (0.3 weight)
  const totalFields = ['source', 'type', 'content', 'title', 'description', 'url', 'timestamp'];
  const presentFields = totalFields.filter(field => item[field as keyof RawFeedData]);
  const completeness = presentFields.length / totalFields.length;
  score += completeness * weights.completeness;
  
  // Source quality (0.2 weight) - basic heuristic
  const sourceQuality = item.source.includes('official') ? 1.0 :
                       item.source.includes('verified') ? 0.8 :
                       item.source.includes('trusted') ? 0.6 : 0.5;
  score += sourceQuality * weights.source;
  
  // Freshness (0.1 weight)
  const freshnessScore = item.timestamp ? 
    calculateFreshnessScore(new Date(item.timestamp)) : 0.5;
  score += freshnessScore * weights.freshness;
  
  return Math.min(1.0, Math.max(0, score));
}

// Helper functions (pure)

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove tracking parameters
    const cleanParams = new URLSearchParams();
    for (const [key, value] of parsed.searchParams) {
      if (!key.startsWith('utm_') && !key.startsWith('ref_')) {
        cleanParams.set(key, value);
      }
    }
    parsed.search = cleanParams.toString();
    return parsed.toString();
  } catch {
    return url; // Return original if parsing fails
  }
}

function extractKeywords(content: string): string[] {
  // Simple keyword extraction (in production, use more sophisticated NLP)
  const words = content.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  // Count word frequency and return top keywords
  const wordCount = new Map<string, number>();
  words.forEach(word => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  });
  
  return Array.from(wordCount.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word);
}

function calculateContentQuality(content: string): number {
  if (!content) return 0;
  
  let score = 0;
  
  // Length factor (sweet spot around 100-1000 chars)
  const lengthScore = content.length < 50 ? content.length / 50 :
                     content.length > 1000 ? Math.max(0.5, 1 - (content.length - 1000) / 5000) :
                     1.0;
  score += lengthScore * 0.3;
  
  // Sentence structure (presence of punctuation)
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceScore = Math.min(1, sentences.length / 3);
  score += sentenceScore * 0.2;
  
  // Word diversity
  const words = content.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words);
  const diversityScore = words.length > 0 ? uniqueWords.size / words.length : 0;
  score += diversityScore * 0.3;
  
  // No excessive repetition
  const repetitionPenalty = detectRepetition(content);
  score += (1 - repetitionPenalty) * 0.2;
  
  return Math.min(1.0, Math.max(0, score));
}

function detectRepetition(content: string): number {
  const words = content.toLowerCase().split(/\s+/);
  if (words.length < 10) return 0;
  
  const wordCount = new Map<string, number>();
  words.forEach(word => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  });
  
  const maxCount = Math.max(...wordCount.values());
  return Math.min(1, (maxCount - 3) / words.length); // Penalize if any word appears > 3 times
}

function calculateFreshnessScore(timestamp: Date): number {
  const now = new Date();
  const ageHours = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
  
  // Fresh content scores higher
  if (ageHours <= 1) return 1.0;
  if (ageHours <= 6) return 0.9;
  if (ageHours <= 24) return 0.7;
  if (ageHours <= 72) return 0.5;
  return 0.3;
}