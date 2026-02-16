/**
 * Redis Data Structures Service
 * 
 * Provides methods for managing Redis data structures for session state:
 * - Session state (hash)
 * - Participant session (hash)
 * - Leaderboard (sorted set)
 * - Answer buffer (list)
 * - Rate limiting (string)
 * - Join code mapping (string)
 * 
 * Requirements: 5.5, 11.6
 */

import { redisService } from './redis.service';

// TTL constants (in seconds)
const TTL = {
  SESSION_STATE: 6 * 60 * 60, // 6 hours
  PARTICIPANT_SESSION: 5 * 60, // 5 minutes
  LEADERBOARD: 6 * 60 * 60, // 6 hours
  ANSWER_BUFFER: 60 * 60, // 1 hour
  JOIN_CODE: 6 * 60 * 60, // 6 hours
  RATE_LIMIT_JOIN: 60, // 1 minute
  RATE_LIMIT_ANSWER: 5 * 60, // 5 minutes
} as const;

// Session state interface
export interface SessionState {
  state: 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED';
  currentQuestionIndex: number;
  currentQuestionId?: string;
  currentQuestionStartTime?: number;
  timerEndTime?: number;
  participantCount: number;
  voidedQuestions?: string[];
}

// Participant session interface
export interface ParticipantSession {
  sessionId: string;
  nickname: string;
  totalScore: number;
  lastQuestionScore?: string;
  totalTimeMs: number;
  streakCount: number;
  isActive: boolean;
  isEliminated: boolean;
  socketId?: string;
}

// Answer interface for buffer
export interface Answer {
  answerId: string;
  sessionId: string;
  participantId: string;
  questionId: string;
  selectedOptions: string[];
  answerText?: string;
  answerNumber?: number;
  submittedAt: number;
  responseTimeMs: number;
}

class RedisDataStructuresService {
  /**
   * Session State Operations (Hash)
   * Key: session:{sessionId}:state
   */

  /**
   * Set session state in Redis
   */
  async setSessionState(sessionId: string, state: SessionState): Promise<void> {
    const client = redisService.getClient();
    const key = `session:${sessionId}:state`;

    // Convert state to hash fields
    const fields: Record<string, string> = {
      state: state.state,
      currentQuestionIndex: state.currentQuestionIndex.toString(),
      participantCount: state.participantCount.toString(),
    };

    if (state.currentQuestionId) {
      fields.currentQuestionId = state.currentQuestionId;
    }

    if (state.currentQuestionStartTime) {
      fields.currentQuestionStartTime = state.currentQuestionStartTime.toString();
    }

    if (state.timerEndTime) {
      fields.timerEndTime = state.timerEndTime.toString();
    }

    if (state.voidedQuestions && state.voidedQuestions.length > 0) {
      fields.voidedQuestions = JSON.stringify(state.voidedQuestions);
    }

    // Set all fields
    await client.hset(key, fields);

    // Set TTL
    await client.expire(key, TTL.SESSION_STATE);
  }

  /**
   * Get session state from Redis
   */
  async getSessionState(sessionId: string): Promise<SessionState | null> {
    const client = redisService.getClient();
    const key = `session:${sessionId}:state`;

    const data = await client.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const state: SessionState = {
      state: data.state as 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED',
      currentQuestionIndex: parseInt(data.currentQuestionIndex, 10),
      participantCount: parseInt(data.participantCount, 10),
    };

    if (data.currentQuestionId) {
      state.currentQuestionId = data.currentQuestionId;
    }

    if (data.currentQuestionStartTime) {
      state.currentQuestionStartTime = parseInt(data.currentQuestionStartTime, 10);
    }

    if (data.timerEndTime) {
      state.timerEndTime = parseInt(data.timerEndTime, 10);
    }

    if (data.voidedQuestions) {
      state.voidedQuestions = JSON.parse(data.voidedQuestions);
    }

    return state;
  }

  /**
   * Update specific fields in session state
   */
  async updateSessionState(
    sessionId: string,
    updates: Partial<SessionState>
  ): Promise<void> {
    const client = redisService.getClient();
    const key = `session:${sessionId}:state`;

    const fields: Record<string, string> = {};

    if (updates.state) {
      fields.state = updates.state;
    }

    if (updates.currentQuestionIndex !== undefined) {
      fields.currentQuestionIndex = updates.currentQuestionIndex.toString();
    }

    if (updates.currentQuestionId !== undefined) {
      fields.currentQuestionId = updates.currentQuestionId;
    }

    if (updates.currentQuestionStartTime !== undefined) {
      fields.currentQuestionStartTime = updates.currentQuestionStartTime.toString();
    }

    if (updates.timerEndTime !== undefined) {
      fields.timerEndTime = updates.timerEndTime.toString();
    }

    if (updates.participantCount !== undefined) {
      fields.participantCount = updates.participantCount.toString();
    }

    if (updates.voidedQuestions !== undefined) {
      fields.voidedQuestions = JSON.stringify(updates.voidedQuestions);
    }

    if (Object.keys(fields).length > 0) {
      await client.hset(key, fields);
      // Refresh TTL
      await client.expire(key, TTL.SESSION_STATE);
    }
  }

