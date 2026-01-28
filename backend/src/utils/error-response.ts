/**
 * Error Response Utility
 * 
 * Provides a standardized error response format for both REST API and WebSocket errors.
 * Uses the errorSanitizationService to ensure user-friendly messages without exposing
 * technical details.
 * 
 * Features:
 * - Consistent ErrorResponse interface (code, message, timestamp, requestId, category)
 * - Helper functions for REST API error responses
 * - Helper functions for WebSocket error responses
 * - Integration with errorSanitizationService for message sanitization
 * 
 * Requirements: 17.7
 */

import { v4 as uuidv4 } from 'uuid';
import {
  errorSanitizationService,
  ErrorCode,
  ErrorCategory,
  SanitizedError,
} from '../services/error-sanitization.service';

/**
 * Standard error response interface for all API and WebSocket errors
 */
export interface ErrorResponse {
  /** Error code for programmatic handling */
  code: ErrorCode;
  /** User-friendly error message */
  message: string;
  /** ISO 8601 timestamp of when the error occurred */
  timestamp: string;
  /** Unique request/event ID for tracking and debugging */
  requestId: string;
  /** Optional error category for grouping */
  category?: ErrorCategory;
  /** Optional additional details (only in development) */
  details?: string;
}

/**
 * REST API error response with HTTP status code
 */
export interface RestErrorResponse extends ErrorResponse {
  /** HTTP status code */
  statusCode: number;
  /** Success flag (always false for errors) */
  success: false;
  /** Request path that caused the error */
  path?: string;
  /** HTTP method that caused the error */
  method?: string;
}

/**
 * WebSocket error response for Socket.IO events
 */
export interface WebSocketErrorResponse extends ErrorResponse {
  /** Event type that caused the error */
  event?: string;
  /** Session ID if available */
  sessionId?: string;
  /** Participant ID if available */
  participantId?: string;
}

/**
 * Options for creating error responses
 */
export interface ErrorResponseOptions {
  /** Request ID (will be generated if not provided) */
  requestId?: string;
  /** Include error category in response */
  includeCategory?: boolean;
  /** Include details in response (only in development) */
  includeDetails?: boolean;
  /** Request path (for REST API errors) */
  path?: string;
  /** HTTP method (for REST API errors) */
  method?: string;
  /** Event type (for WebSocket errors) */
  event?: string;
  /** Session ID (for WebSocket errors) */
  sessionId?: string;
  /** Participant ID (for WebSocket errors) */
  participantId?: string;
}

/**
 * Map error categories to HTTP status codes
 */
const CATEGORY_TO_STATUS_CODE: Record<ErrorCategory, number> = {
  [ErrorCategory.DATABASE]: 503,
  [ErrorCategory.VALIDATION]: 400,
  [ErrorCategory.AUTHENTICATION]: 401,
  [ErrorCategory.AUTHORIZATION]: 403,
  [ErrorCategory.RATE_LIMIT]: 429,
  [ErrorCategory.NETWORK]: 503,
  [ErrorCategory.NOT_FOUND]: 404,
  [ErrorCategory.CONFLICT]: 409,
  [ErrorCategory.INTERNAL]: 500,
  [ErrorCategory.TIMEOUT]: 504,
  [ErrorCategory.SERVICE_UNAVAILABLE]: 503,
  [ErrorCategory.UNKNOWN]: 500,
};

/**
 * Map error codes to HTTP status codes (more specific than category)
 */
const ERROR_CODE_TO_STATUS_CODE: Partial<Record<ErrorCode, number>> = {
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.MISSING_FIELD]: 400,
  [ErrorCode.INVALID_FORMAT]: 400,
  [ErrorCode.AUTH_FAILED]: 401,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.TOKEN_INVALID]: 401,
  [ErrorCode.SESSION_EXPIRED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.RESOURCE_CONFLICT]: 409,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.TOO_MANY_REQUESTS]: 429,
  [ErrorCode.DB_CONNECTION_FAILED]: 503,
  [ErrorCode.DB_QUERY_FAILED]: 500,
  [ErrorCode.DB_TIMEOUT]: 504,
  [ErrorCode.DB_DUPLICATE_KEY]: 409,
  [ErrorCode.CONNECTION_ERROR]: 503,
  [ErrorCode.NETWORK_TIMEOUT]: 504,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.UNKNOWN_ERROR]: 500,
};

/**
 * Generate a unique request ID
 * 
 * @returns UUID v4 string
 */
export function generateRequestId(): string {
  return uuidv4();
}

/**
 * Get HTTP status code for an error
 * 
 * @param code - Error code
 * @param category - Error category
 * @returns HTTP status code
 */
