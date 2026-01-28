/**
 * Session Recovery Service Tests
 * 
 * Tests for session recovery functionality after participant disconnection
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import { redisService } from '../redis.service';
import { mongodbService } from '../mongodb.service';
import { redisDataStructuresService, SessionState, ParticipantSession } from '../redis-data-structures.service';
import { sessionRecoveryService } from '../session-recovery.service';
import { ObjectId } from 'mongodb';

describe('SessionRecoveryService', () => {
  const testSessionId = 'test-session-recovery-123';
  const testParticipantId = 'test-participant-recovery-456';
  const testQuizId = new ObjectId();
  const testQuestionId = 'test-question-789';

  beforeAll(async () => {
    await redisService.connect();
    await mongodbService.connect();
  });

  afterAll(async () => {
    await redisService.disconnect();
    await mongodbService.disconnect();
  });

  beforeEach(async () => {
    // Clear test data before each test
    const client = redisService.getClient();
    const keys = await client.keys('*');
    if (keys.length > 0) {
      await client.del(...keys);
    }

    // Clear MongoDB test data
    const db = mongodbService.getDb();
    await db.collection('sessions').deleteMany({ sessionId: testSessionId });
    await db.collection('participants').deleteMany({ participantId: testParticipantId });
    await db.collection('quizzes').deleteMany({ _id: testQuizId });
  });

  describe('recoverSession', () => {
    describe('Session Verification (Requirement 8.1)', () => {
      it('should fail recovery when session does not exist', async () => {
        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          'non-existent-session'
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe('SESSION_NOT_FOUND');
          expect(result.message).toContain('Session not found');
        }
      });

      it('should fail recovery when session has ended', async () => {
        // Set up ended session in Redis
        const sessionState: SessionState = {
          state: 'ENDED',
          currentQuestionIndex: 5,
          participantCount: 10,
        };
        await redisDataStructuresService.setSessionState(testSessionId, sessionState);

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe('SESSION_ENDED');
          expect(result.message).toContain('quiz has ended');
        }
      });

      it('should succeed when session is in LOBBY state', async () => {
        await setupValidSessionAndParticipant('LOBBY');

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.currentState).toBe('LOBBY');
        }
      });

      it('should succeed when session is in ACTIVE_QUESTION state', async () => {
        await setupValidSessionAndParticipant('ACTIVE_QUESTION');

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.currentState).toBe('ACTIVE_QUESTION');
        }
      });

      it('should succeed when session is in REVEAL state', async () => {
        await setupValidSessionAndParticipant('REVEAL');

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.currentState).toBe('REVEAL');
        }
      });
    });

    describe('Participant Verification (Requirement 8.2)', () => {
      it('should fail recovery when participant does not exist', async () => {
        // Set up session without participant
        const sessionState: SessionState = {
          state: 'LOBBY',
          currentQuestionIndex: 0,
          participantCount: 5,
        };
        await redisDataStructuresService.setSessionState(testSessionId, sessionState);

        const result = await sessionRecoveryService.recoverSession(
          'non-existent-participant',
          testSessionId
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe('PARTICIPANT_NOT_FOUND');
        }
      });

      it('should fail recovery when participant is banned', async () => {
        // Set up session
        const sessionState: SessionState = {
          state: 'LOBBY',
          currentQuestionIndex: 0,
          participantCount: 5,
        };
        await redisDataStructuresService.setSessionState(testSessionId, sessionState);

        // Set up participant in Redis
        const participantSession: ParticipantSession = {
          sessionId: testSessionId,
          nickname: 'BannedPlayer',
          totalScore: 100,
          totalTimeMs: 5000,
          streakCount: 2,
          isActive: false,
          isEliminated: false,
        };
        await redisDataStructuresService.setParticipantSession(testParticipantId, participantSession);

        // Set up banned participant in MongoDB
        const db = mongodbService.getDb();
        await db.collection('participants').insertOne({
          participantId: testParticipantId,
          sessionId: testSessionId,
          nickname: 'BannedPlayer',
          isBanned: true,
          isActive: false,
          isEliminated: false,
          totalScore: 100,
          totalTimeMs: 5000,
          streakCount: 2,
          joinedAt: new Date(),
          lastConnectedAt: new Date(),
        });

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe('PARTICIPANT_BANNED');
          expect(result.message).toContain('banned');
        }
      });

      it('should restore participant as active after recovery', async () => {
        await setupValidSessionAndParticipant('LOBBY');

        // Set participant as inactive
        await redisDataStructuresService.updateParticipantSession(testParticipantId, {
          isActive: false,
        });

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);

        // Verify participant is now active
        const participantSession = await redisDataStructuresService.getParticipantSession(
          testParticipantId
        );
        expect(participantSession?.isActive).toBe(true);
      });
    });

    describe('Current Question Recovery (Requirement 8.3)', () => {
      it('should return current question when in ACTIVE_QUESTION state', async () => {
        await setupValidSessionAndParticipantWithQuestion();

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.currentQuestion).not.toBeNull();
          expect(result.data.currentQuestion?.questionId).toBe(testQuestionId);
          expect(result.data.currentQuestion?.questionText).toBe('Test Question');
        }
      });

      it('should not include correct answer flags in recovered question', async () => {
        await setupValidSessionAndParticipantWithQuestion();

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);
        if (result.success && result.data.currentQuestion) {
          // Verify options don't have isCorrect field
          for (const option of result.data.currentQuestion.options) {
            expect(option).not.toHaveProperty('isCorrect');
          }
        }
      });

      it('should calculate remaining time from timerEndTime', async () => {
        const timerEndTime = Date.now() + 15000; // 15 seconds from now
        await setupValidSessionAndParticipantWithQuestion(timerEndTime);

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.remainingTime).not.toBeNull();
          expect(result.data.remainingTime).toBeGreaterThan(0);
          expect(result.data.remainingTime).toBeLessThanOrEqual(15);
        }
      });

      it('should return 0 remaining time when timer has expired', async () => {
        const timerEndTime = Date.now() - 5000; // 5 seconds ago
        await setupValidSessionAndParticipantWithQuestion(timerEndTime);

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.remainingTime).toBe(0);
        }
      });

      it('should return null for currentQuestion when in LOBBY state', async () => {
        await setupValidSessionAndParticipant('LOBBY');

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.currentQuestion).toBeNull();
          expect(result.data.remainingTime).toBeNull();
        }
      });
    });

    describe('Score and Rank Recovery (Requirement 8.4)', () => {
      it('should return participant score', async () => {
        await setupValidSessionAndParticipant('LOBBY');

        // Update participant score
        await redisDataStructuresService.updateParticipantSession(testParticipantId, {
          totalScore: 250,
        });

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.totalScore).toBe(250);
        }
      });

      it('should return participant rank', async () => {
        await setupValidSessionAndParticipant('LOBBY');

        // Add participants to leaderboard
        await redisDataStructuresService.updateLeaderboard(testSessionId, 'other-participant-1', 300, 5000);
        await redisDataStructuresService.updateLeaderboard(testSessionId, testParticipantId, 200, 4000);
        await redisDataStructuresService.updateLeaderboard(testSessionId, 'other-participant-2', 100, 6000);

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.rank).toBe(2); // Second place
        }
      });

      it('should return current leaderboard', async () => {
        await setupValidSessionAndParticipant('LOBBY');

        // Add participants to leaderboard
        await redisDataStructuresService.updateLeaderboard(testSessionId, 'participant-1', 300, 5000);
        await redisDataStructuresService.updateLeaderboard(testSessionId, 'participant-2', 200, 4000);
        await redisDataStructuresService.updateLeaderboard(testSessionId, 'participant-3', 100, 6000);

        // Set up participant sessions for leaderboard enrichment
        await redisDataStructuresService.setParticipantSession('participant-1', {
          sessionId: testSessionId,
          nickname: 'Player1',
          totalScore: 300,
          totalTimeMs: 5000,
          streakCount: 3,
          isActive: true,
          isEliminated: false,
        });
        await redisDataStructuresService.setParticipantSession('participant-2', {
          sessionId: testSessionId,
          nickname: 'Player2',
          totalScore: 200,
          totalTimeMs: 4000,
          streakCount: 2,
          isActive: true,
          isEliminated: false,
        });
        await redisDataStructuresService.setParticipantSession('participant-3', {
          sessionId: testSessionId,
          nickname: 'Player3',
          totalScore: 100,
          totalTimeMs: 6000,
          streakCount: 1,
          isActive: true,
          isEliminated: false,
        });

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.leaderboard).toHaveLength(3);
          expect(result.data.leaderboard[0].nickname).toBe('Player1');
          expect(result.data.leaderboard[0].rank).toBe(1);
        }
      });

      it('should return streak count', async () => {
        await setupValidSessionAndParticipant('LOBBY');

        // Update participant streak
        await redisDataStructuresService.updateParticipantSession(testParticipantId, {
          streakCount: 5,
        });

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.streakCount).toBe(5);
        }
      });

      it('should return elimination status', async () => {
        await setupValidSessionAndParticipant('LOBBY');

        // Mark participant as eliminated
        await redisDataStructuresService.updateParticipantSession(testParticipantId, {
          isEliminated: true,
        });

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isEliminated).toBe(true);
          expect(result.data.isSpectator).toBe(true);
        }
      });
    });

    describe('TTL Refresh', () => {
      it('should refresh participant session TTL on recovery', async () => {
        await setupValidSessionAndParticipant('LOBBY');

        // Get initial TTL
        const client = redisService.getClient();
        const initialTtl = await client.ttl(`participant:${testParticipantId}:session`);

        // Wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Recover session
        await sessionRecoveryService.recoverSession(testParticipantId, testSessionId);

        // Get TTL after recovery
        const newTtl = await client.ttl(`participant:${testParticipantId}:session`);

        // TTL should be refreshed (close to 300 seconds)
        expect(newTtl).toBeGreaterThanOrEqual(initialTtl);
      });
    });

    describe('Session Expiration (Requirement 8.5)', () => {
      it('should fail recovery when participant session has expired in Redis', async () => {
        // Set up session in Redis
        const sessionState: SessionState = {
          state: 'LOBBY',
          currentQuestionIndex: 0,
          participantCount: 5,
        };
        await redisDataStructuresService.setSessionState(testSessionId, sessionState);

        // Set up participant in MongoDB only (simulating expired Redis session)
        // with lastConnectedAt more than 5 minutes ago
        const db = mongodbService.getDb();
        const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
        
        await db.collection('participants').insertOne({
          participantId: testParticipantId,
          sessionId: testSessionId,
          nickname: 'ExpiredPlayer',
          isBanned: false,
          isActive: false,
          isEliminated: false,
          totalScore: 100,
          totalTimeMs: 5000,
          streakCount: 2,
          joinedAt: new Date(Date.now() - 30 * 60 * 1000), // Joined 30 minutes ago
          lastConnectedAt: sixMinutesAgo, // Last connected 6 minutes ago
        });

        // Do NOT set up participant in Redis (simulating TTL expiration)

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe('SESSION_EXPIRED');
          expect(result.message).toContain('session has expired');
          expect(result.message).toContain('rejoin');
        }
      });

      it('should allow recovery when participant was recently active (within 5 minutes)', async () => {
        // Set up session in Redis
        const sessionState: SessionState = {
          state: 'LOBBY',
          currentQuestionIndex: 0,
          participantCount: 5,
        };
        await redisDataStructuresService.setSessionState(testSessionId, sessionState);

        // Set up participant in MongoDB only with recent lastConnectedAt
        const db = mongodbService.getDb();
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        
        await db.collection('participants').insertOne({
          participantId: testParticipantId,
          sessionId: testSessionId,
          nickname: 'RecentPlayer',
          isBanned: false,
          isActive: false,
          isEliminated: false,
          totalScore: 100,
          totalTimeMs: 5000,
          streakCount: 2,
          joinedAt: new Date(Date.now() - 10 * 60 * 1000), // Joined 10 minutes ago
          lastConnectedAt: twoMinutesAgo, // Last connected 2 minutes ago
        });

        // Do NOT set up participant in Redis (simulating Redis restart/eviction)

        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        // Should succeed because lastConnectedAt is within 5 minutes
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.participantId).toBe(testParticipantId);
        }
      });

      it('should restore participant to Redis after successful recovery from MongoDB', async () => {
        // Set up session in Redis
        const sessionState: SessionState = {
          state: 'LOBBY',
          currentQuestionIndex: 0,
          participantCount: 5,
        };
        await redisDataStructuresService.setSessionState(testSessionId, sessionState);

        // Set up participant in MongoDB only with recent lastConnectedAt
        const db = mongodbService.getDb();
        const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
        
        await db.collection('participants').insertOne({
          participantId: testParticipantId,
          sessionId: testSessionId,
          nickname: 'RestoredPlayer',
          isBanned: false,
          isActive: false,
          isEliminated: false,
          totalScore: 250,
          totalTimeMs: 8000,
          streakCount: 3,
          joinedAt: new Date(Date.now() - 15 * 60 * 1000),
          lastConnectedAt: oneMinuteAgo,
        });

        // Verify participant is NOT in Redis before recovery
        const beforeRecovery = await redisDataStructuresService.getParticipantSession(testParticipantId);
        expect(beforeRecovery).toBeNull();

        // Recover session
        const result = await sessionRecoveryService.recoverSession(
          testParticipantId,
          testSessionId
        );

        expect(result.success).toBe(true);

        // Verify participant is now in Redis after recovery
        const afterRecovery = await redisDataStructuresService.getParticipantSession(testParticipantId);
        expect(afterRecovery).not.toBeNull();
        expect(afterRecovery?.nickname).toBe('RestoredPlayer');
        expect(afterRecovery?.totalScore).toBe(250);
        expect(afterRecovery?.isActive).toBe(true);
      });

      it('should set 5-minute TTL on restored participant session', async () => {
        // Set up session in Redis
        const sessionState: SessionState = {
          state: 'LOBBY',
          currentQuestionIndex: 0,
          participantCount: 5,
        };
        await redisDataStructuresService.setSessionState(testSessionId, sessionState);

        // Set up participant in MongoDB only
        const db = mongodbService.getDb();
        const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
        
        await db.collection('participants').insertOne({
          participantId: testParticipantId,
          sessionId: testSessionId,
          nickname: 'TTLTestPlayer',
          isBanned: false,
          isActive: false,
          isEliminated: false,
          totalScore: 100,
          totalTimeMs: 5000,
          streakCount: 2,
          joinedAt: new Date(Date.now() - 10 * 60 * 1000),
          lastConnectedAt: oneMinuteAgo,
        });

        // Recover session
        await sessionRecoveryService.recoverSession(testParticipantId, testSessionId);

        // Verify TTL is set to approximately 5 minutes (300 seconds)
        const client = redisService.getClient();
        const ttl = await client.ttl(`participant:${testParticipantId}:session`);
        
        // TTL should be close to 300 seconds (allow some tolerance)
        expect(ttl).toBeGreaterThan(290);
        expect(ttl).toBeLessThanOrEqual(300);
      });
    });
  });

  describe('canRecover', () => {
    it('should return true when recovery is possible', async () => {
      await setupValidSessionAndParticipant('LOBBY');

      const canRecover = await sessionRecoveryService.canRecover(
        testParticipantId,
        testSessionId
      );

      expect(canRecover).toBe(true);
    });

    it('should return false when session does not exist', async () => {
      const canRecover = await sessionRecoveryService.canRecover(
        testParticipantId,
        'non-existent-session'
      );

      expect(canRecover).toBe(false);
    });

    it('should return false when session has ended', async () => {
      const sessionState: SessionState = {
        state: 'ENDED',
        currentQuestionIndex: 5,
        participantCount: 10,
      };
      await redisDataStructuresService.setSessionState(testSessionId, sessionState);

      const canRecover = await sessionRecoveryService.canRecover(
        testParticipantId,
        testSessionId
      );

      expect(canRecover).toBe(false);
    });

    it('should return false when participant does not exist', async () => {
      const sessionState: SessionState = {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 5,
      };
      await redisDataStructuresService.setSessionState(testSessionId, sessionState);

      const canRecover = await sessionRecoveryService.canRecover(
        'non-existent-participant',
        testSessionId
      );

      expect(canRecover).toBe(false);
    });
  });

  describe('updateSocketId', () => {
    it('should update participant socket ID', async () => {
      await setupValidSessionAndParticipant('LOBBY');

      const newSocketId = 'new-socket-id-123';
      await sessionRecoveryService.updateSocketId(testParticipantId, newSocketId);

      const participantSession = await redisDataStructuresService.getParticipantSession(
        testParticipantId
      );

      expect(participantSession?.socketId).toBe(newSocketId);
    });
  });

  // Helper functions
  async function setupValidSessionAndParticipant(
    state: 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL'
  ): Promise<void> {
    // Set up session in Redis
    const sessionState: SessionState = {
      state,
      currentQuestionIndex: state === 'LOBBY' ? 0 : 1,
      participantCount: 5,
    };
    await redisDataStructuresService.setSessionState(testSessionId, sessionState);

    // Set up participant in Redis
    const participantSession: ParticipantSession = {
      sessionId: testSessionId,
      nickname: 'TestPlayer',
      totalScore: 100,
      totalTimeMs: 5000,
      streakCount: 2,
      isActive: true,
      isEliminated: false,
    };
    await redisDataStructuresService.setParticipantSession(testParticipantId, participantSession);

    // Set up participant in MongoDB (for ban check)
    const db = mongodbService.getDb();
    await db.collection('participants').insertOne({
      participantId: testParticipantId,
      sessionId: testSessionId,
      nickname: 'TestPlayer',
      isBanned: false,
      isActive: true,
      isEliminated: false,
      totalScore: 100,
      totalTimeMs: 5000,
      streakCount: 2,
      joinedAt: new Date(),
      lastConnectedAt: new Date(),
    });
  }

  async function setupValidSessionAndParticipantWithQuestion(
    timerEndTime?: number
  ): Promise<void> {
    // Set up quiz in MongoDB
    const db = mongodbService.getDb();
    await db.collection('quizzes').insertOne({
      _id: testQuizId,
      title: 'Test Quiz',
      description: 'Test quiz for recovery',
      quizType: 'REGULAR',
      questions: [
        {
          questionId: testQuestionId,
          questionText: 'Test Question',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          shuffleOptions: false,
          options: [
            { optionId: 'opt-1', optionText: 'Option A', isCorrect: true },
            { optionId: 'opt-2', optionText: 'Option B', isCorrect: false },
            { optionId: 'opt-3', optionText: 'Option C', isCorrect: false },
          ],
          scoring: {
            basePoints: 100,
            speedBonusMultiplier: 0.5,
            partialCreditEnabled: false,
          },
        },
      ],
      branding: {
        primaryColor: '#000000',
        secondaryColor: '#FFFFFF',
      },
      createdBy: 'test-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Set up session in MongoDB
    await db.collection('sessions').insertOne({
      sessionId: testSessionId,
      quizId: testQuizId,
      joinCode: 'ABC123',
      state: 'ACTIVE_QUESTION',
      currentQuestionIndex: 0,
      participantCount: 5,
      activeParticipants: [testParticipantId],
      eliminatedParticipants: [],
      voidedQuestions: [],
      createdAt: new Date(),
      hostId: 'test-host',
    });

    // Set up session in Redis
    const sessionState: SessionState = {
      state: 'ACTIVE_QUESTION',
      currentQuestionIndex: 0,
      currentQuestionId: testQuestionId,
      currentQuestionStartTime: Date.now() - 15000, // Started 15 seconds ago
      timerEndTime: timerEndTime || Date.now() + 15000, // 15 seconds remaining
      participantCount: 5,
    };
    await redisDataStructuresService.setSessionState(testSessionId, sessionState);

    // Set up participant in Redis
    const participantSession: ParticipantSession = {
      sessionId: testSessionId,
      nickname: 'TestPlayer',
      totalScore: 100,
      totalTimeMs: 5000,
      streakCount: 2,
      isActive: true,
      isEliminated: false,
    };
    await redisDataStructuresService.setParticipantSession(testParticipantId, participantSession);

    // Set up participant in MongoDB
    await db.collection('participants').insertOne({
      participantId: testParticipantId,
      sessionId: testSessionId,
      nickname: 'TestPlayer',
      isBanned: false,
      isActive: true,
      isEliminated: false,
      totalScore: 100,
      totalTimeMs: 5000,
      streakCount: 2,
      joinedAt: new Date(),
      lastConnectedAt: new Date(),
    });
  }
});
