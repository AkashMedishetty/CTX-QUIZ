/**
 * Broadcast Service Tests
 * 
 * Tests for broadcasting session lifecycle events:
 * - lobby_state broadcast
 * - participant_joined broadcast with lobby_state update
 * 
 * Requirements: 2.2, 12.8
 */

import { broadcastService } from '../broadcast.service';
import { mongodbService } from '../mongodb.service';
import { redisDataStructuresService } from '../redis-data-structures.service';
import { pubSubService } from '../pubsub.service';
import type { Session, Participant } from '../../models/types';
import { ObjectId } from 'mongodb';

// Mock dependencies
jest.mock('../mongodb.service');
jest.mock('../redis-data-structures.service');
jest.mock('../redis.service');
jest.mock('../pubsub.service');
jest.mock('../quiz-timer.service', () => ({
  quizTimerManager: {
    createTimer: jest.fn(),
    stopAllTimersForSession: jest.fn(),
  },
}));

describe('BroadcastService', () => {
  const mockSessionId = 'test-session-123';
  const mockJoinCode = 'ABC123';
  const mockParticipantId1 = 'participant-1';
  const mockParticipantId2 = 'participant-2';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('broadcastLobbyState', () => {
    it('should broadcast lobby_state to big screen and participants when session is in LOBBY', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'LOBBY',
        participantCount: 2,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1, mockParticipantId2],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockParticipants: Partial<Participant>[] = [
        {
          participantId: mockParticipantId1,
          sessionId: mockSessionId,
          nickname: 'Alice',
          isActive: true,
          isEliminated: false,
          isSpectator: false,
          isBanned: false,
          totalScore: 0,
          totalTimeMs: 0,
          streakCount: 0,
          joinedAt: new Date('2024-01-01T10:00:00Z'),
          lastConnectedAt: new Date(),
          ipAddress: '127.0.0.1',
        },
        {
          participantId: mockParticipantId2,
          sessionId: mockSessionId,
          nickname: 'Bob',
          isActive: true,
          isEliminated: false,
          isSpectator: false,
          isBanned: false,
          totalScore: 0,
          totalTimeMs: 0,
          streakCount: 0,
          joinedAt: new Date('2024-01-01T10:01:00Z'),
          lastConnectedAt: new Date(),
          ipAddress: '127.0.0.2',
        },
      ];

      const mockRedisState = {
        state: 'LOBBY' as const,
        currentQuestionIndex: 0,
        participantCount: 2,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockParticipants),
        }),
      });

      (mongodbService.getCollection as jest.Mock).mockImplementation((collectionName: string) => {
        if (collectionName === 'sessions') {
          return { findOne: mockFindOne };
        }
        if (collectionName === 'participants') {
          return { find: mockFind };
        }
        return {};
      });

      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastLobbyState(mockSessionId);

      // Assert
      expect(mongodbService.getCollection).toHaveBeenCalledWith('sessions');
      expect(mockFindOne).toHaveBeenCalledWith({ sessionId: mockSessionId });

      expect(mongodbService.getCollection).toHaveBeenCalledWith('participants');
      expect(mockFind).toHaveBeenCalledWith({
        sessionId: mockSessionId,
        isActive: true,
      });

      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);

      const expectedPayload = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        participantCount: 2,
        participants: [
          { participantId: mockParticipantId1, nickname: 'Alice' },
          { participantId: mockParticipantId2, nickname: 'Bob' },
        ],
      };

      expect(pubSubService.publishToBigScreen).toHaveBeenCalledWith(
        mockSessionId,
        'lobby_state',
        expectedPayload
      );

      expect(pubSubService.publishToParticipants).toHaveBeenCalledWith(
        mockSessionId,
        'lobby_state',
        expectedPayload
      );
    });

    it('should not broadcast if session is not in LOBBY state', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 2,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 0,
        participantCount: 2,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastLobbyState(mockSessionId);

      // Assert
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);
      expect(pubSubService.publishToBigScreen).not.toHaveBeenCalled();
      expect(pubSubService.publishToParticipants).not.toHaveBeenCalled();
    });

    it('should throw error if session not found', async () => {
      // Arrange
      const mockFindOne = jest.fn().mockResolvedValue(null);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Act & Assert
      await expect(broadcastService.broadcastLobbyState(mockSessionId)).rejects.toThrow(
        `Session not found: ${mockSessionId}`
      );

      expect(mockFindOne).toHaveBeenCalledWith({ sessionId: mockSessionId });
    });

    it('should use MongoDB state if Redis state is not available', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'LOBBY',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockParticipants: Partial<Participant>[] = [
        {
          participantId: mockParticipantId1,
          sessionId: mockSessionId,
          nickname: 'Alice',
          isActive: true,
          isEliminated: false,
          isSpectator: false,
          isBanned: false,
          totalScore: 0,
          totalTimeMs: 0,
          streakCount: 0,
          joinedAt: new Date(),
          lastConnectedAt: new Date(),
          ipAddress: '127.0.0.1',
        },
      ];

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockParticipants),
        }),
      });

      (mongodbService.getCollection as jest.Mock).mockImplementation((collectionName: string) => {
        if (collectionName === 'sessions') {
          return { findOne: mockFindOne };
        }
        if (collectionName === 'participants') {
          return { find: mockFind };
        }
        return {};
      });

      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis - return null (no cached state)
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(null);

      // Mock PubSub
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastLobbyState(mockSessionId);

      // Assert
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);

      const expectedPayload = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        participantCount: 1,
        participants: [{ participantId: mockParticipantId1, nickname: 'Alice' }],
      };

      expect(pubSubService.publishToBigScreen).toHaveBeenCalledWith(
        mockSessionId,
        'lobby_state',
        expectedPayload
      );

      expect(pubSubService.publishToParticipants).toHaveBeenCalledWith(
        mockSessionId,
        'lobby_state',
        expectedPayload
      );
    });

    it('should handle empty participant list', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'LOBBY',
        participantCount: 0,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'LOBBY' as const,
        currentQuestionIndex: 0,
        participantCount: 0,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      });

      (mongodbService.getCollection as jest.Mock).mockImplementation((collectionName: string) => {
        if (collectionName === 'sessions') {
          return { findOne: mockFindOne };
        }
        if (collectionName === 'participants') {
          return { find: mockFind };
        }
        return {};
      });

      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastLobbyState(mockSessionId);

      // Assert
      const expectedPayload = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        participantCount: 0,
        participants: [],
      };

      expect(pubSubService.publishToBigScreen).toHaveBeenCalledWith(
        mockSessionId,
        'lobby_state',
        expectedPayload
      );

      expect(pubSubService.publishToParticipants).toHaveBeenCalledWith(
        mockSessionId,
        'lobby_state',
        expectedPayload
      );
    });
  });

  describe('broadcastParticipantJoined', () => {
    it('should broadcast participant_joined event', async () => {
      // Arrange
      const nickname = 'Charlie';
      const participantCount = 3;

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Mock Redis - session not in LOBBY
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 1,
        participantCount: 3,
      });

      // Act
      await broadcastService.broadcastParticipantJoined(
        mockSessionId,
        mockParticipantId1,
        nickname,
        participantCount
      );

      // Assert
      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'participant_joined',
        expect.objectContaining({
          participantId: mockParticipantId1,
          nickname,
          participantCount,
          timestamp: expect.any(String),
        })
      );
    });

    it('should also broadcast lobby_state if session is in LOBBY', async () => {
      // Arrange
      const nickname = 'Charlie';
      const participantCount = 3;

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'LOBBY',
        participantCount: 3,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1, mockParticipantId2],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockParticipants: Partial<Participant>[] = [
        {
          participantId: mockParticipantId1,
          sessionId: mockSessionId,
          nickname: 'Alice',
          isActive: true,
          isEliminated: false,
          isSpectator: false,
          isBanned: false,
          totalScore: 0,
          totalTimeMs: 0,
          streakCount: 0,
          joinedAt: new Date(),
          lastConnectedAt: new Date(),
          ipAddress: '127.0.0.1',
        },
        {
          participantId: mockParticipantId2,
          sessionId: mockSessionId,
          nickname: 'Bob',
          isActive: true,
          isEliminated: false,
          isSpectator: false,
          isBanned: false,
          totalScore: 0,
          totalTimeMs: 0,
          streakCount: 0,
          joinedAt: new Date(),
          lastConnectedAt: new Date(),
          ipAddress: '127.0.0.2',
        },
      ];

      const mockRedisState = {
        state: 'LOBBY' as const,
        currentQuestionIndex: 0,
        participantCount: 3,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockParticipants),
        }),
      });

      (mongodbService.getCollection as jest.Mock).mockImplementation((collectionName: string) => {
        if (collectionName === 'sessions') {
          return { findOne: mockFindOne };
        }
        if (collectionName === 'participants') {
          return { find: mockFind };
        }
        return {};
      });

      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastParticipantJoined(
        mockSessionId,
        mockParticipantId1,
        nickname,
        participantCount
      );

      // Assert
      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'participant_joined',
        expect.objectContaining({
          participantId: mockParticipantId1,
          nickname,
          participantCount,
        })
      );

      // Should also call broadcastLobbyState
      expect(pubSubService.publishToBigScreen).toHaveBeenCalledWith(
        mockSessionId,
        'lobby_state',
        expect.objectContaining({
          sessionId: mockSessionId,
          joinCode: mockJoinCode,
          participantCount: 3,
        })
      );

      expect(pubSubService.publishToParticipants).toHaveBeenCalledWith(
        mockSessionId,
        'lobby_state',
        expect.objectContaining({
          sessionId: mockSessionId,
          joinCode: mockJoinCode,
          participantCount: 3,
        })
      );
    });
  });

  describe('broadcastQuizStarted', () => {
    it('should broadcast quiz_started to all channels when session is in ACTIVE_QUESTION state', async () => {
      // Arrange
      const totalQuestions = 10;

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 2,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1, mockParticipantId2],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 0,
        participantCount: 2,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizStarted(mockSessionId, totalQuestions);

      // Assert
      expect(mongodbService.getCollection).toHaveBeenCalledWith('sessions');
      expect(mockFindOne).toHaveBeenCalledWith({ sessionId: mockSessionId });
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);

      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'quiz_started',
        expect.objectContaining({
          sessionId: mockSessionId,
          totalQuestions,
          timestamp: expect.any(String),
        })
      );
    });

    it('should not broadcast if session is not in ACTIVE_QUESTION state', async () => {
      // Arrange
      const totalQuestions = 10;

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'LOBBY',
        participantCount: 2,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'LOBBY' as const,
        currentQuestionIndex: 0,
        participantCount: 2,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizStarted(mockSessionId, totalQuestions);

      // Assert
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);
      expect(pubSubService.broadcastToSession).not.toHaveBeenCalled();
    });

    it('should throw error if session not found', async () => {
      // Arrange
      const totalQuestions = 10;

      const mockFindOne = jest.fn().mockResolvedValue(null);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Act & Assert
      await expect(
        broadcastService.broadcastQuizStarted(mockSessionId, totalQuestions)
      ).rejects.toThrow(`Session not found: ${mockSessionId}`);

      expect(mockFindOne).toHaveBeenCalledWith({ sessionId: mockSessionId });
    });

    it('should use MongoDB state if Redis state is not available', async () => {
      // Arrange
      const totalQuestions = 5;

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis - return null (no cached state)
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(null);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizStarted(mockSessionId, totalQuestions);

      // Assert
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);

      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'quiz_started',
        expect.objectContaining({
          sessionId: mockSessionId,
          totalQuestions,
          timestamp: expect.any(String),
        })
      );
    });

    it('should not broadcast if session is in REVEAL state', async () => {
      // Arrange
      const totalQuestions = 10;

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'REVEAL',
        participantCount: 2,
        quizId: new ObjectId(),
        currentQuestionIndex: 1,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'REVEAL' as const,
        currentQuestionIndex: 1,
        participantCount: 2,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizStarted(mockSessionId, totalQuestions);

      // Assert
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);
      expect(pubSubService.broadcastToSession).not.toHaveBeenCalled();
    });

    it('should not broadcast if session is in ENDED state', async () => {
      // Arrange
      const totalQuestions = 10;

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ENDED',
        participantCount: 2,
        quizId: new ObjectId(),
        currentQuestionIndex: 10,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        endedAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'ENDED' as const,
        currentQuestionIndex: 10,
        participantCount: 2,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizStarted(mockSessionId, totalQuestions);

      // Assert
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);
      expect(pubSubService.broadcastToSession).not.toHaveBeenCalled();
    });

    it('should include timestamp in ISO format', async () => {
      // Arrange
      const totalQuestions = 7;

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 3,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 0,
        participantCount: 3,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizStarted(mockSessionId, totalQuestions);

      // Assert
      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'quiz_started',
        expect.objectContaining({
          sessionId: mockSessionId,
          totalQuestions,
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        })
      );
    });
  });

  describe('broadcastQuizEnded', () => {
    it('should broadcast quiz_ended to all channels when session is in ENDED state', async () => {
      // Arrange
      const mockFinalLeaderboard = [
        {
          rank: 1,
          participantId: mockParticipantId1,
          nickname: 'Alice',
          totalScore: 100,
          totalTimeMs: 5000,
        },
        {
          rank: 2,
          participantId: mockParticipantId2,
          nickname: 'Bob',
          totalScore: 80,
          totalTimeMs: 6000,
        },
      ];

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ENDED',
        participantCount: 2,
        quizId: new ObjectId(),
        currentQuestionIndex: 10,
        activeParticipants: [mockParticipantId1, mockParticipantId2],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        endedAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'ENDED' as const,
        currentQuestionIndex: 10,
        participantCount: 2,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizEnded(mockSessionId, mockFinalLeaderboard);

      // Assert
      expect(mongodbService.getCollection).toHaveBeenCalledWith('sessions');
      expect(mockFindOne).toHaveBeenCalledWith({ sessionId: mockSessionId });
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);

      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'quiz_ended',
        expect.objectContaining({
          sessionId: mockSessionId,
          finalLeaderboard: mockFinalLeaderboard,
          timestamp: expect.any(String),
        })
      );
    });

    it('should not broadcast if session is not in ENDED state', async () => {
      // Arrange
      const mockFinalLeaderboard = [
        {
          rank: 1,
          participantId: mockParticipantId1,
          nickname: 'Alice',
          totalScore: 100,
          totalTimeMs: 5000,
        },
      ];

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 5,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 5,
        participantCount: 1,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizEnded(mockSessionId, mockFinalLeaderboard);

      // Assert
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);
      expect(pubSubService.broadcastToSession).not.toHaveBeenCalled();
    });

    it('should throw error if session not found', async () => {
      // Arrange
      const mockFinalLeaderboard = [
        {
          rank: 1,
          participantId: mockParticipantId1,
          nickname: 'Alice',
          totalScore: 100,
          totalTimeMs: 5000,
        },
      ];

      const mockFindOne = jest.fn().mockResolvedValue(null);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Act & Assert
      await expect(
        broadcastService.broadcastQuizEnded(mockSessionId, mockFinalLeaderboard)
      ).rejects.toThrow(`Session not found: ${mockSessionId}`);

      expect(mockFindOne).toHaveBeenCalledWith({ sessionId: mockSessionId });
    });

    it('should use MongoDB state if Redis state is not available', async () => {
      // Arrange
      const mockFinalLeaderboard = [
        {
          rank: 1,
          participantId: mockParticipantId1,
          nickname: 'Alice',
          totalScore: 100,
          totalTimeMs: 5000,
        },
      ];

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ENDED',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 10,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        endedAt: new Date(),
        hostId: 'host-1',
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis - return null (no cached state)
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(null);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizEnded(mockSessionId, mockFinalLeaderboard);

      // Assert
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);

      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'quiz_ended',
        expect.objectContaining({
          sessionId: mockSessionId,
          finalLeaderboard: mockFinalLeaderboard,
          timestamp: expect.any(String),
        })
      );
    });

    it('should not broadcast if session is in LOBBY state', async () => {
      // Arrange
      const mockFinalLeaderboard = [
        {
          rank: 1,
          participantId: mockParticipantId1,
          nickname: 'Alice',
          totalScore: 100,
          totalTimeMs: 5000,
        },
      ];

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'LOBBY',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'LOBBY' as const,
        currentQuestionIndex: 0,
        participantCount: 1,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizEnded(mockSessionId, mockFinalLeaderboard);

      // Assert
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);
      expect(pubSubService.broadcastToSession).not.toHaveBeenCalled();
    });

    it('should not broadcast if session is in REVEAL state', async () => {
      // Arrange
      const mockFinalLeaderboard = [
        {
          rank: 1,
          participantId: mockParticipantId1,
          nickname: 'Alice',
          totalScore: 100,
          totalTimeMs: 5000,
        },
      ];

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'REVEAL',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 5,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'REVEAL' as const,
        currentQuestionIndex: 5,
        participantCount: 1,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizEnded(mockSessionId, mockFinalLeaderboard);

      // Assert
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);
      expect(pubSubService.broadcastToSession).not.toHaveBeenCalled();
    });

    it('should include timestamp in ISO format', async () => {
      // Arrange
      const mockFinalLeaderboard = [
        {
          rank: 1,
          participantId: mockParticipantId1,
          nickname: 'Alice',
          totalScore: 100,
          totalTimeMs: 5000,
        },
      ];

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ENDED',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 10,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        endedAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'ENDED' as const,
        currentQuestionIndex: 10,
        participantCount: 1,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizEnded(mockSessionId, mockFinalLeaderboard);

      // Assert
      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'quiz_ended',
        expect.objectContaining({
          sessionId: mockSessionId,
          finalLeaderboard: mockFinalLeaderboard,
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        })
      );
    });

    it('should handle empty leaderboard', async () => {
      // Arrange
      const mockFinalLeaderboard: Array<{
        rank: number;
        participantId: string;
        nickname: string;
        totalScore: number;
        totalTimeMs: number;
      }> = [];

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ENDED',
        participantCount: 0,
        quizId: new ObjectId(),
        currentQuestionIndex: 10,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        endedAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'ENDED' as const,
        currentQuestionIndex: 10,
        participantCount: 0,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizEnded(mockSessionId, mockFinalLeaderboard);

      // Assert
      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'quiz_ended',
        expect.objectContaining({
          sessionId: mockSessionId,
          finalLeaderboard: [],
          timestamp: expect.any(String),
        })
      );
    });

    it('should handle large leaderboard with many participants', async () => {
      // Arrange
      const mockFinalLeaderboard = Array.from({ length: 100 }, (_, i) => ({
        rank: i + 1,
        participantId: `participant-${i + 1}`,
        nickname: `Player${i + 1}`,
        totalScore: 1000 - i * 10,
        totalTimeMs: 5000 + i * 100,
      }));

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ENDED',
        participantCount: 100,
        quizId: new ObjectId(),
        currentQuestionIndex: 10,
        activeParticipants: mockFinalLeaderboard.map((p) => p.participantId),
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        endedAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'ENDED' as const,
        currentQuestionIndex: 10,
        participantCount: 100,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizEnded(mockSessionId, mockFinalLeaderboard);

      // Assert
      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'quiz_ended',
        expect.objectContaining({
          sessionId: mockSessionId,
          finalLeaderboard: mockFinalLeaderboard,
          timestamp: expect.any(String),
        })
      );
    });

    it('should broadcast full leaderboard for all client types to filter', async () => {
      // Arrange
      const mockFinalLeaderboard = Array.from({ length: 15 }, (_, i) => ({
        rank: i + 1,
        participantId: `participant-${i + 1}`,
        nickname: `Player${i + 1}`,
        totalScore: 150 - i * 10,
        totalTimeMs: 5000 + i * 100,
      }));

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ENDED',
        participantCount: 15,
        quizId: new ObjectId(),
        currentQuestionIndex: 10,
        activeParticipants: mockFinalLeaderboard.map((p) => p.participantId),
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        endedAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'ENDED' as const,
        currentQuestionIndex: 10,
        participantCount: 15,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizEnded(mockSessionId, mockFinalLeaderboard);

      // Assert
      // Should broadcast full leaderboard (15 participants)
      // Big screen will filter to top 10, controller shows all, participants find their rank
      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'quiz_ended',
        expect.objectContaining({
          sessionId: mockSessionId,
          finalLeaderboard: expect.arrayContaining([
            expect.objectContaining({ rank: 1 }),
            expect.objectContaining({ rank: 15 }),
          ]),
          timestamp: expect.any(String),
        })
      );

      const broadcastCall = (pubSubService.broadcastToSession as jest.Mock).mock.calls[0];
      expect(broadcastCall[2].finalLeaderboard).toHaveLength(15);
    });
  });

  describe('broadcastQuestionStarted', () => {
    const mockQuestionId = 'question-1';
    const mockQuestionIndex = 0;

    it('should broadcast question_started to all channels when session is in ACTIVE_QUESTION state', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 2,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1, mockParticipantId2],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        questions: [
          {
            questionId: mockQuestionId,
            questionText: 'What is 2+2?',
            questionType: 'MULTIPLE_CHOICE',
            questionImageUrl: 'https://example.com/image.jpg',
            timeLimit: 30,
            options: [
              {
                optionId: 'opt-1',
                optionText: '3',
                isCorrect: false,
              },
              {
                optionId: 'opt-2',
                optionText: '4',
                isCorrect: true,
              },
              {
                optionId: 'opt-3',
                optionText: '5',
                isCorrect: false,
              },
            ],
            shuffleOptions: false,
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
          },
        ],
      };

      const startTime = Date.now();
      const endTime = startTime + 30000;

      const mockRedisState = {
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 0,
        currentQuestionId: mockQuestionId,
        currentQuestionStartTime: startTime,
        timerEndTime: endTime,
        participantCount: 2,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn()
        .mockResolvedValueOnce(mockSession) // First call for session
        .mockResolvedValueOnce(mockQuiz);   // Second call for quiz

      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuestionStarted(mockSessionId, mockQuestionIndex, mockQuestionId);

      // Assert
      expect(mongodbService.getCollection).toHaveBeenCalledWith('sessions');
      expect(mongodbService.getCollection).toHaveBeenCalledWith('quizzes');
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);

      const expectedPayload = {
        questionIndex: mockQuestionIndex,
        question: {
          questionId: mockQuestionId,
          questionText: 'What is 2+2?',
          questionType: 'MULTIPLE_CHOICE',
          questionImageUrl: 'https://example.com/image.jpg',
          options: [
            {
              optionId: 'opt-1',
              optionText: '3',
              // isCorrect should NOT be included
            },
            {
              optionId: 'opt-2',
              optionText: '4',
              // isCorrect should NOT be included
            },
            {
              optionId: 'opt-3',
              optionText: '5',
              // isCorrect should NOT be included
            },
          ],
          timeLimit: 30,
          shuffleOptions: false,
        },
        startTime,
        endTime,
      };

      expect(pubSubService.publishToBigScreen).toHaveBeenCalledWith(
        mockSessionId,
        'question_started',
        expectedPayload
      );

      expect(pubSubService.publishToController).toHaveBeenCalledWith(
        mockSessionId,
        'question_started',
        expectedPayload
      );

      expect(pubSubService.publishToParticipants).toHaveBeenCalledWith(
        mockSessionId,
        'question_started',
        expectedPayload
      );
    });

    it('should NOT include isCorrect flags in question options (security requirement)', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        questions: [
          {
            questionId: mockQuestionId,
            questionText: 'Is this secure?',
            questionType: 'TRUE_FALSE',
            timeLimit: 15,
            options: [
              {
                optionId: 'opt-1',
                optionText: 'True',
                isCorrect: true,
              },
              {
                optionId: 'opt-2',
                optionText: 'False',
                isCorrect: false,
              },
            ],
            shuffleOptions: false,
            scoring: {
              basePoints: 50,
              speedBonusMultiplier: 0.3,
              partialCreditEnabled: false,
            },
          },
        ],
      };

      const mockRedisState = {
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 0,
        currentQuestionId: mockQuestionId,
        currentQuestionStartTime: Date.now(),
        timerEndTime: Date.now() + 15000,
        participantCount: 1,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn()
        .mockResolvedValueOnce(mockSession)
        .mockResolvedValueOnce(mockQuiz);

      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuestionStarted(mockSessionId, mockQuestionIndex, mockQuestionId);

      // Assert - Verify isCorrect is NOT in the payload
      const bigScreenCall = (pubSubService.publishToBigScreen as jest.Mock).mock.calls[0];
      const controllerCall = (pubSubService.publishToController as jest.Mock).mock.calls[0];
      const participantsCall = (pubSubService.publishToParticipants as jest.Mock).mock.calls[0];

      // Check each option does not have isCorrect
      bigScreenCall[2].question.options.forEach((option: any) => {
        expect(option).not.toHaveProperty('isCorrect');
      });

      controllerCall[2].question.options.forEach((option: any) => {
        expect(option).not.toHaveProperty('isCorrect');
      });

      participantsCall[2].question.options.forEach((option: any) => {
        expect(option).not.toHaveProperty('isCorrect');
      });
    });

    it('should shuffle options per participant when shuffleOptions is enabled', async () => {
      // Arrange
      const mockParticipants: Partial<Participant>[] = [
        {
          participantId: mockParticipantId1,
          sessionId: mockSessionId,
          nickname: 'Alice',
          isActive: true,
          isEliminated: false,
          isSpectator: false,
          isBanned: false,
          totalScore: 0,
          totalTimeMs: 0,
          streakCount: 0,
          joinedAt: new Date(),
          lastConnectedAt: new Date(),
          ipAddress: '127.0.0.1',
        },
        {
          participantId: mockParticipantId2,
          sessionId: mockSessionId,
          nickname: 'Bob',
          isActive: true,
          isEliminated: false,
          isSpectator: false,
          isBanned: false,
          totalScore: 0,
          totalTimeMs: 0,
          streakCount: 0,
          joinedAt: new Date(),
          lastConnectedAt: new Date(),
          ipAddress: '127.0.0.2',
        },
      ];

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 2,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1, mockParticipantId2],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        questions: [
          {
            questionId: mockQuestionId,
            questionText: 'Shuffled question',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 20,
            options: [
              { optionId: 'opt-1', optionText: 'A', isCorrect: false },
              { optionId: 'opt-2', optionText: 'B', isCorrect: true },
              { optionId: 'opt-3', optionText: 'C', isCorrect: false },
              { optionId: 'opt-4', optionText: 'D', isCorrect: false },
            ],
            shuffleOptions: true, // Shuffling enabled
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
          },
        ],
      };

      const mockRedisState = {
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 0,
        currentQuestionId: mockQuestionId,
        currentQuestionStartTime: Date.now(),
        timerEndTime: Date.now() + 20000,
        participantCount: 2,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn()
        .mockResolvedValueOnce(mockSession)
        .mockResolvedValueOnce(mockQuiz);

      const mockFind = jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockParticipants),
      });

      (mongodbService.getCollection as jest.Mock).mockImplementation((collectionName: string) => {
        if (collectionName === 'sessions') {
          return { findOne: mockFindOne };
        }
        if (collectionName === 'quizzes') {
          return { findOne: mockFindOne };
        }
        if (collectionName === 'participants') {
          return { find: mockFind };
        }
        return {};
      });

      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipant as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuestionStarted(mockSessionId, mockQuestionIndex, mockQuestionId);

      // Assert
      // Should NOT call publishToParticipants (broadcast)
      expect(pubSubService.publishToParticipants).not.toHaveBeenCalled();

      // Should call publishToParticipant for each participant individually
      expect(pubSubService.publishToParticipant).toHaveBeenCalledTimes(2);

      // Verify each participant got their own shuffled options
      expect(pubSubService.publishToParticipant).toHaveBeenCalledWith(
        mockParticipantId1,
        'question_started',
        expect.objectContaining({
          questionIndex: mockQuestionIndex,
          question: expect.objectContaining({
            questionId: mockQuestionId,
            options: expect.arrayContaining([
              expect.objectContaining({ optionId: expect.any(String) }),
            ]),
          }),
        })
      );

      expect(pubSubService.publishToParticipant).toHaveBeenCalledWith(
        mockParticipantId2,
        'question_started',
        expect.objectContaining({
          questionIndex: mockQuestionIndex,
          question: expect.objectContaining({
            questionId: mockQuestionId,
            options: expect.arrayContaining([
              expect.objectContaining({ optionId: expect.any(String) }),
            ]),
          }),
        })
      );

      // Verify all options are present (just shuffled)
      const participant1Call = (pubSubService.publishToParticipant as jest.Mock).mock.calls[0];
      const participant2Call = (pubSubService.publishToParticipant as jest.Mock).mock.calls[1];

      expect(participant1Call[2].question.options).toHaveLength(4);
      expect(participant2Call[2].question.options).toHaveLength(4);

      // Verify all option IDs are present
      const participant1OptionIds = participant1Call[2].question.options.map((o: any) => o.optionId).sort();
      const participant2OptionIds = participant2Call[2].question.options.map((o: any) => o.optionId).sort();

      expect(participant1OptionIds).toEqual(['opt-1', 'opt-2', 'opt-3', 'opt-4']);
      expect(participant2OptionIds).toEqual(['opt-1', 'opt-2', 'opt-3', 'opt-4']);
    });

    it('should not broadcast if session is not in ACTIVE_QUESTION state', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'LOBBY',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'LOBBY' as const,
        currentQuestionIndex: 0,
        participantCount: 1,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuestionStarted(mockSessionId, mockQuestionIndex, mockQuestionId);

      // Assert
      expect(redisDataStructuresService.getSessionState).toHaveBeenCalledWith(mockSessionId);
      expect(pubSubService.publishToBigScreen).not.toHaveBeenCalled();
      expect(pubSubService.publishToController).not.toHaveBeenCalled();
      expect(pubSubService.publishToParticipants).not.toHaveBeenCalled();
    });

    it('should throw error if session not found', async () => {
      // Arrange
      const mockFindOne = jest.fn().mockResolvedValue(null);
      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Act & Assert
      await expect(
        broadcastService.broadcastQuestionStarted(mockSessionId, mockQuestionIndex, mockQuestionId)
      ).rejects.toThrow(`Session not found: ${mockSessionId}`);

      expect(mockFindOne).toHaveBeenCalledWith({ sessionId: mockSessionId });
    });

    it('should throw error if quiz not found', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockRedisState = {
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 0,
        participantCount: 1,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn()
        .mockResolvedValueOnce(mockSession) // First call for session
        .mockResolvedValueOnce(null);       // Second call for quiz (not found)

      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Act & Assert
      await expect(
        broadcastService.broadcastQuestionStarted(mockSessionId, mockQuestionIndex, mockQuestionId)
      ).rejects.toThrow(`Quiz not found: ${mockSession.quizId}`);
    });

    it('should throw error if question not found at index', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        questions: [], // Empty questions array
      };

      const mockRedisState = {
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 0,
        participantCount: 1,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn()
        .mockResolvedValueOnce(mockSession)
        .mockResolvedValueOnce(mockQuiz);

      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Act & Assert
      await expect(
        broadcastService.broadcastQuestionStarted(mockSessionId, mockQuestionIndex, mockQuestionId)
      ).rejects.toThrow(`Question not found at index: ${mockQuestionIndex}`);
    });

    it('should throw error if question ID mismatch', async () => {
      // Arrange
      const wrongQuestionId = 'wrong-question-id';

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        questions: [
          {
            questionId: mockQuestionId, // Different from wrongQuestionId
            questionText: 'Test',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 30,
            options: [],
            shuffleOptions: false,
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
          },
        ],
      };

      const mockRedisState = {
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 0,
        participantCount: 1,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn()
        .mockResolvedValueOnce(mockSession)
        .mockResolvedValueOnce(mockQuiz);

      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Act & Assert
      await expect(
        broadcastService.broadcastQuestionStarted(mockSessionId, mockQuestionIndex, wrongQuestionId)
      ).rejects.toThrow('Question ID mismatch');
    });

    it('should use timing from Redis state', async () => {
      // Arrange
      const startTime = 1234567890000;
      const endTime = 1234567920000;

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        questions: [
          {
            questionId: mockQuestionId,
            questionText: 'Test',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 30,
            options: [
              { optionId: 'opt-1', optionText: 'A', isCorrect: true },
            ],
            shuffleOptions: false,
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
          },
        ],
      };

      const mockRedisState = {
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 0,
        currentQuestionId: mockQuestionId,
        currentQuestionStartTime: startTime,
        timerEndTime: endTime,
        participantCount: 1,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn()
        .mockResolvedValueOnce(mockSession)
        .mockResolvedValueOnce(mockQuiz);

      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuestionStarted(mockSessionId, mockQuestionIndex, mockQuestionId);

      // Assert
      expect(pubSubService.publishToBigScreen).toHaveBeenCalledWith(
        mockSessionId,
        'question_started',
        expect.objectContaining({
          startTime,
          endTime,
        })
      );
    });

    it('should exclude eliminated participants from shuffled broadcasts', async () => {
      // Arrange
      const mockParticipants: Partial<Participant>[] = [
        {
          participantId: mockParticipantId1,
          sessionId: mockSessionId,
          nickname: 'Alice',
          isActive: true,
          isEliminated: false, // Active participant
          isSpectator: false,
          isBanned: false,
          totalScore: 100,
          totalTimeMs: 0,
          streakCount: 0,
          joinedAt: new Date(),
          lastConnectedAt: new Date(),
          ipAddress: '127.0.0.1',
        },
        // mockParticipantId2 is eliminated and should not receive broadcast
      ];

      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 2,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [mockParticipantId2],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        questions: [
          {
            questionId: mockQuestionId,
            questionText: 'Test',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 20,
            options: [
              { optionId: 'opt-1', optionText: 'A', isCorrect: false },
              { optionId: 'opt-2', optionText: 'B', isCorrect: true },
            ],
            shuffleOptions: true,
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
          },
        ],
      };

      const mockRedisState = {
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 0,
        currentQuestionId: mockQuestionId,
        currentQuestionStartTime: Date.now(),
        timerEndTime: Date.now() + 20000,
        participantCount: 2,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn()
        .mockResolvedValueOnce(mockSession)
        .mockResolvedValueOnce(mockQuiz);

      const mockFind = jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockParticipants),
      });

      (mongodbService.getCollection as jest.Mock).mockImplementation((collectionName: string) => {
        if (collectionName === 'sessions') {
          return { findOne: mockFindOne };
        }
        if (collectionName === 'quizzes') {
          return { findOne: mockFindOne };
        }
        if (collectionName === 'participants') {
          return { find: mockFind };
        }
        return {};
      });

      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipant as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuestionStarted(mockSessionId, mockQuestionIndex, mockQuestionId);

      // Assert
      // Should only call publishToParticipant once (for mockParticipantId1)
      expect(pubSubService.publishToParticipant).toHaveBeenCalledTimes(1);
      expect(pubSubService.publishToParticipant).toHaveBeenCalledWith(
        mockParticipantId1,
        'question_started',
        expect.any(Object)
      );

      // Verify the find query filters for active and non-eliminated participants
      expect(mockFind).toHaveBeenCalledWith({
        sessionId: mockSessionId,
        isActive: true,
        isEliminated: false,
      });
    });

    it('should create and start a timer when question starts', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        questions: [
          {
            questionId: mockQuestionId,
            questionText: 'Test question',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 30,
            options: [
              { optionId: 'opt-1', optionText: 'A', isCorrect: true },
              { optionId: 'opt-2', optionText: 'B', isCorrect: false },
            ],
            shuffleOptions: false,
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
          },
        ],
      };

      const mockRedisState = {
        state: 'ACTIVE_QUESTION' as const,
        currentQuestionIndex: 0,
        currentQuestionStartTime: Date.now(),
        timerEndTime: Date.now() + 30000,
        participantCount: 1,
      };

      // Mock MongoDB
      const mockFindOne = jest.fn()
        .mockResolvedValueOnce(mockSession)
        .mockResolvedValueOnce(mockQuiz);

      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(mockRedisState);

      // Mock PubSub
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

      // Mock timer manager
      const mockCreateTimer = jest.fn().mockResolvedValue({});
      (require('../quiz-timer.service').quizTimerManager.createTimer as jest.Mock) = mockCreateTimer;

      // Act
      await broadcastService.broadcastQuestionStarted(mockSessionId, mockQuestionIndex, mockQuestionId);

      // Assert - timer should be created with correct parameters
      expect(mockCreateTimer).toHaveBeenCalledWith({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: 30,
        onTimerExpired: expect.any(Function),
      });
    });
  });

  describe('broadcastRevealAnswers', () => {
    const mockQuestionId = 'question-123';

    it('should broadcast reveal_answers with correct options and statistics', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 3,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1, mockParticipantId2],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        description: 'Test Description',
        quizType: 'REGULAR' as const,
        createdBy: 'admin-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        questions: [
          {
            questionId: mockQuestionId,
            questionText: 'What is 2+2?',
            questionType: 'MULTIPLE_CHOICE' as const,
            timeLimit: 30,
            options: [
              {
                optionId: 'option-1',
                optionText: '3',
                isCorrect: false,
              },
              {
                optionId: 'option-2',
                optionText: '4',
                isCorrect: true,
              },
              {
                optionId: 'option-3',
                optionText: '5',
                isCorrect: false,
              },
            ],
            shuffleOptions: false,
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
            explanationText: 'The answer is 4 because 2+2=4',
          },
        ],
      };

      const mockAnswers = [
        {
          answerId: 'answer-1',
          sessionId: mockSessionId,
          participantId: mockParticipantId1,
          questionId: mockQuestionId,
          selectedOptions: ['option-2'],
          submittedAt: new Date(),
          responseTimeMs: 5000,
          isCorrect: true,
          pointsAwarded: 100,
          speedBonusApplied: 25,
          streakBonusApplied: 0,
          partialCreditApplied: false,
        },
        {
          answerId: 'answer-2',
          sessionId: mockSessionId,
          participantId: mockParticipantId2,
          questionId: mockQuestionId,
          selectedOptions: ['option-1'],
          submittedAt: new Date(),
          responseTimeMs: 8000,
          isCorrect: false,
          pointsAwarded: 0,
          speedBonusApplied: 0,
          streakBonusApplied: 0,
          partialCreditApplied: false,
        },
        {
          answerId: 'answer-3',
          sessionId: mockSessionId,
          participantId: 'participant-3',
          questionId: mockQuestionId,
          selectedOptions: ['option-2'],
          submittedAt: new Date(),
          responseTimeMs: 3000,
          isCorrect: true,
          pointsAwarded: 100,
          speedBonusApplied: 30,
          streakBonusApplied: 0,
          partialCreditApplied: false,
        },
      ];

      // Mock MongoDB
      const mockSessionFindOne = jest.fn().mockResolvedValue(mockSession);
      const mockQuizFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockAnswersFind = jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockAnswers),
      });
      const mockSessionUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });

      (mongodbService.getCollection as jest.Mock).mockImplementation((collectionName: string) => {
        if (collectionName === 'sessions') {
          return { findOne: mockSessionFindOne, updateOne: mockSessionUpdateOne };
        }
        if (collectionName === 'quizzes') {
          return { findOne: mockQuizFindOne };
        }
        if (collectionName === 'answers') {
          return { find: mockAnswersFind };
        }
        return {};
      });

      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastRevealAnswers(mockSessionId, mockQuestionId);

      // Assert
      expect(mongodbService.getCollection).toHaveBeenCalledWith('sessions');
      expect(mockSessionFindOne).toHaveBeenCalledWith({ sessionId: mockSessionId });

      expect(mongodbService.getCollection).toHaveBeenCalledWith('quizzes');
      expect(mockQuizFindOne).toHaveBeenCalledWith({ _id: mockSession.quizId });

      expect(mongodbService.getCollection).toHaveBeenCalledWith('answers');
      expect(mockAnswersFind).toHaveBeenCalledWith({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
      });

      // Should transition state to REVEAL in Redis
      expect(redisDataStructuresService.updateSessionState).toHaveBeenCalledWith(
        mockSessionId,
        { state: 'REVEAL' }
      );

      // Should update state in MongoDB
      expect(mockSessionUpdateOne).toHaveBeenCalledWith(
        { sessionId: mockSessionId },
        { $set: { state: 'REVEAL' } }
      );

      // Should broadcast reveal_answers with correct data
      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'reveal_answers',
        {
          questionId: mockQuestionId,
          correctOptions: ['option-2'],
          explanationText: 'The answer is 4 because 2+2=4',
          statistics: {
            totalAnswers: 3,
            correctAnswers: 2,
            averageResponseTime: 5333, // (5000 + 8000 + 3000) / 3 = 5333.33 rounded
          },
        }
      );
    });

    it('should handle multiple correct options', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        description: 'Test Description',
        quizType: 'REGULAR' as const,
        createdBy: 'admin-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        questions: [
          {
            questionId: mockQuestionId,
            questionText: 'Select all prime numbers',
            questionType: 'MULTIPLE_CHOICE' as const,
            timeLimit: 30,
            options: [
              {
                optionId: 'option-1',
                optionText: '2',
                isCorrect: true,
              },
              {
                optionId: 'option-2',
                optionText: '3',
                isCorrect: true,
              },
              {
                optionId: 'option-3',
                optionText: '4',
                isCorrect: false,
              },
              {
                optionId: 'option-4',
                optionText: '5',
                isCorrect: true,
              },
            ],
            shuffleOptions: false,
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: true,
            },
          },
        ],
      };

      const mockAnswers: any[] = [];

      // Mock MongoDB
      const mockSessionFindOne = jest.fn().mockResolvedValue(mockSession);
      const mockQuizFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockAnswersFind = jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockAnswers),
      });
      const mockSessionUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });

      (mongodbService.getCollection as jest.Mock).mockImplementation((collectionName: string) => {
        if (collectionName === 'sessions') {
          return { findOne: mockSessionFindOne, updateOne: mockSessionUpdateOne };
        }
        if (collectionName === 'quizzes') {
          return { findOne: mockQuizFindOne };
        }
        if (collectionName === 'answers') {
          return { find: mockAnswersFind };
        }
        return {};
      });

      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastRevealAnswers(mockSessionId, mockQuestionId);

      // Assert
      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'reveal_answers',
        expect.objectContaining({
          questionId: mockQuestionId,
          correctOptions: ['option-1', 'option-2', 'option-4'],
          statistics: {
            totalAnswers: 0,
            correctAnswers: 0,
            averageResponseTime: 0,
          },
        })
      );
    });

    it('should handle question without explanation text', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        description: 'Test Description',
        quizType: 'REGULAR' as const,
        createdBy: 'admin-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        questions: [
          {
            questionId: mockQuestionId,
            questionText: 'What is 2+2?',
            questionType: 'MULTIPLE_CHOICE' as const,
            timeLimit: 30,
            options: [
              {
                optionId: 'option-1',
                optionText: '4',
                isCorrect: true,
              },
            ],
            shuffleOptions: false,
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
            // No explanationText
          },
        ],
      };

      const mockAnswers: any[] = [];

      // Mock MongoDB
      const mockSessionFindOne = jest.fn().mockResolvedValue(mockSession);
      const mockQuizFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockAnswersFind = jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockAnswers),
      });
      const mockSessionUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });

      (mongodbService.getCollection as jest.Mock).mockImplementation((collectionName: string) => {
        if (collectionName === 'sessions') {
          return { findOne: mockSessionFindOne, updateOne: mockSessionUpdateOne };
        }
        if (collectionName === 'quizzes') {
          return { findOne: mockQuizFindOne };
        }
        if (collectionName === 'answers') {
          return { find: mockAnswersFind };
        }
        return {};
      });

      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastRevealAnswers(mockSessionId, mockQuestionId);

      // Assert
      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'reveal_answers',
        expect.objectContaining({
          questionId: mockQuestionId,
          correctOptions: ['option-1'],
          explanationText: undefined,
          statistics: {
            totalAnswers: 0,
            correctAnswers: 0,
            averageResponseTime: 0,
          },
        })
      );
    });

    it('should throw error if session not found', async () => {
      // Arrange
      const mockSessionFindOne = jest.fn().mockResolvedValue(null);

      (mongodbService.getCollection as jest.Mock).mockReturnValue({ findOne: mockSessionFindOne });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Act & Assert
      await expect(
        broadcastService.broadcastRevealAnswers(mockSessionId, mockQuestionId)
      ).rejects.toThrow(`Session not found: ${mockSessionId}`);
    });

    it('should throw error if quiz not found', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockSessionFindOne = jest.fn().mockResolvedValue(mockSession);
      const mockQuizFindOne = jest.fn().mockResolvedValue(null);

      (mongodbService.getCollection as jest.Mock).mockImplementation((collectionName: string) => {
        if (collectionName === 'sessions') {
          return { findOne: mockSessionFindOne };
        }
        if (collectionName === 'quizzes') {
          return { findOne: mockQuizFindOne };
        }
        return {};
      });

      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Act & Assert
      await expect(
        broadcastService.broadcastRevealAnswers(mockSessionId, mockQuestionId)
      ).rejects.toThrow(`Quiz not found: ${mockSession.quizId}`);
    });

    it('should throw error if question not found', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        description: 'Test Description',
        quizType: 'REGULAR' as const,
        createdBy: 'admin-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        questions: [
          {
            questionId: 'different-question-id',
            questionText: 'What is 2+2?',
            questionType: 'MULTIPLE_CHOICE' as const,
            timeLimit: 30,
            options: [],
            shuffleOptions: false,
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
          },
        ],
      };

      const mockSessionFindOne = jest.fn().mockResolvedValue(mockSession);
      const mockQuizFindOne = jest.fn().mockResolvedValue(mockQuiz);

      (mongodbService.getCollection as jest.Mock).mockImplementation((collectionName: string) => {
        if (collectionName === 'sessions') {
          return { findOne: mockSessionFindOne };
        }
        if (collectionName === 'quizzes') {
          return { findOne: mockQuizFindOne };
        }
        return {};
      });

      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Act & Assert
      await expect(
        broadcastService.broadcastRevealAnswers(mockSessionId, mockQuestionId)
      ).rejects.toThrow(`Question not found: ${mockQuestionId}`);
    });

    it('should calculate statistics correctly with no answers', async () => {
      // Arrange
      const mockSession: Partial<Session> = {
        sessionId: mockSessionId,
        joinCode: mockJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 1,
        quizId: new ObjectId(),
        currentQuestionIndex: 0,
        activeParticipants: [mockParticipantId1],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        description: 'Test Description',
        quizType: 'REGULAR' as const,
        createdBy: 'admin-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        questions: [
          {
            questionId: mockQuestionId,
            questionText: 'What is 2+2?',
            questionType: 'MULTIPLE_CHOICE' as const,
            timeLimit: 30,
            options: [
              {
                optionId: 'option-1',
                optionText: '4',
                isCorrect: true,
              },
            ],
            shuffleOptions: false,
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
          },
        ],
      };

      const mockAnswers: any[] = [];

      // Mock MongoDB
      const mockSessionFindOne = jest.fn().mockResolvedValue(mockSession);
      const mockQuizFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockAnswersFind = jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue(mockAnswers),
      });
      const mockSessionUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });

      (mongodbService.getCollection as jest.Mock).mockImplementation((collectionName: string) => {
        if (collectionName === 'sessions') {
          return { findOne: mockSessionFindOne, updateOne: mockSessionUpdateOne };
        }
        if (collectionName === 'quizzes') {
          return { findOne: mockQuizFindOne };
        }
        if (collectionName === 'answers') {
          return { find: mockAnswersFind };
        }
        return {};
      });

      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock Redis
      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);

      // Mock PubSub
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastRevealAnswers(mockSessionId, mockQuestionId);

      // Assert
      expect(pubSubService.broadcastToSession).toHaveBeenCalledWith(
        mockSessionId,
        'reveal_answers',
        expect.objectContaining({
          statistics: {
            totalAnswers: 0,
            correctAnswers: 0,
            averageResponseTime: 0,
          },
        })
      );
    });
  });

  describe('broadcastLeaderboardUpdated', () => {
    it('should broadcast leaderboard to big screen (top 10), controller (full), and participants', async () => {
      // Arrange
      const mockParticipant1: Partial<Participant> = {
        participantId: 'participant-1',
        sessionId: mockSessionId,
        nickname: 'Alice',
        isActive: true,
        totalScore: 150,
        totalTimeMs: 5000,
        streakCount: 2,
      };

      const mockParticipant2: Partial<Participant> = {
        participantId: 'participant-2',
        sessionId: mockSessionId,
        nickname: 'Bob',
        isActive: true,
        totalScore: 100,
        totalTimeMs: 6000,
        streakCount: 1,
      };

      // Mock Redis client
      const mockRedisClient = {
        zrevrange: jest.fn().mockResolvedValue([
          'participant-1', '150.000000005', // Higher score
          'participant-2', '100.000000006', // Lower score
        ]),
      };

      const { redisService } = require('../redis.service');
      (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

      // Mock participant sessions in Redis
      (redisDataStructuresService.getParticipantSession as jest.Mock)
        .mockResolvedValueOnce({
          sessionId: mockSessionId,
          nickname: 'Alice',
          totalScore: 150,
          lastQuestionScore: '50',
          totalTimeMs: 5000,
          streakCount: 2,
          isActive: true,
          isEliminated: false,
        })
        .mockResolvedValueOnce({
          sessionId: mockSessionId,
          nickname: 'Bob',
          totalScore: 100,
          lastQuestionScore: '30',
          totalTimeMs: 6000,
          streakCount: 1,
          isActive: true,
          isEliminated: false,
        });

      // Mock MongoDB participants
      const mockParticipantFindOne = jest.fn()
        .mockResolvedValueOnce(mockParticipant1)
        .mockResolvedValueOnce(mockParticipant2);

      (mongodbService.getCollection as jest.Mock).mockImplementation((collectionName: string) => {
        if (collectionName === 'participants') {
          return { findOne: mockParticipantFindOne };
        }
        return {};
      });

      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Mock PubSub
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastLeaderboardUpdated(mockSessionId);

      // Assert - Big Screen (top 10)
      expect(pubSubService.publishToBigScreen).toHaveBeenCalledWith(
        mockSessionId,
        'leaderboard_updated',
        expect.objectContaining({
          topN: 10,
          leaderboard: expect.arrayContaining([
            expect.objectContaining({
              rank: 1,
              participantId: 'participant-1',
              nickname: 'Alice',
              totalScore: 150,
              lastQuestionScore: 50,
              streakCount: 2,
            }),
            expect.objectContaining({
              rank: 2,
              participantId: 'participant-2',
              nickname: 'Bob',
              totalScore: 100,
              lastQuestionScore: 30,
              streakCount: 1,
            }),
          ]),
        })
      );

      // Assert - Controller (full leaderboard)
      expect(pubSubService.publishToController).toHaveBeenCalledWith(
        mockSessionId,
        'leaderboard_updated',
        expect.objectContaining({
          topN: 2,
          leaderboard: expect.arrayContaining([
            expect.objectContaining({
              rank: 1,
              participantId: 'participant-1',
            }),
            expect.objectContaining({
              rank: 2,
              participantId: 'participant-2',
            }),
          ]),
        })
      );

      // Assert - Participants (top 10)
      expect(pubSubService.publishToParticipants).toHaveBeenCalledWith(
        mockSessionId,
        'leaderboard_updated',
        expect.objectContaining({
          topN: 10,
        })
      );
    });

    it('should handle empty leaderboard gracefully', async () => {
      // Arrange
      const mockRedisClient = {
        zrevrange: jest.fn().mockResolvedValue([]),
      };

      const { redisService } = require('../redis.service');
      (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

      // Mock PubSub
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastLeaderboardUpdated(mockSessionId);

      // Assert - Should not broadcast if leaderboard is empty
      expect(pubSubService.publishToBigScreen).not.toHaveBeenCalled();
      expect(pubSubService.publishToController).not.toHaveBeenCalled();
      expect(pubSubService.publishToParticipants).not.toHaveBeenCalled();
    });
  });

  describe('broadcastAnswerCountUpdated', () => {
    const mockQuestionId = 'question-123';

    it('should broadcast answer_count_updated to controller with correct payload', async () => {
      // Arrange
      const answeredCount = 15;
      const totalParticipants = 20;

      // Mock PubSub
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastAnswerCountUpdated(
        mockSessionId,
        mockQuestionId,
        answeredCount,
        totalParticipants
      );

      // Assert
      expect(pubSubService.publishToController).toHaveBeenCalledWith(
        mockSessionId,
        'answer_count_updated',
        {
          questionId: mockQuestionId,
          answeredCount: 15,
          totalParticipants: 20,
          percentage: 75, // 15/20 * 100 = 75%
        }
      );
    });

    it('should calculate percentage correctly', async () => {
      // Arrange
      const answeredCount = 7;
      const totalParticipants = 10;

      // Mock PubSub
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastAnswerCountUpdated(
        mockSessionId,
        mockQuestionId,
        answeredCount,
        totalParticipants
      );

      // Assert
      expect(pubSubService.publishToController).toHaveBeenCalledWith(
        mockSessionId,
        'answer_count_updated',
        expect.objectContaining({
          percentage: 70, // 7/10 * 100 = 70%
        })
      );
    });

    it('should round percentage to nearest integer', async () => {
      // Arrange
      const answeredCount = 1;
      const totalParticipants = 3;

      // Mock PubSub
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastAnswerCountUpdated(
        mockSessionId,
        mockQuestionId,
        answeredCount,
        totalParticipants
      );

      // Assert
      expect(pubSubService.publishToController).toHaveBeenCalledWith(
        mockSessionId,
        'answer_count_updated',
        expect.objectContaining({
          percentage: 33, // 1/3 * 100 = 33.33... rounded to 33
        })
      );
    });

    it('should handle zero participants gracefully', async () => {
      // Arrange
      const answeredCount = 0;
      const totalParticipants = 0;

      // Mock PubSub
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastAnswerCountUpdated(
        mockSessionId,
        mockQuestionId,
        answeredCount,
        totalParticipants
      );

      // Assert - Should not throw and should set percentage to 0
      expect(pubSubService.publishToController).toHaveBeenCalledWith(
        mockSessionId,
        'answer_count_updated',
        {
          questionId: mockQuestionId,
          answeredCount: 0,
          totalParticipants: 0,
          percentage: 0,
        }
      );
    });

    it('should handle 100% participation', async () => {
      // Arrange
      const answeredCount = 50;
      const totalParticipants = 50;

      // Mock PubSub
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastAnswerCountUpdated(
        mockSessionId,
        mockQuestionId,
        answeredCount,
        totalParticipants
      );

      // Assert
      expect(pubSubService.publishToController).toHaveBeenCalledWith(
        mockSessionId,
        'answer_count_updated',
        expect.objectContaining({
          percentage: 100,
        })
      );
    });

    it('should not throw error if pubsub fails', async () => {
      // Arrange
      const answeredCount = 5;
      const totalParticipants = 10;

      // Mock PubSub to throw error
      (pubSubService.publishToController as jest.Mock).mockRejectedValue(
        new Error('Redis connection error')
      );

      // Act & Assert - Should not throw
      await expect(
        broadcastService.broadcastAnswerCountUpdated(
          mockSessionId,
          mockQuestionId,
          answeredCount,
          totalParticipants
        )
      ).resolves.not.toThrow();
    });

    it('should only broadcast to controller channel', async () => {
      // Arrange
      const answeredCount = 10;
      const totalParticipants = 20;

      // Mock PubSub
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastAnswerCountUpdated(
        mockSessionId,
        mockQuestionId,
        answeredCount,
        totalParticipants
      );

      // Assert - Only controller should receive the broadcast
      expect(pubSubService.publishToController).toHaveBeenCalledTimes(1);
      expect(pubSubService.publishToBigScreen).not.toHaveBeenCalled();
      expect(pubSubService.publishToParticipants).not.toHaveBeenCalled();
      expect(pubSubService.broadcastToSession).not.toHaveBeenCalled();
    });
  });

  describe('broadcastParticipantStatusChanged', () => {
    const mockParticipantId = 'participant-123';
    const mockNickname = 'TestPlayer';

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should broadcast participant_status_changed with connected status to controller', async () => {
      // Arrange
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastParticipantStatusChanged(
        mockSessionId,
        mockParticipantId,
        mockNickname,
        'connected'
      );

      // Assert
      expect(pubSubService.publishToController).toHaveBeenCalledTimes(1);
      expect(pubSubService.publishToController).toHaveBeenCalledWith(
        mockSessionId,
        'participant_status_changed',
        expect.objectContaining({
          participantId: mockParticipantId,
          nickname: mockNickname,
          status: 'connected',
          timestamp: expect.any(Number),
        })
      );
    });

    it('should broadcast participant_status_changed with disconnected status to controller', async () => {
      // Arrange
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastParticipantStatusChanged(
        mockSessionId,
        mockParticipantId,
        mockNickname,
        'disconnected'
      );

      // Assert
      expect(pubSubService.publishToController).toHaveBeenCalledTimes(1);
      expect(pubSubService.publishToController).toHaveBeenCalledWith(
        mockSessionId,
        'participant_status_changed',
        expect.objectContaining({
          participantId: mockParticipantId,
          nickname: mockNickname,
          status: 'disconnected',
          timestamp: expect.any(Number),
        })
      );
    });

    it('should include timestamp in the payload', async () => {
      // Arrange
      const beforeTimestamp = Date.now();
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastParticipantStatusChanged(
        mockSessionId,
        mockParticipantId,
        mockNickname,
        'connected'
      );

      const afterTimestamp = Date.now();

      // Assert
      const call = (pubSubService.publishToController as jest.Mock).mock.calls[0];
      const payload = call[2];
      expect(payload.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(payload.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should only broadcast to controller channel', async () => {
      // Arrange
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.broadcastToSession as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastParticipantStatusChanged(
        mockSessionId,
        mockParticipantId,
        mockNickname,
        'connected'
      );

      // Assert - Only controller should receive the broadcast
      expect(pubSubService.publishToController).toHaveBeenCalledTimes(1);
      expect(pubSubService.publishToBigScreen).not.toHaveBeenCalled();
      expect(pubSubService.publishToParticipants).not.toHaveBeenCalled();
      expect(pubSubService.broadcastToSession).not.toHaveBeenCalled();
    });

    it('should not throw when pubsub fails', async () => {
      // Arrange
      (pubSubService.publishToController as jest.Mock).mockRejectedValue(
        new Error('PubSub error')
      );

      // Act & Assert - Should not throw
      await expect(
        broadcastService.broadcastParticipantStatusChanged(
          mockSessionId,
          mockParticipantId,
          mockNickname,
          'connected'
        )
      ).resolves.not.toThrow();
    });

    it('should include all required fields in payload', async () => {
      // Arrange
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastParticipantStatusChanged(
        mockSessionId,
        mockParticipantId,
        mockNickname,
        'disconnected'
      );

      // Assert
      const call = (pubSubService.publishToController as jest.Mock).mock.calls[0];
      const payload = call[2];
      
      // Verify all required fields are present
      expect(payload).toHaveProperty('participantId', mockParticipantId);
      expect(payload).toHaveProperty('nickname', mockNickname);
      expect(payload).toHaveProperty('status', 'disconnected');
      expect(payload).toHaveProperty('timestamp');
      expect(typeof payload.timestamp).toBe('number');
    });
  });

  describe('broadcastSystemMetrics', () => {
    /**
     * Tests for system_metrics broadcast
     * 
     * Requirements: 13.9
     * - Collect metrics every 5 seconds
     * - Include activeConnections, averageLatency, cpuUsage, memoryUsage
     * - Broadcast to controller only
     */

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should broadcast system_metrics to controller with correct payload structure', async () => {
      // Arrange
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastSystemMetrics(mockSessionId);

      // Assert
      expect(pubSubService.publishToController).toHaveBeenCalledTimes(1);
      expect(pubSubService.publishToController).toHaveBeenCalledWith(
        mockSessionId,
        'system_metrics',
        expect.objectContaining({
          activeConnections: expect.any(Number),
          averageLatency: expect.any(Number),
          cpuUsage: expect.any(Number),
          memoryUsage: expect.any(Number),
        })
      );
    });

    it('should include all required metrics fields', async () => {
      // Arrange
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastSystemMetrics(mockSessionId);

      // Assert
      const call = (pubSubService.publishToController as jest.Mock).mock.calls[0];
      const payload = call[2];

      // Verify all required fields are present
      expect(payload).toHaveProperty('activeConnections');
      expect(payload).toHaveProperty('averageLatency');
      expect(payload).toHaveProperty('cpuUsage');
      expect(payload).toHaveProperty('memoryUsage');

      // Verify types
      expect(typeof payload.activeConnections).toBe('number');
      expect(typeof payload.averageLatency).toBe('number');
      expect(typeof payload.cpuUsage).toBe('number');
      expect(typeof payload.memoryUsage).toBe('number');
    });

    it('should broadcast to controller channel only', async () => {
      // Arrange
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastSystemMetrics(mockSessionId);

      // Assert - Only publishToController should be called
      expect(pubSubService.publishToController).toHaveBeenCalledTimes(1);
      expect(pubSubService.publishToBigScreen).not.toHaveBeenCalled();
      expect(pubSubService.publishToParticipants).not.toHaveBeenCalled();
      expect(pubSubService.broadcastToSession).not.toHaveBeenCalled();
    });

    it('should not throw when pubsub fails', async () => {
      // Arrange
      (pubSubService.publishToController as jest.Mock).mockRejectedValue(
        new Error('PubSub error')
      );

      // Act & Assert - Should not throw
      await expect(
        broadcastService.broadcastSystemMetrics(mockSessionId)
      ).resolves.not.toThrow();
    });

    it('should have cpuUsage between 0 and 100', async () => {
      // Arrange
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastSystemMetrics(mockSessionId);

      // Assert
      const call = (pubSubService.publishToController as jest.Mock).mock.calls[0];
      const payload = call[2];

      expect(payload.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(payload.cpuUsage).toBeLessThanOrEqual(100);
    });

    it('should have memoryUsage between 0 and 100', async () => {
      // Arrange
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastSystemMetrics(mockSessionId);

      // Assert
      const call = (pubSubService.publishToController as jest.Mock).mock.calls[0];
      const payload = call[2];

      expect(payload.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(payload.memoryUsage).toBeLessThanOrEqual(100);
    });

    it('should have non-negative activeConnections', async () => {
      // Arrange
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastSystemMetrics(mockSessionId);

      // Assert
      const call = (pubSubService.publishToController as jest.Mock).mock.calls[0];
      const payload = call[2];

      expect(payload.activeConnections).toBeGreaterThanOrEqual(0);
    });

    it('should have non-negative averageLatency', async () => {
      // Arrange
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastSystemMetrics(mockSessionId);

      // Assert
      const call = (pubSubService.publishToController as jest.Mock).mock.calls[0];
      const payload = call[2];

      expect(payload.averageLatency).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('SystemMetricsBroadcastManager', () => {
  /**
   * Tests for SystemMetricsBroadcastManager
   * 
   * Requirements: 13.9
   * - Start broadcasting when controller connects
   * - Stop broadcasting when controller disconnects
   * - Broadcast every 5 seconds
   */

  // Import the manager for testing
  const { systemMetricsBroadcastManager } = require('../broadcast.service');

  const mockSessionId = 'test-session-123';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Stop any existing broadcasts
    systemMetricsBroadcastManager.stopAll();
  });

  afterEach(() => {
    jest.useRealTimers();
    systemMetricsBroadcastManager.stopAll();
  });

  it('should start broadcasting for a session', () => {
    // Act
    systemMetricsBroadcastManager.startBroadcasting(mockSessionId);

    // Assert
    expect(systemMetricsBroadcastManager.isBroadcasting(mockSessionId)).toBe(true);
  });

  it('should stop broadcasting for a session', () => {
    // Arrange
    systemMetricsBroadcastManager.startBroadcasting(mockSessionId);
    expect(systemMetricsBroadcastManager.isBroadcasting(mockSessionId)).toBe(true);

    // Act
    systemMetricsBroadcastManager.stopBroadcasting(mockSessionId);

    // Assert
    expect(systemMetricsBroadcastManager.isBroadcasting(mockSessionId)).toBe(false);
  });

  it('should not start duplicate broadcasts for the same session', () => {
    // Act
    systemMetricsBroadcastManager.startBroadcasting(mockSessionId);
    systemMetricsBroadcastManager.startBroadcasting(mockSessionId);

    // Assert - Should still only have one active broadcast
    expect(systemMetricsBroadcastManager.getActiveBroadcastCount()).toBe(1);
  });

  it('should handle stopping non-existent broadcast gracefully', () => {
    // Act & Assert - Should not throw
    expect(() => {
      systemMetricsBroadcastManager.stopBroadcasting('non-existent-session');
    }).not.toThrow();
  });

  it('should stop all broadcasts', () => {
    // Arrange
    systemMetricsBroadcastManager.startBroadcasting('session-1');
    systemMetricsBroadcastManager.startBroadcasting('session-2');
    systemMetricsBroadcastManager.startBroadcasting('session-3');
    expect(systemMetricsBroadcastManager.getActiveBroadcastCount()).toBe(3);

    // Act
    systemMetricsBroadcastManager.stopAll();

    // Assert
    expect(systemMetricsBroadcastManager.getActiveBroadcastCount()).toBe(0);
    expect(systemMetricsBroadcastManager.isBroadcasting('session-1')).toBe(false);
    expect(systemMetricsBroadcastManager.isBroadcasting('session-2')).toBe(false);
    expect(systemMetricsBroadcastManager.isBroadcasting('session-3')).toBe(false);
  });

  it('should return correct active broadcast count', () => {
    // Assert initial state
    expect(systemMetricsBroadcastManager.getActiveBroadcastCount()).toBe(0);

    // Act & Assert
    systemMetricsBroadcastManager.startBroadcasting('session-1');
    expect(systemMetricsBroadcastManager.getActiveBroadcastCount()).toBe(1);

    systemMetricsBroadcastManager.startBroadcasting('session-2');
    expect(systemMetricsBroadcastManager.getActiveBroadcastCount()).toBe(2);

    systemMetricsBroadcastManager.stopBroadcasting('session-1');
    expect(systemMetricsBroadcastManager.getActiveBroadcastCount()).toBe(1);
  });

  it('should broadcast immediately when starting', async () => {
    // Arrange
    jest.useRealTimers(); // Use real timers for this test
    (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

    // Act
    systemMetricsBroadcastManager.startBroadcasting(mockSessionId);

    // Allow the immediate broadcast to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Assert - Should have broadcasted immediately
    expect(pubSubService.publishToController).toHaveBeenCalledWith(
      mockSessionId,
      'system_metrics',
      expect.any(Object)
    );
  });

  it('should stop periodic broadcasts when stopBroadcasting is called', async () => {
    // Arrange
    jest.useRealTimers(); // Use real timers for this test
    (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

    // Act
    systemMetricsBroadcastManager.startBroadcasting(mockSessionId);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Clear the initial call
    (pubSubService.publishToController as jest.Mock).mockClear();

    // Stop broadcasting
    systemMetricsBroadcastManager.stopBroadcasting(mockSessionId);

    // Wait a bit to ensure no more broadcasts happen
    await new Promise(resolve => setTimeout(resolve, 100));

    // Assert - Should NOT have broadcasted after stopping
    expect(pubSubService.publishToController).not.toHaveBeenCalled();
  });
});
