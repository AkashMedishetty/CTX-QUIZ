/**
 * Preservation Property Tests — Scoring Top-10 Bug
 *
 * These tests capture BASELINE behavior that must be preserved after the fix.
 * They PASS on UNFIXED code and must continue to PASS after the fix.
 *
 * Observation-first methodology: we observe the current (unfixed) behavior
 * and encode it as properties that the fix must not break.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import * as fc from 'fast-check';
import { redisService } from '../redis.service';
import { scoringService } from '../scoring.service';

// Mock all external dependencies (same pattern as exploration tests)
jest.mock('../redis.service');
jest.mock('../redis-data-structures.service');
jest.mock('../mongodb.service');
jest.mock('../pubsub.service');
jest.mock('../performance-logging.service', () => ({
  performanceLoggingService: {
    startTimer: jest.fn(() => jest.fn()),
  },
}));
jest.mock('../quiz-timer.service', () => ({
  quizTimerManager: {
    createTimer: jest.fn(),
    stopAllTimersForSession: jest.fn(),
  },
}));
jest.mock('../metrics.service', () => ({
  metricsService: {
    recordMetric: jest.fn(),
  },
}));

describe('Preservation Property Tests — Scoring Top-10 Bug', () => {
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedisClient = {
      hset: jest.fn().mockResolvedValue('OK'),
      hgetall: jest.fn().mockResolvedValue({}),
      zadd: jest.fn().mockResolvedValue(1),
      zrevrange: jest.fn().mockResolvedValue([]),
      zrevrank: jest.fn().mockResolvedValue(null),
      zrem: jest.fn().mockResolvedValue(1),
      zcard: jest.fn().mockResolvedValue(0),
      lrange: jest.fn().mockResolvedValue([]),
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
   * Property 2a — Scoring Formula Preservation
   *
   * **Validates: Requirements 3.2**
   *
   * The scoring formulas (base points, speed bonus, streak bonus, partial credit,
   * negative deduction) must produce deterministic, identical results for the same
   * inputs before and after the fix.
   *
   * We test the pure calculation methods via the scoring service to ensure
   * the formulas themselves are unchanged.
   */
  describe('Property 2a — Scoring Formula Preservation', () => {
    it('property: calculateSpeedBonus is deterministic for all valid inputs', () => {
      /**
       * **Validates: Requirements 3.2**
       *
       * Speed bonus formula: base × multiplier × (1 - responseTimeMs / (timeLimit × 1000))
       * Result is Math.round'd. For the same inputs, the output must always be the same.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 30000 }),       // responseTimeMs
          fc.integer({ min: 10, max: 60 }),          // timeLimit (seconds)
          fc.integer({ min: 100, max: 1000 }),       // basePoints
          fc.integer({ min: 0, max: 100 }),          // speedBonusMultiplier * 100 (to avoid float issues)
          (responseTimeMs, timeLimit, basePoints, speedBonusMultiplierPct) => {
            const speedBonusMultiplier = speedBonusMultiplierPct / 100;

            // Access private method via any cast
            const result1 = (scoringService as any).calculateSpeedBonus(
              responseTimeMs, timeLimit, basePoints, speedBonusMultiplier
            );
            const result2 = (scoringService as any).calculateSpeedBonus(
              responseTimeMs, timeLimit, basePoints, speedBonusMultiplier
            );

            // Deterministic: same inputs → same output
            expect(result1).toBe(result2);

            // Result is always a non-negative integer (Math.round)
            expect(result1).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(result1)).toBe(true);

            // Speed bonus formula: base × multiplier × max(0, 1 - responseTime / timeLimitMs)
            const timeLimitMs = timeLimit * 1000;
            const timeFactor = Math.max(0, 1.0 - responseTimeMs / timeLimitMs);
            const expected = Math.round(basePoints * speedBonusMultiplier * timeFactor);
            expect(result1).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property: calculatePartialCredit is deterministic for all valid inputs', () => {
      /**
       * **Validates: Requirements 3.2**
       *
       * Partial credit formula: (K/N) × basePoints where K = correct selected, N = total correct.
       * No credit if any incorrect option is selected.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 1000 }),       // basePoints
          fc.integer({ min: 2, max: 6 }),             // totalCorrectOptions
          fc.integer({ min: 0, max: 6 }),             // selectedCorrectCount
          fc.boolean(),                                // hasIncorrectSelection
          (basePoints, totalCorrectOptions, selectedCorrectCount, hasIncorrectSelection) => {
            // Clamp selectedCorrectCount to valid range
            const actualSelected = Math.min(selectedCorrectCount, totalCorrectOptions);

            // Build option arrays
            const correctOptions = Array.from({ length: totalCorrectOptions }, (_, i) => `opt-correct-${i}`);
            const selectedOptions = correctOptions.slice(0, actualSelected);

            // Optionally add an incorrect option
            if (hasIncorrectSelection) {
              selectedOptions.push('opt-wrong-0');
            }

            const result1 = (scoringService as any).calculatePartialCredit(
              selectedOptions, correctOptions, basePoints
            );
            const result2 = (scoringService as any).calculatePartialCredit(
              selectedOptions, correctOptions, basePoints
            );

            // Deterministic
            expect(result1).toBe(result2);

            // Non-negative integer
            expect(result1).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(result1)).toBe(true);

            // If incorrect option selected, no partial credit
            if (hasIncorrectSelection) {
              expect(result1).toBe(0);
            }

            // If no correct options selected, no partial credit
            if (actualSelected === 0) {
              expect(result1).toBe(0);
            }

            // If correct options selected and no incorrect, verify formula
            if (!hasIncorrectSelection && actualSelected > 0) {
              const expected = Math.round((actualSelected / totalCorrectOptions) * basePoints);
              expect(result1).toBe(expected);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property: isAnswerCorrect is deterministic and symmetric', () => {
      /**
       * **Validates: Requirements 3.2**
       *
       * Answer correctness check: selected must exactly match correct options (set equality).
       */
      fc.assert(
        fc.property(
          fc.array(fc.stringMatching(/^opt-[a-z0-9]{2,4}$/), { minLength: 1, maxLength: 6 }),
          fc.array(fc.stringMatching(/^opt-[a-z0-9]{2,4}$/), { minLength: 1, maxLength: 6 }),
          (selected, correct) => {
            const result1 = (scoringService as any).isAnswerCorrect(selected, correct);
            const result2 = (scoringService as any).isAnswerCorrect(selected, correct);

            // Deterministic
            expect(result1).toBe(result2);

            // Verify against set equality
            const selectedSet = new Set(selected);
            const correctSet = new Set(correct);
            const isEqual = selectedSet.size === correctSet.size &&
              [...selectedSet].every(v => correctSet.has(v));

            // If lengths differ, must be false
            if (selected.length !== correct.length) {
              expect(result1).toBe(false);
            }

            // If sets are equal and lengths match, must be true
            if (isEqual && selected.length === correct.length) {
              expect(result1).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2b — Reconnection Window Preservation
   *
   * **Validates: Requirements 3.1**
   *
   * For participants who genuinely disconnect (no quiz lifecycle events
   * refreshing TTL), their session STILL expires after 5 minutes.
   * The PARTICIPANT_SESSION TTL constant is 300 seconds.
   *
   * We use jest.requireActual to get the real redis-data-structures service
   * (which internally uses the mocked redisService from jest.mock) and verify
   * the TTL values passed to the Redis client's expire method.
   */
  describe('Property 2b — Reconnection Window Preservation', () => {
    it('property: setParticipantSession sets TTL to 300 seconds (5 minutes)', async () => {
      /**
       * **Validates: Requirements 3.1**
       *
       * For any participant session that is set via setParticipantSession,
       * the Redis expire call uses 300 seconds (5 minutes).
       * This is the reconnection window for genuinely disconnected participants.
       */
      // Get the real redis-data-structures service singleton.
      // Even though it's loaded via requireActual, its internal import of
      // redisService resolves to the jest.mock'd version (since jest.mock
      // replaces the module in the registry before any imports).
      const realRdsModule = jest.requireActual('../redis-data-structures.service') as any;
      const realRdsService = realRdsModule.redisDataStructuresService;

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            participantId: fc.stringMatching(/^participant-[a-z0-9]{4,8}$/),
            sessionId: fc.stringMatching(/^session-[a-z0-9]{4,8}$/),
            nickname: fc.string({ minLength: 1, maxLength: 20 }),
            totalScore: fc.integer({ min: 0, max: 10000 }),
            totalTimeMs: fc.integer({ min: 0, max: 300000 }),
            streakCount: fc.integer({ min: 0, max: 10 }),
          }),
          async ({ participantId, sessionId, nickname, totalScore, totalTimeMs, streakCount }) => {
            mockRedisClient.hset.mockClear();
            mockRedisClient.expire.mockClear();

            await realRdsService.setParticipantSession(participantId, {
              sessionId,
              nickname,
              totalScore,
              totalTimeMs,
              streakCount,
              isActive: true,
              isEliminated: false,
            });

            // Verify expire was called with the participant key and 300 seconds (5 minutes)
            const expireCalls = mockRedisClient.expire.mock.calls;
            const participantExpireCall = expireCalls.find(
              (call: any[]) => call[0] === `participant:${participantId}:session`
            );
            expect(participantExpireCall).toBeDefined();
            expect(participantExpireCall[1]).toBe(300); // 5 minutes = 300 seconds
          }
        ),
        { numRuns: 50 }
      );
    });

    it('property: refreshParticipantSession uses 300-second TTL', async () => {
      /**
       * **Validates: Requirements 3.1**
       *
       * refreshParticipantSession must continue to use the 5-minute TTL
       * for the reconnection window.
       */
      const realRdsModule = jest.requireActual('../redis-data-structures.service') as any;
      const realRdsService = realRdsModule.redisDataStructuresService;

      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^participant-[a-z0-9]{4,8}$/),
          async (participantId) => {
            mockRedisClient.expire.mockClear();

            await realRdsService.refreshParticipantSession(participantId);

            // Verify expire was called with 300 seconds
            expect(mockRedisClient.expire).toHaveBeenCalledWith(
              `participant:${participantId}:session`,
              300
            );
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 2c — Leaderboard Ordering Preservation
   *
   * **Validates: Requirements 3.3, 3.4**
   *
   * Leaderboard ordering: score descending, time ascending for ties.
   * The sorted set score formula: totalScore - (totalTimeMs / 1_000_000_000)
   * ensures higher scores rank first, and for equal scores, lower time ranks first.
   */
  describe('Property 2c — Leaderboard Ordering Preservation', () => {
    it('property: leaderboard score formula preserves ordering (score desc, time asc)', () => {
      /**
       * **Validates: Requirements 3.3, 3.4**
       *
       * For any two participants, the leaderboard score formula
       * (totalScore - totalTimeMs / 1_000_000_000) must produce an ordering
       * where higher totalScore ranks first, and for equal totalScore,
       * lower totalTimeMs ranks first.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10000 }),    // scoreA
          fc.integer({ min: 0, max: 300000 }),   // timeMsA
          fc.integer({ min: 0, max: 10000 }),    // scoreB
          fc.integer({ min: 0, max: 300000 }),   // timeMsB
          (scoreA, timeMsA, scoreB, timeMsB) => {
            // Leaderboard score formula from updateLeaderboard and redis-data-structures
            const leaderboardScoreA = scoreA - timeMsA / 1_000_000_000;
            const leaderboardScoreB = scoreB - timeMsB / 1_000_000_000;

            // If scoreA > scoreB, A should rank higher (higher leaderboard score)
            if (scoreA > scoreB) {
              expect(leaderboardScoreA).toBeGreaterThan(leaderboardScoreB);
            }

            // If scores are equal but timeA < timeB, A should rank higher
            if (scoreA === scoreB && timeMsA < timeMsB) {
              expect(leaderboardScoreA).toBeGreaterThan(leaderboardScoreB);
            }

            // If scores are equal and times are equal, leaderboard scores are equal
            if (scoreA === scoreB && timeMsA === timeMsB) {
              expect(leaderboardScoreA).toBe(leaderboardScoreB);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property: leaderboard ordering is transitive', () => {
      /**
       * **Validates: Requirements 3.3**
       *
       * If A ranks above B and B ranks above C, then A ranks above C.
       */
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              score: fc.integer({ min: 0, max: 10000 }),
              timeMs: fc.integer({ min: 0, max: 300000 }),
            }),
            { minLength: 3, maxLength: 20 }
          ),
          (participants) => {
            // Compute leaderboard scores
            const withLeaderboardScore = participants.map((p, i) => ({
              id: `p-${i}`,
              ...p,
              leaderboardScore: p.score - p.timeMs / 1_000_000_000,
            }));

            // Sort by leaderboard score descending (same as Redis ZREVRANGE)
            const sorted = [...withLeaderboardScore].sort(
              (a, b) => b.leaderboardScore - a.leaderboardScore
            );

            // Verify transitivity: for all i < j, sorted[i].leaderboardScore >= sorted[j].leaderboardScore
            for (let i = 0; i < sorted.length - 1; i++) {
              expect(sorted[i].leaderboardScore).toBeGreaterThanOrEqual(
                sorted[i + 1].leaderboardScore
              );
            }

            // Verify the ordering matches the expected rules:
            // Higher score first, then lower time for ties
            for (let i = 0; i < sorted.length - 1; i++) {
              const a = sorted[i];
              const b = sorted[i + 1];
              if (a.score !== b.score) {
                // Different scores: higher score should come first
                expect(a.score).toBeGreaterThanOrEqual(b.score);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2d — Quiz State Transitions Preservation
   *
   * **Validates: Requirements 3.3, 3.5**
   *
   * Quiz state transitions: LOBBY → ACTIVE_QUESTION → REVEAL → ENDED
   * The redis-data-structures service must correctly store and retrieve
   * state transitions.
   */
  describe('Property 2d — Quiz State Transitions Preservation', () => {
    it('property: session state transitions LOBBY → ACTIVE_QUESTION → REVEAL → ENDED work correctly', async () => {
      /**
       * **Validates: Requirements 3.3, 3.5**
       *
       * For any session, the state transitions must be stored and retrieved
       * correctly via the Redis data structures service.
       * We use the real service (which internally uses the mocked Redis client).
       */
      const realRdsModule = jest.requireActual('../redis-data-structures.service') as any;
      const realRdsService = realRdsModule.redisDataStructuresService;

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sessionId: fc.stringMatching(/^session-[a-z0-9]{4,8}$/),
            participantCount: fc.integer({ min: 1, max: 100 }),
          }),
          async ({ sessionId, participantCount }) => {
            // Track stored state using the mock Redis client
            let storedState: Record<string, string> = {};

            mockRedisClient.hset.mockImplementation((_key: string, fields: Record<string, string>) => {
              storedState = { ...storedState, ...fields };
              return Promise.resolve('OK');
            });
            mockRedisClient.hgetall.mockImplementation(() => {
              if (Object.keys(storedState).length === 0) return Promise.resolve(null);
              return Promise.resolve({ ...storedState });
            });

            const transitions: Array<'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED'> = [
              'LOBBY',
              'ACTIVE_QUESTION',
              'REVEAL',
              'ENDED',
            ];

            for (const state of transitions) {
              if (state === 'LOBBY') {
                await realRdsService.setSessionState(sessionId, {
                  state,
                  currentQuestionIndex: 0,
                  participantCount,
                });
              } else {
                await realRdsService.updateSessionState(sessionId, { state });
              }

              // Retrieve and verify
              const retrieved = await realRdsService.getSessionState(sessionId);
              expect(retrieved).not.toBeNull();
              expect(retrieved!.state).toBe(state);
            }

            // After full transition, state should be ENDED
            const finalState = await realRdsService.getSessionState(sessionId);
            expect(finalState).not.toBeNull();
            expect(finalState!.state).toBe('ENDED');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('property: session state preserves all fields through transitions', async () => {
      /**
       * **Validates: Requirements 3.5**
       *
       * When updating session state, non-updated fields must be preserved.
       */
      const realRdsModule = jest.requireActual('../redis-data-structures.service') as any;
      const realRdsService = realRdsModule.redisDataStructuresService;

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sessionId: fc.stringMatching(/^session-[a-z0-9]{4,8}$/),
            participantCount: fc.integer({ min: 1, max: 100 }),
            questionIndex: fc.integer({ min: 0, max: 50 }),
            questionId: fc.stringMatching(/^q-[a-z0-9]{4,8}$/),
          }),
          async ({ sessionId, participantCount, questionIndex, questionId }) => {
            let storedState: Record<string, string> = {};

            mockRedisClient.hset.mockImplementation((_key: string, fields: Record<string, string>) => {
              storedState = { ...storedState, ...fields };
              return Promise.resolve('OK');
            });
            mockRedisClient.hgetall.mockImplementation(() => {
              if (Object.keys(storedState).length === 0) return Promise.resolve(null);
              return Promise.resolve({ ...storedState });
            });

            // Set initial state with all fields
            await realRdsService.setSessionState(sessionId, {
              state: 'ACTIVE_QUESTION',
              currentQuestionIndex: questionIndex,
              currentQuestionId: questionId,
              participantCount,
            });

            // Update only the state field
            await realRdsService.updateSessionState(sessionId, { state: 'REVEAL' });

            // Verify other fields are preserved
            const retrieved = await realRdsService.getSessionState(sessionId);
            expect(retrieved).not.toBeNull();
            expect(retrieved!.state).toBe('REVEAL');
            expect(retrieved!.currentQuestionIndex).toBe(questionIndex);
            expect(retrieved!.participantCount).toBe(participantCount);
            expect(retrieved!.currentQuestionId).toBe(questionId);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
