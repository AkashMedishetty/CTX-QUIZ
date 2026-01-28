/**
 * Error Response Utility Tests
 * 
 * Tests for the error response utility functions that provide
 * standardized error responses for REST API and WebSocket errors.
 * 
 * Requirements: 17.7
 */

import {
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
  ErrorCode,
  ErrorCategory,
} from '../error-response';

describe('Error Response Utility', () => {
  describe('generateRequestId', () => {
    it('should generate a valid UUID', () => {
      const requestId = generateRequestId();
      
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(requestId).toMatch(uuidRegex);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRequestId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('getStatusCodeForError', () => {
    it('should return correct status code for validation errors', () => {
      expect(getStatusCodeForError(ErrorCode.INVALID_INPUT, ErrorCategory.VALIDATION)).toBe(400);
      expect(getStatusCodeForError(ErrorCode.MISSING_FIELD, ErrorCategory.VALIDATION)).toBe(400);
      expect(getStatusCodeForError(ErrorCode.INVALID_FORMAT, ErrorCategory.VALIDATION)).toBe(400);
    });

    it('should return correct status code for authentication errors', () => {
      expect(getStatusCodeForError(ErrorCode.AUTH_FAILED, ErrorCategory.AUTHENTICATION)).toBe(401);
      expect(getStatusCodeForError(ErrorCode.TOKEN_EXPIRED, ErrorCategory.AUTHENTICATION)).toBe(401);
      expect(getStatusCodeForError(ErrorCode.TOKEN_INVALID, ErrorCategory.AUTHENTICATION)).toBe(401);
    });

    it('should return correct status code for authorization errors', () => {
      expect(getStatusCodeForError(ErrorCode.FORBIDDEN, ErrorCategory.AUTHORIZATION)).toBe(403);
      expect(getStatusCodeForError(ErrorCode.INSUFFICIENT_PERMISSIONS, ErrorCategory.AUTHORIZATION)).toBe(403);
    });

    it('should return correct status code for not found errors', () => {
      expect(getStatusCodeForError(ErrorCode.NOT_FOUND, ErrorCategory.NOT_FOUND)).toBe(404);
    });

    it('should return correct status code for conflict errors', () => {
      expect(getStatusCodeForError(ErrorCode.RESOURCE_CONFLICT, ErrorCategory.CONFLICT)).toBe(409);
      expect(getStatusCodeForError(ErrorCode.DB_DUPLICATE_KEY, ErrorCategory.DATABASE)).toBe(409);
    });

    it('should return correct status code for rate limit errors', () => {
      expect(getStatusCodeForError(ErrorCode.RATE_LIMIT_EXCEEDED, ErrorCategory.RATE_LIMIT)).toBe(429);
      expect(getStatusCodeForError(ErrorCode.TOO_MANY_REQUESTS, ErrorCategory.RATE_LIMIT)).toBe(429);
    });

    it('should return correct status code for database errors', () => {
      expect(getStatusCodeForError(ErrorCode.DB_CONNECTION_FAILED, ErrorCategory.DATABASE)).toBe(503);
      expect(getStatusCodeForError(ErrorCode.DB_QUERY_FAILED, ErrorCategory.DATABASE)).toBe(500);
      expect(getStatusCodeForError(ErrorCode.DB_TIMEOUT, ErrorCategory.DATABASE)).toBe(504);
    });

    it('should return correct status code for internal errors', () => {
      expect(getStatusCodeForError(ErrorCode.INTERNAL_ERROR, ErrorCategory.INTERNAL)).toBe(500);
      expect(getStatusCodeForError(ErrorCode.UNKNOWN_ERROR, ErrorCategory.UNKNOWN)).toBe(500);
    });

    it('should fall back to category status code for unmapped error codes', () => {
      // Use a category that has a different status code than the default
      expect(getStatusCodeForError(ErrorCode.SERVICE_UNAVAILABLE, ErrorCategory.SERVICE_UNAVAILABLE)).toBe(503);
    });
  });

  describe('createRestErrorResponse', () => {
    it('should create a valid REST error response from an Error', () => {
      const error = new Error('Something went wrong');
      const response = createRestErrorResponse(error);

      expect(response).toMatchObject({
        success: false,
        message: expect.any(String),
        timestamp: expect.any(String),
        requestId: expect.any(String),
        statusCode: expect.any(Number),
        code: expect.any(String),
      });
    });

    it('should create a valid REST error response from a string', () => {
      const response = createRestErrorResponse('Something went wrong');

      expect(response.success).toBe(false);
      expect(response.message).toBeTruthy();
      expect(response.timestamp).toBeTruthy();
      expect(response.requestId).toBeTruthy();
    });

    it('should use provided request ID', () => {
      const requestId = 'custom-request-id-123';
      const response = createRestErrorResponse(new Error('Test'), { requestId });

      expect(response.requestId).toBe(requestId);
    });

    it('should include path and method when provided', () => {
      const response = createRestErrorResponse(new Error('Test'), {
        path: '/api/test',
        method: 'POST',
      });

      expect(response.path).toBe('/api/test');
      expect(response.method).toBe('POST');
    });

    it('should include category when includeCategory is true', () => {
      const response = createRestErrorResponse(new Error('Validation failed'), {
        includeCategory: true,
      });

      expect(response.category).toBeDefined();
    });

    it('should not include category when includeCategory is false', () => {
      const response = createRestErrorResponse(new Error('Test'), {
        includeCategory: false,
      });

      expect(response.category).toBeUndefined();
    });

    it('should sanitize database connection errors', () => {
      const error = new Error('MongoDB connection failed: mongodb://user:password@localhost:27017/db');
      const response = createRestErrorResponse(error);

      expect(response.message).not.toContain('password');
      expect(response.message).not.toContain('mongodb://');
    });

    it('should sanitize stack traces', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at Object.<anonymous> (/app/src/index.ts:10:5)';
      const response = createRestErrorResponse(error);

      expect(response.message).not.toContain('/app/src/index.ts');
      expect(response.message).not.toContain('at Object');
    });
  });

  describe('createWebSocketErrorResponse', () => {
    it('should create a valid WebSocket error response', () => {
      const error = new Error('WebSocket error');
      const response = createWebSocketErrorResponse(error);

      expect(response).toMatchObject({
        message: expect.any(String),
        timestamp: expect.any(String),
        requestId: expect.any(String),
        code: expect.any(String),
      });
    });

    it('should include event when provided', () => {
      const response = createWebSocketErrorResponse(new Error('Test'), {
        event: 'submit_answer',
      });

      expect(response.event).toBe('submit_answer');
    });

    it('should include session context when provided', () => {
      const response = createWebSocketErrorResponse(new Error('Test'), {
        sessionId: 'session-123',
        participantId: 'participant-456',
      });

      expect(response.sessionId).toBe('session-123');
      expect(response.participantId).toBe('participant-456');
    });

    it('should use provided request ID', () => {
      const requestId = 'ws-request-id-789';
      const response = createWebSocketErrorResponse(new Error('Test'), { requestId });

      expect(response.requestId).toBe(requestId);
    });
  });

  describe('createSimpleErrorResponse', () => {
    it('should create a simple error response with code and message', () => {
      const response = createSimpleErrorResponse(
        ErrorCode.INVALID_INPUT,
        'Invalid input provided'
      );

      expect(response.code).toBe(ErrorCode.INVALID_INPUT);
      expect(response.message).toBe('Invalid input provided');
      expect(response.timestamp).toBeTruthy();
      expect(response.requestId).toBeTruthy();
    });

    it('should use provided request ID', () => {
      const requestId = 'simple-request-id';
      const response = createSimpleErrorResponse(
        ErrorCode.NOT_FOUND,
        'Not found',
        requestId
      );

      expect(response.requestId).toBe(requestId);
    });
  });

  describe('createValidationErrorResponse', () => {
    it('should create a validation error response', () => {
      const response = createValidationErrorResponse('Email is required');

      expect(response.code).toBe(ErrorCode.INVALID_INPUT);
      expect(response.message).toBe('Email is required');
      expect(response.statusCode).toBe(400);
      expect(response.success).toBe(false);
    });

    it('should include path and method when provided', () => {
      const response = createValidationErrorResponse('Invalid data', {
        path: '/api/users',
        method: 'POST',
      });

      expect(response.path).toBe('/api/users');
      expect(response.method).toBe('POST');
    });

    it('should include category when requested', () => {
      const response = createValidationErrorResponse('Invalid data', {
        includeCategory: true,
      });

      expect(response.category).toBe(ErrorCategory.VALIDATION);
    });
  });

  describe('createNotFoundErrorResponse', () => {
    it('should create a not found error response', () => {
      const response = createNotFoundErrorResponse('User');

      expect(response.code).toBe(ErrorCode.NOT_FOUND);
      expect(response.message).toBe('User not found');
      expect(response.statusCode).toBe(404);
      expect(response.success).toBe(false);
    });

    it('should work with different resource names', () => {
      const quizResponse = createNotFoundErrorResponse('Quiz');
      expect(quizResponse.message).toBe('Quiz not found');

      const sessionResponse = createNotFoundErrorResponse('Session');
      expect(sessionResponse.message).toBe('Session not found');
    });
  });

  describe('createAuthErrorResponse', () => {
    it('should create an authentication error response with default message', () => {
      const response = createAuthErrorResponse();

      expect(response.code).toBe(ErrorCode.AUTH_FAILED);
      expect(response.message).toBe('Authentication failed');
      expect(response.statusCode).toBe(401);
      expect(response.success).toBe(false);
    });

    it('should create an authentication error response with custom message', () => {
      const response = createAuthErrorResponse('Token expired');

      expect(response.message).toBe('Token expired');
    });
  });

  describe('createRateLimitErrorResponse', () => {
    it('should create a rate limit error response without retry time', () => {
      const response = createRateLimitErrorResponse();

      expect(response.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(response.message).toBe('Too many requests. Please try again later.');
      expect(response.statusCode).toBe(429);
      expect(response.success).toBe(false);
    });

    it('should create a rate limit error response with retry time', () => {
      const response = createRateLimitErrorResponse(60);

      expect(response.message).toBe('Too many requests. Please try again in 60 seconds.');
    });
  });

  describe('createAnswerRejectedResponse', () => {
    it('should create an answer rejected response', () => {
      const response = createAnswerRejectedResponse(
        'question-123',
        'TIME_EXPIRED',
        'The time limit has expired'
      );

      expect(response.questionId).toBe('question-123');
      expect(response.reason).toBe('TIME_EXPIRED');
      expect(response.message).toBe('The time limit has expired');
      expect(response.event).toBe('submit_answer');
    });

    it('should include session context when provided', () => {
      const response = createAnswerRejectedResponse(
        'question-123',
        'ALREADY_SUBMITTED',
        'Already submitted',
        {
          sessionId: 'session-456',
          participantId: 'participant-789',
        }
      );

      expect(response.sessionId).toBe('session-456');
      expect(response.participantId).toBe('participant-789');
    });
  });

  describe('createRecoveryFailedResponse', () => {
    it('should create a recovery failed response for expired session', () => {
      const response = createRecoveryFailedResponse(
        'SESSION_EXPIRED',
        'Your session has expired'
      );

      expect(response.reason).toBe('SESSION_EXPIRED');
      expect(response.message).toBe('Your session has expired');
      expect(response.code).toBe(ErrorCode.SESSION_EXPIRED);
      expect(response.event).toBe('reconnect_session');
    });

    it('should create a recovery failed response for banned participant', () => {
      const response = createRecoveryFailedResponse(
        'PARTICIPANT_BANNED',
        'You have been banned from this session'
      );

      expect(response.reason).toBe('PARTICIPANT_BANNED');
      expect(response.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('should create a recovery failed response for not found participant', () => {
      const response = createRecoveryFailedResponse(
        'PARTICIPANT_NOT_FOUND',
        'Participant not found'
      );

      expect(response.reason).toBe('PARTICIPANT_NOT_FOUND');
      expect(response.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should handle unknown reasons', () => {
      const response = createRecoveryFailedResponse(
        'UNKNOWN_REASON',
        'An unknown error occurred'
      );

      expect(response.reason).toBe('UNKNOWN_REASON');
      expect(response.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });

  describe('formatErrorForLogging', () => {
    it('should format an error for logging with context', () => {
      const error = new Error('Test error');
      const result = formatErrorForLogging(error, {
        requestId: 'log-request-123',
        path: '/api/test',
        method: 'GET',
      });

      expect(result.error).toBeDefined();
      expect(result.context.requestId).toBe('log-request-123');
      expect(result.context.path).toBe('/api/test');
      expect(result.context.method).toBe('GET');
      expect(result.originalError).toBeDefined();
    });

    it('should sanitize sensitive information in original error', () => {
      const error = new Error('Connection failed: mongodb://user:secret@localhost:27017');
      const result = formatErrorForLogging(error);

      expect(result.originalError).not.toContain('secret');
      expect(result.originalError).not.toContain('mongodb://');
    });

    it('should include WebSocket context when provided', () => {
      const error = new Error('WebSocket error');
      const result = formatErrorForLogging(error, {
        sessionId: 'session-123',
        participantId: 'participant-456',
        event: 'submit_answer',
      });

      expect(result.context.sessionId).toBe('session-123');
      expect(result.context.participantId).toBe('participant-456');
      expect(result.context.event).toBe('submit_answer');
    });
  });

  describe('ErrorResponse interface compliance', () => {
    it('should have all required fields in REST error response', () => {
      const response = createRestErrorResponse(new Error('Test'));

      // Required fields
      expect(response).toHaveProperty('code');
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('timestamp');
      expect(response).toHaveProperty('requestId');
      expect(response).toHaveProperty('statusCode');
      expect(response).toHaveProperty('success');

      // Type checks
      expect(typeof response.code).toBe('string');
      expect(typeof response.message).toBe('string');
      expect(typeof response.timestamp).toBe('string');
      expect(typeof response.requestId).toBe('string');
      expect(typeof response.statusCode).toBe('number');
      expect(response.success).toBe(false);
    });

    it('should have all required fields in WebSocket error response', () => {
      const response = createWebSocketErrorResponse(new Error('Test'));

      // Required fields
      expect(response).toHaveProperty('code');
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('timestamp');
      expect(response).toHaveProperty('requestId');

      // Type checks
      expect(typeof response.code).toBe('string');
      expect(typeof response.message).toBe('string');
      expect(typeof response.timestamp).toBe('string');
      expect(typeof response.requestId).toBe('string');
    });

    it('should have valid ISO 8601 timestamp', () => {
      const response = createRestErrorResponse(new Error('Test'));
      
      // ISO 8601 format check
      const timestamp = new Date(response.timestamp);
      expect(timestamp.toISOString()).toBe(response.timestamp);
    });
  });

  describe('Error type handling', () => {
    it('should handle Error objects', () => {
      const error = new Error('Standard error');
      const response = createRestErrorResponse(error);

      expect(response.message).toBeTruthy();
      expect(response.success).toBe(false);
    });

    it('should handle string errors', () => {
      const response = createRestErrorResponse('String error message');

      expect(response.message).toBeTruthy();
      expect(response.success).toBe(false);
    });

    it('should handle null/undefined errors', () => {
      const nullResponse = createRestErrorResponse(null);
      expect(nullResponse.message).toBeTruthy();

      const undefinedResponse = createRestErrorResponse(undefined);
      expect(undefinedResponse.message).toBeTruthy();
    });

    it('should handle error-like objects', () => {
      const errorLike = { message: 'Error-like object', code: 'CUSTOM_ERROR' };
      const response = createRestErrorResponse(errorLike);

      expect(response.message).toBeTruthy();
      expect(response.success).toBe(false);
    });

    it('should handle complex objects', () => {
      const complexError = {
        error: 'Complex error',
        details: { field: 'value' },
      };
      const response = createRestErrorResponse(complexError);

      expect(response.message).toBeTruthy();
      expect(response.success).toBe(false);
    });
  });
});
