/**
 * Unit tests for Data Normalization Utilities
 * Tests pure data transformation functions with no I/O
 */

import {
  DataNormalizer,
  SportSpecificNormalizer,
  DataValidator,
  DataDeduplicator,
  type RawFeedData,
  type NormalizedProp,
  type ValidationResult,
} from '../data-normalization.js';

describe('DataNormalizer', () => {
  describe('normalizePlayerName', () => {
    it('should normalize player names correctly', () => {
      expect(DataNormalizer.normalizePlayerName('LEBRON JAMES')).toBe('Lebron James');
      expect(DataNormalizer.normalizePlayerName('kevin durant')).toBe('Kevin Durant');
      expect(DataNormalizer.normalizePlayerName('ja\'morant')).toBe('Ja\'morant');
      expect(DataNormalizer.normalizePlayerName('jrue holiday-smith')).toBe('Jrue Holiday-Smith');
      expect(DataNormalizer.normalizePlayerName('')).toBe('');
    });

    it('should handle special characters and whitespace', () => {
      expect(DataNormalizer.normalizePlayerName('  stephen   curry  ')).toBe('Stephen Curry');
      expect(DataNormalizer.normalizePlayerName('anthony davis jr.')).toBe('Anthony Davis Jr');
      expect(DataNormalizer.normalizePlayerName('o\'neal')).toBe('O\'neal');
    });

    it('should handle invalid input gracefully', () => {
      expect(DataNormalizer.normalizePlayerName(null as any)).toBe('');
      expect(DataNormalizer.normalizePlayerName(undefined as any)).toBe('');
      expect(DataNormalizer.normalizePlayerName(123 as any)).toBe('');
    });
  });

  describe('normalizeTeamName', () => {
    it('should normalize NBA team names', () => {
      expect(DataNormalizer.normalizeTeamName('Los Angeles Lakers', 'NBA')).toBe('LAL');
      expect(DataNormalizer.normalizeTeamName('lakers', 'NBA')).toBe('LAL');
      expect(DataNormalizer.normalizeTeamName('Boston Celtics', 'NBA')).toBe('BOS');
      expect(DataNormalizer.normalizeTeamName('miami heat', 'NBA')).toBe('MIA');
    });

    it('should normalize NFL team names', () => {
      expect(DataNormalizer.normalizeTeamName('New England Patriots', 'NFL')).toBe('NE');
      expect(DataNormalizer.normalizeTeamName('patriots', 'NFL')).toBe('NE');
      expect(DataNormalizer.normalizeTeamName('Kansas City Chiefs', 'NFL')).toBe('KC');
    });

    it('should handle unknown teams with fallback', () => {
      expect(DataNormalizer.normalizeTeamName('Unknown Team', 'NBA')).toBe('UNK');
      expect(DataNormalizer.normalizeTeamName('Some Random Team', 'NFL')).toBe('SOM');
      expect(DataNormalizer.normalizeTeamName('', 'NBA')).toBe('');
    });
  });

  describe('normalizeMarketType', () => {
    it('should normalize common market types', () => {
      expect(DataNormalizer.normalizeMarketType('Points')).toBe('points');
      expect(DataNormalizer.normalizeMarketType('player points')).toBe('points');
      expect(DataNormalizer.normalizeMarketType('Rebounds')).toBe('rebounds');
      expect(DataNormalizer.normalizeMarketType('3-pointers')).toBe('three_pointers');
      expect(DataNormalizer.normalizeMarketType('Passing Yards')).toBe('passing_yards');
    });

    it('should handle spaces and special characters', () => {
      expect(DataNormalizer.normalizeMarketType('Receiving Yards')).toBe('receiving_yards');
      expect(DataNormalizer.normalizeMarketType('Home Runs')).toBe('home_runs');
      expect(DataNormalizer.normalizeMarketType('')).toBe('unknown');
    });

    it('should pass through unknown market types', () => {
      expect(DataNormalizer.normalizeMarketType('custom_stat')).toBe('custom_stat');
      expect(DataNormalizer.normalizeMarketType('weird metric name')).toBe('weird_metric_name');
    });
  });

  describe('normalizeOdds', () => {
    it('should handle American odds format', () => {
      expect(DataNormalizer.normalizeOdds(-110, 'american')).toBe(-110);
      expect(DataNormalizer.normalizeOdds(150, 'american')).toBe(150);
      expect(DataNormalizer.normalizeOdds('-120', 'american')).toBe(-120);
    });

    it('should convert decimal to American odds', () => {
      expect(DataNormalizer.normalizeOdds(2.5, 'decimal')).toBe(150); // (2.5-1)*100
      expect(DataNormalizer.normalizeOdds(1.5, 'decimal')).toBe(-200); // -100/(1.5-1)
      expect(DataNormalizer.normalizeOdds(1.91, 'decimal')).toBe(-110);
    });

    it('should handle invalid odds', () => {
      expect(DataNormalizer.normalizeOdds(NaN)).toBe(-110);
      expect(DataNormalizer.normalizeOdds('invalid' as any)).toBe(-110);
      expect(DataNormalizer.normalizeOdds(0)).toBe(0);
    });
  });

  describe('generatePropId', () => {
    it('should generate consistent prop IDs', () => {
      const prop: Partial<NormalizedProp> = {
        sport: 'NBA',
        gameId: 'game-123',
        playerId: 'player-456',
        marketType: 'points',
        market: { type: 'points', line: 25.5, overOdds: -110, underOdds: -110 },
      };

      const id1 = DataNormalizer.generatePropId(prop);
      const id2 = DataNormalizer.generatePropId(prop);
      expect(id1).toBe(id2);
      expect(id1).toContain('nba');
      expect(id1).toContain('game-123');
      expect(id1).toContain('player-456');
    });

    it('should handle missing fields', () => {
      const prop: Partial<NormalizedProp> = {
        sport: 'NBA',
        marketType: 'points',
      };

      const id = DataNormalizer.generatePropId(prop);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('calculateDataQuality', () => {
    let mockData: RawFeedData;

    beforeEach(() => {
      mockData = {
        source: 'test-source',
        sport: 'NBA',
        marketType: 'points',
        timestamp: new Date('2025-01-15T12:00:00Z'),
        rawData: {},
      };
    });

    it('should calculate quality for complete data', () => {
      const completeData: RawFeedData = {
        ...mockData,
        playerId: 'player-123',
        playerName: 'Test Player',
        team: 'LAL',
        opponent: 'BOS',
        line: 25.5,
        odds: -110,
        timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      };

      const quality = DataNormalizer.calculateDataQuality(completeData);
      expect(quality).toBeGreaterThan(80); // High quality for complete, fresh data
    });

    it('should penalize missing required fields', () => {
      const incompleteData = { ...mockData };
      delete (incompleteData as any).sport;

      const quality = DataNormalizer.calculateDataQuality(incompleteData);
      expect(quality).toBeLessThan(80);
    });

    it('should penalize old data', () => {
      const oldData: RawFeedData = {
        ...mockData,
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
      };

      const quality = DataNormalizer.calculateDataQuality(oldData);
      expect(quality).toBeLessThan(100);
    });
  });
});

describe('SportSpecificNormalizer', () => {
  let mockData: RawFeedData;

  beforeEach(() => {
    mockData = {
      source: 'test-source',
      sport: 'NBA',
      marketType: 'points',
      playerName: 'test player',
      team: 'lakers',
      opponent: 'celtics',
      timestamp: new Date('2025-01-15T12:00:00Z'),
      rawData: {},
    };
  });

  describe('normalizeNBA', () => {
    it('should normalize NBA data correctly', () => {
      const result = SportSpecificNormalizer.normalizeNBA(mockData);

      expect(result.sport).toBe('NBA');
      expect(result.league).toBe('NBA');
      expect(result.playerName).toBe('Test Player');
      expect(result.team).toBe('LAK'); // Normalized team name
      expect(result.opponent).toBe('CEL');
      expect(result.metadata?.source).toBe('test-source');
      expect(result.metadata?.confidence).toBeGreaterThan(0);
    });
  });

  describe('normalizeNFL', () => {
    it('should normalize NFL data correctly', () => {
      const nflData = { ...mockData, sport: 'NFL', team: 'patriots', opponent: 'chiefs' };
      const result = SportSpecificNormalizer.normalizeNFL(nflData);

      expect(result.sport).toBe('NFL');
      expect(result.league).toBe('NFL');
      expect(result.team).toBe('PAT');
      expect(result.opponent).toBe('CHI');
    });
  });

  describe('normalizeMLB', () => {
    it('should normalize MLB data correctly', () => {
      const mlbData = { ...mockData, sport: 'MLB', marketType: 'hits', team: 'yankees' };
      const result = SportSpecificNormalizer.normalizeMLB(mlbData);

      expect(result.sport).toBe('MLB');
      expect(result.league).toBe('MLB');
      expect(result.marketType).toBe('hits');
      expect(result.team).toBe('YAN');
    });
  });

  describe('normalizeNHL', () => {
    it('should normalize NHL data correctly', () => {
      const nhlData = { ...mockData, sport: 'NHL', marketType: 'goals', team: 'maple leafs' };
      const result = SportSpecificNormalizer.normalizeNHL(nhlData);

      expect(result.sport).toBe('NHL');
      expect(result.league).toBe('NHL');
      expect(result.marketType).toBe('goals');
      expect(result.team).toBe('MAP');
    });
  });
});

describe('DataValidator', () => {
  describe('validateNormalizedProp', () => {
    let validProp: Partial<NormalizedProp>;

    beforeEach(() => {
      validProp = {
        sport: 'NBA',
        marketType: 'points',
        playerName: 'Test Player',
        team: 'LAL',
        opponent: 'BOS',
        gameId: 'game-123',
        market: {
          type: 'points',
          line: 25.5,
          overOdds: -110,
          underOdds: -110,
        },
        gameDate: new Date('2025-01-15T19:00:00Z'),
      };
    });

    it('should validate correct data', () => {
      const result = DataValidator.validateNormalizedProp(validProp);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.quality).toBe(100);
    });

    it('should catch missing required fields', () => {
      const invalidProp = { ...validProp };
      delete invalidProp.sport;
      delete invalidProp.marketType;

      const result = DataValidator.validateNormalizedProp(invalidProp);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Sport is required');
      expect(result.errors).toContain('Market type is required');
      expect(result.quality).toBeLessThan(60); // Heavy penalty for missing required fields
    });

    it('should catch invalid numeric data', () => {
      const invalidProp = {
        ...validProp,
        market: {
          type: 'points',
          line: 'invalid' as any,
          overOdds: NaN,
          underOdds: -110,
        },
      };

      const result = DataValidator.validateNormalizedProp(invalidProp);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Line must be a valid number');
      expect(result.errors).toContain('Over odds must be a valid number');
    });

    it('should generate warnings for missing optional fields', () => {
      const propWithMissingOptionals = {
        sport: 'NBA',
        marketType: 'points',
        playerName: 'Test Player',
        // Missing team, opponent, gameId, gameDate
      };

      const result = DataValidator.validateNormalizedProp(propWithMissingOptionals);

      expect(result.isValid).toBe(true); // Still valid
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.quality).toBeLessThan(100); // But lower quality
    });
  });

  describe('validateOddsConsistency', () => {
    it('should validate reasonable odds', () => {
      expect(DataValidator.validateOddsConsistency(-110, -110)).toBe(true);
      expect(DataValidator.validateOddsConsistency(-105, -115)).toBe(true);
      expect(DataValidator.validateOddsConsistency(110, -130)).toBe(true);
    });

    it('should reject inconsistent odds', () => {
      expect(DataValidator.validateOddsConsistency(-50, -50)).toBe(false); // Too low vig
      expect(DataValidator.validateOddsConsistency(-200, -200)).toBe(false); // Too high vig
      expect(DataValidator.validateOddsConsistency(500, 500)).toBe(false); // Impossible odds
    });

    it('should handle edge cases', () => {
      expect(DataValidator.validateOddsConsistency(100, -120)).toBe(true);
      expect(DataValidator.validateOddsConsistency(-300, 250)).toBe(true);
    });
  });
});

describe('DataDeduplicator', () => {
  let baseProp: Partial<NormalizedProp>;

  beforeEach(() => {
    baseProp = {
      sport: 'NBA',
      playerId: 'player-123',
      marketType: 'points',
      market: { type: 'points', line: 25.5, overOdds: -110, underOdds: -110 },
      gameDate: new Date('2025-01-15T19:00:00Z'),
    };
  });

  describe('generateFingerprint', () => {
    it('should generate consistent fingerprints', () => {
      const fingerprint1 = DataDeduplicator.generateFingerprint(baseProp);
      const fingerprint2 = DataDeduplicator.generateFingerprint(baseProp);

      expect(fingerprint1).toBe(fingerprint2);
      expect(typeof fingerprint1).toBe('string');
      expect(fingerprint1.length).toBeGreaterThan(0);
    });

    it('should generate different fingerprints for different props', () => {
      const prop1 = { ...baseProp };
      const prop2 = { ...baseProp, market: { ...baseProp.market!, line: 26.5 } };

      const fingerprint1 = DataDeduplicator.generateFingerprint(prop1);
      const fingerprint2 = DataDeduplicator.generateFingerprint(prop2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should handle missing fields gracefully', () => {
      const incompleteProp = { sport: 'NBA', playerId: 'player-123' };
      const fingerprint = DataDeduplicator.generateFingerprint(incompleteProp);

      expect(typeof fingerprint).toBe('string');
      expect(fingerprint.length).toBeGreaterThan(0);
    });
  });

  describe('isDuplicate', () => {
    it('should identify duplicates correctly', () => {
      const prop1 = { ...baseProp };
      const prop2 = { ...baseProp };

      expect(DataDeduplicator.isDuplicate(prop1, prop2)).toBe(true);
    });

    it('should identify non-duplicates correctly', () => {
      const prop1 = { ...baseProp };
      const prop2 = { ...baseProp, playerId: 'player-456' };

      expect(DataDeduplicator.isDuplicate(prop1, prop2)).toBe(false);
    });

    it('should ignore irrelevant differences', () => {
      const prop1 = { ...baseProp, team: 'LAL' };
      const prop2 = { ...baseProp, team: 'BOS' }; // Different team, but same core prop

      expect(DataDeduplicator.isDuplicate(prop1, prop2)).toBe(true);
    });
  });

  describe('mergeDuplicates', () => {
    it('should merge duplicates keeping highest quality', () => {
      const highQuality: Partial<NormalizedProp> = {
        ...baseProp,
        gameId: 'game-123',
        metadata: { source: 'premium', quality: 95, confidence: 0.9, processed_at: new Date() },
      };

      const lowQuality: Partial<NormalizedProp> = {
        ...baseProp,
        team: 'LAL', // Has team info that high quality lacks
        metadata: { source: 'basic', quality: 70, confidence: 0.6, processed_at: new Date() },
      };

      const merged = DataDeduplicator.mergeDuplicates([highQuality, lowQuality]);

      expect(merged.gameId).toBe('game-123'); // From high quality
      expect(merged.team).toBe('LAL'); // Filled from low quality
      expect(merged.metadata?.quality).toBe(95); // Kept high quality score
      expect(merged.metadata?.source).toBe('premium,basic'); // Combined sources
    });

    it('should handle single prop', () => {
      const result = DataDeduplicator.mergeDuplicates([baseProp]);
      expect(result).toEqual(baseProp);
    });

    it('should throw error for empty array', () => {
      expect(() => DataDeduplicator.mergeDuplicates([])).toThrow('No props to merge');
    });

    it('should sort by quality correctly', () => {
      const medium: Partial<NormalizedProp> = {
        ...baseProp,
        metadata: { source: 'medium', quality: 80, confidence: 0.7, processed_at: new Date() },
      };

      const high: Partial<NormalizedProp> = {
        ...baseProp,
        metadata: { source: 'high', quality: 95, confidence: 0.9, processed_at: new Date() },
      };

      const low: Partial<NormalizedProp> = {
        ...baseProp,
        metadata: { source: 'low', quality: 60, confidence: 0.5, processed_at: new Date() },
      };

      const merged = DataDeduplicator.mergeDuplicates([medium, low, high]);

      expect(merged.metadata?.source).toContain('high'); // Should start with highest quality
      expect(merged.metadata?.quality).toBe(95);
    });
  });
});