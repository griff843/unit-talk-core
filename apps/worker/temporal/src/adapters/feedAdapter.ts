/**
 * Feed Adapter - Bridges pure feed logic with I/O operations
 * ONLY handles raw_props operations (no unified_picks writes)
 * This adapter is responsible for ingestion and processing steps only
 */

import { createAnonClient } from '@unit-talk/db';
import type {
  RawFeedData,
  ProcessedFeedItem,
  FeedProcessingConfig} from '@unit-talk/logic';
import {
  processFeedData,
  createDefaultFeedConfig,
  deduplicateItems,
  filterByQuality,
  sortByPriority,
} from '@unit-talk/logic';
import { logger } from '@unit-talk/observability';

/**
 * Feed adapter configuration
 */
export interface FeedAdapterConfig {
  processingConfig?: Partial<FeedProcessingConfig>;
  enableDeduplication?: boolean;
  minQualityScore?: number;
  batchSize?: number;
  maxItemsPerRun?: number;
  dryRun?: boolean; // For testing - don't actually insert
}

/**
 * Feed operation result
 */
export interface FeedOperationResult {
  success: boolean;
  ingested: number;
  processed: number;
  rejected: number;
  duplicatesRemoved: number;
  error?: string;
  insertedIds?: string[];
  metadata: {
    totalInput: number;
    averageQualityScore: number;
    processingDuration: number;
    batchesProcessed: number;
    configUsed: FeedProcessingConfig;
  };
}

/**
 * Sample feed data for testing
 */
const SAMPLE_FEED_DATA: RawFeedData[] = [
  {
    source: 'official',
    type: 'news',
    title: 'Market Analysis Update',
    content:
      'Comprehensive analysis of current market trends and predictions for the next quarter. Key indicators show positive momentum in technology sectors.',
    url: 'https://example.com/market-analysis-2025',
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
    metadata: {
      priority: 'high',
      category: 'market',
    },
  },
  {
    source: 'verified',
    type: 'analysis',
    title: 'Technical Indicators Report',
    content:
      'Detailed technical analysis covering moving averages, RSI indicators, and volume patterns across major indices.',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
    metadata: {
      priority: 'medium',
      category: 'technical',
    },
  },
  {
    source: 'trusted',
    type: 'prediction',
    title: 'Q1 2025 Forecast',
    content:
      'Economic forecast for Q1 2025 based on current indicators and historical patterns. Expect moderate growth with some volatility.',
    timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 minutes ago
    metadata: {
      priority: 'medium',
      category: 'forecast',
    },
  },
  {
    source: 'community',
    type: 'social_sentiment',
    title: 'Social Media Sentiment',
    content:
      'Aggregated sentiment analysis from social media platforms showing positive outlook on technology investments.',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
    metadata: {
      priority: 'low',
      category: 'sentiment',
    },
  },
];

/**
 * Execute feed workflow - ingestion and processing only
 * Does NOT write to unified_picks (that's the Promoter's job)
 */
export async function executeFeedWorkflow(
  config: FeedAdapterConfig = {},
  feedData?: RawFeedData[]
): Promise<FeedOperationResult> {
  const startTime = Date.now();

  try {
    logger.info('Starting feed workflow', {
      config,
      feedDataProvided: !!feedData,
    });

    // Step 1: Get feed data (use provided data or sample data)
    const rawFeedData = feedData || SAMPLE_FEED_DATA;

    if (rawFeedData.length === 0) {
      logger.info('No feed data to process');
      return {
        success: true,
        ingested: 0,
        processed: 0,
        rejected: 0,
        duplicatesRemoved: 0,
        metadata: {
          totalInput: 0,
          averageQualityScore: 0,
          processingDuration: Date.now() - startTime,
          batchesProcessed: 0,
          configUsed: createDefaultFeedConfig(),
        },
      };
    }

    // Step 2: Create processing configuration
    const processingConfig = createDefaultFeedConfig(config.processingConfig);

    // Step 3: Process raw feed data using pure logic
    const processingResult = processFeedData(rawFeedData, processingConfig);

    logger.debug('Feed processing completed', {
      processed: processingResult.statistics.processed,
      rejected: processingResult.statistics.rejected,
      averageScore: processingResult.statistics.averageProcessingScore,
    });

    let finalItems = processingResult.processedItems;
    let duplicatesRemoved = 0;

    // Step 4: Optional deduplication
    if (config.enableDeduplication !== false) {
      const deduplicationResult = deduplicateItems(finalItems);
      finalItems = deduplicationResult.uniqueItems;
      duplicatesRemoved = deduplicationResult.duplicateItems.length;

      logger.debug('Deduplication completed', {
        unique: deduplicationResult.statistics.unique,
        duplicates: duplicatesRemoved,
      });
    }

    // Step 5: Quality filtering
    const minQualityScore = config.minQualityScore ?? 0.3;
    const qualityFiltered = filterByQuality(finalItems, minQualityScore);

    // Step 6: Sort by priority
    const sortedItems = sortByPriority(qualityFiltered);

    // Step 7: Apply limits
    const maxItems = config.maxItemsPerRun ?? 50;
    const limitedItems = sortedItems.slice(0, maxItems);

    logger.info('Feed processing pipeline completed', {
      totalInput: rawFeedData.length,
      processed: processingResult.statistics.processed,
      afterDedup: finalItems.length,
      afterQualityFilter: qualityFiltered.length,
      final: limitedItems.length,
    });

    let insertedIds: string[] = [];

    // Step 8: Insert into raw_props (ONLY raw_props, never unified_picks)
    if (limitedItems.length > 0 && !config.dryRun) {
      insertedIds = await insertItemsToRawProps(limitedItems, config.batchSize);

      // Step 9: Mark items as processed (simulate processing step)
      await markItemsAsProcessed(insertedIds);

      logger.info('Items inserted and marked as processed', {
        inserted: insertedIds.length,
      });
    } else if (config.dryRun) {
      logger.info('DRY RUN - Would have inserted items', {
        count: limitedItems.length,
      });
      insertedIds = limitedItems.map(item => `dry-run-${item.id}`);
    }

    // Calculate final statistics
    const averageQualityScore =
      limitedItems.length > 0
        ? limitedItems.reduce((sum, item) => sum + item.processingScore, 0) /
          limitedItems.length
        : 0;

    const result: FeedOperationResult = {
      success: true,
      ingested: insertedIds.length,
      processed: insertedIds.length, // Same as ingested since we mark as processed immediately
      rejected: processingResult.statistics.rejected,
      duplicatesRemoved,
      insertedIds,
      metadata: {
        totalInput: rawFeedData.length,
        averageQualityScore: Number(averageQualityScore.toFixed(3)),
        processingDuration: Date.now() - startTime,
        batchesProcessed: Math.ceil(
          limitedItems.length / (config.batchSize ?? 10)
        ),
        configUsed: processingConfig,
      },
    };

    logger.info('Feed workflow completed successfully', {
      ingested: result.ingested,
      processed: result.processed,
      rejected: result.rejected,
      duration: result.metadata.processingDuration,
    });

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Feed workflow failed', { error: errorMessage });

    return {
      success: false,
      ingested: 0,
      processed: 0,
      rejected: 0,
      duplicatesRemoved: 0,
      error: errorMessage,
      metadata: {
        totalInput: 0,
        averageQualityScore: 0,
        processingDuration: Date.now() - startTime,
        batchesProcessed: 0,
        configUsed: createDefaultFeedConfig(),
      },
    };
  }
}

