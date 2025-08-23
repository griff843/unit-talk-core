/**
 * Unit tests for Factor Calculators
 * Tests the 59-factor grading system with deterministic inputs
 */

import {
  CoreFactorCalculators,
  MarketIntelligenceCalculators,
  PerformanceFactorCalculators,
  RiskAssessmentCalculators,
  ProfessionalCapperCalculators,
  FactorCalculatorRegistry,
  type FactorCalculationContext,
} from '../factor-calculators.js';
import { GRADING_CONSTANTS, type GradingInput } from '../types.js';

describe('CoreFactorCalculators', () => {
  let mockInput: GradingInput;
  let mockContext: FactorCalculationContext;

  beforeEach(() => {
    mockInput = {
      pickId: 'test-pick-123',
      tenantId: 'test-tenant',
      sport: 'NBA',
      player: 'test-player',
      marketType: 'points',
      odds: -110,
      line: 25.5,
    };

    mockContext = {
      sport: 'NBA',
      timestamp: new Date('2025-01-15T12:00:00Z'),
      gameDate: new Date('2025-01-15T19:00:00Z'),
      opponent: 'OPP',
      venue: 'home',
      historicalData: {
        expectedValue: 8.5,
        lineMovement: 1.2,
        playerForm3Games: 75,
        playerForm7Games: 68,
        closingLineValue: 3.2,
      },
      marketData: {
        liquidity: 0.7,
        volume: 1.8,
        publicPercentage: 65,
        sharpAction: 82,
      },
      gameContext: {
        daysRest: 2,
        isBackToBack: false,
        crowdFactor: 1.2,
      },
    };
  });

  describe('calculateExpectedValue', () => {
    it('should calculate expected value score correctly', () => {
      const result = CoreFactorCalculators.calculateExpectedValue(mockInput, mockContext);

      expect(result.factorId).toBe('expected_value');
      expect(result.score).toBeCloseTo(56.67, 1); // 8.5/15 * 100
      expect(result.confidence).toBe(0.9);
      expect(result.weight).toBe(GRADING_CONSTANTS.FACTOR_WEIGHTS.expected_value);
      expect(result.metadata?.expectedValue).toBe(8.5);
      expect(result.metadata?.category).toBe('core_fundamentals');
    });

    it('should handle missing expected value data', () => {
      const contextWithoutEV = { ...mockContext, historicalData: {} };
      const result = CoreFactorCalculators.calculateExpectedValue(mockInput, contextWithoutEV);

      expect(result.score).toBe(0); // No EV = 0 score
      expect(result.confidence).toBe(0.9);
    });
  });

  describe('calculateLineMovement', () => {
    it('should calculate line movement score correctly', () => {
      const result = CoreFactorCalculators.calculateLineMovement(mockInput, mockContext);

      expect(result.factorId).toBe('line_movement');
      expect(result.score).toBe(62); // 50 + (1.2 * 10)
      expect(result.confidence).toBe(0.8);
      expect(result.metadata?.lineMovement).toBe(1.2);
    });
  });

  describe('calculatePlayerForm', () => {
    it('should calculate weighted player form correctly', () => {
      const result = CoreFactorCalculators.calculatePlayerForm(mockInput, mockContext);

      expect(result.factorId).toBe('player_form');
      // Weighted: 75 * 0.7 + 68 * 0.3 = 52.5 + 20.4 = 72.9
      expect(result.score).toBeCloseTo(72.9, 1);
      expect(result.confidence).toBe(0.85);
      expect(result.metadata?.form3Games).toBe(75);
      expect(result.metadata?.form7Games).toBe(68);
    });
  });
});

