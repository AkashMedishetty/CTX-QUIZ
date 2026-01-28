/**
 * Redis Service
 * 
 * Provides Redis client with:
 * - Connection pooling
 * - Exponential backoff reconnection strategy
 * - Memory limits and eviction policy configuration
 * - Error handling and logging
 * - Pipeline support for bulk operations (reduces network round trips)
 * 
 * Requirements: 11.4, 11.6, 18.6
 */

import Redis, { RedisOptions, ChainableCommander } from 'ioredis';
import { config } from '../config';

class RedisService {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly BASE_DELAY_MS = 1000; // 1 second
  private readonly MAX_DELAY_MS = 30000; // 30 seconds

  /**
   * Get the main Redis client instance
   */
  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Get the subscriber client for pub/sub
   */
  getSubscriber(): Redis {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not initialized. Call connect() first.');
    }
    return this.subscriber;
  }

  /**
   * Get the publisher client for pub/sub
   */
  getPublisher(): Redis {
    if (!this.publisher) {
      throw new Error('Redis publisher not initialized. Call connect() first.');
    }
    return this.publisher;
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff: delay = min(base * 2^attempt, maxDelay)
    const exponentialDelay = Math.min(
      this.BASE_DELAY_MS * Math.pow(2, attempt),
      this.MAX_DELAY_MS
    );
    
    // Add jitter (±20%) to prevent thundering herd
    const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);
    
    return Math.floor(exponentialDelay + jitter);
  }

  /**
   * Create Redis client options with reconnection strategy
   */
  private createClientOptions(): RedisOptions {
    return {
      // Connection settings
      host: this.parseRedisUrl().host,
      port: this.parseRedisUrl().port,
      password: config.redis.password || undefined,
      db: config.redis.db,
      
      // Connection pooling
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      
      // Reconnection strategy with exponential backoff
      retryStrategy: (times: number) => {
        this.reconnectAttempts = times;
        
        if (times > this.MAX_RECONNECT_ATTEMPTS) {
          console.error(
            `[Redis] Max reconnection attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`
          );
          return null; // Stop reconnecting
        }
        
        const delay = this.calculateBackoffDelay(times - 1);
        console.log(
          `[Redis] Reconnection attempt ${times}/${this.MAX_RECONNECT_ATTEMPTS}. ` +
          `Retrying in ${delay}ms...`
        );
        
        return delay;
      },
      
      // Connection timeout
      connectTimeout: 10000, // 10 seconds
      
      // Keep-alive settings
      keepAlive: 30000, // 30 seconds
      
      // Lazy connect (don't connect immediately)
      lazyConnect: true,
    };
  }

  /**
   * Parse Redis URL to extract host and port
   */
  private parseRedisUrl(): { host: string; port: number } {
    const url = config.redis.url;
    
    // Handle redis:// URLs
    if (url.startsWith('redis://')) {
      const urlObj = new URL(url);
      return {
        host: urlObj.hostname || 'localhost',
        port: parseInt(urlObj.port || '6379', 10),
      };
    }
    
    // Handle host:port format
    if (url.includes(':')) {
      const [host, port] = url.split(':');
      return {
        host: host || 'localhost',
        port: parseInt(port || '6379', 10),
      };
    }
    
    // Default to localhost:6379
    return { host: url || 'localhost', port: 6379 };
  }

  /**
   * Configure Redis memory limits and eviction policy
   */
  private async configureMemorySettings(): Promise<void> {
    try {
      const client = this.getClient();
      
      // Set maxmemory to 256MB (adjust based on VPS resources)
      // This leaves room for MongoDB and application on 2GB VPS
      await client.config('SET', 'maxmemory', '256mb');
      
      // Set eviction policy to allkeys-lru
      // This evicts least recently used keys when memory limit is reached
      await client.config('SET', 'maxmemory-policy', 'allkeys-lru');
      
      console.log('[Redis] Memory settings configured: maxmemory=256mb, policy=allkeys-lru');
    } catch (error) {
      console.error('[Redis] Failed to configure memory settings:', error);
      // Don't throw - continue with default settings
    }
  }

  /**
   * Set up event handlers for Redis client
   */
  private setupEventHandlers(client: Redis, clientName: string): void {
    client.on('connect', () => {
      console.log(`[Redis] ${clientName} connecting...`);
    });

    client.on('ready', () => {
      console.log(`[Redis] ${clientName} ready`);
      this.reconnectAttempts = 0; // Reset counter on successful connection
    });

    client.on('error', (error) => {
      console.error(`[Redis] ${clientName} error:`, error.message);
    });

    client.on('close', () => {
      console.log(`[Redis] ${clientName} connection closed`);
    });

    client.on('reconnecting', (delay: number) => {
      console.log(
        `[Redis] ${clientName} reconnecting in ${delay}ms ` +
        `(attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`
      );
    });

    client.on('end', () => {
      console.log(`[Redis] ${clientName} connection ended`);
    });
  }

  /**
   * Connect to Redis and initialize clients
   */
  async connect(): Promise<void> {
    try {
      console.log('[Redis] Initializing Redis connection...');
      
      const options = this.createClientOptions();
      
      // Create main client for general operations
      this.client = new Redis(options);
      this.setupEventHandlers(this.client, 'Client');
      await this.client.connect();
      
      // Create subscriber client for pub/sub (separate connection required)
      this.subscriber = new Redis(options);
      this.setupEventHandlers(this.subscriber, 'Subscriber');
      await this.subscriber.connect();
      
      // Create publisher client for pub/sub (separate connection required)
      this.publisher = new Redis(options);
      this.setupEventHandlers(this.publisher, 'Publisher');
      await this.publisher.connect();
      
      // Configure memory settings
      await this.configureMemorySettings();
      
      // Test connection
      const pingResult = await this.client.ping();
      if (pingResult !== 'PONG') {
        throw new Error('Redis ping failed');
      }
      
      console.log('[Redis] All clients connected successfully');
    } catch (error) {
      console.error('[Redis] Failed to connect:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    try {
      console.log('[Redis] Disconnecting...');
      
      if (this.client) {
        await this.client.quit();
        this.client = null;
      }
      
      if (this.subscriber) {
        await this.subscriber.quit();
        this.subscriber = null;
      }
      
      if (this.publisher) {
        await this.publisher.quit();
        this.publisher = null;
      }
      
      console.log('[Redis] Disconnected successfully');
    } catch (error) {
      console.error('[Redis] Error during disconnect:', error);
      throw error;
    }
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return (
      this.client?.status === 'ready' &&
      this.subscriber?.status === 'ready' &&
      this.publisher?.status === 'ready'
    );
  }

  /**
   * Get connection status
   */
  getStatus(): {
    client: string;
    subscriber: string;
    publisher: string;
    reconnectAttempts: number;
  } {
    return {
      client: this.client?.status || 'disconnected',
      subscriber: this.subscriber?.status || 'disconnected',
      publisher: this.publisher?.status || 'disconnected',
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Health check - verify Redis is responsive
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected()) {
        return false;
      }
      
      const pingResult = await this.client!.ping();
      return pingResult === 'PONG';
    } catch (error) {
      console.error('[Redis] Health check failed:', error);
      return false;
    }
  }

  /**
   * Create a new Redis pipeline for batching multiple commands
   * 
   * Pipelines allow batching multiple Redis commands in one network round trip,
   * significantly improving performance for bulk operations like leaderboard updates.
   * 
   * Usage:
   * ```typescript
   * const pipeline = redisService.createPipeline();
   * pipeline.zadd('leaderboard', score1, 'player1');
   * pipeline.zadd('leaderboard', score2, 'player2');
   * pipeline.hset('player:1', 'score', score1);
   * const results = await redisService.executePipeline(pipeline);
   * ```
   * 
   * Requirements: 11.4 - Batch multiple Redis commands in one round trip
   * 
   * @returns ChainableCommander (Redis pipeline instance)
   */
  createPipeline(): ChainableCommander {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    return this.client.pipeline();
  }

  /**
   * Execute a Redis pipeline and return results
   * 
   * Executes all queued commands in the pipeline in a single network round trip.
   * Returns an array of results, one for each command in the pipeline.
   * 
   * Each result is a tuple of [error, result]:
   * - If the command succeeded: [null, result]
   * - If the command failed: [Error, null]
   * 
   * Requirements: 11.4 - Batch multiple Redis commands in one round trip
   * 
   * @param pipeline - The pipeline to execute
   * @returns Array of [error, result] tuples for each command
   */
  async executePipeline(
    pipeline: ChainableCommander
  ): Promise<Array<[Error | null, unknown]>> {
    try {
      const results = await pipeline.exec();
      
      if (!results) {
        console.warn('[Redis] Pipeline execution returned null results');
        return [];
      }

      // Log pipeline execution stats
      const successCount = results.filter(([err]) => err === null).length;
      const failCount = results.length - successCount;
      
      if (failCount > 0) {
        console.warn('[Redis] Pipeline execution completed with errors:', {
          total: results.length,
          success: successCount,
          failed: failCount,
        });
      }

      return results;
    } catch (error) {
      console.error('[Redis] Pipeline execution failed:', error);
      throw error;
    }
  }

  /**
   * Bulk update leaderboard scores using pipeline
   * 
   * Efficiently updates multiple participant scores in the leaderboard sorted set
   * using a single network round trip. This is critical for handling 500+ concurrent
   * users during score calculations.
   * 
   * The leaderboard uses a composite score for tie-breaking:
   * score = totalScore - (totalTimeMs / 1000000000)
   * This ensures higher scores rank first, and among equal scores, faster times rank higher.
   * 
   * Requirements: 11.4 - Use Redis pipeline for leaderboard updates
   * 
   * @param sessionId - The session ID for the leaderboard
   * @param updates - Array of participant score updates
   * @returns Object with success count and any errors
   */
  async bulkUpdateLeaderboard(
    sessionId: string,
    updates: Array<{
      participantId: string;
      totalScore: number;
      totalTimeMs: number;
    }>
  ): Promise<{
    successCount: number;
    failedCount: number;
    errors: Array<{ participantId: string; error: string }>;
  }> {
    if (updates.length === 0) {
      return { successCount: 0, failedCount: 0, errors: [] };
    }

    const leaderboardKey = `session:${sessionId}:leaderboard`;
    const pipeline = this.createPipeline();

    // Queue all ZADD commands in the pipeline
    for (const update of updates) {
      // Calculate composite score for tie-breaking
      // Higher score = better, lower time = better (for ties)
      const leaderboardScore = update.totalScore - update.totalTimeMs / 1000000000;
      pipeline.zadd(leaderboardKey, leaderboardScore, update.participantId);
    }

    console.log('[Redis] Executing bulk leaderboard update:', {
      sessionId,
      updateCount: updates.length,
    });

    // Execute pipeline
    const results = await this.executePipeline(pipeline);

    // Process results
    const errors: Array<{ participantId: string; error: string }> = [];
    let successCount = 0;

    results.forEach(([err], index) => {
      if (err) {
        errors.push({
          participantId: updates[index].participantId,
          error: err.message,
        });
      } else {
        successCount++;
      }
    });

    console.log('[Redis] Bulk leaderboard update completed:', {
      sessionId,
      successCount,
      failedCount: errors.length,
    });

    return {
      successCount,
      failedCount: errors.length,
      errors,
    };
  }

  /**
   * Bulk update participant session data using pipeline
   * 
   * Efficiently updates multiple participant session hashes in a single
   * network round trip. Useful for batch score updates after question reveal.
   * 
   * Requirements: 11.4 - Batch multiple Redis commands in one round trip
   * 
   * @param updates - Array of participant session updates
   * @returns Object with success count and any errors
   */
  async bulkUpdateParticipantSessions(
    updates: Array<{
      participantId: string;
      data: Record<string, string | number>;
    }>
  ): Promise<{
    successCount: number;
    failedCount: number;
    errors: Array<{ participantId: string; error: string }>;
  }> {
    if (updates.length === 0) {
      return { successCount: 0, failedCount: 0, errors: [] };
    }

    const pipeline = this.createPipeline();

    // Queue all HSET commands in the pipeline
    for (const update of updates) {
      const participantKey = `participant:${update.participantId}:session`;
      
      // Convert all values to strings for Redis
      const stringData: Record<string, string> = {};
      for (const [key, value] of Object.entries(update.data)) {
        stringData[key] = String(value);
      }
      
      pipeline.hset(participantKey, stringData);
    }

    console.log('[Redis] Executing bulk participant session update:', {
      updateCount: updates.length,
    });

    // Execute pipeline
    const results = await this.executePipeline(pipeline);

    // Process results
    const errors: Array<{ participantId: string; error: string }> = [];
    let successCount = 0;

    results.forEach(([err], index) => {
      if (err) {
        errors.push({
          participantId: updates[index].participantId,
          error: err.message,
        });
      } else {
        successCount++;
      }
    });

    console.log('[Redis] Bulk participant session update completed:', {
      successCount,
      failedCount: errors.length,
    });

    return {
      successCount,
      failedCount: errors.length,
      errors,
    };
  }

  /**
   * Bulk operations for combined leaderboard and participant updates
   * 
   * Performs both leaderboard and participant session updates in a single
   * pipeline execution. This is the most efficient way to update scores
   * for multiple participants after a question is answered.
   * 
   * Requirements: 11.4 - Batch multiple Redis commands in one round trip
   * 
   * @param sessionId - The session ID
   * @param updates - Array of combined updates
   * @returns Object with success counts and any errors
   */
  async bulkScoreUpdate(
    sessionId: string,
    updates: Array<{
      participantId: string;
      totalScore: number;
      totalTimeMs: number;
      lastQuestionScore: number;
      streakCount: number;
    }>
  ): Promise<{
    leaderboardSuccessCount: number;
    sessionSuccessCount: number;
    failedCount: number;
    errors: Array<{ participantId: string; operation: string; error: string }>;
  }> {
    if (updates.length === 0) {
      return {
        leaderboardSuccessCount: 0,
        sessionSuccessCount: 0,
        failedCount: 0,
        errors: [],
      };
    }

    const leaderboardKey = `session:${sessionId}:leaderboard`;
    const pipeline = this.createPipeline();

    // Queue all commands in the pipeline
    // For each participant: 1 ZADD (leaderboard) + 1 HSET (session)
    for (const update of updates) {
      // Leaderboard update (ZADD)
      const leaderboardScore = update.totalScore - update.totalTimeMs / 1000000000;
      pipeline.zadd(leaderboardKey, leaderboardScore, update.participantId);

      // Participant session update (HSET)
      const participantKey = `participant:${update.participantId}:session`;
      pipeline.hset(participantKey, {
        totalScore: String(update.totalScore),
        totalTimeMs: String(update.totalTimeMs),
        lastQuestionScore: String(update.lastQuestionScore),
        streakCount: String(update.streakCount),
      });
    }

    console.log('[Redis] Executing bulk score update:', {
      sessionId,
      participantCount: updates.length,
      commandCount: updates.length * 2, // 2 commands per participant
    });

    // Execute pipeline
    const results = await this.executePipeline(pipeline);

    // Process results (alternating: ZADD, HSET, ZADD, HSET, ...)
    const errors: Array<{ participantId: string; operation: string; error: string }> = [];
    let leaderboardSuccessCount = 0;
    let sessionSuccessCount = 0;

    results.forEach(([err], index) => {
      const participantIndex = Math.floor(index / 2);
      const isLeaderboardOp = index % 2 === 0;
      const operation = isLeaderboardOp ? 'leaderboard' : 'session';

      if (err) {
        errors.push({
          participantId: updates[participantIndex].participantId,
          operation,
          error: err.message,
        });
      } else {
        if (isLeaderboardOp) {
          leaderboardSuccessCount++;
        } else {
          sessionSuccessCount++;
        }
      }
    });

    console.log('[Redis] Bulk score update completed:', {
      sessionId,
      leaderboardSuccessCount,
      sessionSuccessCount,
      failedCount: errors.length,
    });

    return {
      leaderboardSuccessCount,
      sessionSuccessCount,
      failedCount: errors.length,
      errors,
    };
  }

  /**
   * Refresh TTL for multiple participant sessions using pipeline
   * 
   * Efficiently extends the TTL for multiple participant sessions in a single
   * network round trip. Useful for keeping active participants' sessions alive.
   * 
   * Requirements: 11.4 - Batch multiple Redis commands in one round trip
   * 
   * @param participantIds - Array of participant IDs
   * @param ttlSeconds - TTL in seconds (default: 300 = 5 minutes)
   * @returns Object with success count and any errors
   */
  async bulkRefreshParticipantTTL(
    participantIds: string[],
    ttlSeconds: number = 300
  ): Promise<{
    successCount: number;
    failedCount: number;
  }> {
    if (participantIds.length === 0) {
      return { successCount: 0, failedCount: 0 };
    }

    const pipeline = this.createPipeline();

    // Queue all EXPIRE commands in the pipeline
    for (const participantId of participantIds) {
      const participantKey = `participant:${participantId}:session`;
      pipeline.expire(participantKey, ttlSeconds);
    }

    console.log('[Redis] Executing bulk TTL refresh:', {
      participantCount: participantIds.length,
      ttlSeconds,
    });

    // Execute pipeline
    const results = await this.executePipeline(pipeline);

    // Count successes and failures
    let successCount = 0;
    let failedCount = 0;

    results.forEach(([err]) => {
      if (err) {
        failedCount++;
      } else {
        successCount++;
      }
    });

    console.log('[Redis] Bulk TTL refresh completed:', {
      successCount,
      failedCount,
    });

    return { successCount, failedCount };
  }
}

// Export singleton instance
export const redisService = new RedisService();
