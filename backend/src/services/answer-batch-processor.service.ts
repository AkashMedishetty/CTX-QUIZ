/**
 * Answer Batch Processor Service
 *
 * Handles high-concurrency answer submissions by buffering answers in memory
 * and batch inserting them to MongoDB. This implements the write-behind caching
 * pattern to handle thundering herd scenarios (500+ simultaneous submissions).
 *
 * Features:
 * - Buffer answers in memory (batch size 100)
 * - Flush to MongoDB every 1 second OR when batch size reaches 100
 * - Handle batch insert failures gracefully (retry, log, don't lose data)
 * - Thread-safe batch operations
 *
 * Requirements: 11.4 - THE Write_Behind_Cache SHALL buffer answer submissions
 * in Redis and batch insert to MongoDB every 1 second
 */

import { Answer } from '../models/types';
import { mongodbService } from './mongodb.service';

/**
 * Configuration for the batch processor
 */
interface BatchProcessorConfig {
  /** Maximum number of answers to buffer before forcing a flush */
  batchSize: number;
  /** Interval in milliseconds between automatic flushes */
  flushIntervalMs: number;
  /** Maximum number of retry attempts for failed batch inserts */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff */
  retryBaseDelayMs: number;
}

/**
 * Statistics for monitoring batch processor performance
 */
export interface BatchProcessorStats {
  /** Total number of answers processed */
  totalAnswersProcessed: number;
  /** Total number of successful batch inserts */
  successfulBatches: number;
  /** Total number of failed batch inserts (after all retries) */
  failedBatches: number;
  /** Total number of retry attempts */
  totalRetries: number;
  /** Current buffer size */
  currentBufferSize: number;
  /** Last flush timestamp */
  lastFlushTime: number | null;
  /** Average batch size */
  averageBatchSize: number;
}

/**
 * Result of a batch flush operation
 */
interface FlushResult {
  success: boolean;
  insertedCount: number;
  failedCount: number;
  error?: string;
}

/**
 * AnswerBatchProcessor class
 *
 * Singleton service that buffers Answer objects and batch inserts them to MongoDB.
 * Designed to handle high-concurrency scenarios with graceful error handling.
 */
class AnswerBatchProcessor {
  /** Buffer for pending answers */
  private answerBuffer: Answer[] = [];

  /** Interval timer for automatic flushing */
  private flushInterval: NodeJS.Timeout | null = null;

  /** Flag indicating if the processor is running */
  private isRunning: boolean = false;

  /** Flag to prevent concurrent flush operations */
  private isFlushing: boolean = false;

  /** Configuration settings */
  private config: BatchProcessorConfig = {
    batchSize: 100,
    flushIntervalMs: 1000, // 1 second
    maxRetries: 3,
    retryBaseDelayMs: 100,
  };

  /** Statistics for monitoring */
  private stats: BatchProcessorStats = {
    totalAnswersProcessed: 0,
    successfulBatches: 0,
    failedBatches: 0,
    totalRetries: 0,
    currentBufferSize: 0,
    lastFlushTime: null,
    averageBatchSize: 0,
  };

  /** Total batches processed (for average calculation) */
  private totalBatchesProcessed: number = 0;

  /** Failed answers that couldn't be inserted after all retries */
  private failedAnswers: Answer[] = [];

  /**
   * Start the batch processor
   *
   * Initializes the automatic flush interval timer.
   * Safe to call multiple times - will not restart if already running.
   */
  start(): void {
    if (this.isRunning) {
      console.warn('[AnswerBatchProcessor] Already running, ignoring start request');
      return;
    }

    console.log('[AnswerBatchProcessor] Starting batch processor...', {
      batchSize: this.config.batchSize,
      flushIntervalMs: this.config.flushIntervalMs,
    });

    this.isRunning = true;

    // Start automatic flush interval
    this.flushInterval = setInterval(async () => {
      await this.flushIfNeeded();
    }, this.config.flushIntervalMs);

    console.log('[AnswerBatchProcessor] Batch processor started successfully');
  }

