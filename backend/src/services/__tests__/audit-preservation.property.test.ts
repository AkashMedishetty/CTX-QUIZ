/**
 * Preservation Property Tests — Backend Audit Fixes
 *
 * These tests capture BASELINE behavior that must be preserved after the fixes.
 * They PASS on UNFIXED code and must continue to PASS after all fixes.
 *
 * Observation-first methodology: we observe the current (unfixed) behavior
 * and encode it as properties that the fixes must not break.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
 */

import * as fc from 'fast-check';
import { redisService } from '../redis.service';
import { redisDataStructuresService } from '../redis-data-structures.service';
import { mongodbService } from '../mongodb.service';
import { scoringService } from '../scoring.service';
import { QuizTimer } from '../quiz-timer.service';

// Mock all external dependencies
jest.mock('../redis.service');
jest.mock('../redis-data-structures.service');
jest.mock('../mongodb.service');
jest.mock('../pubsub.service', () => ({
  pubSubService: {
    publishToParticipants: jest.fn().mockResolvedValue(undefined),
    publishToBigScreen: jest.fn().mockResolvedValue(undefined),
    publishToController: jest.fn().mockResolvedValue(undefined),
    publishToParticipant: jest.fn().mockResolvedValue(undefined),
    broadcastToSession: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../performance-logging.service', () => ({
  performanceLoggingService: {
    startTimer: jest.fn(() => jest.fn()),
  },
}));
jest.mock('../quiz-timer.service', () => {
  const actual = jest.requireActual('../quiz-timer.service');
  return {
    ...actual,
    quizTimerManager: {
      createTimer: jest.fn(),
      stopAllTimersForSession: jest.fn(),
    },
  };
});
jest.mock('../metrics.service', () => ({
  metricsService: {
    recordMetric: jest.fn(),
  },
}));

describe('Preservation Property Tests — Backend Audit Fixes', () => {
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedisClient = {
      hset: jest.fn().mockResolvedValue('OK'),
      hgetall: jest.fn().mockResolvedValue({}),
      hget: jest.fn().mockResolvedValue(null),
      zadd: jest.fn().mockResolvedValue(1),
      zrevrange: jest.fn().mockResolvedValue([]),
      zrevrank: jest.fn().mockResolvedValue(null),
      zcard: jest.fn().mockResolvedValue(0),
      zscore: jest.fn().mockResolvedValue(null),
      lrange: jest.fn().mockResolvedValue([]),
      lpush: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(-2),
      exists: jest.fn().mockResolvedValue(0),
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn().mockResolvedValue(1),
    };

    (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);
  });

  /**
   * Property 1 — Scoring Preservation
   *
   * **Validates: Requirements 3.1, 3.2, 3.7**
   *
   * The scoring formulas (base points, speed bonus, streak bonus, partial credit)
   * must produce deterministic, identical results for the same inputs.
   * We test the pure calculation methods via the scoring service.
   */
  describe('Property 1 — Scoring Preservation', () => {
    it('property: calculateScore produces deterministic results with base + speed + streak + partial credit formulas', async () => {
      /**
       * **Validates: Requirements 3.7**
       *
       * For all valid answer inputs, calculateScore() returns identical results.
       * Scoring formulas: base points, speed bonus = base × multiplier × timeFactor,
       * streak bonus = base × 0.1 × (streak-1), partial credit = K/N × base.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            responseTimeMs: fc.integer({ min: 0, max: 30000 }),
            timeLimit: fc.integer({ min: 10, max: 60 }),
            basePoints: fc.integer({ min: 100, max: 1000 }),
            speedBonusMultiplierPct: fc.integer({ min: 0, max: 100 }),
            totalCorrectOptions: fc.integer({ min: 1, max: 6 }),
            selectedCorrectCount: fc.integer({ min: 0, max: 6 }),
            isFullyCorrect: fc.boolean(),
          }),
          async ({
            responseTimeMs,
            timeLimit,
            basePoints,
            speedBonusMultiplierPct,
            totalCorrectOptions,
            selectedCorrectCount,
            isFullyCorrect,
          }) => {
            const speedBonusMultiplier = speedBonusMultiplierPct / 100;

            // Test speed bonus determinism and formula
            const speedBonus1 = (scoringService as any).calculateSpeedBonus(
              responseTimeMs, timeLimit, basePoints, speedBonusMultiplier
            );
            const speedBonus2 = (scoringService as any).calculateSpeedBonus(
              responseTimeMs, timeLimit, basePoints, speedBonusMultiplier
            );
            expect(speedBonus1).toBe(speedBonus2);
            expect(speedBonus1).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(speedBonus1)).toBe(true);

            // Verify speed bonus formula: base × multiplier × max(0, 1 - responseTime / timeLimitMs)
            const timeLimitMs = timeLimit * 1000;
            const timeFactor = Math.max(0, 1.0 - responseTimeMs / timeLimitMs);
            const expectedSpeedBonus = Math.round(basePoints * speedBonusMultiplier * timeFactor);
            expect(speedBonus1).toBe(expectedSpeedBonus);

            // Test partial credit determinism and formula
            const actualSelected = Math.min(selectedCorrectCount, totalCorrectOptions);
            const correctOptions = Array.from({ length: totalCorrectOptions }, (_, i) => `opt-correct-${i}`);
            const selectedOptions = isFullyCorrect
              ? [...correctOptions]
              : correctOptions.slice(0, actualSelected);

            const partialCredit1 = (scoringService as any).calculatePartialCredit(
              selectedOptions, correctOptions, basePoints
            );
            const partialCredit2 = (scoringService as any).calculatePartialCredit(
              selectedOptions, correctOptions, basePoints
            );
            expect(partialCredit1).toBe(partialCredit2);
            expect(partialCredit1).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(partialCredit1)).toBe(true);

            // Verify partial credit formula: (K/N) × base
            if (!isFullyCorrect && actualSelected > 0) {
              const expectedPartialCredit = Math.round((actualSelected / totalCorrectOptions) * basePoints);
              expect(partialCredit1).toBe(expectedPartialCredit);
            }

            // Test isAnswerCorrect determinism
            const isCorrect1 = (scoringService as any).isAnswerCorrect(selectedOptions, correctOptions);
            const isCorrect2 = (scoringService as any).isAnswerCorrect(selectedOptions, correctOptions);
            expect(isCorrect1).toBe(isCorrect2);

            // If fully correct (same set), should be true
            if (isFullyCorrect) {
              expect(isCorrect1).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2 — Timer Preservation
   *
   * **Validates: Requirements 3.2**
   *
   * For all positive remaining values, getRemainingSeconds() returns
   * Math.ceil(remaining / 1000). This is the current baseline behavior
   * that must be preserved.
   */
  describe('Property 2 — Timer Preservation', () => {
    it('property: getRemainingSeconds returns Math.ceil(remaining / 1000) for positive remaining values', () => {
      /**
       * **Validates: Requirements 3.2**
       *
       * For all remaining > 0 (in ms), the timer returns Math.ceil(remaining / 1000).
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 30000 }), // remaining in ms (positive only)
          (remainingMs) => {
            // Create a timer with a known endTime in the future
            const timer = new QuizTimer({
              sessionId: 'test-session',
              questionId: 'test-question',
              timeLimit: 30,
              onTimerExpired: () => {},
            });

            // Set endTime so that remaining = remainingMs
            const now = Date.now();
            (timer as any).endTime = now + remainingMs;

            // Freeze Date.now for deterministic test
            const originalDateNow = Date.now;
            Date.now = () => now;

            try {
              const result = timer.getRemainingSeconds();

              // Current baseline behavior: Math.ceil(Math.max(0, remaining) / 1000)
              const expected = Math.ceil(remainingMs / 1000);
              expect(result).toBe(expected);

              // Result should always be positive for positive remaining
              expect(result).toBeGreaterThan(0);

              // Result should be an integer
              expect(Number.isInteger(result)).toBe(true);
            } finally {
              Date.now = originalDateNow;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property: getRemainingSeconds returns 0 for expired timers', () => {
      /**
       * **Validates: Requirements 3.2**
       *
       * When remaining <= 0, getRemainingSeconds returns 0.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 30000 }), // how far past expiry (ms)
          (pastExpiryMs) => {
            const timer = new QuizTimer({
              sessionId: 'test-session',
              questionId: 'test-question',
              timeLimit: 30,
              onTimerExpired: () => {},
            });

            const now = Date.now();
            (timer as any).endTime = now - pastExpiryMs;

            const originalDateNow = Date.now;
            Date.now = () => now;

            try {
              const result = timer.getRemainingSeconds();
              expect(result).toBe(0);
            } finally {
              Date.now = originalDateNow;
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 3 — Leaderboard Sort Preservation
   *
   * **Validates: Requirements 3.3, 3.4**
   *
   * Leaderboard sorting: totalScore descending, totalTimeMs ascending for ties.
   * The sorted set score formula: totalScore - (totalTimeMs / 1_000_000_000)
   * ensures higher scores rank first, and for equal scores, lower time ranks first.
   */
  describe('Property 3 — Leaderboard Sort Preservation', () => {
    it('property: sort order (score desc, time asc for ties) is consistent for random participants', () => {
      /**
       * **Validates: Requirements 3.3, 3.4**
       *
       * For any array of participant scores and totalTimeMs, the leaderboard
       * sort order is consistent: higher score first, lower time first for ties.
       */
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              participantId: fc.stringMatching(/^p-[a-z0-9]{4}$/),
              totalScore: fc.integer({ min: 0, max: 10000 }),
              totalTimeMs: fc.integer({ min: 0, max: 300000 }),
            }),
            { minLength: 2, maxLength: 50 }
          ),
          (participants) => {
            // Compute leaderboard scores using the formula
            const withLeaderboardScore = participants.map((p) => ({
              ...p,
              leaderboardScore: p.totalScore - p.totalTimeMs / 1_000_000_000,
            }));

            // Sort by leaderboard score descending (same as Redis ZREVRANGE)
            const sorted = [...withLeaderboardScore].sort(
              (a, b) => b.leaderboardScore - a.leaderboardScore
            );

            // Sort again to verify consistency (idempotent)
            const sortedAgain = [...withLeaderboardScore].sort(
              (a, b) => b.leaderboardScore - a.leaderboardScore
            );

            // Ordering must be identical
            for (let i = 0; i < sorted.length; i++) {
              expect(sorted[i].participantId).toBe(sortedAgain[i].participantId);
              expect(sorted[i].leaderboardScore).toBe(sortedAgain[i].leaderboardScore);
            }

            // Verify ordering invariants
            for (let i = 0; i < sorted.length - 1; i++) {
              const a = sorted[i];
              const b = sorted[i + 1];

              // Leaderboard score must be non-increasing
              expect(a.leaderboardScore).toBeGreaterThanOrEqual(b.leaderboardScore);

              // If totalScore differs, higher score ranks first
              if (a.totalScore > b.totalScore) {
                expect(a.leaderboardScore).toBeGreaterThan(b.leaderboardScore);
              }

              // If scores are equal, lower time ranks first (higher leaderboard score)
              if (a.totalScore === b.totalScore && a.totalTimeMs < b.totalTimeMs) {
                expect(a.leaderboardScore).toBeGreaterThan(b.leaderboardScore);
              }

              // If scores and times are equal, leaderboard scores are equal
              if (a.totalScore === b.totalScore && a.totalTimeMs === b.totalTimeMs) {
                expect(a.leaderboardScore).toBe(b.leaderboardScore);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4 — Session Recovery Preservation
   *
   * **Validates: Requirements 3.1, 3.3**
   *
   * Valid recovery within the 5-minute window restores correct data.
   * When participant session exists in Redis and session is not ENDED,
   * recoverSession() returns success with correct score, rank, and state.
   */
  describe('Property 4 — Session Recovery Preservation', () => {
    it('property: valid recovery within 5-minute window restores correct data', async () => {
      /**
       * **Validates: Requirements 3.1, 3.3**
       *
       * For all valid {participantId, sessionId} pairs where participant
       * exists in Redis and session is not ENDED, recoverSession() returns
       * success: true with correct totalScore, currentState, and streakCount.
       */
      // Use the real session-recovery service with mocked dependencies
      const { sessionRecoveryService } = jest.requireActual('../session-recovery.service') as any;

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            participantId: fc.stringMatching(/^participant-[a-z0-9]{4,8}$/),
            sessionId: fc.stringMatching(/^session-[a-z0-9]{4,8}$/),
            totalScore: fc.integer({ min: 0, max: 10000 }),
            streakCount: fc.integer({ min: 0, max: 10 }),
            totalTimeMs: fc.integer({ min: 0, max: 300000 }),
            state: fc.constantFrom('LOBBY', 'ACTIVE_QUESTION', 'REVEAL') as fc.Arbitrary<'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL'>,
          }),
          async ({ participantId, sessionId, totalScore, streakCount, totalTimeMs, state }) => {
            jest.clearAllMocks();
            (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

            // Mock session state: not ENDED
            (redisDataStructuresService.getSessionState as jest.Mock)
              .mockResolvedValue({
                state,
                currentQuestionIndex: 0,
                participantCount: 10,
                currentQuestionId: state === 'ACTIVE_QUESTION' ? 'q-1' : undefined,
                timerEndTime: state === 'ACTIVE_QUESTION' ? Date.now() + 15000 : undefined,
              });

            // Mock participant session: exists in Redis (within 5-min window)
            (redisDataStructuresService.getParticipantSession as jest.Mock)
              .mockResolvedValue({
                sessionId,
                nickname: 'TestPlayer',
                totalScore,
                totalTimeMs,
                streakCount,
                isActive: true,
                isEliminated: false,
              });

            // Mock: update participant session
            (redisDataStructuresService.updateParticipantSession as jest.Mock)
              .mockResolvedValue(undefined);

            // Mock: refresh TTL
            (redisDataStructuresService.refreshParticipantSession as jest.Mock)
              .mockResolvedValue(undefined);

            // Mock: participant rank
            (redisDataStructuresService.getParticipantRank as jest.Mock)
              .mockResolvedValue(3);

            // Mock: top leaderboard
            (redisDataStructuresService.getTopLeaderboard as jest.Mock)
              .mockResolvedValue([]);

            // Mock MongoDB for restoreParticipantActive
            const mockUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
            const mockFindOne = jest.fn().mockResolvedValue(null);
            (mongodbService.getDb as jest.Mock).mockReturnValue({
              collection: jest.fn().mockReturnValue({
                updateOne: mockUpdateOne,
                findOne: mockFindOne,
              }),
            });
            (mongodbService.getCollection as jest.Mock).mockReturnValue({
              findOne: mockFindOne,
            });

            const result = await sessionRecoveryService.recoverSession(
              participantId,
              sessionId
            );

            // Recovery should succeed
            expect(result.success).toBe(true);

            if (result.success) {
              // Restored data should match what was in Redis
              expect(result.data.totalScore).toBe(totalScore);
              expect(result.data.streakCount).toBe(streakCount);
              expect(result.data.currentState).toBe(state);
              expect(result.data.participantId).toBe(participantId);
              expect(result.data.isEliminated).toBe(false);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
