import {
  selectCandidatesForPromotion,
  createDefaultPromotionConfig,
  calculateUniquenessScore,
  getReadyCandidates,
  ensureIdempotency,
} from '../selectors.js';
import {
  RawPropsRow,
  PromotionCandidate,
  PROMOTION_CONSTANTS,
} from '../types.js';

describe('Promotion Selectors', () => {
  const mockCurrentTime = new Date('2025-01-01T12:00:00Z');
  const mockInsertedTime = new Date('2025-01-01T11:00:00Z');
  const mockProcessedTime = new Date('2025-01-01T11:30:00Z');

  const createMockRawProps = (overrides: Partial<RawPropsRow> = {}): RawPropsRow => ({
    id: 'test-raw-id',
    inserted_at: mockInsertedTime.toISOString(),
    processed_at: mockProcessedTime.toISOString(),
    data: {
      source: 'test',
      type: 'proposition',
      content: 'Test content for analysis',
    },
    ...overrides,
  });

  describe('selectCandidatesForPromotion', () => {
    it('should select eligible candidates for promotion', () => {
      const rawProps = [
        createMockRawProps({ id: 'raw-1' }),
        createMockRawProps({ id: 'raw-2', data: { source: 'official', content: 'High quality content' } }),
        createMockRawProps({ id: 'raw-3', data: { source: '', content: '' } }), // Low quality
      ];

      const existingPromotions: string[] = [];
      const config = createDefaultPromotionConfig();

      const result = selectCandidatesForPromotion(
        rawProps,
        existingPromotions,
        config,
        mockCurrentTime
      );

      expect(result.selectedCandidates.length).toBeGreaterThan(0);
      expect(result.totalProcessed).toBe(3);
      expect(result.floodGuardTriggered).toBe(false);
      expect(result.metadata.configUsed).toBe(config);
    });

    it('should exclude already promoted candidates', () => {
      const rawProps = [
        createMockRawProps({ id: 'raw-1' }),
        createMockRawProps({ id: 'raw-2' }),
      ];

      const existingPromotions = ['raw-1']; // raw-1 already promoted
      const config = createDefaultPromotionConfig();

      const result = selectCandidatesForPromotion(
        rawProps,
        existingPromotions,
        config,
        mockCurrentTime
      );

      // Should only select raw-2
      expect(result.selectedCandidates).toHaveLength(1);
      expect(result.selectedCandidates[0].rawId).toBe('raw-2');
    });

    it('should exclude unprocessed candidates', () => {
      const rawProps = [
        createMockRawProps({ id: 'raw-1' }), // processed
        createMockRawProps({ id: 'raw-2', processed_at: null }), // unprocessed
      ];

      const result = selectCandidatesForPromotion(
        rawProps,
        [],
        createDefaultPromotionConfig(),
        mockCurrentTime
      );

      // Should only consider processed items
      expect(result.totalProcessed).toBe(1);
      expect(result.selectedCandidates[0]?.rawId).toBe('raw-1');
    });

    it('should trigger flood guard when limit exceeded', () => {
      const rawProps = Array.from({ length: 10 }, (_, i) =>
        createMockRawProps({ 
          id: `raw-${i}`,
          data: { source: 'official', content: `Content ${i}` }
        })
      );

      const config = createDefaultPromotionConfig({
        maxPromotionsPerWindow: 3,
      });

      const result = selectCandidatesForPromotion(
        rawProps,
        [], // No existing promotions
        config,
        mockCurrentTime
      );

      expect(result.selectedCandidates.length).toBeLessThanOrEqual(3);
      expect(result.floodGuardTriggered).toBe(true);
    });

    it('should sort selected candidates by score (descending)', () => {
      const rawProps = [
        createMockRawProps({ id: 'raw-1', data: { source: 'anonymous', content: 'Low quality' } }),
        createMockRawProps({ id: 'raw-2', data: { source: 'official', content: 'High quality content with market analysis' } }),
        createMockRawProps({ id: 'raw-3', data: { source: 'verified', content: 'Medium quality content' } }),
      ];

      const result = selectCandidatesForPromotion(
        rawProps,
        [],
        createDefaultPromotionConfig(),
        mockCurrentTime
      );

      if (result.selectedCandidates.length > 1) {
        // Verify descending order by score
        for (let i = 0; i < result.selectedCandidates.length - 1; i++) {
          expect(result.selectedCandidates[i].score).toBeGreaterThanOrEqual(
            result.selectedCandidates[i + 1].score
          );
        }
      }
    });
  });

  describe('createDefaultPromotionConfig', () => {
    it('should create config with default values', () => {
      const config = createDefaultPromotionConfig();

      expect(config.maxPromotionsPerWindow).toBe(PROMOTION_CONSTANTS.DEFAULT_MAX_PROMOTIONS_PER_5MIN);
      expect(config.windowSizeMinutes).toBe(5);
      expect(config.minQualityThreshold).toBe(PROMOTION_CONSTANTS.DEFAULT_MIN_QUALITY_THRESHOLD);
      expect(config.maxAgeHours).toBe(PROMOTION_CONSTANTS.DEFAULT_MAX_AGE_HOURS);
      expect(config.scoringWeights).toEqual(PROMOTION_CONSTANTS.DEFAULT_SCORING_WEIGHTS);
    });

    it('should override specific values', () => {
      const overrides = {
        maxPromotionsPerWindow: 10,
        minQualityThreshold: 0.8,
        scoringWeights: { time: 0.5, quality: 0.5, uniqueness: 0.0, source: 0.0, market: 0.0 },
      };

      const config = createDefaultPromotionConfig(overrides);

      expect(config.maxPromotionsPerWindow).toBe(10);
      expect(config.minQualityThreshold).toBe(0.8);
      expect(config.scoringWeights.time).toBe(0.5);
      expect(config.scoringWeights.quality).toBe(0.5);
      expect(config.scoringWeights.uniqueness).toBe(0.0);
      // Should keep defaults for non-overridden values
      expect(config.windowSizeMinutes).toBe(5);
    });
  });

  describe('calculateUniquenessScore', () => {
    it('should return high score for unique content', () => {
      const candidate = createMockRawProps({
        id: 'unique-1',
        data: { content: 'This is completely unique content that no one else has' },
      });

      const allCandidates = [
        candidate,
        createMockRawProps({ id: 'other-1', data: { content: 'Totally different content' } }),
        createMockRawProps({ id: 'other-2', data: { content: 'Another different topic' } }),
      ];

      const score = calculateUniquenessScore(candidate, allCandidates);

      expect(score).toBeGreaterThan(0.8);
    });

    it('should return low score for duplicate content', () => {
      const candidate = createMockRawProps({
        id: 'duplicate-1',
        data: { content: 'This is duplicate content that appears multiple times' },
      });

      const allCandidates = [
        candidate,
        createMockRawProps({ id: 'duplicate-2', data: { content: 'This is duplicate content that appears multiple times' } }),
        createMockRawProps({ id: 'duplicate-3', data: { content: 'This is duplicate content that appears multiple times' } }),
      ];

      const score = calculateUniquenessScore(candidate, allCandidates);

      expect(score).toBeLessThan(0.7);
    });

    it('should handle missing content gracefully', () => {
      const candidate = createMockRawProps({
        id: 'no-content',
        data: { source: 'test' }, // No content field
      });

      const score = calculateUniquenessScore(candidate, [candidate]);

      expect(score).toBe(0.5); // Neutral score for missing content
    });
  });

  describe('getReadyCandidates', () => {
    it('should include only processed candidates within age limit', () => {
      const rawProps = [
        createMockRawProps({ id: 'ready-1' }), // Processed and fresh
        createMockRawProps({ id: 'unprocessed', processed_at: null }), // Not processed
        createMockRawProps({ 
          id: 'old',
          inserted_at: new Date('2024-12-30T12:00:00Z').toISOString() // Too old
        }),
      ];

      const ready = getReadyCandidates(rawProps, 24, mockCurrentTime);

      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('ready-1');
    });

    it('should respect age limit correctly', () => {
      const recentTime = new Date('2025-01-01T10:00:00Z').toISOString(); // 2 hours ago
      const oldTime = new Date('2025-01-01T06:00:00Z').toISOString(); // 6 hours ago

      const rawProps = [
        createMockRawProps({ id: 'recent', inserted_at: recentTime }),
        createMockRawProps({ id: 'old', inserted_at: oldTime }),
      ];

      const ready = getReadyCandidates(rawProps, 4, mockCurrentTime); // 4-hour limit

      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('recent');
    });
  });

  describe('ensureIdempotency', () => {
    const candidates: PromotionCandidate[] = [
      {
        rawId: 'raw-1',
        insertedAt: mockInsertedTime,
        payload: {},
        score: 0.8,
        eligibilityFactors: {
          timeWeight: 0.9,
          qualityScore: 0.8,
          uniquenessScore: 0.9,
          sourceReliability: 0.7,
          marketRelevance: 0.6,
        },
      },
      {
        rawId: 'raw-2',
        insertedAt: mockInsertedTime,
        payload: {},
        score: 0.7,
        eligibilityFactors: {
          timeWeight: 0.9,
          qualityScore: 0.8,
          uniquenessScore: 0.9,
          sourceReliability: 0.7,
          marketRelevance: 0.6,
        },
      },
    ];

    it('should exclude already promoted candidates', () => {
      const existingPromotions = [
        { raw_id: 'raw-1', promoted_at: '2025-01-01T11:00:00Z' },
      ];

      const result = ensureIdempotency(candidates, existingPromotions);

      expect(result).toHaveLength(1);
      expect(result[0].rawId).toBe('raw-2');
    });

    it('should return all candidates when none are promoted', () => {
      const existingPromotions: Array<{ raw_id: string; promoted_at: string }> = [];

      const result = ensureIdempotency(candidates, existingPromotions);

      expect(result).toHaveLength(2);
      expect(result).toEqual(candidates);
    });

    it('should handle empty candidate list', () => {
      const existingPromotions = [
        { raw_id: 'some-id', promoted_at: '2025-01-01T11:00:00Z' },
      ];

      const result = ensureIdempotency([], existingPromotions);

      expect(result).toHaveLength(0);
    });
  });

  // Integration test - end to end flow
  describe('Integration: Full promotion flow', () => {
    it('should never promote duplicates (idempotency invariant)', () => {
      const rawProps = [
        createMockRawProps({ id: 'raw-1', data: { source: 'official', content: 'Content A' } }),
        createMockRawProps({ id: 'raw-2', data: { source: 'verified', content: 'Content B' } }),
      ];

      const config = createDefaultPromotionConfig({ maxPromotionsPerWindow: 10 });

      // First promotion run
      const result1 = selectCandidatesForPromotion(
        rawProps,
        [], // No existing promotions
        config,
        mockCurrentTime
      );

      // Simulate that raw-1 was promoted
      const existingPromotions = result1.selectedCandidates.map(c => c.rawId);

      // Second promotion run (should not re-promote raw-1)
      const result2 = selectCandidatesForPromotion(
        rawProps,
        existingPromotions,
        config,
        mockCurrentTime
      );

      // Should not select any candidates (all already promoted)
      expect(result2.selectedCandidates.length).toBe(0);
      expect(result2.rejectedCandidates.some(r => r.reason.includes('already promoted') || 
                                                    r.candidate.rawId === 'raw-1')).toBe(false); // They should be filtered out earlier
    });

    it('should respect EV selection invariants (highest scores first)', () => {
      const rawProps = [
        createMockRawProps({ id: 'low', data: { source: 'anonymous', content: 'basic' } }),
        createMockRawProps({ id: 'high', data: { source: 'official', content: 'comprehensive market analysis with breaking news' } }),
        createMockRawProps({ id: 'medium', data: { source: 'verified', content: 'detailed analysis' } }),
      ];

      const config = createDefaultPromotionConfig({ maxPromotionsPerWindow: 2 });

      const result = selectCandidatesForPromotion(
        rawProps,
        [],
        config,
        mockCurrentTime
      );

      // Should select highest value candidates first
      if (result.selectedCandidates.length >= 2) {
        expect(result.selectedCandidates[0].score).toBeGreaterThan(
          result.selectedCandidates[1].score
        );
      }
      
      // High-value candidate should be selected
      const highValueSelected = result.selectedCandidates.some(c => c.rawId === 'high');
      expect(highValueSelected).toBe(true);
    });
  });
});