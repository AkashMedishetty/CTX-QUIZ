/**
 * Retry Utility with Exponential Backoff
 * 
 * Provides a reusable retry mechanism for transient failures:
 * - Configurable max retries (default: 3)
 * - Exponential backoff between retries (e.g., 100ms, 200ms, 400ms)
 * - Ability to specify which errors are retryable
 * - Logging of retry attempts with context
 * - Returns the result on success or throws after max retries
 * 
 * Requirements: 17.5
 */

/**
 * Options for configuring retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds before first retry (default: 100) */
  initialDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Function to determine if an error is retryable (default: all errors are retryable) */
  isRetryable?: (error: any) => boolean;
  /** Callback function called on each retry attempt */
  onRetry?: (attempt: number, error: any, delayMs: number) => void;
  /** Optional context string for logging */
  context?: string;
}

/**
 * Result of a retry operation including metadata
 */
export interface RetryResult<T> {
  /** The result of the successful operation */
  result: T;
  /** Number of attempts made (1 = success on first try) */
  attempts: number;
  /** Total time spent including delays (in milliseconds) */
  totalTimeMs: number;
}

/**
 * Error thrown when all retry attempts are exhausted
 */
export class RetryExhaustedError extends Error {
  /** The original error that caused the final failure */
  public readonly originalError: any;
  /** Number of attempts made before giving up */
  public readonly attempts: number;
  /** Total time spent on all attempts (in milliseconds) */
  public readonly totalTimeMs: number;

  constructor(message: string, originalError: any, attempts: number, totalTimeMs: number) {
    super(message);
    this.name = 'RetryExhaustedError';
    this.originalError = originalError;
    this.attempts = attempts;
    this.totalTimeMs = totalTimeMs;
    
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RetryExhaustedError);
    }
  }
}

/**
 * Default options for retry behavior
 */
const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'context'>> = {
  maxRetries: 3,
  initialDelayMs: 100,
  backoffMultiplier: 2,
  isRetryable: () => true,
};

/**
 * Default retry callback that logs retry attempts
 */
const defaultOnRetry = (context: string) => (attempt: number, error: any, delayMs: number): void => {
  const errorMessage = error?.message || String(error);
  console.log(
    `[Retry] ${context ? `[${context}] ` : ''}Attempt ${attempt} failed: ${errorMessage}. ` +
    `Retrying in ${delayMs}ms...`
  );
};

/**
 * Sleep for a specified number of milliseconds
 * @param ms - Number of milliseconds to sleep
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Calculate the delay for a given retry attempt using exponential backoff
 * @param attempt - The current attempt number (1-indexed)
 * @param initialDelayMs - The initial delay in milliseconds
 * @param backoffMultiplier - The multiplier for exponential backoff
 * @returns The delay in milliseconds
 */
export const calculateBackoffDelay = (
  attempt: number,
  initialDelayMs: number,
  backoffMultiplier: number
): number => {
  // Exponential backoff: delay = initialDelay * multiplier^(attempt-1)
  // For attempt 1: 100ms, attempt 2: 200ms, attempt 3: 400ms (with defaults)
  return Math.floor(initialDelayMs * Math.pow(backoffMultiplier, attempt - 1));
};

/**
 * Execute an async operation with retry logic and exponential backoff
 * 
 * @param operation - The async operation to execute
 * @param options - Configuration options for retry behavior
 * @returns The result of the successful operation
 * @throws RetryExhaustedError if all retry attempts fail
 * 
 * @example
 * ```typescript
 * // Basic usage with defaults (3 retries, 100ms initial delay)
 * const result = await retryWithBackoff(() => fetchData());
 * 
 * // Custom configuration
 * const result = await retryWithBackoff(
 *   () => saveToDatabase(data),
 *   {
 *     maxRetries: 5,
 *     initialDelayMs: 200,
 *     isRetryable: (error) => error.code === 'ECONNRESET',
 *     onRetry: (attempt, error, delay) => {
 *       logger.warn(`Retry ${attempt}: ${error.message}`);
 *     },
 *     context: 'saveToDatabase'
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const {
    maxRetries,
    initialDelayMs,
    backoffMultiplier,
    isRetryable,
  } = { ...DEFAULT_OPTIONS, ...options };

  const context = options?.context || 'operation';
  const onRetry = options?.onRetry || defaultOnRetry(context);

  const startTime = Date.now();
  let lastError: any;
  let attempt = 0;

  // Try the operation up to maxRetries + 1 times (initial attempt + retries)
  while (attempt <= maxRetries) {
    attempt++;

    try {
      const result = await operation();
      
      // Log success if we had to retry
      if (attempt > 1) {
        const totalTimeMs = Date.now() - startTime;
        console.log(
          `[Retry] ${context ? `[${context}] ` : ''}Succeeded on attempt ${attempt} ` +
          `after ${totalTimeMs}ms total`
        );
      }
      
      return result;
    } catch (error: any) {
      lastError = error;

      // Check if we've exhausted all retries
      if (attempt > maxRetries) {
        break;
      }

      // Check if the error is retryable
      if (!isRetryable(error)) {
        const totalTimeMs = Date.now() - startTime;
        console.log(
          `[Retry] ${context ? `[${context}] ` : ''}Non-retryable error on attempt ${attempt}: ` +
          `${error?.message || String(error)}`
        );
        throw new RetryExhaustedError(
          `Non-retryable error after ${attempt} attempt(s): ${error?.message || String(error)}`,
          error,
          attempt,
          totalTimeMs
        );
      }

      // Calculate delay for this retry
      const delayMs = calculateBackoffDelay(attempt, initialDelayMs, backoffMultiplier);

      // Call the onRetry callback
      onRetry(attempt, error, delayMs);

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // All retries exhausted
  const totalTimeMs = Date.now() - startTime;
  const errorMessage = lastError?.message || String(lastError);
  
  console.error(
    `[Retry] ${context ? `[${context}] ` : ''}All ${maxRetries} retries exhausted. ` +
    `Final error: ${errorMessage}. Total time: ${totalTimeMs}ms`
  );

  throw new RetryExhaustedError(
    `Operation failed after ${attempt} attempt(s): ${errorMessage}`,
    lastError,
    attempt,
    totalTimeMs
  );
}

/**
 * Execute an async operation with retry logic and return detailed result
 * 
 * Similar to retryWithBackoff but returns metadata about the retry process
 * 
 * @param operation - The async operation to execute
 * @param options - Configuration options for retry behavior
 * @returns Object containing the result and retry metadata
 * @throws RetryExhaustedError if all retry attempts fail
 */
