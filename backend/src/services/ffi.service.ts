/**
 * FFI (Fastest Finger First) Service
 * 
 * Handles FFI quiz type logic where only the first N correct answers receive points.
 * Tracks answer submission order with millisecond precision and awards points
 * only to the fastest correct responders.
 * 
 * Requirements: 6.10, 7.4, 7.5, 7.6
 */

import { mongodbService } from './mongodb.service';
import { redisService } from './redis.service';
import { FFISettings } from '../models/types';

interface FFIRanking {
  participantId: string;
  nickname: string;
  submissionTime: number;
  responseTimeMs: number;
  rank: number;
  isWinner: boolean;
}

interface FFIResult {
  winners: string[];
  rankings: FFIRanking[];
  winnersPerQuestion: number;
}

class FFIService {
  /**
   * Track answer submission with millisecond precision
   * 
   * Stores answer submission timestamp in Redis sorted set for the question.
   * The score is the submission timestamp in milliseconds, ensuring precise ordering.
   * 
   * Requirements: 7.5
   * 
   * @param sessionId - Session ID
   * @param questionId - Question ID
   * @param participantId - Participant ID
   * @param submissionTime - Submission timestamp in milliseconds
   */
  async trackAnswerSubmission(
    sessionId: string,
    questionId: string,
    participantId: string,
    submissionTime: number
  ): Promise<void> {
    try {
      const redis = redisService.getClient();
      const key = `session:${sessionId}:question:${questionId}:ffi_order`;

      // Store with millisecond timestamp as score for precise ordering
      await redis.zadd(key, submissionTime, participantId);

      // Set TTL to 1 hour (answers will be processed before expiry)
      await redis.expire(key, 3600);

      console.log('[FFI] Tracked answer submission:', {
        sessionId,
        questionId,
        participantId,
        submissionTime,
      });
    } catch (error) {
      console.error('[FFI] Error tracking answer submission:', error);
    }
  }

  /**
   * Calculate FFI winners for a question
   * 
   * After all answers are submitted and scored, this determines which participants
   * were in the first N correct answers and should receive points.
   * 
   * Steps:
   * 1. Get FFI settings (winnersPerQuestion)
   * 2. Get submission order from Redis sorted set
   * 3. Get correct answers from MongoDB
   * 4. Identify first N correct answers
   * 5. Return winner list and full rankings
   * 
   * Requirements: 6.10, 7.4, 7.6
   * 
   * @param sessionId - Session ID
   * @param questionId - Question ID
   * @returns FFI result with winners and rankings
   */
  async calculateFFIWinners(
    sessionId: string,
    questionId: string
  ): Promise<FFIResult | null> {
    try {
      const db = mongodbService.getDb();
      const redis = redisService.getClient();

      // 1. Get session and quiz to check FFI settings
      const session = await db.collection('sessions').findOne({ sessionId });
      if (!session) {
        console.error('[FFI] Session not found:', sessionId);
        return null;
      }

      const quiz = await db.collection('quizzes').findOne({ _id: session.quizId });
      if (!quiz || quiz.quizType !== 'FFI') {
        console.error('[FFI] Not an FFI quiz');
        return null;
      }

      const ffiSettings = quiz.ffiSettings as FFISettings;
      if (!ffiSettings) {
        console.error('[FFI] No FFI settings found');
        return null;
      }

      const winnersPerQuestion = ffiSettings.winnersPerQuestion;

      // 2. Get submission order from Redis (sorted by timestamp, ascending)
      const key = `session:${sessionId}:question:${questionId}:ffi_order`;
      const submissionOrder = await redis.zrange(key, 0, -1, 'WITHSCORES');

      if (submissionOrder.length === 0) {
        console.log('[FFI] No submissions found for question');
        return {
          winners: [],
          rankings: [],
          winnersPerQuestion,
        };
      }

      // Parse submission order (format: [participantId1, timestamp1, participantId2, timestamp2, ...])
      const submissions: Array<{ participantId: string; timestamp: number }> = [];
      for (let i = 0; i < submissionOrder.length; i += 2) {
        submissions.push({
          participantId: submissionOrder[i],
          timestamp: parseFloat(submissionOrder[i + 1]),
        });
      }

      // 3. Get answers from MongoDB to check correctness
      const answers = await db
        .collection('answers')
        .find({
          sessionId,
          questionId,
          participantId: { $in: submissions.map(s => s.participantId) },
        })
        .toArray();

      // Create map of participantId -> answer for quick lookup
      const answerMap = new Map(
        answers.map(answer => [answer.participantId, answer])
      );

      // 4. Build rankings with correctness information
      const rankings: FFIRanking[] = [];
      let correctCount = 0;

      for (const submission of submissions) {
        const answer = answerMap.get(submission.participantId);
        if (!answer) continue;

        const isCorrect = answer.isCorrect;
        const isWinner = isCorrect && correctCount < winnersPerQuestion;

        if (isCorrect) {
          correctCount++;
        }

        // Get participant details
        const participant = await db
          .collection('participants')
          .findOne({ participantId: submission.participantId });

        rankings.push({
          participantId: submission.participantId,
          nickname: participant?.nickname || 'Unknown',
          submissionTime: submission.timestamp,
          responseTimeMs: answer.responseTimeMs,
          rank: rankings.length + 1,
          isWinner,
        });
      }

      // 5. Identify winners (first N correct answers)
      const winners = rankings
        .filter(r => r.isWinner)
        .map(r => r.participantId);

      console.log(`[FFI] Calculated FFI winners: ${winners.length} out of ${winnersPerQuestion}`);

      return {
        winners,
        rankings,
        winnersPerQuestion,
      };
    } catch (error) {
      console.error('[FFI] Error calculating FFI winners:', error);
      return null;
    }
  }

