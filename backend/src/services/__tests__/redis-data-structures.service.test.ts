/**
 * Redis Data Structures Service Tests
 * 
 * Tests for Redis data structures used in session state management
 */

import { redisService } from '../redis.service';
import {
  redisDataStructuresService,
  SessionState,
  ParticipantSession,
  Answer,
} from '../redis-data-structures.service';

describe('RedisDataStructuresService', () => {
  beforeAll(async () => {
    await redisService.connect();
  });

  afterAll(async () => {
    await redisService.disconnect();
  });

  beforeEach(async () => {
    // Clear test data before each test
    const client = redisService.getClient();
    const keys = await client.keys('*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  });

  describe('Session State Operations', () => {
    const sessionId = 'test-session-123';

    it('should set and get session state', async () => {
      const state: SessionState = {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 5,
      };

      await redisDataStructuresService.setSessionState(sessionId, state);
      const retrieved = await redisDataStructuresService.getSessionState(sessionId);

      expect(retrieved).toEqual(state);
    });

    it('should set session state with all optional fields', async () => {
      const state: SessionState = {
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: 2,
        currentQuestionId: 'question-456',
        currentQuestionStartTime: Date.now(),
        timerEndTime: Date.now() + 30000,
        participantCount: 10,
        voidedQuestions: ['question-1', 'question-2'],
      };

      await redisDataStructuresService.setSessionState(sessionId, state);
      const retrieved = await redisDataStructuresService.getSessionState(sessionId);

      expect(retrieved).toEqual(state);
    });

    it('should return null for non-existent session state', async () => {
      const retrieved = await redisDataStructuresService.getSessionState('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should update specific session state fields', async () => {
      const initialState: SessionState = {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 5,
      };

      await redisDataStructuresService.setSessionState(sessionId, initialState);

      await redisDataStructuresService.updateSessionState(sessionId, {
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: 1,
        currentQuestionId: 'question-789',
      });

      const updated = await redisDataStructuresService.getSessionState(sessionId);

      expect(updated).toEqual({
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: 1,
        currentQuestionId: 'question-789',
        participantCount: 5,
      });
    });

    it('should delete session state', async () => {
      const state: SessionState = {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 5,
      };

      await redisDataStructuresService.setSessionState(sessionId, state);
      await redisDataStructuresService.deleteSessionState(sessionId);

      const retrieved = await redisDataStructuresService.getSessionState(sessionId);
      expect(retrieved).toBeNull();
    });

    it('should set TTL on session state', async () => {
      const state: SessionState = {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 5,
      };

      await redisDataStructuresService.setSessionState(sessionId, state);

      const client = redisService.getClient();
      const ttl = await client.ttl(`session:${sessionId}:state`);

      // TTL should be set (6 hours = 21600 seconds)
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(21600);
    });
  });

  describe('Participant Session Operations', () => {
    const participantId = 'participant-123';

    it('should set and get participant session', async () => {
      const session: ParticipantSession = {
        sessionId: 'session-456',
        nickname: 'TestPlayer',
        totalScore: 100,
        totalTimeMs: 5000,
        streakCount: 3,
        isActive: true,
        isEliminated: false,
      };

      await redisDataStructuresService.setParticipantSession(participantId, session);
      const retrieved = await redisDataStructuresService.getParticipantSession(participantId);

      expect(retrieved).toEqual(session);
    });

    it('should set participant session with socket ID', async () => {
      const session: ParticipantSession = {
        sessionId: 'session-456',
        nickname: 'TestPlayer',
        totalScore: 100,
        totalTimeMs: 5000,
        streakCount: 3,
        isActive: true,
        isEliminated: false,
        socketId: 'socket-789',
      };

      await redisDataStructuresService.setParticipantSession(participantId, session);
      const retrieved = await redisDataStructuresService.getParticipantSession(participantId);

      expect(retrieved).toEqual(session);
    });

    it('should return null for non-existent participant session', async () => {
      const retrieved = await redisDataStructuresService.getParticipantSession('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should update participant session fields', async () => {
      const initialSession: ParticipantSession = {
        sessionId: 'session-456',
        nickname: 'TestPlayer',
        totalScore: 100,
        totalTimeMs: 5000,
        streakCount: 3,
        isActive: true,
        isEliminated: false,
      };

      await redisDataStructuresService.setParticipantSession(participantId, initialSession);

      await redisDataStructuresService.updateParticipantSession(participantId, {
        totalScore: 150,
        streakCount: 4,
      });

      const updated = await redisDataStructuresService.getParticipantSession(participantId);

      expect(updated).toEqual({
        ...initialSession,
        totalScore: 150,
        streakCount: 4,
      });
    });

    it('should refresh participant session TTL', async () => {
      const session: ParticipantSession = {
        sessionId: 'session-456',
        nickname: 'TestPlayer',
        totalScore: 100,
        totalTimeMs: 5000,
        streakCount: 3,
        isActive: true,
        isEliminated: false,
      };

      await redisDataStructuresService.setParticipantSession(participantId, session);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      await redisDataStructuresService.refreshParticipantSession(participantId);

      const client = redisService.getClient();
      const ttl = await client.ttl(`participant:${participantId}:session`);

      // TTL should be refreshed (5 minutes = 300 seconds)
      expect(ttl).toBeGreaterThan(290);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('should delete participant session', async () => {
      const session: ParticipantSession = {
        sessionId: 'session-456',
        nickname: 'TestPlayer',
        totalScore: 100,
        totalTimeMs: 5000,
        streakCount: 3,
        isActive: true,
        isEliminated: false,
      };

      await redisDataStructuresService.setParticipantSession(participantId, session);
      await redisDataStructuresService.deleteParticipantSession(participantId);

      const retrieved = await redisDataStructuresService.getParticipantSession(participantId);
      expect(retrieved).toBeNull();
    });

    it('should set TTL on participant session', async () => {
      const session: ParticipantSession = {
        sessionId: 'session-456',
        nickname: 'TestPlayer',
        totalScore: 100,
        totalTimeMs: 5000,
        streakCount: 3,
        isActive: true,
        isEliminated: false,
      };

      await redisDataStructuresService.setParticipantSession(participantId, session);

      const client = redisService.getClient();
      const ttl = await client.ttl(`participant:${participantId}:session`);

      // TTL should be set (5 minutes = 300 seconds)
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    describe('Session Expiration (Requirement 8.5)', () => {
      it('should check if participant session is active', async () => {
        const session: ParticipantSession = {
          sessionId: 'session-456',
          nickname: 'TestPlayer',
          totalScore: 100,
          totalTimeMs: 5000,
          streakCount: 3,
          isActive: true,
          isEliminated: false,
        };

        // Before setting session
        const isActiveBefore = await redisDataStructuresService.isParticipantSessionActive(participantId);
        expect(isActiveBefore).toBe(false);

        // After setting session
        await redisDataStructuresService.setParticipantSession(participantId, session);
        const isActiveAfter = await redisDataStructuresService.isParticipantSessionActive(participantId);
        expect(isActiveAfter).toBe(true);
      });

      it('should return false for expired participant session', async () => {
        const session: ParticipantSession = {
          sessionId: 'session-456',
          nickname: 'TestPlayer',
          totalScore: 100,
          totalTimeMs: 5000,
          streakCount: 3,
          isActive: true,
          isEliminated: false,
        };

        await redisDataStructuresService.setParticipantSession(participantId, session);

        // Delete the session to simulate expiration
        await redisDataStructuresService.deleteParticipantSession(participantId);

        const isActive = await redisDataStructuresService.isParticipantSessionActive(participantId);
        expect(isActive).toBe(false);
      });

      it('should get participant session TTL', async () => {
        const session: ParticipantSession = {
          sessionId: 'session-456',
          nickname: 'TestPlayer',
          totalScore: 100,
          totalTimeMs: 5000,
          streakCount: 3,
          isActive: true,
          isEliminated: false,
        };

        await redisDataStructuresService.setParticipantSession(participantId, session);

        const ttl = await redisDataStructuresService.getParticipantSessionTTL(participantId);

        // TTL should be close to 300 seconds (5 minutes)
        expect(ttl).toBeGreaterThan(290);
        expect(ttl).toBeLessThanOrEqual(300);
      });

      it('should return -2 for non-existent participant session TTL', async () => {
        const ttl = await redisDataStructuresService.getParticipantSessionTTL('non-existent-participant');
        expect(ttl).toBe(-2);
      });

      it('should refresh TTL on participant activity', async () => {
        const session: ParticipantSession = {
          sessionId: 'session-456',
          nickname: 'TestPlayer',
          totalScore: 100,
          totalTimeMs: 5000,
          streakCount: 3,
          isActive: true,
          isEliminated: false,
        };

        await redisDataStructuresService.setParticipantSession(participantId, session);

        // Wait a bit to let TTL decrease
        await new Promise((resolve) => setTimeout(resolve, 1100));

        // Get TTL before refresh
        const ttlBefore = await redisDataStructuresService.getParticipantSessionTTL(participantId);
        expect(ttlBefore).toBeLessThan(300);

        // Refresh TTL
        await redisDataStructuresService.refreshParticipantSession(participantId);

        // Get TTL after refresh
        const ttlAfter = await redisDataStructuresService.getParticipantSessionTTL(participantId);

        // TTL should be refreshed back to ~300 seconds
        expect(ttlAfter).toBeGreaterThan(ttlBefore);
        expect(ttlAfter).toBeGreaterThan(298);
      });

      it('should refresh TTL on participant session update', async () => {
        const session: ParticipantSession = {
          sessionId: 'session-456',
          nickname: 'TestPlayer',
          totalScore: 100,
          totalTimeMs: 5000,
          streakCount: 3,
          isActive: true,
          isEliminated: false,
        };

        await redisDataStructuresService.setParticipantSession(participantId, session);

        // Wait a bit to let TTL decrease
        await new Promise((resolve) => setTimeout(resolve, 1100));

        // Get TTL before update
        const ttlBefore = await redisDataStructuresService.getParticipantSessionTTL(participantId);
        expect(ttlBefore).toBeLessThan(300);

        // Update participant session (simulating activity)
        await redisDataStructuresService.updateParticipantSession(participantId, {
          totalScore: 150,
        });

        // Get TTL after update
        const ttlAfter = await redisDataStructuresService.getParticipantSessionTTL(participantId);

        // TTL should be refreshed back to ~300 seconds
        expect(ttlAfter).toBeGreaterThan(ttlBefore);
        expect(ttlAfter).toBeGreaterThan(298);
      });
    });
  });

  describe('Leaderboard Operations', () => {
    const sessionId = 'test-session-123';

    it('should add participants to leaderboard', async () => {
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-1', 100, 5000);
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-2', 150, 4000);
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-3', 120, 6000);

      const leaderboard = await redisDataStructuresService.getTopLeaderboard(sessionId, 10);

      expect(leaderboard).toHaveLength(3);
      expect(leaderboard[0].participantId).toBe('participant-2'); // Highest score
      expect(leaderboard[1].participantId).toBe('participant-3');
      expect(leaderboard[2].participantId).toBe('participant-1');
    });

    it('should handle tie-breaking by time (lower time ranks higher)', async () => {
      // Same score, different times
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-1', 100, 5000);
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-2', 100, 3000);

      const leaderboard = await redisDataStructuresService.getTopLeaderboard(sessionId, 10);

      expect(leaderboard).toHaveLength(2);
      expect(leaderboard[0].participantId).toBe('participant-2'); // Lower time
      expect(leaderboard[1].participantId).toBe('participant-1');
    });

    it('should get top N participants', async () => {
      // Add 15 participants
      for (let i = 1; i <= 15; i++) {
        await redisDataStructuresService.updateLeaderboard(
          sessionId,
          `participant-${i}`,
          i * 10,
          i * 1000
        );
      }

      const top10 = await redisDataStructuresService.getTopLeaderboard(sessionId, 10);

      expect(top10).toHaveLength(10);
      expect(top10[0].participantId).toBe('participant-15'); // Highest score
      expect(top10[9].participantId).toBe('participant-6');
    });

    it('should get full leaderboard', async () => {
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-1', 100, 5000);
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-2', 150, 4000);
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-3', 120, 6000);

      const leaderboard = await redisDataStructuresService.getFullLeaderboard(sessionId);

      expect(leaderboard).toHaveLength(3);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[1].rank).toBe(2);
      expect(leaderboard[2].rank).toBe(3);
    });

    it('should get participant rank', async () => {
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-1', 100, 5000);
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-2', 150, 4000);
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-3', 120, 6000);

      const rank1 = await redisDataStructuresService.getParticipantRank(sessionId, 'participant-2');
      const rank2 = await redisDataStructuresService.getParticipantRank(sessionId, 'participant-3');
      const rank3 = await redisDataStructuresService.getParticipantRank(sessionId, 'participant-1');

      expect(rank1).toBe(1);
      expect(rank2).toBe(2);
      expect(rank3).toBe(3);
    });

    it('should return null for non-existent participant rank', async () => {
      const rank = await redisDataStructuresService.getParticipantRank(sessionId, 'non-existent');
      expect(rank).toBeNull();
    });

    it('should update participant score in leaderboard', async () => {
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-1', 100, 5000);

      // Update score
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-1', 200, 8000);

      const leaderboard = await redisDataStructuresService.getFullLeaderboard(sessionId);

      expect(leaderboard).toHaveLength(1);
      expect(leaderboard[0].participantId).toBe('participant-1');
      // Score should reflect the update
    });

    it('should remove participant from leaderboard', async () => {
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-1', 100, 5000);
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-2', 150, 4000);

      await redisDataStructuresService.removeFromLeaderboard(sessionId, 'participant-1');

      const leaderboard = await redisDataStructuresService.getFullLeaderboard(sessionId);

      expect(leaderboard).toHaveLength(1);
      expect(leaderboard[0].participantId).toBe('participant-2');
    });

    it('should delete leaderboard', async () => {
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-1', 100, 5000);
      await redisDataStructuresService.deleteLeaderboard(sessionId);

      const leaderboard = await redisDataStructuresService.getFullLeaderboard(sessionId);
      expect(leaderboard).toHaveLength(0);
    });

    it('should set TTL on leaderboard', async () => {
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-1', 100, 5000);

      const client = redisService.getClient();
      const ttl = await client.ttl(`session:${sessionId}:leaderboard`);

      // TTL should be set (6 hours = 21600 seconds)
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(21600);
    });
  });

  describe('Answer Buffer Operations', () => {
    const sessionId = 'test-session-123';

    it('should add answer to buffer', async () => {
      const answer: Answer = {
        answerId: 'answer-123',
        sessionId,
        participantId: 'participant-456',
        questionId: 'question-789',
        selectedOptions: ['option-1', 'option-2'],
        submittedAt: Date.now(),
        responseTimeMs: 5000,
      };

      await redisDataStructuresService.addAnswerToBuffer(sessionId, answer);

      const length = await redisDataStructuresService.getAnswerBufferLength(sessionId);
      expect(length).toBe(1);
    });

    it('should add multiple answers to buffer', async () => {
      const answers: Answer[] = [
        {
          answerId: 'answer-1',
          sessionId,
          participantId: 'participant-1',
          questionId: 'question-1',
          selectedOptions: ['option-1'],
          submittedAt: Date.now(),
          responseTimeMs: 3000,
        },
        {
          answerId: 'answer-2',
          sessionId,
          participantId: 'participant-2',
          questionId: 'question-1',
          selectedOptions: ['option-2'],
          submittedAt: Date.now(),
          responseTimeMs: 4000,
        },
      ];

      for (const answer of answers) {
        await redisDataStructuresService.addAnswerToBuffer(sessionId, answer);
      }

      const length = await redisDataStructuresService.getAnswerBufferLength(sessionId);
      expect(length).toBe(2);
    });

    it('should flush answer buffer and return all answers', async () => {
      const answers: Answer[] = [
        {
          answerId: 'answer-1',
          sessionId,
          participantId: 'participant-1',
          questionId: 'question-1',
          selectedOptions: ['option-1'],
          submittedAt: Date.now(),
          responseTimeMs: 3000,
        },
        {
          answerId: 'answer-2',
          sessionId,
          participantId: 'participant-2',
          questionId: 'question-1',
          selectedOptions: ['option-2'],
          submittedAt: Date.now(),
          responseTimeMs: 4000,
        },
      ];

      for (const answer of answers) {
        await redisDataStructuresService.addAnswerToBuffer(sessionId, answer);
      }

      const flushed = await redisDataStructuresService.flushAnswerBuffer(sessionId);

      expect(flushed).toHaveLength(2);
      expect(flushed[0].answerId).toBe('answer-2'); // LIFO order (lpush)
      expect(flushed[1].answerId).toBe('answer-1');

      // Buffer should be empty after flush
      const length = await redisDataStructuresService.getAnswerBufferLength(sessionId);
      expect(length).toBe(0);
    });

    it('should handle answer with optional fields', async () => {
      const answer: Answer = {
        answerId: 'answer-123',
        sessionId,
        participantId: 'participant-456',
        questionId: 'question-789',
        selectedOptions: [],
        answerText: 'My answer text',
        answerNumber: 42,
        submittedAt: Date.now(),
        responseTimeMs: 5000,
      };

      await redisDataStructuresService.addAnswerToBuffer(sessionId, answer);
      const flushed = await redisDataStructuresService.flushAnswerBuffer(sessionId);

      expect(flushed).toHaveLength(1);
      expect(flushed[0].answerText).toBe('My answer text');
      expect(flushed[0].answerNumber).toBe(42);
    });

    it('should set TTL on answer buffer', async () => {
      const answer: Answer = {
        answerId: 'answer-123',
        sessionId,
        participantId: 'participant-456',
        questionId: 'question-789',
        selectedOptions: ['option-1'],
        submittedAt: Date.now(),
        responseTimeMs: 5000,
      };

      await redisDataStructuresService.addAnswerToBuffer(sessionId, answer);

      const client = redisService.getClient();
      const ttl = await client.ttl(`session:${sessionId}:answers:buffer`);

      // TTL should be set (1 hour = 3600 seconds)
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(3600);
    });
  });

  describe('Rate Limiting Operations', () => {
    it('should allow join attempts within limit', async () => {
      const ipAddress = '192.168.1.1';

      for (let i = 0; i < 5; i++) {
        const allowed = await redisDataStructuresService.checkJoinRateLimit(ipAddress);
        expect(allowed).toBe(true);
      }
    });

    it('should block join attempts exceeding limit', async () => {
      const ipAddress = '192.168.1.2';

      // First 5 should be allowed
      for (let i = 0; i < 5; i++) {
        await redisDataStructuresService.checkJoinRateLimit(ipAddress);
      }

      // 6th should be blocked
      const allowed = await redisDataStructuresService.checkJoinRateLimit(ipAddress);
      expect(allowed).toBe(false);
    });

    it('should set TTL on join rate limit', async () => {
      const ipAddress = '192.168.1.3';

      await redisDataStructuresService.checkJoinRateLimit(ipAddress);

      const client = redisService.getClient();
      const ttl = await client.ttl(`ratelimit:join:${ipAddress}`);

      // TTL should be set (1 minute = 60 seconds)
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should allow first answer submission', async () => {
      const participantId = 'participant-123';
      const questionId = 'question-456';

      const allowed = await redisDataStructuresService.checkAnswerRateLimit(
        participantId,
        questionId
      );
      expect(allowed).toBe(true);
    });

    it('should block duplicate answer submission', async () => {
      const participantId = 'participant-123';
      const questionId = 'question-456';

      // First submission
      await redisDataStructuresService.checkAnswerRateLimit(participantId, questionId);

      // Second submission should be blocked
      const allowed = await redisDataStructuresService.checkAnswerRateLimit(
        participantId,
        questionId
      );
      expect(allowed).toBe(false);
    });

    it('should check if question was answered without incrementing', async () => {
      const participantId = 'participant-123';
      const questionId = 'question-456';

      const hasAnswered1 = await redisDataStructuresService.hasAnsweredQuestion(
        participantId,
        questionId
      );
      expect(hasAnswered1).toBe(false);

      await redisDataStructuresService.checkAnswerRateLimit(participantId, questionId);

      const hasAnswered2 = await redisDataStructuresService.hasAnsweredQuestion(
        participantId,
        questionId
      );
      expect(hasAnswered2).toBe(true);
    });

    it('should set TTL on answer rate limit', async () => {
      const participantId = 'participant-123';
      const questionId = 'question-456';

      await redisDataStructuresService.checkAnswerRateLimit(participantId, questionId);

      const client = redisService.getClient();
      const ttl = await client.ttl(`ratelimit:answer:${participantId}:${questionId}`);

      // TTL should be set (5 minutes = 300 seconds)
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
    });
  });

  describe('Join Code Mapping Operations', () => {
    it('should set and get join code mapping', async () => {
      const joinCode = 'ABC123';
      const sessionId = 'session-456';

      await redisDataStructuresService.setJoinCodeMapping(joinCode, sessionId);
      const retrieved = await redisDataStructuresService.getSessionIdFromJoinCode(joinCode);

      expect(retrieved).toBe(sessionId);
    });

    it('should return null for non-existent join code', async () => {
      const retrieved = await redisDataStructuresService.getSessionIdFromJoinCode('NONEXIST');
      expect(retrieved).toBeNull();
    });

    it('should check if join code exists', async () => {
      const joinCode = 'XYZ789';
      const sessionId = 'session-789';

      const exists1 = await redisDataStructuresService.joinCodeExists(joinCode);
      expect(exists1).toBe(false);

      await redisDataStructuresService.setJoinCodeMapping(joinCode, sessionId);

      const exists2 = await redisDataStructuresService.joinCodeExists(joinCode);
      expect(exists2).toBe(true);
    });

    it('should delete join code mapping', async () => {
      const joinCode = 'DEF456';
      const sessionId = 'session-123';

      await redisDataStructuresService.setJoinCodeMapping(joinCode, sessionId);
      await redisDataStructuresService.deleteJoinCodeMapping(joinCode);

      const retrieved = await redisDataStructuresService.getSessionIdFromJoinCode(joinCode);
      expect(retrieved).toBeNull();
    });

    it('should set TTL on join code mapping', async () => {
      const joinCode = 'GHI789';
      const sessionId = 'session-456';

      await redisDataStructuresService.setJoinCodeMapping(joinCode, sessionId);

      const client = redisService.getClient();
      const ttl = await client.ttl(`joincode:${joinCode}`);

      // TTL should be set (6 hours = 21600 seconds)
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(21600);
    });
  });

  describe('Utility Operations', () => {
    it('should clear all session data', async () => {
      const sessionId = 'test-session-123';

      // Set up session data
      await redisDataStructuresService.setSessionState(sessionId, {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 5,
      });

      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-1', 100, 5000);

      // Clear session data
      await redisDataStructuresService.clearSessionData(sessionId);

      // Verify data is cleared
      const state = await redisDataStructuresService.getSessionState(sessionId);
      const leaderboard = await redisDataStructuresService.getFullLeaderboard(sessionId);

      expect(state).toBeNull();
      expect(leaderboard).toHaveLength(0);
    });
  });
});
