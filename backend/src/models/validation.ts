/**
 * Zod Validation Schemas for Live Quiz Platform
 * Provides runtime validation for all data models and API requests
 */

import { z } from 'zod';

// ============================================================================
// Basic Validation Schemas
// ============================================================================

/**
 * UUID validation schema
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * ObjectId validation schema (MongoDB)
 */
export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

/**
 * Join code validation schema (6 alphanumeric characters)
 */
export const joinCodeSchema = z
  .string()
  .length(6, 'Join code must be exactly 6 characters')
  .regex(/^[A-Z0-9]{6}$/, 'Join code must contain only uppercase letters and numbers');

/**
 * Nickname validation schema (2-20 characters)
 */
export const nicknameSchema = z
  .string()
  .min(2, 'Nickname must be at least 2 characters')
  .max(20, 'Nickname must be at most 20 characters')
  .regex(/^[a-zA-Z0-9_\s-]+$/, 'Nickname can only contain letters, numbers, spaces, hyphens, and underscores');

/**
 * Color validation schema (hex color)
 */
export const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color (e.g., #FF5733)');

/**
 * URL validation schema
 */
export const urlSchema = z.string().url('Invalid URL format');

// ============================================================================
// Quiz Type Schemas
// ============================================================================

/**
 * Quiz type enum
 */
export const quizTypeSchema = z.enum(['REGULAR', 'ELIMINATION', 'FFI'], {
  errorMap: () => ({ message: 'Quiz type must be REGULAR, ELIMINATION, or FFI' }),
});

/**
 * Question type enum
 */
export const questionTypeSchema = z.enum(
  ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SCALE_1_10', 'NUMBER_INPUT', 'OPEN_ENDED'],
  {
    errorMap: () => ({
      message: 'Question type must be MULTIPLE_CHOICE, TRUE_FALSE, SCALE_1_10, NUMBER_INPUT, or OPEN_ENDED',
    }),
  }
);

/**
 * Session state enum
 */
export const sessionStateSchema = z.enum(['LOBBY', 'ACTIVE_QUESTION', 'REVEAL', 'ENDED'], {
  errorMap: () => ({ message: 'Session state must be LOBBY, ACTIVE_QUESTION, REVEAL, or ENDED' }),
});

/**
 * Audit event type enum
 */
export const auditEventTypeSchema = z.enum([
  'QUIZ_CREATED',
  'SESSION_STARTED',
  'PARTICIPANT_JOINED',
  'ANSWER_SUBMITTED',
  'QUESTION_VOIDED',
  'PARTICIPANT_KICKED',
  'PARTICIPANT_BANNED',
  'ERROR',
]);

// ============================================================================
// Branding Schema
// ============================================================================

/**
 * Branding configuration schema
 */
export const brandingSchema = z.object({
  primaryColor: colorSchema,
  secondaryColor: colorSchema,
  logoUrl: urlSchema.optional(),
  backgroundImageUrl: urlSchema.optional(),
});

// ============================================================================
// Elimination Settings Schema
// ============================================================================

/**
 * Elimination settings schema for ELIMINATION quiz type
 */
export const eliminationSettingsSchema = z.object({
  eliminationPercentage: z
    .number()
    .min(1, 'Elimination percentage must be at least 1')
    .max(99, 'Elimination percentage must be at most 99'),
  eliminationFrequency: z.enum(['EVERY_QUESTION', 'EVERY_N_QUESTIONS']),
  questionsPerElimination: z
    .number()
    .int()
    .min(1, 'Questions per elimination must be at least 1')
    .optional(),
});

// ============================================================================
// FFI Settings Schema
// ============================================================================

/**
 * FFI (Fastest Finger First) settings schema
 */
export const ffiSettingsSchema = z.object({
  winnersPerQuestion: z
    .number()
    .int()
    .min(1, 'Winners per question must be at least 1')
    .max(100, 'Winners per question must be at most 100'),
});

// ============================================================================
// Scoring Schema
// ============================================================================

/**
 * Scoring configuration schema
 */
export const scoringSchema = z.object({
  basePoints: z
    .number()
    .int()
    .min(0, 'Base points must be non-negative')
    .max(10000, 'Base points must be at most 10000'),
  speedBonusMultiplier: z
    .number()
    .min(0, 'Speed bonus multiplier must be non-negative')
    .max(1, 'Speed bonus multiplier must be at most 1'),
  partialCreditEnabled: z.boolean(),
});

// ============================================================================
// Option Schema
// ============================================================================

/**
 * Answer option schema for creation (IDs optional)
 */
export const optionCreateSchema = z.object({
  optionId: uuidSchema.optional(),
  optionText: z.string().min(1, 'Option text is required').max(500, 'Option text must be at most 500 characters'),
  optionImageUrl: urlSchema.optional(),
  isCorrect: z.boolean(),
});

/**
 * Question schema for creation (IDs optional)
 */
export const questionCreateSchema = z
  .object({
    questionId: uuidSchema.optional(),
    questionText: z
      .string()
      .min(1, 'Question text is required')
      .max(1000, 'Question text must be at most 1000 characters'),
    questionType: questionTypeSchema,
    questionImageUrl: urlSchema.optional(),
    timeLimit: z
      .number()
      .int()
      .min(5, 'Time limit must be at least 5 seconds')
      .max(120, 'Time limit must be at most 120 seconds'),
    options: z.array(optionCreateSchema).min(1, 'At least one option is required'),
    scoring: scoringSchema,
    shuffleOptions: z.boolean(),
    explanationText: z.string().max(2000, 'Explanation text must be at most 2000 characters').optional(),
    speakerNotes: z.string().max(2000, 'Speaker notes must be at most 2000 characters').optional(),
  })
  .refine(
    (data) => {
      // For TRUE_FALSE questions, must have exactly 2 options
      if (data.questionType === 'TRUE_FALSE') {
        return data.options.length === 2;
      }
      return true;
    },
    {
      message: 'TRUE_FALSE questions must have exactly 2 options',
      path: ['options'],
    }
  )
  .refine(
    (data) => {
      // For SCALE_1_10 questions, must have exactly 10 options
      if (data.questionType === 'SCALE_1_10') {
        return data.options.length === 10;
      }
      return true;
    },
    {
      message: 'SCALE_1_10 questions must have exactly 10 options',
      path: ['options'],
    }
  )
  .refine(
    (data) => {
      // Must have at least one correct option (except for OPEN_ENDED)
      if (data.questionType !== 'OPEN_ENDED' && data.questionType !== 'NUMBER_INPUT') {
        return data.options.some((opt) => opt.isCorrect);
      }
      return true;
    },
    {
      message: 'At least one option must be marked as correct',
      path: ['options'],
    }
  );

/**
 * Answer option schema
 */
export const optionSchema = z.object({
  optionId: uuidSchema,
  optionText: z.string().min(1, 'Option text is required').max(500, 'Option text must be at most 500 characters'),
  optionImageUrl: urlSchema.optional(),
  isCorrect: z.boolean(),
});

// ============================================================================
// Question Schema
// ============================================================================

/**
 * Question schema with validation rules
 */
export const questionSchema = z
  .object({
    questionId: uuidSchema,
    questionText: z
      .string()
      .min(1, 'Question text is required')
      .max(1000, 'Question text must be at most 1000 characters'),
    questionType: questionTypeSchema,
    questionImageUrl: urlSchema.optional(),
    timeLimit: z
      .number()
      .int()
      .min(5, 'Time limit must be at least 5 seconds')
      .max(120, 'Time limit must be at most 120 seconds'),
    options: z.array(optionSchema).min(1, 'At least one option is required'),
    scoring: scoringSchema,
    shuffleOptions: z.boolean(),
    explanationText: z.string().max(2000, 'Explanation text must be at most 2000 characters').optional(),
    speakerNotes: z.string().max(2000, 'Speaker notes must be at most 2000 characters').optional(),
  })
  .refine(
    (data) => {
      // For TRUE_FALSE questions, must have exactly 2 options
      if (data.questionType === 'TRUE_FALSE') {
        return data.options.length === 2;
      }
      return true;
    },
    {
      message: 'TRUE_FALSE questions must have exactly 2 options',
      path: ['options'],
    }
  )
  .refine(
    (data) => {
      // For SCALE_1_10 questions, must have exactly 10 options
      if (data.questionType === 'SCALE_1_10') {
        return data.options.length === 10;
      }
      return true;
    },
    {
      message: 'SCALE_1_10 questions must have exactly 10 options',
      path: ['options'],
    }
  )
  .refine(
    (data) => {
      // Must have at least one correct option (except for OPEN_ENDED)
      if (data.questionType !== 'OPEN_ENDED' && data.questionType !== 'NUMBER_INPUT') {
        return data.options.some((opt) => opt.isCorrect);
      }
      return true;
    },
    {
      message: 'At least one option must be marked as correct',
      path: ['options'],
    }
  );

// ============================================================================
// Quiz Schema
// ============================================================================

/**
 * Quiz schema with conditional validation based on quiz type
 */
export const quizSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(200, 'Title must be at most 200 characters'),
    description: z.string().max(1000, 'Description must be at most 1000 characters'),
    quizType: quizTypeSchema,
    createdBy: z.string().min(1, 'Creator ID is required'),
    branding: brandingSchema,
    eliminationSettings: eliminationSettingsSchema.optional(),
    ffiSettings: ffiSettingsSchema.optional(),
    questions: z.array(questionSchema).min(1, 'At least one question is required'),
  })
  .refine(
    (data) => {
      // ELIMINATION quizzes must have eliminationSettings
      if (data.quizType === 'ELIMINATION') {
        return data.eliminationSettings !== undefined;
      }
      return true;
    },
    {
      message: 'ELIMINATION quizzes must have elimination settings',
      path: ['eliminationSettings'],
    }
  )
  .refine(
    (data) => {
      // FFI quizzes must have ffiSettings
      if (data.quizType === 'FFI') {
        return data.ffiSettings !== undefined;
      }
      return true;
    },
    {
      message: 'FFI quizzes must have FFI settings',
      path: ['ffiSettings'],
    }
  )
  .refine(
    (data) => {
      // If eliminationFrequency is EVERY_N_QUESTIONS, questionsPerElimination is required
      if (
        data.eliminationSettings?.eliminationFrequency === 'EVERY_N_QUESTIONS' &&
        !data.eliminationSettings.questionsPerElimination
      ) {
        return false;
      }
      return true;
    },
    {
      message: 'questionsPerElimination is required when eliminationFrequency is EVERY_N_QUESTIONS',
      path: ['eliminationSettings', 'questionsPerElimination'],
    }
  );

