/**
 * Utils Index
 * 
 * Central export point for all utility functions
 */

// Circuit breaker
export { CircuitBreaker, CircuitBreakerState } from './circuit-breaker';

// Retry utility
export {
  retryWithBackoff,
  retryWithBackoffDetailed,
  calculateBackoffDelay,
  RetryExhaustedError,
  RetryPredicates,
} from './retry';
export type { RetryOptions, RetryResult } from './retry';

// Error response utilities
export {
  // Types
  ErrorResponse,
  RestErrorResponse,
  WebSocketErrorResponse,
  ErrorResponseOptions,
  // Functions
  createRestErrorResponse,
  createWebSocketErrorResponse,
  createSimpleErrorResponse,
  createValidationErrorResponse,
  createNotFoundErrorResponse,
  createAuthErrorResponse,
  createRateLimitErrorResponse,
  createAnswerRejectedResponse,
  createRecoveryFailedResponse,
  formatErrorForLogging,
  generateRequestId,
  getStatusCodeForError,
  // Re-exported from error-sanitization.service
  ErrorCode,
  ErrorCategory,
} from './error-response';
