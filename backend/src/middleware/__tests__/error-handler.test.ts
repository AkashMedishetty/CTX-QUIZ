/**
 * Error Handler Middleware Tests
 * 
 * Tests for the centralized error handling middleware that provides
 * consistent, user-friendly error responses for REST API errors.
 * 
 * Requirements: 17.7
 */

import { Request, Response, NextFunction } from 'express';
import { errorHandler, notFoundHandler, ApiError } from '../error-handler';
import { ErrorCode, ErrorCategory } from '../../utils/error-response';

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let setHeaderMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    setHeaderMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    
    mockRequest = {
      path: '/api/test',
      method: 'GET',
      originalUrl: '/api/test',
      ip: '127.0.0.1',
      headers: {},
      get: jest.fn().mockReturnValue('test-user-agent'),
    };
    
    mockResponse = {
      status: statusMock,
      json: jsonMock,
      setHeader: setHeaderMock,
    };
    
    mockNext = jest.fn();

    // Suppress console.error during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('errorHandler', () => {
    it('should handle ApiError with correct status code', () => {
      const error = new ApiError(400, 'Bad request', {
        code: ErrorCode.INVALID_INPUT,
      });
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: ErrorCode.INVALID_INPUT,
            timestamp: expect.any(String),
            requestId: expect.any(String),
          }),
        })
      );
    });

    it('should handle generic errors with 500 status', () => {
      const error = new Error('Something went wrong');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: expect.any(String),
            code: expect.any(String),
            timestamp: expect.any(String),
            requestId: expect.any(String),
          }),
        })
      );
    });

    it('should handle ZodError with 400 status', () => {
      const error = new Error('Validation failed');
      error.name = 'ZodError';
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: ErrorCode.INVALID_INPUT,
          }),
        })
      );
    });

    it('should handle MongoDB errors', () => {
      const error = new Error('Database connection failed');
      error.name = 'MongoError';
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: expect.any(String),
            message: expect.any(String),
          }),
        })
      );
    });

    it('should handle JWT errors with 401 status', () => {
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: ErrorCode.AUTH_FAILED,
          }),
        })
      );
    });

    it('should handle TokenExpiredError with 401 status', () => {
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: expect.stringContaining('expired'),
          }),
        })
      );
    });

    it('should include category in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new ApiError(400, 'Test error', {
        code: ErrorCode.INVALID_INPUT,
        category: ErrorCategory.VALIDATION,
      });
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            category: ErrorCategory.VALIDATION,
          }),
        })
      );
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should not include category in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const error = new ApiError(400, 'Test error', {
        code: ErrorCode.INVALID_INPUT,
        category: ErrorCategory.VALIDATION,
      });
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      const callArgs = jsonMock.mock.calls[0][0];
      expect(callArgs.error).not.toHaveProperty('category');
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should set X-Request-ID header', () => {
      const error = new ApiError(400, 'Test error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(setHeaderMock).toHaveBeenCalledWith('X-Request-ID', expect.any(String));
    });

    it('should use existing request ID from headers', () => {
      const existingRequestId = 'existing-request-id-123';
      mockRequest.headers = { 'x-request-id': existingRequestId };
      
      const error = new ApiError(400, 'Test error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(setHeaderMock).toHaveBeenCalledWith('X-Request-ID', existingRequestId);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            requestId: existingRequestId,
          }),
        })
      );
    });

    it('should include timestamp in ISO 8601 format', () => {
      const error = new ApiError(400, 'Test error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      const callArgs = jsonMock.mock.calls[0][0];
      const timestamp = callArgs.error.timestamp;
      
      // Verify it's a valid ISO 8601 timestamp
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with path information', () => {
      notFoundHandler(mockRequest as Request, mockResponse as Response);
      
      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: ErrorCode.NOT_FOUND,
            message: expect.stringContaining('/api/test'),
            timestamp: expect.any(String),
            requestId: expect.any(String),
          }),
        })
      );
    });

    it('should set X-Request-ID header', () => {
      notFoundHandler(mockRequest as Request, mockResponse as Response);
      
      expect(setHeaderMock).toHaveBeenCalledWith('X-Request-ID', expect.any(String));
    });
  });

  describe('ApiError', () => {
    it('should create error with correct properties', () => {
      const error = new ApiError(404, 'Not found');
      
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Not found');
      expect(error.isOperational).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should allow custom isOperational flag', () => {
      const error = new ApiError(500, 'Server error', { isOperational: false });
      
      expect(error.isOperational).toBe(false);
    });

    it('should allow custom error code', () => {
      const error = new ApiError(400, 'Invalid input', {
        code: ErrorCode.INVALID_INPUT,
      });
      
      expect(error.code).toBe(ErrorCode.INVALID_INPUT);
    });

    it('should allow custom error category', () => {
      const error = new ApiError(400, 'Validation error', {
        category: ErrorCategory.VALIDATION,
      });
      
      expect(error.category).toBe(ErrorCategory.VALIDATION);
    });

    describe('static factory methods', () => {
      it('should create validation error', () => {
        const error = ApiError.validation('Invalid email');
        
        expect(error.statusCode).toBe(400);
        expect(error.message).toBe('Invalid email');
        expect(error.code).toBe(ErrorCode.INVALID_INPUT);
        expect(error.category).toBe(ErrorCategory.VALIDATION);
      });

      it('should create not found error', () => {
        const error = ApiError.notFound('User');
        
        expect(error.statusCode).toBe(404);
        expect(error.message).toBe('User not found');
        expect(error.code).toBe(ErrorCode.NOT_FOUND);
        expect(error.category).toBe(ErrorCategory.NOT_FOUND);
      });

      it('should create unauthorized error', () => {
        const error = ApiError.unauthorized();
        
        expect(error.statusCode).toBe(401);
        expect(error.message).toBe('Authentication required');
        expect(error.code).toBe(ErrorCode.AUTH_FAILED);
        expect(error.category).toBe(ErrorCategory.AUTHENTICATION);
      });

      it('should create unauthorized error with custom message', () => {
        const error = ApiError.unauthorized('Token expired');
        
        expect(error.message).toBe('Token expired');
      });

      it('should create forbidden error', () => {
        const error = ApiError.forbidden();
        
        expect(error.statusCode).toBe(403);
        expect(error.message).toBe('Access denied');
        expect(error.code).toBe(ErrorCode.FORBIDDEN);
        expect(error.category).toBe(ErrorCategory.AUTHORIZATION);
      });

      it('should create conflict error', () => {
        const error = ApiError.conflict('Resource already exists');
        
        expect(error.statusCode).toBe(409);
        expect(error.message).toBe('Resource already exists');
        expect(error.code).toBe(ErrorCode.RESOURCE_CONFLICT);
        expect(error.category).toBe(ErrorCategory.CONFLICT);
      });

      it('should create rate limited error', () => {
        const error = ApiError.rateLimited();
        
        expect(error.statusCode).toBe(429);
        expect(error.message).toBe('Too many requests');
        expect(error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
        expect(error.category).toBe(ErrorCategory.RATE_LIMIT);
      });

      it('should create internal error', () => {
        const error = ApiError.internal();
        
        expect(error.statusCode).toBe(500);
        expect(error.message).toBe('Internal server error');
        expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
        expect(error.category).toBe(ErrorCategory.INTERNAL);
        expect(error.isOperational).toBe(false);
      });
    });
  });

  describe('Error response format compliance', () => {
    it('should include all required fields in error response', () => {
      const error = new ApiError(400, 'Test error');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      const callArgs = jsonMock.mock.calls[0][0];
      
      expect(callArgs).toHaveProperty('success', false);
      expect(callArgs.error).toHaveProperty('code');
      expect(callArgs.error).toHaveProperty('message');
      expect(callArgs.error).toHaveProperty('timestamp');
      expect(callArgs.error).toHaveProperty('requestId');
    });

    it('should sanitize sensitive information', () => {
      const error = new Error('MongoDB connection failed: mongodb://user:password@localhost:27017/db');
      
      errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);
      
      const callArgs = jsonMock.mock.calls[0][0];
      
      expect(callArgs.error.message).not.toContain('password');
      expect(callArgs.error.message).not.toContain('mongodb://');
    });
  });
});