// ============================================================================
// Session Schema
// ============================================================================

/**
 * Session schema
 */
export const sessionSchema = z.object({
  sessionId: uuidSchema,
  quizId: objectIdSchema,
  joinCode: joinCodeSchema,
  state: sessionStateSchema,
  currentQuestionIndex: z.number().int().min(0),
  currentQuestionStartTime: z.date().optional(),
  participantCount: z.number().int().min(0),
  activeParticipants: z.array(uuidSchema),
  eliminatedParticipants: z.array(uuidSchema),
  voidedQuestions: z.array(uuidSchema),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  endedAt: z.date().optional(),
  hostId: z.string().min(1),
});

// ============================================================================
// Participant Schema
// ============================================================================

/**
 * Participant schema
 */
export const participantSchema = z.object({
  participantId: uuidSchema,
  sessionId: uuidSchema,
  nickname: nicknameSchema,
  ipAddress: z.string().ip('Invalid IP address'),
  isActive: z.boolean(),
  isEliminated: z.boolean(),
  isSpectator: z.boolean(),
  isBanned: z.boolean(),
  totalScore: z.number().min(0),
  totalTimeMs: z.number().int().min(0),
  streakCount: z.number().int().min(0),
  socketId: z.string().optional(),
  lastConnectedAt: z.date(),
  joinedAt: z.date(),
});

