/**
 * Unit Tests for Zod Validation Schemas
 */

import { v4 as uuidv4 } from 'uuid';
import {
  validate,
  validateOrThrow,
  formatValidationErrors,
  // Basic schemas
  uuidSchema,
  objectIdSchema,
  joinCodeSchema,
  nicknameSchema,
  colorSchema,
  urlSchema,
  // Type schemas
  quizTypeSchema,
  questionTypeSchema,
  sessionStateSchema,
  // Complex schemas
  brandingSchema,
  eliminationSettingsSchema,
  ffiSettingsSchema,
  scoringSchema,
  optionSchema,
  questionSchema,
  quizSchema,
  // Request schemas
  joinSessionRequestSchema,
  submitAnswerRequestSchema,
  kickParticipantRequestSchema,
} from '../validation';

describe('Basic Validation Schemas', () => {
  describe('uuidSchema', () => {
    it('should accept valid UUIDs', () => {
      const validUuid = uuidv4();
      const result = validate(uuidSchema, validUuid);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      const result = validate(uuidSchema, 'not-a-uuid');
      expect(result.success).toBe(false);
    });
  });

  describe('objectIdSchema', () => {
    it('should accept valid MongoDB ObjectIds', () => {
      const validObjectId = '507f1f77bcf86cd799439011';
      const result = validate(objectIdSchema, validObjectId);
      expect(result.success).toBe(true);
    });

    it('should reject invalid ObjectIds', () => {
      const result = validate(objectIdSchema, 'invalid-objectid');
      expect(result.success).toBe(false);
    });
  });

  describe('joinCodeSchema', () => {
    it('should accept valid 6-character uppercase alphanumeric codes', () => {
      const result = validate(joinCodeSchema, 'ABC123');
      expect(result.success).toBe(true);
    });

    it('should reject codes with wrong length', () => {
      const result = validate(joinCodeSchema, 'ABC12');
      expect(result.success).toBe(false);
    });

    it('should reject codes with lowercase letters', () => {
      const result = validate(joinCodeSchema, 'abc123');
      expect(result.success).toBe(false);
    });

    it('should reject codes with special characters', () => {
      const result = validate(joinCodeSchema, 'ABC-12');
      expect(result.success).toBe(false);
    });
  });

  describe('nicknameSchema', () => {
    it('should accept valid nicknames', () => {
      const validNicknames = ['John', 'Player_123', 'Cool-Gamer', 'Test User'];
      validNicknames.forEach((nickname) => {
        const result = validate(nicknameSchema, nickname);
        expect(result.success).toBe(true);
      });
    });

    it('should reject nicknames that are too short', () => {
      const result = validate(nicknameSchema, 'A');
      expect(result.success).toBe(false);
    });

    it('should reject nicknames that are too long', () => {
      const result = validate(nicknameSchema, 'A'.repeat(21));
      expect(result.success).toBe(false);
    });

    it('should reject nicknames with special characters', () => {
      const result = validate(nicknameSchema, 'Player@123');
      expect(result.success).toBe(false);
    });
  });

  describe('colorSchema', () => {
    it('should accept valid hex colors', () => {
      const validColors = ['#FF5733', '#000000', '#FFFFFF', '#abc123'];
      validColors.forEach((color) => {
        const result = validate(colorSchema, color);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid color formats', () => {
      const invalidColors = ['FF5733', '#FF57', '#GGGGGG', 'red'];
      invalidColors.forEach((color) => {
        const result = validate(colorSchema, color);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('urlSchema', () => {
    it('should accept valid URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://example.com/path',
        'https://example.com/path?query=value',
      ];
      validUrls.forEach((url) => {
        const result = validate(urlSchema, url);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = ['not-a-url', 'example.com', '://invalid'];
      invalidUrls.forEach((url) => {
        const result = validate(urlSchema, url);
        expect(result.success).toBe(false);
      });
    });
  });
});

describe('Type Schemas', () => {
  describe('quizTypeSchema', () => {
    it('should accept valid quiz types', () => {
      const validTypes = ['REGULAR', 'ELIMINATION', 'FFI'];
      validTypes.forEach((type) => {
        const result = validate(quizTypeSchema, type);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid quiz types', () => {
      const result = validate(quizTypeSchema, 'INVALID');
      expect(result.success).toBe(false);
    });
  });

  describe('questionTypeSchema', () => {
    it('should accept valid question types', () => {
      const validTypes = ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SCALE_1_10', 'NUMBER_INPUT', 'OPEN_ENDED'];
      validTypes.forEach((type) => {
        const result = validate(questionTypeSchema, type);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid question types', () => {
      const result = validate(questionTypeSchema, 'INVALID');
      expect(result.success).toBe(false);
    });
  });

  describe('sessionStateSchema', () => {
    it('should accept valid session states', () => {
      const validStates = ['LOBBY', 'ACTIVE_QUESTION', 'REVEAL', 'ENDED'];
      validStates.forEach((state) => {
        const result = validate(sessionStateSchema, state);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid session states', () => {
      const result = validate(sessionStateSchema, 'INVALID');
      expect(result.success).toBe(false);
    });
  });
});

describe('Complex Schemas', () => {
  describe('brandingSchema', () => {
    it('should accept valid branding configuration', () => {
      const validBranding = {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
        logoUrl: 'https://example.com/logo.png',
        backgroundImageUrl: 'https://example.com/bg.jpg',
      };
      const result = validate(brandingSchema, validBranding);
      expect(result.success).toBe(true);
    });

    it('should accept branding without optional fields', () => {
      const validBranding = {
        primaryColor: '#FF5733',
        secondaryColor: '#33FF57',
      };
      const result = validate(brandingSchema, validBranding);
      expect(result.success).toBe(true);
    });

    it('should reject invalid colors', () => {
      const invalidBranding = {
        primaryColor: 'red',
        secondaryColor: '#33FF57',
      };
      const result = validate(brandingSchema, invalidBranding);
      expect(result.success).toBe(false);
    });
  });

  describe('eliminationSettingsSchema', () => {
    it('should accept valid elimination settings', () => {
      const validSettings = {
        eliminationPercentage: 20,
        eliminationFrequency: 'EVERY_QUESTION' as const,
      };
      const result = validate(eliminationSettingsSchema, validSettings);
      expect(result.success).toBe(true);
    });

    it('should reject elimination percentage out of range', () => {
      const invalidSettings = {
        eliminationPercentage: 100,
        eliminationFrequency: 'EVERY_QUESTION' as const,
      };
      const result = validate(eliminationSettingsSchema, invalidSettings);
      expect(result.success).toBe(false);
    });
  });

  describe('ffiSettingsSchema', () => {
    it('should accept valid FFI settings', () => {
      const validSettings = {
        winnersPerQuestion: 5,
      };
      const result = validate(ffiSettingsSchema, validSettings);
      expect(result.success).toBe(true);
    });

    it('should reject invalid winners count', () => {
      const invalidSettings = {
        winnersPerQuestion: 0,
      };
      const result = validate(ffiSettingsSchema, invalidSettings);
      expect(result.success).toBe(false);
    });
  });

  describe('scoringSchema', () => {
    it('should accept valid scoring configuration', () => {
      const validScoring = {
        basePoints: 100,
        speedBonusMultiplier: 0.5,
        partialCreditEnabled: true,
      };
      const result = validate(scoringSchema, validScoring);
      expect(result.success).toBe(true);
    });

    it('should reject negative base points', () => {
      const invalidScoring = {
        basePoints: -10,
        speedBonusMultiplier: 0.5,
        partialCreditEnabled: true,
      };
      const result = validate(scoringSchema, invalidScoring);
      expect(result.success).toBe(false);
    });

    it('should reject speed bonus multiplier out of range', () => {
      const invalidScoring = {
        basePoints: 100,
        speedBonusMultiplier: 1.5,
        partialCreditEnabled: true,
      };
      const result = validate(scoringSchema, invalidScoring);
      expect(result.success).toBe(false);
    });
  });

  describe('optionSchema', () => {
    it('should accept valid option', () => {
      const validOption = {
        optionId: uuidv4(),
        optionText: 'Option A',
        isCorrect: true,
      };
      const result = validate(optionSchema, validOption);
      expect(result.success).toBe(true);
    });

    it('should reject option with empty text', () => {
      const invalidOption = {
        optionId: uuidv4(),
        optionText: '',
        isCorrect: true,
      };
      const result = validate(optionSchema, invalidOption);
      expect(result.success).toBe(false);
    });
  });

  describe('questionSchema', () => {
    it('should accept valid multiple choice question', () => {
      const validQuestion = {
        questionId: uuidv4(),
        questionText: 'What is 2 + 2?',
        questionType: 'MULTIPLE_CHOICE' as const,
        timeLimit: 30,
        options: [
          { optionId: uuidv4(), optionText: '3', isCorrect: false },
          { optionId: uuidv4(), optionText: '4', isCorrect: true },
          { optionId: uuidv4(), optionText: '5', isCorrect: false },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0.5,
          partialCreditEnabled: false,
        },
        shuffleOptions: true,
      };
      const result = validate(questionSchema, validQuestion);
      expect(result.success).toBe(true);
    });

    it('should reject TRUE_FALSE question without exactly 2 options', () => {
      const invalidQuestion = {
        questionId: uuidv4(),
        questionText: 'Is this true?',
        questionType: 'TRUE_FALSE' as const,
        timeLimit: 30,
        options: [
          { optionId: uuidv4(), optionText: 'True', isCorrect: true },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0.5,
          partialCreditEnabled: false,
        },
        shuffleOptions: false,
      };
      const result = validate(questionSchema, invalidQuestion);
      expect(result.success).toBe(false);
    });

    it('should reject question without correct option', () => {
      const invalidQuestion = {
        questionId: uuidv4(),
        questionText: 'What is 2 + 2?',
        questionType: 'MULTIPLE_CHOICE' as const,
        timeLimit: 30,
        options: [
          { optionId: uuidv4(), optionText: '3', isCorrect: false },
          { optionId: uuidv4(), optionText: '4', isCorrect: false },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0.5,
          partialCreditEnabled: false,
        },
        shuffleOptions: true,
      };
      const result = validate(questionSchema, invalidQuestion);
      expect(result.success).toBe(false);
    });

    it('should reject question with time limit out of range', () => {
      const invalidQuestion = {
        questionId: uuidv4(),
        questionText: 'What is 2 + 2?',
        questionType: 'MULTIPLE_CHOICE' as const,
        timeLimit: 200,
        options: [
          { optionId: uuidv4(), optionText: '4', isCorrect: true },
        ],
        scoring: {
          basePoints: 100,
          speedBonusMultiplier: 0.5,
          partialCreditEnabled: false,
        },
        shuffleOptions: true,
      };
      const result = validate(questionSchema, invalidQuestion);
      expect(result.success).toBe(false);
    });
  });

  describe('quizSchema', () => {
    it('should accept valid REGULAR quiz', () => {
      const validQuiz = {
        title: 'Math Quiz',
        description: 'Test your math skills',
        quizType: 'REGULAR' as const,
        createdBy: 'admin123',
        branding: {
          primaryColor: '#FF5733',
          secondaryColor: '#33FF57',
        },
        questions: [
          {
            questionId: uuidv4(),
            questionText: 'What is 2 + 2?',
            questionType: 'MULTIPLE_CHOICE' as const,
            timeLimit: 30,
            options: [
              { optionId: uuidv4(), optionText: '4', isCorrect: true },
              { optionId: uuidv4(), optionText: '5', isCorrect: false },
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
      const result = validate(quizSchema, validQuiz);
      expect(result.success).toBe(true);
    });

    it('should reject ELIMINATION quiz without elimination settings', () => {
      const invalidQuiz = {
        title: 'Math Quiz',
        description: 'Test your math skills',
        quizType: 'ELIMINATION' as const,
        createdBy: 'admin123',
        branding: {
          primaryColor: '#FF5733',
          secondaryColor: '#33FF57',
        },
        questions: [
          {
            questionId: uuidv4(),
            questionText: 'What is 2 + 2?',
            questionType: 'MULTIPLE_CHOICE' as const,
            timeLimit: 30,
            options: [
              { optionId: uuidv4(), optionText: '4', isCorrect: true },
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
      const result = validate(quizSchema, invalidQuiz);
      expect(result.success).toBe(false);
    });

    it('should reject FFI quiz without FFI settings', () => {
      const invalidQuiz = {
        title: 'Math Quiz',
        description: 'Test your math skills',
        quizType: 'FFI' as const,
        createdBy: 'admin123',
        branding: {
          primaryColor: '#FF5733',
          secondaryColor: '#33FF57',
        },
        questions: [
          {
            questionId: uuidv4(),
            questionText: 'What is 2 + 2?',
            questionType: 'MULTIPLE_CHOICE' as const,
            timeLimit: 30,
            options: [
              { optionId: uuidv4(), optionText: '4', isCorrect: true },
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
      const result = validate(quizSchema, invalidQuiz);
      expect(result.success).toBe(false);
    });

    it('should reject quiz without questions', () => {
      const invalidQuiz = {
        title: 'Math Quiz',
        description: 'Test your math skills',
        quizType: 'REGULAR' as const,
        createdBy: 'admin123',
        branding: {
          primaryColor: '#FF5733',
          secondaryColor: '#33FF57',
        },
        questions: [],
      };
      const result = validate(quizSchema, invalidQuiz);
      expect(result.success).toBe(false);
    });
  });
});

describe('Request Schemas', () => {
  describe('joinSessionRequestSchema', () => {
    it('should accept valid join request', () => {
      const validRequest = {
        joinCode: 'ABC123',
        nickname: 'Player1',
      };
      const result = validate(joinSessionRequestSchema, validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid join code', () => {
      const invalidRequest = {
        joinCode: 'abc',
        nickname: 'Player1',
      };
      const result = validate(joinSessionRequestSchema, invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should reject invalid nickname', () => {
      const invalidRequest = {
        joinCode: 'ABC123',
        nickname: 'A',
      };
      const result = validate(joinSessionRequestSchema, invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('submitAnswerRequestSchema', () => {
    it('should accept answer with selected options', () => {
      const validRequest = {
        questionId: uuidv4(),
        selectedOptions: [uuidv4(), uuidv4()],
        clientTimestamp: Date.now(),
      };
      const result = validate(submitAnswerRequestSchema, validRequest);
      expect(result.success).toBe(true);
    });

    it('should accept answer with text', () => {
      const validRequest = {
        questionId: uuidv4(),
        answerText: 'This is my answer',
        clientTimestamp: Date.now(),
      };
      const result = validate(submitAnswerRequestSchema, validRequest);
      expect(result.success).toBe(true);
    });

    it('should accept answer with number', () => {
      const validRequest = {
        questionId: uuidv4(),
        answerNumber: 42,
        clientTimestamp: Date.now(),
      };
      const result = validate(submitAnswerRequestSchema, validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject answer without any answer field', () => {
      const invalidRequest = {
        questionId: uuidv4(),
        clientTimestamp: Date.now(),
      };
      const result = validate(submitAnswerRequestSchema, invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('kickParticipantRequestSchema', () => {
    it('should accept valid kick request', () => {
      const validRequest = {
        participantId: uuidv4(),
        reason: 'Inappropriate behavior',
      };
      const result = validate(kickParticipantRequestSchema, validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject kick request without reason', () => {
      const invalidRequest = {
        participantId: uuidv4(),
        reason: '',
      };
      const result = validate(kickParticipantRequestSchema, invalidRequest);
      expect(result.success).toBe(false);
    });
  });
});

describe('Validation Helper Functions', () => {
  describe('validateOrThrow', () => {
    it('should return data on valid input', () => {
      const validUuid = uuidv4();
      const result = validateOrThrow(uuidSchema, validUuid);
      expect(result).toBe(validUuid);
    });

    it('should throw on invalid input', () => {
      expect(() => validateOrThrow(uuidSchema, 'invalid')).toThrow();
    });
  });

  describe('formatValidationErrors', () => {
    it('should format validation errors correctly', () => {
      const result = validate(joinSessionRequestSchema, {
        joinCode: 'abc',
        nickname: 'A',
      });
      
      if (!result.success) {
        const formatted = formatValidationErrors(result.errors);
        expect(formatted).toHaveProperty('joinCode');
        expect(formatted).toHaveProperty('nickname');
        expect(Array.isArray(formatted.joinCode)).toBe(true);
        expect(Array.isArray(formatted.nickname)).toBe(true);
      }
    });
  });
});
