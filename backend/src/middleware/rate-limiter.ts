import rateLimit from 'express-rate-limit';
import { config } from '../config';

// Check if rate limiting is disabled (for load testing)
const isRateLimitDisabled = (): boolean => {
  return process.env.DISABLE_RATE_LIMIT === 'true' || config.env === 'test';
};

/**
 * General API rate limiter
 * Limits requests per IP address to prevent abuse
 * Disabled in test environment or when DISABLE_RATE_LIMIT=true
 */
export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // Time window in milliseconds
  max: config.rateLimit.maxRequests, // Max requests per window
  message: {
    success: false,
    error: 'Too many requests, please try again later',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Use IP address as key
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  // Skip rate limiting in test environment or when disabled
  skip: () => isRateLimitDisabled(),
});

/**
 * Stricter rate limiter for join endpoint
 * Prevents brute force attacks on join codes
 * Disabled when DISABLE_RATE_LIMIT=true for load testing
 */
export const joinRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // 1 minute
  max: config.rateLimit.joinMax, // 5 attempts per minute
  message: {
    success: false,
    error: 'Too many join attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  // Skip rate limiting when disabled, otherwise skip successful requests
  skip: () => isRateLimitDisabled(),
  skipSuccessfulRequests: true,
});

/**
 * Rate limiter for file uploads
 * Prevents abuse of upload endpoint
 * Disabled when DISABLE_RATE_LIMIT=true for load testing
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 10, // 10 uploads per minute
  message: {
    success: false,
    error: 'Too many upload attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  // Skip rate limiting when disabled
  skip: () => isRateLimitDisabled(),
});