// ============================================================================
// Answer Schema
// ============================================================================

/**
 * Answer schema
 */
export const answerSchema = z.object({
  answerId: uuidSchema,
  sessionId: uuidSchema,
  participantId: uuidSchema,
  questionId: uuidSchema,
  selectedOptions: z.array(uuidSchema),
  answerText: z.string().max(5000, 'Answer text must be at most 5000 characters').optional(),
  answerNumber: z.number().optional(),
  submittedAt: z.date(),
  responseTimeMs: z.number().int().min(0),
  isCorrect: z.boolean(),
  pointsAwarded: z.number().min(0),
  speedBonusApplied: z.number().min(0),
  streakBonusApplied: z.number().min(0),
  partialCreditApplied: z.boolean(),
});

// ============================================================================
// Request Validation Schemas
// ============================================================================

/**
 * Create quiz request schema
 * Note: questions are optional during initial creation - they can be added later
 */
export const createQuizRequestSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(200, 'Title must be at most 200 characters'),
    description: z.string().max(1000, 'Description must be at most 1000 characters'),
    quizType: quizTypeSchema,
    branding: brandingSchema,
    eliminationSettings: eliminationSettingsSchema.optional(),
    ffiSettings: ffiSettingsSchema.optional(),
    questions: z.array(questionCreateSchema).optional(), // Questions are optional during creation
  })
  .refine(
    (data) => {
      if (data.quizType === 'ELIMINATION') {
        return data.eliminationSettings !== undefined;
      }
      return true;
    },
    {
      message: 'ELIMINATION quizzes must have elimination settings',
      path: ['eliminationSettings'],
    }
  )
  .refine(
    (data) => {
      if (data.quizType === 'FFI') {
        return data.ffiSettings !== undefined;
      }
      return true;
    },
    {
      message: 'FFI quizzes must have FFI settings',
      path: ['ffiSettings'],
    }
  );

