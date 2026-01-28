/**
 * Session Recovery Service
 * 
 * Handles participant session recovery after disconnection:
 * - Verifies session exists and is not ENDED
 * - Verifies participant exists and is not banned
 * - Restores participant as active in Redis
 * - Refreshes Redis TTL for participant session
 * - Gets current question if in ACTIVE_QUESTION state
 * - Calculates remaining time from timerEndTime
 * - Gets participant's current score and rank
 * - Gets current leaderboard
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import { redisDataStructuresService, SessionState, ParticipantSession } from './redis-data-structures.service';
import { mongodbService } from './mongodb.service';
import { performanceLoggingService } from './performance-logging.service';
import { Question, Session, Participant, LeaderboardEntry } from '../models/types';

/**
 * Session recovery result data
 */
export interface SessionRecoveryData {
  participantId: string;
  currentState: SessionState['state'];
  currentQuestion: QuestionForRecovery | null;
  remainingTime: number | null;
  totalScore: number;
  rank: number | null;
  leaderboard: LeaderboardEntry[];
  streakCount: number;
  isEliminated: boolean;
  isSpectator: boolean;
}

/**
 * Question data for recovery (without correct answer flags)
 */
export interface QuestionForRecovery {
  questionId: string;
  questionText: string;
  questionType: string;
  questionImageUrl?: string;
  options: Array<{
    optionId: string;
    optionText: string;
    optionImageUrl?: string;
    // Note: isCorrect is NOT included for security
  }>;
  timeLimit: number;
  shuffleOptions: boolean;
}

/**
 * Session recovery failure reasons
 */
export type RecoveryFailureReason = 
  | 'SESSION_NOT_FOUND'
  | 'SESSION_ENDED'
  | 'PARTICIPANT_NOT_FOUND'
  | 'PARTICIPANT_BANNED'
  | 'SESSION_EXPIRED';

/**
 * Session recovery failure result
 */
export interface SessionRecoveryFailure {
  success: false;
  reason: RecoveryFailureReason;
  message: string;
}

/**
 * Session recovery success result
 */
export interface SessionRecoverySuccess {
  success: true;
  data: SessionRecoveryData;
}

/**
 * Session recovery result type
 */
export type SessionRecoveryResult = SessionRecoverySuccess | SessionRecoveryFailure;

class SessionRecoveryService {
  /**
   * Recover a participant's session after disconnection
   * 
   * This method:
   * 1. Verifies session exists and is not ENDED
   * 2. Verifies participant exists and is not banned
   * 3. Restores participant as active in Redis
   * 4. Refreshes Redis TTL for participant session
   * 5. Gets current question if in ACTIVE_QUESTION state
   * 6. Calculates remaining time from timerEndTime
   * 7. Gets participant's current score and rank
   * 8. Gets current leaderboard
   * 
   * Requirements: 8.1, 8.2, 8.3, 8.4
   * 
   * @param participantId - Participant ID attempting to recover
   * @param sessionId - Session ID to recover
   * @param lastKnownQuestionId - Optional last known question ID for validation
   * @returns Session recovery result with restored state or failure reason
   */
  async recoverSession(
    participantId: string,
    sessionId: string,
    lastKnownQuestionId?: string
  ): Promise<SessionRecoveryResult> {
    // Start performance timer for session recovery
    const endTimer = performanceLoggingService.startTimer('session_recovery');
    
    console.log('[Session Recovery] Attempting session recovery:', {
      participantId,
      sessionId,
      lastKnownQuestionId,
    });

    try {
      // Step 1: Verify session exists and is not ENDED
      const sessionState = await this.verifySession(sessionId);
      if (!sessionState.success) {
        return sessionState as SessionRecoveryFailure;
      }

      // Step 2: Verify participant exists and is not banned
      const participantVerification = await this.verifyParticipant(participantId, sessionId);
      if (!participantVerification.success) {
        return participantVerification as SessionRecoveryFailure;
      }

      // Step 3: Restore participant as active in Redis
      await this.restoreParticipantActive(participantId);

      // Step 4: Refresh Redis TTL for participant session
      await redisDataStructuresService.refreshParticipantSession(participantId);

      // Step 5: Get current question if in ACTIVE_QUESTION state
      let currentQuestion: QuestionForRecovery | null = null;
      let remainingTime: number | null = null;

      if (sessionState.data.state === 'ACTIVE_QUESTION') {
        const questionData = await this.getCurrentQuestion(
          sessionId,
          sessionState.data.currentQuestionId
        );
        currentQuestion = questionData;

        // Step 6: Calculate remaining time from timerEndTime
        if (sessionState.data.timerEndTime) {
          remainingTime = this.calculateRemainingTime(sessionState.data.timerEndTime);
        }
      }

      // Step 7: Get participant's current score and rank
      const participantSession = await redisDataStructuresService.getParticipantSession(participantId);
      const totalScore = participantSession?.totalScore || 0;
      const streakCount = participantSession?.streakCount || 0;
      const isEliminated = participantSession?.isEliminated || false;
      const isSpectator = isEliminated; // Eliminated participants are spectators

      const rank = await this.getParticipantRank(sessionId, participantId);

      // Step 8: Get current leaderboard
      const leaderboard = await this.getLeaderboard(sessionId, 10);

      const recoveryData: SessionRecoveryData = {
        participantId,
        currentState: sessionState.data.state,
        currentQuestion,
        remainingTime,
        totalScore,
        rank,
        leaderboard,
        streakCount,
        isEliminated,
        isSpectator,
      };

      console.log('[Session Recovery] Session recovered successfully:', {
        participantId,
        sessionId,
        currentState: sessionState.data.state,
        totalScore,
        rank,
      });

      // End performance timer
      endTimer();

      return {
        success: true,
        data: recoveryData,
      };
    } catch (error) {
      // End performance timer even on error
      endTimer();
      
      console.error('[Session Recovery] Error recovering session:', error);
      return {
        success: false,
        reason: 'SESSION_NOT_FOUND',
        message: 'An error occurred while recovering the session',
      };
    }
  }

