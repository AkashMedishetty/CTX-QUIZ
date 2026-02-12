/**
 * Test Database Utilities
 * 
 * Provides functions for managing test database connections and cleanup.
 * These utilities ensure test isolation by:
 * - Connecting to a dedicated test database
 * - Cleaning up test data after each test
 * - Providing fail-fast behavior on connection errors
 * 
 * Requirements: 7.1, 7.4, 7.6
 */

import { MongoClient, Db } from 'mongodb';
import Redis from 'ioredis';

// Test database configuration
const TEST_MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/quiz_platform_test';
const TEST_REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/15';

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let redisClient: Redis | null = null;

/**
 * Connect to the test MongoDB database
 * Fails fast if connection cannot be established
 */
export async function connectToTestDatabase(): Promise<Db> {
  if (mongoDb) {
    return mongoDb;
  }

  try {
    // Verify we're using a test database (safety check)
    if (!TEST_MONGODB_URI.includes('test') && !TEST_MONGODB_URI.includes('localhost')) {
      throw new Error(
        'SAFETY CHECK FAILED: Test database URI does not appear to be a test database. ' +
        'URI must contain "test" or "localhost" to prevent accidental production data deletion.'
      );
    }

    mongoClient = new MongoClient(TEST_MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });

    await mongoClient.connect();
    mongoDb = mongoClient.db();

    // Verify connection
    await mongoDb.command({ ping: 1 });

    return mongoDb;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to connect to test database: ${message}`);
  }
}

/**
 * Connect to the test Redis database
 * Fails fast if connection cannot be established
 */
export async function connectToTestRedis(): Promise<Redis> {
  if (redisClient && redisClient.status === 'ready') {
    return redisClient;
  }

  try {
    redisClient = new Redis(TEST_REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: false,
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, 5000);

      redisClient!.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      redisClient!.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    return redisClient;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to connect to test Redis: ${message}`);
  }
}

/**
 * Disconnect from the test MongoDB database
 */
export async function disconnectFromTestDatabase(): Promise<void> {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    mongoDb = null;
  }
}

/**
 * Disconnect from the test Redis database
 */
export async function disconnectFromTestRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Clean up all test data from MongoDB collections
 * This should be called after each test to ensure isolation
 */
export async function cleanupTestData(): Promise<void> {
  if (!mongoDb) {
    return;
  }

  const collections = ['quizzes', 'sessions', 'participants', 'answers', 'auditLogs', 'tournaments'];

  for (const collectionName of collections) {
    try {
      const collection = mongoDb.collection(collectionName);
      await collection.deleteMany({});
    } catch {
      // Collection might not exist, which is fine
    }
  }
}

/**
 * Clean up all test data from Redis
 * This should be called after each test to ensure isolation
 */
export async function cleanupTestRedisData(): Promise<void> {
  if (!redisClient) {
    return;
  }

  try {
    // Flush the current database (test database only)
    await redisClient.flushdb();
  } catch {
    // Ignore errors during cleanup
  }
}

/**
 * Get the test MongoDB database instance
 * Throws if not connected
 */
export function getTestDb(): Db {
  if (!mongoDb) {
    throw new Error('Test database not connected. Call connectToTestDatabase() first.');
  }
  return mongoDb;
}

/**
 * Get the test Redis client instance
 * Throws if not connected
 */
export function getTestRedis(): Redis {
  if (!redisClient) {
    throw new Error('Test Redis not connected. Call connectToTestRedis() first.');
  }
  return redisClient;
}

/**
 * Setup function for test suites that need database access
 * Call this in beforeAll()
 */
export async function setupTestDatabase(): Promise<{ db: Db; redis: Redis }> {
  const db = await connectToTestDatabase();
  const redis = await connectToTestRedis();
  return { db, redis };
}

/**
 * Teardown function for test suites
 * Call this in afterAll()
 */
export async function teardownTestDatabase(): Promise<void> {
  await cleanupTestData();
  await cleanupTestRedisData();
  await disconnectFromTestDatabase();
  await disconnectFromTestRedis();
}

/**
 * Cleanup function for individual tests
 * Call this in afterEach()
 */
export async function cleanupAfterTest(): Promise<void> {
  await cleanupTestData();
  await cleanupTestRedisData();
}
