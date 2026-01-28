/**
 * Unit tests for Redis Fallback Service
 * Tests in-memory cache fallback when Redis is unavailable
 * 
 * Requirements: 17.3
 */

import { redisFallbackService } from '../redis-fallback.service';
import { redisService } from '../redis.service';
import { SessionState, ParticipantSession } from '../redis-data-structures.service';

// Mock Redis service
jest.mock('../redis.service', () => ({
  redisService: {
    healthCheck: jest.fn(),
    isConnected: jest.fn(),
  },
}));

describe('Redis Fallback Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear all caches before each test
    redisFallbackService.clearAll();
    // Reset fallback mode
    redisFallbackService.exitFallbackMode();
  });

  afterAll(() => {
    // Stop cleanup timer to prevent Jest from hanging
    redisFallbackService.stopCleanupTimer();
  });

  describe('isUnavailabilityError', () => {
    it('should return true for ECONNREFUSED errors', () => {
      const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
      expect(redisFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for ECONNRESET errors', () => {
      const error = { code: 'ECONNRESET', message: 'Connection reset' };
      expect(redisFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for ETIMEDOUT errors', () => {
      const error = { code: 'ETIMEDOUT', message: 'Connection timed out' };
      expect(redisFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for ENETUNREACH errors', () => {
      const error = { code: 'ENETUNREACH', message: 'Network unreachable' };
      expect(redisFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for EHOSTUNREACH errors', () => {
      const error = { code: 'EHOSTUNREACH', message: 'Host unreachable' };
      expect(redisFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for errors with connection in message', () => {
      const error = { message: 'Redis connection failed' };
      expect(redisFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for errors with timeout in message', () => {
      const error = { message: 'Operation timeout exceeded' };
      expect(redisFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for errors with "not ready" in message', () => {
      const error = { message: 'Redis client not ready' };
      expect(redisFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return false for validation errors', () => {
      const error = { message: 'Validation failed: field is required' };
      expect(redisFallbackService.isUnavailabilityError(error)).toBe(false);
    });

    it('should return false for null/undefined errors', () => {
      expect(redisFallbackService.isUnavailabilityError(null)).toBe(false);
      expect(redisFallbackService.isUnavailabilityError(undefined)).toBe(false);
    });
  });

  describe('Fallback Mode', () => {
    it('should enter fallback mode', () => {
      expect(redisFallbackService.isUsingFallback()).toBe(false);
      
      redisFallbackService.enterFallbackMode();
      
      expect(redisFallbackService.isUsingFallback()).toBe(true);
    });

    it('should exit fallback mode', () => {
      redisFallbackService.enterFallbackMode();
      expect(redisFallbackService.isUsingFallback()).toBe(true);
      
      redisFallbackService.exitFallbackMode();
      
      expect(redisFallbackService.isUsingFallback()).toBe(false);
    });

    it('should track fallback duration in status', () => {
      redisFallbackService.enterFallbackMode();
      
      const status = redisFallbackService.getStatus();
      
      expect(status.isInFallbackMode).toBe(true);
      expect(status.fallbackDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isRedisAvailable', () => {
    it('should return true when Redis health check passes', async () => {
      (redisService.healthCheck as jest.Mock).mockResolvedValue(true);

      const result = await redisFallbackService.isRedisAvailable();

      expect(result).toBe(true);
    });

    it('should return false when Redis health check fails', async () => {
      (redisService.healthCheck as jest.Mock).mockResolvedValue(false);
      // Force health check by entering fallback mode
      redisFallbackService.enterFallbackMode();

      const result = await redisFallbackService.isRedisAvailable();

      expect(result).toBe(false);
    });

    it('should return false when Redis health check throws', async () => {
      (redisService.healthCheck as jest.Mock).mockRejectedValue(new Error('Connection error'));
      redisFallbackService.enterFallbackMode();

      const result = await redisFallbackService.isRedisAvailable();

      expect(result).toBe(false);
    });
  });

  describe('Session State Operations', () => {
    const sessionId = 'test-session-123';
    const sessionState: SessionState = {
      state: 'LOBBY',
      currentQuestionIndex: 0,
      participantCount: 5,
    };

    it('should set and get session state', () => {
      redisFallbackService.setSessionState(sessionId, sessionState);

      const result = redisFallbackService.getSessionState(sessionId);

      expect(result).toEqual(sessionState);
    });

    it('should return null for non-existent session state', () => {
      const result = redisFallbackService.getSessionState('non-existent');

      expect(result).toBeNull();
    });

    it('should update session state', () => {
      redisFallbackService.setSessionState(sessionId, sessionState);

      redisFallbackService.updateSessionState(sessionId, {
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: 1,
      });

      const result = redisFallbackService.getSessionState(sessionId);

      expect(result?.state).toBe('ACTIVE_QUESTION');
      expect(result?.currentQuestionIndex).toBe(1);
      expect(result?.participantCount).toBe(5); // Unchanged
    });

    it('should delete session state', () => {
      redisFallbackService.setSessionState(sessionId, sessionState);
      
      redisFallbackService.deleteSessionState(sessionId);

      const result = redisFallbackService.getSessionState(sessionId);
      expect(result).toBeNull();
    });

    it('should return copy of session state (not reference)', () => {
      redisFallbackService.setSessionState(sessionId, sessionState);

      const result1 = redisFallbackService.getSessionState(sessionId);
      const result2 = redisFallbackService.getSessionState(sessionId);

      expect(result1).not.toBe(result2);
      expect(result1).toEqual(result2);
    });
  });

  describe('Participant Session Operations', () => {
    const participantId = 'participant-123';
    const participantSession: ParticipantSession = {
      sessionId: 'session-123',
      nickname: 'TestPlayer',
      totalScore: 100,
      totalTimeMs: 5000,
      streakCount: 2,
      isActive: true,
      isEliminated: false,
    };

    it('should set and get participant session', () => {
      redisFallbackService.setParticipantSession(participantId, participantSession);

      const result = redisFallbackService.getParticipantSession(participantId);

      expect(result).toEqual(participantSession);
    });

    it('should return null for non-existent participant session', () => {
      const result = redisFallbackService.getParticipantSession('non-existent');

      expect(result).toBeNull();
    });

    it('should update participant session', () => {
      redisFallbackService.setParticipantSession(participantId, participantSession);

      redisFallbackService.updateParticipantSession(participantId, {
        totalScore: 200,
        streakCount: 3,
      });

      const result = redisFallbackService.getParticipantSession(participantId);

      expect(result?.totalScore).toBe(200);
      expect(result?.streakCount).toBe(3);
      expect(result?.nickname).toBe('TestPlayer'); // Unchanged
    });

    it('should delete participant session', () => {
      redisFallbackService.setParticipantSession(participantId, participantSession);
      
      redisFallbackService.deleteParticipantSession(participantId);

      const result = redisFallbackService.getParticipantSession(participantId);
      expect(result).toBeNull();
    });

    it('should check if participant session is active', () => {
      redisFallbackService.setParticipantSession(participantId, participantSession);

      expect(redisFallbackService.isParticipantSessionActive(participantId)).toBe(true);
      expect(redisFallbackService.isParticipantSessionActive('non-existent')).toBe(false);
    });

    it('should refresh participant session TTL', () => {
      redisFallbackService.setParticipantSession(participantId, participantSession);
      
      // This should not throw and should keep the session active
      redisFallbackService.refreshParticipantSession(participantId);

      expect(redisFallbackService.isParticipantSessionActive(participantId)).toBe(true);
    });
  });

  describe('Leaderboard Operations', () => {
    const sessionId = 'session-123';

    it('should update and get leaderboard', () => {
      redisFallbackService.updateLeaderboard(sessionId, 'player1', 100, 5000);
      redisFallbackService.updateLeaderboard(sessionId, 'player2', 200, 4000);
      redisFallbackService.updateLeaderboard(sessionId, 'player3', 150, 6000);

      const result = redisFallbackService.getTopLeaderboard(sessionId, 10);

      expect(result).toHaveLength(3);
      expect(result[0].participantId).toBe('player2'); // Highest score
      expect(result[0].rank).toBe(1);
      expect(result[1].participantId).toBe('player3');
      expect(result[1].rank).toBe(2);
      expect(result[2].participantId).toBe('player1');
      expect(result[2].rank).toBe(3);
    });

    it('should return empty array for non-existent leaderboard', () => {
      const result = redisFallbackService.getTopLeaderboard('non-existent');

      expect(result).toEqual([]);
    });

    it('should limit results to specified count', () => {
      redisFallbackService.updateLeaderboard(sessionId, 'player1', 100, 5000);
      redisFallbackService.updateLeaderboard(sessionId, 'player2', 200, 4000);
      redisFallbackService.updateLeaderboard(sessionId, 'player3', 150, 6000);

      const result = redisFallbackService.getTopLeaderboard(sessionId, 2);

      expect(result).toHaveLength(2);
    });

    it('should get full leaderboard', () => {
      redisFallbackService.updateLeaderboard(sessionId, 'player1', 100, 5000);
      redisFallbackService.updateLeaderboard(sessionId, 'player2', 200, 4000);

      const result = redisFallbackService.getFullLeaderboard(sessionId);

      expect(result).toHaveLength(2);
    });

    it('should update existing participant score', () => {
      redisFallbackService.updateLeaderboard(sessionId, 'player1', 100, 5000);
      redisFallbackService.updateLeaderboard(sessionId, 'player1', 300, 6000);

      const result = redisFallbackService.getTopLeaderboard(sessionId);

      expect(result).toHaveLength(1);
      expect(result[0].participantId).toBe('player1');
    });

    it('should get participant rank', () => {
      redisFallbackService.updateLeaderboard(sessionId, 'player1', 100, 5000);
      redisFallbackService.updateLeaderboard(sessionId, 'player2', 200, 4000);

      const rank = redisFallbackService.getParticipantRank(sessionId, 'player1');

      expect(rank).toBe(2); // Second place
    });

    it('should return null for non-existent participant rank', () => {
      redisFallbackService.updateLeaderboard(sessionId, 'player1', 100, 5000);

      const rank = redisFallbackService.getParticipantRank(sessionId, 'non-existent');

      expect(rank).toBeNull();
    });

    it('should remove participant from leaderboard', () => {
      redisFallbackService.updateLeaderboard(sessionId, 'player1', 100, 5000);
      redisFallbackService.updateLeaderboard(sessionId, 'player2', 200, 4000);

      redisFallbackService.removeFromLeaderboard(sessionId, 'player1');

      const result = redisFallbackService.getTopLeaderboard(sessionId);
      expect(result).toHaveLength(1);
      expect(result[0].participantId).toBe('player2');
    });

    it('should delete leaderboard', () => {
      redisFallbackService.updateLeaderboard(sessionId, 'player1', 100, 5000);

      redisFallbackService.deleteLeaderboard(sessionId);

      const result = redisFallbackService.getTopLeaderboard(sessionId);
      expect(result).toEqual([]);
    });

    it('should use tie-breaker for same scores (lower time ranks higher)', () => {
      redisFallbackService.updateLeaderboard(sessionId, 'player1', 100, 5000);
      redisFallbackService.updateLeaderboard(sessionId, 'player2', 100, 3000); // Same score, faster

      const result = redisFallbackService.getTopLeaderboard(sessionId);

      expect(result[0].participantId).toBe('player2'); // Faster player ranks higher
      expect(result[1].participantId).toBe('player1');
    });
  });

  describe('Join Code Operations', () => {
    const joinCode = 'ABC123';
    const sessionId = 'session-123';

    it('should set and get join code mapping', () => {
      redisFallbackService.setJoinCodeMapping(joinCode, sessionId);

      const result = redisFallbackService.getSessionIdFromJoinCode(joinCode);

      expect(result).toBe(sessionId);
    });

    it('should return null for non-existent join code', () => {
      const result = redisFallbackService.getSessionIdFromJoinCode('NONEXISTENT');

      expect(result).toBeNull();
    });

    it('should check if join code exists', () => {
      redisFallbackService.setJoinCodeMapping(joinCode, sessionId);

      expect(redisFallbackService.joinCodeExists(joinCode)).toBe(true);
      expect(redisFallbackService.joinCodeExists('NONEXISTENT')).toBe(false);
    });

    it('should delete join code mapping', () => {
      redisFallbackService.setJoinCodeMapping(joinCode, sessionId);

      redisFallbackService.deleteJoinCodeMapping(joinCode);

      expect(redisFallbackService.joinCodeExists(joinCode)).toBe(false);
    });
  });

  describe('Rate Limiting Operations', () => {
    const ipAddress = '192.168.1.1';
    const participantId = 'participant-123';
    const questionId = 'question-456';

    it('should allow first join attempt', () => {
      const result = redisFallbackService.checkJoinRateLimit(ipAddress);

      expect(result).toBe(true);
    });

    it('should allow up to 5 join attempts', () => {
      for (let i = 0; i < 5; i++) {
        expect(redisFallbackService.checkJoinRateLimit(ipAddress)).toBe(true);
      }
    });

    it('should reject 6th join attempt', () => {
      for (let i = 0; i < 5; i++) {
        redisFallbackService.checkJoinRateLimit(ipAddress);
      }

      const result = redisFallbackService.checkJoinRateLimit(ipAddress);

      expect(result).toBe(false);
    });

    it('should allow first answer submission', () => {
      const result = redisFallbackService.checkAnswerRateLimit(participantId, questionId);

      expect(result).toBe(true);
    });

    it('should reject duplicate answer submission', () => {
      redisFallbackService.checkAnswerRateLimit(participantId, questionId);

      const result = redisFallbackService.checkAnswerRateLimit(participantId, questionId);

      expect(result).toBe(false);
    });

    it('should check if question was already answered', () => {
      expect(redisFallbackService.hasAnsweredQuestion(participantId, questionId)).toBe(false);

      redisFallbackService.checkAnswerRateLimit(participantId, questionId);

      expect(redisFallbackService.hasAnsweredQuestion(participantId, questionId)).toBe(true);
    });

    it('should allow different participants to answer same question', () => {
      redisFallbackService.checkAnswerRateLimit('participant-1', questionId);
      
      const result = redisFallbackService.checkAnswerRateLimit('participant-2', questionId);

      expect(result).toBe(true);
    });

    it('should allow same participant to answer different questions', () => {
      redisFallbackService.checkAnswerRateLimit(participantId, 'question-1');
      
      const result = redisFallbackService.checkAnswerRateLimit(participantId, 'question-2');

      expect(result).toBe(true);
    });
  });

  describe('Generic Cache Operations', () => {
    it('should set and get values', () => {
      redisFallbackService.set('key1', 'value1');

      const result = redisFallbackService.get<string>('key1');

      expect(result).toBe('value1');
    });

    it('should return null for non-existent keys', () => {
      const result = redisFallbackService.get('non-existent');

      expect(result).toBeNull();
    });

    it('should delete values', () => {
      redisFallbackService.set('key1', 'value1');

      redisFallbackService.delete('key1');

      expect(redisFallbackService.get('key1')).toBeNull();
    });

    it('should check if key exists', () => {
      redisFallbackService.set('key1', 'value1');

      expect(redisFallbackService.exists('key1')).toBe(true);
      expect(redisFallbackService.exists('non-existent')).toBe(false);
    });

    it('should handle complex objects', () => {
      const complexValue = { nested: { data: [1, 2, 3] } };
      redisFallbackService.set('complex', complexValue);

      const result = redisFallbackService.get<typeof complexValue>('complex');

      expect(result).toEqual(complexValue);
    });
  });

  describe('Hash Operations', () => {
    const key = 'hash-key';

    it('should set and get hash fields', () => {
      redisFallbackService.hset(key, 'field1', 'value1');
      redisFallbackService.hset(key, 'field2', 'value2');

      expect(redisFallbackService.hget(key, 'field1')).toBe('value1');
      expect(redisFallbackService.hget(key, 'field2')).toBe('value2');
    });

    it('should return null for non-existent hash field', () => {
      redisFallbackService.hset(key, 'field1', 'value1');

      expect(redisFallbackService.hget(key, 'non-existent')).toBeNull();
    });

    it('should return null for non-existent hash key', () => {
      expect(redisFallbackService.hget('non-existent', 'field')).toBeNull();
    });

    it('should get all hash fields', () => {
      redisFallbackService.hset(key, 'field1', 'value1');
      redisFallbackService.hset(key, 'field2', 'value2');

      const result = redisFallbackService.hgetall(key);

      expect(result).toEqual({ field1: 'value1', field2: 'value2' });
    });

    it('should return null for non-existent hash in hgetall', () => {
      expect(redisFallbackService.hgetall('non-existent')).toBeNull();
    });

    it('should delete hash field', () => {
      redisFallbackService.hset(key, 'field1', 'value1');
      redisFallbackService.hset(key, 'field2', 'value2');

      redisFallbackService.hdel(key, 'field1');

      expect(redisFallbackService.hget(key, 'field1')).toBeNull();
      expect(redisFallbackService.hget(key, 'field2')).toBe('value2');
    });
  });

  describe('Status and Metrics', () => {
    it('should return correct status when not in fallback mode', () => {
      const status = redisFallbackService.getStatus();

      expect(status.isInFallbackMode).toBe(false);
      expect(status.fallbackDuration).toBeNull();
      expect(status.cacheStats).toBeDefined();
    });

    it('should return correct status when in fallback mode', () => {
      redisFallbackService.enterFallbackMode();

      const status = redisFallbackService.getStatus();

      expect(status.isInFallbackMode).toBe(true);
      expect(status.fallbackDuration).toBeGreaterThanOrEqual(0);
    });

    it('should track cache sizes', () => {
      redisFallbackService.setSessionState('session-1', {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 0,
      });
      redisFallbackService.setParticipantSession('participant-1', {
        sessionId: 'session-1',
        nickname: 'Test',
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        isActive: true,
        isEliminated: false,
      });

      const status = redisFallbackService.getStatus();

      expect(status.cacheStats.sessionStates).toBe(1);
      expect(status.cacheStats.participantSessions).toBe(1);
    });
  });

  describe('Clear Operations', () => {
    it('should clear all caches', () => {
      redisFallbackService.setSessionState('session-1', {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 0,
      });
      redisFallbackService.setParticipantSession('participant-1', {
        sessionId: 'session-1',
        nickname: 'Test',
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        isActive: true,
        isEliminated: false,
      });
      redisFallbackService.setJoinCodeMapping('ABC123', 'session-1');

      redisFallbackService.clearAll();

      const status = redisFallbackService.getStatus();
      expect(status.cacheStats.sessionStates).toBe(0);
      expect(status.cacheStats.participantSessions).toBe(0);
      expect(status.cacheStats.joinCodes).toBe(0);
    });

    it('should clear session-specific data', () => {
      const sessionId = 'session-to-clear';
      redisFallbackService.setSessionState(sessionId, {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 0,
      });
      redisFallbackService.updateLeaderboard(sessionId, 'player1', 100, 5000);
      redisFallbackService.setJoinCodeMapping('ABC123', sessionId);

      redisFallbackService.clearSessionData(sessionId);

      expect(redisFallbackService.getSessionState(sessionId)).toBeNull();
      expect(redisFallbackService.getTopLeaderboard(sessionId)).toEqual([]);
      expect(redisFallbackService.joinCodeExists('ABC123')).toBe(false);
    });
  });

  describe('Alert Callbacks', () => {
    it('should call registered alert callbacks', () => {
      const alertCallback = jest.fn();
      redisFallbackService.onAlert(alertCallback);

      redisFallbackService.enterFallbackMode();

      expect(alertCallback).toHaveBeenCalledWith(
        'Entering Redis fallback mode',
        expect.objectContaining({
          timestamp: expect.any(Number),
        })
      );

      // Cleanup
      redisFallbackService.offAlert(alertCallback);
    });

    it('should remove alert callbacks', () => {
      const alertCallback = jest.fn();
      redisFallbackService.onAlert(alertCallback);
      redisFallbackService.offAlert(alertCallback);

      redisFallbackService.enterFallbackMode();

      expect(alertCallback).not.toHaveBeenCalled();
    });

    it('should handle errors in alert callbacks gracefully', () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const normalCallback = jest.fn();

      redisFallbackService.onAlert(errorCallback);
      redisFallbackService.onAlert(normalCallback);

      // Should not throw
      expect(() => redisFallbackService.enterFallbackMode()).not.toThrow();

      // Both callbacks should be called
      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();

      // Cleanup
      redisFallbackService.offAlert(errorCallback);
      redisFallbackService.offAlert(normalCallback);
    });
  });

  describe('Degraded Performance Logging', () => {
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('should log degraded warning when getting session state', () => {
      redisFallbackService.setSessionState('session-1', {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 0,
      });

      redisFallbackService.getSessionState('session-1');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEGRADED PERFORMANCE'),
        expect.any(Object)
      );
    });

    it('should log degraded warning when updating leaderboard', () => {
      redisFallbackService.updateLeaderboard('session-1', 'player1', 100, 5000);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('DEGRADED PERFORMANCE'),
        expect.any(Object)
      );
    });
  });
});
