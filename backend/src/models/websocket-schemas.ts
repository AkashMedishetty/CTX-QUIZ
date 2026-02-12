/**
 * WebSocket Event Validation Schemas
 *
 * Zod schemas for validating all incoming WebSocket messages.
 * Used by the WebSocket validation middleware to ensure message integrity.
 *
 * Requirements: 9.8 - The System SHALL validate all WebSocket messages for proper format and authorization
 */

import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

/**
 * UUID validation schema
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Session ID schema
 */
export const sessionIdSchema = uuidSchema;

/**
 * Participant ID schema
 */
export const participantIdSchema = uuidSchema;

/**
 * Question ID schema
 */
export const questionIdSchema = uuidSchema;

// ============================================================================
// Participant Event Schemas
// ============================================================================

/**
 * Schema for submit_answer event
 * Requirements: 4.1, 4.2, 4.3
 * 
 * Supports multiple question types:
 * - MULTIPLE_CHOICE, MULTI_SELECT, TRUE_FALSE, SCALE_1_10: Use selectedOptions
 * - NUMBER_INPUT: Use answerNumber (selectedOptions can be empty)
 * - OPEN_ENDED: Use answerText (selectedOptions can be empty)
 */
export const submitAnswerSchema = z.object({
  questionId: questionIdSchema,
  selectedOptions: z.array(uuidSchema),
  answerText: z.string().max(5000, 'Answer text must be at most 5000 characters').optional(),
  answerNumber: z.number().optional(),
  clientTimestamp: z.number().int().positive('Client timestamp must be a positive integer'),
}).refine(
  (data) => {
    // At least one of: selectedOptions (non-empty), answerText, or answerNumber must be provided
    return data.selectedOptions.length > 0 || 
           data.answerText !== undefined || 
           data.answerNumber !== undefined;
  },
  {
    message: 'At least one answer type must be provided (selectedOptions, answerText, or answerNumber)',
  }
);

/**
 * Schema for reconnect_session event
 * Requirements: 8.2, 8.3, 8.4
 */
export const reconnectSessionSchema = z.object({
  sessionId: sessionIdSchema,
  participantId: participantIdSchema,
  lastKnownQuestionId: questionIdSchema.optional(),
});

/**
 * Schema for join_session event (via WebSocket)
 * Requirements: 3.1, 3.3, 3.4
 */
export const joinSessionSchema = z.object({
  joinCode: z
    .string()
    .length(6, 'Join code must be exactly 6 characters')
    .regex(/^[A-Z0-9]{6}$/, 'Join code must contain only uppercase letters and numbers'),
  nickname: z
    .string()
    .min(2, 'Nickname must be at least 2 characters')
    .max(20, 'Nickname must be at most 20 characters')
    .regex(
      /^[a-zA-Z0-9_\s-]+$/,
      'Nickname can only contain letters, numbers, spaces, hyphens, and underscores'
    ),
});

// ============================================================================
// Controller Event Schemas
// ============================================================================

/**
 * Schema for start_quiz event
 * Requirements: 2.3, 2.8
 */
export const startQuizSchema = z.object({
  sessionId: sessionIdSchema,
});

/**
 * Schema for next_question event
 * Requirements: 2.5, 2.8
 */
export const nextQuestionSchema = z.object({
  sessionId: sessionIdSchema,
});

/**
 * Schema for end_quiz event
 * Requirements: 2.8
 */
export const endQuizSchema = z.object({
  sessionId: sessionIdSchema,
});

/**
 * Schema for void_question event
 * Requirements: 2.7, 10.1, 10.7
 */
export const voidQuestionSchema = z.object({
  sessionId: sessionIdSchema,
  questionId: questionIdSchema,
  reason: z
    .string()
    .min(1, 'Reason is required')
    .max(500, 'Reason must be at most 500 characters'),
});

/**
 * Schema for pause_timer event
 * Requirements: 10.6
 */