describe('MarketIntelligenceCalculators', () => {
  let mockInput: GradingInput;
  let mockContext: FactorCalculationContext;

  beforeEach(() => {
    mockInput = {
      pickId: 'test-pick-123',
      tenantId: 'test-tenant',
      sport: 'NBA',
      marketType: 'points',
    };

    mockContext = {
      sport: 'NBA',
      timestamp: new Date('2025-01-15T12:00:00Z'),
      gameDate: new Date('2025-01-15T19:00:00Z'),
      historicalData: {
        lineMovement: 1.8,
      },
      marketData: {
        sharpAction: 85,
        volume: 2.2,
        publicPercentage: 78,
      },
    };
  });

  describe('calculateSharpMoney', () => {
    it('should calculate sharp money score', () => {
      const result = MarketIntelligenceCalculators.calculateSharpMoney(mockInput, mockContext);

      expect(result.factorId).toBe('sharp_money');
      expect(result.score).toBe(85);
      expect(result.confidence).toBe(0.75);
      expect(result.metadata?.sharpAction).toBe(85);
      expect(result.metadata?.category).toBe('market_intelligence');
    });
  });

  describe('calculateSteamDetection', () => {
    it('should detect strong steam', () => {
      const result = MarketIntelligenceCalculators.calculateSteamDetection(mockInput, mockContext);

      expect(result.factorId).toBe('steam_detection');
      expect(result.score).toBe(90); // Strong steam: lineMovement 1.8 > 1.5, volume 2.2 > 1.5
      expect(result.confidence).toBe(0.8);
      expect(result.metadata?.lineMovement).toBe(1.8);
      expect(result.metadata?.volumeSpike).toBe(2.2);
    });

    it('should detect moderate steam', () => {
      const contextModerate = {
        ...mockContext,
        historicalData: { lineMovement: 1.2 },
        marketData: { ...mockContext.marketData!, volume: 1.0 },
      };
      const result = MarketIntelligenceCalculators.calculateSteamDetection(mockInput, contextModerate);

      expect(result.score).toBe(70); // Moderate steam
    });

    it('should detect no steam', () => {
      const contextNoSteam = {
        ...mockContext,
        historicalData: { lineMovement: 0.5 },
        marketData: { ...mockContext.marketData!, volume: 0.5 },
      };
      const result = MarketIntelligenceCalculators.calculateSteamDetection(mockInput, contextNoSteam);

      expect(result.score).toBe(30); // No steam
    });
  });

  describe('calculatePublicVsSharp', () => {
    it('should detect contrarian opportunity with heavy public betting', () => {
      const result = MarketIntelligenceCalculators.calculatePublicVsSharp(mockInput, mockContext);

      expect(result.factorId).toBe('public_vs_sharp');
      expect(result.score).toBe(80); // Public at 78% > 75%
      expect(result.metadata?.publicPercentage).toBe(78);
    });

    it('should return neutral score for balanced public betting', () => {
      const contextBalanced = {
        ...mockContext,
        marketData: { ...mockContext.marketData!, publicPercentage: 55 },
      };
      const result = MarketIntelligenceCalculators.calculatePublicVsSharp(mockInput, contextBalanced);

      expect(result.score).toBe(50); // Balanced betting
    });
  });

  describe('calculateMarketTiming', () => {
    it('should calculate optimal timing for early bet', () => {
      const earlyContext = {
        ...mockContext,
        timestamp: new Date('2025-01-14T12:00:00Z'), // 31 hours before game
      };
      const result = MarketIntelligenceCalculators.calculateMarketTiming(mockInput, earlyContext);

      expect(result.factorId).toBe('market_timing');
      expect(result.score).toBe(85); // Early bet > 24h
      expect(result.metadata?.hoursToGame).toBeGreaterThan(24);
    });

    it('should calculate timing with breaking news', () => {
      const lateContext = {
        ...mockContext,
        timestamp: new Date('2025-01-15T17:00:00Z'), // 2 hours before game
        externalData: {
          newsEvents: [{ type: 'injury', impact: -0.3 }],
        },
      };
      const result = MarketIntelligenceCalculators.calculateMarketTiming(mockInput, lateContext);

      expect(result.score).toBe(80); // Late with breaking news
      expect(result.metadata?.hasBreakingNews).toBe(true);
    });
  });
});

