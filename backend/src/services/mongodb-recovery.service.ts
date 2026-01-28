/**
 * MongoDB Recovery Service
 * 
 * Background job that recovers data from Redis fallback storage to MongoDB
 * when MongoDB becomes available again after an outage.
 * 
 * Recovery Process:
 * 1. Check if mongodb:unavailable flag is set periodically
 * 2. If set, ping MongoDB to see if it's back
 * 3. If MongoDB is back, process pending writes in order
 * 4. For each successful write, remove from pending queue
 * 5. Clear the unavailable flag when all writes are processed
 * 
 * Requirements: 17.2
 */

import { mongodbFallbackService, PendingWrite } from './mongodb-fallback.service';
import { mongodbService } from './mongodb.service';

// Configuration constants
const DEFAULT_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds
const DEFAULT_BATCH_SIZE = 10; // Process 10 writes at a time
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000; // 1 second between retries

// Recovery job status
export type RecoveryJobStatus = 'stopped' | 'running' | 'recovering';

// Recovery result interface
export interface RecoveryResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  errors: Array<{ id: string; collection: string; error: string }>;
  duration: number;
}

// Recovery job statistics
export interface RecoveryStats {
  status: RecoveryJobStatus;
  lastCheckTime: number | null;
  lastRecoveryTime: number | null;
  lastRecoveryResult: RecoveryResult | null;
  totalRecoveries: number;
  totalProcessed: number;
  totalFailed: number;
}

class MongoDBRecoveryService {
  private intervalId: NodeJS.Timeout | null = null;
  private status: RecoveryJobStatus = 'stopped';
  private checkIntervalMs: number = DEFAULT_CHECK_INTERVAL_MS;
  private batchSize: number = DEFAULT_BATCH_SIZE;
  private isRecovering: boolean = false;
  
  // Statistics
  private stats: RecoveryStats = {
    status: 'stopped',
    lastCheckTime: null,
    lastRecoveryTime: null,
    lastRecoveryResult: null,
    totalRecoveries: 0,
    totalProcessed: 0,
    totalFailed: 0,
  };

  // Alert callbacks
  private alertCallbacks: Array<(message: string, details: Record<string, any>) => void> = [];