/**
 * Update quiz request schema (partial)
 */
export const updateQuizRequestSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(200, 'Title must be at most 200 characters'),
    description: z.string().max(1000, 'Description must be at most 1000 characters'),
    quizType: quizTypeSchema,
    branding: brandingSchema,
    eliminationSettings: eliminationSettingsSchema.optional(),
    ffiSettings: ffiSettingsSchema.optional(),
    questions: z.array(questionCreateSchema).min(1, 'At least one question is required'),
  })
  .partial();

/**
 * Create question request schema
 */
export const createQuestionRequestSchema = z
  .object({
    questionText: z
      .string()
      .min(1, 'Question text is required')
      .max(1000, 'Question text must be at most 1000 characters'),
    questionType: questionTypeSchema,
    questionImageUrl: urlSchema.optional(),
    timeLimit: z
      .number()
      .int()
      .min(5, 'Time limit must be at least 5 seconds')
      .max(120, 'Time limit must be at most 120 seconds'),
    options: z.array(optionSchema).min(1, 'At least one option is required'),
    scoring: scoringSchema,
    shuffleOptions: z.boolean(),
    explanationText: z.string().max(2000, 'Explanation text must be at most 2000 characters').optional(),
    speakerNotes: z.string().max(2000, 'Speaker notes must be at most 2000 characters').optional(),
  })
  .refine(
    (data) => {
      // For TRUE_FALSE questions, must have exactly 2 options
      if (data.questionType === 'TRUE_FALSE') {
        return data.options.length === 2;
      }
      return true;
    },
    {
      message: 'TRUE_FALSE questions must have exactly 2 options',
      path: ['options'],
    }
  )
  .refine(
    (data) => {
      // For SCALE_1_10 questions, must have exactly 10 options
      if (data.questionType === 'SCALE_1_10') {
        return data.options.length === 10;
      }
      return true;
    },
    {
      message: 'SCALE_1_10 questions must have exactly 10 options',
      path: ['options'],
    }
  )
  .refine(
    (data) => {
      // Must have at least one correct option (except for OPEN_ENDED)
      if (data.questionType !== 'OPEN_ENDED' && data.questionType !== 'NUMBER_INPUT') {
        return data.options.some((opt) => opt.isCorrect);
      }
      return true;
    },
    {
      message: 'At least one option must be marked as correct',
      path: ['options'],
    }
  );

/**
 * Update question request schema (partial)
 * Note: questionId should not be in the body as it comes from URL params
 */
export const updateQuestionRequestSchema = z
  .object({
    questionText: z
      .string()
      .min(1, 'Question text is required')
      .max(1000, 'Question text must be at most 1000 characters'),
    questionType: questionTypeSchema,
    questionImageUrl: urlSchema.optional(),
    timeLimit: z
      .number()
      .int()
      .min(5, 'Time limit must be at least 5 seconds')
      .max(120, 'Time limit must be at most 120 seconds'),
    options: z.array(optionCreateSchema).min(1, 'At least one option is required'),
    scoring: scoringSchema,
    shuffleOptions: z.boolean(),
    explanationText: z.string().max(2000, 'Explanation text must be at most 2000 characters').optional(),
    speakerNotes: z.string().max(2000, 'Speaker notes must be at most 2000 characters').optional(),
  })
  .partial()
  .refine(
    (data) => {
      // For TRUE_FALSE questions, must have exactly 2 options
      if (data.questionType === 'TRUE_FALSE' && data.options) {
        return data.options.length === 2;
      }
      return true;
    },
    {
      message: 'TRUE_FALSE questions must have exactly 2 options',
      path: ['options'],
    }
  )
  .refine(
    (data) => {
      // For SCALE_1_10 questions, must have exactly 10 options
      if (data.questionType === 'SCALE_1_10' && data.options) {
        return data.options.length === 10;
      }
      return true;
    },
    {
      message: 'SCALE_1_10 questions must have exactly 10 options',
      path: ['options'],
    }
  )
  .refine(
    (data) => {
      // Must have at least one correct option (except for OPEN_ENDED)
      if (data.options && data.questionType !== 'OPEN_ENDED' && data.questionType !== 'NUMBER_INPUT') {
        return data.options.some((opt) => opt.isCorrect);
      }
      return true;
    },
    {
      message: 'At least one option must be marked as correct',
      path: ['options'],
    }
  );

/**
 * Create session request schema
 */
