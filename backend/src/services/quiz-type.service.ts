/**
 * Quiz Type Service
 * 
 * Handles quiz type-specific logic for REGULAR, ELIMINATION, and FFI quizzes.
 * 
 * REGULAR Quiz:
 * - All participants can answer all questions
 * - No elimination logic applied
 * - Standard scoring (base points + speed bonus + streak bonus + partial credit)
 * 
 * ELIMINATION Quiz:
 * - Bottom X% of participants are eliminated after each question
 * - Eliminated participants transition to spectator mode
 * - Cannot submit answers after elimination
 * 
 * FFI (Fastest Finger First) Quiz:
 * - Only first N correct answers receive points
 * - All other participants receive zero points
 * - Submission order tracked with millisecond precision
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */

import { mongodbService } from './mongodb.service';
import { QuizType } from '../models/types';

class QuizTypeService {
  /**
   * Get quiz type for a session
   * 
   * @param sessionId - Session ID
   * @returns Quiz type (REGULAR, ELIMINATION, or FFI)
   */
  async getQuizType(sessionId: string): Promise<QuizType | null> {
    try {
      const db = mongodbService.getDb();
      const sessionsCollection = db.collection('sessions');

      // Get session to find quiz ID
      const session = await sessionsCollection.findOne({ sessionId });

      if (!session) {
        console.error('[QuizType] Session not found:', sessionId);
        return null;
      }

      // Get quiz to find quiz type
      const quizzesCollection = db.collection('quizzes');
      const quiz = await quizzesCollection.findOne({ _id: session.quizId });

      if (!quiz) {
        console.error('[QuizType] Quiz not found:', session.quizId);
        return null;
      }

      return quiz.quizType;
    } catch (error) {
      console.error('[QuizType] Error getting quiz type:', error);
      return null;
    }
  }

  /**
   * Check if quiz type is REGULAR
   * 
   * REGULAR quizzes allow all participants to answer all questions
   * without elimination.
   * 
   * Requirement: 7.1
   * 
   * @param sessionId - Session ID
   * @returns True if quiz type is REGULAR
   */
  async isRegularQuiz(sessionId: string): Promise<boolean> {
    const quizType = await this.getQuizType(sessionId);
    return quizType === 'REGULAR';
  }

  /**
   * Check if quiz type is ELIMINATION
   * 
   * ELIMINATION quizzes eliminate bottom X% of participants after each question.
   * 
   * Requirement: 7.2
   * 
   * @param sessionId - Session ID
   * @returns True if quiz type is ELIMINATION
   */
  async isEliminationQuiz(sessionId: string): Promise<boolean> {
    const quizType = await this.getQuizType(sessionId);
    return quizType === 'ELIMINATION';
  }

  /**
   * Check if quiz type is FFI (Fastest Finger First)
   * 
   * FFI quizzes award points only to first N correct answers.
   * 
   * Requirement: 7.4
   * 
   * @param sessionId - Session ID
   * @returns True if quiz type is FFI
   */
  async isFFIQuiz(sessionId: string): Promise<boolean> {
    const quizType = await this.getQuizType(sessionId);
    return quizType === 'FFI';
  }

  /**
   * Check if participant should be allowed to answer
   * 
   * For REGULAR quizzes: All participants can answer
   * For ELIMINATION quizzes: Only non-eliminated participants can answer
   * For FFI quizzes: All participants can answer (but only first N get points)
   * 
   * @param sessionId - Session ID
   * @param isEliminated - Whether participant is eliminated
   * @returns True if participant can answer
   */
  async canParticipantAnswer(sessionId: string, isEliminated: boolean): Promise<boolean> {
    const quizType = await this.getQuizType(sessionId);

    if (!quizType) {
      return false;
    }

    // REGULAR and FFI: All participants can answer
    if (quizType === 'REGULAR' || quizType === 'FFI') {
      return true;
    }

    // ELIMINATION: Only non-eliminated participants can answer
    if (quizType === 'ELIMINATION') {
      return !isEliminated;
    }

    return false;
  }
}

// Export singleton instance
export const quizTypeService = new QuizTypeService();
