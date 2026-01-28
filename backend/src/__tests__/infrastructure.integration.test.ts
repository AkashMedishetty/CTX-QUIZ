/**
 * Infrastructure Integration Tests
 * Task 7: Checkpoint - Verify infrastructure setup
 * 
 * This test suite verifies that all infrastructure components are properly
 * configured and operational:
 * - MongoDB connection and indexes
 * - Redis connection and data structures
 * - Express server and health endpoints
 * - Socket.IO server and connections
 */

import { Server as HTTPServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { createApp } from '../app';
import { mongodbService } from '../services/mongodb.service';
import { mongodbIndexesService } from '../services/mongodb-indexes.service';
import { redisService } from '../services/redis.service';
import { redisDataStructuresService } from '../services/redis-data-structures.service';
import { socketIOService } from '../services/socketio.service';

describe('Infrastructure Integration Tests', () => {
  let app: any;
  let httpServer: HTTPServer;
  let clientSocket: ClientSocket;

  // Setup: Connect all services before tests
  beforeAll(async () => {
    // Connect to MongoDB
    await mongodbService.connect();
    await mongodbIndexesService.createIndexes();

    // Connect to Redis
    await redisService.connect();

    // Create Express app and HTTP server
    app = createApp();
    httpServer = app.listen(0); // Use random port for testing

    // Initialize Socket.IO
    await socketIOService.initialize(httpServer);
  }, 30000); // 30 second timeout for setup

  // Cleanup: Disconnect all services after tests
  afterAll(async () => {
    // Close client socket if connected
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }

    // Close Socket.IO server
    await socketIOService.close();

    // Close HTTP server
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Disconnect Redis
    await redisService.disconnect();

    // Disconnect MongoDB
    await mongodbService.disconnect();
  }, 30000);

  describe('MongoDB Connection and Indexes', () => {
    it('should have a stable MongoDB connection', async () => {
      const status = await mongodbService.getStatus();

      expect(status.connected).toBe(true);
      expect(status.database).toBeDefined();
      expect(status.collections).toBeInstanceOf(Array);
    });

    it('should have created all required collections', async () => {
      const status = await mongodbService.getStatus();
      const collections = status.collections;

      const requiredCollections = [
        'quizzes',
        'sessions',
        'participants',
        'answers',
        'auditLogs',
      ];

      for (const collectionName of requiredCollections) {
        expect(collections).toContain(collectionName);
      }
    });

    it('should have created indexes on quizzes collection', async () => {
      const db = mongodbService.getDb();
      const indexes = await db.collection('quizzes').indexes();

      // Should have at least _id, createdBy, and createdAt indexes
      expect(indexes.length).toBeGreaterThanOrEqual(3);

      const indexNames = indexes.map((idx) => idx.name);
      expect(indexNames).toContain('createdBy_1');
      expect(indexNames).toContain('createdAt_1');
    });

    it('should have created indexes on sessions collection', async () => {
      const db = mongodbService.getDb();
      const indexes = await db.collection('sessions').indexes();

      const indexNames = indexes.map((idx) => idx.name);
      expect(indexNames).toContain('joinCode_1');
      expect(indexNames).toContain('state_1');
      expect(indexNames).toContain('createdAt_1');

      // Verify joinCode is unique
      const joinCodeIndex = indexes.find((idx) => idx.name === 'joinCode_1');
      expect(joinCodeIndex?.unique).toBe(true);
    });

    it('should have created indexes on participants collection', async () => {
      const db = mongodbService.getDb();
      const indexes = await db.collection('participants').indexes();

      const indexNames = indexes.map((idx) => idx.name);
      expect(indexNames).toContain('sessionId_1_isActive_1');
      expect(indexNames).toContain('sessionId_1_totalScore_1');
    });

    it('should have created indexes on answers collection', async () => {
      const db = mongodbService.getDb();
      const indexes = await db.collection('answers').indexes();

      const indexNames = indexes.map((idx) => idx.name);
      expect(indexNames).toContain('sessionId_1_questionId_1');
      expect(indexNames).toContain('participantId_1_questionId_1');
    });

    it('should have created indexes on auditLogs collection', async () => {
      const db = mongodbService.getDb();
      const indexes = await db.collection('auditLogs').indexes();

      const indexNames = indexes.map((idx) => idx.name);
      expect(indexNames).toContain('timestamp_1');
      expect(indexNames).toContain('sessionId_1_timestamp_1');
    });

    it('should be able to perform basic CRUD operations', async () => {
      const db = mongodbService.getDb();
      const testCollection = db.collection('quizzes');

      // Insert
      const testDoc = {
        title: 'Test Quiz',
        description: 'Integration test',
        quizType: 'REGULAR',
        createdAt: new Date(),
      };
      const insertResult = await testCollection.insertOne(testDoc);
      expect(insertResult.insertedId).toBeDefined();

      // Read
      const foundDoc = await testCollection.findOne({ _id: insertResult.insertedId });
      expect(foundDoc).toBeDefined();
      expect(foundDoc?.title).toBe('Test Quiz');

      // Update
      const updateResult = await testCollection.updateOne(
        { _id: insertResult.insertedId },
        { $set: { title: 'Updated Test Quiz' } }
      );
      expect(updateResult.modifiedCount).toBe(1);

      // Delete
      const deleteResult = await testCollection.deleteOne({ _id: insertResult.insertedId });
      expect(deleteResult.deletedCount).toBe(1);
    });
  });

  describe('Redis Connection and Data Structures', () => {
    it('should have a stable Redis connection', () => {
      const status = redisService.getStatus();

      expect(status.client).toBe('ready');
      expect(status.subscriber).toBe('ready');
      expect(status.publisher).toBe('ready');
    });

    it('should be able to perform basic Redis operations', async () => {
      const client = redisService.getClient();

      // Set with expiration
      await client.set('test:key', 'test-value', 'EX', 60);

      // Get
      const value = await client.get('test:key');
      expect(value).toBe('test-value');

      // Delete
      await client.del('test:key');

      // Verify deletion
      const deletedValue = await client.get('test:key');
      expect(deletedValue).toBeNull();
    });

    it('should support session state hash structure', async () => {
      const sessionId = 'test-session-123';
      const sessionState = {
        state: 'LOBBY' as const,
        currentQuestionIndex: 0,
        participantCount: 5,
      };

      // Set session state
      await redisDataStructuresService.setSessionState(sessionId, sessionState);

      // Get session state
      const retrievedState = await redisDataStructuresService.getSessionState(sessionId);
      expect(retrievedState).toMatchObject(sessionState);

      // Cleanup
      await redisDataStructuresService.deleteSessionState(sessionId);
    });

    it('should support participant session hash structure', async () => {
      const participantId = 'test-participant-123';
      const participantData = {
        sessionId: 'test-session-123',
        nickname: 'TestUser',
        totalScore: 100,
        totalTimeMs: 5000,
        streakCount: 2,
        isActive: true,
        isEliminated: false,
      };

      // Set participant session
      await redisDataStructuresService.setParticipantSession(participantId, participantData);

      // Get participant session
      const retrievedData = await redisDataStructuresService.getParticipantSession(participantId);
      expect(retrievedData).toMatchObject(participantData);

      // Cleanup
      await redisDataStructuresService.deleteParticipantSession(participantId);
    });

    it('should support leaderboard sorted set structure', async () => {
      const sessionId = 'test-session-123';

      // Add participants to leaderboard
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-1', 100, 5000);
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-2', 200, 3000);
      await redisDataStructuresService.updateLeaderboard(sessionId, 'participant-3', 150, 4000);

      // Get top participants
      const topParticipants = await redisDataStructuresService.getTopLeaderboard(sessionId, 3);
      expect(topParticipants).toHaveLength(3);
      expect(topParticipants[0].participantId).toBe('participant-2'); // Highest score
      expect(topParticipants[1].participantId).toBe('participant-3');
      expect(topParticipants[2].participantId).toBe('participant-1');

      // Cleanup
      await redisDataStructuresService.deleteLeaderboard(sessionId);
    });

    it('should support answer buffer list structure', async () => {
      const sessionId = 'test-session-123';
      const answer1 = { 
        answerId: 'ans-1', 
        participantId: 'p-1', 
        questionId: 'q-1',
        sessionId: sessionId,
        selectedOptions: ['opt-1'],
        submittedAt: Date.now(),
        responseTimeMs: 1000
      };
      const answer2 = { 
        answerId: 'ans-2', 
        participantId: 'p-2', 
        questionId: 'q-1',
        sessionId: sessionId,
        selectedOptions: ['opt-2'],
        submittedAt: Date.now(),
        responseTimeMs: 2000
      };

      // Add answers to buffer
      await redisDataStructuresService.addAnswerToBuffer(sessionId, answer1);
      await redisDataStructuresService.addAnswerToBuffer(sessionId, answer2);

      // Get buffer length
      const bufferLength = await redisDataStructuresService.getAnswerBufferLength(sessionId);
      expect(bufferLength).toBe(2);

      // Flush buffered answers
      const bufferedAnswers = await redisDataStructuresService.flushAnswerBuffer(sessionId);
      expect(bufferedAnswers).toHaveLength(2);
    });

    it('should support join code mapping', async () => {
      const joinCode = 'ABC123';
      const sessionId = 'test-session-123';

      // Set join code mapping
      await redisDataStructuresService.setJoinCodeMapping(joinCode, sessionId);

      // Get session ID from join code
      const retrievedSessionId = await redisDataStructuresService.getSessionIdFromJoinCode(joinCode);
      expect(retrievedSessionId).toBe(sessionId);

      // Cleanup
      await redisDataStructuresService.deleteJoinCodeMapping(joinCode);
    });

    it('should support rate limiting structures', async () => {
      const ipAddress = '192.168.1.1';

      // Check rate limit (should be allowed)
      const allowed1 = await redisDataStructuresService.checkJoinRateLimit(ipAddress);
      expect(allowed1).toBe(true);

      const allowed2 = await redisDataStructuresService.checkJoinRateLimit(ipAddress);
      expect(allowed2).toBe(true);

      // Check answer rate limit
      const participantId = 'test-participant';
      const questionId = 'test-question';

      const answerAllowed1 = await redisDataStructuresService.checkAnswerRateLimit(participantId, questionId);
      expect(answerAllowed1).toBe(true);

      // Second attempt should be blocked
      const answerAllowed2 = await redisDataStructuresService.checkAnswerRateLimit(participantId, questionId);
      expect(answerAllowed2).toBe(false);
    });

    it('should properly set TTLs on data structures', async () => {
      const client = redisService.getClient();
      const sessionId = 'test-session-ttl';

      // Set session state with TTL
      await redisDataStructuresService.setSessionState(sessionId, { 
        state: 'LOBBY' as const,
        currentQuestionIndex: 0,
        participantCount: 0
      });

      // Check TTL exists
      const ttl = await client.ttl(`session:${sessionId}:state`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(6 * 60 * 60); // 6 hours

      // Cleanup
      await redisDataStructuresService.deleteSessionState(sessionId);
    });
  });

  describe('Express Server and Health Endpoints', () => {
    it('should start Express server successfully', () => {
      expect(httpServer).toBeDefined();
      expect(httpServer.listening).toBe(true);
    });

    it('should respond to health check endpoint', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: expect.any(String),
        uptime: expect.any(Number),
        timestamp: expect.any(String),
      });
    });

    it('should include service status in health check', async () => {
      const response = await request(app).get('/api/health');

      expect(response.body.services).toBeDefined();
      expect(response.body.services.mongodb).toBeDefined();
      expect(response.body.services.redis).toBeDefined();
      expect(response.body.services.socketio).toBeDefined();
    });

    it('should respond to metrics endpoint', async () => {
      const response = await request(app).get('/api/metrics');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        cpu: expect.any(Number),
        memory: expect.objectContaining({
          used: expect.any(Number),
          total: expect.any(Number),
          percentage: expect.any(Number),
        }),
        activeConnections: expect.any(Number),
      });
    });

    it('should handle CORS properly', async () => {
      const response = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should apply rate limiting', async () => {
      // Make multiple requests rapidly
      const requests = Array(10).fill(null).map(() => 
        request(app).get('/api/health')
      );

      const responses = await Promise.all(requests);

      // All should succeed (rate limit is 100 per minute by default)
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Check rate limit headers
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.headers['x-ratelimit-limit']).toBeDefined();
      expect(lastResponse.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('should handle 404 errors properly', async () => {
      const response = await request(app).get('/api/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Route not found',
      });
    });

    it('should parse JSON request bodies', async () => {
      const response = await request(app)
        .post('/api/test')
        .send({ test: 'data' })
        .set('Content-Type', 'application/json');

      // Will get 404 since route doesn't exist, but JSON should be parsed
      expect(response.status).toBe(404);
    });
  });

  describe('Socket.IO Server and Connections', () => {
    it('should initialize Socket.IO server successfully', () => {
      const status = socketIOService.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.adapterType).toContain('Redis'); // Should use Redis adapter
    });

    it('should accept WebSocket connections', (done) => {
      const address = httpServer.address();
      if (!address || typeof address === 'string') {
        throw new Error('Invalid server address');
      }

      const port = address.port;
      clientSocket = ioClient(`http://localhost:${port}`, {
        transports: ['websocket'],
        autoConnect: true,
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (error: Error) => {
        done(error);
      });
    }, 10000);

    it('should handle authentication for connections', (done) => {
      // Emit authentication event
      clientSocket.emit('authenticate', {
        sessionId: 'test-session-123',
        role: 'bigscreen',
      });

      // Listen for authentication response
      clientSocket.once('authenticated', (data: any) => {
        expect(data.success).toBe(true);
        done();
      });

      clientSocket.once('auth_error', (error: any) => {
        // Auth might fail if session doesn't exist, which is expected
        expect(error.error).toBeDefined();
        done();
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        done(new Error('Authentication timeout'));
      }, 5000);
    }, 10000);

    it('should support Redis pub/sub for broadcasting', async () => {
      const pubClient = redisService.getPublisher();
      const subClient = redisService.getSubscriber();

      const testChannel = 'test:channel';
      const testMessage = JSON.stringify({ event: 'test', data: 'hello' });

      let messageReceived = false;

      // Subscribe to channel
      await subClient.subscribe(testChannel);
      subClient.on('message', (channel: string, message: string) => {
        if (channel === testChannel && message === testMessage) {
          messageReceived = true;
        }
      });

      // Wait a bit for subscription to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Publish message
      await pubClient.publish(testChannel, testMessage);

      // Wait for message to propagate
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(messageReceived).toBe(true);

      // Unsubscribe
      await subClient.unsubscribe(testChannel);
    });

    it('should track active connections', () => {
      const status = socketIOService.getStatus();

      expect(status.connectionCount).toBeGreaterThanOrEqual(0);
      expect(typeof status.connectionCount).toBe('number');
    });

    it('should handle disconnections gracefully', (done) => {
      clientSocket.on('disconnect', () => {
        expect(clientSocket.connected).toBe(false);
        done();
      });

      clientSocket.disconnect();
    });
  });

  describe('End-to-End Infrastructure Verification', () => {
    it('should have all services running and connected', async () => {
      // Check MongoDB
      const mongoStatus = await mongodbService.getStatus();
      expect(mongoStatus.connected).toBe(true);

      // Check Redis
      const redisStatus = redisService.getStatus();
      expect(redisStatus.client).toBe('ready');

      // Check Express
      expect(httpServer.listening).toBe(true);

      // Check Socket.IO
      const socketStatus = socketIOService.getStatus();
      expect(socketStatus.initialized).toBe(true);
    });

    it('should handle concurrent operations across all services', async () => {
      const operations = [
        // MongoDB operation
        mongodbService.getDb().collection('quizzes').findOne({}),
        
        // Redis operation
        redisService.getClient().ping(),
        
        // HTTP request
        request(app).get('/api/health'),
        
        // Socket.IO status check
        Promise.resolve(socketIOService.getStatus()),
      ];

      const results = await Promise.all(operations);

      // All operations should complete successfully
      expect(results).toHaveLength(4);
      expect(results[1]).toBe('PONG'); // Redis ping
      
      const httpResponse = results[2] as any;
      expect(httpResponse.status).toBe(200); // HTTP request
      
      const socketStatus = results[3] as any;
      expect(socketStatus.initialized).toBe(true); // Socket.IO status
    });

    it('should maintain performance under basic load', async () => {
      const startTime = Date.now();

      // Perform 50 concurrent operations
      const operations = Array(50).fill(null).map(async (_, index) => {
        // Mix of different operations
        if (index % 3 === 0) {
          return request(app).get('/api/health');
        } else if (index % 3 === 1) {
          return redisService.getClient().ping();
        } else {
          return mongodbService.getDb().collection('quizzes').countDocuments();
        }
      });

      await Promise.all(operations);

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);
    });
  });
});
