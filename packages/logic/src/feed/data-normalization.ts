/**
 * Pure data normalization functions for feed processing
 * No I/O operations - handles transformation of raw data into standardized formats
 */

export interface RawFeedData {
  source: string;
  sport: string;
  league?: string;
  gameId?: string;
  playerId?: string;
  playerName?: string;
  team?: string;
  opponent?: string;
  marketType: string;
  line?: number;
  odds?: number;
  timestamp: Date;
  rawData: Record<string, any>;
}

export interface NormalizedProp {
  propId: string;
  sport: string;
  league: string;
  gameId: string;
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  marketType: string;
  market: {
    type: string;
    line: number;
    overOdds: number;
    underOdds: number;
    totalOdds?: number;
  };
  gameDate: Date;
  metadata: {
    source: string;
    confidence: number;
    quality: number;
    processed_at: Date;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  quality: number;
}

/**
 * Core data normalization utilities
 */
export class DataNormalizer {
  /**
   * Normalize player name to standard format
   */
  static normalizePlayerName(name: string): string {
    if (!name || typeof name !== 'string') return '';

    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-zA-Z\s'-]/g, '') // Remove special characters except apostrophes and hyphens
      .replace(/\s+/g, ' ') // Normalize whitespace
      .split(' ')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  /**
   * Normalize team name to standard abbreviation
   */
  static normalizeTeamName(team: string, sport: string): string {
    if (!team) return '';

    const teamMappings: Record<string, Record<string, string>> = {
      NBA: {
        'los angeles lakers': 'LAL',
        lakers: 'LAL',
        'l.a. lakers': 'LAL',
        'boston celtics': 'BOS',
        celtics: 'BOS',
        'miami heat': 'MIA',
        heat: 'MIA',
        // Add more mappings as needed
      },
      NFL: {
        'new england patriots': 'NE',
        patriots: 'NE',
        'kansas city chiefs': 'KC',
        chiefs: 'KC',
        'dallas cowboys': 'DAL',
        cowboys: 'DAL',
        // Add more mappings as needed
      },
      MLB: {
        'new york yankees': 'NYY',
        yankees: 'NYY',
        'los angeles dodgers': 'LAD',
        dodgers: 'LAD',
        'boston red sox': 'BOS',
        'red sox': 'BOS',
        // Add more mappings as needed
      },
      NHL: {
        'toronto maple leafs': 'TOR',
        'maple leafs': 'TOR',
        'montreal canadiens': 'MTL',
        canadiens: 'MTL',
        // Add more mappings as needed
      },
    };

    const normalizedTeam = team.toLowerCase().trim();
    const sportMappings = teamMappings[sport.toUpperCase()];

    return sportMappings?.[normalizedTeam] || team.toUpperCase().slice(0, 3);
  }

  /**
   * Normalize market type to standard format
   */
  static normalizeMarketType(marketType: string): string {
    if (!marketType) return 'unknown';

    const marketMappings: Record<string, string> = {
      // NBA
      points: 'points',
      pts: 'points',
      'player points': 'points',
      rebounds: 'rebounds',
      rebs: 'rebounds',
      'player rebounds': 'rebounds',
      assists: 'assists',
      ast: 'assists',
      'player assists': 'assists',
      steals: 'steals',
      blocks: 'blocks',
      threes: 'three_pointers',
      '3-pointers': 'three_pointers',
      'three pointers': 'three_pointers',

      // NFL
      'passing yards': 'passing_yards',
      'rush yards': 'rushing_yards',
      'rushing yards': 'rushing_yards',
      'receiving yards': 'receiving_yards',
      'rec yards': 'receiving_yards',
      touchdowns: 'touchdowns',
      tds: 'touchdowns',
      receptions: 'receptions',
      catches: 'receptions',

      // MLB
      hits: 'hits',
      runs: 'runs',
      rbis: 'rbis',
      'home runs': 'home_runs',
      strikeouts: 'strikeouts',
      walks: 'walks',

      // NHL
      goals: 'goals',
      saves: 'saves',
      shots: 'shots',
    };

    const normalized = marketType.toLowerCase().trim();
    return marketMappings[normalized] || normalized.replace(/\s+/g, '_');
  }

  /**
   * Normalize odds to American format
   */
  static normalizeOdds(
    odds: number | string,
    format: 'american' | 'decimal' | 'fractional' = 'american'
  ): number {
    if (typeof odds === 'string') {
      odds = parseFloat(odds);
    }

    if (isNaN(odds)) return -110; // Default odds

    switch (format) {
      case 'decimal':
        // Convert decimal to American
        if (odds >= 2) {
          return Math.round((odds - 1) * 100);
        } else {
          return Math.round(-100 / (odds - 1));
        }

      case 'fractional':
        // Assume fractional is already converted to decimal for simplicity
        return this.normalizeOdds(odds, 'decimal');

      case 'american':
      default:
        return Math.round(odds);
    }
  }

  /**
   * Generate standardized prop ID
   */
  static generatePropId(data: Partial<NormalizedProp>): string {
    const parts = [
      data.sport?.toLowerCase(),
      data.gameId,
      data.playerId,
      data.marketType,
      data.market?.line?.toString().replace('.', '_'),
    ].filter(Boolean);

    return parts.join('-');
  }

  /**
   * Calculate data quality score
   */
  static calculateDataQuality(data: RawFeedData): number {
    let score = 0;
    let maxScore = 0;

    // Required fields
    const requiredFields = ['sport', 'marketType', 'timestamp'];
    requiredFields.forEach(field => {
      maxScore += 20;
      if (data[field as keyof RawFeedData]) {
        score += 20;
      }
    });

    // Important fields
    const importantFields = [
      'playerId',
      'playerName',
      'team',
      'opponent',
      'line',
      'odds',
    ];
    importantFields.forEach(field => {
      maxScore += 10;
      if (data[field as keyof RawFeedData]) {
        score += 10;
      }
    });

    // Data freshness (within last hour)
    maxScore += 10;
    const ageMinutes = (Date.now() - data.timestamp.getTime()) / (1000 * 60);
    if (ageMinutes < 60) {
      score += 10;
    } else if (ageMinutes < 180) {
      score += 5;
    }

    return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  }
}

/**
 * Sport-specific normalization utilities
 */
export class SportSpecificNormalizer {
  /**
   * Normalize NBA-specific data
   */
  static normalizeNBA(data: RawFeedData): Partial<NormalizedProp> {
    const marketType = DataNormalizer.normalizeMarketType(data.marketType);

    // NBA-specific position mappings
    const positionMap: Record<string, string> = {
      PG: 'Point Guard',
      SG: 'Shooting Guard',
      SF: 'Small Forward',
      PF: 'Power Forward',
      C: 'Center',
    };

    return {
      sport: 'NBA',
      league: 'NBA',
      marketType,
      playerName: DataNormalizer.normalizePlayerName(data.playerName || ''),
      team: DataNormalizer.normalizeTeamName(data.team || '', 'NBA'),
      opponent: DataNormalizer.normalizeTeamName(data.opponent || '', 'NBA'),
      metadata: {
        source: data.source,
        confidence: this.calculateNBAConfidence(data),
        quality: DataNormalizer.calculateDataQuality(data),
        processed_at: new Date(),
      },
    };
  }

