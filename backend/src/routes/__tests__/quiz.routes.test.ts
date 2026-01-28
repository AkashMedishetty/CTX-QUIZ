/**
 * Quiz Routes Unit Tests
 * 
 * Tests for quiz management endpoints
 */

import request from 'supertest';
import { createApp } from '../../app';
import { mongodbService } from '../../services';

// Mock the MongoDB service
jest.mock('../../services', () => ({
  mongodbService: {
    getCollection: jest.fn(),
    withRetry: jest.fn(),
  },
}));

describe('Quiz Routes', () => {
  let app: any;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/quizzes', () => {
    const validQuizData = {
      title: 'Test Quiz',
      description: 'A test quiz for unit testing',
      quizType: 'REGULAR',
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [
        {
          questionId: '123e4567-e89b-12d3-a456-426614174000',
          questionText: 'What is 2 + 2?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: '123e4567-e89b-12d3-a456-426614174001',
              optionText: '3',
              isCorrect: false,
            },
            {
              optionId: '123e4567-e89b-12d3-a456-426614174002',
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

    it('should create a quiz successfully with valid data', async () => {
      // Mock MongoDB operations
      const mockInsertOne = jest.fn().mockResolvedValue({
        insertedId: '507f1f77bcf86cd799439011',
      });

      const mockCollection = {
        insertOne: mockInsertOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .post('/api/quizzes')
        .send(validQuizData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Quiz created successfully');
      expect(response.body.quiz).toBeDefined();
      expect(response.body.quiz.title).toBe(validQuizData.title);
      expect(response.body.quiz.quizType).toBe(validQuizData.quizType);
      expect(response.body.quiz.quizId).toBeDefined();
      expect(response.body.quiz.createdAt).toBeDefined();
      expect(response.body.quiz.updatedAt).toBeDefined();

      // Verify MongoDB was called
      expect(mockInsertOne).toHaveBeenCalledTimes(1);
      const insertedQuiz = mockInsertOne.mock.calls[0][0];
      expect(insertedQuiz.title).toBe(validQuizData.title);
      expect(insertedQuiz.questions).toHaveLength(1);
    });

    it('should reject quiz without title', async () => {
      const invalidData = { ...validQuizData, title: '' };

      const response = await request(app)
        .post('/api/quizzes')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should reject quiz without questions', async () => {
      const invalidData = { ...validQuizData, questions: [] };

      const response = await request(app)
        .post('/api/quizzes')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject quiz with invalid quiz type', async () => {
      const invalidData = { ...validQuizData, quizType: 'INVALID_TYPE' };

      const response = await request(app)
        .post('/api/quizzes')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject ELIMINATION quiz without elimination settings', async () => {
      const invalidData = {
        ...validQuizData,
        quizType: 'ELIMINATION',
        // Missing eliminationSettings
      };

      const response = await request(app)
        .post('/api/quizzes')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should accept ELIMINATION quiz with valid elimination settings', async () => {
      const mockInsertOne = jest.fn().mockResolvedValue({
        insertedId: '507f1f77bcf86cd799439011',
      });

      const mockCollection = {
        insertOne: mockInsertOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const validEliminationData = {
        ...validQuizData,
        quizType: 'ELIMINATION',
        eliminationSettings: {
          eliminationPercentage: 20,
          eliminationFrequency: 'EVERY_QUESTION',
        },
      };

      const response = await request(app)
        .post('/api/quizzes')
        .send(validEliminationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.quizType).toBe('ELIMINATION');
      expect(response.body.quiz.eliminationSettings).toBeDefined();
    });

    it('should reject FFI quiz without FFI settings', async () => {
      const invalidData = {
        ...validQuizData,
        quizType: 'FFI',
        // Missing ffiSettings
      };

      const response = await request(app)
        .post('/api/quizzes')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should accept FFI quiz with valid FFI settings', async () => {
      const mockInsertOne = jest.fn().mockResolvedValue({
        insertedId: '507f1f77bcf86cd799439011',
      });

      const mockCollection = {
        insertOne: mockInsertOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const validFFIData = {
        ...validQuizData,
        quizType: 'FFI',
        ffiSettings: {
          winnersPerQuestion: 5,
        },
      };

      const response = await request(app)
        .post('/api/quizzes')
        .send(validFFIData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.quizType).toBe('FFI');
      expect(response.body.quiz.ffiSettings).toBeDefined();
    });

    it('should reject quiz with invalid branding colors', async () => {
      const invalidData = {
        ...validQuizData,
        branding: {
          primaryColor: 'not-a-color',
          secondaryColor: '#33FF57',
        },
      };

      const response = await request(app)
        .post('/api/quizzes')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject question without at least one correct option', async () => {
      const invalidData = {
        ...validQuizData,
        questions: [
          {
            questionId: '123e4567-e89b-12d3-a456-426614174000',
            questionText: 'What is 2 + 2?',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 30,
            options: [
              {
                optionId: '123e4567-e89b-12d3-a456-426614174001',
                optionText: '3',
                isCorrect: false,
              },
              {
                optionId: '123e4567-e89b-12d3-a456-426614174002',
                optionText: '5',
                isCorrect: false,
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
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle MongoDB errors gracefully', async () => {
      const mockCollection = {
        insertOne: jest.fn().mockRejectedValue(new Error('Database connection failed')),
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .post('/api/quizzes')
        .send(validQuizData)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to create quiz');
      expect(response.body.message).toBe('Database connection failed');
    });

    it('should generate UUIDs for questions and options if not provided', async () => {
      const mockInsertOne = jest.fn().mockResolvedValue({
        insertedId: '507f1f77bcf86cd799439011',
      });

      const mockCollection = {
        insertOne: mockInsertOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const dataWithoutIds = {
        ...validQuizData,
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
        .send(dataWithoutIds)
        .expect(201);

      expect(response.body.success).toBe(true);
      
      // Verify that IDs were generated
      const insertedQuiz = mockInsertOne.mock.calls[0][0];
      expect(insertedQuiz.questions[0].questionId).toBeDefined();
      expect(insertedQuiz.questions[0].options[0].optionId).toBeDefined();
      expect(insertedQuiz.questions[0].options[1].optionId).toBeDefined();
    });
  });

  describe('GET /api/quizzes', () => {
    const mockQuizzes = [
      {
        _id: '507f1f77bcf86cd799439011',
        title: 'JavaScript Basics',
        description: 'Test your JavaScript knowledge',
        quizType: 'REGULAR',
        createdBy: 'admin',
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
        branding: {
          primaryColor: '#FF5733',
          secondaryColor: '#33FF57',
        },
        questions: [],
      },
      {
        _id: '507f1f77bcf86cd799439012',
        title: 'React Advanced',
        description: 'Advanced React concepts and patterns',
        quizType: 'ELIMINATION',
        createdBy: 'admin',
        createdAt: new Date('2024-01-14'),
        updatedAt: new Date('2024-01-14'),
        branding: {
          primaryColor: '#3357FF',
          secondaryColor: '#FF3357',
        },
        eliminationSettings: {
          eliminationPercentage: 20,
          eliminationFrequency: 'EVERY_QUESTION',
        },
        questions: [],
      },
      {
        _id: '507f1f77bcf86cd799439013',
        title: 'TypeScript Quiz',
        description: 'TypeScript fundamentals and advanced topics',
        quizType: 'FFI',
        createdBy: 'admin',
        createdAt: new Date('2024-01-13'),
        updatedAt: new Date('2024-01-13'),
        branding: {
          primaryColor: '#5733FF',
          secondaryColor: '#33FFAA',
        },
        ffiSettings: {
          winnersPerQuestion: 5,
        },
        questions: [],
      },
    ];

    it('should list all quizzes with default pagination', async () => {
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue(mockQuizzes),
            }),
          }),
        }),
      });

      const mockCountDocuments = jest.fn().mockResolvedValue(3);

      const mockCollection = {
        find: mockFind,
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app).get('/api/quizzes').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quizzes).toHaveLength(3);
      expect(response.body.quizzes[0].quizId).toBe('507f1f77bcf86cd799439011');
      expect(response.body.pagination).toEqual({
        total: 3,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });

      // Verify MongoDB was called with correct parameters
      expect(mockFind).toHaveBeenCalledWith({});
      expect(mockCountDocuments).toHaveBeenCalledWith({});
    });

    it('should support pagination with page and limit parameters', async () => {
      const paginatedQuizzes = [mockQuizzes[0]];

      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue(paginatedQuizzes),
            }),
          }),
        }),
      });

      const mockCountDocuments = jest.fn().mockResolvedValue(3);

      const mockCollection = {
        find: mockFind,
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes')
        .query({ page: 2, limit: 1 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quizzes).toHaveLength(1);
      expect(response.body.pagination).toEqual({
        total: 3,
        page: 2,
        limit: 1,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      });
    });

    it('should search quizzes by title', async () => {
      const searchResults = [mockQuizzes[0]];

      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue(searchResults),
            }),
          }),
        }),
      });

      const mockCountDocuments = jest.fn().mockResolvedValue(1);

      const mockCollection = {
        find: mockFind,
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes')
        .query({ search: 'JavaScript' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quizzes).toHaveLength(1);
      expect(response.body.quizzes[0].title).toBe('JavaScript Basics');

      // Verify search filter was applied
      expect(mockFind).toHaveBeenCalledWith({
        $or: [
          { title: { $regex: 'JavaScript', $options: 'i' } },
          { description: { $regex: 'JavaScript', $options: 'i' } },
        ],
      });
    });

    it('should search quizzes by description', async () => {
      const searchResults = [mockQuizzes[1]];

      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue(searchResults),
            }),
          }),
        }),
      });

      const mockCountDocuments = jest.fn().mockResolvedValue(1);

      const mockCollection = {
        find: mockFind,
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes')
        .query({ search: 'Advanced' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quizzes).toHaveLength(1);
      expect(response.body.quizzes[0].description).toContain('Advanced');
    });

    it('should perform case-insensitive search', async () => {
      const searchResults = [mockQuizzes[2]];

      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue(searchResults),
            }),
          }),
        }),
      });

      const mockCountDocuments = jest.fn().mockResolvedValue(1);

      const mockCollection = {
        find: mockFind,
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes')
        .query({ search: 'typescript' })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify case-insensitive flag was used
      expect(mockFind).toHaveBeenCalledWith({
        $or: [
          { title: { $regex: 'typescript', $options: 'i' } },
          { description: { $regex: 'typescript', $options: 'i' } },
        ],
      });
    });

    it('should return empty array when no quizzes match search', async () => {
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const mockCountDocuments = jest.fn().mockResolvedValue(0);

      const mockCollection = {
        find: mockFind,
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes')
        .query({ search: 'NonexistentQuiz' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quizzes).toHaveLength(0);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should enforce maximum limit of 100', async () => {
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue(mockQuizzes),
            }),
          }),
        }),
      });

      const mockCountDocuments = jest.fn().mockResolvedValue(3);

      const mockCollection = {
        find: mockFind,
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes')
        .query({ limit: 200 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pagination.limit).toBe(100); // Should be capped at 100
    });

    it('should handle invalid page numbers gracefully', async () => {
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue(mockQuizzes),
            }),
          }),
        }),
      });

      const mockCountDocuments = jest.fn().mockResolvedValue(3);

      const mockCollection = {
        find: mockFind,
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Test negative page number
      const response1 = await request(app)
        .get('/api/quizzes')
        .query({ page: -1 })
        .expect(200);

      expect(response1.body.pagination.page).toBe(1); // Should default to 1

      // Test zero page number
      const response2 = await request(app)
        .get('/api/quizzes')
        .query({ page: 0 })
        .expect(200);

      expect(response2.body.pagination.page).toBe(1); // Should default to 1
    });

    it('should handle invalid limit values gracefully', async () => {
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue(mockQuizzes),
            }),
          }),
        }),
      });

      const mockCountDocuments = jest.fn().mockResolvedValue(3);

      const mockCollection = {
        find: mockFind,
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      // Test negative limit
      const response1 = await request(app)
        .get('/api/quizzes')
        .query({ limit: -10 })
        .expect(200);

      expect(response1.body.pagination.limit).toBe(1); // Should default to minimum 1

      // Test zero limit - should default to 10
      const response2 = await request(app)
        .get('/api/quizzes')
        .query({ limit: 0 })
        .expect(200);

      expect(response2.body.pagination.limit).toBe(10); // Should default to 10
    });

    it('should sort quizzes by createdAt in descending order', async () => {
      const mockSort = jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue(mockQuizzes),
          }),
        }),
      });

      const mockFind = jest.fn().mockReturnValue({
        sort: mockSort,
      });

      const mockCountDocuments = jest.fn().mockResolvedValue(3);

      const mockCollection = {
        find: mockFind,
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      await request(app).get('/api/quizzes').expect(200);

      // Verify sort was called with correct parameters
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('should handle MongoDB errors gracefully', async () => {
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockRejectedValue(new Error('Database connection failed')),
            }),
          }),
        }),
      });

      const mockCollection = {
        find: mockFind,
        countDocuments: jest.fn(),
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app).get('/api/quizzes').expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to list quizzes');
      expect(response.body.message).toBe('Database connection failed');
    });

    it('should combine search and pagination parameters', async () => {
      const searchResults = [mockQuizzes[0]];

      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue(searchResults),
            }),
          }),
        }),
      });

      const mockCountDocuments = jest.fn().mockResolvedValue(1);

      const mockCollection = {
        find: mockFind,
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes')
        .query({ search: 'JavaScript', page: 1, limit: 5 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quizzes).toHaveLength(1);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
    });

    it('should trim whitespace from search query', async () => {
      const mockFind = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const mockCountDocuments = jest.fn().mockResolvedValue(0);

      const mockCollection = {
        find: mockFind,
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      await request(app)
        .get('/api/quizzes')
        .query({ search: '  JavaScript  ' })
        .expect(200);

      // Verify search term was trimmed
      expect(mockFind).toHaveBeenCalledWith({
        $or: [
          { title: { $regex: 'JavaScript', $options: 'i' } },
          { description: { $regex: 'JavaScript', $options: 'i' } },
        ],
      });
    });
  });

  describe('GET /api/quizzes/:quizId', () => {
    const mockQuiz = {
      _id: '507f1f77bcf86cd799439011',
      title: 'JavaScript Basics',
      description: 'Test your JavaScript knowledge',
      quizType: 'REGULAR',
      createdBy: 'admin',
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15'),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [
        {
          questionId: '123e4567-e89b-12d3-a456-426614174000',
          questionText: 'What is 2 + 2?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: '123e4567-e89b-12d3-a456-426614174001',
              optionText: '3',
              isCorrect: false,
            },
            {
              optionId: '123e4567-e89b-12d3-a456-426614174002',
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

    it('should retrieve a quiz by valid ID', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz).toBeDefined();
      expect(response.body.quiz.quizId).toBe('507f1f77bcf86cd799439011');
      expect(response.body.quiz.title).toBe('JavaScript Basics');
      expect(response.body.quiz.questions).toHaveLength(1);
      expect(response.body.quiz.questions[0].options).toHaveLength(2);

      // Verify MongoDB was called with correct ObjectId
      expect(mockFindOne).toHaveBeenCalledTimes(1);
    });

    it('should return full quiz with questions and options', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.questions).toBeDefined();
      expect(response.body.quiz.questions[0].questionText).toBe('What is 2 + 2?');
      expect(response.body.quiz.questions[0].options).toBeDefined();
      expect(response.body.quiz.questions[0].options[0].optionText).toBe('3');
      expect(response.body.quiz.questions[0].options[0].isCorrect).toBe(false);
      expect(response.body.quiz.questions[0].options[1].optionText).toBe('4');
      expect(response.body.quiz.questions[0].options[1].isCorrect).toBe(true);
    });

    it('should return 404 when quiz is not found', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(null);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Quiz not found');
      expect(response.body.message).toContain('507f1f77bcf86cd799439011');
    });

    it('should return 400 for invalid quiz ID format (too short)', async () => {
      const response = await request(app)
        .get('/api/quizzes/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid quiz ID format');
      expect(response.body.message).toContain('24-character hexadecimal');
    });

    it('should return 400 for invalid quiz ID format (non-hex characters)', async () => {
      const response = await request(app)
        .get('/api/quizzes/507f1f77bcf86cd799439xyz')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid quiz ID format');
    });

    it('should return 400 for invalid quiz ID format (too long)', async () => {
      const response = await request(app)
        .get('/api/quizzes/507f1f77bcf86cd799439011abc')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid quiz ID format');
    });

    it('should handle MongoDB errors gracefully', async () => {
      const mockFindOne = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to retrieve quiz');
      expect(response.body.message).toBe('Database connection failed');
    });

    it('should retrieve ELIMINATION quiz with elimination settings', async () => {
      const eliminationQuiz = {
        ...mockQuiz,
        _id: '507f1f77bcf86cd799439012',
        quizType: 'ELIMINATION',
        eliminationSettings: {
          eliminationPercentage: 20,
          eliminationFrequency: 'EVERY_QUESTION',
        },
      };

      const mockFindOne = jest.fn().mockResolvedValue(eliminationQuiz);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes/507f1f77bcf86cd799439012')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.quizType).toBe('ELIMINATION');
      expect(response.body.quiz.eliminationSettings).toBeDefined();
      expect(response.body.quiz.eliminationSettings.eliminationPercentage).toBe(20);
    });

    it('should retrieve FFI quiz with FFI settings', async () => {
      const ffiQuiz = {
        ...mockQuiz,
        _id: '507f1f77bcf86cd799439013',
        quizType: 'FFI',
        ffiSettings: {
          winnersPerQuestion: 5,
        },
      };

      const mockFindOne = jest.fn().mockResolvedValue(ffiQuiz);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes/507f1f77bcf86cd799439013')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.quizType).toBe('FFI');
      expect(response.body.quiz.ffiSettings).toBeDefined();
      expect(response.body.quiz.ffiSettings.winnersPerQuestion).toBe(5);
    });

    it('should retrieve quiz with multiple questions', async () => {
      const multiQuestionQuiz = {
        ...mockQuiz,
        questions: [
          mockQuiz.questions[0],
          {
            questionId: '223e4567-e89b-12d3-a456-426614174000',
            questionText: 'What is the capital of France?',
            questionType: 'MULTIPLE_CHOICE',
            timeLimit: 20,
            options: [
              {
                optionId: '223e4567-e89b-12d3-a456-426614174001',
                optionText: 'London',
                isCorrect: false,
              },
              {
                optionId: '223e4567-e89b-12d3-a456-426614174002',
                optionText: 'Paris',
                isCorrect: true,
              },
              {
                optionId: '223e4567-e89b-12d3-a456-426614174003',
                optionText: 'Berlin',
                isCorrect: false,
              },
            ],
            scoring: {
              basePoints: 150,
              speedBonusMultiplier: 0.3,
              partialCreditEnabled: false,
            },
            shuffleOptions: false,
          },
        ],
      };

      const mockFindOne = jest.fn().mockResolvedValue(multiQuestionQuiz);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.questions).toHaveLength(2);
      expect(response.body.quiz.questions[1].questionText).toBe('What is the capital of France?');
      expect(response.body.quiz.questions[1].options).toHaveLength(3);
    });

    it('should retrieve quiz with optional fields (images, explanation, speaker notes)', async () => {
      const quizWithOptionalFields = {
        ...mockQuiz,
        questions: [
          {
            ...mockQuiz.questions[0],
            questionImageUrl: 'https://example.com/question.jpg',
            explanationText: 'The correct answer is 4 because 2 + 2 = 4',
            speakerNotes: 'This is a basic arithmetic question',
            options: [
              {
                optionId: '123e4567-e89b-12d3-a456-426614174001',
                optionText: '3',
                optionImageUrl: 'https://example.com/option1.jpg',
                isCorrect: false,
              },
              {
                optionId: '123e4567-e89b-12d3-a456-426614174002',
                optionText: '4',
                optionImageUrl: 'https://example.com/option2.jpg',
                isCorrect: true,
              },
            ],
          },
        ],
      };

      const mockFindOne = jest.fn().mockResolvedValue(quizWithOptionalFields);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.questions[0].questionImageUrl).toBe('https://example.com/question.jpg');
      expect(response.body.quiz.questions[0].explanationText).toBeDefined();
      expect(response.body.quiz.questions[0].speakerNotes).toBeDefined();
      expect(response.body.quiz.questions[0].options[0].optionImageUrl).toBe('https://example.com/option1.jpg');
    });

    it('should include branding information in response', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .get('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.branding).toBeDefined();
      expect(response.body.quiz.branding.primaryColor).toBe('#FF5733');
      expect(response.body.quiz.branding.secondaryColor).toBe('#33FF57');
    });
  });

  describe('PUT /api/quizzes/:quizId', () => {
    const mockQuiz = {
      _id: '507f1f77bcf86cd799439011',
      title: 'JavaScript Basics',
      description: 'Test your JavaScript knowledge',
      quizType: 'REGULAR',
      createdBy: 'admin',
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15'),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [
        {
          questionId: '123e4567-e89b-12d3-a456-426614174000',
          questionText: 'What is 2 + 2?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionId: '123e4567-e89b-12d3-a456-426614174001',
              optionText: '3',
              isCorrect: false,
            },
            {
              optionId: '123e4567-e89b-12d3-a456-426614174002',
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

    it('should update quiz title successfully', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const updatedQuiz = { ...mockQuiz, title: 'Updated JavaScript Basics', updatedAt: new Date() };
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue(updatedQuiz);

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put('/api/quizzes/507f1f77bcf86cd799439011')
        .send({ title: 'Updated JavaScript Basics' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Quiz updated successfully');
      expect(response.body.quiz.title).toBe('Updated JavaScript Basics');
      expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('should update quiz description successfully', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const updatedQuiz = { ...mockQuiz, description: 'Updated description', updatedAt: new Date() };
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue(updatedQuiz);

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put('/api/quizzes/507f1f77bcf86cd799439011')
        .send({ description: 'Updated description' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.description).toBe('Updated description');
    });

    it('should update multiple fields at once', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const updatedQuiz = {
        ...mockQuiz,
        title: 'New Title',
        description: 'New Description',
        updatedAt: new Date(),
      };
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue(updatedQuiz);

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put('/api/quizzes/507f1f77bcf86cd799439011')
        .send({
          title: 'New Title',
          description: 'New Description',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.title).toBe('New Title');
      expect(response.body.quiz.description).toBe('New Description');
    });

    it('should update branding colors', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const updatedQuiz = {
        ...mockQuiz,
        branding: {
          primaryColor: '#0000FF',
          secondaryColor: '#00FF00',
        },
        updatedAt: new Date(),
      };
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue(updatedQuiz);

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put('/api/quizzes/507f1f77bcf86cd799439011')
        .send({
          branding: {
            primaryColor: '#0000FF',
            secondaryColor: '#00FF00',
          },
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.branding.primaryColor).toBe('#0000FF');
      expect(response.body.quiz.branding.secondaryColor).toBe('#00FF00');
    });

    it('should return 404 when quiz does not exist', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(null);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put('/api/quizzes/507f1f77bcf86cd799439011')
        .send({ title: 'Updated Title' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Quiz not found');
    });

    it('should return 400 for invalid quiz ID format', async () => {
      const response = await request(app)
        .put('/api/quizzes/invalid-id')
        .send({ title: 'Updated Title' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid quiz ID format');
    });

    it('should reject invalid title (too long)', async () => {
      const longTitle = 'a'.repeat(201);

      const response = await request(app)
        .put('/api/quizzes/507f1f77bcf86cd799439011')
        .send({ title: longTitle })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject invalid branding colors', async () => {
      const response = await request(app)
        .put('/api/quizzes/507f1f77bcf86cd799439011')
        .send({
          branding: {
            primaryColor: 'not-a-color',
            secondaryColor: '#00FF00',
          },
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle empty update (no fields provided)', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue(mockQuiz);

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put('/api/quizzes/507f1f77bcf86cd799439011')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should still update the updatedAt timestamp
      expect(mockFindOneAndUpdate).toHaveBeenCalled();
    });

    it('should update questions array', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const newQuestions = [
        {
          questionId: '223e4567-e89b-12d3-a456-426614174000',
          questionText: 'What is 3 + 3?',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 25,
          options: [
            {
              optionId: '223e4567-e89b-12d3-a456-426614174001',
              optionText: '5',
              isCorrect: false,
            },
            {
              optionId: '223e4567-e89b-12d3-a456-426614174002',
              optionText: '6',
              isCorrect: true,
            },
          ],
          scoring: {
            basePoints: 150,
            speedBonusMultiplier: 0.4,
            partialCreditEnabled: false,
          },
          shuffleOptions: false,
        },
      ];

      const updatedQuiz = { ...mockQuiz, questions: newQuestions, updatedAt: new Date() };
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue(updatedQuiz);

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put('/api/quizzes/507f1f77bcf86cd799439011')
        .send({ questions: newQuestions })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.questions).toHaveLength(1);
      expect(response.body.quiz.questions[0].questionText).toBe('What is 3 + 3?');
    });

    it('should handle MongoDB errors gracefully', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockFindOneAndUpdate = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put('/api/quizzes/507f1f77bcf86cd799439011')
        .send({ title: 'Updated Title' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to update quiz');
      expect(response.body.message).toBe('Database connection failed');
    });

    it('should update updatedAt timestamp', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const updatedQuiz = { ...mockQuiz, title: 'New Title', updatedAt: new Date('2024-01-20') };
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue(updatedQuiz);

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put('/api/quizzes/507f1f77bcf86cd799439011')
        .send({ title: 'New Title' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.quiz.updatedAt).toBeDefined();
      
      // Verify that updatedAt was included in the update
      const updateCall = mockFindOneAndUpdate.mock.calls[0];
      expect(updateCall[1].$set.updatedAt).toBeDefined();
    });

    it('should generate IDs for new questions without IDs', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue(mockQuiz);

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const questionsWithoutIds = [
        {
          questionText: 'New Question',
          questionType: 'MULTIPLE_CHOICE',
          timeLimit: 30,
          options: [
            {
              optionText: 'Option 1',
              isCorrect: false,
            },
            {
              optionText: 'Option 2',
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
      ];

      await request(app)
        .put('/api/quizzes/507f1f77bcf86cd799439011')
        .send({ questions: questionsWithoutIds })
        .expect(200);

      // Verify that IDs were generated
      const updateCall = mockFindOneAndUpdate.mock.calls[0];
      const updatedQuestions = updateCall[1].$set.questions;
      expect(updatedQuestions[0].questionId).toBeDefined();
      expect(updatedQuestions[0].options[0].optionId).toBeDefined();
      expect(updatedQuestions[0].options[1].optionId).toBeDefined();
    });
  });

  describe('DELETE /api/quizzes/:quizId', () => {
    const mockQuiz = {
      _id: '507f1f77bcf86cd799439011',
      title: 'JavaScript Basics',
      description: 'Test your JavaScript knowledge',
      quizType: 'REGULAR',
      createdBy: 'admin',
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15'),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [],
    };

    it('should delete a quiz successfully when no active sessions exist', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockCountDocuments = jest.fn().mockResolvedValue(0); // No active sessions
      const mockDeleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });

      const mockQuizzesCollection = {
        findOne: mockFindOne,
        deleteOne: mockDeleteOne,
      };

      const mockSessionsCollection = {
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockImplementation((name: string) => {
        if (name === 'quizzes') return mockQuizzesCollection;
        if (name === 'sessions') return mockSessionsCollection;
        return null;
      });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Quiz deleted successfully');
      expect(response.body.quizId).toBe('507f1f77bcf86cd799439011');

      // Verify MongoDB operations were called
      expect(mockFindOne).toHaveBeenCalledTimes(1);
      expect(mockCountDocuments).toHaveBeenCalledTimes(1);
      expect(mockDeleteOne).toHaveBeenCalledTimes(1);
    });

    it('should prevent deletion when active sessions exist', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockCountDocuments = jest.fn().mockResolvedValue(2); // 2 active sessions

      const mockQuizzesCollection = {
        findOne: mockFindOne,
      };

      const mockSessionsCollection = {
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockImplementation((name: string) => {
        if (name === 'quizzes') return mockQuizzesCollection;
        if (name === 'sessions') return mockSessionsCollection;
        return null;
      });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Cannot delete quiz with active sessions');
      expect(response.body.message).toContain('2 active session(s)');

      // Verify deleteOne was NOT called
      expect(mockFindOne).toHaveBeenCalledTimes(1);
      expect(mockCountDocuments).toHaveBeenCalledTimes(1);
    });

    it('should check for sessions in LOBBY state', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockCountDocuments = jest.fn().mockResolvedValue(1); // 1 session in LOBBY

      const mockQuizzesCollection = {
        findOne: mockFindOne,
      };

      const mockSessionsCollection = {
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockImplementation((name: string) => {
        if (name === 'quizzes') return mockQuizzesCollection;
        if (name === 'sessions') return mockSessionsCollection;
        return null;
      });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Cannot delete quiz with active sessions');

      // Verify the query checked for non-ENDED sessions
      const countCall = mockCountDocuments.mock.calls[0][0];
      expect(countCall.state).toEqual({ $ne: 'ENDED' });
    });

    it('should check for sessions in ACTIVE_QUESTION state', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockCountDocuments = jest.fn().mockResolvedValue(1);

      const mockQuizzesCollection = {
        findOne: mockFindOne,
      };

      const mockSessionsCollection = {
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockImplementation((name: string) => {
        if (name === 'quizzes') return mockQuizzesCollection;
        if (name === 'sessions') return mockSessionsCollection;
        return null;
      });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(400);

      // Verify the query used the correct quizId
      const countCall = mockCountDocuments.mock.calls[0][0];
      expect(countCall.quizId).toBeDefined();
    });

    it('should allow deletion when only ENDED sessions exist', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockCountDocuments = jest.fn().mockResolvedValue(0); // No active sessions (only ENDED)
      const mockDeleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });

      const mockQuizzesCollection = {
        findOne: mockFindOne,
        deleteOne: mockDeleteOne,
      };

      const mockSessionsCollection = {
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockImplementation((name: string) => {
        if (name === 'quizzes') return mockQuizzesCollection;
        if (name === 'sessions') return mockSessionsCollection;
        return null;
      });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockDeleteOne).toHaveBeenCalledTimes(1);
    });

    it('should return 404 when quiz does not exist', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(null);

      const mockQuizzesCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockImplementation((name: string) => {
        if (name === 'quizzes') return mockQuizzesCollection;
        return null;
      });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Quiz not found');
      expect(response.body.message).toContain('507f1f77bcf86cd799439011');
    });

    it('should return 400 for invalid quiz ID format (too short)', async () => {
      const response = await request(app)
        .delete('/api/quizzes/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid quiz ID format');
      expect(response.body.message).toContain('24-character hexadecimal');
    });

    it('should return 400 for invalid quiz ID format (non-hex characters)', async () => {
      const response = await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439xyz')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid quiz ID format');
    });

    it('should return 400 for invalid quiz ID format (too long)', async () => {
      const response = await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011abc')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid quiz ID format');
    });

    it('should handle MongoDB errors gracefully during quiz lookup', async () => {
      const mockFindOne = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const mockQuizzesCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockImplementation((name: string) => {
        if (name === 'quizzes') return mockQuizzesCollection;
        return null;
      });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to delete quiz');
      expect(response.body.message).toBe('Database connection failed');
    });

    it('should handle MongoDB errors gracefully during session check', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockCountDocuments = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const mockQuizzesCollection = {
        findOne: mockFindOne,
      };

      const mockSessionsCollection = {
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockImplementation((name: string) => {
        if (name === 'quizzes') return mockQuizzesCollection;
        if (name === 'sessions') return mockSessionsCollection;
        return null;
      });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to delete quiz');
    });

    it('should handle MongoDB errors gracefully during deletion', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockCountDocuments = jest.fn().mockResolvedValue(0);
      const mockDeleteOne = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const mockQuizzesCollection = {
        findOne: mockFindOne,
        deleteOne: mockDeleteOne,
      };

      const mockSessionsCollection = {
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockImplementation((name: string) => {
        if (name === 'quizzes') return mockQuizzesCollection;
        if (name === 'sessions') return mockSessionsCollection;
        return null;
      });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to delete quiz');
      expect(response.body.message).toBe('Database connection failed');
    });

    it('should return 404 if quiz was deleted between checks', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockCountDocuments = jest.fn().mockResolvedValue(0);
      const mockDeleteOne = jest.fn().mockResolvedValue({ deletedCount: 0 }); // Already deleted

      const mockQuizzesCollection = {
        findOne: mockFindOne,
        deleteOne: mockDeleteOne,
      };

      const mockSessionsCollection = {
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockImplementation((name: string) => {
        if (name === 'quizzes') return mockQuizzesCollection;
        if (name === 'sessions') return mockSessionsCollection;
        return null;
      });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Quiz not found');
    });

    it('should use MongoDB ObjectId for querying', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockCountDocuments = jest.fn().mockResolvedValue(0);
      const mockDeleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });

      const mockQuizzesCollection = {
        findOne: mockFindOne,
        deleteOne: mockDeleteOne,
      };

      const mockSessionsCollection = {
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockImplementation((name: string) => {
        if (name === 'quizzes') return mockQuizzesCollection;
        if (name === 'sessions') return mockSessionsCollection;
        return null;
      });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(200);

      // Verify ObjectId was used in queries
      const findOneCall = mockFindOne.mock.calls[0][0];
      expect(findOneCall._id).toBeDefined();
      expect(findOneCall._id.constructor.name).toBe('ObjectId');

      const countCall = mockCountDocuments.mock.calls[0][0];
      expect(countCall.quizId).toBeDefined();
      expect(countCall.quizId.constructor.name).toBe('ObjectId');

      const deleteCall = mockDeleteOne.mock.calls[0][0];
      expect(deleteCall._id).toBeDefined();
      expect(deleteCall._id.constructor.name).toBe('ObjectId');
    });

    it('should prevent deletion with multiple active sessions', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockCountDocuments = jest.fn().mockResolvedValue(5); // 5 active sessions

      const mockQuizzesCollection = {
        findOne: mockFindOne,
      };

      const mockSessionsCollection = {
        countDocuments: mockCountDocuments,
      };

      (mongodbService.getCollection as jest.Mock).mockImplementation((name: string) => {
        if (name === 'quizzes') return mockQuizzesCollection;
        if (name === 'sessions') return mockSessionsCollection;
        return null;
      });
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('5 active session(s)');
    });
  });

  describe('POST /api/quizzes/:quizId/questions', () => {
    const validQuestionData = {
      questionText: 'What is the capital of France?',
      questionType: 'MULTIPLE_CHOICE',
      timeLimit: 30,
      options: [
        {
          optionId: '123e4567-e89b-12d3-a456-426614174001',
          optionText: 'London',
          isCorrect: false,
        },
        {
          optionId: '123e4567-e89b-12d3-a456-426614174002',
          optionText: 'Paris',
          isCorrect: true,
        },
        {
          optionId: '123e4567-e89b-12d3-a456-426614174003',
          optionText: 'Berlin',
          isCorrect: false,
        },
      ],
      scoring: {
        basePoints: 100,
        speedBonusMultiplier: 0.5,
        partialCreditEnabled: false,
      },
      shuffleOptions: true,
    };

    const mockQuiz = {
      _id: '507f1f77bcf86cd799439011',
      title: 'Geography Quiz',
      description: 'Test your geography knowledge',
      quizType: 'REGULAR',
      createdBy: 'admin',
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15'),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [],
    };

    it('should add a question successfully with valid data', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuiz,
        questions: [validQuestionData],
        updatedAt: new Date(),
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(validQuestionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Question added successfully');
      expect(response.body.question).toBeDefined();
      expect(response.body.question.questionText).toBe(validQuestionData.questionText);
      expect(response.body.question.questionId).toBeDefined();
      expect(response.body.quizId).toBe('507f1f77bcf86cd799439011');

      // Verify MongoDB was called
      expect(mockFindOne).toHaveBeenCalledTimes(1);
      expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('should generate UUID for question if not provided', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuiz,
        questions: [validQuestionData],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const dataWithoutQuestionId = { ...validQuestionData };
      delete (dataWithoutQuestionId as any).questionId;

      const response = await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(dataWithoutQuestionId)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.question.questionId).toBeDefined();
      expect(response.body.question.questionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should generate UUIDs for options if not provided', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuiz,
        questions: [validQuestionData],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const dataWithoutOptionIds = {
        ...validQuestionData,
        options: validQuestionData.options.map((opt) => {
          const { optionId, ...rest } = opt;
          return rest;
        }),
      };

      const response = await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(dataWithoutOptionIds)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.question.options).toHaveLength(3);
      response.body.question.options.forEach((option: any) => {
        expect(option.optionId).toBeDefined();
        expect(option.optionId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      });
    });

    it('should reject invalid quiz ID format', async () => {
      const response = await request(app)
        .post('/api/quizzes/invalid-id/questions')
        .send(validQuestionData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid quiz ID format');
    });

    it('should return 404 if quiz not found', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(null);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(validQuestionData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Quiz not found');
    });

    it('should reject question without text', async () => {
      const invalidData = { ...validQuestionData, questionText: '' };

      const response = await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject question without options', async () => {
      const invalidData = { ...validQuestionData, options: [] };

      const response = await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject question without at least one correct option', async () => {
      const invalidData = {
        ...validQuestionData,
        options: validQuestionData.options.map((opt) => ({
          ...opt,
          isCorrect: false,
        })),
      };

      const response = await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject question with invalid time limit (too short)', async () => {
      const invalidData = { ...validQuestionData, timeLimit: 3 };

      const response = await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject question with invalid time limit (too long)', async () => {
      const invalidData = { ...validQuestionData, timeLimit: 150 };

      const response = await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject TRUE_FALSE question without exactly 2 options', async () => {
      const invalidData = {
        ...validQuestionData,
        questionType: 'TRUE_FALSE',
        options: [
          {
            optionId: '123e4567-e89b-12d3-a456-426614174001',
            optionText: 'True',
            isCorrect: true,
          },
        ],
      };

      const response = await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should accept TRUE_FALSE question with exactly 2 options', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuiz,
        questions: [validQuestionData],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const trueFalseData = {
        ...validQuestionData,
        questionType: 'TRUE_FALSE',
        options: [
          {
            optionId: '123e4567-e89b-12d3-a456-426614174001',
            optionText: 'True',
            isCorrect: true,
          },
          {
            optionId: '123e4567-e89b-12d3-a456-426614174002',
            optionText: 'False',
            isCorrect: false,
          },
        ],
      };

      const response = await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(trueFalseData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.question.questionType).toBe('TRUE_FALSE');
      expect(response.body.question.options).toHaveLength(2);
    });

    it('should accept question with optional fields', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuiz,
        questions: [validQuestionData],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const dataWithOptionalFields = {
        ...validQuestionData,
        questionImageUrl: 'https://example.com/image.jpg',
        explanationText: 'Paris is the capital and largest city of France.',
        speakerNotes: 'Emphasize the historical significance.',
      };

      const response = await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(dataWithOptionalFields)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.question.questionImageUrl).toBe(dataWithOptionalFields.questionImageUrl);
      expect(response.body.question.explanationText).toBe(dataWithOptionalFields.explanationText);
      expect(response.body.question.speakerNotes).toBe(dataWithOptionalFields.speakerNotes);
    });

    it('should handle MongoDB errors gracefully', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockFindOneAndUpdate = jest.fn().mockRejectedValue(new Error('Database error'));

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(validQuestionData)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to add question');
      expect(response.body.message).toBe('Database error');
    });

    it('should use MongoDB ObjectId for querying', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuiz,
        questions: [validQuestionData],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(validQuestionData)
        .expect(201);

      // Verify ObjectId was used in queries
      const findOneCall = mockFindOne.mock.calls[0][0];
      expect(findOneCall._id).toBeDefined();
      expect(findOneCall._id.constructor.name).toBe('ObjectId');

      const updateCall = mockFindOneAndUpdate.mock.calls[0][0];
      expect(updateCall._id).toBeDefined();
      expect(updateCall._id.constructor.name).toBe('ObjectId');
    });

    it('should update the quiz updatedAt timestamp', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuiz);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuiz,
        questions: [validQuestionData],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      await request(app)
        .post('/api/quizzes/507f1f77bcf86cd799439011/questions')
        .send(validQuestionData)
        .expect(201);

      // Verify updatedAt was set in the update
      const updateCall = mockFindOneAndUpdate.mock.calls[0][1];
      expect(updateCall.$set.updatedAt).toBeDefined();
      expect(updateCall.$set.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('PUT /api/quizzes/:quizId/questions/:questionId', () => {
    const questionId = '123e4567-e89b-12d3-a456-426614174000';
    
    const existingQuestion = {
      questionId: questionId,
      questionText: 'What is the capital of France?',
      questionType: 'MULTIPLE_CHOICE',
      timeLimit: 30,
      options: [
        {
          optionId: '123e4567-e89b-12d3-a456-426614174001',
          optionText: 'London',
          isCorrect: false,
        },
        {
          optionId: '123e4567-e89b-12d3-a456-426614174002',
          optionText: 'Paris',
          isCorrect: true,
        },
      ],
      scoring: {
        basePoints: 100,
        speedBonusMultiplier: 0.5,
        partialCreditEnabled: false,
      },
      shuffleOptions: true,
    };

    const mockQuizWithQuestion = {
      _id: '507f1f77bcf86cd799439011',
      title: 'Geography Quiz',
      description: 'Test your geography knowledge',
      quizType: 'REGULAR',
      createdBy: 'admin',
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15'),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [existingQuestion],
    };

    it('should update question text successfully', async () => {
      const updateData = {
        questionText: 'What is the capital of Germany?',
      };

      const updatedQuestion = {
        ...existingQuestion,
        questionText: updateData.questionText,
      };

      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestion,
        questions: [updatedQuestion],
        updatedAt: new Date(),
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Question updated successfully');
      expect(response.body.question.questionText).toBe(updateData.questionText);
      expect(response.body.question.questionId).toBe(questionId);
      expect(response.body.quizId).toBe('507f1f77bcf86cd799439011');
    });

    it('should update question options successfully', async () => {
      const updateData = {
        options: [
          {
            optionId: '123e4567-e89b-12d3-a456-426614174001',
            optionText: 'Madrid',
            isCorrect: false,
          },
          {
            optionId: '123e4567-e89b-12d3-a456-426614174002',
            optionText: 'Berlin',
            isCorrect: true,
          },
          {
            optionId: '123e4567-e89b-12d3-a456-426614174003',
            optionText: 'Rome',
            isCorrect: false,
          },
        ],
      };

      const updatedQuestion = {
        ...existingQuestion,
        options: updateData.options,
      };

      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestion,
        questions: [updatedQuestion],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.question.options).toHaveLength(3);
      expect(response.body.question.options[1].optionText).toBe('Berlin');
      expect(response.body.question.options[1].isCorrect).toBe(true);
    });

    it('should update multiple fields at once', async () => {
      const updateData = {
        questionText: 'Updated question text',
        timeLimit: 45,
        shuffleOptions: false,
        explanationText: 'This is the explanation',
      };

      const updatedQuestion = {
        ...existingQuestion,
        ...updateData,
      };

      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestion,
        questions: [updatedQuestion],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.question.questionText).toBe(updateData.questionText);
      expect(response.body.question.timeLimit).toBe(updateData.timeLimit);
      expect(response.body.question.shuffleOptions).toBe(updateData.shuffleOptions);
      expect(response.body.question.explanationText).toBe(updateData.explanationText);
    });

    it('should update scoring configuration', async () => {
      const updateData = {
        scoring: {
          basePoints: 200,
          speedBonusMultiplier: 0.75,
          partialCreditEnabled: true,
        },
      };

      const updatedQuestion = {
        ...existingQuestion,
        scoring: updateData.scoring,
      };

      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestion,
        questions: [updatedQuestion],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.question.scoring.basePoints).toBe(200);
      expect(response.body.question.scoring.speedBonusMultiplier).toBe(0.75);
      expect(response.body.question.scoring.partialCreditEnabled).toBe(true);
    });

    it('should generate UUIDs for new options if not provided', async () => {
      const updateData = {
        options: [
          {
            optionText: 'New Option 1',
            isCorrect: false,
          },
          {
            optionText: 'New Option 2',
            isCorrect: true,
          },
        ],
      };

      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestion,
        questions: [existingQuestion],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Verify that the update call included generated option IDs
      const updateCall = mockFindOneAndUpdate.mock.calls[0][1];
      const updatedOptions = updateCall.$set['questions.0.options'];
      expect(updatedOptions).toBeDefined();
      expect(updatedOptions[0].optionId).toBeDefined();
      expect(updatedOptions[1].optionId).toBeDefined();
    });

    it('should reject invalid quiz ID format', async () => {
      const response = await request(app)
        .put(`/api/quizzes/invalid-id/questions/${questionId}`)
        .send({ questionText: 'Updated text' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid quiz ID format');
    });

    it('should reject invalid question ID format', async () => {
      const response = await request(app)
        .put('/api/quizzes/507f1f77bcf86cd799439011/questions/invalid-uuid')
        .send({ questionText: 'Updated text' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid question ID format');
    });

    it('should return 404 if quiz not found', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(null);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send({ questionText: 'Updated text' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Quiz not found');
    });

    it('should return 404 if question not found in quiz', async () => {
      const mockFindOne = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestion,
        questions: [], // No questions
      });

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send({ questionText: 'Updated text' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Question not found');
      expect(response.body.message).toContain(questionId);
    });

    it('should reject update with invalid time limit (too short)', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send({ timeLimit: 3 })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject update with invalid time limit (too long)', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send({ timeLimit: 150 })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject update with empty question text', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send({ questionText: '' })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject update with options but no correct answer', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);

      const mockCollection = {
        findOne: mockFindOne,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send({
          options: [
            {
              optionId: '123e4567-e89b-12d3-a456-426614174001',
              optionText: 'Option 1',
              isCorrect: false,
            },
            {
              optionId: '123e4567-e89b-12d3-a456-426614174002',
              optionText: 'Option 2',
              isCorrect: false,
            },
          ],
        })
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should update quiz updatedAt timestamp', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestion,
        questions: [existingQuestion],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send({ questionText: 'Updated text' })
        .expect(200);

      // Verify updatedAt was set in the update
      const updateCall = mockFindOneAndUpdate.mock.calls[0][1];
      expect(updateCall.$set.updatedAt).toBeDefined();
      expect(updateCall.$set.updatedAt).toBeInstanceOf(Date);
    });

    it('should handle MongoDB errors gracefully', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);
      const mockFindOneAndUpdate = jest.fn().mockRejectedValue(
        new Error('Database connection failed')
      );

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send({ questionText: 'Updated text' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to update question');
      expect(response.body.message).toBe('Database connection failed');
    });

    it('should support partial updates (only update provided fields)', async () => {
      const updateData = {
        timeLimit: 60,
      };

      const updatedQuestion = {
        ...existingQuestion,
        timeLimit: 60,
      };

      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestion,
        questions: [updatedQuestion],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Verify only timeLimit was updated in the MongoDB call
      const updateCall = mockFindOneAndUpdate.mock.calls[0][1];
      expect(updateCall.$set['questions.0.timeLimit']).toBe(60);
      expect(updateCall.$set['questions.0.questionText']).toBeUndefined();
      expect(updateCall.$set['questions.0.options']).toBeUndefined();
    });

    it('should use MongoDB ObjectId for quiz lookup', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestion,
        questions: [existingQuestion],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send({ questionText: 'Updated text' })
        .expect(200);

      // Verify ObjectId was used
      const findOneCall = mockFindOne.mock.calls[0][0];
      expect(findOneCall._id).toBeDefined();
      expect(findOneCall._id.constructor.name).toBe('ObjectId');

      const updateCall = mockFindOneAndUpdate.mock.calls[0][0];
      expect(updateCall._id).toBeDefined();
      expect(updateCall._id.constructor.name).toBe('ObjectId');
    });

    it('should find question by UUID string in questions array', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestion);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestion,
        questions: [existingQuestion],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .put(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .send({ questionText: 'Updated text' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.question.questionId).toBe(questionId);
    });
  });

  describe('DELETE /api/quizzes/:quizId/questions/:questionId', () => {
    const questionId = '123e4567-e89b-12d3-a456-426614174000';
    const anotherQuestionId = '223e4567-e89b-12d3-a456-426614174000';
    
    const existingQuestion = {
      questionId: questionId,
      questionText: 'What is the capital of France?',
      questionType: 'MULTIPLE_CHOICE',
      timeLimit: 30,
      options: [
        {
          optionId: '123e4567-e89b-12d3-a456-426614174001',
          optionText: 'London',
          isCorrect: false,
        },
        {
          optionId: '123e4567-e89b-12d3-a456-426614174002',
          optionText: 'Paris',
          isCorrect: true,
        },
      ],
      scoring: {
        basePoints: 100,
        speedBonusMultiplier: 0.5,
        partialCreditEnabled: false,
      },
      shuffleOptions: true,
    };

    const anotherQuestion = {
      questionId: anotherQuestionId,
      questionText: 'What is 2 + 2?',
      questionType: 'MULTIPLE_CHOICE',
      timeLimit: 20,
      options: [
        {
          optionId: '223e4567-e89b-12d3-a456-426614174001',
          optionText: '3',
          isCorrect: false,
        },
        {
          optionId: '223e4567-e89b-12d3-a456-426614174002',
          optionText: '4',
          isCorrect: true,
        },
      ],
      scoring: {
        basePoints: 100,
        speedBonusMultiplier: 0.5,
        partialCreditEnabled: false,
      },
      shuffleOptions: false,
    };

    const mockQuizWithQuestions = {
      _id: '507f1f77bcf86cd799439011',
      title: 'Geography Quiz',
      description: 'Test your geography knowledge',
      quizType: 'REGULAR',
      createdBy: 'admin',
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-01-15'),
      branding: {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      },
      questions: [existingQuestion, anotherQuestion],
    };

    it('should delete a question successfully', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestions);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestions,
        questions: [anotherQuestion], // Only the other question remains
        updatedAt: new Date(),
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Question deleted successfully');
      expect(response.body.questionId).toBe(questionId);
      expect(response.body.quizId).toBe('507f1f77bcf86cd799439011');

      // Verify MongoDB $pull was called
      expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
      const updateCall = mockFindOneAndUpdate.mock.calls[0];
      expect(updateCall[1].$pull).toEqual({ questions: { questionId: questionId } });
      expect(updateCall[1].$set.updatedAt).toBeDefined();
    });

    it('should reject invalid quiz ID format', async () => {
      const response = await request(app)
        .delete(`/api/quizzes/invalid-id/questions/${questionId}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid quiz ID format');
      expect(response.body.message).toContain('24-character hexadecimal');
    });

    it('should reject invalid question ID format', async () => {
      const response = await request(app)
        .delete('/api/quizzes/507f1f77bcf86cd799439011/questions/invalid-uuid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid question ID format');
      expect(response.body.message).toContain('valid UUID');
    });

    it('should return 404 when quiz is not found', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(null);

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: jest.fn(),
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Quiz not found');
      expect(response.body.message).toContain('507f1f77bcf86cd799439011');
    });

    it('should return 404 when question is not found in quiz', async () => {
      const nonExistentQuestionId = '999e4567-e89b-12d3-a456-426614174000';
      
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestions);

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: jest.fn(),
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete(`/api/quizzes/507f1f77bcf86cd799439011/questions/${nonExistentQuestionId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Question not found');
      expect(response.body.message).toContain(nonExistentQuestionId);
      expect(response.body.message).toContain('507f1f77bcf86cd799439011');
    });

    it('should handle MongoDB errors gracefully', async () => {
      const mockFindOne = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: jest.fn(),
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to delete question');
      expect(response.body.message).toBe('Database connection failed');
    });

    it('should update quiz updatedAt timestamp when deleting question', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestions);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestions,
        questions: [anotherQuestion],
        updatedAt: new Date(),
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      await request(app)
        .delete(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .expect(200);

      // Verify updatedAt was set
      const updateCall = mockFindOneAndUpdate.mock.calls[0];
      expect(updateCall[1].$set.updatedAt).toBeInstanceOf(Date);
    });

    it('should use MongoDB $pull operator to remove question', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestions);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestions,
        questions: [anotherQuestion],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      await request(app)
        .delete(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .expect(200);

      // Verify $pull operator was used correctly
      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        {
          $pull: { questions: { questionId: questionId } },
          $set: { updatedAt: expect.any(Date) },
        },
        { returnDocument: 'after' }
      );
    });

    it('should handle case when findOneAndUpdate returns null', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestions);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue(null);

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Quiz not found');
    });

    it('should validate quiz ID is exactly 24 characters', async () => {
      const shortId = '507f1f77bcf86cd79943901'; // 23 characters
      
      const response = await request(app)
        .delete(`/api/quizzes/${shortId}/questions/${questionId}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid quiz ID format');
    });

    it('should validate question ID is a valid UUID format', async () => {
      const invalidUuid = '123e4567-e89b-12d3-a456'; // Incomplete UUID
      
      const response = await request(app)
        .delete(`/api/quizzes/507f1f77bcf86cd799439011/questions/${invalidUuid}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid question ID format');
    });

    it('should find question by UUID string in questions array', async () => {
      const mockFindOne = jest.fn().mockResolvedValue(mockQuizWithQuestions);
      const mockFindOneAndUpdate = jest.fn().mockResolvedValue({
        ...mockQuizWithQuestions,
        questions: [anotherQuestion],
      });

      const mockCollection = {
        findOne: mockFindOne,
        findOneAndUpdate: mockFindOneAndUpdate,
      };

      (mongodbService.getCollection as jest.Mock).mockReturnValue(mockCollection);
      (mongodbService.withRetry as jest.Mock).mockImplementation((fn) => fn());

      const response = await request(app)
        .delete(`/api/quizzes/507f1f77bcf86cd799439011/questions/${questionId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.questionId).toBe(questionId);
      
      // Verify the question was found by checking it exists in the original quiz
      expect(mockFindOne).toHaveBeenCalledTimes(1);
      const foundQuiz = await mockFindOne.mock.results[0].value;
      const questionExists = foundQuiz.questions.some((q: any) => q.questionId === questionId);
      expect(questionExists).toBe(true);
    });
  });
});

