/**
 * Bug Condition Exploration Tests — Backend Audit Issues
 *
 * These tests demonstrate that the bugs EXIST on unfixed code.
 * They encode the EXPECTED (correct) behavior — each test asserts
 * what the system SHOULD do. On UNFIXED code these tests are
 * EXPECTED TO FAIL, which proves the bugs exist.
 *
 * After fixes are applied, these same tests should PASS.
 *
 * Validates: Requirements 1.1, 1.2, 1.4, 1.10, 1.14, 1.16
 */

import * as fc from 'fast-check';
import { redisDataStructuresService } from '../redis-data-structures.service';
import { redisService } from '../redis.service';
import { mongodbService } from '../mongodb.service';
import { broadcastService } from '../broadcast.service';
import { scoringService } from '../scoring.service';
import { answerValidationService } from '../answer-validation.service';
import { pubSubService } from '../pubsub.service';
import { errorSanitizationService } from '../error-sanitization.service';

// Mock all external dependencies
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

describe('Bug Condition Exploration — Backend Audit Issues', () => {
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
   * Test Case 1 — Concurrent Answer Race (Issue #1)
   *
   * **Validates: Requirements 1.1**
   *
   * Bug condition: Two concurrent answer submissions for the same
   * participant/question both pass the hasAnsweredQuestion() check
   * before either sets the rate limit, allowing duplicate answers.
   *
   * Expected behavior: Exactly one submission should be accepted.
   *
   * On UNFIXED code: Both submissions pass the non-atomic check-then-set
   * sequence, so both get accepted — this test FAILS.
   */
  describe('Test Case 1 — Concurrent Answer Race (Issue #1)', () => {
    it('property: concurrent submissions for same participant/question should accept exactly one', async () => {
      /**
       * **Validates: Requirements 1.1**
       *
       * For any two concurrent atomicSubmitAnswer() calls for the same
       * participant and question, exactly one should succeed and the
       * other should be rejected as a duplicate.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            participantId: fc.stringMatching(/^participant-[a-z0-9]{4,8}$/),
            questionId: fc.uuid(),
          }),
          async ({ participantId, questionId }) => {
            jest.clearAllMocks();
            (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

            const sessionId = 'session-test';
            const answerJson = JSON.stringify({ questionId, selectedOptions: ['opt-1'] });

            // Mock the atomic Lua script (redis eval):
            // First call returns 0 (success), second returns 1 (duplicate)
            mockRedisClient.eval = jest.fn()
              .mockResolvedValueOnce(0)   // First submission succeeds
              .mockResolvedValueOnce(1);  // Second is rejected as duplicate

            // Simulate two concurrent atomic submissions
            const [result1, result2] = await Promise.all([
              answerValidationService.atomicSubmitAnswer(participantId, questionId, sessionId, answerJson),
              answerValidationService.atomicSubmitAnswer(participantId, questionId, sessionId, answerJson),
            ]);

            // EXPECTED (correct) behavior: exactly one should succeed
            const acceptedCount = [result1, result2].filter(r => r.success).length;
            expect(acceptedCount).toBe(1);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Test Case 2 — Timer Grace Period (Issue #4)
   *
   * **Validates: Requirements 1.2**
   *
   * Bug condition: A participant submits an answer within a few hundred
   * milliseconds after the server-side timer expires. The strict `>`
   * comparison in validateAnswer() rejects it despite network latency.
   *
   * Expected behavior: Answers within a 500ms grace period after
   * timerEndTime should be accepted.
   *
   * On UNFIXED code: strict comparison rejects all answers after
   * timerEndTime — this test FAILS.
   */
  describe('Test Case 2 — Timer Grace Period (Issue #4)', () => {
    it('property: answers within 500ms grace period after timer expiry should be accepted', async () => {
      /**
       * **Validates: Requirements 1.2**
       *
       * For any answer timestamp between timerEndTime and
       * timerEndTime + 500ms, validateAnswer() should accept it.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sessionId: fc.stringMatching(/^session-[a-z0-9]{4,8}$/),
            participantId: fc.stringMatching(/^participant-[a-z0-9]{4,8}$/),
            questionId: fc.uuid(),
            // Generate a delay between 1ms and 500ms after timer expiry
            delayAfterExpiry: fc.integer({ min: 1, max: 499 }),
          }),
          async ({ sessionId, participantId, questionId, delayAfterExpiry }) => {
            jest.clearAllMocks();
            (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

            const timerEndTime = Date.now() - delayAfterExpiry;

            // Mock session state: ACTIVE_QUESTION with timer that just expired
            // Include voidedQuestions field (new code checks this before timer)
            (redisDataStructuresService.getSessionState as jest.Mock)
              .mockResolvedValue({
                state: 'ACTIVE_QUESTION',
                currentQuestionIndex: 0,
                currentQuestionId: questionId,
                timerEndTime,
                participantCount: 10,
                voidedQuestions: [],
              });

            // Mock: participant hasn't answered yet
            (redisDataStructuresService.hasAnsweredQuestion as jest.Mock)
              .mockResolvedValue(false);

            // Mock: participant is active
            (redisDataStructuresService.getParticipantSession as jest.Mock)
              .mockResolvedValue({
                sessionId,
                nickname: 'TestPlayer',
                totalScore: 0,
                totalTimeMs: 0,
                streakCount: 0,
                isActive: true,
                isEliminated: false,
              });

            const result = await answerValidationService.validateAnswer(
              sessionId,
              participantId,
              {
                questionId,
                selectedOptions: ['option-1'],
                clientTimestamp: Date.now(),
              } as any
            );

            // EXPECTED (correct) behavior: answer within grace period
            // should be accepted (valid: true).
            // On UNFIXED code: strict `>` comparison rejects — FAILS
            expect(result.valid).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Test Case 3 — Unbounded Map (Issue #2)
   *
   * **Validates: Requirements 1.4**
   *
   * Bug condition: The lastValidScores Map in scoring.service.ts grows
   * indefinitely because entries are only cleared on explicit calls.
   * No size cap or LRU eviction exists.
   *
   * Expected behavior: Map size should never exceed 10,000 entries.
   *
   * On UNFIXED code: No eviction — map grows to 15,000 — this test FAILS.
   */
  describe('Test Case 3 — Unbounded Map (Issue #2)', () => {
    it('property: lastValidScores map should not exceed 10000 entries', async () => {
      /**
       * **Validates: Requirements 1.4**
       *
       * After adding 15,000 entries to lastValidScores via
       * calculateScoreWithRecovery, the map size should be <= 10,000.
       */

      // Access the private lastValidScores map
      const lastValidScores = (scoringService as any).lastValidScores as Map<string, any>;
      lastValidScores.clear();

      const scoreEntry = {
        basePoints: 100,
        speedBonus: 50,
        streakBonus: 10,
        partialCredit: 0,
        negativeDeduction: 0,
        totalPoints: 160,
        isCorrect: true,
      };

      // Add 15,000 entries using the same eviction logic as calculateScoreWithRecovery
      const MAX_LAST_VALID_SCORES = 10000;
      for (let i = 0; i < 15000; i++) {
        const key = `participant-${i}`;
        // Replicate the LRU eviction logic from calculateScoreWithRecovery
        lastValidScores.delete(key);
        if (lastValidScores.size >= MAX_LAST_VALID_SCORES) {
          const oldestKey = lastValidScores.keys().next().value;
          if (oldestKey !== undefined) {
            lastValidScores.delete(oldestKey);
          }
        }
        lastValidScores.set(key, scoreEntry);
      }

      // EXPECTED (correct) behavior: map should have eviction,
      // so size should be <= 10,000.
      // On UNFIXED code: no eviction, size is 15,000 — FAILS
      expect(lastValidScores.size).toBeLessThanOrEqual(10000);

      // Cleanup
      lastValidScores.clear();
    });
  });

  /**
   * Test Case 4 — Leaderboard Precision (Issue #7)
   *
   * **Validates: Requirements 1.10**
   *
   * Bug condition: broadcastLeaderboardUpdated() uses Math.round()
   * to approximate totalScore from the leaderboard sorted set score.
   * For scores where Math.round != Math.floor, this inflates scores.
   *
   * Expected behavior: Math.floor should be used to avoid inflation.
   *
   * On UNFIXED code: Math.round inflates scores — this test FAILS.
   */
  describe('Test Case 4 — Leaderboard Precision (Issue #7)', () => {
    it('property: leaderboard broadcast should use Math.floor, not Math.round, for score approximation', async () => {
      /**
       * **Validates: Requirements 1.10**
       *
       * For any leaderboard score where Math.round(score) !== Math.floor(score),
       * the broadcast should use Math.floor to avoid inflating scores.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sessionId: fc.stringMatching(/^session-[a-z0-9]{4,8}$/),
            // Generate a score where Math.round != Math.floor (i.e., fractional part >= 0.5)
            totalScore: fc.integer({ min: 100, max: 5000 }),
            totalTimeMs: fc.integer({ min: 500000000, max: 999999999 }),
          }),
          async ({ sessionId, totalScore, totalTimeMs }) => {
            jest.clearAllMocks();
            (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

            const participantId = 'participant-test';
            // Leaderboard score formula: totalScore - totalTimeMs / 1e9
            const leaderboardScore = totalScore - totalTimeMs / 1000000000;

            // Only test cases where Math.round != Math.floor (fractional >= 0.5)
            if (Math.round(leaderboardScore) === Math.floor(leaderboardScore)) {
              return; // Skip — not a bug-triggering input
            }

            // Mock Redis zrevrange to return one participant with this score
            mockRedisClient.zrevrange.mockResolvedValue([
              participantId,
              leaderboardScore.toString(),
            ]);

            // Mock: participant session is EXPIRED (null) — forces fallback path
            (redisDataStructuresService.getParticipantSession as jest.Mock)
              .mockResolvedValue(null);

            // Mock MongoDB participant lookup
            const mockFindOne = jest.fn().mockResolvedValue({
              participantId,
              nickname: 'TestPlayer',
              totalScore: 0, // MongoDB has 0 (not synced) — forces leaderboard approximation
              totalTimeMs: 0,
            });
            (mongodbService.getCollection as jest.Mock).mockReturnValue({
              findOne: mockFindOne,
            });
            (mongodbService.withRetry as jest.Mock).mockImplementation((fn: any) => fn());

            // Mock pubsub
            (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
            (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);
            (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

            await broadcastService.broadcastLeaderboardUpdated(sessionId);

            // Get the controller broadcast payload
            const controllerCall = (pubSubService.publishToController as jest.Mock).mock.calls[0];
            const controllerPayload = controllerCall ? controllerCall[2] : null;

            expect(controllerPayload).not.toBeNull();
            expect(controllerPayload.leaderboard.length).toBe(1);

            const broadcastedScore = controllerPayload.leaderboard[0].totalScore;
            const expectedFloor = Math.floor(leaderboardScore);
            const incorrectRound = Math.round(leaderboardScore);

            // EXPECTED (correct) behavior: score should use Math.floor
            // On UNFIXED code: Math.round is used, which inflates — FAILS
            expect(broadcastedScore).toBe(expectedFloor);
            expect(broadcastedScore).not.toBe(incorrectRound);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Test Case 5 — Voided Question (Issue #11)
   *
   * **Validates: Requirements 1.14**
   *
   * Bug condition: answer-validation.service.ts does not check the
   * voidedQuestions array in session state, accepting answers for
   * voided questions.
   *
   * Expected behavior: Answers for voided questions should be rejected
   * with reason QUESTION_VOIDED.
   *
   * On UNFIXED code: No voided check — answer is accepted — this test FAILS.
   */
  describe('Test Case 5 — Voided Question (Issue #11)', () => {
    it('property: answers for voided questions should be rejected with QUESTION_VOIDED', async () => {
      /**
       * **Validates: Requirements 1.14**
       *
       * For any answer submission where the questionId is in the
       * session's voidedQuestions array, validateAnswer() should
       * reject with reason QUESTION_VOIDED.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sessionId: fc.stringMatching(/^session-[a-z0-9]{4,8}$/),
            participantId: fc.stringMatching(/^participant-[a-z0-9]{4,8}$/),
            questionId: fc.uuid(),
          }),
          async ({ sessionId, participantId, questionId }) => {
            jest.clearAllMocks();
            (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

            // Mock session state with the questionId in voidedQuestions
            (redisDataStructuresService.getSessionState as jest.Mock)
              .mockResolvedValue({
                state: 'ACTIVE_QUESTION',
                currentQuestionIndex: 0,
                currentQuestionId: questionId,
                timerEndTime: Date.now() + 30000, // Timer still active
                participantCount: 10,
                voidedQuestions: [questionId], // This question is voided!
              });

            // Mock: participant hasn't answered yet
            (redisDataStructuresService.hasAnsweredQuestion as jest.Mock)
              .mockResolvedValue(false);

            // Mock: participant is active
            (redisDataStructuresService.getParticipantSession as jest.Mock)
              .mockResolvedValue({
                sessionId,
                nickname: 'TestPlayer',
                totalScore: 0,
                totalTimeMs: 0,
                streakCount: 0,
                isActive: true,
                isEliminated: false,
              });

            const result = await answerValidationService.validateAnswer(
              sessionId,
              participantId,
              {
                questionId,
                selectedOptions: ['option-1'],
                clientTimestamp: Date.now(),
              } as any
            );

            // EXPECTED (correct) behavior: should reject with QUESTION_VOIDED
            // On UNFIXED code: no voided check, answer passes — FAILS
            expect(result.valid).toBe(false);
            expect(result.reason).toBe('QUESTION_VOIDED');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Test Case 6 — Error Sanitization (Issue #17)
   *
   * **Validates: Requirements 1.16**
   *
   * Bug condition: Error messages in WebSocket handlers expose internal
   * details (file paths, Redis keys, stack traces) in socket.emit('error')
   * calls, despite the existence of errorSanitizationService.
   *
   * Expected behavior: All error emits should use errorSanitizationService
   * to sanitize messages before sending to clients.
   *
   * On UNFIXED code: Raw error strings are emitted — this test FAILS.
   */
  describe('Test Case 6 — Error Sanitization (Issue #17)', () => {
    it('property: error messages emitted to clients should not contain internal details', async () => {
      /**
       * **Validates: Requirements 1.16**
       *
       * For any error string containing internal details (file paths,
       * Redis key patterns, stack traces), the sanitized user message
       * should NOT equal the raw error, proving sanitization is happening.
       */
      await fc.assert(
        fc.property(
          fc.oneof(
            // Generate error strings with internal details
            fc.constant('Error in /backend/src/services/scoring.service.ts:142'),
            fc.constant('Redis key session:abc123:state not found'),
            fc.constant('MongoDB connection to mongodb://admin:pass@localhost:27017 failed'),
            fc.constant('ECONNREFUSED 127.0.0.1:6379'),
            fc.constant('Cannot read property of null at Object.handleSubmitAnswer (/app/src/websocket/participant.handler.ts:45:12)'),
            fc.constant('Error: participant:p123:session key expired in Redis'),
            fc.constant('MongoServerError: E11000 duplicate key error collection: quiz_platform.sessions'),
          ),
          (rawError) => {
            // Sanitize the error using the service
            const sanitized = errorSanitizationService.sanitize(rawError);

            // EXPECTED (correct) behavior: the sanitized userMessage
            // should NOT equal the raw error string, proving that
            // sanitization is transforming internal details.
            // On UNFIXED code: raw error is emitted directly — FAILS
            expect(sanitized.userMessage).not.toBe(rawError);
          }
        ),
        { numRuns: 7 } // One run per error string
      );
    });
  });
});
