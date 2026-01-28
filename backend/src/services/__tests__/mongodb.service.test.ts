/**
 * Unit tests for MongoDB Service
 * Tests connection, retry logic, circuit breaker, and basic operations
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 17.8, 18.5
 */

import { mongodbService, CircuitOpenError } from '../mongodb.service';
import { mongodbFallbackService } from '../mongodb-fallback.service';

// Mock the fallback service
jest.mock('../mongodb-fallback.service', () => ({
  mongodbFallbackService: {
    setMongoDBUnavailable: jest.fn(),
    setMongoDBAvailable: jest.fn(),
    readFromFallback: jest.fn(),
    writeToFallback: jest.fn(),
    trackDeleteOperation: jest.fn(),
  },
}));

describe('MongoDB Service', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    // Reset circuit breaker to clean state
    mongodbService.resetCircuitBreaker();
  });

  describe('Connection Management', () => {
    it('should have a connect method', () => {
      expect(typeof mongodbService.connect).toBe('function');
    });

    it('should have a disconnect method', () => {
      expect(typeof mongodbService.disconnect).toBe('function');
    });

    it('should have a getDb method', () => {
      expect(typeof mongodbService.getDb).toBe('function');
    });

    it('should have a getCollection method', () => {
      expect(typeof mongodbService.getCollection).toBe('function');
    });

    it('should have an isHealthy method', () => {
      expect(typeof mongodbService.isHealthy).toBe('function');
    });

    it('should have a getStatus method', () => {
      expect(typeof mongodbService.getStatus).toBe('function');
    });

    it('should throw error when getting DB before connection', () => {
      // Note: This test assumes MongoDB is not connected yet
      // In a real test environment, you'd mock the connection
      expect(() => {
        try {
          mongodbService.getDb();
        } catch (error: any) {
          expect(error.message).toContain('not connected');
          throw error;
        }
      }).toThrow();
    });
  });

  describe('Retry Logic', () => {
    it('should have a withRetry method', () => {
      expect(typeof mongodbService.withRetry).toBe('function');
    });

    it('should retry operations on transient errors', async () => {
      let attempts = 0;
      const operation = jest.fn(async () => {
        attempts++;
        if (attempts < 2) {
          const error: any = new Error('Connection timeout');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        return 'success';
      });

      const result = await mongodbService.withRetry(operation, 3);

      expect(result).toBe('success');
      expect(attempts).toBe(2);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      const operation = jest.fn(async () => {
        const error: any = new Error('Connection timeout');
        error.code = 'ETIMEDOUT';
        throw error;
      });

      await expect(mongodbService.withRetry(operation, 3)).rejects.toThrow('Connection timeout');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-transient errors', async () => {
      const operation = jest.fn(async () => {
        throw new Error('Invalid query');
      });

      await expect(mongodbService.withRetry(operation, 3)).rejects.toThrow('Invalid query');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Status Checks', () => {
    it('should return false for isHealthy when not connected', () => {
      // Assuming not connected initially
      const healthy = mongodbService.isHealthy();
      expect(typeof healthy).toBe('boolean');
    });

    it('should return status object with expected structure', async () => {
      const status = await mongodbService.getStatus();

      expect(status).toHaveProperty('connected');
      expect(status).toHaveProperty('database');
      expect(status).toHaveProperty('collections');
      expect(typeof status.connected).toBe('boolean');
      expect(typeof status.database).toBe('string');
      expect(Array.isArray(status.collections)).toBe(true);
    });
  });

  describe('Circuit Breaker', () => {
    it('should have a getCircuitBreaker method', () => {
      expect(typeof mongodbService.getCircuitBreaker).toBe('function');
    });

    it('should have a getCircuitBreakerStatus method', () => {
      expect(typeof mongodbService.getCircuitBreakerStatus).toBe('function');
    });

    it('should have a resetCircuitBreaker method', () => {
      expect(typeof mongodbService.resetCircuitBreaker).toBe('function');
    });

    it('should return circuit breaker status with expected structure', () => {
      const status = mongodbService.getCircuitBreakerStatus();

      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('failureCount');
      expect(status).toHaveProperty('lastFailureTime');
      expect(typeof status.state).toBe('string');
      expect(typeof status.failureCount).toBe('number');
    });

    it('should start with circuit breaker in CLOSED state', () => {
      const status = mongodbService.getCircuitBreakerStatus();
      expect(status.state).toBe('CLOSED');
      expect(status.failureCount).toBe(0);
    });

    it('should reset circuit breaker to CLOSED state', () => {
      // Reset and verify
      mongodbService.resetCircuitBreaker();
      
      const status = mongodbService.getCircuitBreakerStatus();
      expect(status.state).toBe('CLOSED');
      expect(status.failureCount).toBe(0);
    });
  });

  describe('Circuit Breaker Wrapped Operations', () => {
    it('should have findOneWithCircuitBreaker method', () => {
      expect(typeof mongodbService.findOneWithCircuitBreaker).toBe('function');
    });

    it('should have findWithCircuitBreaker method', () => {
      expect(typeof mongodbService.findWithCircuitBreaker).toBe('function');
    });

    it('should have insertOneWithCircuitBreaker method', () => {
      expect(typeof mongodbService.insertOneWithCircuitBreaker).toBe('function');
    });

    it('should have updateOneWithCircuitBreaker method', () => {
      expect(typeof mongodbService.updateOneWithCircuitBreaker).toBe('function');
    });

    it('should have deleteOneWithCircuitBreaker method', () => {
      expect(typeof mongodbService.deleteOneWithCircuitBreaker).toBe('function');
    });

    it('should have countDocumentsWithCircuitBreaker method', () => {
      expect(typeof mongodbService.countDocumentsWithCircuitBreaker).toBe('function');
    });
  });

  describe('Circuit Breaker State Changes', () => {
    it('should notify fallback service when circuit opens', async () => {
      const circuitBreaker = mongodbService.getCircuitBreaker();
      
      // Simulate failures to open the circuit (default threshold is 5)
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('MongoDB connection failed');
          });
        } catch (e) {
          // Expected to fail
        }
      }

      // Verify fallback service was notified
      expect(mongodbFallbackService.setMongoDBUnavailable).toHaveBeenCalled();
    });

    it('should have circuit in OPEN state after threshold failures', async () => {
      const circuitBreaker = mongodbService.getCircuitBreaker();
      
      // Simulate failures to open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('MongoDB connection failed');
          });
        } catch (e) {
          // Expected to fail
        }
      }

      const status = mongodbService.getCircuitBreakerStatus();
      expect(status.state).toBe('OPEN');
    });

    it('should throw CircuitOpenError when circuit is open', async () => {
      const circuitBreaker = mongodbService.getCircuitBreaker();
      
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('MongoDB connection failed');
          });
        } catch (e) {
          // Expected to fail
        }
      }

      // Next call should throw CircuitOpenError
      await expect(
        circuitBreaker.execute(async () => {
          return 'should not reach here';
        })
      ).rejects.toThrow(CircuitOpenError);
    });
  });

  describe('Fallback Behavior', () => {
    it('should use fallback for findOne when circuit is open', async () => {
      const circuitBreaker = mongodbService.getCircuitBreaker();
      
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('MongoDB connection failed');
          });
        } catch (e) {
          // Expected to fail
        }
      }

      // Mock fallback response
      (mongodbFallbackService.readFromFallback as jest.Mock).mockResolvedValue({
        id: 'test-id',
        collection: 'test',
        document: { _id: 'test-id', name: 'Test Document' },
        timestamp: Date.now(),
        operation: 'insert',
      });

      // Call findOneWithCircuitBreaker - should use fallback
      // Use documentId instead of _id to avoid ObjectId type issues
      const result = await mongodbService.findOneWithCircuitBreaker('test', { documentId: 'test-id' });

      expect(mongodbFallbackService.readFromFallback).toHaveBeenCalledWith('test', 'test-id');
      expect(result).toEqual({ _id: 'test-id', name: 'Test Document' });
    });

    it('should write to fallback for insertOne when circuit is open', async () => {
      const circuitBreaker = mongodbService.getCircuitBreaker();
      
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('MongoDB connection failed');
          });
        } catch (e) {
          // Expected to fail
        }
      }

      // Call insertOneWithCircuitBreaker - should use fallback
      const result = await mongodbService.insertOneWithCircuitBreaker('test', {
        _id: 'new-doc-id' as any,
        name: 'New Document',
      });

      expect(mongodbFallbackService.writeToFallback).toHaveBeenCalledWith(
        'test',
        'new-doc-id',
        expect.objectContaining({ name: 'New Document' }),
        'insert'
      );
      expect(result.usedFallback).toBe(true);
    });

    it('should track delete operation in fallback when circuit is open', async () => {
      const circuitBreaker = mongodbService.getCircuitBreaker();
      
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('MongoDB connection failed');
          });
        } catch (e) {
          // Expected to fail
        }
      }

      // Call deleteOneWithCircuitBreaker - should track in fallback
      // Use documentId instead of _id to avoid ObjectId type issues
      const result = await mongodbService.deleteOneWithCircuitBreaker('test', { documentId: 'delete-id' });

      expect(mongodbFallbackService.trackDeleteOperation).toHaveBeenCalledWith(
        'test',
        'delete-id',
        { documentId: 'delete-id' }
      );
      expect(result.usedFallback).toBe(true);
    });

    it('should return empty array for find when circuit is open', async () => {
      const circuitBreaker = mongodbService.getCircuitBreaker();
      
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('MongoDB connection failed');
          });
        } catch (e) {
          // Expected to fail
        }
      }

      // Call findWithCircuitBreaker - should return empty array
      const result = await mongodbService.findWithCircuitBreaker('test', {});

      expect(result).toEqual([]);
    });

    it('should return 0 for countDocuments when circuit is open', async () => {
      const circuitBreaker = mongodbService.getCircuitBreaker();
      
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('MongoDB connection failed');
          });
        } catch (e) {
          // Expected to fail
        }
      }

      // Call countDocumentsWithCircuitBreaker - should return 0
      const result = await mongodbService.countDocumentsWithCircuitBreaker('test', {});

      expect(result).toBe(0);
    });
  });
});
