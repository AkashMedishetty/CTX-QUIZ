/**
 * Circuit Breaker Tests
 * 
 * Tests for circuit breaker pattern implementation:
 * - State transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
 * - Failure threshold enforcement
 * - Reset timeout behavior
 * - Event callbacks
 * - Error handling
 * 
 * Requirements: 17.8
 */

import {
  CircuitBreaker,
  CircuitOpenError,
  CircuitBreakerFactory,
} from '../circuit-breaker';

describe('CircuitBreaker', () => {
  // Mock console methods to capture logs
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.useFakeTimers();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    jest.useRealTimers();
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should start with zero failure count', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should start with null last failure time', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.getLastFailureTime()).toBeNull();
    });

    it('should use default name if not provided', () => {
      const breaker = new CircuitBreaker();
      expect(breaker.getName()).toBe('default');
    });

    it('should use provided name', () => {
      const breaker = new CircuitBreaker({ name: 'test-breaker' });
      expect(breaker.getName()).toBe('test-breaker');
    });
  });

  describe('CLOSED state behavior', () => {
    it('should allow operations in CLOSED state', async () => {
      const breaker = new CircuitBreaker();
      const operation = jest.fn().mockResolvedValue('success');

      const result = await breaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should pass through operation errors in CLOSED state', async () => {
      const breaker = new CircuitBreaker();
      const error = new Error('Operation failed');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(breaker.execute(operation)).rejects.toThrow('Operation failed');
    });

    it('should increment failure count on failure', async () => {
      const breaker = new CircuitBreaker();
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      await expect(breaker.execute(operation)).rejects.toThrow();

      expect(breaker.getFailureCount()).toBe(1);
    });

    it('should update last failure time on failure', async () => {
      const breaker = new CircuitBreaker();
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));
      const now = Date.now();

      await expect(breaker.execute(operation)).rejects.toThrow();

      expect(breaker.getLastFailureTime()).toBeGreaterThanOrEqual(now);
    });

    it('should reset failure count on success', async () => {
      const breaker = new CircuitBreaker();
      const failingOp = jest.fn().mockRejectedValue(new Error('Fail'));
      const successOp = jest.fn().mockResolvedValue('success');

      // Cause some failures
      await expect(breaker.execute(failingOp)).rejects.toThrow();
      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getFailureCount()).toBe(2);

      // Success should reset count
      await breaker.execute(successOp);
      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe('transition to OPEN state', () => {
    it('should open circuit after reaching failure threshold (default: 5)', async () => {
      const breaker = new CircuitBreaker();
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Cause 5 failures
      for (let i = 0; i < 5; i++) {
        await expect(breaker.execute(operation)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe('OPEN');
    });

    it('should open circuit after reaching custom failure threshold', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Cause 3 failures
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(operation)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe('OPEN');
    });

    it('should call onStateChange callback when opening', async () => {
      const onStateChange = jest.fn();
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        onStateChange,
      });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      await expect(breaker.execute(operation)).rejects.toThrow();
      await expect(breaker.execute(operation)).rejects.toThrow();

      expect(onStateChange).toHaveBeenCalledWith('CLOSED', 'OPEN');
    });

    it('should call onFailure callback on each failure', async () => {
      const onFailure = jest.fn();
      const breaker = new CircuitBreaker({ onFailure });
      const error = new Error('Test error');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(breaker.execute(operation)).rejects.toThrow();

      expect(onFailure).toHaveBeenCalledWith(error);
    });
  });

  describe('OPEN state behavior', () => {
    it('should reject operations immediately when OPEN', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });
      const failingOp = jest.fn().mockRejectedValue(new Error('Fail'));
      const successOp = jest.fn().mockResolvedValue('success');

      // Open the circuit
      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getState()).toBe('OPEN');

      // Should reject without calling operation
      await expect(breaker.execute(successOp)).rejects.toThrow(CircuitOpenError);
      expect(successOp).not.toHaveBeenCalled();
    });

    it('should throw CircuitOpenError with correct properties', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 30000,
        name: 'test-circuit',
      });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow();

      try {
        await breaker.execute(operation);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        const circuitError = error as CircuitOpenError;
        expect(circuitError.circuitName).toBe('test-circuit');
        expect(circuitError.retryAfterMs).toBeLessThanOrEqual(30000);
        expect(circuitError.retryAfterMs).toBeGreaterThan(0);
      }
    });

    it('should not increment failure count when OPEN', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow();
      await expect(breaker.execute(operation)).rejects.toThrow();
      expect(breaker.getFailureCount()).toBe(2);

      // Try again while OPEN
      await expect(breaker.execute(operation)).rejects.toThrow(CircuitOpenError);
      expect(breaker.getFailureCount()).toBe(2); // Should not increment
    });
  });

  describe('transition to HALF_OPEN state', () => {
    it('should transition to HALF_OPEN after reset timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 60000,
      });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow();
      expect(breaker.getState()).toBe('OPEN');

      // Advance time past reset timeout
      jest.advanceTimersByTime(60001);

      // Getting state should trigger transition
      expect(breaker.getState()).toBe('HALF_OPEN');
    });

    it('should allow one request through in HALF_OPEN state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 1000,
      });
      const failingOp = jest.fn().mockRejectedValue(new Error('Fail'));
      const successOp = jest.fn().mockResolvedValue('success');

      // Open the circuit
      await expect(breaker.execute(failingOp)).rejects.toThrow();

      // Advance time past reset timeout
      jest.advanceTimersByTime(1001);

      // Should allow the request through
      const result = await breaker.execute(successOp);
      expect(result).toBe('success');
      expect(successOp).toHaveBeenCalledTimes(1);
    });

    it('should call onStateChange when transitioning to HALF_OPEN', async () => {
      const onStateChange = jest.fn();
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        onStateChange,
      });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow();
      onStateChange.mockClear();

      // Advance time and check state
      jest.advanceTimersByTime(1001);
      breaker.getState();

      expect(onStateChange).toHaveBeenCalledWith('OPEN', 'HALF_OPEN');
    });
  });

  describe('HALF_OPEN state behavior', () => {
    it('should close circuit on success in HALF_OPEN state', async () => {
      const onStateChange = jest.fn();
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        onStateChange,
      });
      const failingOp = jest.fn().mockRejectedValue(new Error('Fail'));
      const successOp = jest.fn().mockResolvedValue('success');

      // Open the circuit
      await expect(breaker.execute(failingOp)).rejects.toThrow();

      // Advance time to HALF_OPEN
      jest.advanceTimersByTime(1001);
      onStateChange.mockClear();

      // Success should close the circuit
      await breaker.execute(successOp);

      expect(breaker.getState()).toBe('CLOSED');
      expect(onStateChange).toHaveBeenCalledWith('HALF_OPEN', 'CLOSED');
    });

    it('should reset failure count on success in HALF_OPEN state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 1000,
      });
      const failingOp = jest.fn().mockRejectedValue(new Error('Fail'));
      const successOp = jest.fn().mockResolvedValue('success');

      // Open the circuit
      await expect(breaker.execute(failingOp)).rejects.toThrow();
      await expect(breaker.execute(failingOp)).rejects.toThrow();
      expect(breaker.getFailureCount()).toBe(2);

      // Advance time to HALF_OPEN
      jest.advanceTimersByTime(1001);

      // Success should reset failure count
      await breaker.execute(successOp);
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should re-open circuit on failure in HALF_OPEN state', async () => {
      const onStateChange = jest.fn();
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        onStateChange,
      });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow();

      // Advance time to HALF_OPEN
      jest.advanceTimersByTime(1001);
      onStateChange.mockClear();

      // Failure should re-open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow();

      expect(breaker.getState()).toBe('OPEN');
      expect(onStateChange).toHaveBeenCalledWith('HALF_OPEN', 'OPEN');
    });

    it('should update last failure time on failure in HALF_OPEN state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 1000,
      });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow();
      const firstFailureTime = breaker.getLastFailureTime();

      // Advance time to HALF_OPEN
      jest.advanceTimersByTime(1001);

      // Failure should update last failure time
      await expect(breaker.execute(operation)).rejects.toThrow();
      const secondFailureTime = breaker.getLastFailureTime();

      expect(secondFailureTime).toBeGreaterThan(firstFailureTime!);
    });
  });

  describe('reset method', () => {
    it('should reset circuit to CLOSED state', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow();
      expect(breaker.getState()).toBe('OPEN');

      // Reset
      breaker.reset();

      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should reset failure count to zero', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 5 });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Cause some failures
      await expect(breaker.execute(operation)).rejects.toThrow();
      await expect(breaker.execute(operation)).rejects.toThrow();
      expect(breaker.getFailureCount()).toBe(2);

      // Reset
      breaker.reset();

      expect(breaker.getFailureCount()).toBe(0);
    });

    it('should reset last failure time to null', async () => {
      const breaker = new CircuitBreaker();
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Cause a failure
      await expect(breaker.execute(operation)).rejects.toThrow();
      expect(breaker.getLastFailureTime()).not.toBeNull();

      // Reset
      breaker.reset();

      expect(breaker.getLastFailureTime()).toBeNull();
    });

    it('should call onStateChange when resetting from non-CLOSED state', async () => {
      const onStateChange = jest.fn();
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        onStateChange,
      });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow();
      onStateChange.mockClear();

      // Reset
      breaker.reset();

      expect(onStateChange).toHaveBeenCalledWith('OPEN', 'CLOSED');
    });

    it('should not call onStateChange when already CLOSED', () => {
      const onStateChange = jest.fn();
      const breaker = new CircuitBreaker({ onStateChange });

      // Reset when already CLOSED
      breaker.reset();

      expect(onStateChange).not.toHaveBeenCalled();
    });
  });

  describe('callbacks', () => {
    it('should call onSuccess callback on successful operation', async () => {
      const onSuccess = jest.fn();
      const breaker = new CircuitBreaker({ onSuccess });
      const operation = jest.fn().mockResolvedValue('success');

      await breaker.execute(operation);

      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('should call onFailure callback on failed operation', async () => {
      const onFailure = jest.fn();
      const breaker = new CircuitBreaker({ onFailure });
      const error = new Error('Test error');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(breaker.execute(operation)).rejects.toThrow();

      expect(onFailure).toHaveBeenCalledWith(error);
    });

    it('should not call onFailure when circuit is OPEN', async () => {
      const onFailure = jest.fn();
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        onFailure,
      });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      await expect(breaker.execute(operation)).rejects.toThrow();
      onFailure.mockClear();

      // Try again while OPEN
      await expect(breaker.execute(operation)).rejects.toThrow(CircuitOpenError);

      expect(onFailure).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle failureThreshold of 1', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      await expect(breaker.execute(operation)).rejects.toThrow();

      expect(breaker.getState()).toBe('OPEN');
    });

    it('should handle very short reset timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 1,
      });
      const failingOp = jest.fn().mockRejectedValue(new Error('Fail'));
      const successOp = jest.fn().mockResolvedValue('success');

      // Open the circuit
      await expect(breaker.execute(failingOp)).rejects.toThrow();

      // Advance time just past timeout
      jest.advanceTimersByTime(2);

      // Should be able to execute
      const result = await breaker.execute(successOp);
      expect(result).toBe('success');
    });

    it('should handle operation that throws non-Error objects', async () => {
      const breaker = new CircuitBreaker();
      const operation = jest.fn().mockRejectedValue('string error');

      await expect(breaker.execute(operation)).rejects.toBe('string error');
      expect(breaker.getFailureCount()).toBe(1);
    });

    it('should handle operation that throws null', async () => {
      const breaker = new CircuitBreaker();
      const operation = jest.fn().mockRejectedValue(null);

      await expect(breaker.execute(operation)).rejects.toBeNull();
      expect(breaker.getFailureCount()).toBe(1);
    });

    it('should handle async operations that take time', async () => {
      const breaker = new CircuitBreaker();
      const operation = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      });

      jest.useRealTimers(); // Need real timers for this test
      const result = await breaker.execute(operation);
      expect(result).toBe('success');
      jest.useFakeTimers();
    });

    it('should handle multiple concurrent operations', async () => {
      const breaker = new CircuitBreaker();
      const operation = jest.fn().mockResolvedValue('success');

      const results = await Promise.all([
        breaker.execute(operation),
        breaker.execute(operation),
        breaker.execute(operation),
      ]);

      expect(results).toEqual(['success', 'success', 'success']);
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('logging', () => {
    it('should log state changes', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        name: 'test-log',
      });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      await expect(breaker.execute(operation)).rejects.toThrow();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CircuitBreaker] [test-log] State changed: CLOSED → OPEN')
      );
    });

    it('should log failures with context', async () => {
      const breaker = new CircuitBreaker({ name: 'test-log' });
      const operation = jest.fn().mockRejectedValue(new Error('Test error message'));

      await expect(breaker.execute(operation)).rejects.toThrow();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test error message')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failures: 1/5')
      );
    });
  });
});

