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
import { SubmitAnswerRequest } from '../models/types';

export type ValidationRejectionReason =
  | 'INVALID_QUESTION'
  | 'QUESTION_NOT_ACTIVE'
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
      if (currentTime > sessionState.timerEndTime) {
        console.warn('[AnswerValidation] Timer expired:', {
          sessionId,
          currentTime,
          timerEndTime: sessionState.timerEndTime,
          expiredBy: currentTime - sessionState.timerEndTime,
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
