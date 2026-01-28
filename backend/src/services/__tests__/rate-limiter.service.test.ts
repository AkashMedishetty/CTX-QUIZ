/**
 * Rate Limiter Service Tests
 * 
 * Tests for rate limiting functionality:
 * - Join attempts rate limiting
 * - Answer submission rate limiting
 * - WebSocket message rate limiting
 * - Error handling and fail-open behavior
 * 
 * Requirements: 3.7, 9.3, 9.4
 */

import { rateLimiterService } from '../rate-limiter.service';
import { redisService } from '../redis.service';

describe('RateLimiterService', () => {
  beforeAll(async () => {
    // Connect to Redis before running tests
    await redisService.connect();
  });

  afterAll(async () => {
    // Disconnect from Redis after all tests
    await redisService.disconnect();
  });

  beforeEach(async () => {
    // Clear all rate limit keys before each test
    const redis = redisService.getClient();
    const keys = await redis.keys('ratelimit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('checkJoinLimit', () => {
    it('should allow first join attempt', async () => {
      const result = await rateLimiterService.checkJoinLimit('192.168.1.1');
      
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should allow up to 5 join attempts from same IP', async () => {
      const ipAddress = '192.168.1.2';
      
      // Make 5 attempts
      for (let i = 0; i < 5; i++) {
        const result = await rateLimiterService.checkJoinLimit(ipAddress);
        expect(result.allowed).toBe(true);
      }
    });

    it('should reject 6th join attempt from same IP', async () => {
      const ipAddress = '192.168.1.3';
      
      // Make 5 allowed attempts
      for (let i = 0; i < 5; i++) {
        await rateLimiterService.checkJoinLimit(ipAddress);
      }
      
      // 6th attempt should be rejected
      const result = await rateLimiterService.checkJoinLimit(ipAddress);
      
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(60);
    });

    it('should set TTL of 60 seconds on first attempt', async () => {
      const ipAddress = '192.168.1.4';
      const redis = redisService.getClient();
      
      await rateLimiterService.checkJoinLimit(ipAddress);
      
      const ttl = await redis.ttl(`ratelimit:join:${ipAddress}`);
      expect(ttl).toBeGreaterThan(55); // Allow some time for execution
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should allow different IPs independently', async () => {
      const ip1 = '192.168.1.5';
      const ip2 = '192.168.1.6';
      
      // Exhaust limit for IP1
      for (let i = 0; i < 5; i++) {
        await rateLimiterService.checkJoinLimit(ip1);
      }
      
      // IP1 should be blocked
      const result1 = await rateLimiterService.checkJoinLimit(ip1);
      expect(result1.allowed).toBe(false);
      
      // IP2 should still be allowed
      const result2 = await rateLimiterService.checkJoinLimit(ip2);
      expect(result2.allowed).toBe(true);
    });

    it('should reset after TTL expires', async () => {
      const ipAddress = '192.168.1.7';
      const redis = redisService.getClient();
      
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await rateLimiterService.checkJoinLimit(ipAddress);
      }
      
      // Should be blocked
      const blockedResult = await rateLimiterService.checkJoinLimit(ipAddress);
      expect(blockedResult.allowed).toBe(false);
      
      // Manually expire the key to simulate TTL expiration
      await redis.del(`ratelimit:join:${ipAddress}`);
      
      // Should be allowed again
      const allowedResult = await rateLimiterService.checkJoinLimit(ipAddress);
      expect(allowedResult.allowed).toBe(true);
    });
  });

  describe('checkAnswerLimit', () => {
    it('should allow first answer submission', async () => {
      const result = await rateLimiterService.checkAnswerLimit(
        'participant-1',
        'question-1'
      );
      
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should reject duplicate answer submission', async () => {
      const participantId = 'participant-2';
      const questionId = 'question-2';
      
      // First submission should be allowed
      const firstResult = await rateLimiterService.checkAnswerLimit(
        participantId,
        questionId
      );
      expect(firstResult.allowed).toBe(true);
      
      // Second submission should be rejected
      const secondResult = await rateLimiterService.checkAnswerLimit(
        participantId,
        questionId
      );
      expect(secondResult.allowed).toBe(false);
      expect(secondResult.retryAfter).toBeDefined();
      expect(secondResult.retryAfter).toBeGreaterThan(0);
    });

    it('should set TTL of 300 seconds (5 minutes)', async () => {
      const participantId = 'participant-3';
      const questionId = 'question-3';
      const redis = redisService.getClient();
      
      await rateLimiterService.checkAnswerLimit(participantId, questionId);
      
      const ttl = await redis.ttl(`ratelimit:answer:${participantId}:${questionId}`);
      expect(ttl).toBeGreaterThan(295); // Allow some time for execution
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('should allow same participant to answer different questions', async () => {
      const participantId = 'participant-4';
      
      // Answer question 1
      const result1 = await rateLimiterService.checkAnswerLimit(
        participantId,
        'question-4a'
      );
      expect(result1.allowed).toBe(true);
      
      // Answer question 2
      const result2 = await rateLimiterService.checkAnswerLimit(
        participantId,
        'question-4b'
      );
      expect(result2.allowed).toBe(true);
    });

    it('should allow different participants to answer same question', async () => {
      const questionId = 'question-5';
      
      // Participant 1 answers
      const result1 = await rateLimiterService.checkAnswerLimit(
        'participant-5a',
        questionId
      );
      expect(result1.allowed).toBe(true);
      
      // Participant 2 answers
      const result2 = await rateLimiterService.checkAnswerLimit(
        'participant-5b',
        questionId
      );
      expect(result2.allowed).toBe(true);
    });
  });

  describe('checkMessageLimit', () => {
    it('should allow first message', async () => {
      const result = await rateLimiterService.checkMessageLimit('socket-1');
      
      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should allow up to 10 messages per second', async () => {
      const socketId = 'socket-2';
      
      // Send 10 messages
      for (let i = 0; i < 10; i++) {
        const result = await rateLimiterService.checkMessageLimit(socketId);
        expect(result.allowed).toBe(true);
      }
    });

    it('should reject 11th message in same second', async () => {
      const socketId = 'socket-3';
      
      // Send 10 allowed messages
      for (let i = 0; i < 10; i++) {
        await rateLimiterService.checkMessageLimit(socketId);
      }
      
      // 11th message should be rejected
      const result = await rateLimiterService.checkMessageLimit(socketId);
      
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(1);
    });

    it('should set TTL of 1 second on first message', async () => {
      const socketId = 'socket-4';
      const redis = redisService.getClient();
      
      await rateLimiterService.checkMessageLimit(socketId);
      
      const ttl = await redis.ttl(`ratelimit:messages:${socketId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(1);
    });

    it('should allow different sockets independently', async () => {
      const socket1 = 'socket-5a';
      const socket2 = 'socket-5b';
      
      // Exhaust limit for socket1
      for (let i = 0; i < 10; i++) {
        await rateLimiterService.checkMessageLimit(socket1);
      }
      
      // Socket1 should be blocked
      const result1 = await rateLimiterService.checkMessageLimit(socket1);
      expect(result1.allowed).toBe(false);
      
      // Socket2 should still be allowed
      const result2 = await rateLimiterService.checkMessageLimit(socket2);
      expect(result2.allowed).toBe(true);
    });

    it('should reset after 1 second', async () => {
      const socketId = 'socket-6';
      const redis = redisService.getClient();
      
      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        await rateLimiterService.checkMessageLimit(socketId);
      }
      
      // Should be blocked
      const blockedResult = await rateLimiterService.checkMessageLimit(socketId);
      expect(blockedResult.allowed).toBe(false);
      
      // Manually expire the key to simulate TTL expiration
      await redis.del(`ratelimit:messages:${socketId}`);
      
      // Should be allowed again
      const allowedResult = await rateLimiterService.checkMessageLimit(socketId);
      expect(allowedResult.allowed).toBe(true);
    });
  });

  describe('resetLimit', () => {
    it('should reset join limit', async () => {
      const ipAddress = '192.168.1.100';
      
      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await rateLimiterService.checkJoinLimit(ipAddress);
      }
      
      // Should be blocked
      const blockedResult = await rateLimiterService.checkJoinLimit(ipAddress);
      expect(blockedResult.allowed).toBe(false);
      
      // Reset limit
      await rateLimiterService.resetLimit('join', ipAddress);
      
      // Should be allowed again
      const allowedResult = await rateLimiterService.checkJoinLimit(ipAddress);
      expect(allowedResult.allowed).toBe(true);
    });

    it('should reset answer limit', async () => {
      const participantId = 'participant-100';
      const questionId = 'question-100';
      
      // Submit answer
      await rateLimiterService.checkAnswerLimit(participantId, questionId);
      
      // Should be blocked
      const blockedResult = await rateLimiterService.checkAnswerLimit(
        participantId,
        questionId
      );
      expect(blockedResult.allowed).toBe(false);
      
      // Reset limit
      await rateLimiterService.resetLimit('answer', participantId, questionId);
      
      // Should be allowed again
      const allowedResult = await rateLimiterService.checkAnswerLimit(
        participantId,
        questionId
      );
      expect(allowedResult.allowed).toBe(true);
    });

    it('should reset message limit', async () => {
      const socketId = 'socket-100';
      
      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        await rateLimiterService.checkMessageLimit(socketId);
      }
      
      // Should be blocked
      const blockedResult = await rateLimiterService.checkMessageLimit(socketId);
      expect(blockedResult.allowed).toBe(false);
      
      // Reset limit
      await rateLimiterService.resetLimit('messages', socketId);
      
      // Should be allowed again
      const allowedResult = await rateLimiterService.checkMessageLimit(socketId);
      expect(allowedResult.allowed).toBe(true);
    });

    it('should throw error when resetting answer limit without question ID', async () => {
      await expect(
        rateLimiterService.resetLimit('answer', 'participant-101')
      ).rejects.toThrow('Question ID required for answer limit reset');
    });
  });

  describe('getLimitStatus', () => {
    it('should return count and TTL for join limit', async () => {
      const ipAddress = '192.168.1.200';
      
      // Make 3 attempts
      for (let i = 0; i < 3; i++) {
        await rateLimiterService.checkJoinLimit(ipAddress);
      }
      
      const status = await rateLimiterService.getLimitStatus('join', ipAddress);
      
      expect(status.count).toBe(3);
      expect(status.ttl).toBeGreaterThan(0);
      expect(status.ttl).toBeLessThanOrEqual(60);
    });

    it('should return count 1 for answer limit after submission', async () => {
      const participantId = 'participant-200';
      const questionId = 'question-200';
      
      await rateLimiterService.checkAnswerLimit(participantId, questionId);
      
      const status = await rateLimiterService.getLimitStatus(
        'answer',
        participantId,
        questionId
      );
      
      expect(status.count).toBe(1);
      expect(status.ttl).toBeGreaterThan(0);
      expect(status.ttl).toBeLessThanOrEqual(300);
    });

    it('should return count and TTL for message limit', async () => {
      const socketId = 'socket-200';
      
      // Send 5 messages
      for (let i = 0; i < 5; i++) {
        await rateLimiterService.checkMessageLimit(socketId);
      }
      
      const status = await rateLimiterService.getLimitStatus('messages', socketId);
      
      expect(status.count).toBe(5);
      expect(status.ttl).toBeGreaterThan(0);
      expect(status.ttl).toBeLessThanOrEqual(1);
    });

    it('should return count 0 for non-existent limit', async () => {
      const status = await rateLimiterService.getLimitStatus(
        'join',
        '192.168.1.999'
      );
      
      expect(status.count).toBe(0);
      expect(status.ttl).toBe(-2); // Redis returns -2 for non-existent keys
    });

    it('should return error status when getting answer limit status without question ID', async () => {
      const status = await rateLimiterService.getLimitStatus('answer', 'participant-201');
      
      // Should return default values on error
      expect(status.count).toBe(0);
      expect(status.ttl).toBe(-1);
    });
  });

  describe('Error handling', () => {
    it('should fail open on Redis errors for join limit', async () => {
      // Disconnect Redis to simulate error
      await redisService.disconnect();
      
      const result = await rateLimiterService.checkJoinLimit('192.168.1.300');
      
      // Should allow request on error (fail open)
      expect(result.allowed).toBe(true);
      
      // Reconnect for other tests
      await redisService.connect();
    });

    it('should fail open on Redis errors for answer limit', async () => {
      // Disconnect Redis to simulate error
      await redisService.disconnect();
      
      const result = await rateLimiterService.checkAnswerLimit(
        'participant-300',
        'question-300'
      );
      
      // Should allow request on error (fail open)
      expect(result.allowed).toBe(true);
      
      // Reconnect for other tests
      await redisService.connect();
    });

    it('should fail open on Redis errors for message limit', async () => {
      // Disconnect Redis to simulate error
      await redisService.disconnect();
      
      const result = await rateLimiterService.checkMessageLimit('socket-300');
      
      // Should allow request on error (fail open)
      expect(result.allowed).toBe(true);
      
      // Reconnect for other tests
      await redisService.connect();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string identifiers', async () => {
      const result = await rateLimiterService.checkJoinLimit('');
      expect(result.allowed).toBe(true);
    });

    it('should handle special characters in identifiers', async () => {
      const ipAddress = '192.168.1.1:8080';
      const result = await rateLimiterService.checkJoinLimit(ipAddress);
      expect(result.allowed).toBe(true);
    });

    it('should handle very long identifiers', async () => {
      const longId = 'a'.repeat(1000);
      const result = await rateLimiterService.checkMessageLimit(longId);
      expect(result.allowed).toBe(true);
    });

    it('should handle concurrent requests for same IP', async () => {
      const ipAddress = '192.168.1.400';
      
      // Make 10 concurrent requests
      const results = await Promise.all(
        Array(10).fill(null).map(() => 
          rateLimiterService.checkJoinLimit(ipAddress)
        )
      );
      
      // First 5 should be allowed, rest should be blocked
      const allowedCount = results.filter(r => r.allowed).length;
      const blockedCount = results.filter(r => !r.allowed).length;
      
      expect(allowedCount).toBe(5);
      expect(blockedCount).toBe(5);
    });
  });
});
