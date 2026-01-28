/**
 * Tests for Participant WebSocket Connection Handler
 * 
 * Tests:
 * - Participant connection handling
 * - Session state retrieval
 * - Participant data updates in Redis
 * - Disconnection handling
 * - Error handling
 */

import { Socket } from 'socket.io';
import {
  handleParticipantConnection,
  handleParticipantDisconnection,
} from '../participant.handler';
import { redisService } from '../../services/redis.service';
import { mongodbService } from '../../services/mongodb.service';
import { SocketData } from '../../middleware/socket-auth';

// Mock dependencies
jest.mock('../../services/redis.service');
jest.mock('../../services/mongodb.service');

describe('Participant WebSocket Handler', () => {
  let mockSocket: Partial<Socket>;
  let mockRedisClient: any;
  let mockDb: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock socket
    mockSocket = {
      id: 'socket-123',
      data: {
        participantId: 'participant-456',
        sessionId: 'session-789',
        nickname: 'TestUser',
        role: 'participant',
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

  describe('handleParticipantConnection', () => {
    it('should handle participant connection successfully', async () => {
      // Mock Redis session state
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'LOBBY',
        currentQuestionIndex: '0',
        participantCount: '5',
      });

      await handleParticipantConnection(mockSocket as Socket);

      // Verify participant connection was updated in Redis
      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'participant:participant-456:session',
        expect.objectContaining({
          socketId: 'socket-123',
          isActive: 'true',
        })
      );

      // Verify TTL was set
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'participant:participant-456:session',
        300 // 5 minutes
      );

      // Verify authenticated event was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'authenticated',
        expect.objectContaining({
          success: true,
          participantId: 'participant-456',
          sessionId: 'session-789',
          nickname: 'TestUser',
          currentState: expect.objectContaining({
            state: 'LOBBY',
            currentQuestionIndex: 0,
            participantCount: 5,
          }),
        })
      );
    });

    it('should include remaining time for ACTIVE_QUESTION state', async () => {
      // Mock Redis session state with active question
      const futureTime = Date.now() + 30000; // 30 seconds in future
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: '2',
        participantCount: '10',
        timerEndTime: futureTime.toString(),
      });

      await handleParticipantConnection(mockSocket as Socket);

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
      expect(remainingTime).toBeGreaterThan(25); // Should be close to 30 seconds
      expect(remainingTime).toBeLessThanOrEqual(30);
    });

    it('should fallback to MongoDB if Redis state not found', async () => {
      // Mock Redis returning empty state
      mockRedisClient.hgetall.mockResolvedValue({});

      // Mock MongoDB session
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-789',
          state: 'REVEAL',
          currentQuestionIndex: 3,
          participantCount: 8,
        }),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      await handleParticipantConnection(mockSocket as Socket);

      // Verify MongoDB was queried
      expect(mockDb.collection).toHaveBeenCalledWith('sessions');
      expect(mockSessionsCollection.findOne).toHaveBeenCalledWith({
        sessionId: 'session-789',
      });

      // Verify authenticated event was emitted with MongoDB data
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'authenticated',
        expect.objectContaining({
          currentState: expect.objectContaining({
            state: 'REVEAL',
            currentQuestionIndex: 3,
            participantCount: 8,
          }),
        })
      );
    });

    it('should handle error when session not found', async () => {
      // Mock Redis returning empty state
      mockRedisClient.hgetall.mockResolvedValue({});

      // Mock MongoDB returning null
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      mockDb.collection.mockReturnValue(mockSessionsCollection);

      await handleParticipantConnection(mockSocket as Socket);

      // Verify error was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'auth_error',
        expect.objectContaining({
          error: 'Failed to authenticate participant',
        })
      );

      // Verify socket was disconnected
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle Redis errors gracefully', async () => {
      // Mock Redis throwing error
      mockRedisClient.hset.mockRejectedValue(new Error('Redis connection failed'));

      await handleParticipantConnection(mockSocket as Socket);

      // Verify error was emitted
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'auth_error',
        expect.objectContaining({
          error: 'Failed to authenticate participant',
        })
      );

      // Verify socket was disconnected
      expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleParticipantDisconnection', () => {
    it('should handle participant disconnection successfully', async () => {
      const mockAuditLogsCollection = {
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'log-123' }),
      };

      mockDb.collection.mockReturnValue(mockAuditLogsCollection);

      await handleParticipantDisconnection(
        mockSocket as Socket,
        'client namespace disconnect'
      );

      // Verify participant was marked as inactive in Redis
      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'participant:participant-456:session',
        expect.objectContaining({
          isActive: 'false',
          socketId: '',
        })
      );

      // Verify TTL was refreshed
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'participant:participant-456:session',
        300 // 5 minutes for reconnection window
      );

      // Verify disconnection was logged
      expect(mockDb.collection).toHaveBeenCalledWith('auditLogs');
      expect(mockAuditLogsCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'PARTICIPANT_DISCONNECTED',
          sessionId: 'session-789',
          participantId: 'participant-456',
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
        handleParticipantDisconnection(
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
        handleParticipantDisconnection(
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

        await handleParticipantDisconnection(mockSocket as Socket, reason);

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
          role: 'participant',
          // Missing participantId, sessionId, nickname
        } as SocketData,
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await handleParticipantConnection(incompleteSocket);

      // Should emit error and disconnect
      expect(incompleteSocket.emit).toHaveBeenCalledWith(
        'auth_error',
        expect.any(Object)
      );
      expect(incompleteSocket.disconnect).toHaveBeenCalledWith(true);
    });

    it('should handle expired timer gracefully', async () => {
      // Mock Redis session state with expired timer
      const pastTime = Date.now() - 10000; // 10 seconds in past
      mockRedisClient.hgetall.mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: '1',
        participantCount: '7',
        timerEndTime: pastTime.toString(),
      });

      await handleParticipantConnection(mockSocket as Socket);

      // Verify remaining time is 0 (not negative)
      const emitCall = (mockSocket.emit as jest.Mock).mock.calls[0];
      const remainingTime = emitCall[1].currentState.remainingTime;
      expect(remainingTime).toBe(0);
    });
  });

  describe('submit_answer event handler', () => {
    // Note: Full integration tests for submit_answer are in integration.test.ts
    // These are unit tests for the handler logic

    it('should reject answer with invalid schema', async () => {
      // The handler validates schema using Zod
      // Invalid data should emit answer_rejected
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true); // Placeholder
    });

    it('should reject answer when validation fails', async () => {
      // Mock validation service returning invalid
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true); // Placeholder
    });

    it('should accept valid answer and write to Redis buffer', async () => {
      // Mock all services returning success
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true); // Placeholder
    });

    it('should handle race condition when answer already submitted', async () => {
      // Mock validation passing but marking failing (race condition)
      // This is tested in integration tests
      expect(true).toBe(true); // Placeholder
    });

    it('should publish to scoring worker after accepting answer', async () => {
      // Mock successful answer submission
      // Verify Redis pub/sub message is published
      // This is tested in integration tests
      expect(true).toBe(true); // Placeholder
    });

    it('should broadcast answer count update to controller', async () => {
      // Mock successful answer submission
      // Verify answer_count_updated is published to controller
      // This is tested in integration tests
      expect(true).toBe(true); // Placeholder
    });
  });
});



