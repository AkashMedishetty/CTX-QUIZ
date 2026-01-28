/**
 * Quiz Routes Integration Tests
 * 
 * Tests quiz creation endpoint with real MongoDB connection
 */

import request from 'supertest';
import { createApp } from '../../app';
import { mongodbService } from '../../services';

describe('Quiz Routes Integration Tests', () => {
  let app: any;

  beforeAll(async () => {
    // Connect to MongoDB
    await mongodbService.connect();
    app = createApp();
  });

  afterAll(async () => {
    // Clean up and disconnect
    await mongodbService.disconnect();
  });

  afterEach(async () => {
    // Clean up test data after each test
    const collection = mongodbService.getCollection('quizzes');
    await collection.deleteMany({ title: /^Test Quiz/ });
  });

  describe('POST /api/quizzes - Integration', () => {
    it('should create a quiz and persist it to MongoDB', async () => {
      const quizData = {
        title: 'Test Quiz Integration',
        description: 'Integration test quiz',
        quizType: 'REGULAR',
        branding: {
          primaryColor: '#FF5733',
          secondaryColor: '#33FF57',
        },
        questions: [
          {
            questionText: 'What is 2 + 2?',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 30,
            options: [
              {
                optionText: '3',
                isCorrect: false,
              },
              {
                optionText: '4',
                isCorrect: true,
              },
            ],
            scoring: {
              basePoints: 100,
              speedBonusMultiplier: 0.5,
              partialCreditEnabled: false,
            },
            shuffleOptions: true,
          },
        ],
      };

      const response = await request(app)
        .post('/api/quizzes')
        .send(quizData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz).toBeDefined();
      expect(response.body.quiz.quizId).toBeDefined();

      // Verify the quiz was actually saved to MongoDB
      const collection = mongodbService.getCollection('quizzes');
      const savedQuiz = await collection.findOne({ title: 'Test Quiz Integration' });

      expect(savedQuiz).toBeDefined();
      expect(savedQuiz?.title).toBe('Test Quiz Integration');
      expect(savedQuiz?.quizType).toBe('REGULAR');
      expect(savedQuiz?.questions).toHaveLength(1);
      expect(savedQuiz?.questions[0].questionId).toBeDefined();
      expect(savedQuiz?.questions[0].options[0].optionId).toBeDefined();
    });

    it('should create an ELIMINATION quiz with settings', async () => {
      const quizData = {
        title: 'Test Quiz Elimination',
        description: 'Elimination quiz test',
        quizType: 'ELIMINATION',
        branding: {
          primaryColor: '#FF5733',
          secondaryColor: '#33FF57',
        },
        eliminationSettings: {
          eliminationPercentage: 25,
          eliminationFrequency: 'EVERY_QUESTION',
        },
        questions: [
          {
            questionText: 'Sample question',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 30,
            options: [
              { optionText: 'A', isCorrect: true },
              { optionText: 'B', isCorrect: false },
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

      const response = await request(app)
        .post('/api/quizzes')
        .send(quizData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.eliminationSettings).toBeDefined();
      expect(response.body.quiz.eliminationSettings.eliminationPercentage).toBe(25);

      // Verify in database
      const collection = mongodbService.getCollection('quizzes');
      const savedQuiz = await collection.findOne({ title: 'Test Quiz Elimination' });

      expect(savedQuiz?.eliminationSettings).toBeDefined();
      expect(savedQuiz?.eliminationSettings?.eliminationPercentage).toBe(25);
    });

    it('should create an FFI quiz with settings', async () => {
      const quizData = {
        title: 'Test Quiz FFI',
        description: 'FFI quiz test',
        quizType: 'FFI',
        branding: {
          primaryColor: '#FF5733',
          secondaryColor: '#33FF57',
        },
        ffiSettings: {
          winnersPerQuestion: 5,
        },
        questions: [
          {
            questionText: 'Sample question',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 30,
            options: [
              { optionText: 'A', isCorrect: true },
              { optionText: 'B', isCorrect: false },
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

      const response = await request(app)
        .post('/api/quizzes')
        .send(quizData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.ffiSettings).toBeDefined();
      expect(response.body.quiz.ffiSettings.winnersPerQuestion).toBe(5);

      // Verify in database
      const collection = mongodbService.getCollection('quizzes');
      const savedQuiz = await collection.findOne({ title: 'Test Quiz FFI' });

      expect(savedQuiz?.ffiSettings).toBeDefined();
      expect(savedQuiz?.ffiSettings?.winnersPerQuestion).toBe(5);
    });
  });
});