describe('PerformanceFactorCalculators', () => {
  let mockInput: GradingInput;
  let mockContext: FactorCalculationContext;

  beforeEach(() => {
    mockInput = {
      pickId: 'player-123-points',
      tenantId: 'test-tenant',
      sport: 'NBA',
      marketType: 'points',
    };

    mockContext = {
      sport: 'NBA',
      timestamp: new Date('2025-01-15T12:00:00Z'),
      historicalData: {
        last3Games: [80, 85, 90],
        seasonStats: Array.from({ length: 20 }, (_, i) => 50 + i * 2),
      },
      gameContext: {
        daysRest: 1,
        isBackToBack: false,
      },
      externalData: {
        injuryReports: [
          {
            playerId: 'player-123',
            severity: 'minor' as const,
            reportedAt: '2025-01-14T10:00:00Z',
            expectedReturn: '2025-01-16T00:00:00Z',
          },
        ],
      },
    };
  });

  describe('calculatePlayerForm3Games', () => {
    it('should calculate 3-game momentum correctly', () => {
      const result = PerformanceFactorCalculators.calculatePlayerForm3Games(mockInput, mockContext);

      expect(result.factorId).toBe('playerForm3Games');
      // Should show positive trend from [80, 85, 90]
      expect(result.score).toBeGreaterThan(50);
      expect(result.confidence).toBe(0.9);
      expect(result.metadata?.recentGames).toEqual([80, 85, 90]);
    });
  });

  describe('calculateInjuryRecoveryStatus', () => {
    it('should calculate injury impact for minor injury', () => {
      const result = PerformanceFactorCalculators.calculateInjuryRecoveryStatus(mockInput, mockContext);

      expect(result.factorId).toBe('injuryRecoveryStatus');
      expect(result.score).toBeGreaterThan(80); // Minor injury, close to return
      expect(result.confidence).toBe(0.9);
      expect(result.metadata?.severity).toBe('minor');
      expect(result.metadata?.daysSinceInjury).toBe(1);
    });

    it('should handle healthy player with no injury reports', () => {
      const healthyContext = {
        ...mockContext,
        externalData: { injuryReports: [] },
      };
      const result = PerformanceFactorCalculators.calculateInjuryRecoveryStatus(mockInput, healthyContext);

      expect(result.score).toBe(90); // Healthy baseline
      expect(result.metadata?.injuryStatus).toBe('healthy');
    });
  });

  describe('calculateRestAdvantage', () => {
    it('should calculate optimal rest advantage', () => {
      const result = PerformanceFactorCalculators.calculateRestAdvantage(mockInput, mockContext);

      expect(result.factorId).toBe('restAdvantage');
      expect(result.score).toBe(90); // 2 days rest is ideal
      expect(result.confidence).toBe(0.85);
      expect(result.metadata?.daysRest).toBe(2);
      expect(result.metadata?.isBackToBack).toBe(false);
    });
  });

  describe('calculateHomeAwaySplits', () => {
    it('should calculate home advantage for NBA', () => {
      const result = PerformanceFactorCalculators.calculateHomeAwaySplits(mockInput, mockContext);

      expect(result.factorId).toBe('homeAwaySplits');
      expect(result.score).toBe(73); // NBA home advantage: 65 + 8
      expect(result.confidence).toBe(0.8);
      expect(result.metadata?.venue).toBe('home');
      expect(result.metadata?.sport).toBe('NBA');
    });
  });
});

describe('RiskAssessmentCalculators', () => {
  let mockInput: GradingInput;
  let mockContext: FactorCalculationContext;

  beforeEach(() => {
    mockInput = {
      pickId: 'test-pick-123',
      tenantId: 'test-tenant',
      sport: 'NBA',
      marketType: 'points',
    };

    mockContext = {
      sport: 'NBA',
      timestamp: new Date('2025-01-15T12:00:00Z'),
      historicalData: {
        correlationRisk: 0.4,
        volatility: 6,
        bidAskSpread: 0.03,
      },
      externalData: {
        newsEvents: [
          { type: 'injury', impact: -0.3 },
          { type: 'trade', impact: 0.1 },
        ],
      },
    };
  });

  describe('calculateCorrelationRisk', () => {
    it('should calculate correlation risk score', () => {
      const result = RiskAssessmentCalculators.calculateCorrelationRisk(mockInput, mockContext);

      expect(result.factorId).toBe('correlation_risk');
      expect(result.score).toBe(60); // 100 - (0.4 * 100)
      expect(result.confidence).toBe(0.7);
      expect(result.metadata?.correlation).toBe(0.4);
    });
  });

  describe('calculateVolatilityRisk', () => {
    it('should calculate volatility risk score', () => {
      const result = RiskAssessmentCalculators.calculateVolatilityRisk(mockInput, mockContext);

      expect(result.factorId).toBe('volatility_risk');
      expect(result.score).toBe(40); // 100 - (6 * 10)
      expect(result.metadata?.volatility).toBe(6);
    });
  });

  describe('calculateExternalRisk', () => {
    it('should calculate external risk from news events', () => {
      const result = RiskAssessmentCalculators.calculateExternalRisk(mockInput, mockContext);

      expect(result.factorId).toBe('external_risk');
      expect(result.score).toBe(80); // 1 risk event (impact < -0.2) = 100 - 20
      expect(result.metadata?.riskEventCount).toBe(1);
    });
  });
});

