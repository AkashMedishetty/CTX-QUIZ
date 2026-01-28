/**
 * Circuit Breaker Pattern Implementation
 * 
 * Provides a circuit breaker to prevent cascading failures:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is tripped, requests fail immediately
 * - HALF_OPEN: Testing if service recovered, allow one request through
 * 
 * The circuit opens after a threshold of failures (default: 5)
 * and closes after a timeout period (default: 60 seconds).
 * 
 * Requirements: 17.8
 */

/**
 * Circuit breaker states
 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Options for configuring circuit breaker behavior
 */
export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Time in milliseconds before attempting to close the circuit (default: 60000) */
  resetTimeoutMs?: number;
  /** Callback when state changes */
  onStateChange?: (from: CircuitBreakerState, to: CircuitBreakerState) => void;
  /** Callback when an operation fails */
  onFailure?: (error: any) => void;
  /** Callback when an operation succeeds */
  onSuccess?: () => void;
  /** Optional name for logging purposes */
  name?: string;
}

/**
 * Error thrown when the circuit is open
 */
export class CircuitOpenError extends Error {
  /** The name of the circuit breaker */
  public readonly circuitName: string;
  /** Time remaining until the circuit may close (in milliseconds) */
  public readonly retryAfterMs: number;

  constructor(circuitName: string, retryAfterMs: number) {
    super(`Circuit breaker "${circuitName}" is OPEN. Retry after ${retryAfterMs}ms.`);
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;
    this.retryAfterMs = retryAfterMs;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CircuitOpenError);
    }
  }
}

/**
 * Default options for circuit breaker behavior
 */
const DEFAULT_OPTIONS: Required<Omit<CircuitBreakerOptions, 'onStateChange' | 'onFailure' | 'onSuccess' | 'name'>> = {
  failureThreshold: 5,
  resetTimeoutMs: 60000, // 60 seconds
};

