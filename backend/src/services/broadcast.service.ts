/**
 * Broadcast Service
 * 
 * Handles broadcasting of session lifecycle events to connected clients:
 * - lobby_state: Broadcast lobby information to big screen and participants
 * - participant_joined: Broadcast when a new participant joins
 * - quiz_started: Broadcast when quiz starts
 * - quiz_ended: Broadcast when quiz ends
 * 
 * Requirements: 2.2, 12.8
 */

import { mongodbService } from './mongodb.service';
import { redisDataStructuresService } from './redis-data-structures.service';
import { redisService } from './redis.service';
import { pubSubService } from './pubsub.service';
import { quizTimerManager } from './quiz-timer.service';
import { metricsService } from './metrics.service';
import { performanceLoggingService } from './performance-logging.service';
import type { Session, Participant, Quiz, Answer } from '../models/types';

class BroadcastService {
  /**
   * Broadcast lobby_state to big screen and participants
   * 
   * Sends session information when the session is in LOBBY state:
   * - sessionId
   * - joinCode
   * - participantCount
   * - participants list (participantId, nickname)
   * 
   * This should be called:
   * - When a participant joins during LOBBY state
   * - When big screen or participant clients connect to a LOBBY session
   * 
   * @param sessionId - Session ID
   */
  async broadcastLobbyState(sessionId: string): Promise<void> {
    try {
      console.log('[Broadcast] Broadcasting lobby_state for session:', sessionId);

      // Get session from MongoDB
      const sessionsCollection = mongodbService.getCollection<Session>('sessions');
      const session = await mongodbService.withRetry(async () => {
        return await sessionsCollection.findOne({ sessionId });
      });

      if (!session) {
        console.error('[Broadcast] Session not found:', sessionId);
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Verify session is in LOBBY state
      // Check Redis first for most recent state, fallback to MongoDB
      const redisState = await redisDataStructuresService.getSessionState(sessionId);
      const currentState = redisState?.state || session.state;

      if (currentState !== 'LOBBY') {
        console.warn('[Broadcast] Session is not in LOBBY state:', {
          sessionId,
          currentState,
        });
        // Don't throw - just log warning and skip broadcast
        return;
      }

      // Get participants for this session
      const participantsCollection = mongodbService.getCollection<Participant>('participants');
      const participants = await mongodbService.withRetry(async () => {
        return await participantsCollection
          .find({ 
            sessionId,
            isActive: true, // Only include active participants
          })
          .sort({ joinedAt: 1 }) // Sort by join time
          .toArray();
      });

      // Format participant list
      const participantList = participants.map((p) => ({
        participantId: p.participantId,
        nickname: p.nickname,
      }));

      // Get participant count from Redis (most up-to-date)
      const participantCount = redisState?.participantCount ?? session.participantCount;

      // Prepare lobby_state payload
      const lobbyStatePayload = {
        sessionId,
        joinCode: session.joinCode,
        participantCount,
        participants: participantList,
        allowLateJoiners: session.allowLateJoiners ?? true,
      };

      console.log('[Broadcast] Lobby state payload:', {
        sessionId,
        participantCount,
        participantsInList: participantList.length,
        allowLateJoiners: session.allowLateJoiners ?? true,
      });

      // Broadcast to big screen channel
      await pubSubService.publishToBigScreen(
        sessionId,
        'lobby_state',
        lobbyStatePayload
      );

      // Broadcast to participants channel
      await pubSubService.publishToParticipants(
        sessionId,
        'lobby_state',
        lobbyStatePayload
      );

      // Broadcast to controller channel
      await pubSubService.publishToController(
        sessionId,
        'lobby_state',
        lobbyStatePayload
      );

      console.log('[Broadcast] Successfully broadcasted lobby_state for session:', sessionId);
    } catch (error) {
      console.error('[Broadcast] Error broadcasting lobby_state:', error);
      throw error;
    }
  }

  /**
   * Broadcast lobby_state to controller only
   * 
   * Called when controller connects to a LOBBY session.
   * Sends session information including join code and participants.
   * 
   * @param sessionId - Session ID
   */
  async broadcastLobbyStateToController(sessionId: string): Promise<void> {
    try {
      console.log('[Broadcast] Broadcasting lobby_state to controller for session:', sessionId);

      // Get session from MongoDB
      const sessionsCollection = mongodbService.getCollection<Session>('sessions');
      const session = await mongodbService.withRetry(async () => {
        return await sessionsCollection.findOne({ sessionId });
      });

      if (!session) {
        console.error('[Broadcast] Session not found:', sessionId);
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Get participants for this session
      const participantsCollection = mongodbService.getCollection<Participant>('participants');
      const participants = await mongodbService.withRetry(async () => {
        return await participantsCollection
          .find({ 
            sessionId,
            isActive: true,
          })
          .sort({ joinedAt: 1 })
          .toArray();
      });

      // Format participant list
      const participantList = participants.map((p) => ({
        participantId: p.participantId,
        nickname: p.nickname,
      }));

      // Get participant count from Redis (most up-to-date)
      const redisState = await redisDataStructuresService.getSessionState(sessionId);
      const participantCount = redisState?.participantCount ?? session.participantCount;

      // Get quiz to get total questions
      const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
      const quiz = await mongodbService.withRetry(async () => {
        return await quizzesCollection.findOne({ _id: session.quizId });
      });

      // Prepare lobby_state payload
      const lobbyStatePayload = {
        sessionId,
        joinCode: session.joinCode,
        participantCount,
        participants: participantList,
        totalQuestions: quiz?.questions?.length || 0,
        allowLateJoiners: session.allowLateJoiners ?? true,
      };

      console.log('[Broadcast] Lobby state payload for controller:', {
        sessionId,
        joinCode: session.joinCode,
        participantCount,
        participantsInList: participantList.length,
        totalQuestions: quiz?.questions?.length || 0,
        allowLateJoiners: session.allowLateJoiners ?? true,
      });

      // Broadcast to controller channel only
      await pubSubService.publishToController(
        sessionId,
        'lobby_state',
        lobbyStatePayload
      );

      console.log('[Broadcast] Successfully broadcasted lobby_state to controller for session:', sessionId);
    } catch (error) {
      console.error('[Broadcast] Error broadcasting lobby_state to controller:', error);
      throw error;
    }
  }

  /**
   * Broadcast participant_joined event
   * 
   * Called when a new participant joins the session.
   * If session is in LOBBY state, also broadcasts updated lobby_state.
   * 
   * @param sessionId - Session ID
   * @param participantId - Participant ID
   * @param nickname - Participant nickname
   * @param participantCount - Updated participant count
   */
  async broadcastParticipantJoined(
    sessionId: string,
    participantId: string,
    nickname: string,
    participantCount: number
  ): Promise<void> {
    try {
      console.log('[Broadcast] Broadcasting participant_joined:', {
        sessionId,
        participantId,
        nickname,
        participantCount,
      });

      // Broadcast participant_joined event to all channels
      await pubSubService.broadcastToSession(sessionId, 'participant_joined', {
        participantId,
        nickname,
        participantCount,
        timestamp: new Date().toISOString(),
      });

      console.log('[Broadcast] Successfully broadcasted participant_joined');

      // Check if session is in LOBBY state
      const redisState = await redisDataStructuresService.getSessionState(sessionId);
      
      if (redisState?.state === 'LOBBY') {
        // Also broadcast updated lobby_state
        await this.broadcastLobbyState(sessionId);
      }
    } catch (error) {
      console.error('[Broadcast] Error broadcasting participant_joined:', error);
      throw error;
    }
  }

  /**
   * Broadcast quiz_started event
   * 
   * Called when the host starts the quiz from the lobby.
   * Notifies all connected clients (big screen, controller, participants) that the quiz has started.
   * 
   * This should be called:
   * - When host starts quiz via POST /api/sessions/:sessionId/start
   * - After session state has been transitioned to ACTIVE_QUESTION
   * 
   * @param sessionId - Session ID
   * @param totalQuestions - Total number of questions in the quiz
   */
  async broadcastQuizStarted(sessionId: string, totalQuestions: number): Promise<void> {
    try {
      console.log('[Broadcast] Broadcasting quiz_started for session:', sessionId);

      // Verify session exists
      const sessionsCollection = mongodbService.getCollection<Session>('sessions');
      const session = await mongodbService.withRetry(async () => {
        return await sessionsCollection.findOne({ sessionId });
      });

      if (!session) {
        console.error('[Broadcast] Session not found:', sessionId);
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Verify session is in ACTIVE_QUESTION state
      // Check Redis first for most recent state, fallback to MongoDB
      const redisState = await redisDataStructuresService.getSessionState(sessionId);
      const currentState = redisState?.state || session.state;

      if (currentState !== 'ACTIVE_QUESTION') {
        console.warn('[Broadcast] Session is not in ACTIVE_QUESTION state:', {
          sessionId,
          currentState,
        });
        // Don't throw - just log warning and skip broadcast
        return;
      }

      // Prepare quiz_started payload
      const quizStartedPayload = {
        sessionId,
        totalQuestions,
        timestamp: new Date().toISOString(),
      };

      console.log('[Broadcast] Quiz started payload:', {
        sessionId,
        totalQuestions,
      });

      // Broadcast to all channels (big screen, controller, participants)
      await pubSubService.broadcastToSession(
        sessionId,
        'quiz_started',
        quizStartedPayload
      );

      console.log('[Broadcast] Successfully broadcasted quiz_started for session:', sessionId);
    } catch (error) {
      console.error('[Broadcast] Error broadcasting quiz_started:', error);
      throw error;
    }
  }

  /**
   * Broadcast question_started event
   * 
   * Called when a new question starts in the quiz.
   * Notifies all connected clients (big screen, controller, participants) about the new question.
   * 
   * The broadcast includes:
   * - questionIndex: Current question index (0-based)
   * - question: Question data WITHOUT isCorrect flags (security requirement)
   * - startTime: Unix timestamp in ms when question started
   * - endTime: Unix timestamp in ms when question will end
   * 
   * Security: The question data sent to participants MUST NOT include isCorrect flags on options.
   * This prevents cheating by inspecting network traffic.
   * 
   * Option Shuffling: If shuffleOptions is enabled, options are shuffled differently per participant.
   * This is handled by sending the shuffled options to each participant individually.
   * 
   * This should be called:
   * - When host starts quiz and first question begins
   * - When host advances to next question
   * - After session state has been transitioned to ACTIVE_QUESTION
   * - After Redis state has been updated with question timing
   * 
   * @param sessionId - Session ID
   * @param questionIndex - Current question index (0-based)
   * @param questionId - Question ID
   */
  async broadcastQuestionStarted(
    sessionId: string,
    questionIndex: number,
    questionId: string
  ): Promise<void> {
    try {
      console.log('[Broadcast] Broadcasting question_started for session:', sessionId);

      // Get session from MongoDB
      const sessionsCollection = mongodbService.getCollection<Session>('sessions');
      const session = await mongodbService.withRetry(async () => {
        return await sessionsCollection.findOne({ sessionId });
      });

      if (!session) {
        console.error('[Broadcast] Session not found:', sessionId);
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Verify session is in ACTIVE_QUESTION state
      const redisState = await redisDataStructuresService.getSessionState(sessionId);
      const currentState = redisState?.state || session.state;

      if (currentState !== 'ACTIVE_QUESTION') {
        console.warn('[Broadcast] Session is not in ACTIVE_QUESTION state:', {
          sessionId,
          currentState,
        });
        return;
      }

      // Get quiz to retrieve question data
      const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
      const quiz = await mongodbService.withRetry(async () => {
        return await quizzesCollection.findOne({ _id: session.quizId });
      });

      if (!quiz) {
        console.error('[Broadcast] Quiz not found:', session.quizId);
        throw new Error(`Quiz not found: ${session.quizId}`);
      }

      // Get the question
      const question = quiz.questions[questionIndex];
      if (!question) {
        console.error('[Broadcast] Question not found at index:', questionIndex);
        throw new Error(`Question not found at index: ${questionIndex}`);
      }

      // Verify question ID matches
      if (question.questionId !== questionId) {
        console.error('[Broadcast] Question ID mismatch:', {
          expected: questionId,
          actual: question.questionId,
        });
        throw new Error('Question ID mismatch');
      }

      // Get timing from Redis state
      const startTime = redisState?.currentQuestionStartTime || Date.now();
      const endTime = redisState?.timerEndTime || startTime + question.timeLimit * 1000;

      // Prepare question data WITHOUT isCorrect flags (security requirement)
      const sanitizedOptions = question.options.map((option: { optionId: string; optionText: string; optionImageUrl?: string; isCorrect: boolean }) => ({
        optionId: option.optionId,
        optionText: option.optionText,
        optionImageUrl: option.optionImageUrl,
        // SECURITY: isCorrect is NOT included
      }));

      // Base question payload (for big screen and controller)
      const baseQuestionPayload = {
        questionIndex,
        question: {
          questionId: question.questionId,
          questionText: question.questionText,
          questionType: question.questionType,
          questionImageUrl: question.questionImageUrl,
          options: sanitizedOptions,
          timeLimit: question.timeLimit,
          shuffleOptions: question.shuffleOptions,
        },
        startTime,
        endTime,
      };

      console.log('[Broadcast] Question started payload:', {
        sessionId,
        questionIndex,
        questionId,
        optionsCount: sanitizedOptions.length,
        shuffleOptions: question.shuffleOptions,
      });

      // Broadcast to big screen (no shuffling needed for display)
      await pubSubService.publishToBigScreen(
        sessionId,
        'question_started',
        baseQuestionPayload
      );

      // Broadcast to controller (no shuffling needed)
      await pubSubService.publishToController(
        sessionId,
        'question_started',
        baseQuestionPayload
      );

      // For participants: shuffle options if enabled
      if (question.shuffleOptions) {
        // Get all active participants
        const participantsCollection = mongodbService.getCollection<Participant>('participants');
        const participants = await mongodbService.withRetry(async () => {
          return await participantsCollection
            .find({
              sessionId,
              isActive: true,
              isEliminated: false,
            })
            .toArray();
        });

        console.log('[Broadcast] Shuffling options for participants:', participants.length);

        // Send individually shuffled options to each participant
        for (const participant of participants) {
          const shuffledOptions = this.shuffleArray([...sanitizedOptions]);
          const participantPayload = {
            ...baseQuestionPayload,
            question: {
              ...baseQuestionPayload.question,
              options: shuffledOptions,
            },
          };

          await pubSubService.publishToParticipant(
            participant.participantId,
            'question_started',
            participantPayload
          );
        }
      } else {
        // No shuffling - broadcast to all participants
        await pubSubService.publishToParticipants(
          sessionId,
          'question_started',
          baseQuestionPayload
        );
      }

      console.log('[Broadcast] Successfully broadcasted question_started for session:', sessionId);

      // Start the quiz timer for this question
      // The timer will automatically broadcast timer_tick events every second
      // and trigger the reveal phase when it expires
      await quizTimerManager.createTimer({
        sessionId,
        questionId,
        timeLimit: question.timeLimit,
        onTimerExpired: async () => {
          console.log('[Broadcast] Timer expired for question:', {
            sessionId,
            questionId,
          });

          // Trigger reveal_answers broadcast
          await this.broadcastRevealAnswers(sessionId, questionId);
        },
      });

      console.log('[Broadcast] Timer started for question:', {
        sessionId,
        questionId,
        timeLimit: question.timeLimit,
      });
    } catch (error) {
      console.error('[Broadcast] Error broadcasting question_started:', error);
      throw error;
    }
  }

  /**
   * Broadcast reveal_answers event
   * 
   * Called when the timer expires or host manually reveals answers.
   * Notifies all connected clients (big screen, controller, participants) about the correct answers.
   * 
   * The broadcast includes:
   * - questionId: The question being revealed
   * - correctOptions: Array of correct option IDs
   * - explanationText: Optional explanation text for the answer
   * - statistics: Answer statistics (totalAnswers, correctAnswers, averageResponseTime)
   * 
   * Security: This is the ONLY time correct answer flags are sent to clients.
   * Before this broadcast, clients never receive isCorrect flags (Requirement 9.1).
   * 
   * State Transition: This method transitions the session state to REVEAL.
   * 
   * This should be called:
   * - When question timer expires (automatic)
   * - When host manually reveals answers (future enhancement)
   * - After all answer submissions are closed
   * 
   * @param sessionId - Session ID
   * @param questionId - Question ID to reveal
   */
  async broadcastRevealAnswers(sessionId: string, questionId: string): Promise<void> {
    try {
      console.log('[Broadcast] Broadcasting reveal_answers for session:', sessionId);

      // Get session from MongoDB
      const sessionsCollection = mongodbService.getCollection<Session>('sessions');
      const session = await mongodbService.withRetry(async () => {
        return await sessionsCollection.findOne({ sessionId });
      });

      if (!session) {
        console.error('[Broadcast] Session not found:', sessionId);
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Get quiz to retrieve question data
      const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
      const quiz = await mongodbService.withRetry(async () => {
        return await quizzesCollection.findOne({ _id: session.quizId });
      });

      if (!quiz) {
        console.error('[Broadcast] Quiz not found:', session.quizId);
        throw new Error(`Quiz not found: ${session.quizId}`);
      }

      // Find the question
      const question = quiz.questions.find((q: { questionId: string }) => q.questionId === questionId);
      if (!question) {
        console.error('[Broadcast] Question not found:', questionId);
        throw new Error(`Question not found: ${questionId}`);
      }

      // Extract correct option IDs
      const correctOptions = question.options
        .filter((option: { isCorrect: boolean }) => option.isCorrect)
        .map((option: { optionId: string }) => option.optionId);

      console.log('[Broadcast] Correct options for question:', {
        questionId,
        correctOptions,
      });

      // Calculate answer statistics from MongoDB
      const answersCollection = mongodbService.getCollection<Answer>('answers');
      const answers = await mongodbService.withRetry(async () => {
        return await answersCollection
          .find({
            sessionId,
            questionId,
          })
          .toArray();
      });

      const totalAnswers = answers.length;
      const correctAnswers = answers.filter((answer: Answer) => answer.isCorrect).length;
      const averageResponseTime = totalAnswers > 0
        ? answers.reduce((sum: number, answer: Answer) => sum + answer.responseTimeMs, 0) / totalAnswers
        : 0;

      const statistics = {
        totalAnswers,
        correctAnswers,
        averageResponseTime: Math.round(averageResponseTime),
      };

      console.log('[Broadcast] Answer statistics:', statistics);

      // Transition session state to REVEAL
      await redisDataStructuresService.updateSessionState(sessionId, {
        state: 'REVEAL',
      });

      // Also update MongoDB
      await mongodbService.withRetry(async () => {
        await sessionsCollection.updateOne(
          { sessionId },
          { $set: { state: 'REVEAL' } }
        );
      });

      console.log('[Broadcast] Session state transitioned to REVEAL');

      // Prepare reveal_answers payload
      const revealAnswersPayload = {
        questionId,
        correctOptions,
        explanationText: question.explanationText,
        statistics,
      };

      console.log('[Broadcast] Reveal answers payload:', {
        questionId,
        correctOptionsCount: correctOptions.length,
        hasExplanation: !!question.explanationText,
        statistics,
      });

      // Broadcast to all channels (big screen, controller, participants)
      await pubSubService.broadcastToSession(
        sessionId,
        'reveal_answers',
        revealAnswersPayload
      );

      console.log('[Broadcast] Successfully broadcasted reveal_answers for session:', sessionId);
    } catch (error) {
      console.error('[Broadcast] Error broadcasting reveal_answers:', error);
      throw error;
    }
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   * Creates a new shuffled array without modifying the original
   * 
   * @param array - Array to shuffle
   * @returns Shuffled copy of the array
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Broadcast leaderboard_updated event
   * 
   * Called after each question's scores are calculated.
   * Notifies all connected clients about the updated leaderboard.
   * 
   * The broadcast includes:
   * - Full leaderboard for controller
   * - Top 10 for big screen
   * - Each entry includes: rank, participantId, nickname, totalScore, lastQuestionScore, streakCount
   * 
   * Leaderboard is sorted by:
   * 1. totalScore descending (higher score = better)
   * 2. totalTimeMs ascending (lower time = better tie-breaker)
   * 
   * Requirements: 6.5, 6.6, 6.7, 6.8
   * 
   * This should be called:
   * - After all scores for a question are calculated
   * - Before advancing to the next question or reveal phase
   * 
   * @param sessionId - Session ID
   */
  async broadcastLeaderboardUpdated(sessionId: string): Promise<void> {
    // Start performance timer for leaderboard broadcast
    const endTimer = performanceLoggingService.startTimer('leaderboard_update');
    
    try {
      console.log('[Broadcast] Broadcasting leaderboard_updated for session:', sessionId);

      // Get full leaderboard from Redis sorted set
      const redis = redisService.getClient();
      const leaderboardKey = `session:${sessionId}:leaderboard`;

      // Get all participants from leaderboard (sorted by score descending)
      const leaderboardEntries = await redis.zrevrange(leaderboardKey, 0, -1, 'WITHSCORES');

      if (leaderboardEntries.length === 0) {
        console.warn('[Broadcast] No leaderboard entries found for session:', sessionId);
        return;
      }

      // Parse leaderboard entries (format: [participantId, score, participantId, score, ...])
      const leaderboard: Array<{
        rank: number;
        participantId: string;
        nickname: string;
        totalScore: number;
        lastQuestionScore: number;
        streakCount: number;
        totalTimeMs: number;
      }> = [];

      for (let i = 0; i < leaderboardEntries.length; i += 2) {
        const participantId = leaderboardEntries[i];
        // leaderboardEntries[i + 1] contains the score, but we get actual scores from Redis

        // Get participant details from Redis
        const participantSession = await redisDataStructuresService.getParticipantSession(
          participantId
        );

        if (!participantSession) {
          console.warn('[Broadcast] Participant session not found:', participantId);
          continue;
        }

        // Get participant from MongoDB for nickname
        const participantsCollection = mongodbService.getCollection<Participant>('participants');
        const participant = await mongodbService.withRetry(async () => {
          return await participantsCollection.findOne({ participantId });
        });

        if (!participant) {
          console.warn('[Broadcast] Participant not found in MongoDB:', participantId);
          continue;
        }

        leaderboard.push({
          rank: Math.floor(i / 2) + 1, // 1-based rank
          participantId,
          nickname: participant.nickname,
          totalScore: participantSession.totalScore || 0,
          lastQuestionScore: parseInt(participantSession.lastQuestionScore || '0', 10),
          streakCount: participantSession.streakCount || 0,
          totalTimeMs: participantSession.totalTimeMs || 0,
        });
      }

      console.log('[Broadcast] Leaderboard prepared:', {
        sessionId,
        totalParticipants: leaderboard.length,
      });

      // Broadcast top 10 to big screen
      const top10 = leaderboard.slice(0, 10);
      await pubSubService.publishToBigScreen(sessionId, 'leaderboard_updated', {
        leaderboard: top10,
        topN: 10,
      });

      console.log('[Broadcast] Broadcasted top 10 to big screen');

      // Broadcast full leaderboard to controller
      await pubSubService.publishToController(sessionId, 'leaderboard_updated', {
        leaderboard,
        topN: leaderboard.length,
      });

      console.log('[Broadcast] Broadcasted full leaderboard to controller');

      // Broadcast to participants channel (they can filter to find their own rank)
      await pubSubService.publishToParticipants(sessionId, 'leaderboard_updated', {
        leaderboard: top10, // Send top 10 to participants as well
        topN: 10,
      });

      console.log('[Broadcast] Successfully broadcasted leaderboard_updated for session:', sessionId);
      
      // End performance timer
      endTimer();
    } catch (error) {
      // End performance timer even on error
      endTimer();
      
      console.error('[Broadcast] Error broadcasting leaderboard_updated:', error);
      throw error;
    }
  }

  /**
   * Broadcast quiz_ended event
   * 
   * Called when the quiz ends (all questions complete or host ends quiz).
   * Notifies all connected clients (big screen, controller, participants) that the quiz has ended.
   * 
   * The broadcast includes:
   * - sessionId
   * - finalLeaderboard with all participants (rank, participantId, nickname, totalScore, totalTimeMs)
   * 
   * Different clients will filter the leaderboard as needed:
   * - Big screen: displays top 10
   * - Controller: displays full leaderboard
   * - Participants: can see their own rank
   * 
   * This should be called:
   * - When host ends quiz via POST /api/sessions/:sessionId/end
   * - After session state has been transitioned to ENDED
   * - After final leaderboard has been calculated
   * 
   * @param sessionId - Session ID
   * @param finalLeaderboard - Final leaderboard with all participants
   */
  async broadcastQuizEnded(
    sessionId: string,
    finalLeaderboard: Array<{
      rank: number;
      participantId: string;
      nickname: string;
      totalScore: number;
      totalTimeMs: number;
    }>
  ): Promise<void> {
    try {
      console.log('[Broadcast] Broadcasting quiz_ended for session:', sessionId);

      // Verify session exists
      const sessionsCollection = mongodbService.getCollection<Session>('sessions');
      const session = await mongodbService.withRetry(async () => {
        return await sessionsCollection.findOne({ sessionId });
      });

      if (!session) {
        console.error('[Broadcast] Session not found:', sessionId);
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Verify session is in ENDED state
      // Check Redis first for most recent state, fallback to MongoDB
      const redisState = await redisDataStructuresService.getSessionState(sessionId);
      const currentState = redisState?.state || session.state;

      if (currentState !== 'ENDED') {
        console.warn('[Broadcast] Session is not in ENDED state:', {
          sessionId,
          currentState,
        });
        // Don't throw - just log warning and skip broadcast
        return;
      }

      // Prepare quiz_ended payload
      const quizEndedPayload = {
        sessionId,
        finalLeaderboard,
        timestamp: new Date().toISOString(),
      };

      console.log('[Broadcast] Quiz ended payload:', {
        sessionId,
        participantCount: finalLeaderboard.length,
      });

      // Broadcast to all channels (big screen, controller, participants)
      // Each client type will handle the leaderboard appropriately:
      // - Big screen: shows top 10
      // - Controller: shows full list
      // - Participants: can find their own rank
      await pubSubService.broadcastToSession(
        sessionId,
        'quiz_ended',
        quizEndedPayload
      );

      console.log('[Broadcast] Successfully broadcasted quiz_ended for session:', sessionId);
    } catch (error) {
      console.error('[Broadcast] Error broadcasting quiz_ended:', error);
      throw error;
    }
  }

  /**
   * Broadcast answer_count_updated event to controller
   * 
   * Called after each answer submission to update the controller with the current
   * answer submission count for the active question.
   * 
   * The broadcast includes:
   * - questionId: The question being answered
   * - answeredCount: Number of participants who have submitted answers
   * - totalParticipants: Total number of active participants in the session
   * - percentage: Percentage of participants who have answered (0-100)
   * 
   * This helps the controller track how many participants have answered in real-time.
   * 
   * Requirements: 13.5
   * 
   * This should be called:
   * - After each successful answer submission
   * - Only during ACTIVE_QUESTION state
   * 
   * @param sessionId - Session ID
   * @param questionId - Question ID being answered
   * @param answeredCount - Number of participants who have answered
   * @param totalParticipants - Total number of active participants
   */
  async broadcastAnswerCountUpdated(
    sessionId: string,
    questionId: string,
    answeredCount: number,
    totalParticipants: number
  ): Promise<void> {
    try {
      console.log('[Broadcast] Broadcasting answer_count_updated for session:', sessionId);

      // Calculate percentage (handle division by zero)
      const percentage = totalParticipants > 0
        ? Math.round((answeredCount / totalParticipants) * 100)
        : 0;

      // Prepare answer_count_updated payload
      const answerCountPayload = {
        questionId,
        answeredCount,
        totalParticipants,
        percentage,
      };

      console.log('[Broadcast] Answer count payload:', {
        sessionId,
        questionId,
        answeredCount,
        totalParticipants,
        percentage,
      });

      // Broadcast to controller channel only
      await pubSubService.publishToController(
        sessionId,
        'answer_count_updated',
        answerCountPayload
      );

      console.log('[Broadcast] Successfully broadcasted answer_count_updated for session:', sessionId);
    } catch (error) {
      console.error('[Broadcast] Error broadcasting answer_count_updated:', error);
      // Don't throw - answer count broadcast failure shouldn't fail the answer submission
    }
  }

  /**
   * Broadcast participant_status_changed event to controller
   * 
   * Called when a participant connects or disconnects from the session.
   * Notifies the controller about participant connection status changes.
   * 
   * The broadcast includes:
   * - participantId: The participant whose status changed
   * - nickname: The participant's nickname
   * - status: 'connected' or 'disconnected'
   * - timestamp: Unix timestamp in milliseconds when the status changed
   * 
   * This helps the controller track participant connection status in real-time.
   * 
   * Requirements: 8.6, 13.4
   * 
   * This should be called:
   * - When a participant successfully connects (after authentication)
   * - When a participant disconnects (for any reason)
   * 
   * @param sessionId - Session ID
   * @param participantId - Participant ID whose status changed
   * @param nickname - Participant's nickname
   * @param status - Connection status ('connected' or 'disconnected')
   */
  async broadcastParticipantStatusChanged(
    sessionId: string,
    participantId: string,
    nickname: string,
    status: 'connected' | 'disconnected'
  ): Promise<void> {
    try {
      console.log('[Broadcast] Broadcasting participant_status_changed for session:', sessionId);

      // Get current timestamp
      const timestamp = Date.now();

      // Prepare participant_status_changed payload
      const statusPayload = {
        participantId,
        nickname,
        status,
        timestamp,
      };

      console.log('[Broadcast] Participant status payload:', {
        sessionId,
        participantId,
        nickname,
        status,
        timestamp,
      });

      // Broadcast to controller channel only
      await pubSubService.publishToController(
        sessionId,
        'participant_status_changed',
        statusPayload
      );

      console.log('[Broadcast] Successfully broadcasted participant_status_changed for session:', sessionId);
    } catch (error) {
      console.error('[Broadcast] Error broadcasting participant_status_changed:', error);
      // Don't throw - status broadcast failure shouldn't fail the connection/disconnection
    }
  }

  /**
   * Broadcast system_metrics event to controller
   * 
   * Sends system health metrics to the controller for monitoring:
   * - activeConnections: Number of active WebSocket connections
   * - averageLatency: Average latency in milliseconds
   * - cpuUsage: CPU usage percentage (0-100)
   * - memoryUsage: Memory usage percentage (0-100)
   * 
   * This helps the controller monitor system health in real-time.
   * 
   * Requirements: 13.9
   * 
   * This should be called:
   * - Periodically (every 5 seconds) when a controller is connected
   * - Can be triggered manually for immediate metrics update
   * 
   * @param sessionId - Session ID
   */
  async broadcastSystemMetrics(sessionId: string): Promise<void> {
    try {
      console.log('[Broadcast] Broadcasting system_metrics for session:', sessionId);

      // Collect metrics from metricsService
      const metrics = await metricsService.collectMetrics();

      // Prepare system_metrics payload
      const systemMetricsPayload = {
        activeConnections: metrics.connections.active,
        averageLatency: metrics.latency.average,
        cpuUsage: metrics.cpu.usage,
        memoryUsage: metrics.memory.usagePercentage,
      };

      console.log('[Broadcast] System metrics payload:', {
        sessionId,
        ...systemMetricsPayload,
      });

      // Broadcast to controller channel only
      await pubSubService.publishToController(
        sessionId,
        'system_metrics',
        systemMetricsPayload
      );

      console.log('[Broadcast] Successfully broadcasted system_metrics for session:', sessionId);
    } catch (error) {
      console.error('[Broadcast] Error broadcasting system_metrics:', error);
      // Don't throw - metrics broadcast failure shouldn't affect other operations
    }
  }

  /**
   * Broadcast a custom event to big screen
   * 
   * Generic method to send any event to the big screen for a session.
   * 
   * @param sessionId - Session ID
   * @param eventName - Name of the event to broadcast
   * @param data - Event data payload
   */
  async broadcastToBigScreen(
    sessionId: string,
    eventName: string,
    data: Record<string, any>
  ): Promise<void> {
    try {
      console.log(`[Broadcast] Broadcasting ${eventName} to big screen for session:`, sessionId);

      // Broadcast to big screen channel
      await pubSubService.publishToBigScreen(sessionId, eventName, {
        ...data,
        timestamp: Date.now(),
      });

      console.log(`[Broadcast] Successfully broadcasted ${eventName} to big screen`);
    } catch (error) {
      console.error(`[Broadcast] Error broadcasting ${eventName} to big screen:`, error);
      throw error;
    }
  }
}

/**
 * System Metrics Broadcast Manager
 * 
 * Manages periodic broadcasting of system metrics to controllers.
 * Starts broadcasting when a controller connects and stops when they disconnect.
 * 
 * Broadcasts system_metrics every 5 seconds to the controller.
 * 
 * Requirements: 13.9
 */
class SystemMetricsBroadcastManager {
  private intervalMap: Map<string, NodeJS.Timeout> = new Map();
  private readonly BROADCAST_INTERVAL_MS = 5000; // 5 seconds

  /**
   * Start broadcasting system metrics for a session
   * 
   * Called when a controller connects to a session.
   * Starts a periodic broadcast of system metrics every 5 seconds.
   * 
   * @param sessionId - Session ID
   */
  startBroadcasting(sessionId: string): void {
    // Check if already broadcasting for this session
    if (this.intervalMap.has(sessionId)) {
      console.log('[SystemMetricsBroadcast] Already broadcasting for session:', sessionId);
      return;
    }

    console.log('[SystemMetricsBroadcast] Starting metrics broadcast for session:', sessionId);

    // Broadcast immediately on start
    broadcastService.broadcastSystemMetrics(sessionId).catch((error) => {
      console.error('[SystemMetricsBroadcast] Error in initial broadcast:', error);
    });

    // Set up periodic broadcast every 5 seconds
    const intervalId = setInterval(async () => {
      try {
        await broadcastService.broadcastSystemMetrics(sessionId);
      } catch (error) {
        console.error('[SystemMetricsBroadcast] Error in periodic broadcast:', error);
      }
    }, this.BROADCAST_INTERVAL_MS);

    this.intervalMap.set(sessionId, intervalId);

    console.log('[SystemMetricsBroadcast] Started metrics broadcast for session:', sessionId);
  }

  /**
   * Stop broadcasting system metrics for a session
   * 
   * Called when a controller disconnects from a session.
   * Stops the periodic broadcast of system metrics.
   * 
   * @param sessionId - Session ID
   */
  stopBroadcasting(sessionId: string): void {
    const intervalId = this.intervalMap.get(sessionId);

    if (!intervalId) {
      console.log('[SystemMetricsBroadcast] No active broadcast for session:', sessionId);
      return;
    }

    console.log('[SystemMetricsBroadcast] Stopping metrics broadcast for session:', sessionId);

    clearInterval(intervalId);
    this.intervalMap.delete(sessionId);

    console.log('[SystemMetricsBroadcast] Stopped metrics broadcast for session:', sessionId);
  }

  /**
   * Check if broadcasting is active for a session
   * 
   * @param sessionId - Session ID
   * @returns True if broadcasting is active, false otherwise
   */
  isBroadcasting(sessionId: string): boolean {
    return this.intervalMap.has(sessionId);
  }

  /**
   * Stop all active broadcasts
   * 
   * Called during server shutdown to clean up all intervals.
   */
  stopAll(): void {
    console.log('[SystemMetricsBroadcast] Stopping all metrics broadcasts');

    for (const [sessionId, intervalId] of this.intervalMap.entries()) {
      clearInterval(intervalId);
      console.log('[SystemMetricsBroadcast] Stopped broadcast for session:', sessionId);
    }

    this.intervalMap.clear();

    console.log('[SystemMetricsBroadcast] All metrics broadcasts stopped');
  }

  /**
   * Get the number of active broadcasts
   * 
   * @returns Number of active broadcasts
   */
  getActiveBroadcastCount(): number {
    return this.intervalMap.size;
  }
}

// Export singleton instances
export const broadcastService = new BroadcastService();
export const systemMetricsBroadcastManager = new SystemMetricsBroadcastManager();