export async function retryWithBackoffDetailed<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  
  const {
    maxRetries,
    initialDelayMs,
    backoffMultiplier,
    isRetryable,
  } = { ...DEFAULT_OPTIONS, ...options };

  const context = options?.context || 'operation';
  const onRetry = options?.onRetry || defaultOnRetry(context);

  let lastError: any;
  let attempt = 0;

  while (attempt <= maxRetries) {
    attempt++;

    try {
      const result = await operation();
      const totalTimeMs = Date.now() - startTime;
      
      return {
        result,
        attempts: attempt,
        totalTimeMs,
      };
    } catch (error: any) {
      lastError = error;

      if (attempt > maxRetries) {
        break;
      }

      if (!isRetryable(error)) {
        const totalTimeMs = Date.now() - startTime;
        throw new RetryExhaustedError(
          `Non-retryable error after ${attempt} attempt(s): ${error?.message || String(error)}`,
          error,
          attempt,
          totalTimeMs
        );
      }

      const delayMs = calculateBackoffDelay(attempt, initialDelayMs, backoffMultiplier);
      onRetry(attempt, error, delayMs);
      await sleep(delayMs);
    }
  }

  const totalTimeMs = Date.now() - startTime;
  throw new RetryExhaustedError(
    `Operation failed after ${attempt} attempt(s): ${lastError?.message || String(lastError)}`,
    lastError,
    attempt,
    totalTimeMs
  );
}

/**
 * Common error predicates for determining if an error is retryable
 */
export const RetryPredicates = {
  /**
   * Check if error is a network-related transient error
   */
  isNetworkError: (error: any): boolean => {
    const networkErrorCodes = [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'EPIPE',
      'EAI_AGAIN',
    ];

    if (error?.code && networkErrorCodes.includes(error.code)) {
      return true;
    }

    const errorMessage = (error?.message || '').toLowerCase();
    const networkPatterns = [
      'network',
      'connection',
      'timeout',
      'socket',
      'econnrefused',
      'econnreset',
    ];

    return networkPatterns.some(pattern => errorMessage.includes(pattern));
  },

  /**
   * Check if error is a database-related transient error
   */
  isDatabaseTransientError: (error: any): boolean => {
    const transientCodes = [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
    ];

    if (error?.code && transientCodes.includes(error.code)) {
      return true;
    }

    // MongoDB specific transient errors
    if (error?.name === 'MongoNetworkError' ||
        error?.name === 'MongoServerSelectionError' ||
        error?.name === 'MongoTimeoutError') {
      return true;
    }

    // Redis specific transient errors
    if (error?.name === 'ReplyError' && error?.message?.includes('LOADING')) {
      return true;
    }

    return false;
  },

  /**
   * Check if error is an HTTP transient error (5xx or specific 4xx)
   */
  isHttpTransientError: (error: any): boolean => {
    const status = error?.status || error?.statusCode || error?.response?.status;
    
    // 5xx server errors are generally retryable
    if (status >= 500 && status < 600) {
      return true;
    }

    // 429 Too Many Requests is retryable
    if (status === 429) {
      return true;
    }

    // 408 Request Timeout is retryable
    if (status === 408) {
      return true;
    }

    return false;
  },

  /**
   * Combine multiple predicates with OR logic
   */
  any: (...predicates: Array<(error: any) => boolean>) => (error: any): boolean => {
    return predicates.some(predicate => predicate(error));
  },

  /**
   * Combine multiple predicates with AND logic
   */
  all: (...predicates: Array<(error: any) => boolean>) => (error: any): boolean => {
    return predicates.every(predicate => predicate(error));
  },

  /**
   * Always retry (default behavior)
   */
  always: (): boolean => true,

  /**
   * Never retry
   */
  never: (): boolean => false,
};
