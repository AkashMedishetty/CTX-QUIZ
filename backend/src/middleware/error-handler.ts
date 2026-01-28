/**
 * Error Handler Middleware
 * 
 * Centralized error handling for Express REST API.
 * Uses the error response utility for consistent, user-friendly error responses.
 * 
 * Features:
 * - Consistent error response format with code, message, timestamp, requestId
 * - Integration with errorSanitizationService for message sanitization
 * - Proper HTTP status code mapping
 * - Development mode includes additional details
 * - Logging of all errors with context
 * 
 * Requirements: 17.7
 */

import { Request, Response, NextFunction } from 'express';
import {
  createRestErrorResponse,
  createValidationErrorResponse,
  createNotFoundErrorResponse,
  createAuthErrorResponse,
  formatErrorForLogging,
  generateRequestId,
  ErrorCode,
  ErrorCategory,
} from '../utils/error-response';

/**
 * Custom error class for API errors
 * Allows setting specific status codes and operational flags
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: ErrorCode;
  public readonly category?: ErrorCategory;

  constructor(
    statusCode: number,
    message: string,
    options: {
      isOperational?: boolean;
      code?: ErrorCode;
      category?: ErrorCategory;
    } = {}
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = options.isOperational ?? true;
    this.code = options.code;
    this.category = options.category;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Create a validation error
   */
  static validation(message: string): ApiError {
    return new ApiError(400, message, {
      code: ErrorCode.INVALID_INPUT,
      category: ErrorCategory.VALIDATION,
    });
  }

  /**
   * Create a not found error
   */
  static notFound(resource: string): ApiError {
    return new ApiError(404, `${resource} not found`, {
      code: ErrorCode.NOT_FOUND,
      category: ErrorCategory.NOT_FOUND,
    });
  }

  /**
   * Create an authentication error
   */
  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, message, {
      code: ErrorCode.AUTH_FAILED,
      category: ErrorCategory.AUTHENTICATION,
    });
  }

  /**
   * Create a forbidden error
   */
  static forbidden(message = 'Access denied'): ApiError {
    return new ApiError(403, message, {
      code: ErrorCode.FORBIDDEN,
      category: ErrorCategory.AUTHORIZATION,
    });
  }

  /**
   * Create a conflict error
   */
  static conflict(message: string): ApiError {
    return new ApiError(409, message, {
      code: ErrorCode.RESOURCE_CONFLICT,
      category: ErrorCategory.CONFLICT,
    });
  }

  /**
   * Create a rate limit error
   */
  static rateLimited(message = 'Too many requests'): ApiError {
    return new ApiError(429, message, {
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      category: ErrorCategory.RATE_LIMIT,
    });
  }

  /**
   * Create an internal server error
   */
  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, message, {
      isOperational: false,
      code: ErrorCode.INTERNAL_ERROR,
      category: ErrorCategory.INTERNAL,
    });
  }
}

/**
 * Get or generate request ID from request headers or generate a new one
 * 
 * @param req - Express request object
 * @returns Request ID string
 */
function getRequestId(req: Request): string {
  // Check for existing request ID in headers (from load balancer, etc.)
  const existingId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  if (typeof existingId === 'string' && existingId.length > 0) {
    return existingId;
  }
  
  // Check if we already generated one for this request
  if ((req as any).requestId) {
    return (req as any).requestId;
  }
  
  // Generate a new request ID
  const newId = generateRequestId();
  (req as any).requestId = newId;
  return newId;
}

/**
 * Error handling middleware
 * Catches all errors and sends appropriate responses using the standardized format
 * 
 * @param err - Error object
 * @param req - Express request object
 * @param res - Express response object
 * @param _next - Express next function (unused but required for error middleware signature)
 */