  /**
   * Normalize NFL-specific data
   */
  static normalizeNFL(data: RawFeedData): Partial<NormalizedProp> {
    const marketType = DataNormalizer.normalizeMarketType(data.marketType);

    return {
      sport: 'NFL',
      league: 'NFL',
      marketType,
      playerName: DataNormalizer.normalizePlayerName(data.playerName || ''),
      team: DataNormalizer.normalizeTeamName(data.team || '', 'NFL'),
      opponent: DataNormalizer.normalizeTeamName(data.opponent || '', 'NFL'),
      metadata: {
        source: data.source,
        confidence: this.calculateNFLConfidence(data),
        quality: DataNormalizer.calculateDataQuality(data),
        processed_at: new Date(),
      },
    };
  }

  /**
   * Normalize MLB-specific data
   */
  static normalizeMLB(data: RawFeedData): Partial<NormalizedProp> {
    const marketType = DataNormalizer.normalizeMarketType(data.marketType);

    return {
      sport: 'MLB',
      league: 'MLB',
      marketType,
      playerName: DataNormalizer.normalizePlayerName(data.playerName || ''),
      team: DataNormalizer.normalizeTeamName(data.team || '', 'MLB'),
      opponent: DataNormalizer.normalizeTeamName(data.opponent || '', 'MLB'),
      metadata: {
        source: data.source,
        confidence: this.calculateMLBConfidence(data),
        quality: DataNormalizer.calculateDataQuality(data),
        processed_at: new Date(),
      },
    };
  }

