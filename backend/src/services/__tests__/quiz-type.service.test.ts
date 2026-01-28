/**
 * Quiz Type Service Tests
 * 
 * Tests quiz type-specific logic for REGULAR, ELIMINATION, and FFI quizzes.
 */

import { quizTypeService } from '../quiz-type.service';
import { mongodbService } from '../mongodb.service';
import { ObjectId } from 'mongodb';

describe('QuizTypeService', () => {
  let db: any;
  let testQuizId: ObjectId;
  let testSessionId: string;

  beforeAll(async () => {
    await mongodbService.connect();
    db = mongodbService.getDb();
  });

  afterAll(async () => {
    await mongodbService.disconnect();
  });

  beforeEach(async () => {
    // Clean up test data
    await db.collection('quizzes').deleteMany({});
    await db.collection('sessions').deleteMany({});
  });

  describe('REGULAR Quiz Type', () => {
    beforeEach(async () => {
      // Create a REGULAR quiz
      const quiz = {
        title: 'Regular Quiz',
        description: 'Test regular quiz',
        quizType: 'REGULAR',
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        questions: [
          {
            questionId: 'q1',
            questionText: 'Test question',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 30,
            options: [
              { optionId: 'o1', optionText: 'Option 1', isCorrect: true },
              { optionId: 'o2', optionText: 'Option 2', isCorrect: false },
            ],
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
            shuffleOptions: false,
          },
        ],
      };

      const result = await db.collection('quizzes').insertOne(quiz);
      testQuizId = result.insertedId;

      // Create a session
      testSessionId = 'session-regular-123';
      await db.collection('sessions').insertOne({
        sessionId: testSessionId,
        quizId: testQuizId,
        joinCode: 'ABC123',
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      });
    });

    it('should identify REGULAR quiz type correctly', async () => {
      const quizType = await quizTypeService.getQuizType(testSessionId);
      expect(quizType).toBe('REGULAR');
    });

    it('should return true for isRegularQuiz', async () => {
      const isRegular = await quizTypeService.isRegularQuiz(testSessionId);
      expect(isRegular).toBe(true);
    });

    it('should return false for isEliminationQuiz', async () => {
      const isElimination = await quizTypeService.isEliminationQuiz(testSessionId);
      expect(isElimination).toBe(false);
    });

    it('should return false for isFFIQuiz', async () => {
      const isFFI = await quizTypeService.isFFIQuiz(testSessionId);
      expect(isFFI).toBe(false);
    });

    it('should allow all participants to answer (not eliminated)', async () => {
      const canAnswer = await quizTypeService.canParticipantAnswer(testSessionId, false);
      expect(canAnswer).toBe(true);
    });

    it('should allow all participants to answer (even if marked as eliminated)', async () => {
      // In REGULAR quizzes, elimination flag should not matter
      const canAnswer = await quizTypeService.canParticipantAnswer(testSessionId, true);
      expect(canAnswer).toBe(true);
    });
  });

  describe('ELIMINATION Quiz Type', () => {
    beforeEach(async () => {
      // Create an ELIMINATION quiz
      const quiz = {
        title: 'Elimination Quiz',
        description: 'Test elimination quiz',
        quizType: 'ELIMINATION',
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        eliminationSettings: {
          eliminationPercentage: 20,
          eliminationFrequency: 'EVERY_QUESTION',
        },
        questions: [
          {
            questionId: 'q1',
            questionText: 'Test question',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 30,
            options: [
              { optionId: 'o1', optionText: 'Option 1', isCorrect: true },
              { optionId: 'o2', optionText: 'Option 2', isCorrect: false },
            ],
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
            shuffleOptions: false,
          },
        ],
      };

      const result = await db.collection('quizzes').insertOne(quiz);
      testQuizId = result.insertedId;

      // Create a session
      testSessionId = 'session-elimination-123';
      await db.collection('sessions').insertOne({
        sessionId: testSessionId,
        quizId: testQuizId,
        joinCode: 'DEF456',
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      });
    });

    it('should identify ELIMINATION quiz type correctly', async () => {
      const quizType = await quizTypeService.getQuizType(testSessionId);
      expect(quizType).toBe('ELIMINATION');
    });

    it('should return true for isEliminationQuiz', async () => {
      const isElimination = await quizTypeService.isEliminationQuiz(testSessionId);
      expect(isElimination).toBe(true);
    });

    it('should return false for isRegularQuiz', async () => {
      const isRegular = await quizTypeService.isRegularQuiz(testSessionId);
      expect(isRegular).toBe(false);
    });

    it('should allow non-eliminated participants to answer', async () => {
      const canAnswer = await quizTypeService.canParticipantAnswer(testSessionId, false);
      expect(canAnswer).toBe(true);
    });

    it('should NOT allow eliminated participants to answer', async () => {
      const canAnswer = await quizTypeService.canParticipantAnswer(testSessionId, true);
      expect(canAnswer).toBe(false);
    });
  });

  describe('FFI Quiz Type', () => {
    beforeEach(async () => {
      // Create an FFI quiz
      const quiz = {
        title: 'FFI Quiz',
        description: 'Test FFI quiz',
        quizType: 'FFI',
        createdBy: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
        branding: {
          primaryColor: '#000000',
          secondaryColor: '#FFFFFF',
        },
        ffiSettings: {
          winnersPerQuestion: 5,
        },
        questions: [
          {
            questionId: 'q1',
            questionText: 'Test question',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 30,
            options: [
              { optionId: 'o1', optionText: 'Option 1', isCorrect: true },
              { optionId: 'o2', optionText: 'Option 2', isCorrect: false },
            ],
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
            shuffleOptions: false,
          },
        ],
      };

      const result = await db.collection('quizzes').insertOne(quiz);
      testQuizId = result.insertedId;

      // Create a session
      testSessionId = 'session-ffi-123';
      await db.collection('sessions').insertOne({
        sessionId: testSessionId,
        quizId: testQuizId,
        joinCode: 'GHI789',
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        createdAt: new Date(),
        hostId: 'host-1',
      });
    });

    it('should identify FFI quiz type correctly', async () => {
      const quizType = await quizTypeService.getQuizType(testSessionId);
      expect(quizType).toBe('FFI');
    });

    it('should return true for isFFIQuiz', async () => {
      const isFFI = await quizTypeService.isFFIQuiz(testSessionId);
      expect(isFFI).toBe(true);
    });

    it('should return false for isRegularQuiz', async () => {
      const isRegular = await quizTypeService.isRegularQuiz(testSessionId);
      expect(isRegular).toBe(false);
    });

    it('should allow all participants to answer (not eliminated)', async () => {
      const canAnswer = await quizTypeService.canParticipantAnswer(testSessionId, false);
      expect(canAnswer).toBe(true);
    });

    it('should allow all participants to answer (even if marked as eliminated)', async () => {
      // In FFI quizzes, all participants can answer (elimination doesn't apply)
      const canAnswer = await quizTypeService.canParticipantAnswer(testSessionId, true);
      expect(canAnswer).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return null for non-existent session', async () => {
      const quizType = await quizTypeService.getQuizType('non-existent-session');
      expect(quizType).toBeNull();
    });

    it('should return false for canParticipantAnswer with non-existent session', async () => {
      const canAnswer = await quizTypeService.canParticipantAnswer('non-existent-session', false);
      expect(canAnswer).toBe(false);
    });
  });
});