  /**
   * Get FFI rankings for a question
   * 
   * Returns the submission order and winner status for display purposes.
   * 
   * @param sessionId - Session ID
   * @param questionId - Question ID
   * @returns FFI rankings
   */
  async getFFIRankings(
    sessionId: string,
    questionId: string
  ): Promise<FFIRanking[]> {
    const result = await this.calculateFFIWinners(sessionId, questionId);
    return result?.rankings || [];
  }

  /**
   * Check if participant is an FFI winner for a question
   * 
   * @param sessionId - Session ID
   * @param questionId - Question ID
   * @param participantId - Participant ID
   * @returns True if participant is a winner
   */
  async isFFIWinner(
    sessionId: string,
    questionId: string,
    participantId: string
  ): Promise<boolean> {
    const result = await this.calculateFFIWinners(sessionId, questionId);
    return result?.winners.includes(participantId) || false;
  }

  /**
   * Get FFI settings for a session
   * 
   * @param sessionId - Session ID
   * @returns FFI settings or null
   */
  async getFFISettings(sessionId: string): Promise<FFISettings | null> {
    try {
      const db = mongodbService.getDb();
      const session = await db.collection('sessions').findOne({ sessionId });
      if (!session) return null;

      const quiz = await db.collection('quizzes').findOne({ _id: session.quizId });
      if (!quiz || quiz.quizType !== 'FFI') return null;

      return (quiz.ffiSettings as FFISettings) || null;
    } catch (error) {
      console.error('[FFI] Error getting FFI settings:', error);
      return null;
    }
  }

  /**
   * Get participant's FFI rank for a question
   * 
   * @param sessionId - Session ID
   * @param questionId - Question ID
   * @param participantId - Participant ID
   * @returns Rank (1-based) or 0 if not found
   */
  async getParticipantFFIRank(
    sessionId: string,
    questionId: string,
    participantId: string
  ): Promise<number> {
    try {
      const redis = redisService.getClient();
      const key = `session:${sessionId}:question:${questionId}:ffi_order`;

      // Get rank (0-based index)
      const rank = await redis.zrank(key, participantId);

      // Convert to 1-based rank, or return 0 if not found
      return rank !== null ? rank + 1 : 0;
    } catch (error) {
      console.error('[FFI] Error getting participant FFI rank:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const ffiService = new FFIService();
