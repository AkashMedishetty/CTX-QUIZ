/**
 * Redis Fallback Service
 * 
 * Provides in-memory cache fallback when Redis is unavailable.
 * Stores session state and leaderboard in memory with TTL support.
 * Logs degraded performance warnings.
 * 
 * Requirements: 17.3
 */

import { redisService } from './redis.service';
import { SessionState, ParticipantSession } from './redis-data-structures.service';

// TTL constants (in milliseconds)
const TTL = {
  SESSION_STATE: 6 * 60 * 60 * 1000, // 6 hours
  PARTICIPANT_SESSION: 5 * 60 * 1000, // 5 minutes
  LEADERBOARD: 6 * 60 * 60 * 1000, // 6 hours
  JOIN_CODE: 6 * 60 * 60 * 1000, // 6 hours
  RATE_LIMIT_JOIN: 60 * 1000, // 1 minute
  RATE_LIMIT_ANSWER: 5 * 60 * 1000, // 5 minutes
  CLEANUP_INTERVAL: 60 * 1000, // 1 minute
} as const;

// In-memory cache entry with TTL support
interface CacheEntry<T> {
  value: T;
  expiresAt: number | null; // null means no expiration
  createdAt: number;
}

// Leaderboard entry
interface LeaderboardEntry {
  participantId: string;
  score: number;
}

// Alert callback type
type AlertCallback = (message: string, details: Record<string, any>) => void;

/**
 * Redis Fallback Service
 * 
 * Provides in-memory storage when Redis is unavailable.
 * Implements the same data structures as Redis:
 * - Session state (hash-like)
 * - Participant session (hash-like)
 * - Leaderboard (sorted set-like)
 * - Join code mapping (string-like)
 * - Rate limiting (string-like)
 */
class RedisFallbackService {
  // In-memory storage
  private sessionStates: Map<string, CacheEntry<SessionState>> = new Map();
  private participantSessions: Map<string, CacheEntry<ParticipantSession>> = new Map();
  private leaderboards: Map<string, CacheEntry<LeaderboardEntry[]>> = new Map();
  private joinCodes: Map<string, CacheEntry<string>> = new Map();
  private rateLimits: Map<string, CacheEntry<number>> = new Map();
  private genericCache: Map<string, CacheEntry<any>> = new Map();

  // Fallback state
  private isInFallbackMode: boolean = false;
  private fallbackStartTime: number | null = null;
  private lastHealthCheckTime: number = 0;
  private healthCheckInterval: number = 30000; // 30 seconds

  // Cleanup timer
  private cleanupTimer: NodeJS.Timeout | null = null;

  // Alert callbacks
  private alertCallbacks: Set<AlertCallback> = new Set();

  constructor() {
    // Start periodic cleanup
    this.startCleanupTimer();
  }

  /**
   * Start the periodic cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries();
    }, TTL.CLEANUP_INTERVAL);

    // Don't prevent Node.js from exiting
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clean up expired entries from all caches
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;

    // Clean session states
    for (const [key, entry] of this.sessionStates.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.sessionStates.delete(key);
        cleanedCount++;
      }
    }

    // Clean participant sessions
    for (const [key, entry] of this.participantSessions.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.participantSessions.delete(key);
        cleanedCount++;
      }
    }

    // Clean leaderboards
    for (const [key, entry] of this.leaderboards.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.leaderboards.delete(key);
        cleanedCount++;
      }
    }

    // Clean join codes
    for (const [key, entry] of this.joinCodes.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.joinCodes.delete(key);
        cleanedCount++;
      }
    }

    // Clean rate limits
    for (const [key, entry] of this.rateLimits.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.rateLimits.delete(key);
        cleanedCount++;
      }
    }

    // Clean generic cache
    for (const [key, entry] of this.genericCache.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.genericCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[RedisFallback] Cleaned up ${cleanedCount} expired entries`);
    }
  }

  /**
   * Register an alert callback
   */
  onAlert(callback: AlertCallback): void {
    this.alertCallbacks.add(callback);
  }

  /**
   * Unregister an alert callback
   */
  offAlert(callback: AlertCallback): void {
    this.alertCallbacks.delete(callback);
  }

