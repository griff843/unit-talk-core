import { RawFeedData, ProcessedFeedItem, DeduplicationResult } from './types.js';

/**
 * Generate unique ID for a feed item
 * Pure function - deterministic ID generation
 */
export function generateItemId(
  item: RawFeedData,
  timestamp = new Date()
): string {
  const source = item.source || 'unknown';
  const type = item.type || 'unknown';
  const contentHash = calculateContentHash(item.content || item.title || '');
  const timeComponent = timestamp.getTime().toString(36);
  
  return `feed-${source}-${type}-${timeComponent}-${contentHash.substring(0, 8)}`;
}

/**
 * Calculate hash of content for deduplication
 * Pure function - content hashing
 */
export function calculateContentHash(content: string): string {
  if (!content) return '00000000';
  
  // Simple hash function (in production, use crypto.createHash)
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Deduplicate processed feed items
 * Pure function - content-based deduplication
 */
export function deduplicateItems(
  items: ProcessedFeedItem[],
  similarityThreshold = 0.8
): DeduplicationResult {
  const uniqueItems: ProcessedFeedItem[] = [];
  const duplicateItems: Array<{
    item: ProcessedFeedItem;
    duplicateOf: string;
    similarity: number;
  }> = [];
  
  const contentMap = new Map<string, ProcessedFeedItem>();
  
  for (const item of items) {
    const content = extractContentSignature(item);
    const contentHash = calculateContentHash(content);
    
    // Check for exact match first
    if (contentMap.has(contentHash)) {
      const original = contentMap.get(contentHash)!;
      duplicateItems.push({
        item,
        duplicateOf: original.id,
        similarity: 1.0,
      });
      continue;
    }
    
    // Check for similar content
    let isDuplicate = false;
    for (const [, existingItem] of contentMap) {
      const existingContent = extractContentSignature(existingItem);
      const similarity = calculateContentSimilarity(content, existingContent);
      
      if (similarity >= similarityThreshold) {
        duplicateItems.push({
          item,
          duplicateOf: existingItem.id,
          similarity,
        });
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      uniqueItems.push(item);
      contentMap.set(contentHash, item);
    }
  }
  
  return {
    uniqueItems,
    duplicateItems,
    statistics: {
      totalInput: items.length,
      unique: uniqueItems.length,
      duplicates: duplicateItems.length,
      deduplicationRate: items.length > 0 ? duplicateItems.length / items.length : 0,
    },
  };
}

/**
 * Extract content signature for comparison
 * Pure function - content extraction
 */
export function extractContentSignature(item: ProcessedFeedItem): string {
  // Try multiple fields to create content signature
  const content = item.payload.content as string || '';
  const title = item.payload.title as string || '';
  const description = item.payload.description as string || '';
  
  // Combine available content fields
  const combined = [title, description, content]
    .filter(text => text && text.length > 0)
    .join(' ');
  
  if (!combined) {
    return item.source + ':' + item.type; // Fallback to source+type
  }
  
  // Normalize for comparison
  return combined
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity between two content strings
 * Pure function - Jaccard similarity
 */
export function calculateContentSimilarity(
  content1: string,
  content2: string
): number {
  if (content1 === content2) return 1.0;
  if (!content1 || !content2) return 0.0;
  
  // Tokenize into words (minimum 3 characters)
  const words1 = new Set(
    content1.split(' ').filter(word => word.length >= 3)
  );
  const words2 = new Set(
    content2.split(' ').filter(word => word.length >= 3)
  );
  
  if (words1.size === 0 && words2.size === 0) return 1.0;
  if (words1.size === 0 || words2.size === 0) return 0.0;
  
  // Calculate Jaccard similarity (intersection / union)
  const intersection = new Set(
    [...words1].filter(word => words2.has(word))
  );
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Sort feed items by priority/quality
 * Pure function - priority sorting
 */
export function sortByPriority(
  items: ProcessedFeedItem[]
): ProcessedFeedItem[] {
  return [...items].sort((a, b) => {
    // Primary sort: processing score (higher = better)
    if (a.processingScore !== b.processingScore) {
      return b.processingScore - a.processingScore;
    }
    
    // Secondary sort: timestamp (newer = better)
    return b.insertedAt.getTime() - a.insertedAt.getTime();
  });
}

/**
 * Filter items by quality threshold
 * Pure function - quality filtering
 */
export function filterByQuality(
  items: ProcessedFeedItem[],
  minScore: number
): ProcessedFeedItem[] {
  return items.filter(item => item.processingScore >= minScore);
}

/**
 * Group items by source
 * Pure function - grouping utility
 */
export function groupBySource(
  items: ProcessedFeedItem[]
): Map<string, ProcessedFeedItem[]> {
  const groups = new Map<string, ProcessedFeedItem[]>();
  
  for (const item of items) {
    const existing = groups.get(item.source) || [];
    existing.push(item);
    groups.set(item.source, existing);
  }
  
  return groups;
}

/**
 * Batch items for processing
 * Pure function - batching utility
 */
export function createBatches<T>(
  items: T[],
  batchSize: number
): T[][] {
  const batches: T[][] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  
  return batches;
}

/**
 * Validate processing result consistency
 * Pure function - result validation
 */
export function validateProcessingResult(
  totalInput: number,
  processed: number,
  rejected: number
): boolean {
  // Basic consistency check
  if (processed + rejected !== totalInput) {
    return false;
  }
  
  // Sanity checks
  if (processed < 0 || rejected < 0 || totalInput < 0) {
    return false;
  }
  
  return true;
}

/**
 * Create processing statistics summary
 * Pure function - statistics calculation
 */
export function createStatisticsSummary(
  items: ProcessedFeedItem[]
): {
  totalItems: number;
  averageScore: number;
  scoreDistribution: { range: string; count: number }[];
  sourceBreakdown: { source: string; count: number }[];
  typeBreakdown: { type: string; count: number }[];
} {
  if (items.length === 0) {
    return {
      totalItems: 0,
      averageScore: 0,
      scoreDistribution: [],
      sourceBreakdown: [],
      typeBreakdown: [],
    };
  }
  
  const totalItems = items.length;
  const averageScore = items.reduce((sum, item) => sum + item.processingScore, 0) / totalItems;
  
  // Score distribution
  const scoreRanges = [
    { range: '0.0-0.2', min: 0.0, max: 0.2 },
    { range: '0.2-0.4', min: 0.2, max: 0.4 },
    { range: '0.4-0.6', min: 0.4, max: 0.6 },
    { range: '0.6-0.8', min: 0.6, max: 0.8 },
    { range: '0.8-1.0', min: 0.8, max: 1.0 },
  ];
  
  const scoreDistribution = scoreRanges.map(range => ({
    range: range.range,
    count: items.filter(item => 
      item.processingScore >= range.min && item.processingScore < range.max
    ).length,
  }));
  
  // Source breakdown
  const sourceCounts = new Map<string, number>();
  items.forEach(item => {
    sourceCounts.set(item.source, (sourceCounts.get(item.source) || 0) + 1);
  });
  
  const sourceBreakdown = Array.from(sourceCounts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
  
  // Type breakdown
  const typeCounts = new Map<string, number>();
  items.forEach(item => {
    typeCounts.set(item.type, (typeCounts.get(item.type) || 0) + 1);
  });
  
  const typeBreakdown = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  
  return {
    totalItems,
    averageScore: Number(averageScore.toFixed(3)),
    scoreDistribution,
    sourceBreakdown,
    typeBreakdown,
  };
}