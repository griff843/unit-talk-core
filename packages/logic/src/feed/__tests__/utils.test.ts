import {
  generateItemId,
  calculateContentHash,
  deduplicateItems,
  extractContentSignature,
  calculateContentSimilarity,
  sortByPriority,
  filterByQuality,
} from '../utils.js';
import { ProcessedFeedItem } from '../types.js';

describe('Feed Utils', () => {
  const mockTime = new Date('2025-01-23T12:00:00Z');
  
  const createMockProcessedItem = (overrides: Partial<ProcessedFeedItem> = {}): ProcessedFeedItem => ({
    id: 'test-id',
    source: 'test_source',
    type: 'news',
    payload: {
      content: 'Test content',
      title: 'Test title',
    },
    insertedAt: mockTime,
    processingScore: 0.7,
    metadata: {
      processingVersion: '1.0.0',
      enrichmentFlags: [],
    },
    ...overrides,
  });

  describe('generateItemId', () => {
    it('should generate deterministic IDs for same input', () => {
      const item = {
        source: 'test_source',
        type: 'news',
        content: 'Same content',
      };
      
      const id1 = generateItemId(item, mockTime);
      const id2 = generateItemId(item, mockTime);
      
      expect(id1).toBe(id2);
      expect(id1).toContain('feed-test_source-news');
    });

    it('should generate different IDs for different content', () => {
      const item1 = { source: 'test', type: 'news', content: 'Content A' };
      const item2 = { source: 'test', type: 'news', content: 'Content B' };
      
      const id1 = generateItemId(item1, mockTime);
      const id2 = generateItemId(item2, mockTime);
      
      expect(id1).not.toBe(id2);
    });

    it('should handle missing content gracefully', () => {
      const item = { source: 'test', type: 'news' };
      
      const id = generateItemId(item, mockTime);
      
      expect(id).toContain('feed-test-news');
      expect(id).toBeDefined();
    });
  });

  describe('calculateContentHash', () => {
    it('should generate consistent hashes for same content', () => {
      const content = 'Test content for hashing';
      
      const hash1 = calculateContentHash(content);
      const hash2 = calculateContentHash(content);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(8);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = calculateContentHash('Content A');
      const hash2 = calculateContentHash('Content B');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty content', () => {
      const hash = calculateContentHash('');
      
      expect(hash).toBe('00000000');
    });
  });

  describe('deduplicateItems', () => {
    it('should remove exact duplicates', () => {
      const items = [
        createMockProcessedItem({ id: 'item1', payload: { content: 'Same content' } }),
        createMockProcessedItem({ id: 'item2', payload: { content: 'Same content' } }),
        createMockProcessedItem({ id: 'item3', payload: { content: 'Different content' } }),
      ];
      
      const result = deduplicateItems(items, 0.8);
      
      expect(result.uniqueItems).toHaveLength(2);
      expect(result.duplicateItems).toHaveLength(1);
      expect(result.statistics.deduplicationRate).toBeCloseTo(1/3);
    });

    it('should identify similar content based on threshold', () => {
      const items = [
        createMockProcessedItem({ 
          id: 'item1', 
          payload: { content: 'The quick brown fox jumps over lazy dog' } 
        }),
        createMockProcessedItem({ 
          id: 'item2', 
          payload: { content: 'The quick brown fox jumps over the lazy dog' } // Very similar
        }),
        createMockProcessedItem({ 
          id: 'item3', 
          payload: { content: 'Completely different content about cats' } 
        }),
      ];
      
      const result = deduplicateItems(items, 0.7); // Lower threshold to catch similar content
      
      expect(result.uniqueItems.length).toBeLessThan(3);
      expect(result.duplicateItems.length).toBeGreaterThan(0);
    });

    it('should handle empty input', () => {
      const result = deduplicateItems([], 0.8);
      
      expect(result.uniqueItems).toHaveLength(0);
      expect(result.duplicateItems).toHaveLength(0);
      expect(result.statistics.deduplicationRate).toBe(0);
    });
  });

  describe('extractContentSignature', () => {
    it('should extract content from available fields', () => {
      const item = createMockProcessedItem({
        payload: {
          title: 'Important Title',
          content: 'Detailed content here',
          description: 'Brief description',
        },
      });
      
      const signature = extractContentSignature(item);
      
      expect(signature).toContain('important title');
      expect(signature).toContain('detailed content');
      expect(signature).toContain('brief description');
    });

    it('should fallback to source+type when no content available', () => {
      const item = createMockProcessedItem({
        source: 'fallback_source',
        type: 'fallback_type',
        payload: {},
      });
      
      const signature = extractContentSignature(item);
      
      expect(signature).toBe('fallback_source:fallback_type');
    });

    it('should normalize content for consistent comparison', () => {
      const item = createMockProcessedItem({
        payload: {
          content: '  Mixed CASE content!!!   with-punctuation  ',
        },
      });
      
      const signature = extractContentSignature(item);
      
      expect(signature).toBe('mixed case content with punctuation');
    });
  });

  describe('calculateContentSimilarity', () => {
    it('should return 1.0 for identical content', () => {
      const content = 'identical content for testing';
      const similarity = calculateContentSimilarity(content, content);
      
      expect(similarity).toBe(1.0);
    });

    it('should return 0.0 for completely different content', () => {
      const content1 = 'completely different words here';
      const content2 = 'totally unrelated content about something else';
      
      const similarity = calculateContentSimilarity(content1, content2);
      
      expect(similarity).toBeLessThan(0.3);
    });

    it('should return high similarity for overlapping content', () => {
      const content1 = 'the quick brown fox jumps over the lazy dog';
      const content2 = 'the quick brown fox jumps over a lazy dog';
      
      const similarity = calculateContentSimilarity(content1, content2);
      
      expect(similarity).toBeGreaterThan(0.8);
    });

    it('should handle empty content', () => {
      expect(calculateContentSimilarity('', '')).toBe(1.0);
      expect(calculateContentSimilarity('content', '')).toBe(0.0);
      expect(calculateContentSimilarity('', 'content')).toBe(0.0);
    });
  });

  describe('sortByPriority', () => {
    it('should sort by processing score (highest first)', () => {
      const items = [
        createMockProcessedItem({ id: 'low', processingScore: 0.3 }),
        createMockProcessedItem({ id: 'high', processingScore: 0.9 }),
        createMockProcessedItem({ id: 'medium', processingScore: 0.6 }),
      ];
      
      const sorted = sortByPriority(items);
      
      expect(sorted[0].id).toBe('high');
      expect(sorted[1].id).toBe('medium');
      expect(sorted[2].id).toBe('low');
    });

    it('should use timestamp as secondary sort for same scores', () => {
      const oldTime = new Date('2025-01-23T10:00:00Z');
      const newTime = new Date('2025-01-23T12:00:00Z');
      
      const items = [
        createMockProcessedItem({ id: 'old', processingScore: 0.5, insertedAt: oldTime }),
        createMockProcessedItem({ id: 'new', processingScore: 0.5, insertedAt: newTime }),
      ];
      
      const sorted = sortByPriority(items);
      
      expect(sorted[0].id).toBe('new'); // Newer item first
      expect(sorted[1].id).toBe('old');
    });

    it('should not modify original array', () => {
      const items = [
        createMockProcessedItem({ processingScore: 0.3 }),
        createMockProcessedItem({ processingScore: 0.9 }),
      ];
      
      const originalFirst = items[0].processingScore;
      const sorted = sortByPriority(items);
      
      expect(items[0].processingScore).toBe(originalFirst); // Original unchanged
      expect(sorted[0].processingScore).toBe(0.9); // Sorted correctly
    });
  });

  describe('filterByQuality', () => {
    it('should filter items by minimum score threshold', () => {
      const items = [
        createMockProcessedItem({ processingScore: 0.8 }), // Above threshold
        createMockProcessedItem({ processingScore: 0.3 }), // Below threshold
        createMockProcessedItem({ processingScore: 0.6 }), // Above threshold
      ];
      
      const filtered = filterByQuality(items, 0.5);
      
      expect(filtered).toHaveLength(2);
      expect(filtered.every(item => item.processingScore >= 0.5)).toBe(true);
    });

    it('should return empty array when no items meet threshold', () => {
      const items = [
        createMockProcessedItem({ processingScore: 0.2 }),
        createMockProcessedItem({ processingScore: 0.3 }),
      ];
      
      const filtered = filterByQuality(items, 0.5);
      
      expect(filtered).toHaveLength(0);
    });

    it('should return all items when threshold is very low', () => {
      const items = [
        createMockProcessedItem({ processingScore: 0.1 }),
        createMockProcessedItem({ processingScore: 0.9 }),
      ];
      
      const filtered = filterByQuality(items, 0.0);
      
      expect(filtered).toHaveLength(2);
    });
  });
});