  /**
   * Normalize NHL-specific data
   */
  static normalizeNHL(data: RawFeedData): Partial<NormalizedProp> {
    const marketType = DataNormalizer.normalizeMarketType(data.marketType);

    return {
      sport: 'NHL',
      league: 'NHL',
      marketType,
      playerName: DataNormalizer.normalizePlayerName(data.playerName || ''),
      team: DataNormalizer.normalizeTeamName(data.team || '', 'NHL'),
      opponent: DataNormalizer.normalizeTeamName(data.opponent || '', 'NHL'),
      metadata: {
        source: data.source,
        confidence: this.calculateNHLConfidence(data),
        quality: DataNormalizer.calculateDataQuality(data),
        processed_at: new Date(),
      },
    };
  }

  private static calculateNBAConfidence(data: RawFeedData): number {
    let confidence = 0.5;

    // Higher confidence for common NBA stats
    const reliableStats = ['points', 'rebounds', 'assists', 'steals', 'blocks'];
    if (
      reliableStats.some(stat => data.marketType.toLowerCase().includes(stat))
    ) {
      confidence += 0.2;
    }

    // Team and opponent data quality
    if (data.team && data.opponent) {
      confidence += 0.2;
    }

    // Recent data
    const ageHours = (Date.now() - data.timestamp.getTime()) / (1000 * 60 * 60);
    if (ageHours < 4) {
      confidence += 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private static calculateNFLConfidence(data: RawFeedData): number {
    let confidence = 0.5;

    // Higher confidence for common NFL stats
    const reliableStats = [
      'passing_yards',
      'rushing_yards',
      'receiving_yards',
      'touchdowns',
    ];
    if (
      reliableStats.some(stat => data.marketType.toLowerCase().includes(stat))
    ) {
      confidence += 0.2;
    }

    // Position-specific adjustments
    if (data.rawData?.position) {
      const position = data.rawData.position.toUpperCase();
      if (['QB', 'RB', 'WR', 'TE'].includes(position)) {
        confidence += 0.1;
      }
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private static calculateMLBConfidence(data: RawFeedData): number {
    let confidence = 0.5;

    // Higher confidence for common MLB stats
    const reliableStats = ['hits', 'runs', 'rbis', 'strikeouts', 'home_runs'];
    if (
      reliableStats.some(stat => data.marketType.toLowerCase().includes(stat))
    ) {
      confidence += 0.2;
    }

    // Pitchers vs batters
    if (data.rawData?.position) {
      const position = data.rawData.position.toUpperCase();
      if (position === 'P') {
        confidence += 0.1; // Pitcher stats are generally more predictable
      }
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private static calculateNHLConfidence(data: RawFeedData): number {
    let confidence = 0.5;

    // Higher confidence for common NHL stats
    const reliableStats = ['goals', 'assists', 'points', 'shots', 'saves'];
    if (
      reliableStats.some(stat => data.marketType.toLowerCase().includes(stat))
    ) {
      confidence += 0.2;
    }

    // Goalies vs skaters
    if (data.rawData?.position === 'G') {
      confidence += 0.1; // Goalie stats can be more predictable
    }

    return Math.max(0, Math.min(1, confidence));
  }
}

/**
 * Data validation utilities
 */
export class DataValidator {
  /**
   * Validate normalized prop data
   */
  static validateNormalizedProp(
    data: Partial<NormalizedProp>
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validation
    if (!data.sport) errors.push('Sport is required');
    if (!data.marketType) errors.push('Market type is required');
    if (!data.playerName) errors.push('Player name is required');

    // Data quality validation
    if (data.market?.line !== undefined) {
      if (typeof data.market.line !== 'number' || isNaN(data.market.line)) {
        errors.push('Line must be a valid number');
      }
    }

    if (data.market?.overOdds !== undefined) {
      if (typeof data.market.overOdds !== 'number') {
        errors.push('Over odds must be a valid number');
      }
    }

    if (data.market?.underOdds !== undefined) {
      if (typeof data.market.underOdds !== 'number') {
        errors.push('Under odds must be a valid number');
      }
    }

    // Warnings for missing optional data
    if (!data.team) warnings.push('Team information missing');
    if (!data.opponent) warnings.push('Opponent information missing');
    if (!data.gameId) warnings.push('Game ID missing');
    if (!data.gameDate) warnings.push('Game date missing');

    // Quality score calculation
    let quality = 100;
    quality -= errors.length * 20;
    quality -= warnings.length * 5;
    quality = Math.max(0, quality);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      quality: quality,
    };
  }

  /**
   * Validate odds consistency
   */
  static validateOddsConsistency(overOdds: number, underOdds: number): boolean {
    // Check if odds imply reasonable probabilities
    const overImpliedProb = this.oddsToImpliedProbability(overOdds);
    const underImpliedProb = this.oddsToImpliedProbability(underOdds);

    // Total implied probability should be > 100% (accounting for vig)
    const totalImpliedProb = overImpliedProb + underImpliedProb;

    return totalImpliedProb >= 1.0 && totalImpliedProb <= 1.3; // 0-30% vig is reasonable
  }

  private static oddsToImpliedProbability(americanOdds: number): number {
    if (americanOdds > 0) {
      return 100 / (americanOdds + 100);
    } else {
      return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    }
  }
}

/**
 * Deduplication utilities
 */
export class DataDeduplicator {
  /**
   * Generate fingerprint for deduplication
   */
  static generateFingerprint(data: Partial<NormalizedProp>): string {
    const key = [
      data.sport,
      data.playerId,
      data.marketType,
      data.market?.line?.toString(),
      data.gameDate?.toISOString().split('T')[0], // Date only
    ]
      .filter(Boolean)
      .join('|');

    return this.simpleHash(key);
  }

  /**
   * Check if two props are duplicates
   */
  static isDuplicate(
    prop1: Partial<NormalizedProp>,
    prop2: Partial<NormalizedProp>
  ): boolean {
    return this.generateFingerprint(prop1) === this.generateFingerprint(prop2);
  }

  /**
   * Merge duplicate props, keeping the higher quality one
   */
  static mergeDuplicates(
    props: Partial<NormalizedProp>[]
  ): Partial<NormalizedProp> {
    if (props.length === 0) throw new Error('No props to merge');
    if (props.length === 1) return props[0];

    // Sort by quality (highest first)
    const sorted = props.sort(
      (a, b) => (b.metadata?.quality || 0) - (a.metadata?.quality || 0)
    );
    const best = sorted[0];

    // Merge additional data from other sources
    const merged = { ...best };

    for (let i = 1; i < sorted.length; i++) {
      const other = sorted[i];

      // Fill in missing fields from other sources
      if (!merged.gameId && other.gameId) merged.gameId = other.gameId;
      if (!merged.team && other.team) merged.team = other.team;
      if (!merged.opponent && other.opponent) merged.opponent = other.opponent;

      // Update metadata with merged sources
      if (merged.metadata && other.metadata) {
        merged.metadata.source = [merged.metadata.source, other.metadata.source]
          .filter(Boolean)
          .join(',');
      }
    }

    return merged;
  }

  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}
