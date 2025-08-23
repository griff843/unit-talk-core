import {
  processFeedData,
  createDefaultFeedConfig,
} from '../processor.js';
import {
  RawFeedData,
  FeedProcessingConfig,
  FEED_CONSTANTS,
} from '../types.js';

describe('Feed Processor', () => {
  const mockCurrentTime = new Date('2025-01-23T12:00:00Z');
  
  const createMockRawData = (overrides: Partial<RawFeedData> = {}): RawFeedData => ({
    source: 'test_source',
    type: 'news',
    content: 'Test content for processing',
    title: 'Test Title',
    timestamp: mockCurrentTime.toISOString(),
    ...overrides,
  });

  describe('processFeedData', () => {
    it('should process valid feed data successfully', () => {
      const rawItems = [
        createMockRawData({ source: 'official', content: 'High quality news content' }),
        createMockRawData({ source: 'verified', content: 'Verified analysis content' }),
      ];
      
      const config = createDefaultFeedConfig();
      const result = processFeedData(rawItems, config, mockCurrentTime);
      
      expect(result.statistics.totalInput).toBe(2);
      expect(result.statistics.processed).toBe(2);
      expect(result.statistics.rejected).toBe(0);
      expect(result.processedItems).toHaveLength(2);
      
      // Check processed items have required fields
      result.processedItems.forEach(item => {
        expect(item.id).toBeDefined();
        expect(item.source).toBeDefined();
        expect(item.type).toBeDefined();
        expect(item.payload).toBeDefined();
        expect(item.processingScore).toBeGreaterThan(0);
      });
    });

    it('should reject items with missing required fields', () => {
      const rawItems = [
        createMockRawData({ source: '' }), // Missing required source
        createMockRawData({ type: '' }),   // Missing required type
        createMockRawData(), // Valid item
      ];
      
      const config = createDefaultFeedConfig();
      const result = processFeedData(rawItems, config, mockCurrentTime);
      
      expect(result.statistics.totalInput).toBe(3);
      expect(result.statistics.processed).toBe(1); // Only valid item
      expect(result.statistics.rejected).toBe(2);
      
      // Check rejection reasons
      expect(result.rejectedItems[0].reason).toBe('Validation failed');
      expect(result.rejectedItems[0].validationErrors).toContain('Missing required field: source');
      expect(result.rejectedItems[1].validationErrors).toContain('Missing required field: type');
    });

    it('should reject items from blocked sources', () => {
      const rawItems = [
        createMockRawData({ source: 'blocked_source' }),
        createMockRawData({ source: 'allowed_source' }),
      ];
      
      const config = createDefaultFeedConfig({
        blockedSources: ['blocked_source'],
      });
      
      const result = processFeedData(rawItems, config, mockCurrentTime);
      
      expect(result.statistics.processed).toBe(1);
      expect(result.statistics.rejected).toBe(1);
      expect(result.rejectedItems[0].reason).toContain('not allowed');
    });

    it('should only allow items from allowed sources when specified', () => {
      const rawItems = [
        createMockRawData({ source: 'allowed_source' }),
        createMockRawData({ source: 'other_source' }),
      ];
      
      const config = createDefaultFeedConfig({
        allowedSources: ['allowed_source'],
      });
      
      const result = processFeedData(rawItems, config, mockCurrentTime);
      
      expect(result.statistics.processed).toBe(1);
      expect(result.statistics.rejected).toBe(1);
      expect(result.processedItems[0].source).toBe('allowed_source');
    });

    it('should normalize content when enabled', () => {
      const rawItems = [
        createMockRawData({ 
          content: '  <p>Content with   excessive   whitespace</p>  ' 
        }),
      ];
      
      const config = createDefaultFeedConfig({
        enableContentNormalization: true,
      });
      
      const result = processFeedData(rawItems, config, mockCurrentTime);
      
      const processedContent = result.processedItems[0].payload.content as string;
      expect(processedContent).toBe('Content with excessive whitespace');
    });

    it('should truncate content exceeding maximum length', () => {
      const longContent = 'A'.repeat(1000);
      const rawItems = [
        createMockRawData({ content: longContent }),
      ];
      
      const config = createDefaultFeedConfig({
        maxContentLength: 500,
        enableContentNormalization: true,
      });
      
      const result = processFeedData(rawItems, config, mockCurrentTime);
      
      const processedContent = result.processedItems[0].payload.content as string;
      expect(processedContent.length).toBeLessThanOrEqual(500);
      expect(processedContent).toEndWith('...');
    });

    it('should apply enrichment when enabled', () => {
      const rawItems = [
        createMockRawData({ 
          url: 'https://example.com?utm_source=test&ref_campaign=123',
        }),
      ];
      
      const config = createDefaultFeedConfig({
        enrichment: {
          addTimestamps: true,
          normalizeUrls: true,
          extractKeywords: false,
        },
      });
      
      const result = processFeedData(rawItems, config, mockCurrentTime);
      
      const payload = result.processedItems[0].payload;
      expect(payload.processing_timestamp).toBeDefined();
      expect(payload.normalized_url).toBeDefined();
      expect(payload.normalized_url).not.toContain('utm_');
      expect(payload.normalized_url).not.toContain('ref_');
    });

    it('should calculate meaningful processing scores', () => {
      const rawItems = [
        createMockRawData({ 
          source: 'official',
          content: 'High quality comprehensive content with multiple sentences and detailed information.',
          title: 'Detailed Title',
          description: 'Detailed description',
          url: 'https://example.com',
        }),
        createMockRawData({ 
          source: 'anonymous',
          content: 'Low quality',
        }),
      ];
      
      const config = createDefaultFeedConfig();
      const result = processFeedData(rawItems, config, mockCurrentTime);
      
      expect(result.processedItems).toHaveLength(2);
      
      // High quality item should have higher score
      const highQualityScore = result.processedItems[0].processingScore;
      const lowQualityScore = result.processedItems[1].processingScore;
      
      expect(highQualityScore).toBeGreaterThan(lowQualityScore);
      expect(highQualityScore).toBeGreaterThan(0.5);
    });

    it('should handle empty input gracefully', () => {
      const config = createDefaultFeedConfig();
      const result = processFeedData([], config, mockCurrentTime);
      
      expect(result.statistics.totalInput).toBe(0);
      expect(result.statistics.processed).toBe(0);
      expect(result.statistics.rejected).toBe(0);
      expect(result.processedItems).toHaveLength(0);
      expect(result.rejectedItems).toHaveLength(0);
    });
  });

  describe('createDefaultFeedConfig', () => {
    it('should create config with default values', () => {
      const config = createDefaultFeedConfig();
      
      expect(config.enableContentNormalization).toBe(true);
      expect(config.enableDeduplication).toBe(true);
      expect(config.maxContentLength).toBe(FEED_CONSTANTS.DEFAULT_MAX_CONTENT_LENGTH);
      expect(config.requiredFields).toEqual([...FEED_CONSTANTS.REQUIRED_FIELDS]);
      expect(config.allowedSources).toEqual([]);
      expect(config.blockedSources).toEqual([]);
    });

    it('should override specific values while keeping defaults', () => {
      const overrides = {
        maxContentLength: 5000,
        allowedSources: ['official', 'verified'],
        enrichment: {
          addTimestamps: false,
          normalizeUrls: true,
          extractKeywords: true,
        },
      };
      
      const config = createDefaultFeedConfig(overrides);
      
      expect(config.maxContentLength).toBe(5000);
      expect(config.allowedSources).toEqual(['official', 'verified']);
      expect(config.enrichment.addTimestamps).toBe(false);
      expect(config.enrichment.normalizeUrls).toBe(true);
      expect(config.enrichment.extractKeywords).toBe(true);
      
      // Should keep other defaults
      expect(config.enableContentNormalization).toBe(true);
      expect(config.requiredFields).toEqual([...FEED_CONSTANTS.REQUIRED_FIELDS]);
    });
  });

  // Edge cases and error handling
  describe('Edge cases', () => {
    it('should handle malformed URLs gracefully', () => {
      const rawItems = [
        createMockRawData({ url: 'not-a-valid-url' }),
      ];
      
      const config = createDefaultFeedConfig();
      const result = processFeedData(rawItems, config, mockCurrentTime);
      
      expect(result.statistics.rejected).toBe(1);
      expect(result.rejectedItems[0].validationErrors).toContain('Invalid URL format: not-a-valid-url');
    });

    it('should handle unsupported content types', () => {
      const rawItems = [
        createMockRawData({ type: 'unsupported_type' }),
      ];
      
      const config = createDefaultFeedConfig();
      const result = processFeedData(rawItems, config, mockCurrentTime);
      
      expect(result.statistics.rejected).toBe(1);
      expect(result.rejectedItems[0].validationErrors).toContain('Unsupported content type: unsupported_type');
    });

    it('should process items with minimal content', () => {
      const rawItems = [
        createMockRawData({ 
          content: undefined,
          title: 'Just a title',
        }),
      ];
      
      const config = createDefaultFeedConfig({
        qualityThresholds: {
          minContentLength: 0, // Allow empty content
          minFieldCompleteness: 0.3,
        },
      });
      
      const result = processFeedData(rawItems, config, mockCurrentTime);
      
      expect(result.statistics.processed).toBe(1);
      expect(result.processedItems[0].payload.content).toBe('');
    });
  });
});