/**
 * Scoring Service
 * 
 * Background worker for score calculation:
 * - Subscribes to scoring channel (session:{sessionId}:scoring)
 * - Calculates base points for correct answers
 * - Calculates speed bonus (base × multiplier × time factor)
 * - Calculates streak bonus for consecutive correct answers
 * - Calculates partial credit for multi-correct questions
 * - Updates participant score in Redis hash
 * - Updates leaderboard sorted set in Redis (score with tie-breaker)
 * - Batch inserts answers to MongoDB (every 1 second or 100 answers)
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 11.4
 */

import { redisService } from './redis.service';
import { redisDataStructuresService } from './redis-data-structures.service';
import { mongodbService } from './mongodb.service';
import { pubSubService } from './pubsub.service';
import { performanceLoggingService } from './performance-logging.service';
import { Answer, Question } from '../models/types';

interface ScoringMessage {
  answerId: string;
  participantId: string;
  questionId: string;
  sessionId: string;
  timestamp: number;
}

interface ScoreCalculation {
  basePoints: number;
  speedBonus: number;
  streakBonus: number;
  partialCredit: number;
  totalPoints: number;
  isCorrect: boolean;
}

/**
 * Error context for score calculation errors
 * Used for detailed error logging
 */
interface ScoreCalculationErrorContext {
  participantId: string;
  questionId: string;
  sessionId: string;
  answerId: string;
  errorMessage: string;
  errorStack?: string;
  timestamp: number;
}

class ScoringService {
  private answerBatch: Answer[] = [];
  private batchFlushInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 100;
  private readonly BATCH_FLUSH_INTERVAL_MS = 1000; // 1 second
  private subscriber: any = null;
  private subscribedSessions: Set<string> = new Set();
  
  /**
   * Map to store last valid scores for each participant
   * Used for error recovery - returns last valid score when calculation fails
   * Key: participantId, Value: ScoreCalculation
   * 
   * Requirement: 17.4 - Keep last valid score on error
   */
  private lastValidScores: Map<string, ScoreCalculation> = new Map();

  /**
   * Start the scoring worker
   * 
   * Subscribes to all session scoring channels and processes score calculations
   */
  async start(): Promise<void> {
    console.log('[Scoring Service] Starting scoring worker...');

    // Get subscriber instance
    this.subscriber = redisService.getSubscriber();

    // Set up message handler
    this.subscriber.on('message', async (_channel: string, message: string) => {
      await this.processScoringMessage(message);
    });

    // Start batch flush interval
    this.startBatchFlushInterval();

    console.log('[Scoring Service] Scoring worker started successfully');
  }

  /**
   * Subscribe to scoring channel for a specific session
   * 
   * @param sessionId - Session ID to subscribe to
   */
  async subscribeToSession(sessionId: string): Promise<void> {
    if (!this.subscriber) {
      throw new Error('Scoring service not started');
    }

    const channel = `session:${sessionId}:scoring`;

    console.log('[Scoring Service] Subscribing to scoring channel:', channel);

    // Subscribe to scoring channel
    await this.subscriber.subscribe(channel);
    this.subscribedSessions.add(sessionId);

    console.log('[Scoring Service] Subscribed to scoring channel:', channel);
  }

  /**
   * Unsubscribe from scoring channel for a specific session
   * 
   * @param sessionId - Session ID to unsubscribe from
   */
  async unsubscribeFromSession(sessionId: string): Promise<void> {
    if (!this.subscriber) {
      return;
    }

    const channel = `session:${sessionId}:scoring`;

    console.log('[Scoring Service] Unsubscribing from scoring channel:', channel);

    await this.subscriber.unsubscribe(channel);
    this.subscribedSessions.delete(sessionId);

    console.log('[Scoring Service] Unsubscribed from scoring channel:', channel);
  }

  /**
   * Clear last valid scores for a specific session
   * 
   * Should be called when a session ends to free memory
   * 
   * @param sessionId - Session ID to clear scores for
   * @param participantIds - Array of participant IDs in the session
   */
  clearLastValidScoresForSession(participantIds: string[]): void {
    for (const participantId of participantIds) {
      this.lastValidScores.delete(participantId);
    }
    console.log('[Scoring Service] Cleared last valid scores for participants:', participantIds.length);
  }