describe('ProfessionalCapperCalculators', () => {
  let mockInput: GradingInput;
  let mockContext: FactorCalculationContext;

  beforeEach(() => {
    mockInput = {
      pickId: 'test-pick-123',
      tenantId: 'test-tenant',
      sport: 'NBA',
      marketType: 'player_props',
    };

    mockContext = {
      sport: 'NBA',
      timestamp: new Date('2025-01-15T12:00:00Z'),
      gameDate: new Date('2025-01-15T19:00:00Z'),
      historicalData: {
        lineMovement: -0.8,
      },
      marketData: {
        publicPercentage: 72,
        sharpAction: 88,
        volume: 2.5,
      },
    };
  });

  describe('calculateOptimalTiming', () => {
    it('should calculate optimal timing score', () => {
      const result = ProfessionalCapperCalculators.calculateOptimalTiming(mockInput, mockContext);

      expect(result.factorId).toBe('optimal_timing');
      expect(result.score).toBe(70); // 7 hours to game = good timing
      expect(result.confidence).toBe(0.85);
    });
  });

  describe('calculateContrarianOpportunity', () => {
    it('should calculate contrarian opportunity', () => {
      const result = ProfessionalCapperCalculators.calculateContrarianOpportunity(mockInput, mockContext);

      expect(result.factorId).toBe('contrarian_opportunity');
      // publicPct=72, sharpPct=28, contrarianScore=44, final=74
      expect(result.score).toBe(74);
      expect(result.metadata?.publicPercentage).toBe(72);
      expect(result.metadata?.contrarianScore).toBe(44);
    });
  });

  describe('calculateReverseLineMovement', () => {
    it('should detect reverse line movement', () => {
      const result = ProfessionalCapperCalculators.calculateReverseLineMovement(mockInput, mockContext);

      expect(result.factorId).toBe('reverse_line_movement');
      expect(result.score).toBe(80); // Public 72% > 60%, line movement -0.8 < 0 = reverse
      expect(result.metadata?.publicPercentage).toBe(72);
      expect(result.metadata?.lineMovement).toBe(-0.8);
    });
  });

  describe('calculateBetTypeEdge', () => {
    it('should calculate bet type edge for player props', () => {
      const result = ProfessionalCapperCalculators.calculateBetTypeEdge(mockInput, mockContext);

      expect(result.factorId).toBe('bet_type_edge');
      expect(result.score).toBe(75); // Player props are less efficient
      expect(result.confidence).toBe(0.9);
      expect(result.metadata?.marketType).toBe('player_props');
    });
  });

  describe('calculateSyndicateAction', () => {
    it('should detect syndicate action', () => {
      const result = ProfessionalCapperCalculators.calculateSyndicateAction(mockInput, mockContext);

      expect(result.factorId).toBe('syndicate_action');
      expect(result.score).toBe(85); // Sharp money 88 > 80, volume 2.5 > 2
      expect(result.metadata?.sharpMoney).toBe(88);
      expect(result.metadata?.volume).toBe(2.5);
    });
  });
});

describe('FactorCalculatorRegistry', () => {
  describe('getAvailableFactors', () => {
    it('should return list of available factors', () => {
      const factors = FactorCalculatorRegistry.getAvailableFactors();

      expect(factors).toContain('expected_value');
      expect(factors).toContain('line_movement');
      expect(factors).toContain('sharp_money');
      expect(factors).toContain('optimal_timing');
      expect(factors.length).toBeGreaterThan(20); // Should have many factors
    });
  });

  describe('isFactorSupported', () => {
    it('should identify supported factors', () => {
      expect(FactorCalculatorRegistry.isFactorSupported('expected_value')).toBe(true);
      expect(FactorCalculatorRegistry.isFactorSupported('nonexistent_factor')).toBe(false);
    });
  });

  describe('calculateAllFactors', () => {
    it('should calculate all enabled factors', () => {
      const mockInput: GradingInput = {
        pickId: 'test-pick-123',
        tenantId: 'test-tenant',
        sport: 'NBA',
        marketType: 'points',
      };

      const mockContext: FactorCalculationContext = {
        sport: 'NBA',
        timestamp: new Date('2025-01-15T12:00:00Z'),
        historicalData: { expectedValue: 5 },
      };

      const enabledFactors = ['expected_value', 'line_movement'];
      const results = FactorCalculatorRegistry.calculateAllFactors(
        mockInput,
        mockContext,
        enabledFactors
      );

      expect(results).toHaveLength(2);
      expect(results[0].factorId).toBe('expected_value');
      expect(results[1].factorId).toBe('line_movement');
      expect(results[0].contribution).toBeGreaterThan(0); // Should have calculated contribution
    });

    it('should handle calculation errors gracefully', () => {
      const mockInput: GradingInput = {
        pickId: 'test-pick-123',
        tenantId: 'test-tenant',
        sport: 'NBA',
        marketType: 'points',
      };

      const mockContext: FactorCalculationContext = {
        sport: 'NBA',
        timestamp: new Date('2025-01-15T12:00:00Z'),
      };

      // Include unsupported factor
      const enabledFactors = ['expected_value', 'unsupported_factor'];
      const results = FactorCalculatorRegistry.calculateAllFactors(
        mockInput,
        mockContext,
        enabledFactors
      );

      expect(results).toHaveLength(1); // Only supported factor
      expect(results[0].factorId).toBe('expected_value');
    });
  });
});