/**
 * Circuit Breaker class for preventing cascading failures
 * 
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   resetTimeoutMs: 60000,
 *   onStateChange: (from, to) => console.log(`Circuit changed from ${from} to ${to}`),
 *   name: 'mongodb'
 * });
 * 
 * try {
 *   const result = await breaker.execute(() => fetchFromDatabase());
 * } catch (error) {
 *   if (error instanceof CircuitOpenError) {
 *     // Circuit is open, use fallback
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount: number = 0;
  private lastFailureTime: number | null = null;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly onStateChange?: (from: CircuitBreakerState, to: CircuitBreakerState) => void;
  private readonly onFailure?: (error: any) => void;
  private readonly onSuccess?: () => void;
  private readonly name: string;

  constructor(options?: CircuitBreakerOptions) {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    this.failureThreshold = mergedOptions.failureThreshold;
    this.resetTimeoutMs = mergedOptions.resetTimeoutMs;
    this.onStateChange = options?.onStateChange;
    this.onFailure = options?.onFailure;
    this.onSuccess = options?.onSuccess;
    this.name = options?.name || 'default';
  }

  /**
   * Execute an operation through the circuit breaker
   * 
   * @param operation - The async operation to execute
   * @returns The result of the operation
   * @throws CircuitOpenError if the circuit is open
   * @throws The original error if the operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we should allow the request
    if (!this.canExecute()) {
      const retryAfterMs = this.getRetryAfterMs();
      throw new CircuitOpenError(this.name, retryAfterMs);
    }

    try {
      const result = await operation();
      this.handleSuccess();
      return result;
    } catch (error) {
      this.handleFailure(error);
      throw error;
    }
  }

  /**
   * Get the current state of the circuit breaker
   */
  getState(): CircuitBreakerState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN' && this.shouldAttemptReset()) {
      this.transitionTo('HALF_OPEN');
    }
    return this.state;
  }

  /**
   * Get the current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Get the last failure time (Unix timestamp in ms)
   */
  getLastFailureTime(): number | null {
    return this.lastFailureTime;
  }

  /**
   * Get the name of the circuit breaker
   */
  getName(): string {
    return this.name;
  }

  /**
   * Reset the circuit breaker to its initial state
   */
  reset(): void {
    const previousState = this.state;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;

    if (previousState !== 'CLOSED') {
      this.logStateChange(previousState, 'CLOSED');
      this.onStateChange?.(previousState, 'CLOSED');
    }
  }

  /**
   * Check if the circuit breaker allows execution
   */
  private canExecute(): boolean {
    switch (this.state) {
      case 'CLOSED':
        return true;
      case 'OPEN':
        // Check if timeout has passed
        if (this.shouldAttemptReset()) {
          this.transitionTo('HALF_OPEN');
          return true;
        }
        return false;
      case 'HALF_OPEN':
        // Allow one request through to test the service
        return true;
      default:
        return false;
    }
  }

  /**
   * Check if enough time has passed to attempt a reset
   */
  private shouldAttemptReset(): boolean {
    if (this.lastFailureTime === null) {
      return false;
    }
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure >= this.resetTimeoutMs;
  }

  /**
   * Get the time remaining until the circuit may close
   */
  private getRetryAfterMs(): number {
    if (this.lastFailureTime === null) {
      return 0;
    }
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return Math.max(0, this.resetTimeoutMs - timeSinceLastFailure);
  }

  /**
   * Handle a successful operation
   */
  private handleSuccess(): void {
    // Call success callback
    this.onSuccess?.();

    if (this.state === 'HALF_OPEN') {
      // Service has recovered, close the circuit
      this.transitionTo('CLOSED');
      this.failureCount = 0;
      this.lastFailureTime = null;
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }

    this.logSuccess();
  }

  /**
   * Handle a failed operation
   */
  private handleFailure(error: any): void {
    // Call failure callback
    this.onFailure?.(error);

    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Service is still failing, re-open the circuit
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      // Threshold reached, open the circuit
      this.transitionTo('OPEN');
    }

    this.logFailure(error);
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitBreakerState): void {
    if (this.state === newState) {
      return;
    }

    const previousState = this.state;
    this.state = newState;

    this.logStateChange(previousState, newState);
    this.onStateChange?.(previousState, newState);
  }

  /**
   * Log a state change
   */
  private logStateChange(from: CircuitBreakerState, to: CircuitBreakerState): void {
    console.log(
      `[CircuitBreaker] [${this.name}] State changed: ${from} → ${to}` +
      (to === 'OPEN' ? ` (failures: ${this.failureCount})` : '')
    );
  }

  /**
   * Log a successful operation
   */
  private logSuccess(): void {
    if (this.state === 'CLOSED' && this.failureCount === 0) {
      // Don't log every success in normal operation
      return;
    }
    console.log(
      `[CircuitBreaker] [${this.name}] Operation succeeded. State: ${this.state}`
    );
  }

  /**
   * Log a failed operation
   */
  private logFailure(error: any): void {
    const errorMessage = error?.message || String(error);
    console.log(
      `[CircuitBreaker] [${this.name}] Operation failed: ${errorMessage}. ` +
      `Failures: ${this.failureCount}/${this.failureThreshold}. State: ${this.state}`
    );
  }
}

/**
 * Create a circuit breaker with common configurations
 */
export const CircuitBreakerFactory = {
  /**
   * Create a circuit breaker for database operations
   * - Higher failure threshold (5)
   * - Longer reset timeout (60 seconds)
   */
  forDatabase: (name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker => {
    return new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60000,
      name: `db-${name}`,
      ...options,
    });
  },

  /**
   * Create a circuit breaker for external API calls
   * - Lower failure threshold (3)
   * - Shorter reset timeout (30 seconds)
   */
  forExternalApi: (name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker => {
    return new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 30000,
      name: `api-${name}`,
      ...options,
    });
  },

  /**
   * Create a circuit breaker for cache operations
   * - Very low failure threshold (2)
   * - Short reset timeout (10 seconds)
   */
  forCache: (name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker => {
    return new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 10000,
      name: `cache-${name}`,
      ...options,
    });
  },
};