  /**
   * Stop the batch processor
   *
   * Stops the automatic flush interval and flushes any remaining answers.
   * Safe to call multiple times.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.warn('[AnswerBatchProcessor] Not running, ignoring stop request');
      return;
    }

    console.log('[AnswerBatchProcessor] Stopping batch processor...');

    this.isRunning = false;

    // Clear the flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush any remaining answers
    if (this.answerBuffer.length > 0) {
      console.log('[AnswerBatchProcessor] Flushing remaining answers before stop:', {
        count: this.answerBuffer.length,
      });
      await this.flush();
    }

    console.log('[AnswerBatchProcessor] Batch processor stopped', {
      stats: this.getStats(),
    });
  }

  /**
   * Add an answer to the buffer
   *
   * Adds the answer to the in-memory buffer. If the buffer reaches the
   * configured batch size, triggers an immediate flush.
   *
   * @param answer - The Answer object to buffer
   */
  async addAnswer(answer: Answer): Promise<void> {
    if (!this.isRunning) {
      console.warn('[AnswerBatchProcessor] Not running, starting automatically');
      this.start();
    }

    // Add answer to buffer
    this.answerBuffer.push(answer);
    this.stats.currentBufferSize = this.answerBuffer.length;

    console.log('[AnswerBatchProcessor] Answer added to buffer:', {
      answerId: answer.answerId,
      bufferSize: this.answerBuffer.length,
    });

    // Check if we need to flush due to batch size
    if (this.answerBuffer.length >= this.config.batchSize) {
      console.log('[AnswerBatchProcessor] Buffer full, triggering immediate flush');
      await this.flush();
    }
  }

  /**
   * Add multiple answers to the buffer
   *
   * Efficiently adds multiple answers at once. Useful for bulk operations.
   *
   * @param answers - Array of Answer objects to buffer
   */
  async addAnswers(answers: Answer[]): Promise<void> {
    if (!this.isRunning) {
      console.warn('[AnswerBatchProcessor] Not running, starting automatically');
      this.start();
    }

    // Add all answers to buffer
    this.answerBuffer.push(...answers);
    this.stats.currentBufferSize = this.answerBuffer.length;

    console.log('[AnswerBatchProcessor] Multiple answers added to buffer:', {
      addedCount: answers.length,
      bufferSize: this.answerBuffer.length,
    });

    // Check if we need to flush due to batch size
    if (this.answerBuffer.length >= this.config.batchSize) {
      console.log('[AnswerBatchProcessor] Buffer full, triggering immediate flush');
      await this.flush();
    }
  }

  /**
   * Flush the buffer if there are pending answers
   *
   * Called by the interval timer. Only flushes if there are answers
   * in the buffer and no flush is currently in progress.
   */
  private async flushIfNeeded(): Promise<void> {
    if (this.answerBuffer.length > 0 && !this.isFlushing) {
      await this.flush();
    }
  }

