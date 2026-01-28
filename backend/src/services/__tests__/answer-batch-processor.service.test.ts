/**
 * Answer Batch Processor Service Unit Tests
 *
 * Tests for buffering answers in memory and batch inserting to MongoDB.
 * Verifies the write-behind caching pattern for high-concurrency scenarios.
 *
 * Requirements: 11.4 - THE Write_Behind_Cache SHALL buffer answer submissions
 * in Redis and batch insert to MongoDB every 1 second
 */

import { answerBatchProcessor } from '../answer-batch-processor.service';
import { mongodbService } from '../mongodb.service';
import { Answer } from '../../models/types';

// Mock MongoDB service
jest.mock('../mongodb.service');

describe('AnswerBatchProcessor', () => {
  let mockDb: any;
  let mockAnswersCollection: any;

  // Helper to create a test answer
  const createTestAnswer = (overrides: Partial<Answer> = {}): Answer => ({
    answerId: `answer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    sessionId: 'session-1',
    participantId: 'participant-1',
    questionId: 'question-1',
    selectedOptions: ['option-1'],
    submittedAt: new Date(),
    responseTimeMs: 5000,
    isCorrect: true,
    pointsAwarded: 100,
    speedBonusApplied: 0,
    streakBonusApplied: 0,
    partialCreditApplied: false,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset the processor state
    answerBatchProcessor.stop();
    answerBatchProcessor.resetStats();
    answerBatchProcessor.clearFailedAnswers();

    // Mock MongoDB
    mockAnswersCollection = {
      insertMany: jest.fn().mockResolvedValue({ insertedCount: 0 }),
    };

    mockDb = {
      collection: jest.fn().mockReturnValue(mockAnswersCollection),
    };

    (mongodbService.getDb as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(async () => {
    jest.useRealTimers();
    await answerBatchProcessor.stop();
  });

  describe('Lifecycle Management', () => {
    it('should start the processor successfully', () => {
      answerBatchProcessor.start();

      expect(answerBatchProcessor.isProcessorRunning()).toBe(true);
    });

    it('should not restart if already running', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      answerBatchProcessor.start();
      answerBatchProcessor.start(); // Second call should be ignored

      expect(consoleSpy).toHaveBeenCalledWith(
        '[AnswerBatchProcessor] Already running, ignoring start request'
      );

      consoleSpy.mockRestore();
    });

    it('should stop the processor successfully', async () => {
      answerBatchProcessor.start();
      await answerBatchProcessor.stop();

      expect(answerBatchProcessor.isProcessorRunning()).toBe(false);
    });

    it('should flush remaining answers on stop', async () => {
      answerBatchProcessor.start();

      const answer = createTestAnswer();
      await answerBatchProcessor.addAnswer(answer);

      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

      await answerBatchProcessor.stop();

      expect(mockAnswersCollection.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ answerId: answer.answerId })]),
        expect.any(Object)
      );
    });

    it('should auto-start when adding answer if not running', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      expect(answerBatchProcessor.isProcessorRunning()).toBe(false);

      const answer = createTestAnswer();
      await answerBatchProcessor.addAnswer(answer);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[AnswerBatchProcessor] Not running, starting automatically'
      );
      expect(answerBatchProcessor.isProcessorRunning()).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('Buffer Management', () => {
    it('should add answer to buffer', async () => {
      answerBatchProcessor.start();

      const answer = createTestAnswer();
      await answerBatchProcessor.addAnswer(answer);

      expect(answerBatchProcessor.getBufferSize()).toBe(1);
    });

    it('should add multiple answers to buffer', async () => {
      answerBatchProcessor.start();

      const answers = [createTestAnswer(), createTestAnswer(), createTestAnswer()];
      await answerBatchProcessor.addAnswers(answers);

      expect(answerBatchProcessor.getBufferSize()).toBe(3);
    });

    it('should trigger flush when batch size is reached', async () => {
      // Configure smaller batch size for testing
      answerBatchProcessor.updateConfig({ batchSize: 5 });
      answerBatchProcessor.start();

      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 5 });

      // Add 5 answers to trigger flush
      const answers = Array.from({ length: 5 }, () => createTestAnswer());
      await answerBatchProcessor.addAnswers(answers);

      expect(mockAnswersCollection.insertMany).toHaveBeenCalled();
      expect(answerBatchProcessor.getBufferSize()).toBe(0);
    });

    it('should not flush when buffer is below batch size', async () => {
      answerBatchProcessor.updateConfig({ batchSize: 100 });
      answerBatchProcessor.start();

      const answers = Array.from({ length: 50 }, () => createTestAnswer());
      await answerBatchProcessor.addAnswers(answers);

      expect(mockAnswersCollection.insertMany).not.toHaveBeenCalled();
      expect(answerBatchProcessor.getBufferSize()).toBe(50);
    });
  });

  describe('Automatic Flushing', () => {
    it('should flush buffer after interval', async () => {
      answerBatchProcessor.updateConfig({ flushIntervalMs: 1000 });
      answerBatchProcessor.start();

      const answer = createTestAnswer();
      await answerBatchProcessor.addAnswer(answer);

      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

      // Advance timer by 1 second
      jest.advanceTimersByTime(1000);

      // Wait for async flush to complete
      await Promise.resolve();

      expect(mockAnswersCollection.insertMany).toHaveBeenCalled();
    });

    it('should not flush if buffer is empty', async () => {
      answerBatchProcessor.updateConfig({ flushIntervalMs: 1000 });
      answerBatchProcessor.start();

      // Advance timer without adding any answers
      jest.advanceTimersByTime(1000);

      await Promise.resolve();

      expect(mockAnswersCollection.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('Manual Flushing', () => {
    it('should flush buffer manually', async () => {
      answerBatchProcessor.start();

      const answers = [createTestAnswer(), createTestAnswer()];
      await answerBatchProcessor.addAnswers(answers);

      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 2 });

      const result = await answerBatchProcessor.flush();

      expect(result.success).toBe(true);
      expect(result.insertedCount).toBe(2);
      expect(answerBatchProcessor.getBufferSize()).toBe(0);
    });

    it('should return success for empty buffer', async () => {
      answerBatchProcessor.start();

      const result = await answerBatchProcessor.flush();

      expect(result.success).toBe(true);
      expect(result.insertedCount).toBe(0);
      expect(result.failedCount).toBe(0);
    });

    it('should prevent concurrent flushes', async () => {
      answerBatchProcessor.start();

      const answers = Array.from({ length: 10 }, () => createTestAnswer());
      await answerBatchProcessor.addAnswers(answers);

      // Simulate slow insert
      mockAnswersCollection.insertMany.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ insertedCount: 10 }), 100))
      );

      // Start two flushes concurrently
      const flush1 = answerBatchProcessor.flush();
      const flush2 = answerBatchProcessor.flush();

      jest.advanceTimersByTime(100);

      const [result1, result2] = await Promise.all([flush1, flush2]);

      // First flush should process, second should skip
      expect(result1.insertedCount + result2.insertedCount).toBe(10);
    });
  });

  describe('Error Handling', () => {
    it('should retry on insert failure', async () => {
      answerBatchProcessor.updateConfig({ maxRetries: 2, retryBaseDelayMs: 10 });
      answerBatchProcessor.start();

      const answer = createTestAnswer();
      await answerBatchProcessor.addAnswer(answer);

      // Fail first two attempts, succeed on third
      mockAnswersCollection.insertMany
        .mockRejectedValueOnce(new Error('Connection error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ insertedCount: 1 });

      jest.useRealTimers(); // Need real timers for retry delays

      const result = await answerBatchProcessor.flush();

      expect(result.success).toBe(true);
      expect(result.insertedCount).toBe(1);
      expect(mockAnswersCollection.insertMany).toHaveBeenCalledTimes(3);
    });

    it('should store failed answers after all retries exhausted', async () => {
      answerBatchProcessor.updateConfig({ maxRetries: 1, retryBaseDelayMs: 10 });
      answerBatchProcessor.start();

      const answer = createTestAnswer();
      await answerBatchProcessor.addAnswer(answer);

      // Fail all attempts
      mockAnswersCollection.insertMany.mockRejectedValue(new Error('Persistent error'));

      jest.useRealTimers();

      const result = await answerBatchProcessor.flush();

      expect(result.success).toBe(false);
      expect(result.failedCount).toBe(1);
      expect(answerBatchProcessor.getFailedAnswers()).toHaveLength(1);
    });

    it('should handle batch insert failures gracefully without losing data', async () => {
      /**
       * Validates: Requirements 11.4
       * Handle batch insert failures gracefully - don't lose data
       */
      answerBatchProcessor.updateConfig({ maxRetries: 0, retryBaseDelayMs: 10 });
      answerBatchProcessor.start();

      const answers = Array.from({ length: 5 }, () => createTestAnswer());
      await answerBatchProcessor.addAnswers(answers);

      mockAnswersCollection.insertMany.mockRejectedValue(new Error('Database unavailable'));

      jest.useRealTimers();

      const result = await answerBatchProcessor.flush();

      expect(result.success).toBe(false);
      expect(result.failedCount).toBe(5);

      // Verify answers are stored for recovery
      const failedAnswers = answerBatchProcessor.getFailedAnswers();
      expect(failedAnswers).toHaveLength(5);
    });

    it('should allow retrying failed answers', async () => {
      answerBatchProcessor.updateConfig({ maxRetries: 0, retryBaseDelayMs: 10 });
      answerBatchProcessor.start();

      const answer = createTestAnswer();
      await answerBatchProcessor.addAnswer(answer);

      // First flush fails
      mockAnswersCollection.insertMany.mockRejectedValueOnce(new Error('Error'));

      jest.useRealTimers();

      await answerBatchProcessor.flush();

      expect(answerBatchProcessor.getFailedAnswers()).toHaveLength(1);

      // Retry succeeds
      mockAnswersCollection.insertMany.mockResolvedValueOnce({ insertedCount: 1 });

      const retryResult = await answerBatchProcessor.retryFailedAnswers();

      expect(retryResult.success).toBe(true);
      expect(retryResult.insertedCount).toBe(1);
      expect(answerBatchProcessor.getFailedAnswers()).toHaveLength(0);
    });

    it('should clear failed answers manually', async () => {
      answerBatchProcessor.updateConfig({ maxRetries: 0 });
      answerBatchProcessor.start();

      const answer = createTestAnswer();
      await answerBatchProcessor.addAnswer(answer);

      mockAnswersCollection.insertMany.mockRejectedValue(new Error('Error'));

      jest.useRealTimers();

      await answerBatchProcessor.flush();

      expect(answerBatchProcessor.getFailedAnswers()).toHaveLength(1);

      answerBatchProcessor.clearFailedAnswers();

      expect(answerBatchProcessor.getFailedAnswers()).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    it('should track total answers processed', async () => {
      answerBatchProcessor.start();

      const answers = Array.from({ length: 10 }, () => createTestAnswer());
      await answerBatchProcessor.addAnswers(answers);

      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 10 });

      await answerBatchProcessor.flush();

      const stats = answerBatchProcessor.getStats();
      expect(stats.totalAnswersProcessed).toBe(10);
    });

    it('should track successful batches', async () => {
      answerBatchProcessor.start();

      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 5 });

      // First batch
      await answerBatchProcessor.addAnswers(Array.from({ length: 5 }, () => createTestAnswer()));
      await answerBatchProcessor.flush();

      // Second batch
      await answerBatchProcessor.addAnswers(Array.from({ length: 5 }, () => createTestAnswer()));
      await answerBatchProcessor.flush();

      const stats = answerBatchProcessor.getStats();
      expect(stats.successfulBatches).toBe(2);
    });

    it('should track failed batches', async () => {
      answerBatchProcessor.updateConfig({ maxRetries: 0 });
      answerBatchProcessor.start();

      mockAnswersCollection.insertMany.mockRejectedValue(new Error('Error'));

      jest.useRealTimers();

      await answerBatchProcessor.addAnswer(createTestAnswer());
      await answerBatchProcessor.flush();

      const stats = answerBatchProcessor.getStats();
      expect(stats.failedBatches).toBe(1);
    });

    it('should track retry attempts', async () => {
      answerBatchProcessor.updateConfig({ maxRetries: 2, retryBaseDelayMs: 10 });
      answerBatchProcessor.start();

      mockAnswersCollection.insertMany
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce({ insertedCount: 1 });

      jest.useRealTimers();

      await answerBatchProcessor.addAnswer(createTestAnswer());
      await answerBatchProcessor.flush();

      const stats = answerBatchProcessor.getStats();
      expect(stats.totalRetries).toBe(2);
    });

    it('should track current buffer size', async () => {
      answerBatchProcessor.start();

      await answerBatchProcessor.addAnswers(Array.from({ length: 7 }, () => createTestAnswer()));

      const stats = answerBatchProcessor.getStats();
      expect(stats.currentBufferSize).toBe(7);
    });

    it('should track last flush time', async () => {
      answerBatchProcessor.start();

      await answerBatchProcessor.addAnswer(createTestAnswer());

      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

      const beforeFlush = Date.now();
      await answerBatchProcessor.flush();
      const afterFlush = Date.now();

      const stats = answerBatchProcessor.getStats();
      expect(stats.lastFlushTime).toBeGreaterThanOrEqual(beforeFlush);
      expect(stats.lastFlushTime).toBeLessThanOrEqual(afterFlush);
    });

    it('should calculate average batch size', async () => {
      answerBatchProcessor.start();

      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 0 });

      // First batch: 10 answers
      await answerBatchProcessor.addAnswers(Array.from({ length: 10 }, () => createTestAnswer()));
      mockAnswersCollection.insertMany.mockResolvedValueOnce({ insertedCount: 10 });
      await answerBatchProcessor.flush();

      // Second batch: 20 answers
      await answerBatchProcessor.addAnswers(Array.from({ length: 20 }, () => createTestAnswer()));
      mockAnswersCollection.insertMany.mockResolvedValueOnce({ insertedCount: 20 });
      await answerBatchProcessor.flush();

      const stats = answerBatchProcessor.getStats();
      expect(stats.averageBatchSize).toBe(15); // (10 + 20) / 2
    });

    it('should reset statistics', async () => {
      answerBatchProcessor.start();

      await answerBatchProcessor.addAnswer(createTestAnswer());
      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 1 });
      await answerBatchProcessor.flush();

      answerBatchProcessor.resetStats();

      const stats = answerBatchProcessor.getStats();
      expect(stats.totalAnswersProcessed).toBe(0);
      expect(stats.successfulBatches).toBe(0);
      expect(stats.failedBatches).toBe(0);
      expect(stats.lastFlushTime).toBeNull();
    });
  });

  describe('Configuration', () => {
    it('should update batch size configuration', async () => {
      answerBatchProcessor.updateConfig({ batchSize: 50 });
      answerBatchProcessor.start();

      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 50 });

      // Add 49 answers - should not flush
      await answerBatchProcessor.addAnswers(Array.from({ length: 49 }, () => createTestAnswer()));
      expect(mockAnswersCollection.insertMany).not.toHaveBeenCalled();

      // Add 1 more - should trigger flush
      await answerBatchProcessor.addAnswer(createTestAnswer());
      expect(mockAnswersCollection.insertMany).toHaveBeenCalled();
    });

    it('should update flush interval configuration', () => {
      answerBatchProcessor.updateConfig({ flushIntervalMs: 5000 });
      answerBatchProcessor.start();

      // Verify configuration was updated (internal state)
      // The interval change is tested implicitly through behavior
      expect(answerBatchProcessor.isProcessorRunning()).toBe(true);
    });

    it('should update retry configuration', async () => {
      answerBatchProcessor.updateConfig({ maxRetries: 5, retryBaseDelayMs: 50 });
      answerBatchProcessor.start();

      mockAnswersCollection.insertMany
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'))
        .mockRejectedValueOnce(new Error('Error 4'))
        .mockRejectedValueOnce(new Error('Error 5'))
        .mockResolvedValueOnce({ insertedCount: 1 });

      jest.useRealTimers();

      await answerBatchProcessor.addAnswer(createTestAnswer());
      const result = await answerBatchProcessor.flush();

      expect(result.success).toBe(true);
      expect(mockAnswersCollection.insertMany).toHaveBeenCalledTimes(6);
    });
  });

  describe('High Concurrency Scenarios', () => {
    it('should handle thundering herd scenario (100 simultaneous answers)', async () => {
      /**
       * Validates: Requirements 11.4
       * Buffer answers in memory (batch size 100)
       */
      answerBatchProcessor.updateConfig({ batchSize: 100 });
      answerBatchProcessor.start();

      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 100 });

      // Simulate 100 simultaneous answer submissions
      const answers = Array.from({ length: 100 }, (_, i) =>
        createTestAnswer({
          answerId: `answer-${i}`,
          participantId: `participant-${i}`,
        })
      );

      await answerBatchProcessor.addAnswers(answers);

      // Should have triggered a flush
      expect(mockAnswersCollection.insertMany).toHaveBeenCalledTimes(1);
      expect(answerBatchProcessor.getBufferSize()).toBe(0);

      const stats = answerBatchProcessor.getStats();
      expect(stats.totalAnswersProcessed).toBe(100);
    });

    it('should handle multiple batches in quick succession', async () => {
      answerBatchProcessor.updateConfig({ batchSize: 50 });
      answerBatchProcessor.start();

      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 50 });

      // Add 150 answers (should trigger 3 flushes)
      for (let i = 0; i < 3; i++) {
        const answers = Array.from({ length: 50 }, () => createTestAnswer());
        await answerBatchProcessor.addAnswers(answers);
      }

      expect(mockAnswersCollection.insertMany).toHaveBeenCalledTimes(3);

      const stats = answerBatchProcessor.getStats();
      expect(stats.totalAnswersProcessed).toBe(150);
      expect(stats.successfulBatches).toBe(3);
    });
  });

  describe('MongoDB Integration', () => {
    it('should use ordered: false for batch inserts', async () => {
      answerBatchProcessor.start();

      await answerBatchProcessor.addAnswer(createTestAnswer());

      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

      await answerBatchProcessor.flush();

      expect(mockAnswersCollection.insertMany).toHaveBeenCalledWith(
        expect.any(Array),
        { ordered: false }
      );
    });

    it('should call correct collection', async () => {
      answerBatchProcessor.start();

      await answerBatchProcessor.addAnswer(createTestAnswer());

      mockAnswersCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

      await answerBatchProcessor.flush();

      expect(mockDb.collection).toHaveBeenCalledWith('answers');
    });
  });
});
