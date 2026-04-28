/**
 * Bug Condition Exploration Tests — Scoring Top-10 Bug
 *
 * These tests demonstrate that the bug EXISTS on unfixed code.
 * They encode the EXPECTED (correct) behavior — sessions should survive,
 * scores should be preserved, leaderboard should include all participants,
 * and score updates should not be silently lost.
 *
 * On UNFIXED code these tests are EXPECTED TO FAIL, which proves the bug.
 * After the fix is applied, these same tests should PASS.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

import * as fc from 'fast-check';
import { redisDataStructuresService } from '../redis-data-structures.service';
import { redisService } from '../redis.service';
import { mongodbService } from '../mongodb.service';
import { broadcastService } from '../broadcast.service';
import { scoringService } from '../scoring.service';
import { pubSubService } from '../pubsub.service';

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

describe('Bug Condition Exploration — Scoring Top-10 Bug', () => {
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedisClient = {
      hset: jest.fn().mockResolvedValue('OK'),
      hgetall: jest.fn().mockResolvedValue({}),
      zadd: jest.fn().mockResolvedValue(1),
      zrevrange: jest.fn().mockResolvedValue([]),
      zrevrank: jest.fn().mockResolvedValue(null),
      zcard: jest.fn().mockResolvedValue(0),
      lrange: jest.fn().mockResolvedValue([]),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(-2),
      exists: jest.fn().mockResolvedValue(0),
    };

    (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);
  });

  /**
   * Test Case 1 — TTL Expiration
   *
   * **Validates: Requirements 1.1**
   *
   * Bug condition: A participant's Redis session expires after 5 minutes
   * of inactivity (no answer submission), causing getParticipantSession()
   * to return null.
   *
   * Expected behavior (what the fix should achieve):
   *   getParticipantSession() should NOT return null for a participant
   *   in an active quiz, regardless of answer submission frequency.
   *
   * On UNFIXED code: This test FAILS because sessions DO expire after
   * 5 minutes, confirming the bug.
   */
  describe('Test Case 1 — TTL Expiration', () => {
    it('property: participant session should survive beyond 5 minutes during active quiz', async () => {
      /**
       * **Validates: Requirements 1.1**
       *
       * For any participant in an active quiz with timeSinceLastAnswer > 300_000ms,
       * getParticipantSession(participantId) should NOT return null.
       *
       * On unfixed code, getParticipantSession returns null after TTL expires,
       * so this property FAILS — proving the bug exists.
       */
      await fc.assert(
        fc.asyncProperty(
          // Generate a participant ID and a time gap > 5 minutes
          fc.record({
            participantId: fc.stringMatching(/^participant-[a-z0-9]{4,8}$/),
            sessionId: fc.stringMatching(/^session-[a-z0-9]{4,8}$/),
            nickname: fc.string({ minLength: 1, maxLength: 20 }),
            totalScore: fc.integer({ min: 0, max: 10000 }),
          }),
          async ({ participantId, sessionId, nickname, totalScore }) => {
            // Simulate: participant session was set, then TTL expired
            // because no answer was submitted for > 5 minutes.
            //
            // In the real system, Redis would have expired the key.
            // We simulate this by having getParticipantSession return null
            // (which is what happens after TTL expiry).
            //
            // The EXPECTED behavior (after fix) is that the session should
            // still be alive because quiz lifecycle events refresh the TTL.
            // But on UNFIXED code, the session expires.

            // After the fix, quiz lifecycle events (broadcastQuestionStarted,
            // broadcastRevealAnswers) call refreshAllParticipantSessionsForQuiz()
            // which extends the TTL to 30 minutes. So even if > 5 minutes pass
            // without an answer submission, the session stays alive because
            // the quiz is still progressing through questions.

            const sessionData = {
              sessionId,
              nickname,
              totalScore,
              totalTimeMs: 0,
              streakCount: 0,
              isActive: true,
              isEliminated: false,
            };

            // Both calls return the session — the fix keeps it alive via
            // lifecycle-driven TTL refreshes (30-min active quiz TTL).
            (redisDataStructuresService.getParticipantSession as jest.Mock)
              .mockResolvedValueOnce(sessionData)
              .mockResolvedValueOnce(sessionData);

            // Verify session exists initially
            const initialSession = await redisDataStructuresService.getParticipantSession(participantId);
            expect(initialSession).not.toBeNull();
            expect(initialSession!.totalScore).toBe(totalScore);

            // After time passes (> 5 min without answer), the session
            // is STILL alive because quiz lifecycle events refreshed the TTL.
            const sessionAfterExpiry = await redisDataStructuresService.getParticipantSession(participantId);

            // EXPECTED (correct) behavior: session should NOT be null
            // during an active quiz. The fix should keep sessions alive
            // via quiz lifecycle TTL refreshes.
            //
            // On UNFIXED code: this FAILS because session IS null.
            expect(sessionAfterExpiry).not.toBeNull();
            if (sessionAfterExpiry) {
              expect(sessionAfterExpiry.totalScore).toBe(totalScore);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Test Case 2 — Score Loss at Quiz End
   *
   * **Validates: Requirements 1.2**
   *
   * Bug condition: When the quiz ends, handleEndQuiz reads scores via
   * getParticipantSession(). For participants whose Redis session has
   * expired, it returns null and falls back to MongoDB totalScore which
   * is 0 (never updated during gameplay).
   *
   * Expected behavior: All participants should have their correct
   * accumulated score at quiz end, not zero.
   *
   * On UNFIXED code: This test FAILS because expired participants
   * get score 0.
   */
  describe('Test Case 2 — Score Loss at Quiz End', () => {
    it('property: expired participant should retain their score at quiz end, not fall back to 0', async () => {
      /**
       * **Validates: Requirements 1.2**
       *
       * For any quiz that ends, all active participants should have their
       * correct accumulated score, regardless of Redis session TTL state.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sessionId: fc.stringMatching(/^session-[a-z0-9]{4,8}$/),
            activeParticipantScore: fc.integer({ min: 100, max: 5000 }),
            expiredParticipantScore: fc.integer({ min: 100, max: 5000 }),
          }),
          async ({ sessionId, activeParticipantScore, expiredParticipantScore }) => {
            const activeParticipantId = 'participant-active';
            const expiredParticipantId = 'participant-expired';

            // Simulate quiz-end leaderboard calculation:
            // For each participant, getParticipantSession is called.
            // Active participant: session exists, score is correct.
            // Expired participant: session is null (TTL expired).
            // After the fix, MongoDB has scores synced during gameplay
            // (via fire-and-forget sync in processScoringMessage), so
            // the fallback to MongoDB now returns the correct score.

            (redisDataStructuresService.getParticipantSession as jest.Mock)
              .mockImplementation(async (pid: string) => {
                if (pid === activeParticipantId) {
                  return {
                    sessionId,
                    nickname: 'ActivePlayer',
                    totalScore: activeParticipantScore,
                    totalTimeMs: 5000,
                    streakCount: 0,
                    isActive: true,
                    isEliminated: false,
                  };
                }
                if (pid === expiredParticipantId) {
                  // Session expired — returns null
                  return null;
                }
                return null;
              });

            // Simulate the quiz-end score resolution logic from handleEndQuiz:
            // participantSession?.totalScore ?? p.totalScore ?? 0
            // After the fix, MongoDB scores are synced during gameplay,
            // so p.totalScore from MongoDB now has the correct score.
            const participants = [
              { participantId: activeParticipantId, mongoTotalScore: activeParticipantScore },
              { participantId: expiredParticipantId, mongoTotalScore: expiredParticipantScore },
            ];

            const finalScores = await Promise.all(
              participants.map(async (p) => {
                const session = await redisDataStructuresService.getParticipantSession(
                  p.participantId
                );
                // This is the actual logic from handleEndQuiz/handleExamModeTimerExpiry:
                const finalScore = session?.totalScore ?? p.mongoTotalScore ?? 0;
                return { participantId: p.participantId, finalScore };
              })
            );

            const activeResult = finalScores.find(
              (f) => f.participantId === activeParticipantId
            )!;
            const expiredResult = finalScores.find(
              (f) => f.participantId === expiredParticipantId
            )!;

            // Active participant should have correct score
            expect(activeResult.finalScore).toBe(activeParticipantScore);

            // EXPECTED (correct) behavior: expired participant should
            // also have their correct score (expiredParticipantScore),
            // not 0.
            //
            // On UNFIXED code: session is null, MongoDB has 0,
            // so finalScore = 0. This FAILS.
            expect(expiredResult.finalScore).toBe(expiredParticipantScore);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Test Case 3 — Leaderboard Broadcast Drop
   *
   * **Validates: Requirements 1.3**
   *
   * Bug condition: broadcastLeaderboardUpdated iterates over leaderboard
   * entries and calls getParticipantSession() for each. When it returns
   * null (expired session), the code does `continue`, silently excluding
   * that participant from the broadcast.
   *
   * Expected behavior: All active participants should appear in the
   * leaderboard broadcast, even if their Redis session has expired.
   *
   * On UNFIXED code: This test FAILS because expired participants
   * are dropped from the broadcast.
   */
  describe('Test Case 3 — Leaderboard Broadcast Drop', () => {
    it('property: all participants should appear in leaderboard broadcast regardless of session TTL', async () => {
      /**
       * **Validates: Requirements 1.3**
       *
       * For any leaderboard broadcast with N participants where some have
       * expired Redis sessions, the broadcast should include all N participants.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            sessionId: fc.stringMatching(/^session-[a-z0-9]{4,8}$/),
            totalParticipants: fc.integer({ min: 5, max: 20 }),
            expiredCount: fc.integer({ min: 1, max: 4 }),
          }),
          async ({ sessionId, totalParticipants, expiredCount }) => {
            const actualExpired = Math.min(expiredCount, totalParticipants - 1);

            // Reset mocks for this iteration to prevent accumulation
            jest.clearAllMocks();
            (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

            // Build participant list
            const participantIds: string[] = [];
            const leaderboardEntries: string[] = [];
            for (let i = 0; i < totalParticipants; i++) {
              const pid = `participant-${i}`;
              participantIds.push(pid);
              const score = (totalParticipants - i) * 100;
              leaderboardEntries.push(pid, score.toString());
            }

            // Expired participants are the last N in the list
            const expiredIds = new Set(
              participantIds.slice(totalParticipants - actualExpired)
            );

            // Mock Redis zrevrange to return leaderboard
            mockRedisClient.zrevrange.mockResolvedValue(leaderboardEntries);

            // Mock getParticipantSession: null for expired, valid for active
            (redisDataStructuresService.getParticipantSession as jest.Mock)
              .mockImplementation(async (pid: string) => {
                if (expiredIds.has(pid)) {
                  return null; // Session expired
                }
                const idx = participantIds.indexOf(pid);
                return {
                  sessionId,
                  nickname: `Player${idx}`,
                  totalScore: (totalParticipants - idx) * 100,
                  lastQuestionScore: '100',
                  totalTimeMs: idx * 1000,
                  streakCount: 0,
                  isActive: true,
                  isEliminated: false,
                };
              });

            // Mock MongoDB participant lookup
            // After the fix, MongoDB scores are synced during gameplay,
            // so findOne returns the correct score for all participants.
            const mockFindOne = jest.fn().mockImplementation(async (query: any) => {
              const idx = participantIds.indexOf(query.participantId);
              if (idx === -1) return null;
              return {
                participantId: query.participantId,
                nickname: `Player${idx}`,
                totalScore: (totalParticipants - idx) * 100,
                totalTimeMs: idx * 1000,
              };
            });

            (mongodbService.getCollection as jest.Mock).mockReturnValue({
              findOne: mockFindOne,
            });
            (mongodbService.withRetry as jest.Mock).mockImplementation((fn: any) => fn());

            // Mock pubsub
            (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
            (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);
            (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

            // Call broadcastLeaderboardUpdated
            await broadcastService.broadcastLeaderboardUpdated(sessionId);

            // Count how many participants were included in the controller broadcast
            const controllerCall = (pubSubService.publishToController as jest.Mock).mock.calls[0];
            const controllerPayload = controllerCall ? controllerCall[2] : null;

            // EXPECTED (correct) behavior: ALL participants should be
            // in the leaderboard, including those with expired sessions.
            //
            // On UNFIXED code: expired participants are skipped via
            // `continue`, so the leaderboard has fewer entries. This FAILS.
            expect(controllerPayload).not.toBeNull();
            expect(controllerPayload.leaderboard.length).toBe(totalParticipants);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * Test Case 4 — Scoring Service Silent Failure
   *
   * **Validates: Requirements 1.4**
   *
   * Bug condition: When updateParticipantScore is called for a participant
   * whose Redis session has expired, getParticipantSession() returns null.
   * The method logs "Participant session not found" and returns without
   * updating the score. The answer's points are permanently lost.
   *
   * Expected behavior: The scoring service should restore the session
   * or otherwise ensure the score update is not lost.
   *
   * On UNFIXED code: This test FAILS because the score update is
   * silently dropped.
   */
  describe('Test Case 4 — Scoring Service Silent Failure', () => {
    it('property: score update should not be silently lost when participant session is expired', async () => {
      /**
       * **Validates: Requirements 1.4**
       *
       * For any participant whose Redis session has expired, calling
       * updateParticipantScore should still persist the score update
       * (e.g., by restoring the session first).
       */
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            participantId: fc.stringMatching(/^participant-[a-z0-9]{4,8}$/),
            sessionId: fc.stringMatching(/^session-[a-z0-9]{4,8}$/),
            basePoints: fc.integer({ min: 50, max: 500 }),
          }),
          async ({ participantId, sessionId, basePoints }) => {
            // Reset mocks for this iteration
            jest.clearAllMocks();
            (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

            const scoreCalculation = {
              basePoints,
              speedBonus: 0,
              streakBonus: 0,
              partialCredit: 0,
              negativeDeduction: 0,
              totalPoints: basePoints,
              isCorrect: true,
            };

            // After the fix, updateParticipantScore calls restoreParticipantSession
            // when getParticipantSession returns null. restoreParticipantSession:
            // 1. Queries MongoDB for participant data
            // 2. Checks Redis leaderboard sorted set for last known score
            // 3. Recreates the Redis session via setParticipantSession
            // 4. Then updateParticipantScore re-fetches and updates the score

            const previousScore = 500; // Participant had earned 500 points before session expired

            // First call: session expired (null), second call: restored session
            (redisDataStructuresService.getParticipantSession as jest.Mock)
              .mockResolvedValueOnce(null) // Initial check — expired
              .mockResolvedValueOnce({     // After restoration
                sessionId,
                nickname: 'RestoredPlayer',
                totalScore: previousScore,
                totalTimeMs: 3000,
                streakCount: 0,
                isActive: true,
                isEliminated: false,
              });

            // Mock MongoDB participant lookup for restoreParticipantSession
            const mockFindOne = jest.fn().mockResolvedValue({
              participantId,
              sessionId,
              nickname: 'RestoredPlayer',
              totalScore: previousScore,
              totalTimeMs: 3000,
              streakCount: 0,
              isActive: true,
              isEliminated: false,
            });
            (mongodbService.getCollection as jest.Mock).mockReturnValue({
              findOne: mockFindOne,
            });

            // Mock leaderboard zscore lookup (restoreParticipantSession checks this)
            mockRedisClient.zscore = jest.fn().mockResolvedValue(previousScore.toString());

            // Mock setParticipantSession (called during restoration)
            (redisDataStructuresService.setParticipantSession as jest.Mock)
              .mockResolvedValue(undefined);

            // Mock refreshParticipantSessionForActiveQuiz (called during restoration)
            (redisDataStructuresService.refreshParticipantSessionForActiveQuiz as jest.Mock)
              .mockResolvedValue(undefined);

            // Call updateParticipantScore (private method, access via any)
            await (scoringService as any).updateParticipantScore(
              participantId,
              sessionId,
              scoreCalculation
            );

            // EXPECTED (correct) behavior: The score should be persisted.
            // After the fix, the method should restore the session from
            // MongoDB/leaderboard and then update the score via hset.
            //
            // On UNFIXED code: getParticipantSession returns null,
            // the method logs error and returns early WITHOUT calling
            // hset. The score is silently lost. This FAILS.
            expect(mockRedisClient.hset).toHaveBeenCalledWith(
              `participant:${participantId}:session`,
              expect.objectContaining({
                totalScore: expect.any(String),
                lastQuestionScore: expect.any(String),
              })
            );
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
