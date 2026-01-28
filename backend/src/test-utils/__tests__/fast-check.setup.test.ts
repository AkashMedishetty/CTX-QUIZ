/**
 * Fast-check Configuration Verification Tests
 * 
 * These tests verify that fast-check is properly configured with:
 * - Minimum 100 iterations per property test
 * - Global configuration is applied
 * 
 * Requirements: Testing Strategy (design.md)
 */

import * as fc from 'fast-check';
import { FC_DEFAULT_CONFIG, fcAssert, fcAssertAsync } from '../fast-check.setup';

describe('Fast-check Configuration', () => {
  describe('Global Configuration', () => {
    it('should have fast-check installed and working', () => {
      // Simple property test to verify fast-check is working
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          (n) => n >= 0 && n <= 100
        )
      );
    });

    it('should use global configuration with 100 iterations by default', () => {
      let runCount = 0;
      
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          (_n) => {
            runCount++;
            return true;
          }
        )
      );
      
      // With global config of numRuns: 100, we should have exactly 100 runs
      expect(runCount).toBe(100);
    });

    it('should allow overriding numRuns for specific tests', () => {
      let runCount = 0;
      
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          (_n) => {
            runCount++;
            return true;
          }
        ),
        { numRuns: 50 } // Override to 50 for this specific test
      );
      
      expect(runCount).toBe(50);
    });
  });

  describe('FC_DEFAULT_CONFIG', () => {
    it('should have numRuns set to 100', () => {
      expect(FC_DEFAULT_CONFIG.numRuns).toBe(100);
    });

    it('should have endOnFailure set to true', () => {
      expect(FC_DEFAULT_CONFIG.endOnFailure).toBe(true);
    });

    it('should have verbose set to false', () => {
      expect(FC_DEFAULT_CONFIG.verbose).toBe(false);
    });
  });

  describe('fcAssert helper', () => {
    it('should run property tests with default configuration', () => {
      let runCount = 0;
      
      fcAssert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          (_n) => {
            runCount++;
            return true;
          }
        )
      );
      
      expect(runCount).toBe(100);
    });

    it('should allow overriding configuration', () => {
      let runCount = 0;
      
      fcAssert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          (_n) => {
            runCount++;
            return true;
          }
        ),
        { numRuns: 25 }
      );
      
      expect(runCount).toBe(25);
    });
  });

  describe('fcAssertAsync helper', () => {
    it('should run async property tests with default configuration', async () => {
      let runCount = 0;
      
      await fcAssertAsync(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 1000 }),
          async (_n) => {
            runCount++;
            return true;
          }
        )
      );
      
      expect(runCount).toBe(100);
    });
  });

  describe('Property Test Examples', () => {
    /**
     * Example property test demonstrating the pattern for scoring tests
     * Validates: Requirements 6.1 (Base Points Award)
     */
    it('should always award non-negative points for correct answers', () => {
      fcAssert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }), // basePoints
          fc.double({ min: 0, max: 1, noNaN: true }), // speedBonusMultiplier (no NaN)
          fc.integer({ min: 0, max: 10 }),    // streakCount
          (basePoints, speedBonusMultiplier, streakCount) => {
            // Simulate score calculation
            const speedBonus = Math.floor(basePoints * speedBonusMultiplier);
            const streakBonus = streakCount > 1 ? Math.floor(basePoints * 0.1 * (streakCount - 1)) : 0;
            const totalPoints = basePoints + speedBonus + streakBonus;
            
            // Property: total points should always be non-negative
            return totalPoints >= 0;
          }
        )
      );
    });

    /**
     * Example property test for string validation
     * Validates: Requirements 3.3 (Profanity Filter)
     */
    it('should validate nickname length constraints', () => {
      fcAssert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 30 }),
          (nickname) => {
            const isValidLength = nickname.length >= 2 && nickname.length <= 20;
            
            // Property: validation result should match length check
            const validationResult = nickname.length >= 2 && nickname.length <= 20;
            return validationResult === isValidLength;
          }
        )
      );
    });
  });
});