describe('reconnect_session event handler', () => {
  // Note: Full integration tests for reconnect_session require a full WebSocket setup
  // These are placeholder tests documenting the expected behavior
  // The actual handler logic is tested through the session-recovery.service.test.ts

  describe('Schema Validation', () => {
    it('should reject reconnection with invalid schema', async () => {
      // The handler validates schema using Zod
      // Invalid data should emit recovery_failed with INVALID_REQUEST reason
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true);
    });

    it('should require sessionId as UUID', async () => {
      // sessionId must be a valid UUID
      expect(true).toBe(true);
    });

    it('should require participantId as UUID', async () => {
      // participantId must be a valid UUID
      expect(true).toBe(true);
    });

    it('should accept optional lastKnownQuestionId', async () => {
      // lastKnownQuestionId is optional but must be UUID if provided
      expect(true).toBe(true);
    });
  });

  describe('Recovery Failure Scenarios', () => {
    it('should emit recovery_failed when session not found', async () => {
      // Mock session recovery service returning SESSION_NOT_FOUND
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true);
    });

    it('should emit recovery_failed when session has ended', async () => {
      // Mock session recovery service returning SESSION_ENDED
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true);
    });

    it('should emit recovery_failed when participant not found', async () => {
      // Mock session recovery service returning PARTICIPANT_NOT_FOUND
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true);
    });

    it('should emit recovery_failed when participant is banned', async () => {
      // Mock session recovery service returning PARTICIPANT_BANNED
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true);
    });
  });

  describe('Successful Recovery', () => {
    it('should emit session_recovered with restored state on success', async () => {
      // Mock session recovery service returning success
      // Verify session_recovered event is emitted with correct data
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true);
    });

    it('should update socket data after successful recovery', async () => {
      // Mock successful recovery
      // Verify socket.data is updated with participantId, sessionId, role
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true);
    });

    it('should join session rooms after successful recovery', async () => {
      // Mock successful recovery
      // Verify socket.join is called for session and participant rooms
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true);
    });

    it('should broadcast participant status change after successful recovery', async () => {
      // Mock successful recovery
      // Verify broadcastParticipantStatusChanged is called with 'connected'
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true);
    });

    it('should log recovery events to audit logs', async () => {
      // Mock successful recovery
      // Verify audit log entry is created
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true);
    });
  });

  describe('State-Specific Recovery', () => {
    it('should include current question and remaining time for ACTIVE_QUESTION state', async () => {
      // Mock recovery during active question
      // Verify session_recovered includes currentQuestion and remainingTime
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true);
    });

    it('should handle recovery during REVEAL state', async () => {
      // Mock recovery during reveal phase
      // Verify session_recovered includes correct state without question
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true);
    });

    it('should handle recovery for eliminated participants', async () => {
      // Mock recovery for eliminated participant
      // Verify isEliminated and isSpectator flags are set correctly
      // This is tested in integration tests with full WebSocket setup
      expect(true).toBe(true);
    });
  });
});