  /**
   * Delete session state
   */
  async deleteSessionState(sessionId: string): Promise<void> {
    const client = redisService.getClient();
    const key = `session:${sessionId}:state`;
    await client.del(key);
  }

  /**
   * Participant Session Operations (Hash)
   * Key: participant:{participantId}:session
   */

  /**
   * Set participant session in Redis
   */
  async setParticipantSession(
    participantId: string,
    session: ParticipantSession
  ): Promise<void> {
    const client = redisService.getClient();
    const key = `participant:${participantId}:session`;

    const fields: Record<string, string> = {
      sessionId: session.sessionId,
      nickname: session.nickname,
      totalScore: session.totalScore.toString(),
      totalTimeMs: session.totalTimeMs.toString(),
      streakCount: session.streakCount.toString(),
      isActive: session.isActive.toString(),
      isEliminated: session.isEliminated.toString(),
    };

    if (session.socketId) {
      fields.socketId = session.socketId;
    }

    await client.hset(key, fields);
    await client.expire(key, TTL.PARTICIPANT_SESSION);
  }

  /**
   * Get participant session from Redis
   */
  async getParticipantSession(participantId: string): Promise<ParticipantSession | null> {
    const client = redisService.getClient();
    const key = `participant:${participantId}:session`;

    const data = await client.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const session: ParticipantSession = {
      sessionId: data.sessionId,
      nickname: data.nickname,
      totalScore: parseInt(data.totalScore, 10),
      totalTimeMs: parseInt(data.totalTimeMs, 10),
      streakCount: parseInt(data.streakCount, 10),
      isActive: data.isActive === 'true',
      isEliminated: data.isEliminated === 'true',
    };

    if (data.socketId) {
      session.socketId = data.socketId;
    }

    return session;
  }

  /**
   * Update participant session fields
   */
  async updateParticipantSession(
    participantId: string,
    updates: Partial<ParticipantSession>
  ): Promise<void> {
    const client = redisService.getClient();
    const key = `participant:${participantId}:session`;

    const fields: Record<string, string> = {};

    if (updates.sessionId) {
      fields.sessionId = updates.sessionId;
    }

    if (updates.nickname) {
      fields.nickname = updates.nickname;
    }

    if (updates.totalScore !== undefined) {
      fields.totalScore = updates.totalScore.toString();
    }

    if (updates.totalTimeMs !== undefined) {
      fields.totalTimeMs = updates.totalTimeMs.toString();
    }

    if (updates.streakCount !== undefined) {
      fields.streakCount = updates.streakCount.toString();
    }

    if (updates.isActive !== undefined) {
      fields.isActive = updates.isActive.toString();
    }

    if (updates.isEliminated !== undefined) {
      fields.isEliminated = updates.isEliminated.toString();
    }

    if (updates.socketId !== undefined) {
      fields.socketId = updates.socketId;
    }

    if (Object.keys(fields).length > 0) {
      await client.hset(key, fields);
      // Refresh TTL
      await client.expire(key, TTL.PARTICIPANT_SESSION);
    }
  }

  /**
   * Refresh participant session TTL (on activity)
   */
  async refreshParticipantSession(participantId: string): Promise<void> {
    const client = redisService.getClient();
    const key = `participant:${participantId}:session`;
    await client.expire(key, TTL.PARTICIPANT_SESSION);
  }

  /**
   * Update participant streak count
   */
  async updateParticipantStreak(participantId: string, streakCount: number): Promise<void> {
    const client = redisService.getClient();
    const key = `participant:${participantId}:session`;

    await client.hset(key, 'streakCount', streakCount.toString());
    // Refresh TTL
    await client.expire(key, TTL.PARTICIPANT_SESSION);
  }

  /**
   * Reset participant streak count to zero
   */
  async resetParticipantStreak(participantId: string): Promise<void> {
    await this.updateParticipantStreak(participantId, 0);
  }

  /**
   * Delete participant session
   */
  async deleteParticipantSession(participantId: string): Promise<void> {
    const client = redisService.getClient();
    const key = `participant:${participantId}:session`;
    await client.del(key);
  }