export function errorHandler(
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = getRequestId(req);
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Log error with context
  const logData = formatErrorForLogging(err, {
    requestId,
    path: req.path,
    method: req.method,
  });

  console.error('[Error Handler] Error occurred:', {
    ...logData,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Handle ApiError instances (our custom errors)
  if (err instanceof ApiError) {
    const response = createRestErrorResponse(err, {
      requestId,
      path: req.path,
      method: req.method,
      includeCategory: isDevelopment,
      includeDetails: isDevelopment,
    });

    // Override with ApiError's specific status code and code if available
    response.statusCode = err.statusCode;
    if (err.code) {
      response.code = err.code;
    }
    if (err.category && isDevelopment) {
      response.category = err.category;
    }

    // Set request ID header for client tracking
    res.setHeader('X-Request-ID', requestId);
    
    res.status(response.statusCode).json({
      success: response.success,
      error: {
        code: response.code,
        message: response.message,
        timestamp: response.timestamp,
        requestId: response.requestId,
        ...(response.category && { category: response.category }),
        ...(response.details && { details: response.details }),
      },
    });
    return;
  }

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    const response = createValidationErrorResponse(
      'Validation error: ' + extractZodErrorMessage(err),
      {
        requestId,
        path: req.path,
        method: req.method,
        includeCategory: isDevelopment,
      }
    );

    res.setHeader('X-Request-ID', requestId);
    
    res.status(response.statusCode).json({
      success: response.success,
      error: {
        code: response.code,
        message: response.message,
        timestamp: response.timestamp,
        requestId: response.requestId,
        ...(response.category && { category: response.category }),
        ...(isDevelopment && { details: err.message }),
      },
    });
    return;
  }

  // Handle MongoDB errors
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    const response = createRestErrorResponse(err, {
      requestId,
      path: req.path,
      method: req.method,
      includeCategory: isDevelopment,
      includeDetails: isDevelopment,
    });

    res.setHeader('X-Request-ID', requestId);
    
    res.status(response.statusCode).json({
      success: response.success,
      error: {
        code: response.code,
        message: response.message,
        timestamp: response.timestamp,
        requestId: response.requestId,
        ...(response.category && { category: response.category }),
        ...(response.details && { details: response.details }),
      },
    });
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    const message = err.name === 'TokenExpiredError' 
      ? 'Your session has expired. Please log in again.'
      : 'Authentication failed. Please log in again.';
    
    const response = createAuthErrorResponse(message, {
      requestId,
      path: req.path,
      method: req.method,
      includeCategory: isDevelopment,
    });

    res.setHeader('X-Request-ID', requestId);
    
    res.status(response.statusCode).json({
      success: response.success,
      error: {
        code: response.code,
        message: response.message,
        timestamp: response.timestamp,
        requestId: response.requestId,
        ...(response.category && { category: response.category }),
      },
    });
    return;
  }

  // Handle all other errors using the sanitization service
  const response = createRestErrorResponse(err, {
    requestId,
    path: req.path,
    method: req.method,
    includeCategory: isDevelopment,
    includeDetails: isDevelopment,
  });

  res.setHeader('X-Request-ID', requestId);
  
  res.status(response.statusCode).json({
    success: response.success,
    error: {
      code: response.code,
      message: response.message,
      timestamp: response.timestamp,
      requestId: response.requestId,
      ...(response.category && { category: response.category }),
      ...(response.details && { details: response.details }),
    },
  });
}

/**
 * Extract a user-friendly message from a Zod error
 * 
 * @param err - Zod error object
 * @returns User-friendly error message
 */
function extractZodErrorMessage(err: Error): string {
  try {
    // Try to parse Zod error format
    const zodError = JSON.parse(err.message);
    if (Array.isArray(zodError)) {
      // Get the first error message
      const firstError = zodError[0];
      if (firstError && firstError.message) {
        return firstError.message;
      }
    }
  } catch {
    // If parsing fails, try to extract from the message directly
    const match = err.message.match(/"message":\s*"([^"]+)"/);
    if (match) {
      return match[1];
    }
  }
  
  return 'Invalid input data';
}

/**
 * 404 Not Found handler
 * Handles requests to non-existent routes
 * 
 * @param req - Express request object
 * @param res - Express response object
 */
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = getRequestId(req);
  const response = createNotFoundErrorResponse('Route', {
    requestId,
    path: req.path,
    method: req.method,
  });

  res.setHeader('X-Request-ID', requestId);
  
  res.status(response.statusCode).json({
    success: response.success,
    error: {
      code: response.code,
      message: `Route ${req.path} not found`,
      timestamp: response.timestamp,
      requestId: response.requestId,
    },
  });
}
