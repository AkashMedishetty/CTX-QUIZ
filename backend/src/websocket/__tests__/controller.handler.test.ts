/**
 * Tests for Controller WebSocket Connection Handler
 * 
 * Tests:
 * - Controller connection handling
 * - Session verification
 * - Session state retrieval
 * - Controller data updates in Redis
 * - Disconnection handling
 * - Error handling
 */

import { Socket } from 'socket.io';
import {
  handleControllerConnection,
  handleControllerDisconnection,
} from '../controller.handler';
import { redisService } from '../../services/redis.service';
import { mongodbService } from '../../services/mongodb.service';
import { SocketData } from '../../middleware/socket-auth';

// Mock dependencies
jest.mock('../../services/redis.service');
jest.mock('../../services/mongodb.service');

describe('Controller WebSocket Handler', () => {
  let mockSocket: Partial<Socket>;
  let mockRedisClient: any;
  let mockDb: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock socket
    mockSocket = {
      id: 'socket-controller-123',
      data: {
        sessionId: 'session-789',
        role: 'controller',
      } as SocketData,
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    // Mock Redis client
    mockRedisClient = {
      hset: jest.fn().mockResolvedValue('OK'),
      hgetall: jest.fn(),
      expire: jest.fn().mockResolvedValue(1),
    };

    (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

    // Mock MongoDB
    mockDb = {
      collection: jest.fn(),
    };

    (mongodbService.getDb as jest.Mock).mockReturnValue(mockDb);
  });

  describe('handleControllerConnection', () => {
    it('should handle controller connection successfully', async () => {
      // Mock session exists in MongoDB
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-789',
          state: 'LOBBY',
          currentQuestionIndex: 0,
          participantCount: 5,
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      // Mock Redis session state
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'LOBBY',
        currentQuestionIndex: '0',
        participantCount: '5',
      });

      await handleControllerConnection(mockSocket as Socket);

      // Verify session existence was checked
      expect(mockDb.collection).toHaveBeenCalledWith('sessions');
      expect(mockSessionsCollection.findOne).toHaveBeenCalledWith({
        sessionId: 'session-789',
      });

      // Verify controller connection was updated in Redis
      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'session:session-789:controller',
        expect.objectContaining({
          socketId: 'socket-controller-123',
        })
      );

      // Verify TTL was set to 6 hours
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'session:session-789:controller',
        21600 // 6 hours
      );

      // Verify authenticated event was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'authenticated',
        expect.objectContaining({
          success: true,
          sessionId: 'session-789',
          currentState: expect.objectContaining({
            state: 'LOBBY',
            currentQuestionIndex: 0,
            participantCount: 5,
          }),
        })
      );
    });

    it('should include remaining time for ACTIVE_QUESTION state', async () => {
      // Mock session exists
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-789',
          state: 'ACTIVE_QUESTION',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      // Mock Redis session state with active question
      const futureTime = Date.now() + 45000; // 45 seconds in future
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: '3',
        participantCount: '12',
        timerEndTime: futureTime.toString(),
      });

      await handleControllerConnection(mockSocket as Socket);

      // Verify authenticated event includes remaining time
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'authenticated',
        expect.objectContaining({
          currentState: expect.objectContaining({
            state: 'ACTIVE_QUESTION',
            remainingTime: expect.any(Number),
          }),
        })
      );

      // Get the actual call to verify remaining time is reasonable
      const emitCall = (mockSocket.emit as jest.Mock).mock.calls[0];
      const remainingTime = emitCall[1].currentState.remainingTime;
      expect(remainingTime).toBeGreaterThan(40); // Should be close to 45 seconds
      expect(remainingTime).toBeLessThanOrEqual(45);
    });

    it('should fallback to MongoDB if Redis state not found', async () => {
      // Mock session exists
      const mockSessionsCollection = {
        findOne: jest.fn()
          .mockResolvedValueOnce({
            sessionId: 'session-789',
            state: 'REVEAL',
          })
          .mockResolvedValueOnce({
            sessionId: 'session-789',
            state: 'REVEAL',
            currentQuestionIndex: 4,
            participantCount: 9,
          }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      // Mock Redis returning empty state
      mockRedisClient.hgetall.mockResolvedValue({});

      await handleControllerConnection(mockSocket as Socket);

      // Verify MongoDB was queried twice (once for verification, once for state)
      expect(mockSessionsCollection.findOne).toHaveBeenCalledTimes(2);

      // Verify authenticated event was emitted with MongoDB data
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'authenticated',
        expect.objectContaining({
          currentState: expect.objectContaining({
            state: 'REVEAL',
            currentQuestionIndex: 4,
            participantCount: 9,
          }),
        })
      );
    });

    it('should handle error when session not found', async () => {
      // Mock session not found in MongoDB
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      await handleControllerConnection(mockSocket as Socket);

      // Verify error was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'auth_error',
        expect.objectContaining({
          error: 'Failed to authenticate controller',
        })
      );

      // Verify socket was disconnected
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle Redis errors gracefully', async () => {
      // Mock session exists
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-789',
          state: 'LOBBY',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      // Mock Redis throwing error
      mockRedisClient.hset.mockRejectedValue(new Error('Redis connection failed'));

      await handleControllerConnection(mockSocket as Socket);

      // Verify error was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'auth_error',
        expect.objectContaining({
          error: 'Failed to authenticate controller',
        })
      );

      // Verify socket was disconnected
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle MongoDB errors gracefully', async () => {
      // Mock MongoDB throwing error
      const mockSessionsCollection = {
        findOne: jest.fn().mockRejectedValue(new Error('MongoDB connection failed')),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      await handleControllerConnection(mockSocket as Socket);

      // Verify error was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'auth_error',
        expect.objectContaining({
          error: 'Failed to authenticate controller',
        })
      );

      // Verify socket was disconnected
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle ENDED session state', async () => {
      // Mock session exists with ENDED state
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-789',
          state: 'ENDED',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      // Mock Redis session state
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'ENDED',
        currentQuestionIndex: '10',
        participantCount: '15',
      });

      await handleControllerConnection(mockSocket as Socket);

      // Verify authenticated event was emitted with ENDED state
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'authenticated',
        expect.objectContaining({
          currentState: expect.objectContaining({
            state: 'ENDED',
          }),
        })
      );
    });
  });

  describe('handleControllerDisconnection', () => {
    it('should handle controller disconnection successfully', async () => {
      const mockAuditLogsCollection = {
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'log-123' }),
      };

      mockDb.collection.mockReturnValue(mockAuditLogsCollection);

      await handleControllerDisconnection(
        mockSocket as Socket,
        'client namespace disconnect'
      );

      // Verify controller disconnection was updated in Redis
      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'session:session-789:controller',
        expect.objectContaining({
          socketId: '',
        })
      );

      // Verify TTL was refreshed to 6 hours
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'session:session-789:controller',
        21600 // 6 hours
      );

      // Verify disconnection was logged
      expect(mockDb.collection).toHaveBeenCalledWith('auditLogs');
      expect(mockAuditLogsCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'CONTROLLER_DISCONNECTED',
          sessionId: 'session-789',
          details: expect.objectContaining({
            reason: 'client namespace disconnect',
          }),
        })
      );
    });

    it('should handle disconnection even if Redis update fails', async () => {
      // Mock Redis throwing error
      mockRedisClient.hset.mockRejectedValue(new Error('Redis connection failed'));

      const mockAuditLogsCollection = {
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'log-123' }),
      };

      mockDb.collection.mockReturnValue(mockAuditLogsCollection);

      // Should not throw
      await expect(
        handleControllerDisconnection(
          mockSocket as Socket,
          'transport close'
        )
      ).resolves.not.toThrow();

      // Verify logging still attempted
      expect(mockDb.collection).toHaveBeenCalledWith('auditLogs');
    });

    it('should handle disconnection even if logging fails', async () => {
      // Mock audit log insertion failing
      const mockAuditLogsCollection = {
        insertOne: jest.fn().mockRejectedValue(new Error('MongoDB connection failed')),
      };

      mockDb.collection.mockReturnValue(mockAuditLogsCollection);

      // Should not throw
      await expect(
        handleControllerDisconnection(
          mockSocket as Socket,
          'ping timeout'
        )
      ).resolves.not.toThrow();

      // Verify Redis update was still attempted
      expect(mockRedisClient.hset).toHaveBeenCalled();
    });

    it('should handle different disconnection reasons', async () => {
      const mockAuditLogsCollection = {
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'log-123' }),
      };

      mockDb.collection.mockReturnValue(mockAuditLogsCollection);

      const reasons = [
        'transport close',
        'ping timeout',
        'client namespace disconnect',
        'server namespace disconnect',
      ];

      for (const reason of reasons) {
        jest.clearAllMocks();

        await handleControllerDisconnection(mockSocket as Socket, reason);

        // Verify reason was logged correctly
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
      // Mock socket with incomplete data
      const incompleteSocket = {
        id: 'socket-999',
        data: {
          role: 'controller',
          // Missing sessionId
        } as SocketData,
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await handleControllerConnection(incompleteSocket);

      // Should emit error and disconnect
      expect(incompleteSocket.emit).toHaveBeenCalledWith(
        'auth_error',
        expect.any(Object)
      );
      expect(incompleteSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle expired timer gracefully', async () => {
      // Mock session exists
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-789',
          state: 'ACTIVE_QUESTION',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      // Mock Redis session state with expired timer
      const pastTime = Date.now() - 15000; // 15 seconds in past
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: '2',
        participantCount: '8',
        timerEndTime: pastTime.toString(),
      });

      await handleControllerConnection(mockSocket as Socket);

      // Verify remaining time is 0 (not negative)
      const emitCall = (mockSocket.emit as jest.Mock).mock.calls[0];
      const remainingTime = emitCall[1].currentState.remainingTime;
      expect(remainingTime).toBe(0);
    });

    it('should handle REVEAL state without timer', async () => {
      // Mock session exists
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-789',
          state: 'REVEAL',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      // Mock Redis session state in REVEAL (no timer)
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'REVEAL',
        currentQuestionIndex: '5',
        participantCount: '20',
        // No timerEndTime in REVEAL state
      });

      await handleControllerConnection(mockSocket as Socket);

      // Verify authenticated event does not include remaining time
      const emitCall = (mockSocket.emit as jest.Mock).mock.calls[0];
      expect(emitCall[1].currentState.remainingTime).toBeUndefined();
    });

    it('should handle zero participants', async () => {
      // Mock session exists with no participants
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-789',
          state: 'LOBBY',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      // Mock Redis session state
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'LOBBY',
        currentQuestionIndex: '0',
        participantCount: '0',
      });

      await handleControllerConnection(mockSocket as Socket);

      // Verify authenticated event includes zero participants
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'authenticated',
        expect.objectContaining({
          currentState: expect.objectContaining({
            participantCount: 0,
          }),
        })
      );
    });

    it('should handle large participant count', async () => {
      // Mock session exists with many participants
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-789',
          state: 'ACTIVE_QUESTION',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      // Mock Redis session state with 500 participants
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: '7',
        participantCount: '500',
        timerEndTime: (Date.now() + 20000).toString(),
      });

      await handleControllerConnection(mockSocket as Socket);

      // Verify authenticated event includes large participant count
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'authenticated',
        expect.objectContaining({
          currentState: expect.objectContaining({
            participantCount: 500,
          }),
        })
      );
    });
  });

  describe('Session State Retrieval', () => {
    it('should prefer Redis over MongoDB for session state', async () => {
      // Mock session exists
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-789',
          state: 'LOBBY',
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      // Mock Redis with valid state
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: '3',
        participantCount: '10',
      });

      await handleControllerConnection(mockSocket as Socket);

      // Verify Redis state was used (ACTIVE_QUESTION, not LOBBY from MongoDB)
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'authenticated',
        expect.objectContaining({
          currentState: expect.objectContaining({
            state: 'ACTIVE_QUESTION',
          }),
        })
      );

      // Verify MongoDB was only called once for session verification
      expect(mockSessionsCollection.findOne).toHaveBeenCalledTimes(1);
    });

    it('should handle malformed Redis data', async () => {
      // Mock session exists
      const mockSessionsCollection = {
        findOne: jest.fn()
          .mockResolvedValueOnce({
            sessionId: 'session-789',
            state: 'LOBBY',
          })
          .mockResolvedValueOnce({
            sessionId: 'session-789',
            state: 'LOBBY',
            currentQuestionIndex: 0,
            participantCount: 3,
          }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      // Mock Redis with malformed data
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'LOBBY',
        currentQuestionIndex: 'invalid',
        participantCount: 'not-a-number',
      });

      await handleControllerConnection(mockSocket as Socket);

      // Should handle NaN gracefully (parseInt returns NaN for invalid strings)
      const emitCall = (mockSocket.emit as jest.Mock).mock.calls[0];
      expect(emitCall[1].currentState.currentQuestionIndex).toBeNaN();
      expect(emitCall[1].currentState.participantCount).toBeNaN();
    });
  });
});

// Note: kick_participant handler tests are implemented as integration tests
// since they require full socket.io event handling setup.
// The handler is tested through the setupControllerEventHandlers function
// which registers the 'kick_participant' event listener.