  /**
   * Check if participant session exists (not expired)
   * 
   * Returns true if the session exists in Redis (TTL not expired)
   * Returns false if the session has expired or doesn't exist
   * 
   * Requirement: 8.5 - Session expiration after 5 minutes
   * 
   * @param participantId - Participant ID to check
   * @returns True if session exists, false if expired or not found
   */
  async isParticipantSessionActive(participantId: string): Promise<boolean> {
    const client = redisService.getClient();
    const key = `participant:${participantId}:session`;
    const exists = await client.exists(key);
    return exists === 1;
  }

  /**
   * Get remaining TTL for participant session
   * 
   * Returns the remaining time in seconds before the session expires
   * Returns -2 if the key doesn't exist
   * Returns -1 if the key exists but has no TTL
   * 
   * Requirement: 8.5 - Session expiration tracking
   * 
   * @param participantId - Participant ID to check
   * @returns Remaining TTL in seconds, or negative value if not found/no TTL
   */
  async getParticipantSessionTTL(participantId: string): Promise<number> {
    const client = redisService.getClient();
    const key = `participant:${participantId}:session`;
    return await client.ttl(key);
  }

  /**
   * Leaderboard Operations (Sorted Set)
   * Key: session:{sessionId}:leaderboard
   * Score: totalScore with tie-breaker (totalScore + (1 - totalTimeMs / maxTime) * 0.0001)
   */

  /**
   * Add or update participant in leaderboard
   * Score includes tie-breaker: lower time ranks higher for same score
   */
  async updateLeaderboard(
    sessionId: string,
    participantId: string,
    totalScore: number,
    totalTimeMs: number
  ): Promise<void> {
    const client = redisService.getClient();
    const key = `session:${sessionId}:leaderboard`;

    // Calculate score with tie-breaker
    // Use negative time so lower time = higher score
    // Divide by large number to keep it as decimal adjustment
    const score = totalScore - totalTimeMs / 1000000000;

    await client.zadd(key, score, participantId);
    await client.expire(key, TTL.LEADERBOARD);
  }

  /**
   * Get top N participants from leaderboard
   */
  async getTopLeaderboard(sessionId: string, limit: number = 10): Promise<
    Array<{
      participantId: string;
      score: number;
      rank: number;
    }>
  > {
    const client = redisService.getClient();
    const key = `session:${sessionId}:leaderboard`;

    // Get top N with scores (descending order)
    const results = await client.zrevrange(key, 0, limit - 1, 'WITHSCORES');

    const leaderboard: Array<{
      participantId: string;
      score: number;
      rank: number;
    }> = [];

    for (let i = 0; i < results.length; i += 2) {
      leaderboard.push({
        participantId: results[i],
        score: parseFloat(results[i + 1]),
        rank: i / 2 + 1,
      });
    }

    return leaderboard;
  }

  /**
   * Get full leaderboard
   */
  async getFullLeaderboard(sessionId: string): Promise<
    Array<{
      participantId: string;
      score: number;
      rank: number;
    }>
  > {
    const client = redisService.getClient();
    const key = `session:${sessionId}:leaderboard`;

    // Get all with scores (descending order)
    const results = await client.zrevrange(key, 0, -1, 'WITHSCORES');

    const leaderboard: Array<{
      participantId: string;
      score: number;
      rank: number;
    }> = [];

    for (let i = 0; i < results.length; i += 2) {
      leaderboard.push({
        participantId: results[i],
        score: parseFloat(results[i + 1]),
        rank: i / 2 + 1,
      });
    }

    return leaderboard;
  }

  /**
   * Get participant rank in leaderboard
   */
  async getParticipantRank(sessionId: string, participantId: string): Promise<number | null> {
    const client = redisService.getClient();
    const key = `session:${sessionId}:leaderboard`;

    const rank = await client.zrevrank(key, participantId);

    if (rank === null) {
      return null;
    }

    return rank + 1; // Convert 0-based to 1-based
  }

  /**
   * Remove participant from leaderboard
   */
  async removeFromLeaderboard(sessionId: string, participantId: string): Promise<void> {
    const client = redisService.getClient();
    const key = `session:${sessionId}:leaderboard`;
    await client.zrem(key, participantId);
  }

  /**
   * Delete leaderboard
   */
  async deleteLeaderboard(sessionId: string): Promise<void> {
    const client = redisService.getClient();
    const key = `session:${sessionId}:leaderboard`;
    await client.del(key);
  }

  /**
   * Answer Buffer Operations (List)
   * Key: session:{sessionId}:answers:buffer
   */