  /**
   * Get the last valid score for a participant
   * 
   * Useful for testing and debugging
   * 
   * @param participantId - Participant ID
   * @returns Last valid score or undefined if not found
   */
  getLastValidScore(participantId: string): ScoreCalculation | undefined {
    return this.lastValidScores.get(participantId);
  }

  /**
   * Process scoring message from Redis pub/sub
   * 
   * Implements error recovery pattern (Requirement 17.4):
   * - Wraps score calculation in try-catch
   * - Keeps last valid score on error
   * - Logs error with context
   * - Continues processing other answers
   * 
   * @param message - Scoring message JSON string
   */
  private async processScoringMessage(message: string): Promise<void> {
    let scoringMessage: ScoringMessage | null = null;
    
    // Start performance timer for scoring calculation
    const endTimer = performanceLoggingService.startTimer('scoring_calculation');
    
    try {
      scoringMessage = JSON.parse(message);

      console.log('[Scoring Service] Processing scoring message:', {
        answerId: scoringMessage!.answerId,
        participantId: scoringMessage!.participantId,
        questionId: scoringMessage!.questionId,
      });

      // Get answer from Redis buffer
      const answer = await this.getAnswerFromBuffer(
        scoringMessage!.sessionId,
        scoringMessage!.answerId
      );

      if (!answer) {
        console.error('[Scoring Service] Answer not found in buffer:', scoringMessage!.answerId);
        return;
      }

      // Get question details from MongoDB
      const question = await this.getQuestion(scoringMessage!.sessionId, scoringMessage!.questionId);

      if (!question) {
        console.error('[Scoring Service] Question not found:', scoringMessage!.questionId);
        return;
      }

      // Calculate score with error recovery
      const scoreCalculation = await this.calculateScoreWithRecovery(
        answer,
        question,
        scoringMessage!.participantId,
        scoringMessage!.sessionId,
        scoringMessage!.answerId,
        scoringMessage!.questionId
      );

      // Update participant score in Redis
      await this.updateParticipantScore(
        scoringMessage!.participantId,
        scoringMessage!.sessionId,
        scoreCalculation
      );

      // Update leaderboard in Redis
      await this.updateLeaderboard(
        scoringMessage!.participantId,
        scoringMessage!.sessionId
      );

      // Add answer to batch for MongoDB persistence
      const enrichedAnswer: Answer = {
        ...answer,
        isCorrect: scoreCalculation.isCorrect,
        pointsAwarded: scoreCalculation.totalPoints,
        speedBonusApplied: scoreCalculation.speedBonus,
        streakBonusApplied: scoreCalculation.streakBonus,
        partialCreditApplied: scoreCalculation.partialCredit > 0,
      };

      this.answerBatch.push(enrichedAnswer);

      // Flush batch if size limit reached
      if (this.answerBatch.length >= this.BATCH_SIZE) {
        await this.flushAnswerBatch();
      }

      // Broadcast score update to participant
      await this.broadcastScoreUpdate(
        scoringMessage!.participantId,
        scoringMessage!.sessionId
      );

      console.log('[Scoring Service] Score calculation completed:', {
        answerId: scoringMessage!.answerId,
        participantId: scoringMessage!.participantId,
        totalPoints: scoreCalculation.totalPoints,
        isCorrect: scoreCalculation.isCorrect,
      });
      
      // End performance timer
      endTimer();
    } catch (error) {
      // End performance timer even on error
      endTimer();
      
      // Log error with full context for debugging (Requirement 17.4)
      const errorContext: ScoreCalculationErrorContext = {
        participantId: scoringMessage?.participantId ?? 'unknown',
        questionId: scoringMessage?.questionId ?? 'unknown',
        sessionId: scoringMessage?.sessionId ?? 'unknown',
        answerId: scoringMessage?.answerId ?? 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now(),
      };
      
      console.error('[Scoring] Error processing scoring message:', errorContext);
      // Don't throw - continue processing other messages (Requirement 17.4)
    }
  }