/**
 * Insert processed items into raw_props table
 * ONLY handles raw_props - never touches unified_picks
 */
async function insertItemsToRawProps(
  items: ProcessedFeedItem[],
  batchSize = 10
): Promise<string[]> {
  const client = createAnonClient();
  const insertedIds: string[] = [];

  try {
    // Process in batches to avoid overwhelming the database
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const insertData = batch.map(item => ({
        data: item.payload, // Store the enriched payload
        // Note: inserted_at and processed_at will be set by the database/update
      }));

      const { data, error } = await client
        .from('raw_props')
        .insert(insertData)
        .select('id');

      if (error) {
        throw new Error(`Failed to insert batch: ${error.message}`);
      }

      if (data) {
        const batchIds = data.map((row: any) => row.id);
        insertedIds.push(...batchIds);

        logger.debug('Batch inserted successfully', {
          batchSize: batch.length,
          batchIds: batchIds.length,
        });
      }
    }

    logger.info('All items inserted to raw_props', {
      totalInserted: insertedIds.length,
      batches: Math.ceil(items.length / batchSize),
    });

    return insertedIds;
  } catch (error) {
    logger.error('Failed to insert items to raw_props', {
      error: error instanceof Error ? error.message : String(error),
      attemptedCount: items.length,
      successfulCount: insertedIds.length,
    });
    throw error;
  }
}

/**
 * Mark items as processed in raw_props table
 * Simulates the processing step that would normally be done by a separate processor
 */
async function markItemsAsProcessed(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;

  const client = createAnonClient();

  try {
    const { error } = await client
      .from('raw_props')
      .update({ processed_at: new Date().toISOString() })
      .in('id', itemIds);

    if (error) {
      throw new Error(`Failed to mark items as processed: ${error.message}`);
    }

    logger.debug('Items marked as processed', {
      count: itemIds.length,
    });
  } catch (error) {
    logger.error('Failed to mark items as processed', {
      error: error instanceof Error ? error.message : String(error),
      itemIds: itemIds.length,
    });
    throw error;
  }
}

/**
 * Get current raw_props statistics for monitoring
 * Read-only operation for pipeline health monitoring
 */
export async function getRawPropsStatistics(windowMinutes = 5): Promise<{
  raw_new: number;
  processed: number;
  unprocessed: number;
  window_start: string;
  window_end: string;
}> {
  const client = createAnonClient();
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - windowMinutes * 60 * 1000);

  try {
    // Count new items in window
    const { data: rawData, error: rawError } = await client
      .from('raw_props')
      .select('id', { count: 'exact', head: true })
      .gte('inserted_at', windowStart.toISOString());

    if (rawError) {
      throw new Error(`Failed to count raw items: ${rawError.message}`);
    }

    // Count processed items in window
    const { data: processedData, error: processedError } = await client
      .from('raw_props')
      .select('id', { count: 'exact', head: true })
      .not('processed_at', 'is', null)
      .gte('inserted_at', windowStart.toISOString());

    if (processedError) {
      throw new Error(
        `Failed to count processed items: ${processedError.message}`
      );
    }

    const rawCount = rawData?.length ?? 0;
    const processedCount = processedData?.length ?? 0;
    const unprocessedCount = rawCount - processedCount;

    return {
      raw_new: rawCount,
      processed: processedCount,
      unprocessed: Math.max(0, unprocessedCount),
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
    };
  } catch (error) {
    logger.error('Failed to get raw_props statistics', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Test feed adapter connection and functionality
 */
export async function testFeedAdapter(): Promise<boolean> {
  try {
    // Test basic statistics query
    const stats = await getRawPropsStatistics(60); // 1 hour window

    logger.debug('Feed adapter connection test successful', {
      rawItemsLastHour: stats.raw_new,
      processedLastHour: stats.processed,
    });

    return true;
  } catch (error) {
    logger.error('Feed adapter connection test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
