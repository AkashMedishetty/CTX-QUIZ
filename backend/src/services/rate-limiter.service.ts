/**
 * Rate Limiter Service
 * 
 * Provides rate limiting functionality using Redis to prevent abuse:
 * - Join attempts: 5 per IP per 60 seconds
 * - Answer submissions: 1 per participant per question
 * - WebSocket messages: 10 per socket per second
 * 
 * Uses Redis INCR with TTL for efficient counter-based rate limiting
 * 
 * Requirements: 3.7, 9.3, 9.4
 */

import { redisService } from './redis.service';
import { config } from '../config';

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number; // seconds until limit resets
}

// Rate limiting is fully disabled to support shared networks and tester panel
const isRateLimitDisabled = (): boolean => {
  return true;
};

class RateLimiterService {
  /**
   * Check if join attempt is within rate limit
   * Limit: 5 attempts per IP per 60 seconds
   * 
   * @param ipAddress - IP address of the client
   * @returns RateLimitResult indicating if attempt is allowed
   */
  async checkJoinLimit(ipAddress: string): Promise<RateLimitResult> {
    // Bypass rate limiting if disabled (for load testing)
    if (isRateLimitDisabled()) {
      return { allowed: true };
    }
    
    try {
      const redis = redisService.getClient();
      const key = `ratelimit:join:${ipAddress}`;
      
      // Increment counter
      const count = await redis.incr(key);
      
      // Set TTL on first attempt
      if (count === 1) {
        await redis.expire(key, 60); // 60 seconds
      }
      
      // Check if limit exceeded
      if (count > 5) {
        // Get TTL to inform client when they can retry
        const ttl = await redis.ttl(key);
        const retryAfter = ttl > 0 ? ttl : 60;
        
        await this.logRateLimitViolation('join', ipAddress, {
          currentCount: count,
          maxAllowed: 5,
          retryAfter,
        });
        
        return {
          allowed: false,
          retryAfter
        };
      }
      
      return { allowed: true };
    } catch (error) {
      console.error('[RateLimiter] Error checking join limit:', error);
      // On error, allow the request (fail open)
      return { allowed: true };
    }
  }
  
  /**
   * Check if answer submission is within rate limit
   * Limit: 1 submission per participant per question
   * 
   * @param participantId - ID of the participant
   * @param questionId - ID of the question
   * @returns RateLimitResult indicating if submission is allowed
   */
  async checkAnswerLimit(participantId: string, questionId: string): Promise<RateLimitResult> {
    // Bypass rate limiting if disabled (for load testing)
    if (isRateLimitDisabled()) {
      return { allowed: true };
    }
    
    try {
      const redis = redisService.getClient();
      const key = `ratelimit:answer:${participantId}:${questionId}`;
      
      // Check if already submitted
      const exists = await redis.exists(key);
      
      if (exists) {
        // Get TTL to inform client when they can retry (though they shouldn't for same question)
        const ttl = await redis.ttl(key);
        
        return {
          allowed: false,
          retryAfter: ttl > 0 ? ttl : 300
        };
      }
      
      // Mark as submitted with 5-minute TTL
      await redis.setex(key, 300, '1');
      
      return { allowed: true };
    } catch (error) {
      console.error('[RateLimiter] Error checking answer limit:', error);
      // On error, allow the request (fail open)
      return { allowed: true };
    }
  }
  
  /**
   * Check if WebSocket message is within rate limit
   * Limit: 10 messages per socket per second
   * 
   * @param socketId - ID of the WebSocket connection
   * @returns RateLimitResult indicating if message is allowed
   */
  async checkMessageLimit(socketId: string): Promise<RateLimitResult> {
    // Bypass rate limiting if disabled (for load testing)
    if (isRateLimitDisabled()) {
      return { allowed: true };
    }
    
    try {
      const redis = redisService.getClient();
      const key = `ratelimit:messages:${socketId}`;
      
      // Increment counter
      const count = await redis.incr(key);
      
      // Set TTL on first message
      if (count === 1) {
        await redis.expire(key, 1); // 1 second
      }
      
      // Check if limit exceeded
      if (count > 10) {
        // Get TTL to inform client when they can retry
        const ttl = await redis.ttl(key);
        const retryAfter = ttl > 0 ? ttl : 1;
        
        await this.logRateLimitViolation('messages', socketId, {
          currentCount: count,
          maxAllowed: 10,
          retryAfter,
        });
        
        return {
          allowed: false,
          retryAfter
        };
      }
      
      return { allowed: true };
    } catch (error) {
      console.error('[RateLimiter] Error checking message limit:', error);
      // On error, allow the request (fail open)
      return { allowed: true };
    }
  }
  
