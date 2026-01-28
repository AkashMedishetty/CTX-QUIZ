/**
 * Redis Service Tests
 * 
 * Tests for Redis connection, reconnection strategy, configuration,
 * and pipeline operations for bulk updates.
 * 
 * Requirements: 11.4, 11.6, 18.6
 */

import Redis from 'ioredis';
import { redisService } from '../redis.service';

// Mock ioredis
jest.mock('ioredis');

describe('RedisService', () => {
  let mockRedisInstance: jest.Mocked<Redis>;
  let mockPipeline: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock pipeline
    mockPipeline = {
      zadd: jest.fn().mockReturnThis(),
      hset: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    
    // Create mock Redis instance
    mockRedisInstance = {
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue('OK'),
      ping: jest.fn().mockResolvedValue('PONG'),
      config: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
      status: 'ready',
      pipeline: jest.fn().mockReturnValue(mockPipeline),
    } as any;
    
    // Mock Redis constructor
    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedisInstance);
  });

  afterEach(async () => {
    // Clean up any connections
    try {
      await redisService.disconnect();
    } catch (error) {
      // Ignore errors during cleanup
    }
  });

  describe('connect', () => {
    it('should create three Redis clients (main, subscriber, publisher)', async () => {
      await redisService.connect();
      
      // Should create 3 instances
      expect(Redis).toHaveBeenCalledTimes(3);
      
      // Should call connect on all instances
      expect(mockRedisInstance.connect).toHaveBeenCalledTimes(3);
    });

    it('should configure memory settings after connection', async () => {
      await redisService.connect();
      
      // Should configure maxmemory
      expect(mockRedisInstance.config).toHaveBeenCalledWith('SET', 'maxmemory', '256mb');
      
      // Should configure eviction policy
      expect(mockRedisInstance.config).toHaveBeenCalledWith('SET', 'maxmemory-policy', 'allkeys-lru');
    });

    it('should ping Redis to verify connection', async () => {
      await redisService.connect();
      
      expect(mockRedisInstance.ping).toHaveBeenCalled();
    });

    it('should throw error if ping fails', async () => {
      mockRedisInstance.ping.mockResolvedValue('FAIL');
      
      await expect(redisService.connect()).rejects.toThrow('Redis ping failed');
    });

    it('should set up event handlers for all clients', async () => {
      await redisService.connect();
      
      // Each client should have event handlers
      // 3 clients × 6 events = 18 calls
      expect(mockRedisInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('end', expect.any(Function));
    });

    it('should continue if memory configuration fails', async () => {
      mockRedisInstance.config.mockRejectedValue(new Error('Config failed'));
      
      // Should not throw - just log and continue
      await expect(redisService.connect()).resolves.not.toThrow();
    });
  });

  describe('disconnect', () => {
    it('should disconnect all Redis clients', async () => {
      await redisService.connect();
      await redisService.disconnect();
      
      // Should call quit on all 3 clients
      expect(mockRedisInstance.quit).toHaveBeenCalledTimes(3);
    });

    it('should handle disconnect errors gracefully', async () => {
      await redisService.connect();
      
      mockRedisInstance.quit.mockRejectedValue(new Error('Disconnect failed'));
      
      await expect(redisService.disconnect()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('getClient', () => {
    it('should return main Redis client after connection', async () => {
      await redisService.connect();
      
      const client = redisService.getClient();
      expect(client).toBeDefined();
      expect(client).toBe(mockRedisInstance);
    });

    it('should throw error if called before connection', () => {
      expect(() => redisService.getClient()).toThrow(
        'Redis client not initialized. Call connect() first.'
      );
    });
  });

  describe('getSubscriber', () => {
    it('should return subscriber client after connection', async () => {
      await redisService.connect();
      
      const subscriber = redisService.getSubscriber();
      expect(subscriber).toBeDefined();
    });

    it('should throw error if called before connection', () => {
      expect(() => redisService.getSubscriber()).toThrow(
        'Redis subscriber not initialized. Call connect() first.'
      );
    });
  });

  describe('getPublisher', () => {
    it('should return publisher client after connection', async () => {
      await redisService.connect();
      
      const publisher = redisService.getPublisher();
      expect(publisher).toBeDefined();
    });

    it('should throw error if called before connection', () => {
      expect(() => redisService.getPublisher()).toThrow(
        'Redis publisher not initialized. Call connect() first.'
      );
    });
  });

  describe('isConnected', () => {
    it('should return true when all clients are ready', async () => {
      await redisService.connect();
      
      expect(redisService.isConnected()).toBe(true);
    });

    it('should return false when not connected', () => {
      expect(redisService.isConnected()).toBe(false);
    });

    it('should return false if any client is not ready', async () => {
      await redisService.connect();
      
      // Simulate one client not ready
      mockRedisInstance.status = 'connecting';
      
      expect(redisService.isConnected()).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return status of all clients', async () => {
      await redisService.connect();
      
      const status = redisService.getStatus();
      
      expect(status).toEqual({
        client: 'ready',
        subscriber: 'ready',
        publisher: 'ready',
        reconnectAttempts: 0,
      });
    });

    it('should return disconnected status before connection', () => {
      const status = redisService.getStatus();
      
      expect(status).toEqual({
        client: 'disconnected',
        subscriber: 'disconnected',
        publisher: 'disconnected',
        reconnectAttempts: 0,
      });
    });
  });

  describe('healthCheck', () => {
    it('should return true when Redis is responsive', async () => {
      await redisService.connect();
      
      const healthy = await redisService.healthCheck();
      expect(healthy).toBe(true);
      expect(mockRedisInstance.ping).toHaveBeenCalled();
    });

    it('should return false when not connected', async () => {
      const healthy = await redisService.healthCheck();
      expect(healthy).toBe(false);
    });

    it('should return false when ping fails', async () => {
      await redisService.connect();
      
      mockRedisInstance.ping.mockRejectedValue(new Error('Ping failed'));
      
      const healthy = await redisService.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('reconnection strategy', () => {
    it('should configure exponential backoff retry strategy', async () => {
      await redisService.connect();
      
      // Get the options passed to Redis constructor
      const constructorCalls = (Redis as jest.MockedClass<typeof Redis>).mock.calls;
      expect(constructorCalls.length).toBeGreaterThan(0);
      
      const options = (constructorCalls[0] as any)?.[0];
      expect(options).toBeDefined();
      
      expect(options).toHaveProperty('retryStrategy');
      expect(typeof options.retryStrategy).toBe('function');
    });

    it('should calculate exponential backoff delays', async () => {
      await redisService.connect();
      
      const constructorCalls = (Redis as jest.MockedClass<typeof Redis>).mock.calls;
      const options = (constructorCalls[0] as any)?.[0];
      expect(options).toBeDefined();
      
      const retryStrategy = options.retryStrategy as (times: number) => number | null;
      
      // Test exponential backoff
      const delay1 = retryStrategy(1);
      const delay2 = retryStrategy(2);
      const delay3 = retryStrategy(3);
      
      expect(delay1).toBeGreaterThan(0);
      expect(delay2).toBeGreaterThan(delay1!);
      expect(delay3).toBeGreaterThan(delay2!);
    });

    it('should stop reconnecting after max attempts', async () => {
      await redisService.connect();
      
      const constructorCalls = (Redis as jest.MockedClass<typeof Redis>).mock.calls;
      const options = (constructorCalls[0] as any)?.[0];
      expect(options).toBeDefined();
      
      const retryStrategy = options.retryStrategy as (times: number) => number | null;
      
      // Should return null after max attempts (10)
      const result = retryStrategy(11);
      expect(result).toBeNull();
    });

    it('should cap delay at maximum value', async () => {
      await redisService.connect();
      
      const constructorCalls = (Redis as jest.MockedClass<typeof Redis>).mock.calls;
      const options = (constructorCalls[0] as any)?.[0];
      expect(options).toBeDefined();
      
      const retryStrategy = options.retryStrategy as (times: number) => number | null;
      
      // Test with high attempt number
      const delay = retryStrategy(10);
      
      // Should not exceed 30 seconds (30000ms) + jitter
      expect(delay).toBeLessThanOrEqual(36000); // 30000 + 20% jitter
    });
  });

  describe('connection pooling configuration', () => {
    it('should configure connection pooling settings', async () => {
      await redisService.connect();
      
      const constructorCalls = (Redis as jest.MockedClass<typeof Redis>).mock.calls;
      const options = (constructorCalls[0] as any)?.[0];
      expect(options).toBeDefined();
      
      expect(options.maxRetriesPerRequest).toBe(3);
      expect(options.enableReadyCheck).toBe(true);
      expect(options.enableOfflineQueue).toBe(true);
    });

    it('should configure connection timeout', async () => {
      await redisService.connect();
      
      const constructorCalls = (Redis as jest.MockedClass<typeof Redis>).mock.calls;
      const options = (constructorCalls[0] as any)?.[0];
      expect(options).toBeDefined();
      
      expect(options.connectTimeout).toBe(10000);
    });

    it('should configure keep-alive', async () => {
      await redisService.connect();
      
      const constructorCalls = (Redis as jest.MockedClass<typeof Redis>).mock.calls;
      const options = (constructorCalls[0] as any)?.[0];
      expect(options).toBeDefined();
      
      expect(options.keepAlive).toBe(30000);
    });
  });

  describe('URL parsing', () => {
    it('should parse redis:// URLs correctly', async () => {
      await redisService.connect();
      
      const constructorCalls = (Redis as jest.MockedClass<typeof Redis>).mock.calls;
      const options = (constructorCalls[0] as any)?.[0];
      expect(options).toBeDefined();
      
      // Verify that host and port are extracted from config
      expect(options.host).toBeDefined();
      expect(options.port).toBeDefined();
      expect(typeof options.host).toBe('string');
      expect(typeof options.port).toBe('number');
    });

    it('should configure database number from config', async () => {
      await redisService.connect();
      
      const constructorCalls = (Redis as jest.MockedClass<typeof Redis>).mock.calls;
      const options = (constructorCalls[0] as any)?.[0];
      expect(options).toBeDefined();
      
      expect(options.db).toBeDefined();
      expect(typeof options.db).toBe('number');
    });

    it('should handle password from config', async () => {
      await redisService.connect();
      
      const constructorCalls = (Redis as jest.MockedClass<typeof Redis>).mock.calls;
      const options = (constructorCalls[0] as any)?.[0];
      expect(options).toBeDefined();
      
      // Password should be undefined or string
      if (options.password !== undefined) {
        expect(typeof options.password).toBe('string');
      }
    });
  });

  describe('createPipeline', () => {
    it('should create a pipeline from the Redis client', async () => {
      await redisService.connect();
      
      const pipeline = redisService.createPipeline();
      
      expect(mockRedisInstance.pipeline).toHaveBeenCalled();
      expect(pipeline).toBe(mockPipeline);
    });

    it('should throw error if called before connection', () => {
      expect(() => redisService.createPipeline()).toThrow(
        'Redis client not initialized. Call connect() first.'
      );
    });
  });

  describe('executePipeline', () => {
    it('should execute pipeline and return results', async () => {
      await redisService.connect();
      
      const mockResults: Array<[Error | null, unknown]> = [
        [null, 1],
        [null, 'OK'],
        [null, 1],
      ];
      mockPipeline.exec.mockResolvedValue(mockResults);
      
      const pipeline = redisService.createPipeline();
      const results = await redisService.executePipeline(pipeline);
      
      expect(mockPipeline.exec).toHaveBeenCalled();
      expect(results).toEqual(mockResults);
    });

    it('should return empty array if exec returns null', async () => {
      await redisService.connect();
      
      mockPipeline.exec.mockResolvedValue(null);
      
      const pipeline = redisService.createPipeline();
      const results = await redisService.executePipeline(pipeline);
      
      expect(results).toEqual([]);
    });

    it('should handle pipeline execution errors', async () => {
      await redisService.connect();
      
      mockPipeline.exec.mockRejectedValue(new Error('Pipeline failed'));
      
      const pipeline = redisService.createPipeline();
      
      await expect(redisService.executePipeline(pipeline)).rejects.toThrow('Pipeline failed');
    });

    it('should log warning when some commands fail', async () => {
      await redisService.connect();
      
      const mockResults: Array<[Error | null, unknown]> = [
        [null, 1],
        [new Error('Command failed'), null],
        [null, 'OK'],
      ];
      mockPipeline.exec.mockResolvedValue(mockResults);
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const pipeline = redisService.createPipeline();
      const results = await redisService.executePipeline(pipeline);
      
      expect(results).toEqual(mockResults);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Redis] Pipeline execution completed with errors:',
        expect.objectContaining({
          total: 3,
          success: 2,
          failed: 1,
        })
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('bulkUpdateLeaderboard', () => {
    it('should batch multiple ZADD commands in one pipeline', async () => {
      await redisService.connect();
      
      const mockResults: Array<[Error | null, unknown]> = [
        [null, 1],
        [null, 1],
        [null, 1],
      ];
      mockPipeline.exec.mockResolvedValue(mockResults);
      
      const updates = [
        { participantId: 'p1', totalScore: 100, totalTimeMs: 5000 },
        { participantId: 'p2', totalScore: 150, totalTimeMs: 4000 },
        { participantId: 'p3', totalScore: 100, totalTimeMs: 3000 },
      ];
      
      const result = await redisService.bulkUpdateLeaderboard('session-123', updates);
      
      expect(mockRedisInstance.pipeline).toHaveBeenCalled();
      expect(mockPipeline.zadd).toHaveBeenCalledTimes(3);
      expect(mockPipeline.exec).toHaveBeenCalled();
      expect(result.successCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should calculate composite score with tie-breaker', async () => {
      await redisService.connect();
      
      mockPipeline.exec.mockResolvedValue([[null, 1]]);
      
      const updates = [
        { participantId: 'p1', totalScore: 100, totalTimeMs: 5000 },
      ];
      
      await redisService.bulkUpdateLeaderboard('session-123', updates);
      
      // Expected score: 100 - (5000 / 1000000000) = 99.999995
      const expectedScore = 100 - 5000 / 1000000000;
      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        'session:session-123:leaderboard',
        expectedScore,
        'p1'
      );
    });

    it('should return empty result for empty updates array', async () => {
      await redisService.connect();
      
      const result = await redisService.bulkUpdateLeaderboard('session-123', []);
      
      expect(mockRedisInstance.pipeline).not.toHaveBeenCalled();
      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should track errors for failed commands', async () => {
      await redisService.connect();
      
      const mockResults: Array<[Error | null, unknown]> = [
        [null, 1],
        [new Error('ZADD failed'), null],
        [null, 1],
      ];
      mockPipeline.exec.mockResolvedValue(mockResults);
      
      const updates = [
        { participantId: 'p1', totalScore: 100, totalTimeMs: 5000 },
        { participantId: 'p2', totalScore: 150, totalTimeMs: 4000 },
        { participantId: 'p3', totalScore: 100, totalTimeMs: 3000 },
      ];
      
      const result = await redisService.bulkUpdateLeaderboard('session-123', updates);
      
      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        participantId: 'p2',
        error: 'ZADD failed',
      });
    });
  });

  describe('bulkUpdateParticipantSessions', () => {
    it('should batch multiple HSET commands in one pipeline', async () => {
      await redisService.connect();
      
      const mockResults: Array<[Error | null, unknown]> = [
        [null, 1],
        [null, 1],
      ];
      mockPipeline.exec.mockResolvedValue(mockResults);
      
      const updates = [
        { participantId: 'p1', data: { totalScore: 100, streakCount: 3 } },
        { participantId: 'p2', data: { totalScore: 150, streakCount: 2 } },
      ];
      
      const result = await redisService.bulkUpdateParticipantSessions(updates);
      
      expect(mockRedisInstance.pipeline).toHaveBeenCalled();
      expect(mockPipeline.hset).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });

    it('should convert all values to strings', async () => {
      await redisService.connect();
      
      mockPipeline.exec.mockResolvedValue([[null, 1]]);
      
      const updates = [
        { participantId: 'p1', data: { totalScore: 100, streakCount: 5 } },
      ];
      
      await redisService.bulkUpdateParticipantSessions(updates);
      
      expect(mockPipeline.hset).toHaveBeenCalledWith(
        'participant:p1:session',
        { totalScore: '100', streakCount: '5' }
      );
    });

    it('should return empty result for empty updates array', async () => {
      await redisService.connect();
      
      const result = await redisService.bulkUpdateParticipantSessions([]);
      
      expect(mockRedisInstance.pipeline).not.toHaveBeenCalled();
      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(0);
    });
  });

  describe('bulkScoreUpdate', () => {
    it('should batch both ZADD and HSET commands in one pipeline', async () => {
      await redisService.connect();
      
      // 2 participants × 2 commands each = 4 results
      const mockResults: Array<[Error | null, unknown]> = [
        [null, 1], // p1 ZADD
        [null, 1], // p1 HSET
        [null, 1], // p2 ZADD
        [null, 1], // p2 HSET
      ];
      mockPipeline.exec.mockResolvedValue(mockResults);
      
      const updates = [
        { participantId: 'p1', totalScore: 100, totalTimeMs: 5000, lastQuestionScore: 50, streakCount: 2 },
        { participantId: 'p2', totalScore: 150, totalTimeMs: 4000, lastQuestionScore: 75, streakCount: 3 },
      ];
      
      const result = await redisService.bulkScoreUpdate('session-123', updates);
      
      expect(mockRedisInstance.pipeline).toHaveBeenCalled();
      expect(mockPipeline.zadd).toHaveBeenCalledTimes(2);
      expect(mockPipeline.hset).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
      expect(result.leaderboardSuccessCount).toBe(2);
      expect(result.sessionSuccessCount).toBe(2);
      expect(result.failedCount).toBe(0);
    });

    it('should track errors separately for leaderboard and session operations', async () => {
      await redisService.connect();
      
      const mockResults: Array<[Error | null, unknown]> = [
        [null, 1],                          // p1 ZADD - success
        [new Error('HSET failed'), null],   // p1 HSET - fail
        [new Error('ZADD failed'), null],   // p2 ZADD - fail
        [null, 1],                          // p2 HSET - success
      ];
      mockPipeline.exec.mockResolvedValue(mockResults);
      
      const updates = [
        { participantId: 'p1', totalScore: 100, totalTimeMs: 5000, lastQuestionScore: 50, streakCount: 2 },
        { participantId: 'p2', totalScore: 150, totalTimeMs: 4000, lastQuestionScore: 75, streakCount: 3 },
      ];
      
      const result = await redisService.bulkScoreUpdate('session-123', updates);
      
      expect(result.leaderboardSuccessCount).toBe(1);
      expect(result.sessionSuccessCount).toBe(1);
      expect(result.failedCount).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContainEqual({
        participantId: 'p1',
        operation: 'session',
        error: 'HSET failed',
      });
      expect(result.errors).toContainEqual({
        participantId: 'p2',
        operation: 'leaderboard',
        error: 'ZADD failed',
      });
    });

    it('should return empty result for empty updates array', async () => {
      await redisService.connect();
      
      const result = await redisService.bulkScoreUpdate('session-123', []);
      
      expect(mockRedisInstance.pipeline).not.toHaveBeenCalled();
      expect(result.leaderboardSuccessCount).toBe(0);
      expect(result.sessionSuccessCount).toBe(0);
      expect(result.failedCount).toBe(0);
    });
  });

  describe('bulkRefreshParticipantTTL', () => {
    it('should batch multiple EXPIRE commands in one pipeline', async () => {
      await redisService.connect();
      
      const mockResults: Array<[Error | null, unknown]> = [
        [null, 1],
        [null, 1],
        [null, 1],
      ];
      mockPipeline.exec.mockResolvedValue(mockResults);
      
      const participantIds = ['p1', 'p2', 'p3'];
      
      const result = await redisService.bulkRefreshParticipantTTL(participantIds, 300);
      
      expect(mockRedisInstance.pipeline).toHaveBeenCalled();
      expect(mockPipeline.expire).toHaveBeenCalledTimes(3);
      expect(mockPipeline.expire).toHaveBeenCalledWith('participant:p1:session', 300);
      expect(mockPipeline.expire).toHaveBeenCalledWith('participant:p2:session', 300);
      expect(mockPipeline.expire).toHaveBeenCalledWith('participant:p3:session', 300);
      expect(mockPipeline.exec).toHaveBeenCalled();
      expect(result.successCount).toBe(3);
      expect(result.failedCount).toBe(0);
    });

    it('should use default TTL of 300 seconds', async () => {
      await redisService.connect();
      
      mockPipeline.exec.mockResolvedValue([[null, 1]]);
      
      await redisService.bulkRefreshParticipantTTL(['p1']);
      
      expect(mockPipeline.expire).toHaveBeenCalledWith('participant:p1:session', 300);
    });

    it('should return empty result for empty participant array', async () => {
      await redisService.connect();
      
      const result = await redisService.bulkRefreshParticipantTTL([]);
      
      expect(mockRedisInstance.pipeline).not.toHaveBeenCalled();
      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(0);
    });

    it('should count failed EXPIRE commands', async () => {
      await redisService.connect();
      
      const mockResults: Array<[Error | null, unknown]> = [
        [null, 1],
        [new Error('EXPIRE failed'), null],
        [null, 1],
      ];
      mockPipeline.exec.mockResolvedValue(mockResults);
      
      const result = await redisService.bulkRefreshParticipantTTL(['p1', 'p2', 'p3']);
      
      expect(result.successCount).toBe(2);
      expect(result.failedCount).toBe(1);
    });
  });
});