export function getStatusCodeForError(code: ErrorCode, category: ErrorCategory): number {
  // First check specific error code mapping
  const codeStatus = ERROR_CODE_TO_STATUS_CODE[code];
  if (codeStatus !== undefined) {
    return codeStatus;
  }
  
  // Fall back to category mapping
  return CATEGORY_TO_STATUS_CODE[category] || 500;
}

/**
 * Create a base error response from a sanitized error
 * 
 * @param sanitizedError - Sanitized error from errorSanitizationService
 * @param options - Additional options
 * @returns Base error response
 */
function createBaseErrorResponse(
  sanitizedError: SanitizedError,
  options: ErrorResponseOptions = {}
): ErrorResponse {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const response: ErrorResponse = {
    code: sanitizedError.code,
    message: sanitizedError.userMessage,
    timestamp: sanitizedError.timestamp,
    requestId: options.requestId || sanitizedError.requestId || generateRequestId(),
  };
  
  // Include category if requested
  if (options.includeCategory) {
    response.category = sanitizedError.category;
  }
  
  // Include details only in development mode
  if (isDevelopment && options.includeDetails && sanitizedError.message !== sanitizedError.userMessage) {
    response.details = sanitizedError.message;
  }
  
  return response;
}

/**
 * Create a REST API error response
 * 
 * @param error - The error to format (can be Error, string, or unknown)
 * @param options - Additional options
 * @returns REST API error response
 */
export function createRestErrorResponse(
  error: unknown,
  options: ErrorResponseOptions = {}
): RestErrorResponse {
  const requestId = options.requestId || generateRequestId();
  const sanitizedError = errorSanitizationService.sanitize(error, requestId);
  const baseResponse = createBaseErrorResponse(sanitizedError, {
    ...options,
    requestId,
  });
  
  const statusCode = getStatusCodeForError(sanitizedError.code, sanitizedError.category);
  
  const response: RestErrorResponse = {
    ...baseResponse,
    statusCode,
    success: false,
  };
  
  // Add request context if provided
  if (options.path) {
    response.path = options.path;
  }
  
  if (options.method) {
    response.method = options.method;
  }
  
  return response;
}

/**
 * Create a WebSocket error response
 * 
 * @param error - The error to format (can be Error, string, or unknown)
 * @param options - Additional options
 * @returns WebSocket error response
 */
export function createWebSocketErrorResponse(
  error: unknown,
  options: ErrorResponseOptions = {}
): WebSocketErrorResponse {
  const requestId = options.requestId || generateRequestId();
  const sanitizedError = errorSanitizationService.sanitize(error, requestId);
  const baseResponse = createBaseErrorResponse(sanitizedError, {
    ...options,
    requestId,
  });
  
  const response: WebSocketErrorResponse = {
    ...baseResponse,
  };
  
  // Add WebSocket context if provided
  if (options.event) {
    response.event = options.event;
  }
  
  if (options.sessionId) {
    response.sessionId = options.sessionId;
  }
  
  if (options.participantId) {
    response.participantId = options.participantId;
  }
  
  return response;
}

/**
 * Create a simple error response with just code and message
 * Useful for quick error responses without full sanitization
 * 
 * @param code - Error code
 * @param message - User-friendly message
 * @param requestId - Optional request ID
 * @returns Simple error response
 */
export function createSimpleErrorResponse(
  code: ErrorCode,
  message: string,
  requestId?: string
): ErrorResponse {
  return {
    code,
    message,
    timestamp: new Date().toISOString(),
    requestId: requestId || generateRequestId(),
  };
}

/**
 * Create a validation error response
 * 
 * @param message - Validation error message
 * @param options - Additional options
 * @returns REST API error response for validation errors
 */
export function createValidationErrorResponse(
  message: string,
  options: ErrorResponseOptions = {}
): RestErrorResponse {
  const requestId = options.requestId || generateRequestId();
  
  return {
    code: ErrorCode.INVALID_INPUT,
    message,
    timestamp: new Date().toISOString(),
    requestId,
    statusCode: 400,
    success: false,
    category: options.includeCategory ? ErrorCategory.VALIDATION : undefined,
    path: options.path,
    method: options.method,
  };
}

/**
 * Create a not found error response
 * 
 * @param resource - Name of the resource that was not found
 * @param options - Additional options
 * @returns REST API error response for not found errors
 */
export function createNotFoundErrorResponse(
  resource: string,
  options: ErrorResponseOptions = {}
): RestErrorResponse {
  const requestId = options.requestId || generateRequestId();
  
  return {
    code: ErrorCode.NOT_FOUND,
    message: `${resource} not found`,
    timestamp: new Date().toISOString(),
    requestId,
    statusCode: 404,
    success: false,
    category: options.includeCategory ? ErrorCategory.NOT_FOUND : undefined,
    path: options.path,
    method: options.method,
  };
}

