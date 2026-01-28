import {
  errorSanitizationService,
  ErrorCategory,
  ErrorCode,
} from '../error-sanitization.service';

describe('ErrorSanitizationService', () => {
  describe('sanitize', () => {
    describe('basic error handling', () => {
      it('should sanitize Error objects', () => {
        const error = new Error('Something went wrong');
        const result = errorSanitizationService.sanitize(error);
        
        expect(result).toHaveProperty('code');
        expect(result).toHaveProperty('category');
        expect(result).toHaveProperty('message');
        expect(result).toHaveProperty('userMessage');
        expect(result).toHaveProperty('timestamp');
      });

      it('should sanitize string errors', () => {
        const result = errorSanitizationService.sanitize('Connection failed');
        
        expect(result.message).toBe('Connection failed');
        expect(result.userMessage).toBeDefined();
      });

      it('should sanitize error-like objects', () => {
        const errorObj = { message: 'Custom error message' };
        const result = errorSanitizationService.sanitize(errorObj);
        
        expect(result.message).toContain('Custom error message');
      });

      it('should handle null errors', () => {
        const result = errorSanitizationService.sanitize(null);
        
        expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
        expect(result.userMessage).toBeDefined();
      });

      it('should handle undefined errors', () => {
        const result = errorSanitizationService.sanitize(undefined);
        
        expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
        expect(result.userMessage).toBeDefined();
      });

      it('should include requestId when provided', () => {
        const result = errorSanitizationService.sanitize('Error', 'req-123');
        
        expect(result.requestId).toBe('req-123');
      });

      it('should include timestamp in ISO format', () => {
        const result = errorSanitizationService.sanitize('Error');
        
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });

    describe('stack trace removal', () => {
      it('should remove stack traces from Error objects', () => {
        const error = new Error('Test error');
        error.stack = `Error: Test error
    at Object.<anonymous> (/app/src/services/test.ts:10:15)
    at Module._compile (node:internal/modules/cjs/loader:1254:14)
    at Module._extensions..js (node:internal/modules/cjs/loader:1308:10)`;
        
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('at Object.<anonymous>');
        expect(result.message).not.toContain('Module._compile');
        expect(result.message).not.toContain('/app/src/services/test.ts');
      });

      it('should remove inline stack trace references', () => {
        const error = 'Error at someFunction (/path/to/file.js:10:5)';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('at someFunction');
      });
    });

    describe('database error sanitization', () => {
      it('should remove MongoDB connection strings', () => {
        const error = 'Failed to connect to mongodb://user:password@cluster.mongodb.net:27017/db';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('mongodb://');
        expect(result.message).not.toContain('password');
        expect(result.message).toContain('[DATABASE_URI]');
      });

      it('should remove MongoDB+SRV connection strings', () => {
        const error = 'Connection error: mongodb+srv://admin:secret@cluster.mongodb.net/mydb';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('mongodb+srv://');
        expect(result.message).not.toContain('secret');
      });

      it('should remove Redis connection strings', () => {
        const error = 'Redis error: redis://default:mypassword@redis-host:6379';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('redis://');
        expect(result.message).not.toContain('mypassword');
        expect(result.message).toContain('[CACHE_URI]');
      });

      it('should remove PostgreSQL connection strings', () => {
        const error = 'postgres://user:pass@localhost:5432/database';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('postgres://');
        expect(result.message).not.toContain('pass');
      });

      it('should categorize MongoDB errors correctly', () => {
        const error = 'MongoServerError: E11000 duplicate key error';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.category).toBe(ErrorCategory.DATABASE);
        expect(result.code).toBe(ErrorCode.DB_DUPLICATE_KEY);
      });

      it('should provide user-friendly message for database errors', () => {
        const error = 'MongoDB connection failed: ECONNREFUSED';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.userMessage).toBe('Service temporarily unavailable. Please try again later.');
      });
    });

    describe('file path removal', () => {
      it('should remove Unix file paths', () => {
        const error = 'Error in /home/user/app/src/services/quiz.service.ts';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('/home/user/app');
        expect(result.message).toContain('[PATH]');
      });

      it('should remove Windows file paths', () => {
        const error = 'Error in C:\\Users\\dev\\project\\src\\index.ts';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('C:\\Users');
        expect(result.message).toContain('[PATH]');
      });

      it('should remove node_modules paths', () => {
        const error = 'Error in node_modules/express/lib/router/index.js';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('node_modules/express');
        expect(result.message).toContain('[MODULE]');
      });
    });

    describe('IP address removal', () => {
      it('should remove IPv4 addresses', () => {
        const error = 'Connection refused from 192.168.1.100';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('192.168.1.100');
        expect(result.message).toContain('[IP]');
      });

      it('should remove localhost IP', () => {
        const error = 'Failed to connect to 127.0.0.1:3000';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('127.0.0.1');
      });
    });

    describe('internal error code removal', () => {
      it('should remove ECONNREFUSED', () => {
        const error = 'connect ECONNREFUSED 127.0.0.1:27017';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('ECONNREFUSED');
        expect(result.message).toContain('[ERROR]');
      });

      it('should remove ETIMEDOUT', () => {
        const error = 'connect ETIMEDOUT 10.0.0.1:443';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('ETIMEDOUT');
      });

      it('should remove ENOTFOUND', () => {
        const error = 'getaddrinfo ENOTFOUND unknown-host.com';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('ENOTFOUND');
      });
    });

    describe('query removal', () => {
      it('should remove SQL queries', () => {
        const error = 'Query failed: SELECT * FROM users WHERE id = 123';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('SELECT * FROM users');
        expect(result.message).toContain('[QUERY]');
      });

      it('should remove MongoDB queries', () => {
        const error = 'Query failed: { $match: { userId: ObjectId("123") } }';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('$match');
        expect(result.message).not.toContain('ObjectId');
      });
    });

    describe('environment variable removal', () => {
      it('should remove process.env references', () => {
        const error = 'Missing process.env.DATABASE_URL';
        const result = errorSanitizationService.sanitize(error);
        
        expect(result.message).not.toContain('process.env.DATABASE_URL');
        expect(result.message).toContain('[ENV]');
      });
    });
  });

  describe('detectCategory', () => {
    it('should detect DATABASE category', () => {
      expect(errorSanitizationService.detectCategory('MongoDB connection failed')).toBe(ErrorCategory.DATABASE);
      expect(errorSanitizationService.detectCategory('Redis timeout')).toBe(ErrorCategory.DATABASE);
      expect(errorSanitizationService.detectCategory('Database query error')).toBe(ErrorCategory.DATABASE);
    });

    it('should detect VALIDATION category', () => {
      expect(errorSanitizationService.detectCategory('Validation failed')).toBe(ErrorCategory.VALIDATION);
      expect(errorSanitizationService.detectCategory('Invalid input')).toBe(ErrorCategory.VALIDATION);
      expect(errorSanitizationService.detectCategory('Required field missing')).toBe(ErrorCategory.VALIDATION);
    });

    it('should detect AUTHENTICATION category', () => {
      expect(errorSanitizationService.detectCategory('Authentication failed')).toBe(ErrorCategory.AUTHENTICATION);
      expect(errorSanitizationService.detectCategory('Invalid token')).toBe(ErrorCategory.AUTHENTICATION);
      expect(errorSanitizationService.detectCategory('JWT expired')).toBe(ErrorCategory.AUTHENTICATION);
    });

    it('should detect AUTHORIZATION category', () => {
      expect(errorSanitizationService.detectCategory('Forbidden')).toBe(ErrorCategory.AUTHORIZATION);
      expect(errorSanitizationService.detectCategory('Permission denied')).toBe(ErrorCategory.AUTHORIZATION);
      expect(errorSanitizationService.detectCategory('Access denied')).toBe(ErrorCategory.AUTHORIZATION);
    });

    it('should detect RATE_LIMIT category', () => {
      expect(errorSanitizationService.detectCategory('Rate limit exceeded')).toBe(ErrorCategory.RATE_LIMIT);
      expect(errorSanitizationService.detectCategory('Too many requests')).toBe(ErrorCategory.RATE_LIMIT);
    });

    it('should detect NETWORK category', () => {
      expect(errorSanitizationService.detectCategory('Network error')).toBe(ErrorCategory.NETWORK);
      expect(errorSanitizationService.detectCategory('Connection reset')).toBe(ErrorCategory.NETWORK);
      expect(errorSanitizationService.detectCategory('Socket closed')).toBe(ErrorCategory.NETWORK);
    });

    it('should detect NOT_FOUND category', () => {
      expect(errorSanitizationService.detectCategory('Resource not found')).toBe(ErrorCategory.NOT_FOUND);
      expect(errorSanitizationService.detectCategory('404 error')).toBe(ErrorCategory.NOT_FOUND);
    });

    it('should detect CONFLICT category', () => {
      expect(errorSanitizationService.detectCategory('Resource conflict')).toBe(ErrorCategory.CONFLICT);
      expect(errorSanitizationService.detectCategory('Already exists')).toBe(ErrorCategory.CONFLICT);
    });

    it('should return UNKNOWN for unrecognized errors', () => {
      expect(errorSanitizationService.detectCategory('Some random error')).toBe(ErrorCategory.UNKNOWN);
    });
  });

  describe('mapToErrorCode', () => {
    describe('database error codes', () => {
      it('should map duplicate key errors', () => {
        const code = errorSanitizationService.mapToErrorCode(
          'E11000 duplicate key error',
          ErrorCategory.DATABASE
        );
        expect(code).toBe(ErrorCode.DB_DUPLICATE_KEY);
      });

      it('should map timeout errors', () => {
        const code = errorSanitizationService.mapToErrorCode(
          'Database operation timed out',
          ErrorCategory.DATABASE
        );
        expect(code).toBe(ErrorCode.DB_TIMEOUT);
      });

      it('should map connection errors', () => {
        const code = errorSanitizationService.mapToErrorCode(
          'ECONNREFUSED',
          ErrorCategory.DATABASE
        );
        expect(code).toBe(ErrorCode.DB_CONNECTION_FAILED);
      });

      it('should default to query failed for other database errors', () => {
        const code = errorSanitizationService.mapToErrorCode(
          'Unknown database error',
          ErrorCategory.DATABASE
        );
        expect(code).toBe(ErrorCode.DB_QUERY_FAILED);
      });
    });

    describe('validation error codes', () => {
      it('should map missing field errors', () => {
        const code = errorSanitizationService.mapToErrorCode(
          'Required field is missing',
          ErrorCategory.VALIDATION
        );
        expect(code).toBe(ErrorCode.MISSING_FIELD);
      });

      it('should map format errors', () => {
        const code = errorSanitizationService.mapToErrorCode(
          'Invalid format',
          ErrorCategory.VALIDATION
        );
        expect(code).toBe(ErrorCode.INVALID_FORMAT);
      });

      it('should default to invalid input for other validation errors', () => {
        const code = errorSanitizationService.mapToErrorCode(
          'Validation error',
          ErrorCategory.VALIDATION
        );
        expect(code).toBe(ErrorCode.INVALID_INPUT);
      });
    });

    describe('authentication error codes', () => {
      it('should map expired token errors', () => {
        const code = errorSanitizationService.mapToErrorCode(
          'Token has expired',
          ErrorCategory.AUTHENTICATION
        );
        expect(code).toBe(ErrorCode.TOKEN_EXPIRED);
      });

      it('should map invalid token errors', () => {
        const code = errorSanitizationService.mapToErrorCode(
          'Invalid token provided',
          ErrorCategory.AUTHENTICATION
        );
        expect(code).toBe(ErrorCode.TOKEN_INVALID);
      });

      it('should map session errors', () => {
        const code = errorSanitizationService.mapToErrorCode(
          'Session not found',
          ErrorCategory.AUTHENTICATION
        );
        expect(code).toBe(ErrorCode.SESSION_EXPIRED);
      });
    });
  });

  describe('getUserFriendlyMessage', () => {
    it('should return appropriate message for database errors', () => {
      const message = errorSanitizationService.getMessageForCode(ErrorCode.DB_CONNECTION_FAILED);
      expect(message).toBe('Service temporarily unavailable. Please try again later.');
    });

    it('should return appropriate message for authentication errors', () => {
      const message = errorSanitizationService.getMessageForCode(ErrorCode.AUTH_FAILED);
      expect(message).toBe('Authentication failed. Please check your credentials.');
    });

    it('should return appropriate message for rate limit errors', () => {
      const message = errorSanitizationService.getMessageForCode(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(message).toBe('Too many requests. Please try again later.');
    });

    it('should return appropriate message for network errors', () => {
      const message = errorSanitizationService.getMessageForCode(ErrorCode.CONNECTION_ERROR);
      expect(message).toBe('Connection error. Please check your internet connection.');
    });

    it('should return appropriate message for not found errors', () => {
      const message = errorSanitizationService.getMessageForCode(ErrorCode.NOT_FOUND);
      expect(message).toBe('The requested item was not found.');
    });

    it('should return generic message for unknown errors', () => {
      const message = errorSanitizationService.getMessageForCode(ErrorCode.UNKNOWN_ERROR);
      expect(message).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('containsSensitiveInfo', () => {
    it('should detect MongoDB URIs', () => {
      expect(errorSanitizationService.containsSensitiveInfo(
        'mongodb://user:pass@host:27017/db'
      )).toBe(true);
    });

    it('should detect file paths', () => {
      expect(errorSanitizationService.containsSensitiveInfo(
        '/home/user/app/src/index.ts'
      )).toBe(true);
    });

    it('should detect IP addresses', () => {
      expect(errorSanitizationService.containsSensitiveInfo(
        'Connection to 192.168.1.1 failed'
      )).toBe(true);
    });

    it('should detect stack traces', () => {
      expect(errorSanitizationService.containsSensitiveInfo(
        'at Object.<anonymous> (/app/index.js:10:5)'
      )).toBe(true);
    });

    it('should return false for clean messages', () => {
      expect(errorSanitizationService.containsSensitiveInfo(
        'Invalid nickname provided'
      )).toBe(false);
    });
  });

  describe('sanitizeForLogging', () => {
    it('should return both sanitized error and original message', () => {
      const error = new Error('MongoDB connection failed: mongodb://user:pass@host/db');
      const result = errorSanitizationService.sanitizeForLogging(error, 'req-123');
      
      expect(result.sanitized).toBeDefined();
      expect(result.sanitized.requestId).toBe('req-123');
      expect(result.originalMessage).toBeDefined();
      expect(result.originalMessage).not.toContain('user:pass');
      expect(result.category).toBe(ErrorCategory.DATABASE);
    });
  });

  describe('getErrorCodes', () => {
    it('should return all error codes', () => {
      const codes = errorSanitizationService.getErrorCodes();
      
      expect(codes).toContain(ErrorCode.DB_CONNECTION_FAILED);
      expect(codes).toContain(ErrorCode.AUTH_FAILED);
      expect(codes).toContain(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(codes).toContain(ErrorCode.UNKNOWN_ERROR);
    });
  });

  describe('getErrorCategories', () => {
    it('should return all error categories', () => {
      const categories = errorSanitizationService.getErrorCategories();
      
      expect(categories).toContain(ErrorCategory.DATABASE);
      expect(categories).toContain(ErrorCategory.VALIDATION);
      expect(categories).toContain(ErrorCategory.AUTHENTICATION);
      expect(categories).toContain(ErrorCategory.UNKNOWN);
    });
  });

  describe('real-world error scenarios', () => {
    it('should handle MongoDB duplicate key error', () => {
      const error = new Error('MongoServerError: E11000 duplicate key error collection: quiz.sessions index: joinCode_1 dup key: { joinCode: "ABC123" }');
      const result = errorSanitizationService.sanitize(error);
      
      expect(result.category).toBe(ErrorCategory.DATABASE);
      expect(result.code).toBe(ErrorCode.DB_DUPLICATE_KEY);
      expect(result.userMessage).toBe('This item already exists.');
    });

    it('should handle Redis connection error', () => {
      const error = 'Error: connect ECONNREFUSED 127.0.0.1:6379';
      const result = errorSanitizationService.sanitize(error);
      
      expect(result.category).toBe(ErrorCategory.DATABASE);
      expect(result.message).not.toContain('127.0.0.1');
      expect(result.message).not.toContain('ECONNREFUSED');
    });

    it('should handle JWT token expired error', () => {
      const error = new Error('JsonWebTokenError: jwt expired');
      const result = errorSanitizationService.sanitize(error);
      
      expect(result.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(result.code).toBe(ErrorCode.TOKEN_EXPIRED);
      expect(result.userMessage).toBe('Your session has expired. Please log in again.');
    });

    it('should handle rate limit error', () => {
      const error = 'Rate limit exceeded: 5 requests per minute';
      const result = errorSanitizationService.sanitize(error);
      
      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(result.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(result.userMessage).toBe('Too many requests. Please try again later.');
    });

    it('should handle validation error with clean message', () => {
      const error = 'Nickname must be at least 2 characters long';
      const result = errorSanitizationService.sanitize(error);
      
      expect(result.category).toBe(ErrorCategory.UNKNOWN);
      // Clean validation messages should be preserved
      expect(result.message).toBe('Nickname must be at least 2 characters long');
    });

    it('should handle network timeout error', () => {
      const error = 'Error: connect ETIMEDOUT 10.0.0.1:443';
      const result = errorSanitizationService.sanitize(error);
      
      expect(result.message).not.toContain('ETIMEDOUT');
      expect(result.message).not.toContain('10.0.0.1');
    });

    it('should handle complex error with multiple sensitive items', () => {
      const error = `Error: Failed to connect to mongodb://admin:secretpass@cluster.mongodb.net:27017/quiz
    at MongoClient.connect (/app/node_modules/mongodb/lib/mongo_client.js:123:15)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async connectToDatabase (/app/src/services/mongodb.service.ts:45:10)
ECONNREFUSED 192.168.1.100:27017`;
      
      const result = errorSanitizationService.sanitize(error);
      
      expect(result.message).not.toContain('secretpass');
      expect(result.message).not.toContain('mongodb://');
      expect(result.message).not.toContain('/app/node_modules');
      expect(result.message).not.toContain('/app/src/services');
      expect(result.message).not.toContain('192.168.1.100');
      expect(result.message).not.toContain('ECONNREFUSED');
      expect(result.message).not.toContain('at MongoClient.connect');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string error', () => {
      const result = errorSanitizationService.sanitize('');
      
      expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(result.userMessage).toBeDefined();
    });

    it('should handle error with only whitespace', () => {
      const result = errorSanitizationService.sanitize('   \n\t  ');
      
      expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it('should handle circular reference in error object', () => {
      const errorObj: any = { message: 'Test' };
      errorObj.self = errorObj;
      
      // Should not throw
      const result = errorSanitizationService.sanitize(errorObj);
      expect(result).toBeDefined();
    });

    it('should handle very long error messages', () => {
      const longMessage = 'Error: ' + 'a'.repeat(10000);
      const result = errorSanitizationService.sanitize(longMessage);
      
      expect(result).toBeDefined();
      expect(result.userMessage).toBeDefined();
    });

    it('should handle error with special characters', () => {
      const error = 'Error: <script>alert("xss")</script>';
      const result = errorSanitizationService.sanitize(error);
      
      expect(result).toBeDefined();
    });

    it('should handle number as error', () => {
      const result = errorSanitizationService.sanitize(404);
      
      expect(result).toBeDefined();
      expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it('should handle boolean as error', () => {
      const result = errorSanitizationService.sanitize(false);
      
      expect(result).toBeDefined();
      expect(result.code).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it('should handle array as error', () => {
      const result = errorSanitizationService.sanitize(['error1', 'error2']);
      
      expect(result).toBeDefined();
    });
  });
});
