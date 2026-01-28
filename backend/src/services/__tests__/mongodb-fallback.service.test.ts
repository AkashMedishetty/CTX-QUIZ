/**
 * Unit tests for MongoDB Fallback Service
 * Tests fallback behavior when MongoDB is unavailable
 * 
 * Requirements: 17.2
 */

import { mongodbFallbackService, PendingWrite, FallbackDocument } from '../mongodb-fallback.service';
import { redisService } from '../redis.service';
import { mongodbService } from '../mongodb.service';

// Mock Redis service
jest.mock('../redis.service', () => ({
  redisService: {
    getClient: jest.fn(),
  },
}));

// Mock MongoDB service
jest.mock('../mongodb.service', () => ({
  mongodbService: {
    isHealthy: jest.fn(),
    getDb: jest.fn(),
  },
}));

describe('MongoDB Fallback Service', () => {
  let mockRedisClient: any;
  let mockDb: any;
  let mockCollection: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock Redis client
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      lpush: jest.fn(),
      lrange: jest.fn(),
      llen: jest.fn(),
      rpop: jest.fn(),
    };
    (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

    // Setup mock MongoDB
    mockCollection = {
      insertOne: jest.fn(),
      updateOne: jest.fn(),
    };
    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
    };
    (mongodbService.getDb as jest.Mock).mockReturnValue(mockDb);
    (mongodbService.isHealthy as jest.Mock).mockReturnValue(true);
  });

  describe('isUnavailabilityError', () => {
    it('should return true for connection refused errors', () => {
      const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
      expect(mongodbFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for connection reset errors', () => {
      const error = { code: 'ECONNRESET', message: 'Connection reset' };
      expect(mongodbFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for timeout errors', () => {
      const error = { code: 'ETIMEDOUT', message: 'Connection timed out' };
      expect(mongodbFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for network unreachable errors', () => {
      const error = { code: 'ENETUNREACH', message: 'Network unreachable' };
      expect(mongodbFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for host unreachable errors', () => {
      const error = { code: 'EHOSTUNREACH', message: 'Host unreachable' };
      expect(mongodbFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for errors with connection in message', () => {
      const error = { message: 'MongoDB connection failed' };
      expect(mongodbFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for errors with timeout in message', () => {
      const error = { message: 'Operation timeout exceeded' };
      expect(mongodbFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for MongoNetworkError', () => {
      const error = { name: 'MongoNetworkError', message: 'Network error' };
      expect(mongodbFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for MongoServerSelectionError', () => {
      const error = { name: 'MongoServerSelectionError', message: 'Server selection error' };
      expect(mongodbFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return true for MongoTimeoutError', () => {
      const error = { name: 'MongoTimeoutError', message: 'Timeout error' };
      expect(mongodbFallbackService.isUnavailabilityError(error)).toBe(true);
    });

    it('should return false for validation errors', () => {
      const error = { message: 'Validation failed: field is required' };
      expect(mongodbFallbackService.isUnavailabilityError(error)).toBe(false);
    });

    it('should return false for duplicate key errors', () => {
      const error = { code: 11000, message: 'Duplicate key error' };
      expect(mongodbFallbackService.isUnavailabilityError(error)).toBe(false);
    });

    it('should return false for null/undefined errors', () => {
      expect(mongodbFallbackService.isUnavailabilityError(null)).toBe(false);
      expect(mongodbFallbackService.isUnavailabilityError(undefined)).toBe(false);
    });
  });

  describe('isMongoDBAvailable', () => {
    it('should return false when unavailable flag is set', async () => {
      mockRedisClient.get.mockResolvedValue('true');

      const result = await mongodbFallbackService.isMongoDBAvailable();

      expect(result).toBe(false);
      expect(mockRedisClient.get).toHaveBeenCalledWith('mongodb:unavailable');
    });

    it('should return true when unavailable flag is not set', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await mongodbFallbackService.isMongoDBAvailable();

      expect(result).toBe(true);
    });

    it('should ping MongoDB when pingMongo is true', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      (mongodbService.isHealthy as jest.Mock).mockReturnValue(true);

      const result = await mongodbFallbackService.isMongoDBAvailable(true);

      expect(result).toBe(true);
      expect(mongodbService.isHealthy).toHaveBeenCalled();
    });

    it('should return false when MongoDB ping fails', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      (mongodbService.isHealthy as jest.Mock).mockReturnValue(false);

      const result = await mongodbFallbackService.isMongoDBAvailable(true);

      expect(result).toBe(false);
    });

    it('should return true when Redis check fails (assume MongoDB available)', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await mongodbFallbackService.isMongoDBAvailable();

      expect(result).toBe(true);
    });
  });

  describe('setMongoDBUnavailable', () => {
    it('should set the unavailable flag in Redis with TTL', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await mongodbFallbackService.setMongoDBUnavailable();

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'mongodb:unavailable',
        'true',
        'EX',
        300 // 5 minutes TTL
      );
    });

    it('should not throw when Redis fails', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));

      await expect(mongodbFallbackService.setMongoDBUnavailable()).resolves.not.toThrow();
    });
  });

  describe('setMongoDBAvailable', () => {
    it('should delete the unavailable flag from Redis', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await mongodbFallbackService.setMongoDBAvailable();

      expect(mockRedisClient.del).toHaveBeenCalledWith('mongodb:unavailable');
    });

    it('should not throw when Redis fails', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      await expect(mongodbFallbackService.setMongoDBAvailable()).resolves.not.toThrow();
    });
  });

  describe('writeToFallback', () => {
    it('should write document to Redis with correct key pattern', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.lpush.mockResolvedValue(1);

      await mongodbFallbackService.writeToFallback('answers', 'doc123', { data: 'test' });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'fallback:mongodb:answers:doc123',
        expect.any(String),
        'EX',
        3600 // 1 hour TTL
      );
    });

    it('should add pending write to the queue', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.lpush.mockResolvedValue(1);

      await mongodbFallbackService.writeToFallback('answers', 'doc123', { data: 'test' }, 'insert');

      expect(mockRedisClient.lpush).toHaveBeenCalledWith(
        'fallback:mongodb:pending',
        expect.any(String)
      );

      // Verify the pending write structure
      const pendingWriteJson = mockRedisClient.lpush.mock.calls[0][1];
      const pendingWrite = JSON.parse(pendingWriteJson) as PendingWrite;
      expect(pendingWrite.id).toBe('doc123');
      expect(pendingWrite.collection).toBe('answers');
      expect(pendingWrite.operation).toBe('insert');
      expect(pendingWrite.document).toEqual({ data: 'test' });
      expect(pendingWrite.timestamp).toBeDefined();
    });

    it('should store correct fallback document structure', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.lpush.mockResolvedValue(1);

      await mongodbFallbackService.writeToFallback('sessions', 'sess456', { state: 'LOBBY' }, 'update');

      const setCall = mockRedisClient.set.mock.calls[0];
      const fallbackDoc = JSON.parse(setCall[1]) as FallbackDocument;
      
      expect(fallbackDoc.id).toBe('sess456');
      expect(fallbackDoc.collection).toBe('sessions');
      expect(fallbackDoc.document).toEqual({ state: 'LOBBY' });
      expect(fallbackDoc.operation).toBe('update');
      expect(fallbackDoc.timestamp).toBeDefined();
    });

    it('should throw when Redis fails', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));

      await expect(
        mongodbFallbackService.writeToFallback('answers', 'doc123', { data: 'test' })
      ).rejects.toThrow('Redis error');
    });
  });

  describe('readFromFallback', () => {
    it('should read document from Redis', async () => {
      const fallbackDoc: FallbackDocument = {
        id: 'doc123',
        collection: 'answers',
        document: { data: 'test' },
        timestamp: Date.now(),
        operation: 'insert',
      };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(fallbackDoc));

      const result = await mongodbFallbackService.readFromFallback('answers', 'doc123');

      expect(result).toEqual(fallbackDoc);
      expect(mockRedisClient.get).toHaveBeenCalledWith('fallback:mongodb:answers:doc123');
    });

    it('should return null when document not found', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await mongodbFallbackService.readFromFallback('answers', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when Redis fails', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await mongodbFallbackService.readFromFallback('answers', 'doc123');

      expect(result).toBeNull();
    });
  });

  describe('deleteFromFallback', () => {
    it('should delete document from Redis', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await mongodbFallbackService.deleteFromFallback('answers', 'doc123');

      expect(mockRedisClient.del).toHaveBeenCalledWith('fallback:mongodb:answers:doc123');
    });

    it('should not throw when Redis fails', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      await expect(
        mongodbFallbackService.deleteFromFallback('answers', 'doc123')
      ).resolves.not.toThrow();
    });
  });

  describe('trackDeleteOperation', () => {
    it('should add delete operation to pending writes', async () => {
      mockRedisClient.lpush.mockResolvedValue(1);

      await mongodbFallbackService.trackDeleteOperation('answers', 'doc123', { _id: 'doc123' });

      expect(mockRedisClient.lpush).toHaveBeenCalledWith(
        'fallback:mongodb:pending',
        expect.any(String)
      );

      const pendingWriteJson = mockRedisClient.lpush.mock.calls[0][1];
      const pendingWrite = JSON.parse(pendingWriteJson) as PendingWrite;
      expect(pendingWrite.operation).toBe('delete');
      expect(pendingWrite.filter).toEqual({ _id: 'doc123' });
    });
  });

  describe('getPendingWrites', () => {
    it('should return all pending writes', async () => {
      const writes: PendingWrite[] = [
        { id: '1', collection: 'answers', operation: 'insert', document: {}, timestamp: 1 },
        { id: '2', collection: 'sessions', operation: 'update', document: {}, timestamp: 2 },
      ];
      mockRedisClient.lrange.mockResolvedValue(writes.map(w => JSON.stringify(w)));

      const result = await mongodbFallbackService.getPendingWrites();

      expect(result).toEqual(writes);
      expect(mockRedisClient.lrange).toHaveBeenCalledWith('fallback:mongodb:pending', 0, -1);
    });

    it('should return empty array when no pending writes', async () => {
      mockRedisClient.lrange.mockResolvedValue([]);

      const result = await mongodbFallbackService.getPendingWrites();

      expect(result).toEqual([]);
    });

    it('should return empty array when Redis fails', async () => {
      mockRedisClient.lrange.mockRejectedValue(new Error('Redis error'));

      const result = await mongodbFallbackService.getPendingWrites();

      expect(result).toEqual([]);
    });
  });

  describe('getPendingWriteCount', () => {
    it('should return count of pending writes', async () => {
      mockRedisClient.llen.mockResolvedValue(5);

      const result = await mongodbFallbackService.getPendingWriteCount();

      expect(result).toBe(5);
      expect(mockRedisClient.llen).toHaveBeenCalledWith('fallback:mongodb:pending');
    });

    it('should return 0 when Redis fails', async () => {
      mockRedisClient.llen.mockRejectedValue(new Error('Redis error'));

      const result = await mongodbFallbackService.getPendingWriteCount();

      expect(result).toBe(0);
    });
  });

  describe('removePendingWrites', () => {
    it('should remove specified number of pending writes', async () => {
      mockRedisClient.rpop.mockResolvedValue('{}');

      await mongodbFallbackService.removePendingWrites(3);

      expect(mockRedisClient.rpop).toHaveBeenCalledTimes(3);
      expect(mockRedisClient.rpop).toHaveBeenCalledWith('fallback:mongodb:pending');
    });
  });

  describe('clearPendingWrites', () => {
    it('should delete the pending writes list', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await mongodbFallbackService.clearPendingWrites();

      expect(mockRedisClient.del).toHaveBeenCalledWith('fallback:mongodb:pending');
    });
  });

  describe('executeWithFallback', () => {
    it('should use MongoDB when available', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'doc123' });

      const result = await mongodbFallbackService.executeWithFallback(
        'answers',
        'doc123',
        'insert',
        { data: 'test' }
      );

      expect(result).toEqual({ success: true, usedFallback: false });
      expect(mockCollection.insertOne).toHaveBeenCalledWith({ documentId: 'doc123', data: 'test' });
    });

    it('should use fallback when MongoDB is marked unavailable', async () => {
      mockRedisClient.get.mockResolvedValue('true');
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.lpush.mockResolvedValue(1);

      const result = await mongodbFallbackService.executeWithFallback(
        'answers',
        'doc123',
        'insert',
        { data: 'test' }
      );

      expect(result).toEqual({ success: true, usedFallback: true });
      expect(mockCollection.insertOne).not.toHaveBeenCalled();
    });

    it('should fallback when MongoDB operation fails with unavailability error', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.lpush.mockResolvedValue(1);
      
      const mongoError = new Error('Connection timeout');
      (mongoError as any).code = 'ETIMEDOUT';
      mockCollection.insertOne.mockRejectedValue(mongoError);

      const result = await mongodbFallbackService.executeWithFallback(
        'answers',
        'doc123',
        'insert',
        { data: 'test' }
      );

      expect(result).toEqual({ success: true, usedFallback: true });
      // Should set unavailable flag
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'mongodb:unavailable',
        'true',
        'EX',
        300
      );
    });

    it('should throw non-unavailability errors', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const validationError = new Error('Validation failed');
      mockCollection.insertOne.mockRejectedValue(validationError);

      await expect(
        mongodbFallbackService.executeWithFallback('answers', 'doc123', 'insert', { data: 'test' })
      ).rejects.toThrow('Validation failed');
    });

    it('should use updateOne for update operations', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await mongodbFallbackService.executeWithFallback(
        'sessions',
        'sess123',
        'update',
        { state: 'ACTIVE' }
      );

      expect(result).toEqual({ success: true, usedFallback: false });
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { documentId: 'sess123' },
        { $set: { state: 'ACTIVE' } },
        { upsert: true }
      );
    });
  });

  describe('getStatus', () => {
    it('should return correct status when MongoDB is available', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.llen.mockResolvedValue(0);

      const status = await mongodbFallbackService.getStatus();

      expect(status).toEqual({
        mongodbAvailable: true,
        pendingWriteCount: 0,
        unavailableFlagSet: false,
      });
    });

    it('should return correct status when MongoDB is unavailable', async () => {
      mockRedisClient.get.mockResolvedValue('true');
      mockRedisClient.llen.mockResolvedValue(5);

      const status = await mongodbFallbackService.getStatus();

      expect(status).toEqual({
        mongodbAvailable: false,
        pendingWriteCount: 5,
        unavailableFlagSet: true,
      });
    });

    it('should return default status when Redis fails', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const status = await mongodbFallbackService.getStatus();

      expect(status).toEqual({
        mongodbAvailable: true,
        pendingWriteCount: 0,
        unavailableFlagSet: false,
      });
    });
  });

  describe('Alert Callbacks', () => {
    it('should call registered alert callbacks', async () => {
      const alertCallback = jest.fn();
      mongodbFallbackService.onAlert(alertCallback);

      mockRedisClient.set.mockResolvedValue('OK');
      await mongodbFallbackService.setMongoDBUnavailable();

      expect(alertCallback).toHaveBeenCalledWith(
        'MongoDB marked as unavailable',
        expect.objectContaining({
          timestamp: expect.any(Number),
          ttl: 300,
        })
      );

      // Cleanup
      mongodbFallbackService.offAlert(alertCallback);
    });

    it('should remove alert callbacks', async () => {
      const alertCallback = jest.fn();
      mongodbFallbackService.onAlert(alertCallback);
      mongodbFallbackService.offAlert(alertCallback);

      mockRedisClient.set.mockResolvedValue('OK');
      await mongodbFallbackService.setMongoDBUnavailable();

      expect(alertCallback).not.toHaveBeenCalled();
    });

    it('should handle errors in alert callbacks gracefully', async () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const normalCallback = jest.fn();
      
      mongodbFallbackService.onAlert(errorCallback);
      mongodbFallbackService.onAlert(normalCallback);

      mockRedisClient.set.mockResolvedValue('OK');
      await mongodbFallbackService.setMongoDBUnavailable();

      // Both callbacks should be called, error should not prevent second callback
      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();

      // Cleanup
      mongodbFallbackService.offAlert(errorCallback);
      mongodbFallbackService.offAlert(normalCallback);
    });
  });
});
