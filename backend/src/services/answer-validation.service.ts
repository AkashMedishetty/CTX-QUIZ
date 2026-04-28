/**
 * Answer Validation Service
 * 
 * Validates answer submissions with comprehensive checks:
 * - Question is currently active (state === ACTIVE_QUESTION)
 * - Timer hasn't expired (current time < timerEndTime)
 * - Participant hasn't already answered (rate limiting)
 * - Participant is active and not eliminated
 * 
 * Returns validation result with specific rejection reasons for better error handling.
 * 
 * Requirements: 4.2, 4.3
 */

import { redisDataStructuresService } from './redis-data-structures.service';
import { redisService } from './redis.service';
import { SubmitAnswerRequest } from '../models/types';

// Rate limit TTL for answer submissions (must match RATE_LIMIT_ANSWER in redis-data-structures)
const RATE_LIMIT_ANSWER_TTL = 5 * 60; // 5 minutes in seconds

// Grace period for timer expiry to account for network/processing latency
const TIMER_GRACE_PERIOD_MS = 500;

export type ValidationRejectionReason =
  | 'INVALID_QUESTION'
  | 'QUESTION_NOT_ACTIVE'
  | 'QUESTION_VOIDED'
  | 'TIME_EXPIRED'
  | 'ALREADY_SUBMITTED'
  | 'PARTICIPANT_NOT_ACTIVE'
  | 'PARTICIPANT_ELIMINATED'
  | 'PARTICIPANT_BANNED'
  | 'SESSION_NOT_FOUND';

export interface ValidationResult {
  valid: boolean;
  reason?: ValidationRejectionReason;
  message?: string;
}

class AnswerValidationService {
  /**
   * Validate answer submission
   * 
   * Performs all validation checks required for answer submission:
   * 1. Verify question is currently active
   * 2. Verify timer hasn't expired
   * 3. Check rate limiting (1 submission per participant per question)
   * 4. Verify participant is active and not eliminated
   * 
   * @param sessionId - Session ID
   * @param participantId - Participant ID
   * @param answerRequest - Answer submission request
   * @returns ValidationResult with valid flag and rejection reason if invalid
   */
  async validateAnswer(
    sessionId: string,
    participantId: string,
    answerRequest: SubmitAnswerRequest
  ): Promise<ValidationResult> {
    try {
      console.log('[AnswerValidation] Validating answer submission:', {
        sessionId,
        participantId,
        questionId: answerRequest.questionId,
      });

      // 1. Get session state from Redis
      const sessionState = await redisDataStructuresService.getSessionState(sessionId);

      if (!sessionState) {
        console.warn('[AnswerValidation] Session not found in Redis:', sessionId);
        return {
          valid: false,
          reason: 'SESSION_NOT_FOUND',
          message: 'Session not found or expired',
        };
      }

      // 2. Verify question is currently active
      if (sessionState.state !== 'ACTIVE_QUESTION') {
        console.warn('[AnswerValidation] Session is not in ACTIVE_QUESTION state:', {
          sessionId,
          currentState: sessionState.state,
        });
        return {
          valid: false,
          reason: 'QUESTION_NOT_ACTIVE',
          message: 'No question is currently active',
        };
      }

      // 3. Verify the question ID matches the current question
      if (sessionState.currentQuestionId !== answerRequest.questionId) {
        console.warn('[AnswerValidation] Question ID mismatch:', {
          sessionId,
          currentQuestionId: sessionState.currentQuestionId,
          submittedQuestionId: answerRequest.questionId,
        });
        return {
          valid: false,
          reason: 'INVALID_QUESTION',
          message: 'Question ID does not match current question',
        };
      }

      // 3b. Check if question has been voided
      if (sessionState.voidedQuestions && Array.isArray(sessionState.voidedQuestions) && sessionState.voidedQuestions.includes(answerRequest.questionId)) {
        console.warn('[AnswerValidation] Question has been voided:', {
          sessionId,
          questionId: answerRequest.questionId,
        });
        return {
          valid: false,
          reason: 'QUESTION_VOIDED',
          message: 'This question has been voided',
        };
      }

      // 4. Verify timer hasn't expired
      if (!sessionState.timerEndTime) {
        console.error('[AnswerValidation] Timer end time not set:', sessionId);
        return {
          valid: false,
          reason: 'QUESTION_NOT_ACTIVE',
          message: 'Timer not started for current question',
        };
      }

      const currentTime = Date.now();
      if (currentTime > sessionState.timerEndTime + TIMER_GRACE_PERIOD_MS) {
        console.warn('[AnswerValidation] Timer expired:', {
          sessionId,
          currentTime,
          timerEndTime: sessionState.timerEndTime,
          gracePeriodMs: TIMER_GRACE_PERIOD_MS,
          expiredBy: currentTime - sessionState.timerEndTime - TIMER_GRACE_PERIOD_MS,
        });
        return {
          valid: false,
          reason: 'TIME_EXPIRED',
          message: 'Answer submission time has expired',
        };
      }

      // 5. Check rate limiting - verify participant hasn't already answered
      const alreadyAnswered = await redisDataStructuresService.hasAnsweredQuestion(
        participantId,
        answerRequest.questionId
      );

      if (alreadyAnswered) {
        console.warn('[AnswerValidation] Participant already answered:', {
          sessionId,
          participantId,
          questionId: answerRequest.questionId,
        });
        return {
          valid: false,
          reason: 'ALREADY_SUBMITTED',
          message: 'You have already submitted an answer for this question',
        };
      }

      // 6. Verify participant is active and not eliminated
      const participantSession = await redisDataStructuresService.getParticipantSession(
        participantId
      );

      if (!participantSession) {
        console.warn('[AnswerValidation] Participant session not found:', participantId);
        return {
          valid: false,
          reason: 'PARTICIPANT_NOT_ACTIVE',
          message: 'Participant session not found or expired',
        };
      }

      if (!participantSession.isActive) {
        console.warn('[AnswerValidation] Participant is not active:', participantId);
        return {
          valid: false,
          reason: 'PARTICIPANT_NOT_ACTIVE',
          message: 'Participant is not active',
        };
      }

      if (participantSession.isEliminated) {
        console.warn('[AnswerValidation] Participant is eliminated:', participantId);
        return {
          valid: false,
          reason: 'PARTICIPANT_ELIMINATED',
          message: 'Eliminated participants cannot submit answers',
        };
      }

      // All validations passed
      console.log('[AnswerValidation] Answer validation successful:', {
        sessionId,
        participantId,
        questionId: answerRequest.questionId,
      });

      return {
        valid: true,
      };
    } catch (error) {
      console.error('[AnswerValidation] Error validating answer:', error);
      
      // On error, reject the submission for safety
      return {
        valid: false,
        reason: 'SESSION_NOT_FOUND',
        message: 'Failed to validate answer submission',
      };
    }
  }