  /**
   * Calculate score with error recovery
   * 
   * Wraps score calculation in try-catch and returns last valid score on error.
   * This ensures that errors in one calculation don't affect other participants.
   * 
   * Requirement: 17.4 - When an error occurs during score calculation, 
   * the System SHALL log the error and use the previous valid score
   * 
   * @param answer - Answer submission
   * @param question - Question details
   * @param participantId - Participant ID
   * @param sessionId - Session ID
   * @param answerId - Answer ID (for error logging)
   * @param questionId - Question ID (for error logging)
   * @returns Score calculation breakdown (or last valid score on error)
   */
  private async calculateScoreWithRecovery(
    answer: any,
    question: Question,
    participantId: string,
    sessionId: string,
    answerId: string,
    questionId: string
  ): Promise<ScoreCalculation> {
    try {
      // Attempt to calculate score
      const score = await this.calculateScore(
        answer,
        question,
        participantId,
        sessionId
      );
      
      // Store as last valid score for this participant
      this.lastValidScores.set(participantId, score);
      
      return score;
    } catch (error) {
      // Log error with full context (Requirement 17.4)
      const errorContext: ScoreCalculationErrorContext = {
        participantId,
        questionId,
        sessionId,
        answerId,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now(),
      };
      
      console.error('[Scoring] Error calculating score:', errorContext);
      
      // Return last valid score or default score (Requirement 17.4)
      const lastValidScore = this.lastValidScores.get(participantId);
      
      if (lastValidScore) {
        console.log('[Scoring] Using last valid score for participant:', {
          participantId,
          lastValidScore: lastValidScore.totalPoints,
        });
        return lastValidScore;
      }
      
      // Return zero score if no previous valid score exists
      console.log('[Scoring] No previous valid score, returning zero score for participant:', participantId);
      return {
        basePoints: 0,
        speedBonus: 0,
        streakBonus: 0,
        partialCredit: 0,
        totalPoints: 0,
        isCorrect: false,
      };
    }
  }

  /**
   * Get answer from Redis buffer
   * 
   * @param sessionId - Session ID
   * @param answerId - Answer ID
   * @returns Answer object or null if not found
   */
  private async getAnswerFromBuffer(
    sessionId: string,
    answerId: string
  ): Promise<any | null> {
    const redis = redisService.getClient();
    const bufferKey = `session:${sessionId}:answers:buffer`;

    // Get all answers from buffer
    const answers = await redis.lrange(bufferKey, 0, -1);

    // Find the answer with matching ID
    for (const answerJson of answers) {
      const answer = JSON.parse(answerJson);
      if (answer.answerId === answerId) {
        return answer;
      }
    }

    return null;
  }

  /**
   * Get question details from MongoDB
   * 
   * @param sessionId - Session ID
   * @param questionId - Question ID
   * @returns Question object or null if not found
   */
  private async getQuestion(
    sessionId: string,
    questionId: string
  ): Promise<Question | null> {
    try {
      const db = mongodbService.getDb();
      const sessionsCollection = db.collection('sessions');

      // Get session to find quiz ID
      const session = await sessionsCollection.findOne({ sessionId });

      if (!session) {
        console.error('[Scoring Service] Session not found:', sessionId);
        return null;
      }

      // Get quiz with questions
      const quizzesCollection = db.collection('quizzes');
      const quiz = await quizzesCollection.findOne({ _id: session.quizId });

      if (!quiz) {
        console.error('[Scoring Service] Quiz not found:', session.quizId);
        return null;
      }

      // Find question in quiz
      const question = quiz.questions.find((q: Question) => q.questionId === questionId);

      if (!question) {
        console.error('[Scoring Service] Question not found in quiz:', questionId);
        return null;
      }

      return question;
    } catch (error) {
      console.error('[Scoring Service] Error getting question:', error);
      return null;
    }
  }

