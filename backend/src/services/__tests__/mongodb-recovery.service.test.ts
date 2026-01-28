/**
 * Unit tests for MongoDB Recovery Service
 * Tests background recovery job that recovers data from Redis fallback to MongoDB
 * 
 * Requirements: 17.2
 */

import { mongodbRecoveryService } from '../mongodb-recovery.service';
import { mongodbFallbackService, PendingWrite } from '../mongodb-fallback.service';
import { mongodbService } from '../mongodb.service';

// Mock dependencies
jest.mock('../mongodb-fallback.service', () => ({
  mongodbFallbackService: {
    getStatus: jest.fn(),
    getPendingWrites: jest.fn(),
    removePendingWrites: jest.fn(),
    clearPendingWrites: jest.fn(),
    setMongoDBAvailable: jest.fn(),
    deleteFromFallback: jest.fn(),
    isUnavailabilityError: jest.fn(),
  },
}));

jest.mock('../mongodb.service', () => ({
  mongodbService: {
    isHealthy: jest.fn(),
    getStatus: jest.fn(),
    getDb: jest.fn(),
  },
}));

jest.mock('../redis.service', () => ({
  redisService: {
    getClient: jest.fn(),
  },
}));

describe('MongoDB Recovery Service', () => {
  let mockDb: any;
  let mockCollection: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Stop any running recovery job
    mongodbRecoveryService.stop();
    mongodbRecoveryService.resetStats();

    // Setup mock MongoDB
    mockCollection = {
      insertOne: jest.fn().mockResolvedValue({ insertedId: 'test' }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
    };
    (mongodbService.getDb as jest.Mock).mockReturnValue(mockDb);
    (mongodbService.isHealthy as jest.Mock).mockReturnValue(true);
    (mongodbService.getStatus as jest.Mock).mockResolvedValue({ connected: true });

    // Setup default fallback service mocks
    (mongodbFallbackService.getStatus as jest.Mock).mockResolvedValue({
      mongodbAvailable: true,
      pendingWriteCount: 0,
      unavailableFlagSet: false,
    });
    (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue([]);
    (mongodbFallbackService.removePendingWrites as jest.Mock).mockResolvedValue(undefined);
    (mongodbFallbackService.clearPendingWrites as jest.Mock).mockResolvedValue(undefined);
    (mongodbFallbackService.setMongoDBAvailable as jest.Mock).mockResolvedValue(undefined);
    (mongodbFallbackService.deleteFromFallback as jest.Mock).mockResolvedValue(undefined);
    (mongodbFallbackService.isUnavailabilityError as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    mongodbRecoveryService.stop();
    jest.useRealTimers();
  });

  describe('start and stop', () => {
    it('should start the recovery job', () => {
      mongodbRecoveryService.start();

      expect(mongodbRecoveryService.isRunning()).toBe(true);
      expect(mongodbRecoveryService.getStatus()).toBe('running');
    });

    it('should stop the recovery job', () => {
      mongodbRecoveryService.start();
      mongodbRecoveryService.stop();

      expect(mongodbRecoveryService.isRunning()).toBe(false);
      expect(mongodbRecoveryService.getStatus()).toBe('stopped');
    });

    it('should not start multiple times', () => {
      mongodbRecoveryService.start();
      mongodbRecoveryService.start();

      expect(mongodbRecoveryService.isRunning()).toBe(true);
    });

    it('should run check immediately on start', async () => {
      (mongodbFallbackService.getStatus as jest.Mock).mockResolvedValue({
        mongodbAvailable: false,
        pendingWriteCount: 0,
        unavailableFlagSet: false,
      });

      mongodbRecoveryService.start();

      // Allow the immediate check to run
      await Promise.resolve();

      expect(mongodbFallbackService.getStatus).toHaveBeenCalled();
    });
  });

  describe('configure', () => {
    it('should configure check interval', () => {
      mongodbRecoveryService.configure({ checkIntervalMs: 60000 });
      
      // Start and verify interval is used
      mongodbRecoveryService.start();
      expect(mongodbRecoveryService.isRunning()).toBe(true);
    });

    it('should configure batch size', () => {
      mongodbRecoveryService.configure({ batchSize: 20 });
      
      // Configuration is internal, just verify no errors
      expect(mongodbRecoveryService.isRunning()).toBe(false);
    });
  });

  describe('checkAndRecover', () => {
    it('should do nothing when MongoDB is not marked unavailable', async () => {
      (mongodbFallbackService.getStatus as jest.Mock).mockResolvedValue({
        mongodbAvailable: true,
        pendingWriteCount: 0,
        unavailableFlagSet: false,
      });

      await mongodbRecoveryService.checkAndRecover();

      expect(mongodbFallbackService.getPendingWrites).not.toHaveBeenCalled();
    });

    it('should clear flag when unavailable but no pending writes', async () => {
      (mongodbFallbackService.getStatus as jest.Mock).mockResolvedValue({
        mongodbAvailable: false,
        pendingWriteCount: 0,
        unavailableFlagSet: true,
      });

      await mongodbRecoveryService.checkAndRecover();

      expect(mongodbFallbackService.setMongoDBAvailable).toHaveBeenCalled();
    });

    it('should skip recovery when MongoDB is still unavailable', async () => {
      (mongodbFallbackService.getStatus as jest.Mock).mockResolvedValue({
        mongodbAvailable: false,
        pendingWriteCount: 5,
        unavailableFlagSet: true,
      });
      (mongodbService.isHealthy as jest.Mock).mockReturnValue(false);

      await mongodbRecoveryService.checkAndRecover();

      expect(mongodbFallbackService.getPendingWrites).not.toHaveBeenCalled();
    });

    it('should start recovery when MongoDB is back and has pending writes', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: '1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ];

      (mongodbFallbackService.getStatus as jest.Mock).mockResolvedValue({
        mongodbAvailable: false,
        pendingWriteCount: 1,
        unavailableFlagSet: true,
      });
      (mongodbService.isHealthy as jest.Mock).mockReturnValue(true);
      (mongodbService.getStatus as jest.Mock).mockResolvedValue({ connected: true });
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);

      await mongodbRecoveryService.checkAndRecover();

      expect(mongodbFallbackService.getPendingWrites).toHaveBeenCalled();
      expect(mockCollection.insertOne).toHaveBeenCalled();
    });
  });

  describe('checkMongoDBAvailability', () => {
    it('should return true when MongoDB is healthy and connected', async () => {
      (mongodbService.isHealthy as jest.Mock).mockReturnValue(true);
      (mongodbService.getStatus as jest.Mock).mockResolvedValue({ connected: true });

      const result = await mongodbRecoveryService.checkMongoDBAvailability();

      expect(result).toBe(true);
    });

    it('should return false when MongoDB is not healthy', async () => {
      (mongodbService.isHealthy as jest.Mock).mockReturnValue(false);

      const result = await mongodbRecoveryService.checkMongoDBAvailability();

      expect(result).toBe(false);
    });

    it('should return false when MongoDB status check fails', async () => {
      (mongodbService.isHealthy as jest.Mock).mockReturnValue(true);
      (mongodbService.getStatus as jest.Mock).mockResolvedValue({ connected: false });

      const result = await mongodbRecoveryService.checkMongoDBAvailability();

      expect(result).toBe(false);
    });

    it('should return false when status check throws error', async () => {
      (mongodbService.isHealthy as jest.Mock).mockReturnValue(true);
      (mongodbService.getStatus as jest.Mock).mockRejectedValue(new Error('Connection error'));

      const result = await mongodbRecoveryService.checkMongoDBAvailability();

      expect(result).toBe(false);
    });
  });

  describe('recoverPendingWrites', () => {
    it('should return success with zero counts when no pending writes', async () => {
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue([]);

      const result = await mongodbRecoveryService.recoverPendingWrites();

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(0);
      expect(result.failedCount).toBe(0);
    });

    it('should process insert operations', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);

      const result = await mongodbRecoveryService.recoverPendingWrites();

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(1);
      expect(mockCollection.insertOne).toHaveBeenCalledWith({ documentId: 'doc1', data: 'test' });
      expect(mongodbFallbackService.deleteFromFallback).toHaveBeenCalledWith('answers', 'doc1');
    });

    it('should process update operations', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'sessions', operation: 'update', document: { state: 'ACTIVE' }, timestamp: 1 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);

      const result = await mongodbRecoveryService.recoverPendingWrites();

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(1);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { documentId: 'doc1' },
        { $set: { state: 'ACTIVE' } },
        { upsert: true }
      );
    });

    it('should process delete operations with filter', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'delete', filter: { _id: 'doc1' }, timestamp: 1 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);

      const result = await mongodbRecoveryService.recoverPendingWrites();

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(1);
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ _id: 'doc1' });
    });

    it('should process delete operations without filter', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'delete', timestamp: 1 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);

      const result = await mongodbRecoveryService.recoverPendingWrites();

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(1);
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({ documentId: 'doc1' });
    });

    it('should process multiple writes in order', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { order: 1 }, timestamp: 1 },
        { id: 'doc2', collection: 'answers', operation: 'insert', document: { order: 2 }, timestamp: 2 },
        { id: 'doc3', collection: 'answers', operation: 'insert', document: { order: 3 }, timestamp: 3 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);

      const result = await mongodbRecoveryService.recoverPendingWrites();

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(3);
      expect(mockCollection.insertOne).toHaveBeenCalledTimes(3);
    });

    it('should handle failed writes and continue processing', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test1' }, timestamp: 1 },
        { id: 'doc2', collection: 'answers', operation: 'insert', document: { data: 'test2' }, timestamp: 2 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);
      
      // Writes are processed in reverse order (oldest first), so doc2 is processed first
      // First insert (doc2) fails, second (doc1) succeeds
      mockCollection.insertOne
        .mockRejectedValueOnce(new Error('Validation error'))
        .mockResolvedValueOnce({ insertedId: 'doc1' });

      const result = await mongodbRecoveryService.recoverPendingWrites();

      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].id).toBe('doc2'); // doc2 is processed first and fails
    });

    it('should clear unavailable flag after successful recovery', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);

      await mongodbRecoveryService.recoverPendingWrites();

      expect(mongodbFallbackService.setMongoDBAvailable).toHaveBeenCalled();
      expect(mongodbFallbackService.clearPendingWrites).toHaveBeenCalled();
    });

    it('should remove processed writes from queue', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);

      await mongodbRecoveryService.recoverPendingWrites();

      expect(mongodbFallbackService.removePendingWrites).toHaveBeenCalledWith(1);
    });

    it('should update statistics after recovery', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);

      await mongodbRecoveryService.recoverPendingWrites();

      const stats = mongodbRecoveryService.getStats();
      expect(stats.totalRecoveries).toBe(1);
      expect(stats.totalProcessed).toBe(1);
      expect(stats.lastRecoveryTime).not.toBeNull();
      expect(stats.lastRecoveryResult).not.toBeNull();
    });
  });

  describe('batch processing', () => {
    it('should process writes in batches', async () => {
      // Configure small batch size
      mongodbRecoveryService.configure({ batchSize: 2 });

      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: '1' }, timestamp: 1 },
        { id: 'doc2', collection: 'answers', operation: 'insert', document: { data: '2' }, timestamp: 2 },
        { id: 'doc3', collection: 'answers', operation: 'insert', document: { data: '3' }, timestamp: 3 },
        { id: 'doc4', collection: 'answers', operation: 'insert', document: { data: '4' }, timestamp: 4 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);

      const result = await mongodbRecoveryService.recoverPendingWrites();

      expect(result.processedCount).toBe(4);
      // Should have called removePendingWrites twice (once per batch)
      expect(mongodbFallbackService.removePendingWrites).toHaveBeenCalledTimes(2);
    });
  });

  describe('retry logic', () => {
    it('should retry on unavailability errors', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);
      (mongodbFallbackService.isUnavailabilityError as jest.Mock).mockReturnValue(true);

      // Fail twice, succeed on third attempt
      const timeoutError = new Error('Connection timeout');
      mockCollection.insertOne
        .mockRejectedValueOnce(timeoutError)
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({ insertedId: 'doc1' });

      // Use real timers for this test
      jest.useRealTimers();

      const result = await mongodbRecoveryService.recoverPendingWrites();

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(1);
      expect(mockCollection.insertOne).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retry attempts', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);
      (mongodbFallbackService.isUnavailabilityError as jest.Mock).mockReturnValue(true);

      // Fail all attempts
      const timeoutError = new Error('Connection timeout');
      mockCollection.insertOne.mockRejectedValue(timeoutError);

      // Use real timers for this test
      jest.useRealTimers();

      const result = await mongodbRecoveryService.recoverPendingWrites();

      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(mockCollection.insertOne).toHaveBeenCalledTimes(3); // MAX_RETRY_ATTEMPTS
    });

    it('should not retry non-unavailability errors', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);
      (mongodbFallbackService.isUnavailabilityError as jest.Mock).mockReturnValue(false);

      const validationError = new Error('Validation failed');
      mockCollection.insertOne.mockRejectedValue(validationError);

      const result = await mongodbRecoveryService.recoverPendingWrites();

      expect(result.failedCount).toBe(1);
      expect(mockCollection.insertOne).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe('triggerRecovery', () => {
    it('should manually trigger recovery', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);

      const result = await mongodbRecoveryService.triggerRecovery();

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = mongodbRecoveryService.getStats();

      expect(stats.status).toBe('stopped');
      expect(stats.lastCheckTime).toBeNull();
      expect(stats.lastRecoveryTime).toBeNull();
      expect(stats.lastRecoveryResult).toBeNull();
      expect(stats.totalRecoveries).toBe(0);
      expect(stats.totalProcessed).toBe(0);
      expect(stats.totalFailed).toBe(0);
    });

    it('should update stats after check', async () => {
      await mongodbRecoveryService.checkAndRecover();

      const stats = mongodbRecoveryService.getStats();
      expect(stats.lastCheckTime).not.toBeNull();
    });

    it('should accumulate stats across multiple recoveries', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);

      await mongodbRecoveryService.recoverPendingWrites();
      await mongodbRecoveryService.recoverPendingWrites();

      const stats = mongodbRecoveryService.getStats();
      expect(stats.totalRecoveries).toBe(2);
      expect(stats.totalProcessed).toBe(2);
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ];
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue(pendingWrites);

      await mongodbRecoveryService.recoverPendingWrites();
      mongodbRecoveryService.resetStats();

      const stats = mongodbRecoveryService.getStats();
      expect(stats.totalRecoveries).toBe(0);
      expect(stats.totalProcessed).toBe(0);
      expect(stats.lastRecoveryTime).toBeNull();
    });
  });

  describe('alert callbacks', () => {
    it('should call registered alert callbacks on recovery start', async () => {
      const alertCallback = jest.fn();
      mongodbRecoveryService.onAlert(alertCallback);

      (mongodbFallbackService.getStatus as jest.Mock).mockResolvedValue({
        mongodbAvailable: false,
        pendingWriteCount: 1,
        unavailableFlagSet: true,
      });
      (mongodbService.isHealthy as jest.Mock).mockReturnValue(true);
      (mongodbService.getStatus as jest.Mock).mockResolvedValue({ connected: true });
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue([
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ]);

      await mongodbRecoveryService.checkAndRecover();

      expect(alertCallback).toHaveBeenCalledWith(
        'MongoDB recovery started',
        expect.objectContaining({ pendingWriteCount: 1 })
      );

      mongodbRecoveryService.offAlert(alertCallback);
    });

    it('should call alert callbacks on successful recovery', async () => {
      const alertCallback = jest.fn();
      mongodbRecoveryService.onAlert(alertCallback);

      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue([
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ]);

      await mongodbRecoveryService.recoverPendingWrites();

      expect(alertCallback).toHaveBeenCalledWith(
        'MongoDB recovery completed successfully',
        expect.objectContaining({ processedCount: 1 })
      );

      mongodbRecoveryService.offAlert(alertCallback);
    });

    it('should remove alert callbacks', async () => {
      const alertCallback = jest.fn();
      mongodbRecoveryService.onAlert(alertCallback);
      mongodbRecoveryService.offAlert(alertCallback);

      (mongodbFallbackService.getPendingWrites as jest.Mock).mockResolvedValue([
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ]);

      await mongodbRecoveryService.recoverPendingWrites();

      expect(alertCallback).not.toHaveBeenCalled();
    });
  });

  describe('concurrent recovery prevention', () => {
    it('should prevent concurrent recovery attempts', async () => {
      const pendingWrites: PendingWrite[] = [
        { id: 'doc1', collection: 'answers', operation: 'insert', document: { data: 'test' }, timestamp: 1 },
      ];
      
      // Make the first recovery take some time
      let resolveFirst: () => void;
      const firstPromise = new Promise<void>(resolve => { resolveFirst = resolve; });
      
      (mongodbFallbackService.getPendingWrites as jest.Mock).mockImplementation(async () => {
        await firstPromise;
        return pendingWrites;
      });

      // Start first recovery
      const recovery1 = mongodbRecoveryService.recoverPendingWrites();
      
      // Try to start second recovery while first is in progress
      (mongodbFallbackService.getStatus as jest.Mock).mockResolvedValue({
        mongodbAvailable: false,
        pendingWriteCount: 1,
        unavailableFlagSet: true,
      });
      
      // This should be skipped because recovery is in progress
      await mongodbRecoveryService.checkAndRecover();
      
      // Complete first recovery
      resolveFirst!();
      await recovery1;

      // getPendingWrites should only be called once (from the first recovery)
      expect(mongodbFallbackService.getPendingWrites).toHaveBeenCalledTimes(1);
    });
  });
});
