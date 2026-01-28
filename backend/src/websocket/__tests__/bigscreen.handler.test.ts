/**
 * Big Screen WebSocket Connection Handler Tests
 * 
 * Tests for big screen WebSocket connection handling:
 * - Connection authentication and state retrieval
 * - Redis connection status updates
 * - MongoDB fallback for session state
 * - Error handling and disconnection
 * - Audit logging
 */

import { Socket } from 'socket.io';
import {
  handleBigScreenConnection,
  handleBigScreenDisconnection,
} from '../bigscreen.handler';
import { redisService } from '../../services/redis.service';
import { mongodbService } from '../../services/mongodb.service';

// Mock dependencies
jest.mock('../../services/redis.service');
jest.mock('../../services/mongodb.service');

describe('BigScreen Handler', () => {
  let mockSocket: Partial<Socket>;
  let mockRedisClient: any;
  let mockDb: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock socket
    mockSocket = {
      id: 'socket-123',
      data: {
        sessionId: 'session-456',
        role: 'bigscreen',
      },
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    // Mock Redis client
    mockRedisClient = {
      hset: jest.fn().mockResolvedValue('OK'),
      expire: jest.fn().mockResolvedValue(1),
      hgetall: jest.fn(),
    };

    (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

    // Mock MongoDB
    mockDb = {
      collection: jest.fn(),
    };

    (mongodbService.getDb as jest.Mock).mockReturnValue(mockDb);
  });

  describe('handleBigScreenConnection', () => {
    it('should handle big screen connection successfully', async () => {
      // Mock session exists in MongoDB
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-456',
          state: 'LOBBY',
          currentQuestionIndex: 0,
          participantCount: 5,
        } as any),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      // Mock Redis session state
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'LOBBY',
        currentQuestionIndex: '0',
        participantCount: '5',
      });

      await handleBigScreenConnection(mockSocket as Socket);

      // Verify big screen connection was updated in Redis
      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'session:session-456:bigscreen',
        expect.objectContaining({
          socketId: 'socket-123',
          connectedAt: expect.any(String),
        })
      );

      // Verify TTL was set
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'session:session-456:bigscreen',
        21600 // 6 hours
      );

      // Verify authenticated event was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        success: true,
        sessionId: 'session-456',
        currentState: {
          state: 'LOBBY',
          currentQuestionIndex: 0,
          participantCount: 5,
        },
      });
    });

    it('should include remaining time when in ACTIVE_QUESTION state', async () => {
      const futureTime = Date.now() + 30000; // 30 seconds in future

      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-456',
          state: 'ACTIVE_QUESTION',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      mockRedisClient.hgetall.mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: '1',
        participantCount: '10',
        timerEndTime: futureTime.toString(),
      });

      await handleBigScreenConnection(mockSocket as Socket);

      // Verify authenticated event includes remaining time
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        success: true,
        sessionId: 'session-456',
        currentState: expect.objectContaining({
          state: 'ACTIVE_QUESTION',
          remainingTime: expect.any(Number),
        }),
      });

      // Verify remaining time is approximately 30 seconds (allow 1 second tolerance)
      const emitCall = (mockSocket.emit as jest.Mock).mock.calls[0];
      const remainingTime = (emitCall[1] as any).currentState.remainingTime;
      expect(remainingTime).toBeGreaterThanOrEqual(29);
      expect(remainingTime).toBeLessThanOrEqual(31);
    });

    it('should fallback to MongoDB when Redis state is empty', async () => {
      // Mock empty Redis state
      mockRedisClient.hgetall.mockResolvedValue({});

      // Mock MongoDB session
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-456',
          state: 'REVEAL',
          currentQuestionIndex: 2,
          participantCount: 8,
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      await handleBigScreenConnection(mockSocket as Socket);

      // Verify MongoDB was queried twice (once for verification, once for state)
      expect(mockSessionsCollection.findOne).toHaveBeenCalledTimes(2);

      // Verify authenticated event was emitted with MongoDB data
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        success: true,
        sessionId: 'session-456',
        currentState: {
          state: 'REVEAL',
          currentQuestionIndex: 2,
          participantCount: 8,
        },
      });
    });

    it('should emit error and disconnect when session does not exist', async () => {
      // Mock session not found
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      await handleBigScreenConnection(mockSocket as Socket);

      // Verify error was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith('auth_error', {
        error: 'Failed to authenticate big screen',
      });

      // Verify socket was disconnected
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle Redis connection errors gracefully', async () => {
      // Mock session exists
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-456',
          state: 'LOBBY',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      // Mock Redis error
      mockRedisClient.hset.mockRejectedValue(new Error('Redis connection failed'));

      await handleBigScreenConnection(mockSocket as Socket);

      // Verify error was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith('auth_error', {
        error: 'Failed to authenticate big screen',
      });

      // Verify socket was disconnected
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle MongoDB errors gracefully', async () => {
      // Mock MongoDB error
      const mockSessionsCollection = {
        findOne: jest.fn().mockRejectedValue(new Error('MongoDB connection failed')),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      await handleBigScreenConnection(mockSocket as Socket);

      // Verify error was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith('auth_error', {
        error: 'Failed to authenticate big screen',
      });

      // Verify socket was disconnected
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle ENDED state correctly', async () => {
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-456',
          state: 'ENDED',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      mockRedisClient.hgetall.mockResolvedValue({
        state: 'ENDED',
        currentQuestionIndex: '5',
        participantCount: '12',
      });

      await handleBigScreenConnection(mockSocket as Socket);

      // Verify authenticated event was emitted with ENDED state
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        success: true,
        sessionId: 'session-456',
        currentState: {
          state: 'ENDED',
          currentQuestionIndex: 5,
          participantCount: 12,
        },
      });
    });
  });

  describe('handleBigScreenDisconnection', () => {
    it('should handle big screen disconnection successfully', async () => {
      const mockAuditLogsCollection = {
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'log-id' }),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'auditLogs') return mockAuditLogsCollection;
        return null;
      });

      await handleBigScreenDisconnection(mockSocket as Socket, 'client namespace disconnect');

      // Verify big screen disconnection was updated in Redis
      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'session:session-456:bigscreen',
        expect.objectContaining({
          socketId: '',
          disconnectedAt: expect.any(String),
        })
      );

      // Verify TTL was refreshed
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'session:session-456:bigscreen',
        21600 // 6 hours
      );

      // Verify audit log was created
      expect(mockAuditLogsCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date),
          eventType: 'BIGSCREEN_DISCONNECTED',
          sessionId: 'session-456',
          details: expect.objectContaining({
            reason: 'client namespace disconnect',
          }),
        })
      );
    });

    it('should handle Redis errors during disconnection gracefully', async () => {
      const mockAuditLogsCollection = {
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'log-id' }),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'auditLogs') return mockAuditLogsCollection;
        return null;
      });

      // Mock Redis error
      mockRedisClient.hset.mockRejectedValue(new Error('Redis connection failed'));

      // Should not throw
      await expect(
        handleBigScreenDisconnection(mockSocket as Socket, 'transport close')
      ).resolves.not.toThrow();

      // Verify audit log was still attempted
      expect(mockAuditLogsCollection.insertOne).toHaveBeenCalled();
    });

    it('should handle MongoDB errors during disconnection gracefully', async () => {
      const mockAuditLogsCollection = {
        insertOne: jest.fn().mockRejectedValue(new Error('MongoDB connection failed')),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'auditLogs') return mockAuditLogsCollection;
        return null;
      });

      // Should not throw
      await expect(
        handleBigScreenDisconnection(mockSocket as Socket, 'ping timeout')
      ).resolves.not.toThrow();

      // Verify Redis update was still attempted
      expect(mockRedisClient.hset).toHaveBeenCalled();
    });

    it('should handle different disconnection reasons', async () => {
      const reasons = [
        'transport close',
        'client namespace disconnect',
        'ping timeout',
        'transport error',
      ];

      for (const reason of reasons) {
        jest.clearAllMocks();

        const mockAuditLogsCollection = {
          insertOne: jest.fn().mockResolvedValue({ insertedId: 'log-id' }),
        };

        mockDb.collection.mockImplementation((name: string) => {
          if (name === 'auditLogs') return mockAuditLogsCollection;
          return null;
        });

        await handleBigScreenDisconnection(mockSocket as Socket, reason);

        // Verify audit log includes the specific reason
        expect(mockAuditLogsCollection.insertOne).toHaveBeenCalledWith(
          expect.objectContaining({
            details: expect.objectContaining({
              reason,
            }),
          })
        );
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing socket data gracefully', async () => {
      const incompleteSocket = {
        id: 'socket-123',
        data: {}, // Missing sessionId
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await handleBigScreenConnection(incompleteSocket);

      // Should emit error and disconnect
      expect(incompleteSocket.emit).toHaveBeenCalledWith('auth_error', {
        error: 'Failed to authenticate big screen',
      });
      expect(incompleteSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle expired timer gracefully (negative remaining time)', async () => {
      const pastTime = Date.now() - 5000; // 5 seconds in past

      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-456',
          state: 'ACTIVE_QUESTION',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      mockRedisClient.hgetall.mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: '1',
        participantCount: '10',
        timerEndTime: pastTime.toString(),
      });

      await handleBigScreenConnection(mockSocket as Socket);

      // Verify remaining time is 0 (not negative)
      const emitCall = (mockSocket.emit as jest.Mock).mock.calls[0];
      const remainingTime = (emitCall[1] as any).currentState.remainingTime;
      expect(remainingTime).toBe(0);
    });

    it('should handle REVEAL state without timer', async () => {
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-456',
          state: 'REVEAL',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      mockRedisClient.hgetall.mockResolvedValue({
        state: 'REVEAL',
        currentQuestionIndex: '2',
        participantCount: '15',
        // No timerEndTime in REVEAL state
      });

      await handleBigScreenConnection(mockSocket as Socket);

      // Verify authenticated event does not include remaining time
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        success: true,
        sessionId: 'session-456',
        currentState: {
          state: 'REVEAL',
          currentQuestionIndex: 2,
          participantCount: 15,
        },
      });
    });

    it('should handle zero participants', async () => {
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-456',
          state: 'LOBBY',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      mockRedisClient.hgetall.mockResolvedValue({
        state: 'LOBBY',
        currentQuestionIndex: '0',
        participantCount: '0',
      });

      await handleBigScreenConnection(mockSocket as Socket);

      // Verify authenticated event includes zero participants
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        success: true,
        sessionId: 'session-456',
        currentState: {
          state: 'LOBBY',
          currentQuestionIndex: 0,
          participantCount: 0,
        },
      });
    });

    it('should handle large participant counts', async () => {
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-456',
          state: 'ACTIVE_QUESTION',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      mockRedisClient.hgetall.mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: '3',
        participantCount: '1000',
      });

      await handleBigScreenConnection(mockSocket as Socket);

      // Verify authenticated event includes large participant count
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        success: true,
        sessionId: 'session-456',
        currentState: expect.objectContaining({
          participantCount: 1000,
        }),
      });
    });

    it('should prioritize Redis state over MongoDB state', async () => {
      // Mock different states in Redis and MongoDB
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: '2',
        participantCount: '20',
      });

      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-456',
          state: 'LOBBY', // Different state in MongoDB
          currentQuestionIndex: 0,
          participantCount: 5,
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      await handleBigScreenConnection(mockSocket as Socket);

      // Verify Redis state was used (ACTIVE_QUESTION, not LOBBY from MongoDB)
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        success: true,
        sessionId: 'session-456',
        currentState: {
          state: 'ACTIVE_QUESTION',
          currentQuestionIndex: 2,
          participantCount: 20,
        },
      });
    });

    it('should handle invalid numeric values in Redis gracefully', async () => {
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-456',
          state: 'LOBBY',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      mockRedisClient.hgetall.mockResolvedValue({
        state: 'LOBBY',
        currentQuestionIndex: 'invalid',
        participantCount: 'not-a-number',
      });

      await handleBigScreenConnection(mockSocket as Socket);

      // Should handle NaN gracefully (parseInt returns NaN for invalid strings)
      const emitCall = (mockSocket.emit as jest.Mock).mock.calls[0];
      const currentState = (emitCall[1] as any).currentState;
      
      // NaN values should be present (parseInt behavior)
      expect(isNaN(currentState.currentQuestionIndex)).toBe(true);
      expect(isNaN(currentState.participantCount)).toBe(true);
    });
  });
});
