/**
 * MongoDB Service
 * Handles MongoDB Atlas connection with connection pooling and retry logic
 * Includes circuit breaker pattern for graceful degradation
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 17.8, 18.5
 */

import { MongoClient, Db, Collection, Document, Filter, UpdateFilter, OptionalUnlessRequiredId, WithId } from 'mongodb';
import { config } from '../config';
import { CircuitBreaker, CircuitBreakerFactory, CircuitOpenError } from '../utils/circuit-breaker';
import { mongodbFallbackService } from './mongodb-fallback.service';

class MongoDBService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000; // Start with 1 second
  private circuitBreaker: CircuitBreaker;

  constructor() {
    // Initialize circuit breaker for MongoDB operations
    this.circuitBreaker = CircuitBreakerFactory.forDatabase('mongodb', {
      onStateChange: (from, to) => {
        this.handleCircuitStateChange(from, to);
      },
      onFailure: (error) => {
        console.error('[MongoDB] Circuit breaker recorded failure:', error?.message || error);
      },
      onSuccess: () => {
        // Success is logged by circuit breaker when recovering from failures
      },
    });
  }

  /**
   * Handle circuit breaker state changes
   * Notifies the fallback service when MongoDB becomes unavailable/available
   */
  private handleCircuitStateChange(from: string, to: string): void {
    console.log(`[MongoDB] Circuit breaker state changed: ${from} → ${to}`);
    
    if (to === 'OPEN') {
      // MongoDB is unavailable, notify fallback service
      mongodbFallbackService.setMongoDBUnavailable();
      console.warn('[MongoDB] Circuit OPEN - falling back to Redis for writes');
    } else if (to === 'CLOSED') {
      // MongoDB recovered, notify fallback service
      mongodbFallbackService.setMongoDBAvailable();
      console.log('[MongoDB] Circuit CLOSED - MongoDB operations restored');
    } else if (to === 'HALF_OPEN') {
      console.log('[MongoDB] Circuit HALF_OPEN - testing MongoDB availability');
    }
  }

  /**
   * Get the circuit breaker instance (for testing/monitoring)
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Initialize MongoDB connection with connection pooling
   */
  async connect(): Promise<void> {
    try {
      console.log('Connecting to MongoDB Atlas...');

      this.client = new MongoClient(config.mongodb.uri, {
        maxPoolSize: 50, // Max connections in pool
        minPoolSize: 10, // Min connections in pool
        maxIdleTimeMS: 30000, // Close idle connections after 30s
        serverSelectionTimeoutMS: 5000, // Timeout for server selection
        socketTimeoutMS: 45000, // Socket timeout
        retryWrites: true, // Retry failed writes
        retryReads: true, // Retry failed reads
      });

      await this.client.connect();
      this.db = this.client.db(config.mongodb.dbName);
      this.isConnected = true;
      this.reconnectAttempts = 0;

      console.log(`✓ Connected to MongoDB database: ${config.mongodb.dbName}`);

      // Set up connection event handlers
      this.setupEventHandlers();

      // Initialize collections and indexes
      await this.initializeCollections();
    } catch (error) {
      console.error('Failed to connect to MongoDB:', error);
      await this.handleConnectionError(error);
    }
  }

  /**
   * Set up event handlers for connection monitoring
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connectionPoolCreated', () => {
      console.log('MongoDB connection pool created');
    });

    this.client.on('connectionPoolClosed', () => {
      console.log('MongoDB connection pool closed');
      this.isConnected = false;
    });

    this.client.on('serverHeartbeatFailed', (event) => {
      console.error('MongoDB heartbeat failed:', event);
    });

    this.client.on('topologyDescriptionChanged', (event) => {
      console.log('MongoDB topology changed:', {
        previousType: event.previousDescription.type,
        newType: event.newDescription.type,
      });
    });
  }

  /**
   * Handle connection errors with exponential backoff retry
   */
  private async handleConnectionError(_error: any): Promise<void> {
    this.isConnected = false;
    this.reconnectAttempts++;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `Failed to connect to MongoDB after ${this.maxReconnectAttempts} attempts`
      );
      throw new Error('MongoDB connection failed: Maximum retry attempts reached');
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, ... up to 30s
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    console.log(
      `Retrying MongoDB connection in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    await new Promise((resolve) => setTimeout(resolve, delay));
    await this.connect();
  }

  /**
   * Initialize collections and create indexes
   */
  private async initializeCollections(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    console.log('Initializing MongoDB collections...');

    // Create collections if they don't exist
    const collections = await this.db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);

    const requiredCollections = ['quizzes', 'sessions', 'participants', 'answers', 'auditLogs'];

    for (const collectionName of requiredCollections) {
      if (!collectionNames.includes(collectionName)) {
        await this.db.createCollection(collectionName);
        console.log(`✓ Created collection: ${collectionName}`);
      }
    }

    console.log('✓ All collections initialized');
  }

  /**
   * Get database instance
   */
  getDb(): Db {
    if (!this.db || !this.isConnected) {
      throw new Error('MongoDB not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Get a specific collection
   */
  getCollection<T extends Document = Document>(name: string): Collection<T> {
    return this.getDb().collection<T>(name);
  }

  /**
   * Check if MongoDB is connected
   */
  isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get connection status for health checks
   */
  async getStatus(): Promise<{
    connected: boolean;
    database: string;
    collections: string[];
  }> {
    if (!this.isConnected || !this.db) {
      return {
        connected: false,
        database: config.mongodb.dbName,
        collections: [],
      };
    }

    try {
      // Ping database to verify connection
      await this.db.admin().ping();

      const collections = await this.db.listCollections().toArray();

      return {
        connected: true,
        database: config.mongodb.dbName,
        collections: collections.map((c) => c.name),
      };
    } catch (error) {
      console.error('Error getting MongoDB status:', error);
      return {
        connected: false,
        database: config.mongodb.dbName,
        collections: [],
      };
    }
  }

  /**
   * Close MongoDB connection
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      console.log('Closing MongoDB connection...');
      await this.client.close();
      this.isConnected = false;
      this.client = null;
      this.db = null;
      console.log('✓ MongoDB connection closed');
    }
  }

  /**
   * Execute operation with automatic retry on transient errors
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Check if error is retryable
        const isRetryable =
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ENOTFOUND' ||
          error.message?.includes('connection') ||
          error.message?.includes('timeout');

        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(
          `MongoDB operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  // ==================== Circuit Breaker Wrapped Operations ====================
  // These methods wrap MongoDB operations with circuit breaker protection
  // and fall back to Redis when the circuit is open.
  // Requirements: 17.8

  /**
   * Find a single document with circuit breaker protection
   * Falls back to Redis on circuit open
   * 
   * @param collectionName - The collection to query
   * @param filter - The filter to apply
   * @returns The document or null if not found
   */
  async findOneWithCircuitBreaker<T extends Document>(
    collectionName: string,
    filter: Filter<T>
  ): Promise<WithId<T> | null> {
    try {
      return await this.circuitBreaker.execute(async () => {
        const collection = this.getCollection<T>(collectionName);
        return await collection.findOne(filter);
      });
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        // Circuit is open, try to read from fallback
        console.log(`[MongoDB] Circuit open, attempting fallback read for ${collectionName}`);
        
        // Extract ID from filter for fallback lookup
        const id = this.extractIdFromFilter(filter);
        if (id) {
          const fallbackDoc = await mongodbFallbackService.readFromFallback(collectionName, id);
          if (fallbackDoc) {
            console.log(`[MongoDB] Found document in fallback: ${collectionName}/${id}`);
            return fallbackDoc.document as WithId<T>;
          }
        }
        
        // No fallback data available
        console.warn(`[MongoDB] No fallback data available for ${collectionName}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Find multiple documents with circuit breaker protection
   * Returns empty array on circuit open (no fallback for bulk reads)
   * 
   * @param collectionName - The collection to query
   * @param filter - The filter to apply
   * @param options - Query options (limit, sort, etc.)
   * @returns Array of documents
   */
  async findWithCircuitBreaker<T extends Document>(
    collectionName: string,
    filter: Filter<T>,
    options?: { limit?: number; skip?: number; sort?: Record<string, 1 | -1> }
  ): Promise<WithId<T>[]> {
    try {
      return await this.circuitBreaker.execute(async () => {
        const collection = this.getCollection<T>(collectionName);
        let cursor = collection.find(filter);
        
        if (options?.sort) {
          cursor = cursor.sort(options.sort);
        }
        if (options?.skip) {
          cursor = cursor.skip(options.skip);
        }
        if (options?.limit) {
          cursor = cursor.limit(options.limit);
        }
        
        return await cursor.toArray();
      });
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        // Circuit is open, return empty array (no bulk fallback support)
        console.warn(`[MongoDB] Circuit open, returning empty array for find on ${collectionName}`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Insert a document with circuit breaker protection
   * Falls back to Redis on circuit open
   * 
   * @param collectionName - The collection to insert into
   * @param document - The document to insert
   * @returns Insert result with insertedId, or fallback result
   */
  async insertOneWithCircuitBreaker<T extends Document>(
    collectionName: string,
    document: OptionalUnlessRequiredId<T>
  ): Promise<{ insertedId: any; usedFallback: boolean }> {
    try {
      const result = await this.circuitBreaker.execute(async () => {
        const collection = this.getCollection<T>(collectionName);
        return await collection.insertOne(document);
      });
      return { insertedId: result.insertedId, usedFallback: false };
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        // Circuit is open, write to fallback
        console.log(`[MongoDB] Circuit open, writing to fallback for ${collectionName}`);
        
        // Generate an ID if not present
        const docWithId = document as any;
        const id = docWithId._id?.toString() || docWithId.documentId || this.generateFallbackId();
        
        await mongodbFallbackService.writeToFallback(
          collectionName,
          id,
          document as Record<string, any>,
          'insert'
        );
        
        console.log(`[MongoDB] Document written to fallback: ${collectionName}/${id}`);
        return { insertedId: id, usedFallback: true };
      }
      throw error;
    }
  }

  /**
   * Update a document with circuit breaker protection
   * Falls back to Redis on circuit open
   * 
   * @param collectionName - The collection to update
   * @param filter - The filter to find the document
   * @param update - The update operations
   * @param options - Update options (upsert, etc.)
   * @returns Update result
   */
  async updateOneWithCircuitBreaker<T extends Document>(
    collectionName: string,
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options?: { upsert?: boolean }
  ): Promise<{ matchedCount: number; modifiedCount: number; usedFallback: boolean }> {
    try {
      const result = await this.circuitBreaker.execute(async () => {
        const collection = this.getCollection<T>(collectionName);
        return await collection.updateOne(filter, update, options);
      });
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        usedFallback: false,
      };
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        // Circuit is open, write update to fallback
        console.log(`[MongoDB] Circuit open, writing update to fallback for ${collectionName}`);
        
        const id = this.extractIdFromFilter(filter);
        if (id) {
          // Store the update operation in fallback
          // Extract $set values if present, otherwise store the whole update
          const updateData = (update as any).$set || update;
          
          await mongodbFallbackService.writeToFallback(
            collectionName,
            id,
            { filter, update: updateData, options },
            'update'
          );
          
          console.log(`[MongoDB] Update written to fallback: ${collectionName}/${id}`);
          return { matchedCount: 0, modifiedCount: 0, usedFallback: true };
        }
        
        // Cannot determine ID for fallback
        console.error(`[MongoDB] Cannot write update to fallback - no ID in filter`);
        throw new Error('Circuit open and cannot determine document ID for fallback');
      }
      throw error;
    }
  }

  /**
   * Delete a document with circuit breaker protection
   * Tracks delete operation in fallback on circuit open
   * 
   * @param collectionName - The collection to delete from
   * @param filter - The filter to find the document
   * @returns Delete result
   */
  async deleteOneWithCircuitBreaker<T extends Document>(
    collectionName: string,
    filter: Filter<T>
  ): Promise<{ deletedCount: number; usedFallback: boolean }> {
    try {
      const result = await this.circuitBreaker.execute(async () => {
        const collection = this.getCollection<T>(collectionName);
        return await collection.deleteOne(filter);
      });
      return { deletedCount: result.deletedCount, usedFallback: false };
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        // Circuit is open, track delete operation for later
        console.log(`[MongoDB] Circuit open, tracking delete for fallback: ${collectionName}`);
        
        const id = this.extractIdFromFilter(filter);
        if (id) {
          await mongodbFallbackService.trackDeleteOperation(
            collectionName,
            id,
            filter as Record<string, any>
          );
          
          console.log(`[MongoDB] Delete tracked in fallback: ${collectionName}/${id}`);
          return { deletedCount: 0, usedFallback: true };
        }
        
        // Cannot determine ID for fallback
        console.error(`[MongoDB] Cannot track delete in fallback - no ID in filter`);
        throw new Error('Circuit open and cannot determine document ID for fallback');
      }
      throw error;
    }
  }

  /**
   * Count documents with circuit breaker protection
   * Returns 0 on circuit open
   * 
   * @param collectionName - The collection to count
   * @param filter - The filter to apply
   * @returns Document count
   */
  async countDocumentsWithCircuitBreaker<T extends Document>(
    collectionName: string,
    filter: Filter<T>
  ): Promise<number> {
    try {
      return await this.circuitBreaker.execute(async () => {
        const collection = this.getCollection<T>(collectionName);
        return await collection.countDocuments(filter);
      });
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        console.warn(`[MongoDB] Circuit open, returning 0 for count on ${collectionName}`);
        return 0;
      }
      throw error;
    }
  }

  /**
   * Extract document ID from a filter object
   * Supports _id, documentId, and common ID field patterns
   */
  private extractIdFromFilter(filter: any): string | null {
    if (!filter) return null;
    
    // Direct _id field
    if (filter._id) {
      return filter._id.toString();
    }
    
    // documentId field (used in fallback service)
    if (filter.documentId) {
      return filter.documentId.toString();
    }
    
    // Common ID patterns
    if (filter.id) {
      return filter.id.toString();
    }
    
    // Session-specific IDs
    if (filter.sessionId) {
      return filter.sessionId.toString();
    }
    
    if (filter.participantId) {
      return filter.participantId.toString();
    }
    
    if (filter.quizId) {
      return filter.quizId.toString();
    }
    
    return null;
  }

  /**
   * Generate a fallback ID for documents without an ID
   */
  private generateFallbackId(): string {
    return `fallback_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitBreakerStatus(): {
    state: string;
    failureCount: number;
    lastFailureTime: number | null;
  } {
    return {
      state: this.circuitBreaker.getState(),
      failureCount: this.circuitBreaker.getFailureCount(),
      lastFailureTime: this.circuitBreaker.getLastFailureTime(),
    };
  }

  /**
   * Reset the circuit breaker (for testing/recovery)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
    console.log('[MongoDB] Circuit breaker reset');
  }
}

// Export singleton instance
export const mongodbService = new MongoDBService();

// Re-export CircuitOpenError for consumers
export { CircuitOpenError } from '../utils/circuit-breaker';