  /**
   * Flush all buffered answers to MongoDB
   *
   * Performs a batch insert of all buffered answers. Handles failures
   * gracefully with retry logic and exponential backoff.
   *
   * @returns FlushResult indicating success/failure and counts
   */
  async flush(): Promise<FlushResult> {
    // Prevent concurrent flushes
    if (this.isFlushing) {
      console.log('[AnswerBatchProcessor] Flush already in progress, skipping');
      return {
        success: true,
        insertedCount: 0,
        failedCount: 0,
      };
    }

    // Check if there's anything to flush
    if (this.answerBuffer.length === 0) {
      return {
        success: true,
        insertedCount: 0,
        failedCount: 0,
      };
    }

    this.isFlushing = true;

    // Take a snapshot of the current buffer and clear it
    const answersToInsert = [...this.answerBuffer];
    this.answerBuffer = [];
    this.stats.currentBufferSize = 0;

    console.log('[AnswerBatchProcessor] Starting flush:', {
      batchSize: answersToInsert.length,
    });

    try {
      // Attempt batch insert with retries
      const result = await this.insertWithRetry(answersToInsert);

      // Update statistics
      this.stats.totalAnswersProcessed += result.insertedCount;
      this.stats.lastFlushTime = Date.now();
      this.totalBatchesProcessed++;

      if (result.success) {
        this.stats.successfulBatches++;
      } else {
        this.stats.failedBatches++;
      }

      // Calculate average batch size
      this.stats.averageBatchSize =
        this.stats.totalAnswersProcessed / this.totalBatchesProcessed;

      console.log('[AnswerBatchProcessor] Flush completed:', {
        success: result.success,
        insertedCount: result.insertedCount,
        failedCount: result.failedCount,
      });

      return result;
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Insert answers with retry logic
   *
   * Attempts to insert answers to MongoDB with exponential backoff retry.
   * On failure, stores failed answers for later recovery.
   *
   * @param answers - Array of answers to insert
   * @returns FlushResult with insertion details
   */
  private async insertWithRetry(answers: Answer[]): Promise<FlushResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Attempt batch insert
        const db = mongodbService.getDb();
        const answersCollection = db.collection('answers');

        const result = await answersCollection.insertMany(answers, {
          ordered: false, // Continue inserting even if some fail
        });

        return {
          success: true,
          insertedCount: result.insertedCount,
          failedCount: answers.length - result.insertedCount,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.maxRetries) {
          // Calculate exponential backoff delay
          const delay = this.config.retryBaseDelayMs * Math.pow(2, attempt);
          this.stats.totalRetries++;

          console.warn('[AnswerBatchProcessor] Batch insert failed, retrying:', {
            attempt: attempt + 1,
            maxRetries: this.config.maxRetries,
            delay,
            error: lastError.message,
          });

          // Wait before retry
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted - handle failure gracefully
    console.error('[AnswerBatchProcessor] Batch insert failed after all retries:', {
      batchSize: answers.length,
      error: lastError?.message,
    });

    // Store failed answers for potential recovery
    this.failedAnswers.push(...answers);

    return {
      success: false,
      insertedCount: 0,
      failedCount: answers.length,
      error: lastError?.message,
    };
  }

  /**
   * Sleep utility for retry delays
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current statistics
   *
   * Returns a snapshot of the batch processor's performance statistics.
   *
   * @returns BatchProcessorStats object
   */
  getStats(): BatchProcessorStats {
    return {
      ...this.stats,
      currentBufferSize: this.answerBuffer.length,
    };
  }

  /**
   * Get failed answers
   *
   * Returns answers that failed to insert after all retry attempts.
   * Useful for manual recovery or debugging.
   *
   * @returns Array of failed Answer objects
   */
  getFailedAnswers(): Answer[] {
    return [...this.failedAnswers];
  }

  /**
   * Clear failed answers
   *
   * Clears the failed answers list after manual recovery.
   */
  clearFailedAnswers(): void {
    this.failedAnswers = [];
    console.log('[AnswerBatchProcessor] Failed answers cleared');
  }

  /**
   * Retry failed answers
   *
   * Attempts to re-insert previously failed answers.
   *
   * @returns FlushResult with retry details
   */
  async retryFailedAnswers(): Promise<FlushResult> {
    if (this.failedAnswers.length === 0) {
      return {
        success: true,
        insertedCount: 0,
        failedCount: 0,
      };
    }

    console.log('[AnswerBatchProcessor] Retrying failed answers:', {
      count: this.failedAnswers.length,
    });

    const answersToRetry = [...this.failedAnswers];
    this.failedAnswers = [];

    const result = await this.insertWithRetry(answersToRetry);

    console.log('[AnswerBatchProcessor] Failed answers retry completed:', {
      success: result.success,
      insertedCount: result.insertedCount,
      failedCount: result.failedCount,
    });

    return result;
  }

  /**
   * Get current buffer size
   *
   * @returns Number of answers currently in the buffer
   */
  getBufferSize(): number {
    return this.answerBuffer.length;
  }

  /**
   * Check if the processor is running
   *
   * @returns True if the processor is running
   */
  isProcessorRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Update configuration
   *
   * Allows runtime configuration updates. Changes take effect immediately.
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<BatchProcessorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    console.log('[AnswerBatchProcessor] Configuration updated:', this.config);

    // Restart interval if flush interval changed and processor is running
    if (config.flushIntervalMs && this.isRunning && this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = setInterval(async () => {
        await this.flushIfNeeded();
      }, this.config.flushIntervalMs);
    }
  }

  /**
   * Reset statistics
   *
   * Resets all statistics counters. Useful for testing or monitoring resets.
   */
  resetStats(): void {
    this.stats = {
      totalAnswersProcessed: 0,
      successfulBatches: 0,
      failedBatches: 0,
      totalRetries: 0,
      currentBufferSize: this.answerBuffer.length,
      lastFlushTime: null,
      averageBatchSize: 0,
    };
    this.totalBatchesProcessed = 0;

    console.log('[AnswerBatchProcessor] Statistics reset');
  }
}

// Export singleton instance
export const answerBatchProcessor = new AnswerBatchProcessor();