  /**
   * Calculate score for an answer
   * 
   * Calculates:
   * - Base points for correct answers
   * - Speed bonus (base × multiplier × time factor)
   * - Streak bonus for consecutive correct answers
   * - Partial credit for multi-correct questions
   * 
   * Requirements: 6.1, 6.2, 6.3, 6.4
   * 
   * @param answer - Answer submission
   * @param question - Question details
   * @param participantId - Participant ID
   * @param sessionId - Session ID
   * @returns Score calculation breakdown
   */
  private async calculateScore(
    answer: any,
    question: Question,
    participantId: string,
    sessionId: string
  ): Promise<ScoreCalculation> {
    // Get correct options
    const correctOptions = question.options
      .filter((opt) => opt.isCorrect)
      .map((opt) => opt.optionId);

    // Check if answer is correct
    const selectedOptions = answer.selectedOptions || [];
    const isFullyCorrect = this.isAnswerCorrect(selectedOptions, correctOptions);

    // Calculate base points
    let basePoints = 0;
    if (isFullyCorrect) {
      basePoints = question.scoring.basePoints;
    }

    // Calculate partial credit if enabled
    let partialCredit = 0;
    if (question.scoring.partialCreditEnabled && !isFullyCorrect) {
      partialCredit = this.calculatePartialCredit(
        selectedOptions,
        correctOptions,
        question.scoring.basePoints
      );
    }

    // Calculate speed bonus if answer is correct
    let speedBonus = 0;
    if (isFullyCorrect && question.scoring.speedBonusMultiplier > 0) {
      speedBonus = this.calculateSpeedBonus(
        answer.responseTimeMs,
        question.timeLimit,
        question.scoring.basePoints,
        question.scoring.speedBonusMultiplier
      );
    }

    // Calculate streak bonus if answer is correct
    let streakBonus = 0;
    if (isFullyCorrect) {
      streakBonus = await this.calculateStreakBonus(
        participantId,
        sessionId,
        question.scoring.basePoints
      );
    }

    // Calculate total points
    const totalPoints = basePoints + partialCredit + speedBonus + streakBonus;

    return {
      basePoints,
      speedBonus,
      streakBonus,
      partialCredit,
      totalPoints,
      isCorrect: isFullyCorrect,
    };
  }