  /**
   * Atomically submit an answer using a Redis Lua script.
   *
   * The Lua script performs three checks and two writes as a single atomic
   * operation, preventing race conditions from concurrent submissions or
   * in-flight elimination updates:
   *   (a) Check if ratelimit:answer:{participantId}:{questionId} exists (duplicate check)
   *   (b) Check if participant:{participantId}:session field isEliminated is 'true'
   *   (c) If both pass, SET the rate limit key with EX TTL and LPUSH the answer to the buffer
   *
   * Returns 0 for success, 1 for duplicate, 2 for eliminated.
   *
   * Requirements: 2.1, 2.3
   *
   * @param participantId - Participant ID
   * @param questionId - Question ID
   * @param sessionId - Session ID (for the answer buffer key)
   * @param answerJson - JSON-serialized answer object to push to the buffer
   * @returns Object with success flag and optional rejection reason
   */
  async atomicSubmitAnswer(
    participantId: string,
    questionId: string,
    sessionId: string,
    answerJson: string
  ): Promise<{ success: boolean; reason?: string }> {
    const luaScript = `
      local rateLimitKey = KEYS[1]
      local participantKey = KEYS[2]
      local bufferKey = KEYS[3]
      local ttl = tonumber(ARGV[1])
      local answerJson = ARGV[2]

      -- (a) Check duplicate: if rate limit key already exists, reject
      if redis.call('EXISTS', rateLimitKey) == 1 then
        return 1
      end

      -- (b) Check elimination: if participant is eliminated, reject
      local isEliminated = redis.call('HGET', participantKey, 'isEliminated')
      if isEliminated == 'true' then
        return 2
      end

      -- (c) All checks passed: set rate limit key and push answer to buffer
      redis.call('SET', rateLimitKey, '1', 'EX', ttl)
      redis.call('LPUSH', bufferKey, answerJson)

      return 0
    `;

    const rateLimitKey = `ratelimit:answer:${participantId}:${questionId}`;
    const participantKey = `participant:${participantId}:session`;
    const bufferKey = `session:${sessionId}:answers:buffer`;

    try {
      const client = redisService.getClient();
      const result = await client.eval(
        luaScript,
        3, // number of KEYS
        rateLimitKey,
        participantKey,
        bufferKey,
        RATE_LIMIT_ANSWER_TTL.toString(),
        answerJson
      );

      const code = Number(result);

      if (code === 0) {
        console.log('[AnswerValidation] Atomic submit succeeded:', {
          participantId,
          questionId,
          sessionId,
        });
        return { success: true };
      } else if (code === 1) {
        console.warn('[AnswerValidation] Atomic submit rejected — duplicate:', {
          participantId,
          questionId,
        });
        return { success: false, reason: 'ALREADY_ANSWERED' };
      } else {
        console.warn('[AnswerValidation] Atomic submit rejected — eliminated:', {
          participantId,
          questionId,
        });
        return { success: false, reason: 'ELIMINATED' };
      }
    } catch (error) {
      console.error('[AnswerValidation] Error in atomicSubmitAnswer:', error);
      return { success: false, reason: 'INTERNAL_ERROR' };
    }
  }

  /**
   * Mark answer as submitted (set rate limit)
   * 
   * This should be called immediately after validation passes and before
   * processing the answer to prevent duplicate submissions.
   * 
   * @param participantId - Participant ID
   * @param questionId - Question ID
   * @returns True if successfully marked, false if already marked
   */
  async markAnswerSubmitted(participantId: string, questionId: string): Promise<boolean> {
    try {
      const result = await redisDataStructuresService.checkAnswerRateLimit(
        participantId,
        questionId
      );

      if (result) {
        console.log('[AnswerValidation] Marked answer as submitted:', {
          participantId,
          questionId,
        });
      } else {
        console.warn('[AnswerValidation] Answer already marked as submitted:', {
          participantId,
          questionId,
        });
      }

      return result;
    } catch (error) {
      console.error('[AnswerValidation] Error marking answer as submitted:', error);
      return false;
    }
  }
}

// Export singleton instance
export const answerValidationService = new AnswerValidationService();
