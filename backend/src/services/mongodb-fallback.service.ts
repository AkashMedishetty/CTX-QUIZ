/**
 * MongoDB Fallback Service
 * 
 * Provides graceful degradation when MongoDB is unavailable:
 * - Detects MongoDB unavailability (connection errors, timeouts)
 * - Writes data to Redis fallback storage when MongoDB fails
 * - Sets mongodb:unavailable flag in Redis when MongoDB is down
 * - Triggers monitoring alerts when fallback is activated
 * - Tracks pending writes for later recovery
 * 
 * Fallback Storage Structure in Redis:
 * - Key pattern: fallback:mongodb:{collection}:{id}
 * - Store serialized documents with TTL (1 hour)
 * - Track pending writes in Redis list: fallback:mongodb:pending
 * 
 * Requirements: 17.2
 */

import { redisService } from './redis.service';
import { mongodbService } from './mongodb.service';

// TTL constants (in seconds)
const TTL = {
  FALLBACK_DOCUMENT: 60 * 60, // 1 hour
  UNAVAILABLE_FLAG: 5 * 60, // 5 minutes (auto-reset for retry)
} as const;

// Redis key patterns
const KEYS = {
  UNAVAILABLE_FLAG: 'mongodb:unavailable',
  PENDING_WRITES: 'fallback:mongodb:pending',
  FALLBACK_DOCUMENT: (collection: string, id: string) => 
    `fallback:mongodb:${collection}:${id}`,
} as const;

// Pending write operation interface
export interface PendingWrite {
  id: string;
  collection: string;
  operation: 'insert' | 'update' | 'delete';
  document?: Record<string, any>;
  filter?: Record<string, any>;
  update?: Record<string, any>;
  timestamp: number;
}

// Fallback document interface
export interface FallbackDocument {
  id: string;
  collection: string;
  document: Record<string, any>;
  timestamp: number;
  operation: 'insert' | 'update';
}

// MongoDB error types that indicate unavailability
const UNAVAILABILITY_ERROR_CODES = [
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
];

const UNAVAILABILITY_ERROR_MESSAGES = [
  'connection',
  'timeout',
  'network',
  'socket',
  'topology',
  'server selection',
  'not connected',
  'pool destroyed',
];

class MongoDBFallbackService {
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
    // Log the alert
    console.error(`[MongoDB Fallback Alert] ${message}`, details);