  /**
   * Register a callback for monitoring alerts
   * @param callback - Function to call when an alert is triggered
   */
  onAlert(callback: (message: string, details: Record<string, any>) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Remove an alert callback
   * @param callback - The callback to remove
   */
  offAlert(callback: (message: string, details: Record<string, any>) => void): void {
    const index = this.alertCallbacks.indexOf(callback);
    if (index > -1) {
      this.alertCallbacks.splice(index, 1);
    }
  }

  /**
   * Trigger a monitoring alert
   * @param message - Alert message
   * @param details - Additional details about the alert
   */
  private triggerAlert(message: string, details: Record<string, any>): void {
    console.log(`[MongoDB Recovery] ${message}`, details);

    for (const callback of this.alertCallbacks) {
      try {
        callback(message, details);
      } catch (error) {
        console.error('[MongoDB Recovery] Error in alert callback:', error);
      }
    }
  }

  /**
   * Configure the recovery job
   * @param options - Configuration options
   */
  configure(options: { checkIntervalMs?: number; batchSize?: number }): void {
    if (options.checkIntervalMs !== undefined) {
      this.checkIntervalMs = options.checkIntervalMs;
    }
    if (options.batchSize !== undefined) {
      this.batchSize = options.batchSize;
    }
  }

  /**
   * Start the background recovery job
   * Checks periodically for MongoDB availability and recovers pending writes
   */
  start(): void {
    if (this.intervalId !== null) {
      console.log('[MongoDB Recovery] Recovery job already running');
      return;
    }

    console.log(`[MongoDB Recovery] Starting recovery job (interval: ${this.checkIntervalMs}ms, batch: ${this.batchSize})`);
    
    this.status = 'running';
    this.stats.status = 'running';

    // Run immediately on start
    this.checkAndRecover().catch(error => {
      console.error('[MongoDB Recovery] Error in initial check:', error);
    });

    // Set up periodic check
    this.intervalId = setInterval(() => {
      this.checkAndRecover().catch(error => {
        console.error('[MongoDB Recovery] Error in periodic check:', error);
      });
    }, this.checkIntervalMs);
  }

  /**
   * Stop the background recovery job
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.status = 'stopped';
    this.stats.status = 'stopped';
    
    console.log('[MongoDB Recovery] Recovery job stopped');
  }

  /**
   * Check if recovery job is running
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }

  /**
   * Get current recovery job status
   */
  getStatus(): RecoveryJobStatus {
    return this.status;
  }

  /**
   * Get recovery statistics
   */
  getStats(): RecoveryStats {
    return { ...this.stats };
  }

  /**
   * Check if MongoDB is available and trigger recovery if needed
   */
  async checkAndRecover(): Promise<void> {
    // Prevent concurrent recovery attempts
    if (this.isRecovering) {
      console.log('[MongoDB Recovery] Recovery already in progress, skipping check');
      return;
    }

    this.stats.lastCheckTime = Date.now();

    try {
      // Check if MongoDB was marked as unavailable
      const fallbackStatus = await mongodbFallbackService.getStatus();
      
      if (!fallbackStatus.unavailableFlagSet) {
        // MongoDB is not marked as unavailable, nothing to recover
        return;
      }

      // Check if there are pending writes to recover
      if (fallbackStatus.pendingWriteCount === 0) {
        // No pending writes, just clear the flag
        await mongodbFallbackService.setMongoDBAvailable();
        console.log('[MongoDB Recovery] No pending writes, cleared unavailable flag');
        return;
      }

      // Check if MongoDB is actually available now
      const isAvailable = await this.checkMongoDBAvailability();
      
      if (!isAvailable) {
        console.log('[MongoDB Recovery] MongoDB still unavailable, skipping recovery');
        return;
      }

      // MongoDB is back! Start recovery
      console.log(`[MongoDB Recovery] MongoDB is back, starting recovery of ${fallbackStatus.pendingWriteCount} pending writes`);
      
      this.triggerAlert('MongoDB recovery started', {
        pendingWriteCount: fallbackStatus.pendingWriteCount,
        timestamp: Date.now(),
      });

      await this.recoverPendingWrites();
    } catch (error) {
      console.error('[MongoDB Recovery] Error during check and recover:', error);
    }
  }

  /**
   * Check if MongoDB is available by pinging it
   * @returns True if MongoDB is available
   */
  async checkMongoDBAvailability(): Promise<boolean> {
    try {
      // Use the MongoDB service's health check
      const isHealthy = mongodbService.isHealthy();
      
      if (!isHealthy) {
        return false;
      }

      // Also try to get the database status to verify connection
      const status = await mongodbService.getStatus();
      return status.connected;
    } catch (error) {
      console.error('[MongoDB Recovery] Error checking MongoDB availability:', error);
      return false;
    }
  }

  /**
   * Process all pending writes from Redis fallback to MongoDB
   */
  async recoverPendingWrites(): Promise<RecoveryResult> {
    this.isRecovering = true;
    this.status = 'recovering';
    this.stats.status = 'recovering';

    const startTime = Date.now();
    const result: RecoveryResult = {
      success: true,
      processedCount: 0,
      failedCount: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Get all pending writes
      const pendingWrites = await mongodbFallbackService.getPendingWrites();
      
      if (pendingWrites.length === 0) {
        result.duration = Date.now() - startTime;
        await this.completeRecovery(result);
        return result;
      }

      // Process in batches, oldest first (reverse since lpush adds to front)
      const orderedWrites = [...pendingWrites].reverse();
      
      for (let i = 0; i < orderedWrites.length; i += this.batchSize) {
        const batch = orderedWrites.slice(i, i + this.batchSize);
        const batchResults = await this.processBatch(batch);
        
        result.processedCount += batchResults.processed;
        result.failedCount += batchResults.failed;
        result.errors.push(...batchResults.errors);

        // Remove successfully processed writes from the queue
        if (batchResults.processed > 0) {
          await mongodbFallbackService.removePendingWrites(batchResults.processed);
        }

        // If we had failures, check if MongoDB is still available
        if (batchResults.failed > 0) {
          const stillAvailable = await this.checkMongoDBAvailability();
          if (!stillAvailable) {
            console.log('[MongoDB Recovery] MongoDB became unavailable during recovery, stopping');
            result.success = false;
            break;
          }
        }
      }

      result.duration = Date.now() - startTime;
      await this.completeRecovery(result);
      
      return result;
    } catch (error: any) {
      result.success = false;
      result.duration = Date.now() - startTime;
      result.errors.push({
        id: 'recovery',
        collection: 'unknown',
        error: error.message || 'Unknown error during recovery',
      });

      console.error('[MongoDB Recovery] Error during recovery:', error);
      
      this.triggerAlert('MongoDB recovery failed', {
        error: error.message,
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        timestamp: Date.now(),
      });

      return result;
    } finally {
      this.isRecovering = false;
      this.status = this.intervalId !== null ? 'running' : 'stopped';
      this.stats.status = this.status;
    }
  }

  /**
   * Process a batch of pending writes
   * @param batch - Array of pending writes to process
   */
  private async processBatch(batch: PendingWrite[]): Promise<{
    processed: number;
    failed: number;
    errors: Array<{ id: string; collection: string; error: string }>;
  }> {
    const results = {
      processed: 0,
      failed: 0,
      errors: [] as Array<{ id: string; collection: string; error: string }>,
    };

    for (const write of batch) {
      try {
        await this.processWrite(write);
        results.processed++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          id: write.id,
          collection: write.collection,
          error: error.message || 'Unknown error',
        });
        console.error(`[MongoDB Recovery] Failed to process write ${write.collection}/${write.id}:`, error);
      }
    }