  /**
   * Check if answer is correct
   * 
   * @param selectedOptions - Selected option IDs
   * @param correctOptions - Correct option IDs
   * @returns True if answer is fully correct
   */
  private isAnswerCorrect(selectedOptions: string[], correctOptions: string[]): boolean {
    if (selectedOptions.length !== correctOptions.length) {
      return false;
    }

    const selectedSet = new Set(selectedOptions);
    const correctSet = new Set(correctOptions);

    for (const option of selectedOptions) {
      if (!correctSet.has(option)) {
        return false;
      }
    }

    for (const option of correctOptions) {
      if (!selectedSet.has(option)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate partial credit for multi-correct questions
   * 
   * Formula: (K/N) × base points
   * Where K = number of correct options selected
   *       N = total number of correct options
   * 
   * Only awards partial credit if:
   * - No incorrect options are selected
   * - At least one correct option is selected
   * 
   * Requirement: 6.4
   * 
   * @param selectedOptions - Selected option IDs
   * @param correctOptions - Correct option IDs
   * @param basePoints - Base points for question
   * @returns Partial credit points
   */
  private calculatePartialCredit(
    selectedOptions: string[],
    correctOptions: string[],
    basePoints: number
  ): number {
    // Check if any incorrect options are selected
    const correctSet = new Set(correctOptions);
    const hasIncorrectOptions = selectedOptions.some((opt) => !correctSet.has(opt));

    if (hasIncorrectOptions) {
      return 0; // No partial credit if incorrect options selected
    }

    // Count how many correct options are selected
    const correctSelectedCount = selectedOptions.filter((opt) => correctSet.has(opt)).length;

    if (correctSelectedCount === 0) {
      return 0; // No partial credit if no correct options selected
    }

    // Calculate partial credit: (K/N) × base points
    const partialCredit = (correctSelectedCount / correctOptions.length) * basePoints;

    return Math.round(partialCredit);
  }

  /**
   * Calculate speed bonus
   * 
   * Formula: base × multiplier × time factor
   * Where time factor = 1.0 - (responseTime / timeLimit)
   * 
   * Time factor decreases linearly from 1.0 at question start to 0.0 at timer expiration
   * 
   * Requirement: 6.2
   * 
   * @param responseTimeMs - Response time in milliseconds
   * @param timeLimitSeconds - Time limit in seconds
   * @param basePoints - Base points for question
   * @param speedBonusMultiplier - Speed bonus multiplier (0-1)
   * @returns Speed bonus points
   */
  private calculateSpeedBonus(
    responseTimeMs: number,
    timeLimitSeconds: number,
    basePoints: number,
    speedBonusMultiplier: number
  ): number {
    const timeLimitMs = timeLimitSeconds * 1000;

    // Calculate time factor (1.0 at start, 0.0 at end)
    const timeFactor = Math.max(0, 1.0 - responseTimeMs / timeLimitMs);

    // Calculate speed bonus
    const speedBonus = basePoints * speedBonusMultiplier * timeFactor;

    return Math.round(speedBonus);
  }

  /**
   * Calculate streak bonus for consecutive correct answers
   * 
   * Streak bonus is applied after the first correct answer
   * Formula: base points × 0.1 × (streak count - 1)
   * 
   * Requirement: 6.3
   * 
   * @param participantId - Participant ID
   * @param basePoints - Base points for question
   * @returns Streak bonus points
   */
  private async calculateStreakBonus(
    participantId: string,
    _sessionId: string,
    basePoints: number
  ): Promise<number> {
    try {
      // Get current streak count from Redis
      const participantSession = await redisDataStructuresService.getParticipantSession(
        participantId
      );

      if (!participantSession) {
        return 0;
      }

      const currentStreak = participantSession.streakCount || 0;

      // Increment streak count
      const newStreak = currentStreak + 1;

      // Update streak count in Redis
      await redisDataStructuresService.updateParticipantStreak(participantId, newStreak);

      // Calculate streak bonus (only after first correct answer)
      if (newStreak <= 1) {
        return 0; // No bonus for first correct answer
      }

      const streakBonus = basePoints * 0.1 * (newStreak - 1);

      return Math.round(streakBonus);
    } catch (error) {
      console.error('[Scoring Service] Error calculating streak bonus:', error);
      return 0;
    }
  }

  /**
   * Update participant score in Redis
   * 
   * @param participantId - Participant ID
   * @param scoreCalculation - Score calculation breakdown
   */
  private async updateParticipantScore(
    participantId: string,
    _sessionId: string,
    scoreCalculation: ScoreCalculation
  ): Promise<void> {
    try {
      const redis = redisService.getClient();
      const participantKey = `participant:${participantId}:session`;

      // Get current score
      const participantSession = await redisDataStructuresService.getParticipantSession(
        participantId
      );

      if (!participantSession) {
        console.error('[Scoring Service] Participant session not found:', participantId);
        return;
      }

      const currentScore = participantSession.totalScore || 0;

      // Calculate new score
      const newScore = currentScore + scoreCalculation.totalPoints;

      // Update participant score in Redis
      await redis.hset(participantKey, {
        totalScore: newScore.toString(),
        lastQuestionScore: scoreCalculation.totalPoints.toString(),
      });

      console.log('[Scoring Service] Updated participant score:', {
        participantId,
        oldScore: currentScore,
        newScore,
        pointsAdded: scoreCalculation.totalPoints,
      });
    } catch (error) {
      console.error('[Scoring Service] Error updating participant score:', error);
    }
  }

  /**
   * Update leaderboard in Redis
   * 
   * Uses sorted set with score as totalScore - (totalTimeMs / 1000000000)
   * This ensures tie-breaking by time (lower time ranks higher)
   * 
   * Requirement: 6.5, 6.6
   * 
   * @param participantId - Participant ID
   * @param sessionId - Session ID
   */
  private async updateLeaderboard(
    participantId: string,
    sessionId: string
  ): Promise<void> {
    try {
      const redis = redisService.getClient();
      const leaderboardKey = `session:${sessionId}:leaderboard`;

      // Get participant score and time
      const participantSession = await redisDataStructuresService.getParticipantSession(
        participantId
      );

      if (!participantSession) {
        console.error('[Scoring Service] Participant session not found:', participantId);
        return;
      }

      const totalScore = participantSession.totalScore || 0;
      const totalTimeMs = participantSession.totalTimeMs || 0;

      // Calculate leaderboard score with tie-breaker
      // Higher score = better, lower time = better
      // Formula: totalScore - (totalTimeMs / 1000000000)
      const leaderboardScore = totalScore - totalTimeMs / 1000000000;

      // Update leaderboard sorted set
      await redis.zadd(leaderboardKey, leaderboardScore, participantId);

      console.log('[Scoring Service] Updated leaderboard:', {
        participantId,
        totalScore,
        totalTimeMs,
        leaderboardScore,
      });
    } catch (error) {
      console.error('[Scoring Service] Error updating leaderboard:', error);
    }
  }

  /**
   * Broadcast score update to participant
   * 
   * Sends score_updated event with current score, rank, and streak
   * 
   * Requirement: 6.8
   * 
   * @param participantId - Participant ID
   * @param sessionId - Session ID
   */
  private async broadcastScoreUpdate(
    participantId: string,
    sessionId: string
  ): Promise<void> {
    try {
      // Get participant score and rank
      const participantSession = await redisDataStructuresService.getParticipantSession(
        participantId
      );

      if (!participantSession) {
        console.error('[Scoring Service] Participant session not found:', participantId);
        return;
      }

      // Get rank from leaderboard
      const redis = redisService.getClient();
      const leaderboardKey = `session:${sessionId}:leaderboard`;
      
      const rank = await redis.zrevrank(leaderboardKey, participantId);
      const totalParticipants = await redis.zcard(leaderboardKey);

      // Broadcast score update to participant
      await pubSubService.publishToParticipant(
        participantId,
        'score_updated',
        {
          participantId,
          totalScore: participantSession.totalScore || 0,
          rank: rank !== null ? rank + 1 : null, // Convert 0-based to 1-based
          totalParticipants,
          streakCount: participantSession.streakCount || 0,
        }
      );

      console.log('[Scoring Service] Broadcasted score update:', {
        participantId,
        totalScore: participantSession.totalScore,
        rank: rank !== null ? rank + 1 : null,
      });
    } catch (error) {
      console.error('[Scoring Service] Error broadcasting score update:', error);
    }
  }

  /**
   * Start batch flush interval
   * 
   * Flushes answer batch to MongoDB every 1 second
   */
  private startBatchFlushInterval(): void {
    this.batchFlushInterval = setInterval(async () => {
      if (this.answerBatch.length > 0) {
        await this.flushAnswerBatch();
      }
    }, this.BATCH_FLUSH_INTERVAL_MS);

    console.log('[Scoring Service] Batch flush interval started');
  }

  /**
   * Flush answer batch to MongoDB
   * 
   * Batch inserts all pending answers to MongoDB
   * 
   * Requirement: 11.4
   */
  private async flushAnswerBatch(): Promise<void> {
    if (this.answerBatch.length === 0) {
      return;
    }

    try {
      console.log('[Scoring Service] Flushing answer batch to MongoDB:', {
        batchSize: this.answerBatch.length,
      });

      const db = mongodbService.getDb();
      const answersCollection = db.collection('answers');

      // Batch insert answers
      await answersCollection.insertMany(this.answerBatch);

      console.log('[Scoring Service] Answer batch flushed successfully:', {
        batchSize: this.answerBatch.length,
      });

      // Clear batch
      this.answerBatch = [];
    } catch (error) {
      console.error('[Scoring Service] Error flushing answer batch:', error);
      // Keep answers in batch for retry on next flush
    }
  }

  /**
   * Stop the scoring worker
   * 
   * Flushes remaining answers, clears intervals, and cleans up caches
   */
  async stop(): Promise<void> {
    console.log('[Scoring Service] Stopping scoring worker...');

    // Unsubscribe from all channels
    if (this.subscriber) {
      for (const sessionId of this.subscribedSessions) {
        await this.unsubscribeFromSession(sessionId);
      }
      this.subscriber.removeAllListeners();
      this.subscriber = null;
    }

    // Clear batch flush interval
    if (this.batchFlushInterval) {
      clearInterval(this.batchFlushInterval);
      this.batchFlushInterval = null;
    }

    // Flush remaining answers
    await this.flushAnswerBatch();

    // Clear last valid scores cache
    this.lastValidScores.clear();
    console.log('[Scoring Service] Cleared last valid scores cache');

    console.log('[Scoring Service] Scoring worker stopped');
  }
}

// Export singleton instance
export const scoringService = new ScoringService();