  /**
   * Trigger alert callbacks
   */
  private triggerAlert(message: string, details: Record<string, any>): void {
    for (const callback of this.alertCallbacks) {
      try {
        callback(message, details);
      } catch (error) {
        console.error('[RedisFallback] Alert callback error:', error);
      }
    }
  }

  /**
   * Log degraded performance warning
   */
  private logDegradedWarning(operation: string, details?: Record<string, any>): void {
    const message = `[RedisFallback] DEGRADED PERFORMANCE: ${operation} using in-memory fallback`;
    console.warn(message, details || {});

    this.triggerAlert(message, {
      operation,
      timestamp: Date.now(),
      fallbackDuration: this.fallbackStartTime ? Date.now() - this.fallbackStartTime : 0,
      ...details,
    });
  }

  /**
   * Check if Redis is available
   */
  async isRedisAvailable(): Promise<boolean> {
    try {
      // Rate limit health checks
      const now = Date.now();
      if (now - this.lastHealthCheckTime < this.healthCheckInterval && !this.isInFallbackMode) {
        return true;
      }

      this.lastHealthCheckTime = now;
      const isHealthy = await redisService.healthCheck();
      
      if (isHealthy && this.isInFallbackMode) {
        // Redis recovered
        console.log('[RedisFallback] Redis connection recovered');
        this.isInFallbackMode = false;
        this.fallbackStartTime = null;
        this.triggerAlert('Redis connection recovered', { timestamp: now });
      }

      return isHealthy;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if currently in fallback mode
   */
  isUsingFallback(): boolean {
    return this.isInFallbackMode;
  }

  /**
   * Enter fallback mode
   */
  enterFallbackMode(): void {
    if (!this.isInFallbackMode) {
      this.isInFallbackMode = true;
      this.fallbackStartTime = Date.now();
      console.warn('[RedisFallback] Entering fallback mode - using in-memory cache');
      this.triggerAlert('Entering Redis fallback mode', {
        timestamp: this.fallbackStartTime,
      });
    }
  }

  /**
   * Exit fallback mode
   */
  exitFallbackMode(): void {
    if (this.isInFallbackMode) {
      const duration = this.fallbackStartTime ? Date.now() - this.fallbackStartTime : 0;
      console.log(`[RedisFallback] Exiting fallback mode after ${duration}ms`);
      this.isInFallbackMode = false;
      this.fallbackStartTime = null;
      this.triggerAlert('Exiting Redis fallback mode', {
        timestamp: Date.now(),
        duration,
      });
    }
  }

  /**
   * Detect if an error indicates Redis unavailability
   */
  isUnavailabilityError(error: any): boolean {
    if (!error) return false;

    // Check error codes
    const unavailabilityCodes = [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'ENOTFOUND',
      'EPIPE',
    ];

    if (error.code && unavailabilityCodes.includes(error.code)) {
      return true;
    }

    // Check error message
    const message = (error.message || '').toLowerCase();
    if (
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('refused') ||
      message.includes('unreachable') ||
      message.includes('not ready')
    ) {
      return true;
    }

    // Check error name
    const name = (error.name || '').toLowerCase();
    if (
      name.includes('connection') ||
      name.includes('timeout') ||
      name.includes('redis')
    ) {
      return true;
    }

    return false;
  }

  // ==================== Session State Operations ====================

  /**
   * Set session state in fallback cache
   */
  setSessionState(sessionId: string, state: SessionState): void {
    this.logDegradedWarning('setSessionState', { sessionId });
    
    const key = `session:${sessionId}:state`;
    this.sessionStates.set(key, {
      value: { ...state },
      expiresAt: Date.now() + TTL.SESSION_STATE,
      createdAt: Date.now(),
    });
  }

  /**
   * Get session state from fallback cache
   */
  getSessionState(sessionId: string): SessionState | null {
    const key = `session:${sessionId}:state`;
    const entry = this.sessionStates.get(key);

    if (!entry) return null;

    // Check expiration
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.sessionStates.delete(key);
      return null;
    }

    this.logDegradedWarning('getSessionState', { sessionId });
    return { ...entry.value };
  }

  /**
   * Update session state in fallback cache
   */
  updateSessionState(sessionId: string, updates: Partial<SessionState>): void {
    const key = `session:${sessionId}:state`;
    const entry = this.sessionStates.get(key);

    if (entry && (!entry.expiresAt || entry.expiresAt > Date.now())) {
      this.logDegradedWarning('updateSessionState', { sessionId });
      entry.value = { ...entry.value, ...updates };
      entry.expiresAt = Date.now() + TTL.SESSION_STATE;
    }
  }

  /**
   * Delete session state from fallback cache
   */
  deleteSessionState(sessionId: string): void {
    const key = `session:${sessionId}:state`;
    this.sessionStates.delete(key);
  }

  // ==================== Participant Session Operations ====================

  /**
   * Set participant session in fallback cache
   */
  setParticipantSession(participantId: string, session: ParticipantSession): void {
    this.logDegradedWarning('setParticipantSession', { participantId });
    
    const key = `participant:${participantId}:session`;
    this.participantSessions.set(key, {
      value: { ...session },
      expiresAt: Date.now() + TTL.PARTICIPANT_SESSION,
      createdAt: Date.now(),
    });
  }

  /**
   * Get participant session from fallback cache
   */
  getParticipantSession(participantId: string): ParticipantSession | null {
    const key = `participant:${participantId}:session`;
    const entry = this.participantSessions.get(key);

    if (!entry) return null;

    // Check expiration
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.participantSessions.delete(key);
      return null;
    }

    this.logDegradedWarning('getParticipantSession', { participantId });
    return { ...entry.value };
  }

