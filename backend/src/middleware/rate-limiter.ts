import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * Rate limiting is fully disabled for all environments.
 * All rate limiters below use skip: () => true to bypass completely.
 * To re-enable, restore the original isRateLimitDisabled logic.
 */

/**
 * General API rate limiter - DISABLED
 */
export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: 'Too many requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: () => true, // Rate limiting fully disabled
});

/**
 * Stricter rate limiter for join endpoint - DISABLED
 */
export const joinRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.joinMax,
  message: {
    success: false,
    error: 'Too many join attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: () => true, // Rate limiting fully disabled
  skipSuccessfulRequests: true,
});

/**
 * Rate limiter for file uploads - DISABLED
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 60000,
  max: 10,
  message: {
    success: false,
    error: 'Too many upload attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: () => true, // Rate limiting fully disabled
});