  /**
   * Log rate limit violation for monitoring and security
   * 
   * @param limitType - Type of rate limit that was violated
   * @param identifier - IP address, participant ID, or socket ID
   * @param context - Additional context for the violation
   */
  private async logRateLimitViolation(
    limitType: 'join' | 'answer' | 'messages',
    identifier: string,
    context?: {
      sessionId?: string;
      participantId?: string;
      currentCount?: number;
      maxAllowed?: number;
      retryAfter?: number;
    }
  ): Promise<void> {
    try {
      // Import security logging service dynamically to avoid circular dependencies
      const { securityLoggingService } = await import('./security-logging.service');
      
      // Determine the identifier type based on limit type
      const ipAddress = limitType === 'join' ? identifier : undefined;
      const socketId = limitType === 'messages' ? identifier : undefined;
      const participantId = limitType === 'answer' ? identifier : context?.participantId;
      
      // Log to security logging service
      await securityLoggingService.logRateLimitViolation({
        limitType,
        ipAddress,
        socketId,
        participantId,
        sessionId: context?.sessionId,
        currentCount: context?.currentCount,
        maxAllowed: context?.maxAllowed,
        retryAfter: context?.retryAfter,
      });
    } catch (error) {
      // Fallback to console logging if security logging fails
      const timestamp = new Date().toISOString();
      console.warn(
        `[RateLimiter] Rate limit exceeded - Type: ${limitType}, ` +
        `Identifier: ${identifier}, Time: ${timestamp}`
      );
      console.error('[RateLimiter] Error logging violation:', error);
      // Don't throw - logging failures shouldn't affect rate limiting
    }
  }
  
  /**
   * Reset rate limit for a specific key (useful for testing or admin actions)
   * 
   * @param limitType - Type of rate limit to reset
   * @param identifier - IP address, participant ID, or socket ID
   */
  async resetLimit(
    limitType: 'join' | 'answer' | 'messages',
    identifier: string,
    additionalKey?: string
  ): Promise<void> {
    try {
      const redis = redisService.getClient();
      let key: string;
      
      switch (limitType) {
        case 'join':
          key = `ratelimit:join:${identifier}`;
          break;
        case 'answer':
          if (!additionalKey) {
            throw new Error('Question ID required for answer limit reset');
          }
          key = `ratelimit:answer:${identifier}:${additionalKey}`;
          break;
        case 'messages':
          key = `ratelimit:messages:${identifier}`;
          break;
        default:
          throw new Error(`Unknown limit type: ${limitType}`);
      }
      
      await redis.del(key);
      console.log(`[RateLimiter] Reset limit - Type: ${limitType}, Key: ${key}`);
    } catch (error) {
      console.error('[RateLimiter] Error resetting limit:', error);
      throw error;
    }
  }
  
  /**
   * Get current count for a rate limit (useful for monitoring)
   * 
   * @param limitType - Type of rate limit to check
   * @param identifier - IP address, participant ID, or socket ID
   * @param additionalKey - Additional key component (e.g., question ID for answers)
   * @returns Current count and TTL
   */
  async getLimitStatus(
    limitType: 'join' | 'answer' | 'messages',
    identifier: string,
    additionalKey?: string
  ): Promise<{ count: number; ttl: number }> {
    try {
      const redis = redisService.getClient();
      let key: string;
      
      switch (limitType) {
        case 'join':
          key = `ratelimit:join:${identifier}`;
          break;
        case 'answer':
          if (!additionalKey) {
            throw new Error('Question ID required for answer limit status');
          }
          key = `ratelimit:answer:${identifier}:${additionalKey}`;
          break;
        case 'messages':
          key = `ratelimit:messages:${identifier}`;
          break;
        default:
          throw new Error(`Unknown limit type: ${limitType}`);
      }
      
      const [countStr, ttl] = await Promise.all([
        redis.get(key),
        redis.ttl(key)
      ]);
      
      const count = countStr ? parseInt(countStr, 10) : 0;
      
      return { count, ttl };
    } catch (error) {
      console.error('[RateLimiter] Error getting limit status:', error);
      return { count: 0, ttl: -1 };
    }
  }
}

// Export singleton instance
export const rateLimiterService = new RateLimiterService();