  /**
   * Update participant session in fallback cache
   */
  updateParticipantSession(participantId: string, updates: Partial<ParticipantSession>): void {
    const key = `participant:${participantId}:session`;
    const entry = this.participantSessions.get(key);

    if (entry && (!entry.expiresAt || entry.expiresAt > Date.now())) {
      this.logDegradedWarning('updateParticipantSession', { participantId });
      entry.value = { ...entry.value, ...updates };
      entry.expiresAt = Date.now() + TTL.PARTICIPANT_SESSION;
    }
  }

  /**
   * Refresh participant session TTL
   */
  refreshParticipantSession(participantId: string): void {
    const key = `participant:${participantId}:session`;
    const entry = this.participantSessions.get(key);

    if (entry) {
      entry.expiresAt = Date.now() + TTL.PARTICIPANT_SESSION;
    }
  }

  /**
   * Delete participant session from fallback cache
   */
  deleteParticipantSession(participantId: string): void {
    const key = `participant:${participantId}:session`;
    this.participantSessions.delete(key);
  }

  /**
   * Check if participant session is active
   */
  isParticipantSessionActive(participantId: string): boolean {
    const key = `participant:${participantId}:session`;
    const entry = this.participantSessions.get(key);

    if (!entry) return false;

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.participantSessions.delete(key);
      return false;
    }

