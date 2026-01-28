/**
 * Integration Tests for WebSocket Participant Connection
 * 
 * Tests the full flow from Socket.IO connection through authentication
 * to participant handler execution
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { socketIOService } from '../../services/socketio.service';
import { redisService } from '../../services/redis.service';
import { mongodbService } from '../../services/mongodb.service';
import { generateParticipantToken } from '../../middleware/socket-auth';

describe('WebSocket Participant Connection Integration', () => {
  let httpServer: HttpServer;
  let clientSocket: ClientSocket;
  let serverPort: number;

  beforeAll(async () => {
    // Ensure Redis and MongoDB are connected
    if (!redisService.isConnected()) {
      await redisService.connect();
    }
    if (!mongodbService.isConnected()) {
      await mongodbService.connect();
    }

    // Create HTTP server
    httpServer = require('http').createServer();
    
    // Initialize Socket.IO server
    await socketIOService.initialize(httpServer);

    // Start server on random port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        serverPort = (httpServer.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Clean up
    if (clientSocket) {
      clientSocket.disconnect();
    }
    await socketIOService.close();
    httpServer.close();
    await redisService.disconnect();
    await mongodbService.disconnect();
  });

  beforeEach(async () => {
    // Set up test data in Redis
    const redis = redisService.getClient();
    
    // Create test session
    await redis.hset('session:test-session-123:state', {
      state: 'LOBBY',
      currentQuestionIndex: '0',
      participantCount: '1',
    });

    // Create test participant
    await redis.hset('participant:test-participant-456:session', {
      sessionId: 'test-session-123',
      nickname: 'TestUser',
      totalScore: '0',
      isActive: 'false',
      isBanned: 'false',
    });
  });

  afterEach(async () => {
    // Clean up test data
    const redis = redisService.getClient();
    await redis.del('session:test-session-123:state');
    await redis.del('participant:test-participant-456:session');
  });

  it('should successfully connect and authenticate a participant', (done) => {
    // Generate valid token
    const token = generateParticipantToken(
      'test-participant-456',
      'test-session-123',
      'TestUser'
    );

    // Connect client
    clientSocket = ioClient(`http://localhost:${serverPort}`, {
      auth: {
        token,
        role: 'participant',
      },
      transports: ['websocket'],
    });

    // Listen for authenticated event
    clientSocket.on('authenticated', (data) => {
      try {
        expect(data.success).toBe(true);
        expect(data.participantId).toBe('test-participant-456');
        expect(data.sessionId).toBe('test-session-123');
        expect(data.nickname).toBe('TestUser');
        expect(data.currentState).toBeDefined();
        expect(data.currentState.state).toBe('LOBBY');
        done();
      } catch (error) {
        done(error);
      }
    });

    // Listen for errors
    clientSocket.on('auth_error', (error) => {
      done(new Error(`Authentication failed: ${error.error}`));
    });

    clientSocket.on('connect_error', (error) => {
      done(new Error(`Connection failed: ${error.message}`));
    });
  }, 10000); // 10 second timeout

  it('should reject connection with invalid token', (done) => {
    // Connect with invalid token
    clientSocket = ioClient(`http://localhost:${serverPort}`, {
      auth: {
        token: 'invalid-token',
        role: 'participant',
      },
      transports: ['websocket'],
    });

    // Should receive connection error
    clientSocket.on('connect_error', (error) => {
      expect(error.message).toContain('Invalid token');
      done();
    });

    // Should not receive authenticated event
    clientSocket.on('authenticated', () => {
      done(new Error('Should not authenticate with invalid token'));
    });
  }, 10000);

  it('should reject connection without token', (done) => {
    // Connect without token
    clientSocket = ioClient(`http://localhost:${serverPort}`, {
      auth: {
        role: 'participant',
      },
      transports: ['websocket'],
    });

    // Should receive connection error
    clientSocket.on('connect_error', (error) => {
      expect(error.message).toContain('Missing authentication token');
      done();
    });
  }, 10000);

  it('should update participant connection status in Redis', (done) => {
    const token = generateParticipantToken(
      'test-participant-456',
      'test-session-123',
      'TestUser'
    );

    clientSocket = ioClient(`http://localhost:${serverPort}`, {
      auth: {
        token,
        role: 'participant',
      },
      transports: ['websocket'],
    });

    clientSocket.on('authenticated', async () => {
      try {
        // Verify Redis was updated
        const redis = redisService.getClient();
        const participantData = await redis.hgetall('participant:test-participant-456:session');
        
        expect(participantData.isActive).toBe('true');
        expect(participantData.socketId).toBeDefined();
        expect(participantData.socketId).not.toBe('');
        
        done();
      } catch (error) {
        done(error);
      }
    });

    clientSocket.on('connect_error', (error) => {
      done(new Error(`Connection failed: ${error.message}`));
    });
  }, 10000);
});