export const createSessionRequestSchema = z.object({
  quizId: objectIdSchema,
});

/**
 * Join session request schema
 */
export const joinSessionRequestSchema = z.object({
  joinCode: joinCodeSchema,
  nickname: nicknameSchema,
});

/**
 * Submit answer request schema
 */
export const submitAnswerRequestSchema = z
  .object({
    questionId: uuidSchema,
    selectedOptions: z.array(uuidSchema).optional(),
    answerText: z.string().max(5000, 'Answer text must be at most 5000 characters').optional(),
    answerNumber: z.number().optional(),
    clientTimestamp: z.number().int().positive('Client timestamp must be a positive number'),
  })
  .refine(
    (data) => {
      // At least one answer field must be provided
      return data.selectedOptions || data.answerText !== undefined || data.answerNumber !== undefined;
    },
    {
      message: 'At least one answer field (selectedOptions, answerText, or answerNumber) must be provided',
    }
  );

/**
 * Kick participant request schema
 */
export const kickParticipantRequestSchema = z.object({
  participantId: uuidSchema,
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must be at most 500 characters'),
});

/**
 * Ban participant request schema
 */
export const banParticipantRequestSchema = z.object({
  participantId: uuidSchema,
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must be at most 500 characters'),
});

/**
 * Void question request schema
 */
export const voidQuestionRequestSchema = z.object({
  questionId: uuidSchema,
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason must be at most 500 characters'),
});

/**
 * Reconnect session request schema
 */
export const reconnectSessionRequestSchema = z.object({
  sessionId: uuidSchema,
  participantId: uuidSchema,
  lastKnownQuestionId: uuidSchema.optional(),
});

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Validates data against a schema and returns typed result
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Validates data and throws on error
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Formats Zod validation errors into a user-friendly format
 */
export function formatValidationErrors(error: z.ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }
  
  return formatted;
}

/**
 * Creates an Express middleware for request validation
 */
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    const result = validate(schema, req.body);
    if (!result.success) {
      const failedResult = result as { success: false; errors: z.ZodError };
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationErrors(failedResult.errors),
      });
    }
    req.validatedBody = result.data;
    next();
  };
}

/**
 * Creates an Express middleware for request validation with input sanitization
 * This middleware sanitizes user inputs to prevent XSS attacks before validation
 */
export function validateAndSanitizeRequest<T>(schema: z.ZodSchema<T>) {
  // Import sanitization service dynamically to avoid circular dependencies
  const { inputSanitizationService } = require('../services/input-sanitization.service');
  
  return (req: any, res: any, next: any) => {
    // Sanitize the request body before validation
    const sanitizedBody = sanitizeRequestBody(req.body, inputSanitizationService);
    
    const result = validate(schema, sanitizedBody);
    if (!result.success) {
      const failedResult = result as { success: false; errors: z.ZodError };
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationErrors(failedResult.errors),
      });
    }
    req.validatedBody = result.data;
    next();
  };
}

/**
 * Recursively sanitize all string fields in a request body
 */
function sanitizeRequestBody(body: any, sanitizer: any): any {
  if (body === null || body === undefined) {
    return body;
  }

  if (typeof body === 'string') {
    return sanitizer.sanitize(body);
  }

  if (Array.isArray(body)) {
    return body.map((item) => sanitizeRequestBody(item, sanitizer));
  }

  if (typeof body === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(body)) {
      // Apply specific sanitization based on field name
      if (typeof value === 'string') {
        switch (key) {
          case 'title':
            sanitized[key] = sanitizer.sanitizeQuizTitle(value);
            break;
          case 'description':
            sanitized[key] = sanitizer.sanitizeQuizDescription(value);
            break;
          case 'questionText':
            sanitized[key] = sanitizer.sanitizeQuestionText(value);
            break;
          case 'optionText':
            sanitized[key] = sanitizer.sanitizeOptionText(value);
            break;
          case 'explanationText':
            sanitized[key] = sanitizer.sanitizeExplanationText(value);
            break;
          case 'speakerNotes':
            sanitized[key] = sanitizer.sanitizeSpeakerNotes(value);
            break;
          case 'nickname':
            sanitized[key] = sanitizer.sanitizeNickname(value);
            break;
          case 'answerText':
            sanitized[key] = sanitizer.sanitizeAnswerText(value);
            break;
          default:
            // For other string fields, apply general sanitization
            sanitized[key] = sanitizer.sanitize(value);
        }
      } else {
        sanitized[key] = sanitizeRequestBody(value, sanitizer);
      }
    }
    return sanitized;
  }

  return body;
}
