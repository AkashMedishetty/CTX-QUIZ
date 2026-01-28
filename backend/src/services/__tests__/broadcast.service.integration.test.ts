/**
 * Broadcast Service Integration Tests
 * 
 * Tests broadcast service with real Redis instance
 * 
 * Requirements: 2.2, 2.3, 2.6, 12.8
 */

import { broadcastService } from '../broadcast.service';
import { mongodbService } from '../mongodb.service';
import { redisDataStructuresService } from '../redis-data-structures.service';
import { pubSubService } from '../pubsub.service';
import { redisService } from '../redis.service';
import type { Session, Participant } from '../../models/types';
import { ObjectId } from 'mongodb';

describe('BroadcastService Integration Tests (with Real Redis)', () => {
  const testSessionId = `test-session-${Date.now()}`;
  const testJoinCode = 'TEST01';
  const testParticipantId1 = `participant-1-${Date.now()}`;
  const testParticipantId2 = `participant-2-${Date.now()}`;
  const testQuizId = new ObjectId();

  beforeAll(async () => {
    // Ensure Redis is connected
    await redisService.connect();
  });

  afterAll(async () => {
    // Clean up Redis
    const client = redisService.getClient();
    await client.del(`session:${testSessionId}:state`);
    await client.del(`participant:${testParticipantId1}:session`);
    await client.del(`participant:${testParticipantId2}:session`);
    await client.del(`joincode:${testJoinCode}`);
    
    // Disconnect Redis to prevent open handles
    await redisService.disconnect();
  });

  beforeEach(async () => {
    // Clear any existing test data
    const client = redisService.getClient();
    await client.del(`session:${testSessionId}:state`);
    await client.del(`participant:${testParticipantId1}:session`);
    await client.del(`participant:${testParticipantId2}:session`);
    await client.del(`joincode:${testJoinCode}`);
  });

  describe('broadcastLobbyState with Real Redis', () => {
    it('should broadcast lobby_state using real Redis state', async () => {
      // Arrange - Set up real Redis state
      await redisDataStructuresService.setSessionState(testSessionId, {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 2,
      });

      // Mock MongoDB
      const mockSession: Partial<Session> = {
        sessionId: testSessionId,
        joinCode: testJoinCode,
        state: 'LOBBY',
        participantCount: 2,
        quizId: testQuizId,
        currentQuestionIndex: 0,
        activeParticipants: [testParticipantId1, testParticipantId2],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockParticipants: Partial<Participant>[] = [
        {
          participantId: testParticipantId1,
          sessionId: testSessionId,
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
          participantId: testParticipantId2,
          sessionId: testSessionId,
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

      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(mockParticipants),
        }),
      });

      jest.spyOn(mongodbService, 'getCollection').mockImplementation((collectionName: string) => {
        if (collectionName === 'sessions') {
          return { findOne: mockFindOne } as any;
        }
        if (collectionName === 'participants') {
          return { find: mockFind } as any;
        }
        return {} as any;
      });

      jest.spyOn(mongodbService, 'withRetry').mockImplementation((fn) => fn());

      // Mock PubSub
      const publishToBigScreenSpy = jest.spyOn(pubSubService, 'publishToBigScreen').mockResolvedValue(undefined);
      const publishToParticipantsSpy = jest.spyOn(pubSubService, 'publishToParticipants').mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastLobbyState(testSessionId);

      // Assert - Verify Redis state was read
      const redisState = await redisDataStructuresService.getSessionState(testSessionId);
      expect(redisState).toEqual({
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 2,
      });

      // Verify broadcasts were made
      expect(publishToBigScreenSpy).toHaveBeenCalledWith(
        testSessionId,
        'lobby_state',
        expect.objectContaining({
          sessionId: testSessionId,
          joinCode: testJoinCode,
          participantCount: 2,
        })
      );

      expect(publishToParticipantsSpy).toHaveBeenCalledWith(
        testSessionId,
        'lobby_state',
        expect.objectContaining({
          sessionId: testSessionId,
          joinCode: testJoinCode,
          participantCount: 2,
        })
      );

      // Cleanup
      publishToBigScreenSpy.mockRestore();
      publishToParticipantsSpy.mockRestore();
    });

    it('should not broadcast if Redis state shows session is not in LOBBY', async () => {
      // Arrange - Set up real Redis state as ACTIVE_QUESTION
      await redisDataStructuresService.setSessionState(testSessionId, {
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: 1,
        participantCount: 2,
      });

      // Mock MongoDB
      const mockSession: Partial<Session> = {
        sessionId: testSessionId,
        joinCode: testJoinCode,
        state: 'LOBBY', // MongoDB says LOBBY, but Redis says ACTIVE_QUESTION
        participantCount: 2,
        quizId: testQuizId,
        currentQuestionIndex: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      jest.spyOn(mongodbService, 'getCollection').mockReturnValue({ findOne: mockFindOne } as any);
      jest.spyOn(mongodbService, 'withRetry').mockImplementation((fn) => fn());

      // Mock PubSub
      const publishToBigScreenSpy = jest.spyOn(pubSubService, 'publishToBigScreen').mockResolvedValue(undefined);
      const publishToParticipantsSpy = jest.spyOn(pubSubService, 'publishToParticipants').mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastLobbyState(testSessionId);

      // Assert - Should not broadcast because Redis state is ACTIVE_QUESTION
      expect(publishToBigScreenSpy).not.toHaveBeenCalled();
      expect(publishToParticipantsSpy).not.toHaveBeenCalled();

      // Cleanup
      publishToBigScreenSpy.mockRestore();
      publishToParticipantsSpy.mockRestore();
    });
  });

  describe('broadcastQuizStarted with Real Redis', () => {
    it('should broadcast quiz_started using real Redis state', async () => {
      // Arrange - Set up real Redis state
      await redisDataStructuresService.setSessionState(testSessionId, {
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: 0,
        participantCount: 2,
      });

      // Mock MongoDB
      const mockSession: Partial<Session> = {
        sessionId: testSessionId,
        joinCode: testJoinCode,
        state: 'ACTIVE_QUESTION',
        participantCount: 2,
        quizId: testQuizId,
        currentQuestionIndex: 0,
        activeParticipants: [testParticipantId1, testParticipantId2],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      };

      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      jest.spyOn(mongodbService, 'getCollection').mockReturnValue({ findOne: mockFindOne } as any);
      jest.spyOn(mongodbService, 'withRetry').mockImplementation((fn) => fn());

      // Mock PubSub
      const broadcastToSessionSpy = jest.spyOn(pubSubService, 'broadcastToSession').mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizStarted(testSessionId, 10);

      // Assert - Verify Redis state was read
      const redisState = await redisDataStructuresService.getSessionState(testSessionId);
      expect(redisState).toEqual({
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: 0,
        participantCount: 2,
      });

      // Verify broadcast was made
      expect(broadcastToSessionSpy).toHaveBeenCalledWith(
        testSessionId,
        'quiz_started',
        expect.objectContaining({
          sessionId: testSessionId,
          totalQuestions: 10,
          timestamp: expect.any(String),
        })
      );

      // Cleanup
      broadcastToSessionSpy.mockRestore();
    });
  });

  describe('broadcastQuizEnded with Real Redis', () => {
    it('should broadcast quiz_ended using real Redis state', async () => {
      // Arrange - Set up real Redis state
      await redisDataStructuresService.setSessionState(testSessionId, {
        state: 'ENDED',
        currentQuestionIndex: 10,
        participantCount: 2,
      });

      // Mock MongoDB
      const mockSession: Partial<Session> = {
        sessionId: testSessionId,
        joinCode: testJoinCode,
        state: 'ENDED',
        participantCount: 2,
        quizId: testQuizId,
        currentQuestionIndex: 10,
        activeParticipants: [testParticipantId1, testParticipantId2],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        endedAt: new Date(),
        hostId: 'host-1',
      };

      const mockFinalLeaderboard = [
        {
          rank: 1,
          participantId: testParticipantId1,
          nickname: 'Alice',
          totalScore: 100,
          totalTimeMs: 5000,
        },
        {
          rank: 2,
          participantId: testParticipantId2,
          nickname: 'Bob',
          totalScore: 80,
          totalTimeMs: 6000,
        },
      ];

      const mockFindOne = jest.fn().mockResolvedValue(mockSession);
      jest.spyOn(mongodbService, 'getCollection').mockReturnValue({ findOne: mockFindOne } as any);
      jest.spyOn(mongodbService, 'withRetry').mockImplementation((fn) => fn());

      // Mock PubSub
      const broadcastToSessionSpy = jest.spyOn(pubSubService, 'broadcastToSession').mockResolvedValue(undefined);

      // Act
      await broadcastService.broadcastQuizEnded(testSessionId, mockFinalLeaderboard);

      // Assert - Verify Redis state was read
      const redisState = await redisDataStructuresService.getSessionState(testSessionId);
      expect(redisState).toEqual({
        state: 'ENDED',
        currentQuestionIndex: 10,
        participantCount: 2,
      });

      // Verify broadcast was made
      expect(broadcastToSessionSpy).toHaveBeenCalledWith(
        testSessionId,
        'quiz_ended',
        expect.objectContaining({
          sessionId: testSessionId,
          finalLeaderboard: mockFinalLeaderboard,
          timestamp: expect.any(String),
        })
      );

      // Cleanup
      broadcastToSessionSpy.mockRestore();
    });
  });

  describe('Redis State Persistence', () => {
    it('should persist and retrieve session state from real Redis', async () => {
      // Arrange & Act
      await redisDataStructuresService.setSessionState(testSessionId, {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 5,
      });

      // Assert
      const retrievedState = await redisDataStructuresService.getSessionState(testSessionId);
      expect(retrievedState).toEqual({
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 5,
      });
    });

    it('should update session state in real Redis', async () => {
      // Arrange
      await redisDataStructuresService.setSessionState(testSessionId, {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 5,
      });

      // Act - Update state
      await redisDataStructuresService.updateSessionState(testSessionId, {
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: 1,
      });

      // Assert
      const retrievedState = await redisDataStructuresService.getSessionState(testSessionId);
      expect(retrievedState).toEqual({
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: 1,
        participantCount: 5, // Should retain previous value
      });
    });

    it('should handle join code mapping in real Redis', async () => {
      // Arrange & Act
      await redisDataStructuresService.setJoinCodeMapping(testJoinCode, testSessionId);

      // Assert
      const retrievedSessionId = await redisDataStructuresService.getSessionIdFromJoinCode(testJoinCode);
      expect(retrievedSessionId).toBe(testSessionId);

      // Check if join code exists
      const exists = await redisDataStructuresService.joinCodeExists(testJoinCode);
      expect(exists).toBe(true);
    });
  });
});
