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

/** Maximum number of entries in the lastValidScores LRU cache */
const MAX_LAST_VALID_SCORES = 10000;

/** Redis key for the MongoDB sync retry queue (Issue #6) */
const SYNC_RETRY_KEY = 'scoring:sync:retry';

/** Maximum number of retries for a failed sync operation */
const SYNC_RETRY_MAX = 5;

/** Interval in ms for the sync retry worker */
const SYNC_RETRY_INTERVAL_MS = 30000; // 30 seconds

interface SyncRetryItem {
  participantId: string;
  totalScore: number;
  totalTimeMs: number;
  timestamp: number;
  retryCount: number;
}

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
  /** Negative marking deduction for incorrect answers */
  negativeDeduction: number;
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

  /** Interval timer for the sync retry worker (Issue #6) */
  private syncRetryInterval: NodeJS.Timeout | null = null;

  /**
   * In-memory question cache to avoid hitting MongoDB for the same question 100+ times per round.
   * Key: `${sessionId}:${questionId}`, Value: Question
   * Cleared when a new question starts (via clearQuestionCache).
   */
  private questionCache: Map<string, Question> = new Map();

  /**
   * In-memory session exam-mode cache to avoid hitting MongoDB per answer for negative marking config.
   * Key: sessionId, Value: { negativeMarkingEnabled, negativeMarkingPercentage }
   * Cleared per session end.
   */
  private examModeCache: Map<string, { negativeMarkingEnabled: boolean; negativeMarkingPercentage: number }> = new Map();

  /**
   * Start the scoring worker
   * 
   * Creates a dedicated Redis subscriber to avoid message handler conflicts
   * with other services (e.g., pubSubService) that share the default subscriber.
   */
  async start(): Promise<void> {
    console.log('[Scoring Service] Starting scoring worker...');

    // Create a dedicated subscriber so scoring messages are isolated
    // from other pub/sub traffic (system_metrics, state changes, etc.)
    this.subscriber = await redisService.createDedicatedSubscriber('scoring');

    // Set up message handler
    this.subscriber.on('message', async (_channel: string, message: string) => {
      await this.processScoringMessage(message);
    });

    // Start batch flush interval
    this.startBatchFlushInterval();

    // Start the sync retry worker (Issue #6)
    this.startSyncRetryWorker();

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
    const score = this.lastValidScores.get(participantId);
    if (score !== undefined) {
      // LRU access update: delete and re-insert to move to end
      this.lastValidScores.delete(participantId);
      this.lastValidScores.set(participantId, score);
    }
    return score;
  }

  /**
   * Clear question cache (call when a new question starts or round ends)
   */
  clearQuestionCache(): void {
    this.questionCache.clear();
  }

  /**
   * Clear exam mode cache for a session
   */
  clearExamModeCache(sessionId?: string): void {
    if (sessionId) {
      this.examModeCache.delete(sessionId);
    } else {
      this.examModeCache.clear();
    }
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

      // Fire-and-forget MongoDB score sync (best-effort, non-blocking)
      // Ensures MongoDB has a reasonably recent score as fallback if Redis data is lost
      this.syncScoreToMongoDB(scoringMessage!.participantId);

      // Add answer to batch for MongoDB persistence
      const enrichedAnswer: Answer = {
        ...answer,
        isCorrect: scoreCalculation.isCorrect,
        pointsAwarded: scoreCalculation.totalPoints,
        speedBonusApplied: scoreCalculation.speedBonus,
        streakBonusApplied: scoreCalculation.streakBonus,
        partialCreditApplied: scoreCalculation.partialCredit > 0,
        negativeDeductionApplied: scoreCalculation.negativeDeduction,
      };

      this.answerBatch.push(enrichedAnswer);

      // Flush batch if size limit reached
      if (this.answerBatch.length >= this.BATCH_SIZE) {
        await this.flushAnswerBatch();
      }

      // Broadcast answer result to participant (for personal result display)
      await this.broadcastAnswerResult(
        scoringMessage!.participantId,
        scoringMessage!.questionId,
        scoreCalculation
      );

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
      
      // LRU eviction: delete first to move to end on re-insert
      this.lastValidScores.delete(participantId);
      
      // Evict oldest entry if at capacity
      if (this.lastValidScores.size >= MAX_LAST_VALID_SCORES) {
        const oldestKey = this.lastValidScores.keys().next().value;
        if (oldestKey !== undefined) {
          this.lastValidScores.delete(oldestKey);
        }
      }
      
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
        negativeDeduction: 0,
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
    const cacheKey = `${sessionId}:${questionId}`;
    const cached = this.questionCache.get(cacheKey);
    if (cached) return cached;

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

      // Cache for this round
      this.questionCache.set(cacheKey, question);
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
    } else {
      // Reset streak on wrong answer
      await redisDataStructuresService.updateParticipantStreak(participantId, 0);
    }

    // Calculate negative marking deduction for incorrect answers
    // Requirements: 12.2, 12.3, 12.4
    let negativeDeduction = 0;
    if (!isFullyCorrect && partialCredit === 0) {
      // Only apply negative marking if answer is fully incorrect (no partial credit)
      negativeDeduction = await this.calculateNegativeDeduction(
        sessionId,
        participantId,
        question.scoring.basePoints
      );
    }

    // Calculate total points (deduction is subtracted)
    const totalPoints = basePoints + partialCredit + speedBonus + streakBonus - negativeDeduction;

    return {
      basePoints,
      speedBonus,
      streakBonus,
      partialCredit,
      negativeDeduction,
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
   * Calculate negative marking deduction for incorrect answers
   * 
   * Formula: basePoints × negativeMarkingPercentage / 100
   * 
   * The deduction is applied when:
   * - Negative marking is enabled for the session (examMode.negativeMarkingEnabled)
   * - The answer is incorrect (no partial credit awarded)
   * 
   * The resulting participant score is floored at zero to prevent negative scores.
   * 
   * Requirements: 12.2, 12.3, 12.4
   * 
   * @param sessionId - Session ID to get exam mode config
   * @param participantId - Participant ID to check current score for floor calculation
   * @param basePoints - Base points for the question
   * @returns Negative deduction points (always >= 0)
   */
  private async calculateNegativeDeduction(
    sessionId: string,
    participantId: string,
    basePoints: number
  ): Promise<number> {
    try {
      // Get session to check exam mode configuration
      const db = mongodbService.getDb();
      const sessionsCollection = db.collection('sessions');
      const session = await sessionsCollection.findOne({ sessionId });

      if (!session) {
        console.error('[Scoring Service] Session not found for negative marking:', sessionId);
        return 0;
      }

      // Check if negative marking is enabled
      const examMode = session.examMode;
      if (!examMode || !examMode.negativeMarkingEnabled) {
        return 0; // Negative marking not enabled
      }

      const negativeMarkingPercentage = examMode.negativeMarkingPercentage || 0;
      if (negativeMarkingPercentage <= 0) {
        return 0; // No deduction if percentage is 0 or negative
      }

      // Calculate deduction: basePoints × negativeMarkingPercentage / 100
      // Requirement 12.3
      const deduction = Math.floor(basePoints * negativeMarkingPercentage / 100);

      // Get current participant score to ensure we don't go below zero
      // Requirement 12.4
      const participantSession = await redisDataStructuresService.getParticipantSession(
        participantId
      );

      if (!participantSession) {
        return deduction; // Return full deduction, floor will be applied in updateParticipantScore
      }

      const currentScore = participantSession.totalScore || 0;

      // Cap deduction so score doesn't go below zero
      // Requirement 12.4: Ensure participant scores do not go below zero
      const cappedDeduction = Math.min(deduction, currentScore);

      console.log('[Scoring Service] Calculated negative marking deduction:', {
        sessionId,
        participantId,
        basePoints,
        negativeMarkingPercentage,
        calculatedDeduction: deduction,
        currentScore,
        cappedDeduction,
      });

      return cappedDeduction;
    } catch (error) {
      console.error('[Scoring Service] Error calculating negative deduction:', error);
      return 0; // Return 0 on error to avoid penalizing participant
    }
  }

  /**
   * Update participant score in Redis
   * 
   * Ensures score never goes below zero (Requirement 12.4)
   * When the participant session has expired, attempts to restore it from
   * MongoDB and the Redis leaderboard sorted set before giving up.
   * 
   * Requirements: 2.2, 2.4, 3.2, 3.5
   * 
   * @param participantId - Participant ID
   * @param sessionId - Session ID
   * @param scoreCalculation - Score calculation breakdown
   */
  private async updateParticipantScore(
    participantId: string,
    sessionId: string,
    scoreCalculation: ScoreCalculation
  ): Promise<void> {
    try {
      const redis = redisService.getClient();
      const participantKey = `participant:${participantId}:session`;

      // Get current score
      let participantSession = await redisDataStructuresService.getParticipantSession(
        participantId
      );

      if (!participantSession) {
        // Session expired — attempt to restore from MongoDB and leaderboard
        console.warn('[Scoring Service] Participant session expired, attempting restoration:', participantId);

        const restored = await this.restoreParticipantSession(participantId, sessionId);
        if (!restored) {
          console.error('[Scoring Service] Failed to restore participant session:', participantId);
          return;
        }

        // Re-fetch the restored session
        participantSession = await redisDataStructuresService.getParticipantSession(participantId);
        if (!participantSession) {
          console.error('[Scoring Service] Participant session not found after restoration:', participantId);
          return;
        }

        console.log('[Scoring Service] Participant session restored successfully:', {
          participantId,
          restoredScore: participantSession.totalScore,
        });
      }

      const currentScore = participantSession.totalScore || 0;

      // Calculate new score and ensure it doesn't go below zero (Requirement 12.4)
      const newScore = Math.max(0, currentScore + scoreCalculation.totalPoints);

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
        negativeDeduction: scoreCalculation.negativeDeduction,
      });
    } catch (error) {
      console.error('[Scoring Service] Error updating participant score:', error);
    }
  }

  /**
   * Restore a participant's Redis session from MongoDB and the leaderboard sorted set.
   * 
   * When a participant's Redis session expires during an active quiz, this method
   * reconstructs it using the best available data:
   * 1. Query MongoDB participants collection for participant data
   * 2. Check the Redis leaderboard sorted set for the last known score
   * 3. Use Math.max(mongoScore, leaderboardDerivedScore) as the restored totalScore
   * 4. Recreate the Redis session and set the 30-min active quiz TTL
   * 
   * @param participantId - Participant ID to restore
   * @param sessionId - Session ID for leaderboard lookup
   * @returns true if restoration succeeded, false otherwise
   */
  private async restoreParticipantSession(
    participantId: string,
    sessionId: string
  ): Promise<boolean> {
    try {
      // Query MongoDB for participant data
      const participantsCollection = mongodbService.getCollection('participants');
      const mongoParticipant = await participantsCollection.findOne({ participantId, sessionId });

      if (!mongoParticipant) {
        console.error('[Scoring Service] Participant not found in MongoDB for restoration:', participantId);
        return false;
      }

      // Check the Redis leaderboard sorted set for the participant's last known score
      const leaderboardKey = `session:${sessionId}:leaderboard`;
      const leaderboardScoreStr = await redisService.getClient().zscore(leaderboardKey, participantId);

      let leaderboardDerivedScore = 0;
      if (leaderboardScoreStr !== null) {
        // Leaderboard score formula: totalScore - totalTimeMs / 1e9
        // Math.floor avoids inflating scores (Issue #7)
        leaderboardDerivedScore = Math.floor(parseFloat(leaderboardScoreStr));
      }

      // Use the best available score
      const restoredTotalScore = Math.max(mongoParticipant.totalScore || 0, leaderboardDerivedScore);

      // Recreate the Redis participant session
      await redisDataStructuresService.setParticipantSession(participantId, {
        sessionId,
        nickname: mongoParticipant.nickname,
        totalScore: restoredTotalScore,
        totalTimeMs: mongoParticipant.totalTimeMs || 0,
        streakCount: mongoParticipant.streakCount || 0,
        isActive: mongoParticipant.isActive !== false,
        isEliminated: mongoParticipant.isEliminated || false,
      });

      // Set the 30-min active quiz TTL instead of the default 5-min
      await redisDataStructuresService.refreshParticipantSessionForActiveQuiz(participantId);

      console.log('[Scoring Service] Restored participant session from MongoDB/leaderboard:', {
        participantId,
        sessionId,
        mongoScore: mongoParticipant.totalScore || 0,
        leaderboardDerivedScore,
        restoredTotalScore,
      });

      return true;
    } catch (error) {
      console.error('[Scoring Service] Error restoring participant session:', error);
      return false;
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
   * Fire-and-forget sync of participant score to MongoDB
   * 
   * Updates the MongoDB participant record with the current totalScore and totalTimeMs
   * from Redis. This ensures MongoDB always has a reasonably recent score, making it
   * a viable fallback if Redis data is lost.
   * 
   * Uses fire-and-forget pattern to avoid blocking the scoring pipeline.
   * On failure, pushes to a Redis retry queue for later retry (Issue #6).
   * 
   * @param participantId - Participant ID to sync
   */
  private syncScoreToMongoDB(participantId: string): void {
    redisDataStructuresService.getParticipantSession(participantId)
      .then((participantSession) => {
        if (!participantSession) {
          return;
        }

        const totalScore = participantSession.totalScore || 0;
        const totalTimeMs = participantSession.totalTimeMs || 0;

        const participantsCollection = mongodbService.getCollection('participants');
        return participantsCollection.updateOne(
          { participantId },
          { $set: { totalScore, totalTimeMs } }
        ).then(() => {
          // Success — no action needed
        }).catch(async (error) => {
          // Push to retry queue on failure (Issue #6)
          console.error('[Scoring Service] Error syncing score to MongoDB, queuing for retry:', {
            participantId,
            error: error instanceof Error ? error.message : String(error),
          });

          const retryItem: SyncRetryItem = {
            participantId,
            totalScore,
            totalTimeMs,
            timestamp: Date.now(),
            retryCount: 0,
          };

          try {
            const redis = redisService.getClient();
            await redis.lpush(SYNC_RETRY_KEY, JSON.stringify(retryItem));
          } catch (redisError) {
            console.error('[Scoring Service] Failed to push sync retry item to Redis:', {
              participantId,
              error: redisError instanceof Error ? redisError.message : String(redisError),
            });
          }
        });
      })
      .catch(async (error) => {
        console.error('[Scoring Service] Error syncing score to MongoDB (fire-and-forget):', {
          participantId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  /**
   * Start the sync retry worker (Issue #6)
   * 
   * Every 30 seconds, pops items from the Redis retry list and retries the MongoDB update.
   * On failure, re-pushes with incremented retryCount. Max 5 retries.
   */
  private startSyncRetryWorker(): void {
    this.syncRetryInterval = setInterval(async () => {
      try {
        const redis = redisService.getClient();
        const length = await redis.llen(SYNC_RETRY_KEY);

        if (length === 0) {
          return;
        }

        console.log('[Scoring Service] Sync retry worker processing:', { queueLength: length });

        // Process up to 50 items per cycle to avoid blocking
        const itemsToProcess = Math.min(length, 50);

        for (let i = 0; i < itemsToProcess; i++) {
          const itemJson = await redis.rpop(SYNC_RETRY_KEY);
          if (!itemJson) break;

          let item: SyncRetryItem;
          try {
            item = JSON.parse(itemJson);
          } catch {
            console.error('[Scoring Service] Invalid sync retry item, discarding:', itemJson);
            continue;
          }

          try {
            const participantsCollection = mongodbService.getCollection('participants');
            await participantsCollection.updateOne(
              { participantId: item.participantId },
              { $set: { totalScore: item.totalScore, totalTimeMs: item.totalTimeMs } }
            );

            console.log('[Scoring Service] Sync retry succeeded:', {
              participantId: item.participantId,
              retryCount: item.retryCount,
            });
          } catch (error) {
            // Re-push with incremented retryCount if under max
            if (item.retryCount < SYNC_RETRY_MAX) {
              item.retryCount++;
              await redis.lpush(SYNC_RETRY_KEY, JSON.stringify(item));
              console.warn('[Scoring Service] Sync retry failed, re-queued:', {
                participantId: item.participantId,
                retryCount: item.retryCount,
                error: error instanceof Error ? error.message : String(error),
              });
            } else {
              console.error('[Scoring Service] Sync retry exhausted max retries, discarding:', {
                participantId: item.participantId,
                retryCount: item.retryCount,
              });
            }
          }
        }
      } catch (error) {
        console.error('[Scoring Service] Sync retry worker error:', error);
      }
    }, SYNC_RETRY_INTERVAL_MS);

    console.log('[Scoring Service] Sync retry worker started');
  }

  /**
   * Broadcast answer result to participant
   * 
   * Sends answer_result event with points breakdown for the current question.
   * This allows the participant to see how many points they earned.
   * 
   * @param participantId - Participant ID
   * @param questionId - Question ID
   * @param scoreCalculation - Score calculation breakdown
   */
  private async broadcastAnswerResult(
    participantId: string,
    questionId: string,
    scoreCalculation: ScoreCalculation
  ): Promise<void> {
    try {
      await pubSubService.publishToParticipant(
        participantId,
        'answer_result',
        {
          questionId,
          isCorrect: scoreCalculation.isCorrect,
          pointsAwarded: scoreCalculation.basePoints + scoreCalculation.partialCredit,
          speedBonus: scoreCalculation.speedBonus,
          streakBonus: scoreCalculation.streakBonus,
          negativeDeduction: scoreCalculation.negativeDeduction,
          totalPoints: scoreCalculation.totalPoints,
        }
      );

      console.log('[Scoring Service] Broadcasted answer result:', {
        participantId,
        questionId,
        isCorrect: scoreCalculation.isCorrect,
        negativeDeduction: scoreCalculation.negativeDeduction,
        totalPoints: scoreCalculation.totalPoints,
      });
    } catch (error) {
      console.error('[Scoring Service] Error broadcasting answer result:', error);
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

    // Unsubscribe from all channels and disconnect the dedicated subscriber
    if (this.subscriber) {
      for (const sessionId of this.subscribedSessions) {
        await this.unsubscribeFromSession(sessionId);
      }
      this.subscriber.removeAllListeners();
      await this.subscriber.quit();
      this.subscriber = null;
    }

    // Clear batch flush interval
    if (this.batchFlushInterval) {
      clearInterval(this.batchFlushInterval);
      this.batchFlushInterval = null;
    }

    // Stop the sync retry worker (Issue #6)
    if (this.syncRetryInterval) {
      clearInterval(this.syncRetryInterval);
      this.syncRetryInterval = null;
      console.log('[Scoring Service] Sync retry worker stopped');
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