  /**
   * Add answer to buffer (write-behind cache).
   * Also stores in a hash for O(1) lookup by answerId.
   */
  async addAnswerToBuffer(sessionId: string, answer: Answer): Promise<void> {
    const client = redisService.getClient();
    const listKey = `session:${sessionId}:answers:buffer`;
    const hashKey = `session:${sessionId}:answers:hash`;
    const answerJson = JSON.stringify(answer);

    // Write to both list (for batch flush) and hash (for O(1) scoring lookup)
    await Promise.all([
      client.lpush(listKey, answerJson),
      client.hset(hashKey, answer.answerId, answerJson),
    ]);
    
    // Set TTLs (cheap, idempotent)
    client.expire(listKey, TTL.ANSWER_BUFFER).catch(() => {});
    client.expire(hashKey, TTL.ANSWER_BUFFER).catch(() => {});
  }

  /**
   * Get all answers from buffer and clear it (for batch processing)
   */
  async flushAnswerBuffer(sessionId: string): Promise<Answer[]> {
    const client = redisService.getClient();
    const key = `session:${sessionId}:answers:buffer`;

    // Get all answers
    const answersJson = await client.lrange(key, 0, -1);

    // Clear the buffer
    await client.del(key);

    // Parse answers
    return answersJson.map((json) => JSON.parse(json) as Answer);
  }

  /**
   * Get buffer length without removing items
   */
  async getAnswerBufferLength(sessionId: string): Promise<number> {
    const client = redisService.getClient();
    const key = `session:${sessionId}:answers:buffer`;
    return await client.llen(key);
  }

  /**
   * Rate Limiting Operations (String)
   */

  /**
   * Check and increment join rate limit
   * Returns true if allowed, false if rate limit exceeded
   */
  async checkJoinRateLimit(ipAddress: string): Promise<boolean> {
    const client = redisService.getClient();
    const key = `ratelimit:join:${ipAddress}`;

    const count = await client.incr(key);

    if (count === 1) {
      // First attempt, set TTL
      await client.expire(key, TTL.RATE_LIMIT_JOIN);
    }

    // Allow up to 5 attempts per minute
    return count <= 5;
  }

  /**
   * Check and set answer rate limit
   * Returns true if allowed (first submission), false if already submitted
   */
  async checkAnswerRateLimit(participantId: string, questionId: string): Promise<boolean> {
    const client = redisService.getClient();
    const key = `ratelimit:answer:${participantId}:${questionId}`;

    // Try to set the key with NX (only if not exists)
    const result = await client.set(key, '1', 'EX', TTL.RATE_LIMIT_ANSWER, 'NX');

    // Returns 'OK' if set successfully, null if key already exists
    return result === 'OK';
  }

  /**
   * Check if answer was already submitted (without incrementing)
   */
  async hasAnsweredQuestion(participantId: string, questionId: string): Promise<boolean> {
    const client = redisService.getClient();
    const key = `ratelimit:answer:${participantId}:${questionId}`;

    const exists = await client.exists(key);
    return exists === 1;
  }

  /**
   * Join Code Mapping Operations (String)
   * Key: joincode:{joinCode}
   */

  /**
   * Set join code mapping to session ID
   */
  async setJoinCodeMapping(joinCode: string, sessionId: string): Promise<void> {
    const client = redisService.getClient();
    const key = `joincode:${joinCode}`;

    await client.set(key, sessionId, 'EX', TTL.JOIN_CODE);
  }

  /**
   * Get session ID from join code
   */
  async getSessionIdFromJoinCode(joinCode: string): Promise<string | null> {
    const client = redisService.getClient();
    const key = `joincode:${joinCode}`;

    return await client.get(key);
  }

  /**
   * Delete join code mapping
   */
  async deleteJoinCodeMapping(joinCode: string): Promise<void> {
    const client = redisService.getClient();
    const key = `joincode:${joinCode}`;
    await client.del(key);
  }

  /**
   * Check if join code exists
   */
  async joinCodeExists(joinCode: string): Promise<boolean> {
    const client = redisService.getClient();
    const key = `joincode:${joinCode}`;

    const exists = await client.exists(key);
    return exists === 1;
  }

  /**
   * Utility: Clear all data for a session (cleanup)
   */
  async clearSessionData(sessionId: string): Promise<void> {
    await this.deleteSessionState(sessionId);
    await this.deleteLeaderboard(sessionId);
    // Note: Answer buffer and participant sessions have their own TTLs
  }
}

// Export singleton instance
export const redisDataStructuresService = new RedisDataStructuresService();