    return true;
  }

  // ==================== Leaderboard Operations ====================

  /**
   * Update leaderboard entry
   */
  updateLeaderboard(
    sessionId: string,
    participantId: string,
    totalScore: number,
    totalTimeMs: number
  ): void {
    this.logDegradedWarning('updateLeaderboard', { sessionId, participantId });
    
    const key = `session:${sessionId}:leaderboard`;
    let entry = this.leaderboards.get(key);

    // Calculate score with tie-breaker (same as Redis implementation)
    const score = totalScore - totalTimeMs / 1000000000;

    if (!entry) {
      entry = {
        value: [],
        expiresAt: Date.now() + TTL.LEADERBOARD,
        createdAt: Date.now(),
      };
      this.leaderboards.set(key, entry);
    }

    // Update or add participant
    const existingIndex = entry.value.findIndex(e => e.participantId === participantId);
    if (existingIndex >= 0) {
      entry.value[existingIndex].score = score;
    } else {
      entry.value.push({ participantId, score });
    }

    // Sort by score descending
    entry.value.sort((a, b) => b.score - a.score);

    // Refresh TTL
    entry.expiresAt = Date.now() + TTL.LEADERBOARD;
  }

  /**
   * Get top N from leaderboard
   */
  getTopLeaderboard(
    sessionId: string,
    limit: number = 10
  ): Array<{ participantId: string; score: number; rank: number }> {
    const key = `session:${sessionId}:leaderboard`;
    const entry = this.leaderboards.get(key);

    if (!entry) return [];

    // Check expiration
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.leaderboards.delete(key);
      return [];
    }

    this.logDegradedWarning('getTopLeaderboard', { sessionId, limit });

    return entry.value.slice(0, limit).map((e, index) => ({
      participantId: e.participantId,
      score: e.score,
      rank: index + 1,
    }));
  }

  /**
   * Get full leaderboard
   */
  getFullLeaderboard(
    sessionId: string
  ): Array<{ participantId: string; score: number; rank: number }> {
    const key = `session:${sessionId}:leaderboard`;
    const entry = this.leaderboards.get(key);

    if (!entry) return [];

    // Check expiration
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.leaderboards.delete(key);
      return [];
    }

    this.logDegradedWarning('getFullLeaderboard', { sessionId });

    return entry.value.map((e, index) => ({
      participantId: e.participantId,
      score: e.score,
      rank: index + 1,
    }));
  }

  /**
   * Get participant rank
   */
  getParticipantRank(sessionId: string, participantId: string): number | null {
    const key = `session:${sessionId}:leaderboard`;
    const entry = this.leaderboards.get(key);

    if (!entry) return null;

    // Check expiration
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.leaderboards.delete(key);
      return null;
    }

    const index = entry.value.findIndex(e => e.participantId === participantId);
    return index >= 0 ? index + 1 : null;
  }

  /**
   * Remove participant from leaderboard
   */
  removeFromLeaderboard(sessionId: string, participantId: string): void {
    const key = `session:${sessionId}:leaderboard`;
    const entry = this.leaderboards.get(key);

    if (entry) {
      entry.value = entry.value.filter(e => e.participantId !== participantId);
    }
  }

  /**
   * Delete leaderboard
   */
  deleteLeaderboard(sessionId: string): void {
    const key = `session:${sessionId}:leaderboard`;
    this.leaderboards.delete(key);
  }

  // ==================== Join Code Operations ====================

  /**
   * Set join code mapping
   */
  setJoinCodeMapping(joinCode: string, sessionId: string): void {
    this.logDegradedWarning('setJoinCodeMapping', { joinCode });
    
    const key = `joincode:${joinCode}`;
    this.joinCodes.set(key, {
      value: sessionId,
      expiresAt: Date.now() + TTL.JOIN_CODE,
      createdAt: Date.now(),
    });
  }

  /**
   * Get session ID from join code
   */
  getSessionIdFromJoinCode(joinCode: string): string | null {
    const key = `joincode:${joinCode}`;
    const entry = this.joinCodes.get(key);

    if (!entry) return null;

    // Check expiration
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.joinCodes.delete(key);
      return null;
    }

    this.logDegradedWarning('getSessionIdFromJoinCode', { joinCode });
    return entry.value;
  }

  /**
   * Delete join code mapping
   */
  deleteJoinCodeMapping(joinCode: string): void {
    const key = `joincode:${joinCode}`;
    this.joinCodes.delete(key);
  }

  /**
   * Check if join code exists
   */
  joinCodeExists(joinCode: string): boolean {
    const key = `joincode:${joinCode}`;
    const entry = this.joinCodes.get(key);

    if (!entry) return false;

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.joinCodes.delete(key);
      return false;
    }

    return true;
  }

  // ==================== Rate Limiting Operations ====================

  /**
   * Check join rate limit
   */
  checkJoinRateLimit(ipAddress: string): boolean {
    const key = `ratelimit:join:${ipAddress}`;
    const entry = this.rateLimits.get(key);
    const now = Date.now();

    if (!entry || (entry.expiresAt && entry.expiresAt <= now)) {
      // First attempt or expired
      this.rateLimits.set(key, {
        value: 1,
        expiresAt: now + TTL.RATE_LIMIT_JOIN,
        createdAt: now,
      });
      return true;
    }

    // Increment count
    entry.value++;

    // Allow up to 5 attempts per minute
    return entry.value <= 5;
  }

  /**
   * Check answer rate limit
   */
  checkAnswerRateLimit(participantId: string, questionId: string): boolean {
    const key = `ratelimit:answer:${participantId}:${questionId}`;
    const entry = this.rateLimits.get(key);
    const now = Date.now();

    if (!entry || (entry.expiresAt && entry.expiresAt <= now)) {
      // First submission
      this.rateLimits.set(key, {
        value: 1,
        expiresAt: now + TTL.RATE_LIMIT_ANSWER,
        createdAt: now,
      });
      return true;
    }

    // Already submitted
    return false;
  }

  /**
   * Check if answer was already submitted
   */
  hasAnsweredQuestion(participantId: string, questionId: string): boolean {
    const key = `ratelimit:answer:${participantId}:${questionId}`;
    const entry = this.rateLimits.get(key);

    if (!entry) return false;

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.rateLimits.delete(key);
      return false;
    }

    return true;
  }

  // ==================== Generic Cache Operations ====================

  /**
   * Set a value in the generic cache
   */
  set(key: string, value: any, ttlMs?: number): void {
    this.genericCache.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
      createdAt: Date.now(),
    });
  }

  /**
   * Get a value from the generic cache
   */
  get<T>(key: string): T | null {
    const entry = this.genericCache.get(key);

    if (!entry) return null;

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.genericCache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Delete a value from the generic cache
   */
  delete(key: string): void {
    this.genericCache.delete(key);
  }

  /**
   * Check if a key exists in the generic cache
   */
  exists(key: string): boolean {
    const entry = this.genericCache.get(key);

    if (!entry) return false;

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.genericCache.delete(key);
      return false;
    }

    return true;
  }

  // ==================== Hash Operations (Redis-like) ====================

  /**
   * Set hash field
   */
  hset(key: string, field: string, value: any): void {
    let entry = this.genericCache.get(key);

    if (!entry) {
      entry = {
        value: {},
        expiresAt: null,
        createdAt: Date.now(),
      };
      this.genericCache.set(key, entry);
    }

    if (typeof entry.value !== 'object' || entry.value === null) {
      entry.value = {};
    }

    entry.value[field] = value;
  }

  /**
   * Get hash field
   */
  hget(key: string, field: string): any {
    const entry = this.genericCache.get(key);

    if (!entry) return null;

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.genericCache.delete(key);
      return null;
    }

    if (typeof entry.value !== 'object' || entry.value === null) {
      return null;
    }

    return entry.value[field] ?? null;
  }

  /**
   * Get all hash fields
   */
  hgetall(key: string): Record<string, any> | null {
    const entry = this.genericCache.get(key);

    if (!entry) return null;

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.genericCache.delete(key);
      return null;
    }

    if (typeof entry.value !== 'object' || entry.value === null) {
      return null;
    }

    return { ...entry.value };
  }

  /**
   * Delete hash field
   */
  hdel(key: string, field: string): void {
    const entry = this.genericCache.get(key);

    if (entry && typeof entry.value === 'object' && entry.value !== null) {
      delete entry.value[field];
    }
  }

  // ==================== Status and Metrics ====================

  /**
   * Get fallback service status
   */
  getStatus(): {
    isInFallbackMode: boolean;
    fallbackDuration: number | null;
    cacheStats: {
      sessionStates: number;
      participantSessions: number;
      leaderboards: number;
      joinCodes: number;
      rateLimits: number;
      genericCache: number;
    };
  } {
    return {
      isInFallbackMode: this.isInFallbackMode,
      fallbackDuration: this.fallbackStartTime ? Date.now() - this.fallbackStartTime : null,
      cacheStats: {
        sessionStates: this.sessionStates.size,
        participantSessions: this.participantSessions.size,
        leaderboards: this.leaderboards.size,
        joinCodes: this.joinCodes.size,
        rateLimits: this.rateLimits.size,
        genericCache: this.genericCache.size,
      },
    };
  }

  /**
   * Clear all caches (for testing or reset)
   */
  clearAll(): void {
    this.sessionStates.clear();
    this.participantSessions.clear();
    this.leaderboards.clear();
    this.joinCodes.clear();
    this.rateLimits.clear();
    this.genericCache.clear();
    console.log('[RedisFallback] All caches cleared');
  }

  /**
   * Clear session-specific data
   */
  clearSessionData(sessionId: string): void {
    this.deleteSessionState(sessionId);
    this.deleteLeaderboard(sessionId);
    
    // Clear any join codes pointing to this session
    for (const [key, entry] of this.joinCodes.entries()) {
      if (entry.value === sessionId) {
        this.joinCodes.delete(key);
      }
    }
  }
}

// Export singleton instance
export const redisFallbackService = new RedisFallbackService();
