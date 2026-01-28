/**
 * Tests for Controller start_quiz Event Handler
 * 
 * Tests the start_quiz event handler which:
 * - Verifies session is in LOBBY state
 * - Transitions to ACTIVE_QUESTION state
 * - Broadcasts first question to all clients
 * - Starts timer for first question
 * 
 * Requirements: 2.3, 2.8
 */

import { ObjectId } from 'mongodb';
import { handleControllerConnection } from '../controller.handler';
import { mongodbService } from '../../services/mongodb.service';
import { redisService } from '../../services/redis.service';
import { redisDataStructuresService } from '../../services/redis-data-structures.service';
import { broadcastService } from '../../services/broadcast.service';

// Mock services
jest.mock('../../services/mongodb.service');
jest.mock('../../services/redis.service');
jest.mock('../../services/redis-data-structures.service');
jest.mock('../../services/pubsub.service');
jest.mock('../../services/broadcast.service');

describe('Controller start_quiz Event Handler', () => {
  let mockSocket: any;
  let mockDb: any;
  let mockRedis: any;
  let startQuizHandler: (data: any) => Promise<void>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create mock socket with event handlers
    const eventHandlers: Record<string, any> = {};
    mockSocket = {
      id: 'socket-controller-123',
      data: {
        sessionId: 'session-789',
        role: 'controller',
      },
      emit: jest.fn(),
      on: jest.fn((event: string, handler: any) => {
        eventHandlers[event] = handler;
      }),
    };

    // Mock MongoDB
    mockDb = {
      collection: jest.fn((_name: string) => ({
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-789',
          quizId: new ObjectId(),
          state: 'LOBBY',
        }),
        updateOne: jest.fn(),
      })),
    };

    (mongodbService.getDb as jest.Mock).mockReturnValue(mockDb);

    // Mock Redis
    mockRedis = {
      hgetall: jest.fn().mockResolvedValue({
        state: 'LOBBY',
        participantCount: '5',
      }),
      hset: jest.fn(),
      expire: jest.fn(),
    };

    (redisService.getClient as jest.Mock).mockReturnValue(mockRedis);

    // Mock Redis Data Structures Service
    (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
      state: 'LOBBY',
      participantCount: 5,
    });

    (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);

    // Mock Broadcast Service
    (broadcastService.broadcastQuizStarted as jest.Mock).mockResolvedValue(undefined);
    (broadcastService.broadcastQuestionStarted as jest.Mock).mockResolvedValue(undefined);

    // Call handleControllerConnection to set up event handlers
    await handleControllerConnection(mockSocket);

    // Extract the start_quiz handler
    startQuizHandler = eventHandlers['start_quiz'];
  });

  describe('Successful Quiz Start', () => {
    it('should start quiz successfully from LOBBY state', async () => {
      // Mock session in LOBBY state
      const mockSession = {
        sessionId: 'session-789',
        quizId: new ObjectId(),
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 5,
      };

      // Mock quiz with questions
      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Test Quiz',
        questions: [
          {
            questionId: 'question-1',
            questionText: 'What is 2+2?',
            timeLimit: 30,
            options: [
              { optionId: 'opt-1', optionText: '3', isCorrect: false },
              { optionId: 'opt-2', optionText: '4', isCorrect: true },
            ],
          },
          {
            questionId: 'question-2',
            questionText: 'What is 3+3?',
            timeLimit: 30,
            options: [
              { optionId: 'opt-3', optionText: '5', isCorrect: false },
              { optionId: 'opt-4', optionText: '6', isCorrect: true },
            ],
          },
        ],
      };

      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue(mockSession),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      };

      const mockQuizzesCollection = {
        findOne: jest.fn().mockResolvedValue(mockQuiz),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'sessions') {
          return mockSessionsCollection;
        }
        if (name === 'quizzes') {
          return mockQuizzesCollection;
        }
        return {};
      });

      // Call start_quiz handler
      await startQuizHandler({ sessionId: 'session-789' });

      // Verify session state was updated in Redis
      expect(redisDataStructuresService.updateSessionState).toHaveBeenCalledWith(
        'session-789',
        expect.objectContaining({
          state: 'ACTIVE_QUESTION',
          currentQuestionIndex: 0,
        })
      );

      // Verify session was updated in MongoDB
      expect(mockSessionsCollection.updateOne).toHaveBeenCalledWith(
        { sessionId: 'session-789' },
        expect.objectContaining({
          $set: expect.objectContaining({
            state: 'ACTIVE_QUESTION',
            currentQuestionIndex: 0,
          }),
        })
      );

      // Verify quiz_started was broadcasted
      expect(broadcastService.broadcastQuizStarted).toHaveBeenCalledWith(
        'session-789',
        2 // total questions
      );

      // Verify question_started was broadcasted for first question
      expect(broadcastService.broadcastQuestionStarted).toHaveBeenCalledWith(
        'session-789',
        0, // question index
        'question-1' // question ID
      );

      // Verify success acknowledgment was sent to controller
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'quiz_started_ack',
        expect.objectContaining({
          success: true,
          sessionId: 'session-789',
          currentQuestionIndex: 0,
          totalQuestions: 2,
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should reject if sessionId does not match authenticated session', async () => {
      await startQuizHandler({ sessionId: 'different-session' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          event: 'start_quiz',
          error: 'Session ID mismatch',
        })
      );

      // Should not update state or broadcast
      expect(redisDataStructuresService.updateSessionState).not.toHaveBeenCalled();
      expect(broadcastService.broadcastQuizStarted).not.toHaveBeenCalled();
    });

    it('should reject if session not found', async () => {
      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'sessions') {
          return {
            findOne: jest.fn().mockResolvedValue(null),
          };
        }
        return {};
      });

      await startQuizHandler({ sessionId: 'session-789' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          event: 'start_quiz',
          error: 'Session not found',
        })
      );
    });

    it('should reject if session is not in LOBBY state', async () => {
      const mockSession = {
        sessionId: 'session-789',
        quizId: new ObjectId(),
        state: 'ACTIVE_QUESTION',
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'sessions') {
          return {
            findOne: jest.fn().mockResolvedValue(mockSession),
          };
        }
        return {};
      });

      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION',
      });

      await startQuizHandler({ sessionId: 'session-789' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          event: 'start_quiz',
          error: 'Cannot start quiz from ACTIVE_QUESTION state',
        })
      );
    });

    it('should reject if quiz not found', async () => {
      const mockSession = {
        sessionId: 'session-789',
        quizId: new ObjectId(),
        state: 'LOBBY',
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'sessions') {
          return {
            findOne: jest.fn().mockResolvedValue(mockSession),
          };
        }
        if (name === 'quizzes') {
          return {
            findOne: jest.fn().mockResolvedValue(null),
          };
        }
        return {};
      });

      await startQuizHandler({ sessionId: 'session-789' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          event: 'start_quiz',
          error: 'Quiz not found',
        })
      );
    });

    it('should reject if quiz has no questions', async () => {
      const mockSession = {
        sessionId: 'session-789',
        quizId: new ObjectId(),
        state: 'LOBBY',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        title: 'Empty Quiz',
        questions: [],
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'sessions') {
          return {
            findOne: jest.fn().mockResolvedValue(mockSession),
          };
        }
        if (name === 'quizzes') {
          return {
            findOne: jest.fn().mockResolvedValue(mockQuiz),
          };
        }
        return {};
      });

      await startQuizHandler({ sessionId: 'session-789' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          event: 'start_quiz',
          error: 'Quiz has no questions',
        })
      );
    });

    it('should handle errors gracefully', async () => {
      mockDb.collection.mockImplementation(() => {
        throw new Error('Database error');
      });

      await startQuizHandler({ sessionId: 'session-789' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          event: 'start_quiz',
          error: 'Failed to start quiz',
        })
      );
    });
  });

  describe('State Transitions', () => {
    it('should transition from LOBBY to ACTIVE_QUESTION', async () => {
      const mockSession = {
        sessionId: 'session-789',
        quizId: new ObjectId(),
        state: 'LOBBY',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        questions: [
          {
            questionId: 'question-1',
            questionText: 'Test',
            timeLimit: 30,
            options: [],
          },
        ],
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'sessions') {
          return {
            findOne: jest.fn().mockResolvedValue(mockSession),
            updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
          };
        }
        if (name === 'quizzes') {
          return {
            findOne: jest.fn().mockResolvedValue(mockQuiz),
          };
        }
        return {};
      });

      await startQuizHandler({ sessionId: 'session-789' });

      // Verify state transition
      expect(redisDataStructuresService.updateSessionState).toHaveBeenCalledWith(
        'session-789',
        expect.objectContaining({
          state: 'ACTIVE_QUESTION',
        })
      );
    });

    it('should set currentQuestionIndex to 0', async () => {
      const mockSession = {
        sessionId: 'session-789',
        quizId: new ObjectId(),
        state: 'LOBBY',
      };

      const mockQuiz = {
        _id: mockSession.quizId,
        questions: [
          {
            questionId: 'question-1',
            questionText: 'Test',
            timeLimit: 30,
            options: [],
          },
        ],
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'sessions') {
          return {
            findOne: jest.fn().mockResolvedValue(mockSession),
            updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
          };
        }
        if (name === 'quizzes') {
          return {
            findOne: jest.fn().mockResolvedValue(mockQuiz),
          };
        }
        return {};
      });

      await startQuizHandler({ sessionId: 'session-789' });

      // Verify currentQuestionIndex is set to 0
      expect(redisDataStructuresService.updateSessionState).toHaveBeenCalledWith(
        'session-789',
        expect.objectContaining({
          currentQuestionIndex: 0,
        })
      );
    });
  });
});
