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
    
    const endTimer = performanceLoggingService.startTimer('scoring_calculation');
    
    try {
      scoringMessage = JSON.parse(message);

      // Get answer from Redis hash (O(1) lookup)
      const answer = await this.getAnswerFromBuffer(
        scoringMessage!.sessionId,
        scoringMessage!.answerId
      );

      if (!answer) {
        return;
      }

      // Get question details (cached after first fetch per round)
      const question = await this.getQuestion(scoringMessage!.sessionId, scoringMessage!.questionId);

      if (!question) {
        return;
      }

      // Fetch participant session ONCE and pass through
      const participantSession = await redisDataStructuresService.getParticipantSession(
        scoringMessage!.participantId
      );

      if (!participantSession) {
        return;
      }

      // Calculate score with error recovery
      const scoreCalculation = await this.calculateScoreWithRecovery(
        answer,
        question,
        scoringMessage!.participantId,
        scoringMessage!.sessionId,
        scoringMessage!.answerId,
        scoringMessage!.questionId,
        participantSession
      );

      // Update participant score in Redis
      await this.updateParticipantScore(
        scoringMessage!.participantId,
        scoringMessage!.sessionId,
        scoreCalculation,
        participantSession
      );

      // Update leaderboard in Redis (reuse participantSession after score update)
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
        negativeDeductionApplied: scoreCalculation.negativeDeduction,
      };

      this.answerBatch.push(enrichedAnswer);

      if (this.answerBatch.length >= this.BATCH_SIZE) {
        await this.flushAnswerBatch();
      }

      // Broadcast answer result + score update in parallel (fire-and-forget)
      Promise.all([
        this.broadcastAnswerResult(
          scoringMessage!.participantId,
          scoringMessage!.questionId,
          scoreCalculation
        ),
        this.broadcastScoreUpdate(
          scoringMessage!.participantId,
          scoringMessage!.sessionId
        ),
      ]).catch(() => { /* ignore broadcast errors */ });
      
      endTimer();
    } catch (error) {
      endTimer();
      
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
    questionId: string,
    participantSession: any
  ): Promise<ScoreCalculation> {
    try {
      const score = await this.calculateScore(
        answer,
        question,
        participantId,
        sessionId,
        participantSession
      );
      
      this.lastValidScores.set(participantId, score);
      
      return score;
    } catch (error) {
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
      
      const lastValidScore = this.lastValidScores.get(participantId);
      
      if (lastValidScore) {
        return lastValidScore;
      }
      
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
   * Get answer from Redis hash (O(1) lookup).
   * Falls back to list scan if hash entry not found (backward compat).
   */
  private async getAnswerFromBuffer(
    sessionId: string,
    answerId: string
  ): Promise<any | null> {
    const redis = redisService.getClient();
    
    // Try O(1) hash lookup first
    const hashKey = `session:${sessionId}:answers:hash`;
    const answerJson = await redis.hget(hashKey, answerId);
    if (answerJson) {
      return JSON.parse(answerJson);
    }

    // Fallback: scan the list (for answers written before this optimization)
    const bufferKey = `session:${sessionId}:answers:buffer`;
    const answers = await redis.lrange(bufferKey, 0, -1);
    for (const json of answers) {
      const answer = JSON.parse(json);
      if (answer.answerId === answerId) {
        return answer;
      }
    }

    return null;
  }

  /**
   * Get question details from MongoDB (cached per round).
   * Same question is fetched once and reused for all 100+ participants.
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
      const session = await sessionsCollection.findOne({ sessionId });

      if (!session) return null;

      const quizzesCollection = db.collection('quizzes');
      const quiz = await quizzesCollection.findOne({ _id: session.quizId });

      if (!quiz) return null;

      const question = quiz.questions.find((q: Question) => q.questionId === questionId);
      if (!question) return null;

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
    sessionId: string,
    participantSession: any
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
        question.scoring.basePoints,
        participantSession
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
        question.scoring.basePoints,
        participantSession
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
    basePoints: number,
    participantSession: any
  ): Promise<number> {
    try {
      if (!participantSession) {
        return 0;
      }

      const currentStreak = participantSession.streakCount || 0;
      const newStreak = currentStreak + 1;

      await redisDataStructuresService.updateParticipantStreak(participantId, newStreak);

      if (newStreak <= 1) {
        return 0;
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
    _participantId: string,
    basePoints: number,
    participantSession: any
  ): Promise<number> {
    try {
      // Check exam mode cache first
      let examMode = this.examModeCache.get(sessionId);
      
      if (!examMode) {
        // Fetch from MongoDB and cache
        const db = mongodbService.getDb();
        const sessionsCollection = db.collection('sessions');
        const session = await sessionsCollection.findOne({ sessionId });

        if (!session || !session.examMode || !session.examMode.negativeMarkingEnabled) {
          this.examModeCache.set(sessionId, { negativeMarkingEnabled: false, negativeMarkingPercentage: 0 });
          return 0;
        }

        examMode = {
          negativeMarkingEnabled: session.examMode.negativeMarkingEnabled,
          negativeMarkingPercentage: session.examMode.negativeMarkingPercentage || 0,
        };
        this.examModeCache.set(sessionId, examMode);
      }

      if (!examMode.negativeMarkingEnabled || examMode.negativeMarkingPercentage <= 0) {
        return 0;
      }

      const deduction = Math.floor(basePoints * examMode.negativeMarkingPercentage / 100);

      if (!participantSession) {
        return deduction;
      }

      const currentScore = participantSession.totalScore || 0;
      return Math.min(deduction, currentScore);
    } catch (error) {
      console.error('[Scoring Service] Error calculating negative deduction:', error);
      return 0;
    }
  }

  /**
   * Update participant score in Redis
   * 
   * Ensures score never goes below zero (Requirement 12.4)
   * 
   * @param participantId - Participant ID
   * @param scoreCalculation - Score calculation breakdown
   */
  private async updateParticipantScore(
    participantId: string,
    _sessionId: string,
    scoreCalculation: ScoreCalculation,
    participantSession: any
  ): Promise<void> {
    try {
      const redis = redisService.getClient();
      const participantKey = `participant:${participantId}:session`;

      if (!participantSession) {
        return;
      }

      const currentScore = participantSession.totalScore || 0;
      const newScore = Math.max(0, currentScore + scoreCalculation.totalPoints);

      await redis.hset(participantKey, {
        totalScore: newScore.toString(),
        lastQuestionScore: scoreCalculation.totalPoints.toString(),
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

      // Re-fetch participant session to get updated score after updateParticipantScore
      const participantSession = await redisDataStructuresService.getParticipantSession(
        participantId
      );

      if (!participantSession) {
        return;
      }

      const totalScore = participantSession.totalScore || 0;
      const totalTimeMs = participantSession.totalTimeMs || 0;
      const leaderboardScore = totalScore - totalTimeMs / 1000000000;

      await redis.zadd(leaderboardKey, leaderboardScore, participantId);
    } catch (error) {
      console.error('[Scoring Service] Error updating leaderboard:', error);
    }
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
      const participantSession = await redisDataStructuresService.getParticipantSession(
        participantId
      );

      if (!participantSession) {
        return;
      }

      const redis = redisService.getClient();
      const leaderboardKey = `session:${sessionId}:leaderboard`;
      
      const [rank, totalParticipants] = await Promise.all([
        redis.zrevrank(leaderboardKey, participantId),
        redis.zcard(leaderboardKey),
      ]);

      await pubSubService.publishToParticipant(
        participantId,
        'score_updated',
        {
          participantId,
          totalScore: participantSession.totalScore || 0,
          rank: rank !== null ? rank + 1 : null,
          totalParticipants,
          streakCount: participantSession.streakCount || 0,
        }
      );
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

    // Flush remaining answers
    await this.flushAnswerBatch();

    // Clear last valid scores cache
    this.lastValidScores.clear();
    this.questionCache.clear();
    this.examModeCache.clear();

    console.log('[Scoring Service] Scoring worker stopped');
  }
}

// Export singleton instance
export const scoringService = new ScoringService();