  /**
   * Verify session exists and is not ENDED
   * 
   * Requirement: 8.1
   * 
   * @param sessionId - Session ID to verify
   * @returns Verification result with session state or failure
   */
  private async verifySession(
    sessionId: string
  ): Promise<{ success: true; data: SessionState } | SessionRecoveryFailure> {
    // First try to get session state from Redis
    const sessionState = await redisDataStructuresService.getSessionState(sessionId);

    if (!sessionState) {
      // Fallback to MongoDB if not in Redis
      const mongoSession = await this.getSessionFromMongoDB(sessionId);
      
      if (!mongoSession) {
        console.log('[Session Recovery] Session not found:', sessionId);
        return {
          success: false,
          reason: 'SESSION_NOT_FOUND',
          message: 'Session not found. Please rejoin with the join code.',
        };
      }

      // Check if session has ended
      if (mongoSession.state === 'ENDED') {
        console.log('[Session Recovery] Session has ended:', sessionId);
        return {
          success: false,
          reason: 'SESSION_ENDED',
          message: 'The quiz has ended.',
        };
      }

      // Restore session state to Redis from MongoDB
      const restoredState: SessionState = {
        state: mongoSession.state,
        currentQuestionIndex: mongoSession.currentQuestionIndex,
        participantCount: mongoSession.participantCount,
        currentQuestionId: undefined,
        currentQuestionStartTime: mongoSession.currentQuestionStartTime?.getTime(),
        timerEndTime: undefined,
        voidedQuestions: mongoSession.voidedQuestions,
      };

      await redisDataStructuresService.setSessionState(sessionId, restoredState);

      return {
        success: true,
        data: restoredState,
      };
    }

    // Check if session has ended
    if (sessionState.state === 'ENDED') {
      console.log('[Session Recovery] Session has ended:', sessionId);
      return {
        success: false,
        reason: 'SESSION_ENDED',
        message: 'The quiz has ended.',
      };
    }

    return {
      success: true,
      data: sessionState,
    };
  }