describe('CircuitOpenError', () => {
  it('should have correct name', () => {
    const error = new CircuitOpenError('test', 1000);
    expect(error.name).toBe('CircuitOpenError');
  });

  it('should include circuit name', () => {
    const error = new CircuitOpenError('my-circuit', 1000);
    expect(error.circuitName).toBe('my-circuit');
  });

  it('should include retry after time', () => {
    const error = new CircuitOpenError('test', 5000);
    expect(error.retryAfterMs).toBe(5000);
  });

  it('should have descriptive message', () => {
    const error = new CircuitOpenError('my-circuit', 5000);
    expect(error.message).toContain('my-circuit');
    expect(error.message).toContain('OPEN');
    expect(error.message).toContain('5000ms');
  });

  it('should be instanceof Error', () => {
    const error = new CircuitOpenError('test', 1000);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('CircuitBreakerFactory', () => {
  describe('forDatabase', () => {
    it('should create breaker with database defaults', () => {
      const breaker = CircuitBreakerFactory.forDatabase('mongodb');
      expect(breaker.getName()).toBe('db-mongodb');
    });

    it('should allow custom options', async () => {
      const onStateChange = jest.fn();
      const breaker = CircuitBreakerFactory.forDatabase('mongodb', {
        failureThreshold: 2,
        onStateChange,
      });
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      await expect(breaker.execute(operation)).rejects.toThrow();
      await expect(breaker.execute(operation)).rejects.toThrow();

      expect(breaker.getState()).toBe('OPEN');
      expect(onStateChange).toHaveBeenCalled();
    });
  });

  describe('forExternalApi', () => {
    it('should create breaker with API defaults', () => {
      const breaker = CircuitBreakerFactory.forExternalApi('weather');
      expect(breaker.getName()).toBe('api-weather');
    });

    it('should have lower failure threshold', async () => {
      const breaker = CircuitBreakerFactory.forExternalApi('weather');
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Should open after 3 failures (default for API)
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(operation)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe('OPEN');
    });
  });

  describe('forCache', () => {
    it('should create breaker with cache defaults', () => {
      const breaker = CircuitBreakerFactory.forCache('redis');
      expect(breaker.getName()).toBe('cache-redis');
    });

    it('should have very low failure threshold', async () => {
      const breaker = CircuitBreakerFactory.forCache('redis');
      const operation = jest.fn().mockRejectedValue(new Error('Fail'));

      // Should open after 2 failures (default for cache)
      for (let i = 0; i < 2; i++) {
        await expect(breaker.execute(operation)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe('OPEN');
    });
  });
});
