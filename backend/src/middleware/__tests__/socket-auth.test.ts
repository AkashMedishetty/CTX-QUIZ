/**
 * Socket.IO Authentication Middleware Tests
 * 
 * Tests authentication for:
 * - Participant connections with JWT tokens
 * - Controller connections with session IDs
 * - Big screen connections with session IDs
 * - Error cases (invalid tokens, missing data, banned participants, etc.)
 */

import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { socketAuthMiddleware, generateParticipantToken, SocketData } from '../socket-auth';
import { mongodbService } from '../../services/mongodb.service';
import { redisService } from '../../services/redis.service';
import { config } from '../../config';

// Mock services
jest.mock('../../services/mongodb.service');
jest.mock('../../services/redis.service');

describe('Socket Authentication Middleware', () => {
  let mockSocket: Partial<Socket>;
  let mockNext: jest.Mock;
  let mockRedisClient: any;
  let mockDb: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock socket
    mockSocket = {
      id: 'test-socket-id',
      handshake: {
        auth: {},
      } as any,
      data: {} as SocketData,
    };

    // Mock next function
    mockNext = jest.fn();

    // Mock Redis client
    mockRedisClient = {
      hgetall: jest.fn(),
    };
    (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

    // Mock MongoDB
    mockDb = {
      collection: jest.fn(),
    };
    (mongodbService.getDb as jest.Mock).mockReturnValue(mockDb);
  });

  describe('Participant Authentication', () => {
    const participantId = 'participant-123';
    const sessionId = 'session-456';
    const nickname = 'TestUser';

    it('should authenticate participant with valid JWT token', async () => {
      // Generate valid token
      const token = generateParticipantToken(participantId, sessionId, nickname);

      // Set up socket handshake
      mockSocket.handshake!.auth = {
        token,
        role: 'participant',
      };

      // Mock session exists in Redis
      mockRedisClient.hgetall.mockResolvedValueOnce({
        state: 'LOBBY',
        sessionId,
      });

      // Mock participant exists in Redis
      mockRedisClient.hgetall.mockResolvedValueOnce({
        participantId,
        sessionId,
        nickname,
        isBanned: 'false',
      });

      // Execute middleware
      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      // Verify authentication succeeded
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockSocket.data).toEqual({
        participantId,
        sessionId,
        role: 'participant',
        nickname,
      });
    });

    it('should reject participant with missing token', async () => {
      mockSocket.handshake!.auth = {
        role: 'participant',
      };

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Missing authentication token');
    });

    it('should reject participant with invalid token', async () => {
      mockSocket.handshake!.auth = {
        token: 'invalid-token',
        role: 'participant',
      };

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Invalid token');
    });

    it('should reject participant with expired token', async () => {
      // Generate expired token
      const expiredToken = jwt.sign(
        { participantId, sessionId, nickname },
        config.jwt.secret,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      mockSocket.handshake!.auth = {
        token: expiredToken,
        role: 'participant',
      };

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Token expired');
    });

    it('should reject participant with invalid token payload', async () => {
      // Generate token with missing fields
      const invalidToken = jwt.sign(
        { participantId }, // Missing sessionId and nickname
        config.jwt.secret
      );

      mockSocket.handshake!.auth = {
        token: invalidToken,
        role: 'participant',
      };

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Invalid token payload');
    });

    it('should reject participant when session does not exist', async () => {
      const token = generateParticipantToken(participantId, sessionId, nickname);

      mockSocket.handshake!.auth = {
        token,
        role: 'participant',
      };

      // Mock session not found in Redis
      mockRedisClient.hgetall.mockResolvedValueOnce({});

      // Mock session not found in MongoDB
      const mockCollection = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      mockDb.collection.mockReturnValue(mockCollection);

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Session not found or ended');
    });

    it('should reject participant when session is ended', async () => {
      const token = generateParticipantToken(participantId, sessionId, nickname);

      mockSocket.handshake!.auth = {
        token,
        role: 'participant',
      };

      // Mock session exists but is ended
      mockRedisClient.hgetall.mockResolvedValueOnce({
        state: 'ENDED',
        sessionId,
      });

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Session not found or ended');
    });

    it('should reject banned participant', async () => {
      const token = generateParticipantToken(participantId, sessionId, nickname);

      mockSocket.handshake!.auth = {
        token,
        role: 'participant',
      };

      // Mock session exists
      mockRedisClient.hgetall.mockResolvedValueOnce({
        state: 'LOBBY',
        sessionId,
      });

      // Mock participant is banned
      mockRedisClient.hgetall.mockResolvedValueOnce({
        participantId,
        sessionId,
        nickname,
        isBanned: 'true',
      });

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Participant not found or banned');
    });

    it('should fallback to MongoDB when Redis data not found', async () => {
      const token = generateParticipantToken(participantId, sessionId, nickname);

      mockSocket.handshake!.auth = {
        token,
        role: 'participant',
      };

      // Mock Redis returns empty (not found)
      mockRedisClient.hgetall.mockResolvedValue({});

      // Mock MongoDB session exists
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId,
          state: 'LOBBY',
        }),
      };

      // Mock MongoDB participant exists
      const mockParticipantsCollection = {
        findOne: jest.fn().mockResolvedValue({
          participantId,
          sessionId,
          nickname,
          isBanned: false,
        }),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'sessions') return mockSessionsCollection;
        if (name === 'participants') return mockParticipantsCollection;
        return null;
      });

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockSocket.data).toEqual({
        participantId,
        sessionId,
        role: 'participant',
        nickname,
      });
      expect(mockSessionsCollection.findOne).toHaveBeenCalled();
      expect(mockParticipantsCollection.findOne).toHaveBeenCalled();
    });
  });

  describe('Controller Authentication', () => {
    const sessionId = 'session-789';

    it('should authenticate controller with valid session ID', async () => {
      mockSocket.handshake!.auth = {
        sessionId,
        role: 'controller',
      };

      // Mock session exists in Redis
      mockRedisClient.hgetall.mockResolvedValueOnce({
        state: 'LOBBY',
        sessionId,
      });

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockSocket.data).toEqual({
        sessionId,
        role: 'controller',
      });
    });

    it('should reject controller with missing session ID', async () => {
      mockSocket.handshake!.auth = {
        role: 'controller',
      };

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Missing session ID');
    });

    it('should reject controller when session does not exist', async () => {
      mockSocket.handshake!.auth = {
        sessionId,
        role: 'controller',
      };

      // Mock session not found
      mockRedisClient.hgetall.mockResolvedValueOnce({});

      const mockCollection = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      mockDb.collection.mockReturnValue(mockCollection);

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Session not found or ended');
    });

    it('should reject controller when session is ended', async () => {
      mockSocket.handshake!.auth = {
        sessionId,
        role: 'controller',
      };

      // Mock session is ended
      mockRedisClient.hgetall.mockResolvedValueOnce({
        state: 'ENDED',
        sessionId,
      });

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Session not found or ended');
    });
  });

  describe('Big Screen Authentication', () => {
    const sessionId = 'session-999';

    it('should authenticate big screen with valid session ID', async () => {
      mockSocket.handshake!.auth = {
        sessionId,
        role: 'bigscreen',
      };

      // Mock session exists in Redis
      mockRedisClient.hgetall.mockResolvedValueOnce({
        state: 'ACTIVE_QUESTION',
        sessionId,
      });

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockSocket.data).toEqual({
        sessionId,
        role: 'bigscreen',
      });
    });

    it('should reject big screen with missing session ID', async () => {
      mockSocket.handshake!.auth = {
        role: 'bigscreen',
      };

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Missing session ID');
    });
  });

  describe('Role Validation', () => {
    it('should reject connection with missing role', async () => {
      mockSocket.handshake!.auth = {
        token: 'some-token',
      };

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Invalid or missing role');
    });

    it('should reject connection with invalid role', async () => {
      mockSocket.handshake!.auth = {
        role: 'invalid-role',
        token: 'some-token',
      };

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Invalid or missing role');
    });
  });

  describe('generateParticipantToken', () => {
    it('should generate valid JWT token with correct payload', () => {
      const participantId = 'participant-abc';
      const sessionId = 'session-xyz';
      const nickname = 'TestUser';

      const token = generateParticipantToken(participantId, sessionId, nickname);

      // Verify token can be decoded
      const decoded = jwt.verify(token, config.jwt.secret) as any;

      expect(decoded.participantId).toBe(participantId);
      expect(decoded.sessionId).toBe(sessionId);
      expect(decoded.nickname).toBe(nickname);
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });

    it('should generate token that expires according to config', () => {
      const token = generateParticipantToken('p1', 's1', 'User');
      const decoded = jwt.verify(token, config.jwt.secret) as any;

      // Token should expire in the future
      const now = Math.floor(Date.now() / 1000);
      expect(decoded.exp).toBeGreaterThan(now);

      // Token should expire within configured time (6 hours default)
      const expectedExpiry = now + (6 * 60 * 60); // 6 hours
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 10); // Allow 10s tolerance
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis errors gracefully', async () => {
      const token = generateParticipantToken('p1', 's1', 'User');

      mockSocket.handshake!.auth = {
        token,
        role: 'participant',
      };

      // Mock Redis error
      mockRedisClient.hgetall.mockRejectedValue(new Error('Redis connection failed'));

      // Mock MongoDB fallback
      const mockCollection = {
        findOne: jest.fn().mockResolvedValue(null),
      };
      mockDb.collection.mockReturnValue(mockCollection);

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      // Should fallback to MongoDB and eventually fail
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle MongoDB errors gracefully', async () => {
      const token = generateParticipantToken('p1', 's1', 'User');

      mockSocket.handshake!.auth = {
        token,
        role: 'participant',
      };

      // Mock Redis returns empty
      mockRedisClient.hgetall.mockResolvedValue({});

      // Mock MongoDB error
      const mockCollection = {
        findOne: jest.fn().mockRejectedValue(new Error('MongoDB connection failed')),
      };
      mockDb.collection.mockReturnValue(mockCollection);

      await socketAuthMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
