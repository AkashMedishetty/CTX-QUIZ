/**
 * Error Sanitization Service
 * 
 * Sanitizes error messages to remove sensitive technical details
 * and provide user-friendly messages to participants.
 * 
 * Features:
 * - Removes stack traces, database errors, file paths
 * - Maps error codes to user-friendly messages
 * - Provides clear, actionable messages
 * 
 * Requirements: 17.7
 */

/**
 * Error categories for mapping to user-friendly messages
 */
export enum ErrorCategory {
  DATABASE = 'DATABASE',
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  RATE_LIMIT = 'RATE_LIMIT',
  NETWORK = 'NETWORK',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL = 'INTERNAL',
  TIMEOUT = 'TIMEOUT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Error codes for specific error types
 */
export enum ErrorCode {
  // Database errors
  DB_CONNECTION_FAILED = 'DB_CONNECTION_FAILED',
  DB_QUERY_FAILED = 'DB_QUERY_FAILED',
  DB_TIMEOUT = 'DB_TIMEOUT',
  DB_DUPLICATE_KEY = 'DB_DUPLICATE_KEY',
  
  // Validation errors
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_FIELD = 'MISSING_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  
  // Authentication errors
  AUTH_FAILED = 'AUTH_FAILED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  
  // Authorization errors
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Rate limiting errors
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  
  // Network errors
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  
  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  
  // Service errors
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  
  // Unknown
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Sanitized error result
 */
export interface SanitizedError {
  code: ErrorCode;
  category: ErrorCategory;
  message: string;
  userMessage: string;
  timestamp: string;
  requestId?: string;
}

/**
 * Patterns to detect sensitive information
 */
const SENSITIVE_PATTERNS = {
  // Stack traces
  stackTrace: /at\s+[\w.]+\s+\([^)]+\)/gi,
  stackTraceLines: /^\s*at\s+.+$/gm,
  
  // File paths
  filePath: /(?:\/[\w.-]+)+(?:\.[\w]+)?/g,
  windowsPath: /[A-Za-z]:\\(?:[\w.-]+\\)+[\w.-]+/g,
  
  // Database connection strings
  mongoUri: /mongodb(?:\+srv)?:\/\/[^\s]+/gi,
  redisUri: /redis:\/\/[^\s]+/gi,
  postgresUri: /postgres(?:ql)?:\/\/[^\s]+/gi,
  mysqlUri: /mysql:\/\/[^\s]+/gi,
  
  // Credentials in URLs
  credentialsInUrl: /:\/\/[^:]+:[^@]+@/gi,
  
  // IP addresses
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  
  // Port numbers in context
  portNumber: /:\d{4,5}\b/g,
  
  // Internal error codes
  internalErrorCode: /\b(?:ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|EPIPE)\b/gi,
  
  // Query details
  sqlQuery: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+.+/gi,
  mongoQuery: /\{[^}]*(?:\$[a-z]+|ObjectId)[^}]*\}/gi,
  
  // Environment variables
  envVar: /process\.env\.\w+/gi,
  
  // Memory addresses
  memoryAddress: /0x[0-9a-fA-F]+/g,
  
  // Node.js internal paths
  nodeModules: /node_modules\/[^\s]+/g,
};

/**
 * User-friendly message mappings
 */
