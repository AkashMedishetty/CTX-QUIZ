/**
 * Tests for Answer Validation Service
 * 
 * Tests all validation checks for answer submissions:
 * - Question is currently active
 * - Timer hasn't expired
 * - Participant hasn't already answered
 * - Participant is active and not eliminated
 */

import { answerValidationService } from '../answer-validation.service';
import { redisDataStructuresService } from '../redis-data-structures.service';
import { redisService } from '../redis.service';
import { SubmitAnswerRequest } from '../../models/types';

// Mock the redis data structures service
jest.mock('../redis-data-structures.service');
jest.mock('../redis.service');

describe('AnswerValidationService', () => {
  const mockSessionId = 'session-123';
  const mockParticipantId = 'participant-456';
  const mockQuestionId = 'question-789';

  const mockAnswerRequest: SubmitAnswerRequest = {
    questionId: mockQuestionId,
    selectedOptions: ['option-1', 'option-2'],
    clientTimestamp: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateAnswer', () => {
    it('should return valid when all checks pass', async () => {
      // Mock session state - active question
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionId: mockQuestionId,
        timerEndTime: Date.now() + 10000, // 10 seconds remaining
        participantCount: 10,
        currentQuestionIndex: 0,
      });

      // Mock no previous answer
      (redisDataStructuresService.hasAnsweredQuestion as jest.Mock).mockResolvedValue(false);

      // Mock active participant
      (redisDataStructuresService.getParticipantSession as jest.Mock).mockResolvedValue({
        sessionId: mockSessionId,
        nickname: 'TestUser',
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        isActive: true,
        isEliminated: false,
      });

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.message).toBeUndefined();
    });

    it('should reject when session not found', async () => {
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue(null);

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SESSION_NOT_FOUND');
      expect(result.message).toBe('Session not found or expired');
    });

    it('should reject when session is not in ACTIVE_QUESTION state', async () => {
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'LOBBY',
        currentQuestionId: mockQuestionId,
        timerEndTime: Date.now() + 10000,
        participantCount: 10,
        currentQuestionIndex: 0,
      });

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('QUESTION_NOT_ACTIVE');
      expect(result.message).toBe('No question is currently active');
    });

    it('should reject when question ID does not match current question', async () => {
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionId: 'different-question-id',
        timerEndTime: Date.now() + 10000,
        participantCount: 10,
        currentQuestionIndex: 0,
      });

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('INVALID_QUESTION');
      expect(result.message).toBe('Question ID does not match current question');
    });

    it('should reject when question has been voided', async () => {
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionId: mockQuestionId,
        timerEndTime: Date.now() + 10000,
        participantCount: 10,
        currentQuestionIndex: 0,
        voidedQuestions: [mockQuestionId],
      });

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('QUESTION_VOIDED');
      expect(result.message).toBe('This question has been voided');
    });

    it('should accept answer when voidedQuestions exists but does not contain the question', async () => {
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionId: mockQuestionId,
        timerEndTime: Date.now() + 10000,
        participantCount: 10,
        currentQuestionIndex: 0,
        voidedQuestions: ['other-question-id'],
      });

      (redisDataStructuresService.hasAnsweredQuestion as jest.Mock).mockResolvedValue(false);

      (redisDataStructuresService.getParticipantSession as jest.Mock).mockResolvedValue({
        sessionId: mockSessionId,
        nickname: 'TestUser',
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        isActive: true,
        isEliminated: false,
      });

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(true);
    });

    it('should reject when timer end time is not set', async () => {
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionId: mockQuestionId,
        timerEndTime: undefined,
        participantCount: 10,
        currentQuestionIndex: 0,
      });

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('QUESTION_NOT_ACTIVE');
      expect(result.message).toBe('Timer not started for current question');
    });

    it('should reject when timer has expired beyond grace period', async () => {
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionId: mockQuestionId,
        timerEndTime: Date.now() - 1000, // Expired 1 second ago (well past 500ms grace)
        participantCount: 10,
        currentQuestionIndex: 0,
      });

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TIME_EXPIRED');
      expect(result.message).toBe('Answer submission time has expired');
    });

    it('should accept answer within timer grace period', async () => {
      // Timer expired 200ms ago — within the 500ms grace period
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionId: mockQuestionId,
        timerEndTime: Date.now() - 200,
        participantCount: 10,
        currentQuestionIndex: 0,
      });

      (redisDataStructuresService.hasAnsweredQuestion as jest.Mock).mockResolvedValue(false);

      (redisDataStructuresService.getParticipantSession as jest.Mock).mockResolvedValue({
        sessionId: mockSessionId,
        nickname: 'TestUser',
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        isActive: true,
        isEliminated: false,
      });

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(true);
    });

    it('should reject when participant has already answered', async () => {
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionId: mockQuestionId,
        timerEndTime: Date.now() + 10000,
        participantCount: 10,
        currentQuestionIndex: 0,
      });

      // Mock that participant already answered
      (redisDataStructuresService.hasAnsweredQuestion as jest.Mock).mockResolvedValue(true);

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('ALREADY_SUBMITTED');
      expect(result.message).toBe('You have already submitted an answer for this question');
    });

    it('should reject when participant session not found', async () => {
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionId: mockQuestionId,
        timerEndTime: Date.now() + 10000,
        participantCount: 10,
        currentQuestionIndex: 0,
      });

      (redisDataStructuresService.hasAnsweredQuestion as jest.Mock).mockResolvedValue(false);

      // Mock participant session not found
      (redisDataStructuresService.getParticipantSession as jest.Mock).mockResolvedValue(null);

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('PARTICIPANT_NOT_ACTIVE');
      expect(result.message).toBe('Participant session not found or expired');
    });

    it('should reject when participant is not active', async () => {
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionId: mockQuestionId,
        timerEndTime: Date.now() + 10000,
        participantCount: 10,
        currentQuestionIndex: 0,
      });

      (redisDataStructuresService.hasAnsweredQuestion as jest.Mock).mockResolvedValue(false);

      // Mock inactive participant
      (redisDataStructuresService.getParticipantSession as jest.Mock).mockResolvedValue({
        sessionId: mockSessionId,
        nickname: 'TestUser',
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        isActive: false,
        isEliminated: false,
      });

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('PARTICIPANT_NOT_ACTIVE');
      expect(result.message).toBe('Participant is not active');
    });

    it('should reject when participant is eliminated', async () => {
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionId: mockQuestionId,
        timerEndTime: Date.now() + 10000,
        participantCount: 10,
        currentQuestionIndex: 0,
      });

      (redisDataStructuresService.hasAnsweredQuestion as jest.Mock).mockResolvedValue(false);

      // Mock eliminated participant
      (redisDataStructuresService.getParticipantSession as jest.Mock).mockResolvedValue({
        sessionId: mockSessionId,
        nickname: 'TestUser',
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        isActive: true,
        isEliminated: true,
      });

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('PARTICIPANT_ELIMINATED');
      expect(result.message).toBe('Eliminated participants cannot submit answers');
    });

    it('should handle errors gracefully and reject submission', async () => {
      // Mock error in getSessionState
      (redisDataStructuresService.getSessionState as jest.Mock).mockRejectedValue(
        new Error('Redis connection error')
      );

      const result = await answerValidationService.validateAnswer(
        mockSessionId,
        mockParticipantId,
        mockAnswerRequest
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SESSION_NOT_FOUND');
      expect(result.message).toBe('Failed to validate answer submission');
    });
  });

  describe('markAnswerSubmitted', () => {
    it('should successfully mark answer as submitted', async () => {
      (redisDataStructuresService.checkAnswerRateLimit as jest.Mock).mockResolvedValue(true);

      const result = await answerValidationService.markAnswerSubmitted(
        mockParticipantId,
        mockQuestionId
      );

      expect(result).toBe(true);
      expect(redisDataStructuresService.checkAnswerRateLimit).toHaveBeenCalledWith(
        mockParticipantId,
        mockQuestionId
      );
    });

    it('should return false if answer already marked', async () => {
      (redisDataStructuresService.checkAnswerRateLimit as jest.Mock).mockResolvedValue(false);

      const result = await answerValidationService.markAnswerSubmitted(
        mockParticipantId,
        mockQuestionId
      );

      expect(result).toBe(false);
    });

    it('should handle errors and return false', async () => {
      (redisDataStructuresService.checkAnswerRateLimit as jest.Mock).mockRejectedValue(
        new Error('Redis error')
      );

      const result = await answerValidationService.markAnswerSubmitted(
        mockParticipantId,
        mockQuestionId
      );

      expect(result).toBe(false);
    });
  });

  describe('atomicSubmitAnswer', () => {
    const mockSessionId = 'session-123';
    const mockParticipantId = 'participant-456';
    const mockQuestionId = 'question-789';
    const mockAnswerJson = JSON.stringify({
      answerId: 'answer-001',
      sessionId: mockSessionId,
      participantId: mockParticipantId,
      questionId: mockQuestionId,
      selectedOptions: ['opt-1'],
      submittedAt: Date.now(),
      responseTimeMs: 1500,
    });

    let mockEval: jest.Mock;

    beforeEach(() => {
      mockEval = jest.fn();
      (redisService.getClient as jest.Mock).mockReturnValue({
        eval: mockEval,
      });
    });

    it('should return success when Lua script returns 0', async () => {
      mockEval.mockResolvedValue(0);

      const result = await answerValidationService.atomicSubmitAnswer(
        mockParticipantId,
        mockQuestionId,
        mockSessionId,
        mockAnswerJson
      );

      expect(result.success).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(mockEval).toHaveBeenCalledWith(
        expect.stringContaining('EXISTS'),
        3,
        `ratelimit:answer:${mockParticipantId}:${mockQuestionId}`,
        `participant:${mockParticipantId}:session`,
        `session:${mockSessionId}:answers:buffer`,
        '300',
        mockAnswerJson
      );
    });

    it('should return ALREADY_ANSWERED when Lua script returns 1', async () => {
      mockEval.mockResolvedValue(1);

      const result = await answerValidationService.atomicSubmitAnswer(
        mockParticipantId,
        mockQuestionId,
        mockSessionId,
        mockAnswerJson
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBe('ALREADY_ANSWERED');
    });

    it('should return ELIMINATED when Lua script returns 2', async () => {
      mockEval.mockResolvedValue(2);

      const result = await answerValidationService.atomicSubmitAnswer(
        mockParticipantId,
        mockQuestionId,
        mockSessionId,
        mockAnswerJson
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBe('ELIMINATED');
    });

    it('should return INTERNAL_ERROR when eval throws', async () => {
      mockEval.mockRejectedValue(new Error('Redis connection lost'));

      const result = await answerValidationService.atomicSubmitAnswer(
        mockParticipantId,
        mockQuestionId,
        mockSessionId,
        mockAnswerJson
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBe('INTERNAL_ERROR');
    });
  });
});