export const pauseTimerSchema = z.object({
  sessionId: sessionIdSchema,
});

/**
 * Schema for resume_timer event
 * Requirements: 10.6
 */
export const resumeTimerSchema = z.object({
  sessionId: sessionIdSchema,
});

/**
 * Schema for reset_timer event
 * Requirements: 10.6
 */
export const resetTimerSchema = z.object({
  sessionId: sessionIdSchema,
  newTimeLimit: z
    .number()
    .int()
    .min(5, 'Time limit must be at least 5 seconds')
    .max(120, 'Time limit must be at most 120 seconds'),
});

/**
 * Schema for kick_participant event
 * Requirements: 9.6, 10.2, 10.7, 10.8
 */
export const kickParticipantSchema = z.object({
  sessionId: sessionIdSchema,
  participantId: participantIdSchema,
  reason: z
    .string()
    .min(1, 'Reason is required')
    .max(500, 'Reason must be at most 500 characters'),
});

/**
 * Schema for ban_participant event
 * Requirements: 9.7, 10.3, 10.7, 10.8
 */
export const banParticipantSchema = z.object({
  sessionId: sessionIdSchema,
  participantId: participantIdSchema,
  reason: z
    .string()
    .min(1, 'Reason is required')
    .max(500, 'Reason must be at most 500 characters'),
});

/**
 * Schema for toggle_late_joiners event
 */
export const toggleLateJoinersSchema = z.object({
  sessionId: sessionIdSchema,
  allowLateJoiners: z.boolean(),
});

// ============================================================================
// Authentication Event Schemas
// ============================================================================

/**
 * Schema for authenticate event
 */
export const authenticateSchema = z.object({
  sessionId: sessionIdSchema,
  participantId: participantIdSchema.optional(),
  role: z.enum(['controller', 'bigscreen', 'participant', 'tester']),
  token: z.string().optional(),
});

// ============================================================================
// Event Schema Registry
// ============================================================================

/**
 * Map of event names to their validation schemas
 * Used by the validation middleware to look up schemas
 */
export const eventSchemaRegistry: Record<string, z.ZodSchema> = {
  // Participant events
  submit_answer: submitAnswerSchema,
  reconnect_session: reconnectSessionSchema,
  join_session: joinSessionSchema,

  // Controller events
  start_quiz: startQuizSchema,
  next_question: nextQuestionSchema,
  end_quiz: endQuizSchema,
  void_question: voidQuestionSchema,
  pause_timer: pauseTimerSchema,
  resume_timer: resumeTimerSchema,
  reset_timer: resetTimerSchema,
  kick_participant: kickParticipantSchema,
  ban_participant: banParticipantSchema,
  toggle_late_joiners: toggleLateJoinersSchema,

  // Authentication events
  authenticate: authenticateSchema,
};

// ============================================================================
// Type Exports
// ============================================================================

export type SubmitAnswerData = z.infer<typeof submitAnswerSchema>;
export type ReconnectSessionData = z.infer<typeof reconnectSessionSchema>;
export type JoinSessionData = z.infer<typeof joinSessionSchema>;
export type StartQuizData = z.infer<typeof startQuizSchema>;
export type NextQuestionData = z.infer<typeof nextQuestionSchema>;
export type EndQuizData = z.infer<typeof endQuizSchema>;
export type VoidQuestionData = z.infer<typeof voidQuestionSchema>;
export type PauseTimerData = z.infer<typeof pauseTimerSchema>;
export type ResumeTimerData = z.infer<typeof resumeTimerSchema>;
export type ResetTimerData = z.infer<typeof resetTimerSchema>;
export type KickParticipantData = z.infer<typeof kickParticipantSchema>;
export type BanParticipantData = z.infer<typeof banParticipantSchema>;
export type ToggleLateJoinersData = z.infer<typeof toggleLateJoinersSchema>;
export type AuthenticateData = z.infer<typeof authenticateSchema>;
