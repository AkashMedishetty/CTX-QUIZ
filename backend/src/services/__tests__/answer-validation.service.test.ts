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
import { SubmitAnswerRequest } from '../../models/types';

// Mock the redis data structures service
jest.mock('../redis-data-structures.service');

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

    it('should reject when timer has expired', async () => {
      (redisDataStructuresService.getSessionState as jest.Mock).mockResolvedValue({
        state: 'ACTIVE_QUESTION',
        currentQuestionId: mockQuestionId,
        timerEndTime: Date.now() - 1000, // Expired 1 second ago
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
});
