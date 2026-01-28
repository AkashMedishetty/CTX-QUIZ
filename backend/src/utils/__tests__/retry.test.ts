/**
 * Retry Utility Tests
 * 
 * Tests for retry mechanism with exponential backoff:
 * - Successful operations on first try
 * - Retry behavior on transient failures
 * - Exponential backoff timing
 * - Max retries enforcement
 * - Custom retry predicates
 * - Logging of retry attempts
 * 
 * Requirements: 17.5
 */

import {
  retryWithBackoff,
  retryWithBackoffDetailed,
  RetryExhaustedError,
  RetryPredicates,
  calculateBackoffDelay,
} from '../retry';

describe('Retry Utility', () => {
  // Mock console methods to capture logs
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('retryWithBackoff', () => {
    describe('successful operations', () => {
      it('should return result on first successful attempt', async () => {
        const operation = jest.fn().mockResolvedValue('success');

        const result = await retryWithBackoff(operation);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should not log retry messages on first success', async () => {
        const operation = jest.fn().mockResolvedValue('success');

        await retryWithBackoff(operation);

        // Should not log any retry-related messages
        expect(consoleLogSpy).not.toHaveBeenCalled();
      });

      it('should succeed after transient failures', async () => {
        const operation = jest.fn()
          .mockRejectedValueOnce(new Error('Transient error 1'))
          .mockRejectedValueOnce(new Error('Transient error 2'))
          .mockResolvedValue('success');

        const result = await retryWithBackoff(operation);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(3);
      });

      it('should log success message after retries', async () => {
        const operation = jest.fn()
          .mockRejectedValueOnce(new Error('Transient error'))
          .mockResolvedValue('success');

        await retryWithBackoff(operation, { context: 'test-op' });

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[test-op]')
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Succeeded on attempt 2')
        );
      });
    });

    describe('retry behavior', () => {
      it('should retry up to maxRetries times (default: 3)', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Always fails'));

        await expect(retryWithBackoff(operation)).rejects.toThrow(RetryExhaustedError);

        // Initial attempt + 3 retries = 4 total calls
        expect(operation).toHaveBeenCalledTimes(4);
      });

      it('should respect custom maxRetries', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Always fails'));

        await expect(
          retryWithBackoff(operation, { maxRetries: 5 })
        ).rejects.toThrow(RetryExhaustedError);

        // Initial attempt + 5 retries = 6 total calls
        expect(operation).toHaveBeenCalledTimes(6);
      });

      it('should use exponential backoff between retries', async () => {
        const delays: number[] = [];
        const operation = jest.fn().mockRejectedValue(new Error('Always fails'));

        const onRetry = jest.fn((_attempt, _error, delayMs) => {
          delays.push(delayMs);
        });

        await expect(
          retryWithBackoff(operation, {
            maxRetries: 3,
            initialDelayMs: 100,
            backoffMultiplier: 2,
            onRetry,
          })
        ).rejects.toThrow(RetryExhaustedError);

        // Delays should be: 100, 200, 400
        expect(delays).toEqual([100, 200, 400]);
      });

      it('should call onRetry callback for each retry', async () => {
        const onRetry = jest.fn();
        const error = new Error('Test error');
        const operation = jest.fn().mockRejectedValue(error);

        await expect(
          retryWithBackoff(operation, { maxRetries: 2, onRetry })
        ).rejects.toThrow(RetryExhaustedError);

        expect(onRetry).toHaveBeenCalledTimes(2);
        expect(onRetry).toHaveBeenNthCalledWith(1, 1, error, expect.any(Number));
        expect(onRetry).toHaveBeenNthCalledWith(2, 2, error, expect.any(Number));
      });
    });

    describe('error handling', () => {
      it('should throw RetryExhaustedError after all retries fail', async () => {
        const originalError = new Error('Original error');
        const operation = jest.fn().mockRejectedValue(originalError);

        try {
          await retryWithBackoff(operation, { maxRetries: 2 });
          fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(RetryExhaustedError);
          const retryError = error as RetryExhaustedError;
          expect(retryError.originalError).toBe(originalError);
          expect(retryError.attempts).toBe(3); // 1 initial + 2 retries
          expect(retryError.totalTimeMs).toBeGreaterThan(0);
        }
      });

      it('should include error message in RetryExhaustedError', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Specific error'));

        await expect(retryWithBackoff(operation)).rejects.toThrow(
          /Specific error/
        );
      });

      it('should stop retrying on non-retryable errors', async () => {
        const nonRetryableError = new Error('Non-retryable');
        const operation = jest.fn().mockRejectedValue(nonRetryableError);
        const isRetryable = jest.fn().mockReturnValue(false);

        await expect(
          retryWithBackoff(operation, { isRetryable })
        ).rejects.toThrow(RetryExhaustedError);

        // Should only try once since error is not retryable
        expect(operation).toHaveBeenCalledTimes(1);
        expect(isRetryable).toHaveBeenCalledWith(nonRetryableError);
      });

      it('should log error when all retries exhausted', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Test error'));

        await expect(
          retryWithBackoff(operation, { context: 'test-context' })
        ).rejects.toThrow();

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[test-context]')
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('All 3 retries exhausted')
        );
      });
    });

    describe('custom options', () => {
      it('should use custom initialDelayMs', async () => {
        const delays: number[] = [];
        const operation = jest.fn().mockRejectedValue(new Error('Fail'));
        const onRetry = (_: number, __: any, delayMs: number) => delays.push(delayMs);

        await expect(
          retryWithBackoff(operation, {
            maxRetries: 2,
            initialDelayMs: 50,
            backoffMultiplier: 2,
            onRetry,
          })
        ).rejects.toThrow();

        expect(delays).toEqual([50, 100]);
      });

      it('should use custom backoffMultiplier', async () => {
        const delays: number[] = [];
        const operation = jest.fn().mockRejectedValue(new Error('Fail'));
        const onRetry = (_: number, __: any, delayMs: number) => delays.push(delayMs);

        await expect(
          retryWithBackoff(operation, {
            maxRetries: 3,
            initialDelayMs: 100,
            backoffMultiplier: 3,
            onRetry,
          })
        ).rejects.toThrow();

        // 100, 300, 900
        expect(delays).toEqual([100, 300, 900]);
      });

      it('should use custom isRetryable predicate', async () => {
        const retryableError = { code: 'ECONNRESET' };
        const nonRetryableError = { code: 'INVALID_INPUT' };
        
        const isRetryable = (error: any) => error.code === 'ECONNRESET';
        
        const operation = jest.fn()
          .mockRejectedValueOnce(retryableError)
          .mockRejectedValueOnce(nonRetryableError);

        await expect(
          retryWithBackoff(operation, { isRetryable })
        ).rejects.toThrow();

        // Should retry after ECONNRESET, then stop on INVALID_INPUT
        expect(operation).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('retryWithBackoffDetailed', () => {
    it('should return result with metadata on success', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await retryWithBackoffDetailed(operation);

      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track attempts correctly after retries', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const result = await retryWithBackoffDetailed(operation);

      expect(result.result).toBe('success');
      expect(result.attempts).toBe(3);
      expect(result.totalTimeMs).toBeGreaterThan(0);
    });

    it('should throw RetryExhaustedError with correct metadata', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Always fails'));

      try {
        await retryWithBackoffDetailed(operation, { maxRetries: 2 });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RetryExhaustedError);
        const retryError = error as RetryExhaustedError;
        expect(retryError.attempts).toBe(3);
        expect(retryError.totalTimeMs).toBeGreaterThan(0);
      }
    });
  });

  describe('calculateBackoffDelay', () => {
    it('should calculate correct delays for default multiplier', () => {
      expect(calculateBackoffDelay(1, 100, 2)).toBe(100);
      expect(calculateBackoffDelay(2, 100, 2)).toBe(200);
      expect(calculateBackoffDelay(3, 100, 2)).toBe(400);
      expect(calculateBackoffDelay(4, 100, 2)).toBe(800);
    });

    it('should calculate correct delays for custom multiplier', () => {
      expect(calculateBackoffDelay(1, 100, 3)).toBe(100);
      expect(calculateBackoffDelay(2, 100, 3)).toBe(300);
      expect(calculateBackoffDelay(3, 100, 3)).toBe(900);
    });

    it('should handle different initial delays', () => {
      expect(calculateBackoffDelay(1, 50, 2)).toBe(50);
      expect(calculateBackoffDelay(2, 50, 2)).toBe(100);
      expect(calculateBackoffDelay(3, 50, 2)).toBe(200);
    });
  });

  describe('RetryPredicates', () => {
    describe('isNetworkError', () => {
      it('should return true for network error codes', () => {
        expect(RetryPredicates.isNetworkError({ code: 'ECONNREFUSED' })).toBe(true);
        expect(RetryPredicates.isNetworkError({ code: 'ECONNRESET' })).toBe(true);
        expect(RetryPredicates.isNetworkError({ code: 'ETIMEDOUT' })).toBe(true);
        expect(RetryPredicates.isNetworkError({ code: 'ENOTFOUND' })).toBe(true);
        expect(RetryPredicates.isNetworkError({ code: 'ENETUNREACH' })).toBe(true);
        expect(RetryPredicates.isNetworkError({ code: 'EHOSTUNREACH' })).toBe(true);
        expect(RetryPredicates.isNetworkError({ code: 'EPIPE' })).toBe(true);
        expect(RetryPredicates.isNetworkError({ code: 'EAI_AGAIN' })).toBe(true);
      });

      it('should return true for network-related error messages', () => {
        expect(RetryPredicates.isNetworkError({ message: 'Network error' })).toBe(true);
        expect(RetryPredicates.isNetworkError({ message: 'Connection refused' })).toBe(true);
        expect(RetryPredicates.isNetworkError({ message: 'Request timeout' })).toBe(true);
        expect(RetryPredicates.isNetworkError({ message: 'Socket closed' })).toBe(true);
      });

      it('should return false for non-network errors', () => {
        expect(RetryPredicates.isNetworkError({ code: 'INVALID_INPUT' })).toBe(false);
        expect(RetryPredicates.isNetworkError({ message: 'Invalid data' })).toBe(false);
        expect(RetryPredicates.isNetworkError(new Error('Generic error'))).toBe(false);
      });

      it('should handle null/undefined errors', () => {
        expect(RetryPredicates.isNetworkError(null)).toBe(false);
        expect(RetryPredicates.isNetworkError(undefined)).toBe(false);
      });
    });

    describe('isDatabaseTransientError', () => {
      it('should return true for database connection errors', () => {
        expect(RetryPredicates.isDatabaseTransientError({ code: 'ECONNREFUSED' })).toBe(true);
        expect(RetryPredicates.isDatabaseTransientError({ code: 'ECONNRESET' })).toBe(true);
        expect(RetryPredicates.isDatabaseTransientError({ code: 'ETIMEDOUT' })).toBe(true);
      });

      it('should return true for MongoDB specific errors', () => {
        expect(RetryPredicates.isDatabaseTransientError({ name: 'MongoNetworkError' })).toBe(true);
        expect(RetryPredicates.isDatabaseTransientError({ name: 'MongoServerSelectionError' })).toBe(true);
        expect(RetryPredicates.isDatabaseTransientError({ name: 'MongoTimeoutError' })).toBe(true);
      });

      it('should return true for Redis LOADING error', () => {
        expect(RetryPredicates.isDatabaseTransientError({ 
          name: 'ReplyError', 
          message: 'LOADING Redis is loading the dataset in memory' 
        })).toBe(true);
      });

      it('should return false for non-transient database errors', () => {
        expect(RetryPredicates.isDatabaseTransientError({ code: 'DUPLICATE_KEY' })).toBe(false);
        expect(RetryPredicates.isDatabaseTransientError({ name: 'ValidationError' })).toBe(false);
      });
    });

    describe('isHttpTransientError', () => {
      it('should return true for 5xx errors', () => {
        expect(RetryPredicates.isHttpTransientError({ status: 500 })).toBe(true);
        expect(RetryPredicates.isHttpTransientError({ status: 502 })).toBe(true);
        expect(RetryPredicates.isHttpTransientError({ status: 503 })).toBe(true);
        expect(RetryPredicates.isHttpTransientError({ statusCode: 504 })).toBe(true);
        expect(RetryPredicates.isHttpTransientError({ response: { status: 500 } })).toBe(true);
      });

      it('should return true for 429 Too Many Requests', () => {
        expect(RetryPredicates.isHttpTransientError({ status: 429 })).toBe(true);
      });

      it('should return true for 408 Request Timeout', () => {
        expect(RetryPredicates.isHttpTransientError({ status: 408 })).toBe(true);
      });

      it('should return false for 4xx client errors (except 408, 429)', () => {
        expect(RetryPredicates.isHttpTransientError({ status: 400 })).toBe(false);
        expect(RetryPredicates.isHttpTransientError({ status: 401 })).toBe(false);
        expect(RetryPredicates.isHttpTransientError({ status: 403 })).toBe(false);
        expect(RetryPredicates.isHttpTransientError({ status: 404 })).toBe(false);
      });

      it('should return false for 2xx success codes', () => {
        expect(RetryPredicates.isHttpTransientError({ status: 200 })).toBe(false);
        expect(RetryPredicates.isHttpTransientError({ status: 201 })).toBe(false);
      });
    });

    describe('any', () => {
      it('should return true if any predicate returns true', () => {
        const combined = RetryPredicates.any(
          () => false,
          () => true,
          () => false
        );
        expect(combined({})).toBe(true);
      });

      it('should return false if all predicates return false', () => {
        const combined = RetryPredicates.any(
          () => false,
          () => false
        );
        expect(combined({})).toBe(false);
      });
    });

    describe('all', () => {
      it('should return true if all predicates return true', () => {
        const combined = RetryPredicates.all(
          () => true,
          () => true
        );
        expect(combined({})).toBe(true);
      });

      it('should return false if any predicate returns false', () => {
        const combined = RetryPredicates.all(
          () => true,
          () => false,
          () => true
        );
        expect(combined({})).toBe(false);
      });
    });

    describe('always and never', () => {
      it('always should return true', () => {
        expect(RetryPredicates.always()).toBe(true);
      });

      it('never should return false', () => {
        expect(RetryPredicates.never()).toBe(false);
      });
    });
  });

  describe('RetryExhaustedError', () => {
    it('should have correct name', () => {
      const error = new RetryExhaustedError('Test', new Error('Original'), 3, 1000);
      expect(error.name).toBe('RetryExhaustedError');
    });

    it('should preserve original error', () => {
      const originalError = new Error('Original error');
      const error = new RetryExhaustedError('Test', originalError, 3, 1000);
      expect(error.originalError).toBe(originalError);
    });

    it('should include attempts count', () => {
      const error = new RetryExhaustedError('Test', new Error('Original'), 5, 1000);
      expect(error.attempts).toBe(5);
    });

    it('should include total time', () => {
      const error = new RetryExhaustedError('Test', new Error('Original'), 3, 1500);
      expect(error.totalTimeMs).toBe(1500);
    });

    it('should be instanceof Error', () => {
      const error = new RetryExhaustedError('Test', new Error('Original'), 3, 1000);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('timing behavior', () => {
    it('should wait between retries', async () => {
      const startTime = Date.now();
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      await retryWithBackoff(operation, {
        initialDelayMs: 50,
        backoffMultiplier: 1,
      });

      const elapsed = Date.now() - startTime;
      // Should have waited at least 50ms for the retry
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow small timing variance
    });

    it('should accumulate delays with exponential backoff', async () => {
      const startTime = Date.now();
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      await retryWithBackoff(operation, {
        initialDelayMs: 50,
        backoffMultiplier: 2,
      });

      const elapsed = Date.now() - startTime;
      // Should have waited 50ms + 100ms = 150ms minimum
      expect(elapsed).toBeGreaterThanOrEqual(140); // Allow small timing variance
    });
  });

  describe('edge cases', () => {
    it('should handle maxRetries of 0', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      await expect(
        retryWithBackoff(operation, { maxRetries: 0 })
      ).rejects.toThrow(RetryExhaustedError);

      // Only initial attempt, no retries
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle operation that throws non-Error objects', async () => {
      const operation = jest.fn().mockRejectedValue('string error');

      await expect(retryWithBackoff(operation)).rejects.toThrow(RetryExhaustedError);
    });

    it('should handle operation that throws null', async () => {
      const operation = jest.fn().mockRejectedValue(null);

      await expect(retryWithBackoff(operation)).rejects.toThrow(RetryExhaustedError);
    });

    it('should handle async operation that takes time', async () => {
      let callCount = 0;
      const operation = jest.fn(async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 10));
        if (callCount < 2) {
          throw new Error('Fail');
        }
        return 'success';
      });

      const result = await retryWithBackoff(operation, { initialDelayMs: 10 });
      expect(result).toBe('success');
    });
  });
});
