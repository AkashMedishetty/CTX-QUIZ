/**
 * Scoring Service Unit Tests
 * 
 * Tests for score calculation, leaderboard updates, and batch processing
 */

import { scoringService } from '../scoring.service';
import { redisService } from '../redis.service';
import { redisDataStructuresService } from '../redis-data-structures.service';
import { mongodbService } from '../mongodb.service';

// Mock dependencies
jest.mock('../redis.service');
jest.mock('../redis-data-structures.service');
jest.mock('../mongodb.service');
jest.mock('../pubsub.service');

describe('ScoringService', () => {
  let mockRedisClient: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Redis client
    mockRedisClient = {
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      publish: jest.fn(),
      lrange: jest.fn(),
      hgetall: jest.fn(),
      hset: jest.fn(),
      zadd: jest.fn(),
      zrevrank: jest.fn(),
      zcard: jest.fn(),
    };

    (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

    // Mock MongoDB
    mockDb = {
      collection: jest.fn(),
    };

    (mongodbService.getDb as jest.Mock).mockReturnValue(mockDb);
  });

  describe('Score Calculation', () => {
    it('should calculate base points for correct answer', async () => {
      // This test verifies Property 17: Base Points Award
      // For any correct answer submission, the participant should be awarded
      // exactly the base points configured for that question.

      const answer = {
        answerId: 'answer-1',
        sessionId: 'session-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        selectedOptions: ['option-1'],
        submittedAt: Date.now(),
        responseTimeMs: 5000,
      };

      const question = {
        questionId: 'question-1',
        questionText: 'Test question',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 30,
        options: [
          { optionId: 'option-1', optionText: 'A', isCorrect: true },
          { optionId: 'option-2', optionText: 'B', isCorrect: false },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0,
          partialCreditEnabled: false,
        },
      };

      // Mock Redis responses
      mockRedisClient.lrange.mockResolvedValue([JSON.stringify(answer)]);
      
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-1',
          quizId: 'quiz-1',
        }),
      };

      const mockQuizzesCollection = {
        findOne: jest.fn().mockResolvedValue({
          _id: 'quiz-1',
          questions: [question],
        }),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'sessions') return mockSessionsCollection;
        if (name === 'quizzes') return mockQuizzesCollection;
        return { insertMany: jest.fn() };
      });

      (redisDataStructuresService.getParticipantSession as jest.Mock).mockResolvedValue({
        sessionId: 'session-1',
        nickname: 'Test User',
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        isActive: true,
        isEliminated: false,
      });

      // Process scoring message
      const scoringMessage = {
        answerId: 'answer-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
      };

      await (scoringService as any).processScoringMessage(JSON.stringify(scoringMessage));

      // Verify base points were awarded
      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'participant:participant-1:session',
        expect.objectContaining({
          totalScore: '100', // Base points only
          lastQuestionScore: '100',
        })
      );
    });

    it('should calculate speed bonus correctly', async () => {
      // This test verifies Property 18: Speed Bonus Calculation
      // For any correct answer submitted within the speed bonus window,
      // the total points awarded should equal base points plus
      // (base points × speed bonus multiplier × time factor)

      const answer = {
        answerId: 'answer-1',
        sessionId: 'session-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        selectedOptions: ['option-1'],
        submittedAt: Date.now(),
        responseTimeMs: 3000, // 3 seconds out of 30 = 90% time factor
      };

      const question = {
        questionId: 'question-1',
        questionText: 'Test question',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 30,
        options: [
          { optionId: 'option-1', optionText: 'A', isCorrect: true },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0.5, // 50% speed bonus
          partialCreditEnabled: false,
        },
      };

      // Mock Redis responses
      mockRedisClient.lrange.mockResolvedValue([JSON.stringify(answer)]);
      
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-1',
          quizId: 'quiz-1',
        }),
      };

      const mockQuizzesCollection = {
        findOne: jest.fn().mockResolvedValue({
          _id: 'quiz-1',
          questions: [question],
        }),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'sessions') return mockSessionsCollection;
        if (name === 'quizzes') return mockQuizzesCollection;
        return { insertMany: jest.fn() };
      });

      (redisDataStructuresService.getParticipantSession as jest.Mock).mockResolvedValue({
        sessionId: 'session-1',
        nickname: 'Test User',
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        isActive: true,
        isEliminated: false,
      });

      // Process scoring message
      const scoringMessage = {
        answerId: 'answer-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
      };

      await (scoringService as any).processScoringMessage(JSON.stringify(scoringMessage));

      // Expected calculation:
      // Time factor = 1.0 - (3000 / 30000) = 0.9
      // Speed bonus = 100 * 0.5 * 0.9 = 45
      // Total = 100 + 45 = 145

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'participant:participant-1:session',
        expect.objectContaining({
          totalScore: '145', // Base + speed bonus
          lastQuestionScore: '145',
        })
      );
    });

    it('should calculate streak bonus for consecutive correct answers', async () => {
      // This test verifies Property 19: Streak Bonus Application
      // For any participant who answers N consecutive questions correctly,
      // their streak count should be N, and each correct answer after the
      // first should include a streak bonus in the points awarded.

      const answer = {
        answerId: 'answer-1',
        sessionId: 'session-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        selectedOptions: ['option-1'],
        submittedAt: Date.now(),
        responseTimeMs: 5000,
      };

      const question = {
        questionId: 'question-1',
        questionText: 'Test question',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 30,
        options: [
          { optionId: 'option-1', optionText: 'A', isCorrect: true },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0,
          partialCreditEnabled: false,
        },
      };

      // Mock Redis responses
      mockRedisClient.lrange.mockResolvedValue([JSON.stringify(answer)]);
      
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-1',
          quizId: 'quiz-1',
        }),
      };

      const mockQuizzesCollection = {
        findOne: jest.fn().mockResolvedValue({
          _id: 'quiz-1',
          questions: [question],
        }),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'sessions') return mockSessionsCollection;
        if (name === 'quizzes') return mockQuizzesCollection;
        return { insertMany: jest.fn() };
      });

      // Participant has streak of 2 (this will be their 3rd correct answer)
      (redisDataStructuresService.getParticipantSession as jest.Mock).mockResolvedValue({
        sessionId: 'session-1',
        nickname: 'Test User',
        totalScore: 200,
        totalTimeMs: 10000,
        streakCount: 2,
        isActive: true,
        isEliminated: false,
      });

      // Process scoring message
      const scoringMessage = {
        answerId: 'answer-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
      };

      await (scoringService as any).processScoringMessage(JSON.stringify(scoringMessage));

      // Expected calculation:
      // Streak bonus = 100 * 0.1 * (3 - 1) = 20
      // Total = 100 + 20 = 120

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'participant:participant-1:session',
        expect.objectContaining({
          totalScore: '320', // 200 + 100 + 20
          lastQuestionScore: '120',
        })
      );

      // Verify streak was updated
      expect(redisDataStructuresService.updateParticipantStreak).toHaveBeenCalledWith(
        'participant-1',
        3
      );
    });

    it('should calculate partial credit for multi-correct questions', async () => {
      // This test verifies Property 20: Partial Credit Calculation
      // For any multi-correct question where a participant selects K out of N
      // correct options (and no incorrect options), the points awarded should
      // be (K/N) × base points.

      const answer = {
        answerId: 'answer-1',
        sessionId: 'session-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        selectedOptions: ['option-1', 'option-2'], // 2 out of 3 correct
        submittedAt: Date.now(),
        responseTimeMs: 5000,
      };

      const question = {
        questionId: 'question-1',
        questionText: 'Test question',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 30,
        options: [
          { optionId: 'option-1', optionText: 'A', isCorrect: true },
          { optionId: 'option-2', optionText: 'B', isCorrect: true },
          { optionId: 'option-3', optionText: 'C', isCorrect: true },
          { optionId: 'option-4', optionText: 'D', isCorrect: false },
        ],
        scoring: {
          basePoints: 150,
          speedBonusMultiplier: 0,
          partialCreditEnabled: true,
        },
      };

      // Mock Redis responses
      mockRedisClient.lrange.mockResolvedValue([JSON.stringify(answer)]);
      
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-1',
          quizId: 'quiz-1',
        }),
      };

      const mockQuizzesCollection = {
        findOne: jest.fn().mockResolvedValue({
          _id: 'quiz-1',
          questions: [question],
        }),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'sessions') return mockSessionsCollection;
        if (name === 'quizzes') return mockQuizzesCollection;
        return { insertMany: jest.fn() };
      });

      (redisDataStructuresService.getParticipantSession as jest.Mock).mockResolvedValue({
        sessionId: 'session-1',
        nickname: 'Test User',
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        isActive: true,
        isEliminated: false,
      });

      // Process scoring message
      const scoringMessage = {
        answerId: 'answer-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
      };

      await (scoringService as any).processScoringMessage(JSON.stringify(scoringMessage));

      // Expected calculation:
      // Partial credit = (2/3) × 150 = 100
      // Total = 100

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'participant:participant-1:session',
        expect.objectContaining({
          totalScore: '100', // Partial credit only
          lastQuestionScore: '100',
        })
      );
    });

    it('should not award partial credit if incorrect options are selected', async () => {
      const answer = {
        answerId: 'answer-1',
        sessionId: 'session-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        selectedOptions: ['option-1', 'option-4'], // 1 correct, 1 incorrect
        submittedAt: Date.now(),
        responseTimeMs: 5000,
      };

      const question = {
        questionId: 'question-1',
        questionText: 'Test question',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 30,
        options: [
          { optionId: 'option-1', optionText: 'A', isCorrect: true },
          { optionId: 'option-2', optionText: 'B', isCorrect: true },
          { optionId: 'option-3', optionText: 'C', isCorrect: true },
          { optionId: 'option-4', optionText: 'D', isCorrect: false },
        ],
        scoring: {
          basePoints: 150,
          speedBonusMultiplier: 0,
          partialCreditEnabled: true,
        },
      };

      // Mock Redis responses
      mockRedisClient.lrange.mockResolvedValue([JSON.stringify(answer)]);
      
      const mockSessionsCollection = {
        findOne: jest.fn().mockResolvedValue({
          sessionId: 'session-1',
          quizId: 'quiz-1',
        }),
      };

      const mockQuizzesCollection = {
        findOne: jest.fn().mockResolvedValue({
          _id: 'quiz-1',
          questions: [question],
        }),
      };

      mockDb.collection.mockImplementation((name: string) => {
        if (name === 'sessions') return mockSessionsCollection;
        if (name === 'quizzes') return mockQuizzesCollection;
        return { insertMany: jest.fn() };
      });

      (redisDataStructuresService.getParticipantSession as jest.Mock).mockResolvedValue({
        sessionId: 'session-1',
        nickname: 'Test User',
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        isActive: true,
        isEliminated: false,
      });

      // Process scoring message
      const scoringMessage = {
        answerId: 'answer-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
      };

      await (scoringService as any).processScoringMessage(JSON.stringify(scoringMessage));

      // No points awarded (incorrect option selected)
      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'participant:participant-1:session',
        expect.objectContaining({
          totalScore: '0',
          lastQuestionScore: '0',
        })
      );
    });
  });

  describe('Leaderboard Updates', () => {
    it('should update leaderboard with tie-breaker', async () => {
      // This test verifies Property 21: Tie-Breaking by Time
      // When scores are tied, the participant with lower total time should
      // rank higher

      (redisDataStructuresService.getParticipantSession as jest.Mock).mockResolvedValue({
        sessionId: 'session-1',
        nickname: 'Test User',
        totalScore: 500,
        totalTimeMs: 45000, // 45 seconds
        streakCount: 3,
        isActive: true,
        isEliminated: false,
      });

      await (scoringService as any).updateLeaderboard('participant-1', 'session-1');

      // Expected leaderboard score: 500 - (45000 / 1000000000) = 499.999955
      expect(mockRedisClient.zadd).toHaveBeenCalledWith(
        'session:session-1:leaderboard',
        499.999955,
        'participant-1'
      );
    });
  });

  describe('Batch Processing', () => {
    it('should batch insert answers to MongoDB', async () => {
      const mockAnswersCollection = {
        insertMany: jest.fn().mockResolvedValue({ insertedCount: 2 }),
      };

      mockDb.collection.mockReturnValue(mockAnswersCollection);

      // Add answers to batch
      (scoringService as any).answerBatch = [
        {
          answerId: 'answer-1',
          sessionId: 'session-1',
          participantId: 'participant-1',
          questionId: 'question-1',
          selectedOptions: ['option-1'],
          submittedAt: Date.now(),
          responseTimeMs: 5000,
          isCorrect: true,
          pointsAwarded: 100,
          speedBonusApplied: 0,
          streakBonusApplied: 0,
          partialCreditApplied: false,
        },
        {
          answerId: 'answer-2',
          sessionId: 'session-1',
          participantId: 'participant-2',
          questionId: 'question-1',
          selectedOptions: ['option-2'],
          submittedAt: Date.now(),
          responseTimeMs: 6000,
          isCorrect: false,
          pointsAwarded: 0,
          speedBonusApplied: 0,
          streakBonusApplied: 0,
          partialCreditApplied: false,
        },
      ];

      // Flush batch
      await (scoringService as any).flushAnswerBatch();

      // Verify batch insert
      expect(mockAnswersCollection.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ answerId: 'answer-1' }),
          expect.objectContaining({ answerId: 'answer-2' }),
        ])
      );

      // Verify batch was cleared
      expect((scoringService as any).answerBatch).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully and continue processing', async () => {
      // Mock error in getting answer from buffer
      mockRedisClient.lrange.mockRejectedValue(new Error('Redis error'));

      const scoringMessage = {
        answerId: 'answer-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        sessionId: 'session-1',
        timestamp: Date.now(),
      };

      // Should not throw
      await expect(
        (scoringService as any).processScoringMessage(JSON.stringify(scoringMessage))
      ).resolves.not.toThrow();
    });

    it('should keep answers in batch on MongoDB error', async () => {
      const mockAnswersCollection = {
        insertMany: jest.fn().mockRejectedValue(new Error('MongoDB error')),
      };

      mockDb.collection.mockReturnValue(mockAnswersCollection);

      // Add answers to batch
      (scoringService as any).answerBatch = [
        {
          answerId: 'answer-1',
          sessionId: 'session-1',
          participantId: 'participant-1',
          questionId: 'question-1',
          selectedOptions: ['option-1'],
          submittedAt: Date.now(),
          responseTimeMs: 5000,
          isCorrect: true,
          pointsAwarded: 100,
        },
      ];

      // Flush batch (should fail)
      await (scoringService as any).flushAnswerBatch();

      // Verify answers are still in batch for retry
      expect((scoringService as any).answerBatch).toHaveLength(1);
    });
  });

  describe('Error Recovery for Score Calculation', () => {
    /**
     * Tests for Requirement 17.4:
     * WHEN an error occurs during score calculation, THE System SHALL log the error
     * and use the previous valid score
     */

    it('should return last valid score when calculation fails', async () => {
      // Set up a last valid score for the participant
      const lastValidScore = {
        basePoints: 100,
        speedBonus: 25,
        streakBonus: 10,
        partialCredit: 0,
        totalPoints: 135,
        isCorrect: true,
      };
      (scoringService as any).lastValidScores.set('participant-1', lastValidScore);

      // Mock calculateScore to throw an error
      const originalCalculateScore = (scoringService as any).calculateScore;
      (scoringService as any).calculateScore = jest.fn().mockRejectedValue(
        new Error('Score calculation failed')
      );

      const answer = {
        answerId: 'answer-1',
        sessionId: 'session-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        selectedOptions: ['option-1'],
        submittedAt: Date.now(),
        responseTimeMs: 5000,
      };

      const question = {
        questionId: 'question-1',
        questionText: 'Test question',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 30,
        options: [
          { optionId: 'option-1', optionText: 'A', isCorrect: true },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0.5,
          partialCreditEnabled: false,
        },
      };

      // Call calculateScoreWithRecovery
      const result = await (scoringService as any).calculateScoreWithRecovery(
        answer,
        question,
        'participant-1',
        'session-1',
        'answer-1',
        'question-1'
      );

      // Should return last valid score
      expect(result).toEqual(lastValidScore);

      // Restore original method
      (scoringService as any).calculateScore = originalCalculateScore;
    });

    it('should return zero score when no previous valid score exists', async () => {
      // Clear any existing last valid scores
      (scoringService as any).lastValidScores.clear();

      // Mock calculateScore to throw an error
      const originalCalculateScore = (scoringService as any).calculateScore;
      (scoringService as any).calculateScore = jest.fn().mockRejectedValue(
        new Error('Score calculation failed')
      );

      const answer = {
        answerId: 'answer-1',
        sessionId: 'session-1',
        participantId: 'participant-new',
        questionId: 'question-1',
        selectedOptions: ['option-1'],
        submittedAt: Date.now(),
        responseTimeMs: 5000,
      };

      const question = {
        questionId: 'question-1',
        questionText: 'Test question',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 30,
        options: [
          { optionId: 'option-1', optionText: 'A', isCorrect: true },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0.5,
          partialCreditEnabled: false,
        },
      };

      // Call calculateScoreWithRecovery
      const result = await (scoringService as any).calculateScoreWithRecovery(
        answer,
        question,
        'participant-new',
        'session-1',
        'answer-1',
        'question-1'
      );

      // Should return zero score
      expect(result).toEqual({
        basePoints: 0,
        speedBonus: 0,
        streakBonus: 0,
        partialCredit: 0,
        totalPoints: 0,
        isCorrect: false,
      });

      // Restore original method
      (scoringService as any).calculateScore = originalCalculateScore;
    });

    it('should store valid score for future error recovery', async () => {
      // Clear any existing last valid scores
      (scoringService as any).lastValidScores.clear();

      const answer = {
        answerId: 'answer-1',
        sessionId: 'session-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        selectedOptions: ['option-1'],
        submittedAt: Date.now(),
        responseTimeMs: 5000,
      };

      const question = {
        questionId: 'question-1',
        questionText: 'Test question',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 30,
        options: [
          { optionId: 'option-1', optionText: 'A', isCorrect: true },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0,
          partialCreditEnabled: false,
        },
      };

      // Mock participant session for streak calculation
      (redisDataStructuresService.getParticipantSession as jest.Mock).mockResolvedValue({
        sessionId: 'session-1',
        nickname: 'Test User',
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        isActive: true,
        isEliminated: false,
      });

      // Call calculateScoreWithRecovery
      const result = await (scoringService as any).calculateScoreWithRecovery(
        answer,
        question,
        'participant-1',
        'session-1',
        'answer-1',
        'question-1'
      );

      // Verify score was stored
      const storedScore = (scoringService as any).lastValidScores.get('participant-1');
      expect(storedScore).toEqual(result);
      expect(storedScore.totalPoints).toBe(100);
    });

    it('should log error with full context when calculation fails', async () => {
      // Clear any existing last valid scores
      (scoringService as any).lastValidScores.clear();

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Mock calculateScore to throw an error
      const originalCalculateScore = (scoringService as any).calculateScore;
      (scoringService as any).calculateScore = jest.fn().mockRejectedValue(
        new Error('Database connection failed')
      );

      const answer = {
        answerId: 'answer-123',
        sessionId: 'session-456',
        participantId: 'participant-789',
        questionId: 'question-abc',
        selectedOptions: ['option-1'],
        submittedAt: Date.now(),
        responseTimeMs: 5000,
      };

      const question = {
        questionId: 'question-abc',
        questionText: 'Test question',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 30,
        options: [
          { optionId: 'option-1', optionText: 'A', isCorrect: true },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0,
          partialCreditEnabled: false,
        },
      };

      // Call calculateScoreWithRecovery
      await (scoringService as any).calculateScoreWithRecovery(
        answer,
        question,
        'participant-789',
        'session-456',
        'answer-123',
        'question-abc'
      );

      // Verify error was logged with context
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Scoring] Error calculating score:',
        expect.objectContaining({
          participantId: 'participant-789',
          questionId: 'question-abc',
          sessionId: 'session-456',
          answerId: 'answer-123',
          errorMessage: 'Database connection failed',
          timestamp: expect.any(Number),
        })
      );

      // Restore mocks
      consoleErrorSpy.mockRestore();
      (scoringService as any).calculateScore = originalCalculateScore;
    });

    it('should continue processing other answers after error', async () => {
      // This test verifies that errors in one calculation don't affect others
      
      // Set up mock for first answer (will fail)
      const originalCalculateScore = (scoringService as any).calculateScore;
      let callCount = 0;
      (scoringService as any).calculateScore = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First calculation failed');
        }
        return Promise.resolve({
          basePoints: 100,
          speedBonus: 0,
          streakBonus: 0,
          partialCredit: 0,
          totalPoints: 100,
          isCorrect: true,
        });
      });

      const answer1 = {
        answerId: 'answer-1',
        sessionId: 'session-1',
        participantId: 'participant-1',
        questionId: 'question-1',
        selectedOptions: ['option-1'],
        submittedAt: Date.now(),
        responseTimeMs: 5000,
      };

      const answer2 = {
        answerId: 'answer-2',
        sessionId: 'session-1',
        participantId: 'participant-2',
        questionId: 'question-1',
        selectedOptions: ['option-1'],
        submittedAt: Date.now(),
        responseTimeMs: 6000,
      };

      const question = {
        questionId: 'question-1',
        questionText: 'Test question',
        questionType: 'MULTIPLE_CHOICE',
        timeLimit: 30,
        options: [
          { optionId: 'option-1', optionText: 'A', isCorrect: true },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0,
          partialCreditEnabled: false,
        },
      };

      // First calculation should fail but return zero score
      const result1 = await (scoringService as any).calculateScoreWithRecovery(
        answer1,
        question,
        'participant-1',
        'session-1',
        'answer-1',
        'question-1'
      );

      // Second calculation should succeed
      const result2 = await (scoringService as any).calculateScoreWithRecovery(
        answer2,
        question,
        'participant-2',
        'session-1',
        'answer-2',
        'question-1'
      );

      // First should return zero (no previous valid score)
      expect(result1.totalPoints).toBe(0);
      
      // Second should return calculated score
      expect(result2.totalPoints).toBe(100);

      // Restore original method
      (scoringService as any).calculateScore = originalCalculateScore;
    });

    it('should clear last valid scores for session participants', () => {
      // Set up some last valid scores
      (scoringService as any).lastValidScores.set('participant-1', {
        basePoints: 100,
        speedBonus: 0,
        streakBonus: 0,
        partialCredit: 0,
        totalPoints: 100,
        isCorrect: true,
      });
      (scoringService as any).lastValidScores.set('participant-2', {
        basePoints: 200,
        speedBonus: 0,
        streakBonus: 0,
        partialCredit: 0,
        totalPoints: 200,
        isCorrect: true,
      });
      (scoringService as any).lastValidScores.set('participant-3', {
        basePoints: 150,
        speedBonus: 0,
        streakBonus: 0,
        partialCredit: 0,
        totalPoints: 150,
        isCorrect: true,
      });

      // Clear scores for participants 1 and 2
      scoringService.clearLastValidScoresForSession(['participant-1', 'participant-2']);

      // Verify only participant-3's score remains
      expect((scoringService as any).lastValidScores.has('participant-1')).toBe(false);
      expect((scoringService as any).lastValidScores.has('participant-2')).toBe(false);
      expect((scoringService as any).lastValidScores.has('participant-3')).toBe(true);
    });

    it('should get last valid score for participant', () => {
      const expectedScore = {
        basePoints: 100,
        speedBonus: 25,
        streakBonus: 10,
        partialCredit: 0,
        totalPoints: 135,
        isCorrect: true,
      };
      
      (scoringService as any).lastValidScores.set('participant-1', expectedScore);

      const result = scoringService.getLastValidScore('participant-1');
      expect(result).toEqual(expectedScore);

      // Non-existent participant should return undefined
      const nonExistent = scoringService.getLastValidScore('non-existent');
      expect(nonExistent).toBeUndefined();
    });
  });

});