/**
 * Create an authentication error response
 * 
 * @param message - Optional custom message
 * @param options - Additional options
 * @returns REST API error response for authentication errors
 */
export function createAuthErrorResponse(
  message?: string,
  options: ErrorResponseOptions = {}
): RestErrorResponse {
  const requestId = options.requestId || generateRequestId();
  
  return {
    code: ErrorCode.AUTH_FAILED,
    message: message || 'Authentication failed',
    timestamp: new Date().toISOString(),
    requestId,
    statusCode: 401,
    success: false,
    category: options.includeCategory ? ErrorCategory.AUTHENTICATION : undefined,
    path: options.path,
    method: options.method,
  };
}

/**
 * Create a rate limit error response
 * 
 * @param retryAfter - Seconds until the rate limit resets
 * @param options - Additional options
 * @returns REST API error response for rate limit errors
 */
export function createRateLimitErrorResponse(
  retryAfter?: number,
  options: ErrorResponseOptions = {}
): RestErrorResponse {
  const requestId = options.requestId || generateRequestId();
  const message = retryAfter
    ? `Too many requests. Please try again in ${retryAfter} seconds.`
    : 'Too many requests. Please try again later.';
  
  return {
    code: ErrorCode.RATE_LIMIT_EXCEEDED,
    message,
    timestamp: new Date().toISOString(),
    requestId,
    statusCode: 429,
    success: false,
    category: options.includeCategory ? ErrorCategory.RATE_LIMIT : undefined,
    path: options.path,
    method: options.method,
  };
}

/**
 * Create a WebSocket answer rejected response
 * 
 * @param questionId - Question ID
 * @param reason - Rejection reason code
 * @param message - User-friendly message
 * @param options - Additional options
 * @returns WebSocket error response for answer rejection
 */
export function createAnswerRejectedResponse(
  questionId: string,
  reason: string,
  message: string,
  options: ErrorResponseOptions = {}
): WebSocketErrorResponse & { questionId: string; reason: string } {
  const requestId = options.requestId || generateRequestId();
  
  return {
    code: ErrorCode.INVALID_INPUT,
    message,
    timestamp: new Date().toISOString(),
    requestId,
    questionId,
    reason,
    event: options.event || 'submit_answer',
    sessionId: options.sessionId,
    participantId: options.participantId,
  };
}

/**
 * Create a WebSocket session recovery failed response
 * 
 * @param reason - Recovery failure reason
 * @param message - User-friendly message
 * @param options - Additional options
 * @returns WebSocket error response for recovery failure
 */
export function createRecoveryFailedResponse(
  reason: string,
  message: string,
  options: ErrorResponseOptions = {}
): WebSocketErrorResponse & { reason: string } {
  const requestId = options.requestId || generateRequestId();
  
  // Map recovery reasons to error codes
  const codeMap: Record<string, ErrorCode> = {
    SESSION_EXPIRED: ErrorCode.SESSION_EXPIRED,
    PARTICIPANT_NOT_FOUND: ErrorCode.NOT_FOUND,
    SESSION_ENDED: ErrorCode.SESSION_EXPIRED,
    PARTICIPANT_BANNED: ErrorCode.FORBIDDEN,
    INVALID_REQUEST: ErrorCode.INVALID_INPUT,
    INTERNAL_ERROR: ErrorCode.INTERNAL_ERROR,
  };
  
  return {
    code: codeMap[reason] || ErrorCode.UNKNOWN_ERROR,
    message,
    timestamp: new Date().toISOString(),
    requestId,
    reason,
    event: options.event || 'reconnect_session',
    sessionId: options.sessionId,
    participantId: options.participantId,
  };
}

/**
 * Format an error for logging (includes more detail than user response)
 * 
 * @param error - The error to format
 * @param context - Additional context for logging
 * @returns Formatted error for logging
 */
export function formatErrorForLogging(
  error: unknown,
  context: {
    requestId?: string;
    path?: string;
    method?: string;
    sessionId?: string;
    participantId?: string;
    event?: string;
  } = {}
): {
  error: SanitizedError;
  context: typeof context;
  originalError: string;
} {
  const requestId = context.requestId || generateRequestId();
  const { sanitized, originalMessage } = errorSanitizationService.sanitizeForLogging(error, requestId);
  
  return {
    error: sanitized,
    context,
    originalError: originalMessage,
  };
}

// Re-export types from error-sanitization.service for convenience
export { ErrorCode, ErrorCategory } from '../services/error-sanitization.service';