  /**
   * Verify participant exists and is not banned
   * 
   * Requirement: 8.2, 8.5
   * 
   * @param participantId - Participant ID to verify
   * @param sessionId - Session ID for context
   * @returns Verification result or failure
   */
  private async verifyParticipant(
    participantId: string,
    sessionId: string
  ): Promise<{ success: true } | SessionRecoveryFailure> {
    // First try to get participant from Redis
    const participantSession = await redisDataStructuresService.getParticipantSession(participantId);

    if (!participantSession) {
      // Participant session not in Redis - check if it expired or never existed
      // Fallback to MongoDB to determine the reason
      const mongoParticipant = await this.getParticipantFromMongoDB(participantId, sessionId);

      if (!mongoParticipant) {
        console.log('[Session Recovery] Participant not found:', participantId);
        return {
          success: false,
          reason: 'PARTICIPANT_NOT_FOUND',
          message: 'Participant not found. Please rejoin with the join code.',
        };
      }

      // Check if participant is banned
      if (mongoParticipant.isBanned) {
        console.log('[Session Recovery] Participant is banned:', participantId);
        return {
          success: false,
          reason: 'PARTICIPANT_BANNED',
          message: 'You have been banned from this quiz session.',
        };
      }

      // Participant exists in MongoDB but not in Redis - session has expired (5 minute TTL)
      // Requirement 8.5: Reject reconnection attempts after 5 minutes
      // Check if the participant was recently active (within a reasonable window)
      const lastConnectedAt = mongoParticipant.lastConnectedAt;
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      
      if (lastConnectedAt && new Date(lastConnectedAt).getTime() < fiveMinutesAgo) {
        console.log('[Session Recovery] Session expired for participant:', {
          participantId,
          lastConnectedAt,
          expiredAt: new Date(fiveMinutesAgo).toISOString(),
        });
        return {
          success: false,
          reason: 'SESSION_EXPIRED',
          message: 'Your session has expired. Please rejoin with the join code.',
        };
      }

      // Restore participant session to Redis from MongoDB
      // This handles the case where Redis was restarted or data was evicted
      const restoredSession: ParticipantSession = {
        sessionId: mongoParticipant.sessionId,
        nickname: mongoParticipant.nickname,
        totalScore: mongoParticipant.totalScore,
        totalTimeMs: mongoParticipant.totalTimeMs,
        streakCount: mongoParticipant.streakCount,
        isActive: true, // Restore as active
        isEliminated: mongoParticipant.isEliminated,
        socketId: undefined,
      };

      await redisDataStructuresService.setParticipantSession(participantId, restoredSession);

      return { success: true };
    }

    // Verify participant belongs to the correct session
    if (participantSession.sessionId !== sessionId) {
      console.log('[Session Recovery] Participant session mismatch:', {
        participantId,
        expectedSessionId: sessionId,
        actualSessionId: participantSession.sessionId,
      });
      return {
        success: false,
        reason: 'PARTICIPANT_NOT_FOUND',
        message: 'Participant not found in this session. Please rejoin with the join code.',
      };
    }

    // Check if participant is banned (need to check MongoDB for ban status)
    const mongoParticipant = await this.getParticipantFromMongoDB(participantId, sessionId);
    if (mongoParticipant?.isBanned) {
      console.log('[Session Recovery] Participant is banned:', participantId);
      return {
        success: false,
        reason: 'PARTICIPANT_BANNED',
        message: 'You have been banned from this quiz session.',
      };
    }

    return { success: true };
  }

  /**
   * Restore participant as active in Redis
   * 
   * Requirement: 8.2
   * 
   * @param participantId - Participant ID to restore
   */
  private async restoreParticipantActive(participantId: string): Promise<void> {
    await redisDataStructuresService.updateParticipantSession(participantId, {
      isActive: true,
    });

    // Also update MongoDB
    try {
      const db = mongodbService.getDb();
      const participantsCollection = db.collection('participants');
      
      await participantsCollection.updateOne(
        { participantId },
        {
          $set: {
            isActive: true,
            lastConnectedAt: new Date(),
          },
        }
      );
    } catch (error) {
      console.error('[Session Recovery] Error updating participant in MongoDB:', error);
      // Don't fail recovery if MongoDB update fails
    }

    console.log('[Session Recovery] Restored participant as active:', participantId);
  }

  /**
   * Get current question for recovery (without correct answer flags)
   * 
   * Requirement: 8.3
   * 
   * @param sessionId - Session ID
   * @param questionId - Current question ID
   * @returns Question data for recovery or null
   */
  private async getCurrentQuestion(
    sessionId: string,
    questionId?: string
  ): Promise<QuestionForRecovery | null> {
    if (!questionId) {
      return null;
    }

    try {
      const db = mongodbService.getDb();
      const sessionsCollection = db.collection('sessions');

      // Get session to find quiz ID
      const session = await sessionsCollection.findOne({ sessionId });
      if (!session) {
        console.error('[Session Recovery] Session not found in MongoDB:', sessionId);
        return null;
      }

      // Get quiz with questions
      const quizzesCollection = db.collection('quizzes');
      const quiz = await quizzesCollection.findOne({ _id: session.quizId });
      if (!quiz) {
        console.error('[Session Recovery] Quiz not found:', session.quizId);
        return null;
      }

      // Find question in quiz
      const question = quiz.questions.find((q: Question) => q.questionId === questionId);
      if (!question) {
        console.error('[Session Recovery] Question not found in quiz:', questionId);
        return null;
      }

      // Return question without correct answer flags (security)
      const questionForRecovery: QuestionForRecovery = {
        questionId: question.questionId,
        questionText: question.questionText,
        questionType: question.questionType,
        questionImageUrl: question.questionImageUrl,
        options: question.options.map((opt: any) => ({
          optionId: opt.optionId,
          optionText: opt.optionText,
          optionImageUrl: opt.optionImageUrl,
          // Note: isCorrect is NOT included for security
        })),
        timeLimit: question.timeLimit,
        shuffleOptions: question.shuffleOptions,
      };

      return questionForRecovery;
    } catch (error) {
      console.error('[Session Recovery] Error getting current question:', error);
      return null;
    }
  }