const USER_FRIENDLY_MESSAGES: Record<ErrorCode, string> = {
  // Database errors
  [ErrorCode.DB_CONNECTION_FAILED]: 'Service temporarily unavailable. Please try again later.',
  [ErrorCode.DB_QUERY_FAILED]: 'Service temporarily unavailable. Please try again later.',
  [ErrorCode.DB_TIMEOUT]: 'The request took too long. Please try again.',
  [ErrorCode.DB_DUPLICATE_KEY]: 'This item already exists.',
  
  // Validation errors
  [ErrorCode.INVALID_INPUT]: 'The provided information is invalid. Please check and try again.',
  [ErrorCode.MISSING_FIELD]: 'Required information is missing. Please fill in all required fields.',
  [ErrorCode.INVALID_FORMAT]: 'The format of the provided information is incorrect.',
  
  // Authentication errors
  [ErrorCode.AUTH_FAILED]: 'Authentication failed. Please check your credentials.',
  [ErrorCode.TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
  [ErrorCode.TOKEN_INVALID]: 'Authentication failed. Please log in again.',
  [ErrorCode.SESSION_EXPIRED]: 'Your session has expired. Please rejoin the quiz.',
  
  // Authorization errors
  [ErrorCode.FORBIDDEN]: 'You do not have permission to perform this action.',
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 'You do not have permission to perform this action.',
  
  // Rate limiting errors
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please try again later.',
  [ErrorCode.TOO_MANY_REQUESTS]: 'Too many requests. Please try again later.',
  
  // Network errors
  [ErrorCode.CONNECTION_ERROR]: 'Connection error. Please check your internet connection.',
  [ErrorCode.NETWORK_TIMEOUT]: 'Connection timed out. Please try again.',
  
  // Resource errors
  [ErrorCode.NOT_FOUND]: 'The requested item was not found.',
  [ErrorCode.RESOURCE_CONFLICT]: 'A conflict occurred. Please refresh and try again.',
  
  // Service errors
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable. Please try again later.',
  [ErrorCode.INTERNAL_ERROR]: 'An unexpected error occurred. Please try again.',
  
  // Unknown
  [ErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
};

/**
 * Category to error code mapping for detection
 * Note: Order matters! More specific categories should be checked first.
 */
const CATEGORY_PATTERNS: Record<ErrorCategory, RegExp[]> = {
  // Check AUTHENTICATION before VALIDATION since "invalid token" should be auth
  [ErrorCategory.AUTHENTICATION]: [
    /auth/i,
    /\btoken\b/i,
    /jwt/i,
    /unauthorized/i,
    /credentials/i,
    /login/i,
    /\bsession\b/i,
  ],
  [ErrorCategory.DATABASE]: [
    /mongo/i,
    /mongodb/i,
    /redis/i,
    /database/i,
    /db\s+error/i,
    /connection\s+refused/i,
    /ECONNREFUSED/i,
    /duplicate\s+key/i,
    /E11000/i,
    /query\s+failed/i,
    /pool/i,
  ],
  [ErrorCategory.AUTHORIZATION]: [
    /forbidden/i,
    /permission/i,
    /access\s+denied/i,
    /not\s+allowed/i,
  ],
  [ErrorCategory.RATE_LIMIT]: [
    /rate\s*limit/i,
    /too\s+many/i,
    /throttl/i,
    /429/i,
  ],
  [ErrorCategory.VALIDATION]: [
    /validation/i,
    /invalid\s+input/i,
    /invalid\s+format/i,
    /required/i,
    /missing/i,
    /\bformat\b/i,
    /schema/i,
    /zod/i,
    /joi/i,
  ],
  [ErrorCategory.NETWORK]: [
    /network/i,
    /connection/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
    /ECONNRESET/i,
    /socket/i,
    /dns/i,
  ],
  [ErrorCategory.NOT_FOUND]: [
    /not\s+found/i,
    /404/i,
    /does\s+not\s+exist/i,
    /no\s+such/i,
  ],
  [ErrorCategory.CONFLICT]: [
    /conflict/i,
    /409/i,
    /already\s+exists/i,
    /duplicate/i,
  ],
  [ErrorCategory.TIMEOUT]: [
    /timeout/i,
    /timed\s+out/i,
    /deadline/i,
  ],
  [ErrorCategory.SERVICE_UNAVAILABLE]: [
    /unavailable/i,
    /503/i,
    /service\s+down/i,
    /maintenance/i,
  ],
  [ErrorCategory.INTERNAL]: [
    /internal/i,
    /500/i,
    /server\s+error/i,
  ],
  [ErrorCategory.UNKNOWN]: [],
};

class ErrorSanitizationService {
  /**
   * Sanitize an error and return a user-friendly version
   * 
   * @param error - The error to sanitize (can be Error, string, or unknown)
   * @param requestId - Optional request ID for tracking
   * @returns SanitizedError with user-friendly message
   */
  sanitize(error: unknown, requestId?: string): SanitizedError {
    const errorMessage = this.extractErrorMessage(error);
    const category = this.detectCategory(errorMessage);
    const code = this.mapToErrorCode(errorMessage, category);
    const sanitizedMessage = this.removeSensitiveInfo(errorMessage);
    const userMessage = this.getUserFriendlyMessage(code, sanitizedMessage);
    
    return {
      code,
      category,
      message: sanitizedMessage,
      userMessage,
      timestamp: new Date().toISOString(),
      requestId,
    };
  }

  /**
   * Extract error message from various error types
   */
  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      // Include stack trace for detection but will be removed later
      return error.stack || error.message;
    }
    
    if (typeof error === 'string') {
      return error;
    }
    
    if (error && typeof error === 'object') {
      // Handle error-like objects
      const errorObj = error as Record<string, unknown>;
      if (typeof errorObj.message === 'string') {
        return errorObj.message;
      }
      if (typeof errorObj.error === 'string') {
        return errorObj.error;
      }
      // Try to stringify
      try {
        return JSON.stringify(error);
      } catch {
        return 'Unknown error object';
      }
    }
    
    return 'Unknown error';
  }

  /**
   * Detect the error category based on error message patterns
   * Categories are checked in priority order (more specific first)
   */
  detectCategory(errorMessage: string): ErrorCategory {
    // Define the order of category checking (more specific first)
    const categoryOrder: ErrorCategory[] = [
      ErrorCategory.AUTHENTICATION,
      ErrorCategory.DATABASE,
      ErrorCategory.AUTHORIZATION,
      ErrorCategory.RATE_LIMIT,
      ErrorCategory.NOT_FOUND,
      ErrorCategory.CONFLICT,
      ErrorCategory.TIMEOUT,
      ErrorCategory.SERVICE_UNAVAILABLE,
      ErrorCategory.INTERNAL,
      ErrorCategory.VALIDATION,
      ErrorCategory.NETWORK,
    ];
    
    // Check each category's patterns in order
    for (const category of categoryOrder) {
      const patterns = CATEGORY_PATTERNS[category];
      if (patterns) {
        for (const pattern of patterns) {
          if (pattern.test(errorMessage)) {
            return category;
          }
        }
      }
    }
    
    return ErrorCategory.UNKNOWN;
  }

  /**
   * Map error message and category to a specific error code
   */
  mapToErrorCode(errorMessage: string, category: ErrorCategory): ErrorCode {
    // Database-specific codes
    if (category === ErrorCategory.DATABASE) {
      if (/duplicate\s+key|E11000/i.test(errorMessage)) {
        return ErrorCode.DB_DUPLICATE_KEY;
      }
      if (/timeout|timed\s+out/i.test(errorMessage)) {
        return ErrorCode.DB_TIMEOUT;
      }
      if (/connection|ECONNREFUSED/i.test(errorMessage)) {
        return ErrorCode.DB_CONNECTION_FAILED;
      }
      return ErrorCode.DB_QUERY_FAILED;
    }
    
    // Validation-specific codes
    if (category === ErrorCategory.VALIDATION) {
      if (/required|missing/i.test(errorMessage)) {
        return ErrorCode.MISSING_FIELD;
      }
      if (/format/i.test(errorMessage)) {
        return ErrorCode.INVALID_FORMAT;
      }
      return ErrorCode.INVALID_INPUT;
    }
    
    // Authentication-specific codes
    if (category === ErrorCategory.AUTHENTICATION) {
      if (/expired/i.test(errorMessage)) {
        return ErrorCode.TOKEN_EXPIRED;
      }
      if (/invalid.*token|token.*invalid/i.test(errorMessage)) {
        return ErrorCode.TOKEN_INVALID;
      }
      if (/session/i.test(errorMessage)) {
        return ErrorCode.SESSION_EXPIRED;
      }
      return ErrorCode.AUTH_FAILED;
    }
    
    // Authorization-specific codes
    if (category === ErrorCategory.AUTHORIZATION) {
      if (/permission/i.test(errorMessage)) {
        return ErrorCode.INSUFFICIENT_PERMISSIONS;
      }
      return ErrorCode.FORBIDDEN;
    }
    
    // Rate limit codes
    if (category === ErrorCategory.RATE_LIMIT) {
      return ErrorCode.RATE_LIMIT_EXCEEDED;
    }
    
    // Network-specific codes
    if (category === ErrorCategory.NETWORK) {
      if (/timeout|timed\s+out/i.test(errorMessage)) {
        return ErrorCode.NETWORK_TIMEOUT;
      }
      return ErrorCode.CONNECTION_ERROR;
    }
    
    // Not found
    if (category === ErrorCategory.NOT_FOUND) {
      return ErrorCode.NOT_FOUND;
    }
    
    // Conflict
    if (category === ErrorCategory.CONFLICT) {
      return ErrorCode.RESOURCE_CONFLICT;
    }
    
    // Timeout
    if (category === ErrorCategory.TIMEOUT) {
      return ErrorCode.NETWORK_TIMEOUT;
    }
    
    // Service unavailable
    if (category === ErrorCategory.SERVICE_UNAVAILABLE) {
      return ErrorCode.SERVICE_UNAVAILABLE;
    }
    
    // Internal
    if (category === ErrorCategory.INTERNAL) {
      return ErrorCode.INTERNAL_ERROR;
    }
    
    return ErrorCode.UNKNOWN_ERROR;
  }

  /**
   * Remove sensitive information from error message
   */
  removeSensitiveInfo(message: string): string {
    let sanitized = message;
    
    // Remove stack traces
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.stackTraceLines, '');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.stackTrace, '');
    
    // Remove database connection strings
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.mongoUri, '[DATABASE_URI]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.redisUri, '[CACHE_URI]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.postgresUri, '[DATABASE_URI]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.mysqlUri, '[DATABASE_URI]');
    
    // Remove credentials in URLs
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.credentialsInUrl, '://[CREDENTIALS]@');
    
    // Remove file paths
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.nodeModules, '[MODULE]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.windowsPath, '[PATH]');
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.filePath, '[PATH]');
    
    // Remove IP addresses
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.ipAddress, '[IP]');
    
    // Remove internal error codes
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.internalErrorCode, '[ERROR]');
    
    // Remove SQL queries
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.sqlQuery, '[QUERY]');
    
    // Remove MongoDB queries
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.mongoQuery, '[QUERY]');
    
    // Remove environment variable references
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.envVar, '[ENV]');
    
    // Remove memory addresses
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.memoryAddress, '[ADDR]');
    
    // Clean up multiple spaces and newlines
    sanitized = sanitized.replace(/\n\s*\n/g, '\n');
    sanitized = sanitized.replace(/\s{2,}/g, ' ');
    sanitized = sanitized.trim();
    
    return sanitized;
  }

  /**
   * Get user-friendly message for an error code
   */
  getUserFriendlyMessage(code: ErrorCode, sanitizedMessage?: string): string {
    // For validation errors, try to preserve the validation message if it's clean
    if (code === ErrorCode.INVALID_INPUT || 
        code === ErrorCode.MISSING_FIELD || 
        code === ErrorCode.INVALID_FORMAT) {
      if (sanitizedMessage && this.isCleanValidationMessage(sanitizedMessage)) {
        return sanitizedMessage;
      }
    }
    
    return USER_FRIENDLY_MESSAGES[code] || USER_FRIENDLY_MESSAGES[ErrorCode.UNKNOWN_ERROR];
  }

  /**
   * Check if a validation message is clean enough to show to users
   */
  private isCleanValidationMessage(message: string): boolean {
    // Check if message contains any sensitive patterns
    for (const pattern of Object.values(SENSITIVE_PATTERNS)) {
      if (pattern.test(message)) {
        // Reset regex lastIndex
        pattern.lastIndex = 0;
        return false;
      }
    }
    
    // Check message length (too long messages are likely technical)
    if (message.length > 200) {
      return false;
    }
    
    // Check for common technical terms that shouldn't be in user messages
    const technicalTerms = [
      /stack/i,
      /trace/i,
      /exception/i,
      /null\s*pointer/i,
      /undefined/i,
      /NaN/i,
      /heap/i,
      /memory/i,
      /buffer/i,
      /overflow/i,
      /segfault/i,
      /core\s*dump/i,
    ];
    
    for (const term of technicalTerms) {
      if (term.test(message)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Check if an error message contains sensitive information
   */
  containsSensitiveInfo(message: string): boolean {
    for (const pattern of Object.values(SENSITIVE_PATTERNS)) {
      if (pattern.test(message)) {
        // Reset regex lastIndex
        pattern.lastIndex = 0;
        return true;
      }
    }
    return false;
  }

  /**
   * Create a sanitized error for logging (includes more detail than user message)
   */
  sanitizeForLogging(error: unknown, requestId?: string): {
    sanitized: SanitizedError;
    originalMessage: string;
    category: ErrorCategory;
  } {
    const originalMessage = this.extractErrorMessage(error);
    const sanitized = this.sanitize(error, requestId);
    
    return {
      sanitized,
      originalMessage: this.removeSensitiveInfo(originalMessage),
      category: sanitized.category,
    };
  }

  /**
   * Get all available error codes
   */
  getErrorCodes(): ErrorCode[] {
    return Object.values(ErrorCode);
  }

  /**
   * Get all available error categories
   */
  getErrorCategories(): ErrorCategory[] {
    return Object.values(ErrorCategory);
  }

  /**
   * Get user-friendly message for a specific error code
   */
  getMessageForCode(code: ErrorCode): string {
    return USER_FRIENDLY_MESSAGES[code] || USER_FRIENDLY_MESSAGES[ErrorCode.UNKNOWN_ERROR];
  }
}

// Export singleton instance
export const errorSanitizationService = new ErrorSanitizationService();