    return results;
  }

  /**
   * Process a single pending write with retry logic
   * @param write - The pending write to process
   */
  private async processWrite(write: PendingWrite): Promise<void> {
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const db = mongodbService.getDb();
        const collection = db.collection(write.collection);

        switch (write.operation) {
          case 'insert':
            if (write.document) {
              await collection.insertOne({ documentId: write.id, ...write.document } as any);
            }
            break;

          case 'update':
            if (write.document) {
              await collection.updateOne(
                { documentId: write.id } as any,
                { $set: write.document },
                { upsert: true }
              );
            }
            break;

          case 'delete':
            if (write.filter) {
              await collection.deleteOne(write.filter as any);
            } else {
              await collection.deleteOne({ documentId: write.id } as any);
            }
            break;

          default:
            throw new Error(`Unknown operation: ${write.operation}`);
        }

        // Also delete the fallback document from Redis
        await mongodbFallbackService.deleteFromFallback(write.collection, write.id);
        
        return; // Success, exit retry loop
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable
        const isRetryable = mongodbFallbackService.isUnavailabilityError(error);
        
        if (!isRetryable || attempt === MAX_RETRY_ATTEMPTS) {
          throw error;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      }
    }

    throw lastError;
  }

  /**
   * Complete the recovery process
   * @param result - The recovery result
   */
  private async completeRecovery(result: RecoveryResult): Promise<void> {
    // Update statistics
    this.stats.lastRecoveryTime = Date.now();
    this.stats.lastRecoveryResult = result;
    this.stats.totalRecoveries++;
    this.stats.totalProcessed += result.processedCount;
    this.stats.totalFailed += result.failedCount;

    if (result.success && result.failedCount === 0) {
      // All writes recovered successfully, clear the unavailable flag
      await mongodbFallbackService.setMongoDBAvailable();
      
      // Clear any remaining pending writes (should be empty)
      await mongodbFallbackService.clearPendingWrites();

      this.triggerAlert('MongoDB recovery completed successfully', {
        processedCount: result.processedCount,
        duration: result.duration,
        timestamp: Date.now(),
      });

      console.log(`[MongoDB Recovery] Recovery completed: ${result.processedCount} writes processed in ${result.duration}ms`);
    } else if (result.failedCount > 0) {
      this.triggerAlert('MongoDB recovery completed with errors', {
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        errors: result.errors,
        duration: result.duration,
        timestamp: Date.now(),
      });

      console.log(`[MongoDB Recovery] Recovery completed with errors: ${result.processedCount} processed, ${result.failedCount} failed`);
    }
  }

  /**
   * Manually trigger a recovery attempt
   * Useful for testing or manual intervention
   */
  async triggerRecovery(): Promise<RecoveryResult> {
    console.log('[MongoDB Recovery] Manual recovery triggered');
    return this.recoverPendingWrites();
  }

  /**
   * Reset statistics (for testing purposes)
   */
  resetStats(): void {
    this.stats = {
      status: this.status,
      lastCheckTime: null,
      lastRecoveryTime: null,
      lastRecoveryResult: null,
      totalRecoveries: 0,
      totalProcessed: 0,
      totalFailed: 0,
    };
  }
}

// Export singleton instance
export const mongodbRecoveryService = new MongoDBRecoveryService();