    // Call all registered alert callbacks
    for (const callback of this.alertCallbacks) {
      try {
        callback(message, details);
      } catch (error) {
        console.error('[MongoDB Fallback] Error in alert callback:', error);
      }
    }
  }

  /**
   * Check if an error indicates MongoDB unavailability
   * @param error - The error to check
   * @returns True if the error indicates MongoDB is unavailable
   */
  isUnavailabilityError(error: any): boolean {
    if (!error) return false;

    // Check error code
    if (error.code && UNAVAILABILITY_ERROR_CODES.includes(error.code)) {
      return true;
    }

    // Check error message
    const errorMessage = (error.message || '').toLowerCase();
    for (const pattern of UNAVAILABILITY_ERROR_MESSAGES) {
      if (errorMessage.includes(pattern)) {
        return true;
      }
    }

    // Check for MongoDB driver specific errors
    if (error.name === 'MongoNetworkError' || 
        error.name === 'MongoServerSelectionError' ||
        error.name === 'MongoTimeoutError') {
      return true;
    }

    return false;
  }

  /**
   * Check if MongoDB is currently available
   * First checks the Redis flag, then optionally pings MongoDB
   * @param pingMongo - Whether to ping MongoDB directly (default: false)
   * @returns True if MongoDB is available
   */
  async isMongoDBAvailable(pingMongo: boolean = false): Promise<boolean> {
    try {
      // First check the Redis unavailable flag
      const client = redisService.getClient();
      const unavailableFlag = await client.get(KEYS.UNAVAILABLE_FLAG);
      
      if (unavailableFlag === 'true') {
        return false;
      }

      // If requested, also ping MongoDB directly
      if (pingMongo) {
        return mongodbService.isHealthy();
      }

      return true;
    } catch (error) {
      // If Redis is also unavailable, assume MongoDB might be available
      console.error('[MongoDB Fallback] Error checking availability:', error);
      return true;
    }
  }

  /**
   * Set MongoDB as unavailable in Redis
   * This sets a flag that other services can check
   */
  async setMongoDBUnavailable(): Promise<void> {
    try {
      const client = redisService.getClient();
      await client.set(KEYS.UNAVAILABLE_FLAG, 'true', 'EX', TTL.UNAVAILABLE_FLAG);
      
      this.triggerAlert('MongoDB marked as unavailable', {
        timestamp: Date.now(),
        ttl: TTL.UNAVAILABLE_FLAG,
      });
    } catch (error) {
      console.error('[MongoDB Fallback] Failed to set unavailable flag:', error);
    }
  }

  /**
   * Clear the MongoDB unavailable flag
   * Called when MongoDB becomes available again
   */
  async setMongoDBAvailable(): Promise<void> {
    try {
      const client = redisService.getClient();
      await client.del(KEYS.UNAVAILABLE_FLAG);
      
      console.log('[MongoDB Fallback] MongoDB marked as available');
    } catch (error) {
      console.error('[MongoDB Fallback] Failed to clear unavailable flag:', error);
    }
  }

  /**
   * Write a document to Redis fallback storage
   * @param collection - The MongoDB collection name
   * @param id - The document ID
   * @param document - The document to store
   * @param operation - The operation type (insert or update)
   */
  async writeToFallback(
    collection: string,
    id: string,
    document: Record<string, any>,
    operation: 'insert' | 'update' = 'insert'
  ): Promise<void> {
    try {
      const client = redisService.getClient();
      const key = KEYS.FALLBACK_DOCUMENT(collection, id);
      
      const fallbackDoc: FallbackDocument = {
        id,
        collection,
        document,
        timestamp: Date.now(),
        operation,
      };

      // Store the document with TTL
      await client.set(key, JSON.stringify(fallbackDoc), 'EX', TTL.FALLBACK_DOCUMENT);

      // Add to pending writes list
      const pendingWrite: PendingWrite = {
        id,
        collection,
        operation,
        document,
        timestamp: Date.now(),
      };
      await client.lpush(KEYS.PENDING_WRITES, JSON.stringify(pendingWrite));

      console.log(`[MongoDB Fallback] Document written to fallback: ${collection}/${id}`);
    } catch (error) {
      console.error('[MongoDB Fallback] Failed to write to fallback:', error);
      throw error;
    }
  }

  /**
   * Read a document from Redis fallback storage
   * @param collection - The MongoDB collection name
   * @param id - The document ID
   * @returns The fallback document or null if not found
   */
  async readFromFallback(collection: string, id: string): Promise<FallbackDocument | null> {
    try {
      const client = redisService.getClient();
      const key = KEYS.FALLBACK_DOCUMENT(collection, id);
      
      const data = await client.get(key);
      
      if (!data) {
        return null;
      }

      return JSON.parse(data) as FallbackDocument;
    } catch (error) {
      console.error('[MongoDB Fallback] Failed to read from fallback:', error);
      return null;
    }
  }

  /**
   * Delete a document from Redis fallback storage
   * @param collection - The MongoDB collection name
   * @param id - The document ID
   */
  async deleteFromFallback(collection: string, id: string): Promise<void> {
    try {
      const client = redisService.getClient();
      const key = KEYS.FALLBACK_DOCUMENT(collection, id);
      await client.del(key);
    } catch (error) {
      console.error('[MongoDB Fallback] Failed to delete from fallback:', error);
    }
  }

  /**
   * Track a delete operation for later recovery
   * @param collection - The MongoDB collection name
   * @param id - The document ID
   * @param filter - The filter used for deletion
   */
  async trackDeleteOperation(
    collection: string,
    id: string,
    filter: Record<string, any>
  ): Promise<void> {
    try {
      const client = redisService.getClient();
      
      const pendingWrite: PendingWrite = {
        id,
        collection,
        operation: 'delete',
        filter,
        timestamp: Date.now(),
      };
      
      await client.lpush(KEYS.PENDING_WRITES, JSON.stringify(pendingWrite));
    } catch (error) {
      console.error('[MongoDB Fallback] Failed to track delete operation:', error);
    }
  }

  /**
   * Get all pending writes from the queue
   * @returns Array of pending write operations
   */
  async getPendingWrites(): Promise<PendingWrite[]> {
    try {
      const client = redisService.getClient();
      const writes = await client.lrange(KEYS.PENDING_WRITES, 0, -1);
      
      return writes.map(w => JSON.parse(w) as PendingWrite);
    } catch (error) {
      console.error('[MongoDB Fallback] Failed to get pending writes:', error);
      return [];
    }
  }

  /**
   * Get the count of pending writes
   * @returns Number of pending write operations
   */
  async getPendingWriteCount(): Promise<number> {
    try {
      const client = redisService.getClient();
      return await client.llen(KEYS.PENDING_WRITES);
    } catch (error) {
      console.error('[MongoDB Fallback] Failed to get pending write count:', error);
      return 0;
    }
  }

  /**
   * Remove a pending write from the queue (after successful recovery)
   * @param count - Number of items to remove from the end of the list
   */
  async removePendingWrites(count: number): Promise<void> {
    try {
      const client = redisService.getClient();
      // Remove from the right (oldest items)
      for (let i = 0; i < count; i++) {
        await client.rpop(KEYS.PENDING_WRITES);
      }
    } catch (error) {
      console.error('[MongoDB Fallback] Failed to remove pending writes:', error);
    }
  }

  /**
   * Clear all pending writes (use with caution)
   */
  async clearPendingWrites(): Promise<void> {
    try {
      const client = redisService.getClient();
      await client.del(KEYS.PENDING_WRITES);
    } catch (error) {
      console.error('[MongoDB Fallback] Failed to clear pending writes:', error);
    }
  }

  /**
   * Execute a MongoDB operation with automatic fallback
   * If MongoDB fails, writes to Redis fallback storage
   * 
   * @param collection - The MongoDB collection name
   * @param id - The document ID
   * @param operation - The operation to perform
   * @param document - The document data
   * @returns True if operation succeeded (either MongoDB or fallback)
   */
  async executeWithFallback(
    collection: string,
    id: string,
    operation: 'insert' | 'update',
    document: Record<string, any>
  ): Promise<{ success: boolean; usedFallback: boolean }> {
    // First check if MongoDB is marked as unavailable
    const isAvailable = await this.isMongoDBAvailable();
    
    if (!isAvailable) {
      // MongoDB is known to be unavailable, use fallback directly
      await this.writeToFallback(collection, id, document, operation);
      return { success: true, usedFallback: true };
    }

    try {
      // Try MongoDB operation
      const db = mongodbService.getDb();
      const coll = db.collection(collection);

      if (operation === 'insert') {
        // Use the id as a string field, not as _id (which expects ObjectId)
        await coll.insertOne({ documentId: id, ...document } as any);
      } else {
        await coll.updateOne({ documentId: id } as any, { $set: document }, { upsert: true });
      }

      return { success: true, usedFallback: false };
    } catch (error: any) {
      // Check if this is an unavailability error
      if (this.isUnavailabilityError(error)) {
        // Mark MongoDB as unavailable
        await this.setMongoDBUnavailable();
        
        // Write to fallback
        await this.writeToFallback(collection, id, document, operation);
        
        this.triggerAlert('MongoDB operation failed, using fallback', {
          collection,
          id,
          operation,
          error: error.message,
          timestamp: Date.now(),
        });

        return { success: true, usedFallback: true };
      }

      // Non-unavailability error, rethrow
      throw error;
    }
  }

  /**
   * Get fallback service status for health checks
   */
  async getStatus(): Promise<{
    mongodbAvailable: boolean;
    pendingWriteCount: number;
    unavailableFlagSet: boolean;
  }> {
    try {
      const client = redisService.getClient();
      
      const [unavailableFlag, pendingCount] = await Promise.all([
        client.get(KEYS.UNAVAILABLE_FLAG),
        client.llen(KEYS.PENDING_WRITES),
      ]);

      return {
        mongodbAvailable: unavailableFlag !== 'true',
        pendingWriteCount: pendingCount,
        unavailableFlagSet: unavailableFlag === 'true',
      };
    } catch (error) {
      console.error('[MongoDB Fallback] Failed to get status:', error);
      return {
        mongodbAvailable: true,
        pendingWriteCount: 0,
        unavailableFlagSet: false,
      };
    }
  }
}

// Export singleton instance
export const mongodbFallbackService = new MongoDBFallbackService();