  /**
   * Calculate remaining time from timerEndTime
   * 
   * Requirement: 8.3
   * 
   * @param timerEndTime - Timer end time in milliseconds
   * @returns Remaining time in seconds (0 if expired)
   */
  private calculateRemainingTime(timerEndTime: number): number {
    const now = Date.now();
    const remainingMs = timerEndTime - now;
    const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    return remainingSeconds;
  }

  /**
   * Get participant's rank in the leaderboard
   * 
   * Requirement: 8.4
   * 
   * @param sessionId - Session ID
   * @param participantId - Participant ID
   * @returns Rank (1-based) or null if not found
   */
  private async getParticipantRank(
    sessionId: string,
    participantId: string
  ): Promise<number | null> {
    const rank = await redisDataStructuresService.getParticipantRank(sessionId, participantId);
    return rank;
  }

  /**
   * Get current leaderboard
   * 
   * Requirement: 8.4
   * 
   * @param sessionId - Session ID
   * @param limit - Number of entries to return
   * @returns Leaderboard entries with participant details
   */
  private async getLeaderboard(
    sessionId: string,
    limit: number
  ): Promise<LeaderboardEntry[]> {
    try {
      // Get top entries from Redis sorted set
      const topEntries = await redisDataStructuresService.getTopLeaderboard(sessionId, limit);

      // Enrich with participant details
      const leaderboard: LeaderboardEntry[] = [];

      for (const entry of topEntries) {
        const participantSession = await redisDataStructuresService.getParticipantSession(
          entry.participantId
        );

        if (participantSession) {
          leaderboard.push({
            rank: entry.rank,
            participantId: entry.participantId,
            nickname: participantSession.nickname,
            totalScore: participantSession.totalScore,
            streakCount: participantSession.streakCount,
            totalTimeMs: participantSession.totalTimeMs,
          });
        }
      }

      return leaderboard;
    } catch (error) {
      console.error('[Session Recovery] Error getting leaderboard:', error);
      return [];
    }
  }

  /**
   * Get session from MongoDB (fallback when not in Redis)
   * 
   * @param sessionId - Session ID
   * @returns Session document or null
   */
  private async getSessionFromMongoDB(sessionId: string): Promise<Session | null> {
    try {
      const db = mongodbService.getDb();
      const sessionsCollection = db.collection('sessions');
      const session = await sessionsCollection.findOne({ sessionId });
      return session as Session | null;
    } catch (error) {
      console.error('[Session Recovery] Error getting session from MongoDB:', error);
      return null;
    }
  }

  /**
   * Get participant from MongoDB (fallback when not in Redis)
   * 
   * @param participantId - Participant ID
   * @param sessionId - Session ID for verification
   * @returns Participant document or null
   */
  private async getParticipantFromMongoDB(
    participantId: string,
    sessionId: string
  ): Promise<Participant | null> {
    try {
      const db = mongodbService.getDb();
      const participantsCollection = db.collection('participants');
      const participant = await participantsCollection.findOne({
        participantId,
        sessionId,
      });
      return participant as Participant | null;
    } catch (error) {
      console.error('[Session Recovery] Error getting participant from MongoDB:', error);
      return null;
    }
  }

  /**
   * Check if a session recovery is possible
   * 
   * Quick check without full recovery - useful for validation
   * 
   * @param participantId - Participant ID
   * @param sessionId - Session ID
   * @returns True if recovery is possible
   */
  async canRecover(participantId: string, sessionId: string): Promise<boolean> {
    try {
      // Check session state
      const sessionState = await redisDataStructuresService.getSessionState(sessionId);
      if (!sessionState || sessionState.state === 'ENDED') {
        return false;
      }

      // Check participant exists
      const participantSession = await redisDataStructuresService.getParticipantSession(participantId);
      if (!participantSession) {
        // Check MongoDB as fallback
        const mongoParticipant = await this.getParticipantFromMongoDB(participantId, sessionId);
        if (!mongoParticipant || mongoParticipant.isBanned) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('[Session Recovery] Error checking recovery possibility:', error);
      return false;
    }
  }

  /**
   * Update participant's socket ID after recovery
   * 
   * @param participantId - Participant ID
   * @param socketId - New socket ID
   */
  async updateSocketId(participantId: string, socketId: string): Promise<void> {
    await redisDataStructuresService.updateParticipantSession(participantId, {
      socketId,
    });

    console.log('[Session Recovery] Updated socket ID:', {
      participantId,
      socketId,
    });
  }
}

// Export singleton instance
export const sessionRecoveryService = new SessionRecoveryService();
