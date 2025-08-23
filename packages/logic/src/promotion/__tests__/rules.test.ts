import {
  calculateEligibilityFactors,
  calculatePromotionScore,
  filterEligibleCandidates,
  applyFloodGuard,
  validatePromotionResult,
} from '../rules.js';
import {
  PromotionCandidate,
  PromotionConfig,
  PromotionResult,
  PROMOTION_CONSTANTS,
} from '../types.js';

describe('Promotion Rules', () => {
  const mockConfig: PromotionConfig = {
    maxPromotionsPerWindow: 5,
    windowSizeMinutes: 5,
    minQualityThreshold: 0.6,
    maxAgeHours: 24,
    dedupeLookbackHours: 48,
    scoringWeights: PROMOTION_CONSTANTS.DEFAULT_SCORING_WEIGHTS,
  };

  const mockCurrentTime = new Date('2025-01-01T12:00:00Z');
  const mockInsertedTime = new Date('2025-01-01T11:00:00Z'); // 1 hour ago

  describe('calculateEligibilityFactors', () => {
    it('should calculate time weight correctly for fresh content', () => {
      const rawData = {
        source: 'test',
        type: 'proposition',
        content: 'Test content',
        timestamp: mockInsertedTime.toISOString(),
      };

      const factors = calculateEligibilityFactors(
        rawData,
        mockInsertedTime,
        mockConfig,
        mockCurrentTime
      );

      // 1 hour old out of 24 hours max = high time weight
      expect(factors.timeWeight).toBeGreaterThan(0.9);
      expect(factors.qualityScore).toBeGreaterThan(0);
      expect(factors.sourceReliability).toBeGreaterThan(0);
      expect(factors.marketRelevance).toBeGreaterThan(0);
    });

    it('should calculate low time weight for old content', () => {
      const oldTime = new Date('2024-12-31T12:00:00Z'); // 24 hours ago
      const rawData = {
        source: 'test',
        content: 'Old content',
      };

      const factors = calculateEligibilityFactors(
        rawData,
        oldTime,
        mockConfig,
        mockCurrentTime
      );

      expect(factors.timeWeight).toBeLessThan(0.1);
    });

    it('should assess data quality based on completeness', () => {
      const highQualityData = {
        source: 'official',
        type: 'proposition',
        content: 'High quality content with details',
        timestamp: mockInsertedTime.toISOString(),
      };

      const lowQualityData = {
        source: '',
        content: '',
      };

      const highQualityFactors = calculateEligibilityFactors(
        highQualityData,
        mockInsertedTime,
        mockConfig,
        mockCurrentTime
      );

      const lowQualityFactors = calculateEligibilityFactors(
        lowQualityData,
        mockInsertedTime,
        mockConfig,
        mockCurrentTime
      );

      expect(highQualityFactors.qualityScore).toBeGreaterThan(
        lowQualityFactors.qualityScore
      );
    });
  });

  describe('calculatePromotionScore', () => {
    it('should calculate weighted composite score', () => {
      const factors = {
        timeWeight: 1.0,
        qualityScore: 0.8,
        uniquenessScore: 0.9,
        sourceReliability: 0.7,
        marketRelevance: 0.6,
      };

      const score = calculatePromotionScore(factors);
      
      // Should be weighted average
      const expectedScore =
        1.0 * 0.25 + // time
        0.8 * 0.30 + // quality
        0.9 * 0.20 + // uniqueness
        0.7 * 0.15 + // source
        0.6 * 0.10;  // market

      expect(score).toBeCloseTo(expectedScore, 3);
    });

    it('should use custom weights when provided', () => {
      const factors = {
        timeWeight: 1.0,
        qualityScore: 1.0,
        uniquenessScore: 1.0,
        sourceReliability: 1.0,
        marketRelevance: 1.0,
      };

      const customWeights = {
        time: 1.0,
        quality: 0.0,
        uniqueness: 0.0,
        source: 0.0,
        market: 0.0,
      };

      const score = calculatePromotionScore(factors, customWeights);
      expect(score).toBe(1.0);
    });
  });

  describe('filterEligibleCandidates', () => {
    const createMockCandidate = (overrides: Partial<PromotionCandidate> = {}): PromotionCandidate => ({
      rawId: 'test-id',
      insertedAt: mockInsertedTime,
      payload: { test: 'data' },
      score: 0.8,
      eligibilityFactors: {
        timeWeight: 0.9,
        qualityScore: 0.8,
        uniquenessScore: 0.9,
        sourceReliability: 0.7,
        marketRelevance: 0.6,
      },
      ...overrides,
    });

    it('should filter out candidates with low quality scores', () => {
      const candidates = [
        createMockCandidate({ eligibilityFactors: { ...createMockCandidate().eligibilityFactors, qualityScore: 0.7 } }),
        createMockCandidate({ eligibilityFactors: { ...createMockCandidate().eligibilityFactors, qualityScore: 0.5 } }),
      ];

      const { eligible, rejected } = filterEligibleCandidates(candidates, mockConfig);

      expect(eligible).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toContain('Quality score');
    });

    it('should filter out candidates that are too old', () => {
      const veryOldTime = new Date('2024-12-30T12:00:00Z'); // 48 hours ago
      const candidates = [
        createMockCandidate(),
        createMockCandidate({ insertedAt: veryOldTime }),
      ];

      // Mock current time for age calculation
      jest.spyOn(Date, 'now').mockReturnValue(mockCurrentTime.getTime());

      const { eligible, rejected } = filterEligibleCandidates(candidates, mockConfig);

      expect(eligible).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toContain('Age');

      jest.restoreAllMocks();
    });

    it('should filter out candidates with non-positive scores', () => {
      const candidates = [
        createMockCandidate({ score: 0.8 }),
        createMockCandidate({ score: 0 }),
        createMockCandidate({ score: -0.1 }),
      ];

      const { eligible, rejected } = filterEligibleCandidates(candidates, mockConfig);

      expect(eligible).toHaveLength(1);
      expect(rejected).toHaveLength(2);
      expect(rejected[0].reason).toContain('Composite score');
      expect(rejected[1].reason).toContain('Composite score');
    });
  });

  describe('applyFloodGuard', () => {
    const candidates = [
      { rawId: '1', score: 0.9 },
      { rawId: '2', score: 0.8 },
      { rawId: '3', score: 0.7 },
      { rawId: '4', score: 0.6 },
      { rawId: '5', score: 0.5 },
    ].map(c => ({ 
      ...c, 
      insertedAt: mockInsertedTime, 
      payload: {}, 
      eligibilityFactors: {
        timeWeight: 0.9,
        qualityScore: 0.8,
        uniquenessScore: 0.9,
        sourceReliability: 0.7,
        marketRelevance: 0.6,
      }
    }));

    it('should allow all candidates when under flood limit', () => {
      const { allowed, blocked, floodGuardTriggered } = applyFloodGuard(
        candidates.slice(0, 3), // 3 candidates
        1, // 1 already promoted
        mockConfig // limit of 5
      );

      expect(allowed).toHaveLength(3);
      expect(blocked).toHaveLength(0);
      expect(floodGuardTriggered).toBe(false);
    });

    it('should block all candidates when flood limit reached', () => {
      const { allowed, blocked, floodGuardTriggered } = applyFloodGuard(
        candidates,
        5, // 5 already promoted (at limit)
        mockConfig
      );

      expect(allowed).toHaveLength(0);
      expect(blocked).toHaveLength(5);
      expect(floodGuardTriggered).toBe(true);
    });

    it('should select top candidates by score when limiting', () => {
      const { allowed, blocked, floodGuardTriggered } = applyFloodGuard(
        candidates,
        3, // 3 already promoted
        mockConfig // limit of 5, so 2 slots left
      );

      expect(allowed).toHaveLength(2);
      expect(blocked).toHaveLength(3);
      expect(floodGuardTriggered).toBe(true);
      
      // Should select highest scoring candidates
      expect(allowed[0].score).toBe(0.9);
      expect(allowed[1].score).toBe(0.8);
    });
  });

  describe('validatePromotionResult', () => {
    const createValidResult = (): PromotionResult => ({
      selectedCandidates: [
        {
          rawId: 'test-1',
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
      ],
      rejectedCandidates: [
        {
          candidate: {
            rawId: 'test-2',
            insertedAt: mockInsertedTime,
            payload: {},
            score: 0.4,
            eligibilityFactors: {
              timeWeight: 0.9,
              qualityScore: 0.4,
              uniquenessScore: 0.9,
              sourceReliability: 0.7,
              marketRelevance: 0.6,
            },
          },
          reason: 'Quality score too low',
        },
      ],
      floodGuardTriggered: false,
      totalProcessed: 2,
      metadata: {
        windowStart: new Date(),
        windowEnd: new Date(),
        configUsed: mockConfig,
      },
    });

    it('should pass validation for consistent result', () => {
      const result = createValidResult();
      
      expect(() => validatePromotionResult(result)).not.toThrow();
    });

    it('should throw for inconsistent total counts', () => {
      const result = createValidResult();
      result.totalProcessed = 10; // Doesn't match selected + rejected
      
      expect(() => validatePromotionResult(result)).toThrow(
        'total processed does not match selected + rejected'
      );
    });

    it('should throw for duplicate selections', () => {
      const result = createValidResult();
      result.selectedCandidates.push({
        ...result.selectedCandidates[0],
        rawId: result.selectedCandidates[0].rawId, // Same raw_id
      });
      result.totalProcessed = 3;
      
      expect(() => validatePromotionResult(result)).toThrow(
        'duplicate selections'
      );
    });

    it('should throw for flood guard violations', () => {
      const result = createValidResult();
      // Add more selected candidates than the limit allows
      for (let i = 0; i < 6; i++) {
        result.selectedCandidates.push({
          rawId: `extra-${i}`,
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
        });
      }
      result.totalProcessed = result.selectedCandidates.length + result.rejectedCandidates.length;
      
      expect(() => validatePromotionResult(result)).toThrow(
        'exceeds flood guard limit'
      );
    });
  });
});