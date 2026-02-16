/**
 * Controller WebSocket Connection Handler
 * 
 * Handles WebSocket connections for controllers (quiz hosts):
 * - Verifies session ID on connection (done in middleware)
 * - Subscribes to controller channel (session:{sessionId}:controller)
 * - Subscribes to session state channel (session:{sessionId}:state)
 * - Emits authenticated event with current session state
 * - Handles disconnection and cleanup
 * 
 * Requirements: 5.1
 */

import { Socket } from 'socket.io';
import { SocketData } from '../middleware/socket-auth';
import { redisService } from '../services/redis.service';
import { mongodbService } from '../services/mongodb.service';
import { redisDataStructuresService } from '../services/redis-data-structures.service';
import { broadcastService, systemMetricsBroadcastManager } from '../services/broadcast.service';
import { pubSubService } from '../services/pubsub.service';
import { quizTimerManager } from '../services/quiz-timer.service';
import { scoringService } from '../services/scoring.service';
import { Session, Quiz, Participant } from '../models/types';

/**
 * Handle controller connection
 * 
 * Called after authentication middleware has verified the controller
 * 
 * @param socket - Authenticated Socket.IO socket instance
 */
export async function handleControllerConnection(socket: Socket): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId } = socketData;

  try {
    console.log('[Controller Handler] Handling controller connection:', {
      socketId: socket.id,
      sessionId,
    });

    // Verify session exists
    const sessionExists = await verifySessionExists(sessionId);
    if (!sessionExists) {
      throw new Error('Session not found');
    }

    // Update controller's socket ID in Redis
    await updateControllerConnection(sessionId, socket.id);

    // Get current session state
    const sessionState = await getCurrentSessionState(sessionId);

    // Emit authenticated event with current session state
    socket.emit('authenticated', {
      success: true,
      sessionId,
      currentState: sessionState,
    });

    console.log('[Controller Handler] Controller authenticated successfully:', {
      socketId: socket.id,
      sessionId,
      sessionState: sessionState.state,
    });

    // Set up event handlers for controller actions
    setupControllerEventHandlers(socket);

    // If session is in LOBBY state, broadcast lobby_state to controller
    if (sessionState.state === 'LOBBY') {
      await broadcastService.broadcastLobbyStateToController(sessionId);
    }

    // Start broadcasting system metrics to this controller
    // Broadcasts every 5 seconds while controller is connected
    // Requirements: 13.9
    systemMetricsBroadcastManager.startBroadcasting(sessionId);

    console.log('[Controller Handler] Started system metrics broadcast for session:', sessionId);

  } catch (error) {
    console.error('[Controller Handler] Error handling controller connection:', error);
    
    socket.emit('auth_error', {
      error: 'Failed to authenticate controller',
    });
    
    socket.disconnect(true);
  }
}

/**
 * Handle controller disconnection
 * 
 * Called when controller disconnects
 * 
 * @param socket - Socket.IO socket instance
 * @param reason - Disconnection reason
 */
export async function handleControllerDisconnection(
  socket: Socket,
  reason: string
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId } = socketData;

  console.log('[Controller Handler] Handling controller disconnection:', {
    socketId: socket.id,
    sessionId,
    reason,
  });

  // Stop broadcasting system metrics for this session
  // Requirements: 13.9
  systemMetricsBroadcastManager.stopBroadcasting(sessionId);

  console.log('[Controller Handler] Stopped system metrics broadcast for session:', sessionId);

  // Update controller's connection status in Redis
  try {
    await updateControllerDisconnection(sessionId);
  } catch (error) {
    console.error('[Controller Handler] Error updating controller disconnection in Redis:', error);
    // Continue with logging even if Redis update fails
  }

  // Log disconnection event
  try {
    await logDisconnectionEvent(sessionId, reason);
  } catch (error) {
    console.error('[Controller Handler] Error logging disconnection event:', error);
    // Continue - logging failure shouldn't prevent disconnection
  }

  console.log('[Controller Handler] Controller disconnection handled:', {
    socketId: socket.id,
    sessionId,
  });
}

/**
 * Verify session exists in MongoDB
 * 
 * @param sessionId - Session ID
 * @returns True if session exists, false otherwise
 */
async function verifySessionExists(sessionId: string): Promise<boolean> {
  try {
    const db = mongodbService.getDb();
    const sessionsCollection = db.collection<Session>('sessions');
    
    const session = await sessionsCollection.findOne({ sessionId });
    return session !== null;
  } catch (error) {
    console.error('[Controller Handler] Error verifying session exists:', error);
    return false;
  }
}

/**
 * Update controller connection status in Redis
 * 
 * @param sessionId - Session ID
 * @param socketId - Socket ID
 */
async function updateControllerConnection(
  sessionId: string,
  socketId: string
): Promise<void> {
  const redis = redisService.getClient();
  const controllerKey = `session:${sessionId}:controller`;

  // Store controller socket ID in Redis
  await redis.hset(controllerKey, {
    socketId,
    connectedAt: Date.now().toString(),
  });

  // Set TTL to 6 hours (session lifetime)
  await redis.expire(controllerKey, 21600); // 6 hours

  console.log('[Controller Handler] Updated controller connection in Redis:', {
    sessionId,
    socketId,
  });
}

/**
 * Update controller disconnection status in Redis
 * 
 * @param sessionId - Session ID
 */
async function updateControllerDisconnection(sessionId: string): Promise<void> {
  const redis = redisService.getClient();
  const controllerKey = `session:${sessionId}:controller`;

  // Clear controller socket ID
  await redis.hset(controllerKey, {
    socketId: '',
    disconnectedAt: Date.now().toString(),
  });

  // Keep TTL at 6 hours
  await redis.expire(controllerKey, 21600); // 6 hours

  console.log('[Controller Handler] Updated controller disconnection in Redis:', {
    sessionId,
  });
}

/**
 * Get current session state from Redis or MongoDB
 * 
 * @param sessionId - Session ID
 * @returns Current session state
 */
async function getCurrentSessionState(sessionId: string): Promise<{
  state: string;
  currentQuestionIndex: number;
  participantCount: number;
  currentQuestion?: any;
  remainingTime?: number;
  examMode?: any;
}> {
  const redis = redisService.getClient();

  // Try to get session state from Redis first (fast path)
  const sessionState = await redis.hgetall(`session:${sessionId}:state`);

  if (sessionState && Object.keys(sessionState).length > 0) {
    // Session state exists in Redis
    const state = {
      state: sessionState.state,
      currentQuestionIndex: parseInt(sessionState.currentQuestionIndex || '0'),
      participantCount: parseInt(sessionState.participantCount || '0'),
    };

    // If in ACTIVE_QUESTION state, calculate remaining time
    if (sessionState.state === 'ACTIVE_QUESTION' && sessionState.timerEndTime) {
      const timerEndTime = parseInt(sessionState.timerEndTime);
      const remainingMs = Math.max(0, timerEndTime - Date.now());
      const remainingSeconds = Math.ceil(remainingMs / 1000);

      return {
        ...state,
        remainingTime: remainingSeconds,
      };
    }

    return state;
  }

  // Fallback to MongoDB
  const db = mongodbService.getDb();
  const sessionsCollection = db.collection<Session>('sessions');
  
  const session = await sessionsCollection.findOne({ sessionId });

  if (!session) {
    throw new Error('Session not found');
  }

  return {
    state: session.state,
    currentQuestionIndex: session.currentQuestionIndex,
    participantCount: session.participantCount,
    examMode: session.examMode,
  };
}

/**
 * Log disconnection event to audit logs
 * 
 * @param sessionId - Session ID
 * @param reason - Disconnection reason
 */
async function logDisconnectionEvent(
  sessionId: string,
  reason: string
): Promise<void> {
  try {
    const db = mongodbService.getDb();
    const auditLogsCollection = db.collection('auditLogs');

    await auditLogsCollection.insertOne({
      timestamp: new Date(),
      eventType: 'CONTROLLER_DISCONNECTED' as any, // Not in enum but useful for logging
      sessionId,
      details: {
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Controller Handler] Error logging disconnection event:', error);
    // Don't throw - logging failure shouldn't prevent disconnection
  }
}

/**
 * Handle start_quiz event from controller
 * 
 * Steps:
 * 1. Verify session is in LOBBY state
 * 2. Get quiz to find first question
 * 3. Transition session to ACTIVE_QUESTION state
 * 4. Update Redis and MongoDB with new state
 * 5. Broadcast quiz_started event
 * 6. Broadcast first question_started event (which starts the timer)
 * 
 * Requirements: 2.3, 2.8
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Event data containing sessionId
 */
async function handleStartQuiz(
  socket: Socket,
  data: { sessionId: string }
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId: authenticatedSessionId } = socketData;

  try {
    console.log('[Controller Handler] Handling start_quiz event:', {
      socketId: socket.id,
      sessionId: data.sessionId,
    });

    // Verify sessionId matches authenticated session
    if (data.sessionId !== authenticatedSessionId) {
      socket.emit('error', {
        event: 'start_quiz',
        error: 'Session ID mismatch',
      });
      return;
    }

    // Get session from MongoDB
    const db = mongodbService.getDb();
    const sessionsCollection = db.collection<Session>('sessions');
    const session = await sessionsCollection.findOne({ sessionId: data.sessionId });

    if (!session) {
      socket.emit('error', {
        event: 'start_quiz',
        error: 'Session not found',
      });
      return;
    }

    // Verify session is in LOBBY state
    // Check Redis first for most recent state
    const redisState = await redisDataStructuresService.getSessionState(data.sessionId);
    const currentState = redisState?.state || session.state;

    if (currentState !== 'LOBBY') {
      socket.emit('error', {
        event: 'start_quiz',
        error: `Cannot start quiz from ${currentState} state`,
      });
      return;
    }

    // Get quiz to find first question
    const quizzesCollection = db.collection<Quiz>('quizzes');
    const quiz = await quizzesCollection.findOne({ _id: session.quizId });

    if (!quiz) {
      socket.emit('error', {
        event: 'start_quiz',
        error: 'Quiz not found',
      });
      return;
    }

    if (!quiz.questions || quiz.questions.length === 0) {
      socket.emit('error', {
        event: 'start_quiz',
        error: 'Quiz has no questions',
      });
      return;
    }

    const firstQuestion = quiz.questions[0];

    console.log('[Controller Handler] Starting quiz:', {
      sessionId: data.sessionId,
      totalQuestions: quiz.questions.length,
      firstQuestionId: firstQuestion.questionId,
    });

    // Transition session to ACTIVE_QUESTION state
    // CRITICAL: Must include currentQuestionId for answer validation to work
    await redisDataStructuresService.updateSessionState(data.sessionId, {
      state: 'ACTIVE_QUESTION',
      currentQuestionIndex: 0,
      currentQuestionId: firstQuestion.questionId,
      currentQuestionStartTime: Date.now(),
    });

    // Clear scoring caches for new round
    scoringService.clearQuestionCache();

    // Update MongoDB
    await sessionsCollection.updateOne(
      { sessionId: data.sessionId },
      {
        $set: {
          state: 'ACTIVE_QUESTION',
          currentQuestionIndex: 0,
          currentQuestionStartTime: new Date(),
          startedAt: new Date(),
        },
      }
    );

    console.log('[Controller Handler] Session state transitioned to ACTIVE_QUESTION:', {
      sessionId: data.sessionId,
      currentQuestionId: firstQuestion.questionId,
    });

    // Subscribe scoring service to this session's scoring channel
    try {
      await scoringService.subscribeToSession(data.sessionId);
      console.log('[Controller Handler] Scoring service subscribed to session');
    } catch (error) {
      console.error('[Controller Handler] Error subscribing scoring service:', error);
      // Continue - scoring can still work via direct processing
    }

    // Broadcast quiz_started event
    await broadcastService.broadcastQuizStarted(
      data.sessionId,
      quiz.questions.length
    );

    console.log('[Controller Handler] Broadcasted quiz_started event');

    // Broadcast first question_started event (this also starts the timer)
    await broadcastService.broadcastQuestionStarted(
      data.sessionId,
      0, // questionIndex
      firstQuestion.questionId
    );

    console.log('[Controller Handler] Broadcasted question_started event for first question');

    // Send success response to controller
    socket.emit('quiz_started_ack', {
      success: true,
      sessionId: data.sessionId,
      currentQuestionIndex: 0,
      totalQuestions: quiz.questions.length,
    });

    console.log('[Controller Handler] Successfully started quiz:', {
      sessionId: data.sessionId,
      totalQuestions: quiz.questions.length,
    });
  } catch (error) {
    console.error('[Controller Handler] Error handling start_quiz:', error);
    
    socket.emit('error', {
      event: 'start_quiz',
      error: 'Failed to start quiz',
    });
  }
}

/**
 * Handle next_question event from controller
 * 
 * Steps:
 * 1. Verify session is in REVEAL state
 * 2. Increment currentQuestionIndex
 * 3. Check if there are more questions
 * 4. If no more questions, transition to ENDED state
 * 5. Otherwise, transition to ACTIVE_QUESTION state
 * 6. Broadcast next question_started event (which starts the timer)
 * 
 * Requirements: 2.5, 2.8
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Event data containing sessionId
 */
async function handleNextQuestion(
  socket: Socket,
  data: { sessionId: string }
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId: authenticatedSessionId } = socketData;

  try {
    console.log('[Controller Handler] Handling next_question event:', {
      socketId: socket.id,
      sessionId: data.sessionId,
    });

    // Verify sessionId matches authenticated session
    if (data.sessionId !== authenticatedSessionId) {
      socket.emit('error', {
        event: 'next_question',
        error: 'Session ID mismatch',
      });
      return;
    }

    // Get session from MongoDB
    const db = mongodbService.getDb();
    const sessionsCollection = db.collection<Session>('sessions');
    const session = await sessionsCollection.findOne({ sessionId: data.sessionId });

    if (!session) {
      socket.emit('error', {
        event: 'next_question',
        error: 'Session not found',
      });
      return;
    }

    // Check Redis first for most recent state
    const redisState = await redisDataStructuresService.getSessionState(data.sessionId);
    const currentState = redisState?.state || session.state;

    // Check if exam mode with skipRevealPhase is enabled
    // In exam mode, we can transition directly from ACTIVE_QUESTION to next ACTIVE_QUESTION
    // Requirements: 4.2, 4.4 - Skip REVEAL state in exam mode
    const isExamModeSkipReveal = session.examMode?.skipRevealPhase === true;
    const isExamModeAutoAdvance = session.examMode?.autoAdvance === true;

    // Verify session is in valid state for next question
    // Normal mode: Must be in REVEAL state
    // Exam mode with skipRevealPhase or autoAdvance: Can be in REVEAL or ACTIVE_QUESTION state
    const validStates = (isExamModeSkipReveal || isExamModeAutoAdvance)
      ? ['REVEAL', 'ACTIVE_QUESTION'] 
      : ['REVEAL'];

    if (!validStates.includes(currentState)) {
      const stateRequirement = (isExamModeSkipReveal || isExamModeAutoAdvance)
        ? 'REVEAL or ACTIVE_QUESTION' 
        : 'REVEAL';
      socket.emit('error', {
        event: 'next_question',
        error: `Cannot advance to next question from ${currentState} state. Must be in ${stateRequirement} state.`,
      });
      return;
    }

    // If in ACTIVE_QUESTION state (exam mode), stop the current timer first
    if (currentState === 'ACTIVE_QUESTION' && (isExamModeSkipReveal || isExamModeAutoAdvance)) {
      const currentQuestionId = redisState?.currentQuestionId;
      if (currentQuestionId) {
        const timer = quizTimerManager.getTimer(data.sessionId, currentQuestionId);
        if (timer) {
          timer.stop();
          console.log('[Controller Handler] Stopped active timer for exam mode direct transition');
        }
      }
    }

    // Get quiz to find questions
    const quizzesCollection = db.collection<Quiz>('quizzes');
    const quiz = await quizzesCollection.findOne({ _id: session.quizId });

    if (!quiz) {
      socket.emit('error', {
        event: 'next_question',
        error: 'Quiz not found',
      });
      return;
    }

    // Get current question index from Redis or session
    const currentQuestionIndex = redisState?.currentQuestionIndex ?? session.currentQuestionIndex;
    const nextQuestionIndex = currentQuestionIndex + 1;

    console.log('[Controller Handler] Advancing to next question:', {
      sessionId: data.sessionId,
      currentQuestionIndex,
      nextQuestionIndex,
      totalQuestions: quiz.questions.length,
    });

    // Check if there are more questions
    if (nextQuestionIndex >= quiz.questions.length) {
      // No more questions - transition to ENDED state
      console.log('[Controller Handler] No more questions, ending quiz');

      // Update Redis state
      await redisDataStructuresService.updateSessionState(data.sessionId, {
        state: 'ENDED',
        currentQuestionIndex: currentQuestionIndex,
      });

      // Update MongoDB
      await sessionsCollection.updateOne(
        { sessionId: data.sessionId },
        {
          $set: {
            state: 'ENDED',
            endedAt: new Date(),
          },
        }
      );

      // Get participants from MongoDB (for nicknames and metadata)
      const participantsCollection = db.collection<Participant>('participants');
      const participants = await participantsCollection
        .find({ 
          sessionId: data.sessionId,
          isActive: true, // Only include active participants
        })
        .toArray();

      // Get scores from Redis (authoritative source during gameplay)
      const participantsWithScores = await Promise.all(
        participants.map(async (p) => {
          const participantSession = await redisDataStructuresService.getParticipantSession(p.participantId);
          const totalScore = participantSession?.totalScore ?? p.totalScore ?? 0;
          const totalTimeMs = participantSession?.totalTimeMs ?? p.totalTimeMs ?? 0;
          
          // Also update MongoDB with final scores for persistence
          await participantsCollection.updateOne(
            { participantId: p.participantId },
            { $set: { totalScore, totalTimeMs } }
          );
          
          return {
            ...p,
            totalScore,
            totalTimeMs,
          };
        })
      );

      // Sort by score descending, then by time ascending (lower time ranks higher)
      participantsWithScores.sort((a, b) => {
        if (b.totalScore !== a.totalScore) {
          return b.totalScore - a.totalScore;
        }
        return a.totalTimeMs - b.totalTimeMs;
      });

      // Format final leaderboard with ranks
      const finalLeaderboard = participantsWithScores.map((p, index) => ({
        rank: index + 1,
        participantId: p.participantId,
        nickname: p.nickname,
        totalScore: p.totalScore,
        totalTimeMs: p.totalTimeMs,
      }));

      console.log('[Controller Handler] Calculated final leaderboard:', {
        sessionId: data.sessionId,
        participantCount: finalLeaderboard.length,
      });

      // Broadcast quiz_ended event with final leaderboard
      await broadcastService.broadcastQuizEnded(data.sessionId, finalLeaderboard);

      // Unsubscribe scoring service from this session
      try {
        await scoringService.unsubscribeFromSession(data.sessionId);
        console.log('[Controller Handler] Scoring service unsubscribed from session');
      } catch (error) {
        console.error('[Controller Handler] Error unsubscribing scoring service:', error);
        // Continue - cleanup can happen later
      }

      // Send acknowledgment to controller
      socket.emit('next_question_ack', {
        success: true,
        sessionId: data.sessionId,
        quizEnded: true,
        message: 'Quiz has ended - no more questions',
        finalLeaderboard,
      });

      console.log('[Controller Handler] Quiz ended successfully:', {
        sessionId: data.sessionId,
      });
      return;
    }

    // There are more questions - advance to next question
    const nextQuestion = quiz.questions[nextQuestionIndex];

    // Clear scoring caches for new round
    scoringService.clearQuestionCache();

    // Transition session to ACTIVE_QUESTION state
    // CRITICAL: Must include currentQuestionId for answer validation to work
    await redisDataStructuresService.updateSessionState(data.sessionId, {
      state: 'ACTIVE_QUESTION',
      currentQuestionIndex: nextQuestionIndex,
      currentQuestionId: nextQuestion.questionId,
      currentQuestionStartTime: Date.now(),
    });

    // Update MongoDB
    await sessionsCollection.updateOne(
      { sessionId: data.sessionId },
      {
        $set: {
          state: 'ACTIVE_QUESTION',
          currentQuestionIndex: nextQuestionIndex,
          currentQuestionStartTime: new Date(),
        },
      }
    );

    console.log('[Controller Handler] Session state transitioned to ACTIVE_QUESTION:', {
      sessionId: data.sessionId,
      currentQuestionId: nextQuestion.questionId,
    });

    // Broadcast question_started event (this also starts the timer)
    await broadcastService.broadcastQuestionStarted(
      data.sessionId,
      nextQuestionIndex,
      nextQuestion.questionId
    );

    console.log('[Controller Handler] Broadcasted question_started event');

    // Send success response to controller
    socket.emit('next_question_ack', {
      success: true,
      sessionId: data.sessionId,
      currentQuestionIndex: nextQuestionIndex,
      totalQuestions: quiz.questions.length,
      quizEnded: false,
    });

    console.log('[Controller Handler] Successfully advanced to next question:', {
      sessionId: data.sessionId,
      questionIndex: nextQuestionIndex,
      totalQuestions: quiz.questions.length,
    });
  } catch (error) {
    console.error('[Controller Handler] Error handling next_question:', error);
    
    socket.emit('error', {
      event: 'next_question',
      error: 'Failed to advance to next question',
    });
  }
}

/**
 * Handle end_quiz event from controller
 * 
 * Ends the quiz immediately regardless of remaining questions.
 * 
 * Steps:
 * 1. Verify session exists and is not already ended
 * 2. Transition session to ENDED state
 * 3. Calculate final leaderboard
 * 4. Broadcast quiz_ended event
 * 5. Log end action in audit logs
 * 
 * Requirements: 2.8
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Event data containing sessionId
 */
async function handleEndQuiz(
  socket: Socket,
  data: { sessionId: string }
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId: authenticatedSessionId } = socketData;

  try {
    console.log('[Controller Handler] Handling end_quiz event:', {
      socketId: socket.id,
      sessionId: data.sessionId,
    });

    // Verify sessionId matches authenticated session
    if (data.sessionId !== authenticatedSessionId) {
      socket.emit('error', {
        event: 'end_quiz',
        error: 'Session ID mismatch',
      });
      return;
    }

    // Get session from MongoDB
    const db = mongodbService.getDb();
    const sessionsCollection = db.collection<Session>('sessions');
    const session = await sessionsCollection.findOne({ sessionId: data.sessionId });

    if (!session) {
      socket.emit('error', {
        event: 'end_quiz',
        error: 'Session not found',
      });
      return;
    }

    // Check Redis for most recent state
    const redisState = await redisDataStructuresService.getSessionState(data.sessionId);
    const currentState = redisState?.state || session.state;

    // Verify session is not already ended
    if (currentState === 'ENDED') {
      socket.emit('error', {
        event: 'end_quiz',
        error: 'Quiz has already ended',
      });
      return;
    }

    console.log('[Controller Handler] Ending quiz:', {
      sessionId: data.sessionId,
      currentState,
    });

    // Stop any active timer
    const currentQuestionId = redisState?.currentQuestionId;
    if (currentQuestionId) {
      const timer = quizTimerManager.getTimer(data.sessionId, currentQuestionId);
      if (timer) {
        timer.stop();
        console.log('[Controller Handler] Stopped active timer');
      }
    }

    // Update Redis state
    await redisDataStructuresService.updateSessionState(data.sessionId, {
      state: 'ENDED',
    });

    // Update MongoDB
    await sessionsCollection.updateOne(
      { sessionId: data.sessionId },
      {
        $set: {
          state: 'ENDED',
          endedAt: new Date(),
        },
      }
    );

    // Get participants from MongoDB (for nicknames and metadata)
    const participantsCollection = db.collection<Participant>('participants');
    const participants = await participantsCollection
      .find({ 
        sessionId: data.sessionId,
        isActive: true,
      })
      .toArray();

    // Get scores from Redis (authoritative source during gameplay)
    const participantsWithScores = await Promise.all(
      participants.map(async (p) => {
        const participantSession = await redisDataStructuresService.getParticipantSession(p.participantId);
        const totalScore = participantSession?.totalScore ?? p.totalScore ?? 0;
        const totalTimeMs = participantSession?.totalTimeMs ?? p.totalTimeMs ?? 0;
        
        // Also update MongoDB with final scores for persistence
        await participantsCollection.updateOne(
          { participantId: p.participantId },
          { $set: { totalScore, totalTimeMs } }
        );
        
        return {
          ...p,
          totalScore,
          totalTimeMs,
        };
      })
    );

    // Sort by score descending, then by time ascending (lower time ranks higher)
    participantsWithScores.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      return a.totalTimeMs - b.totalTimeMs;
    });

    // Format final leaderboard with ranks
    const finalLeaderboard = participantsWithScores.map((p, index) => ({
      rank: index + 1,
      participantId: p.participantId,
      nickname: p.nickname,
      totalScore: p.totalScore,
      totalTimeMs: p.totalTimeMs,
    }));

    console.log('[Controller Handler] Calculated final leaderboard:', {
      sessionId: data.sessionId,
      participantCount: finalLeaderboard.length,
    });

    // Broadcast quiz_ended event with final leaderboard
    await broadcastService.broadcastQuizEnded(data.sessionId, finalLeaderboard);

    // Unsubscribe scoring service from this session
    try {
      await scoringService.unsubscribeFromSession(data.sessionId);
      console.log('[Controller Handler] Scoring service unsubscribed from session');
    } catch (error) {
      console.error('[Controller Handler] Error unsubscribing scoring service:', error);
      // Continue - cleanup can happen later
    }

    // Log end action in audit logs
    const auditLogsCollection = db.collection('auditLogs');
    await auditLogsCollection.insertOne({
      timestamp: new Date(),
      eventType: 'QUIZ_ENDED' as any,
      sessionId: data.sessionId,
      details: {
        endedBy: 'controller',
        previousState: currentState,
        participantCount: finalLeaderboard.length,
        endedAt: new Date().toISOString(),
      },
    });

    // Send acknowledgment to controller
    socket.emit('end_quiz_ack', {
      success: true,
      sessionId: data.sessionId,
      message: 'Quiz ended successfully',
      finalLeaderboard,
    });

    console.log('[Controller Handler] Quiz ended successfully:', {
      sessionId: data.sessionId,
    });
  } catch (error) {
    console.error('[Controller Handler] Error handling end_quiz:', error);
    
    socket.emit('error', {
      event: 'end_quiz',
      error: 'Failed to end quiz',
    });
  }
}

/**
 * Handle void_question event from controller
 * 
 * Steps:
 * 1. Verify session exists and question is valid
 * 2. Mark question as voided in session (Redis and MongoDB)
 * 3. Recalculate all participant scores excluding voided question
 * 4. Update leaderboard with recalculated scores
 * 5. Broadcast updated leaderboard
 * 6. Log void action in audit logs
 * 
 * Requirements: 2.7, 10.1, 10.7
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Event data containing sessionId, questionId, and reason
 */
async function handleVoidQuestion(
  socket: Socket,
  data: { sessionId: string; questionId: string; reason: string }
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId: authenticatedSessionId } = socketData;

  try {
    console.log('[Controller Handler] Handling void_question event:', {
      socketId: socket.id,
      sessionId: data.sessionId,
      questionId: data.questionId,
      reason: data.reason,
    });

    // Verify sessionId matches authenticated session
    if (data.sessionId !== authenticatedSessionId) {
      socket.emit('error', {
        event: 'void_question',
        error: 'Session ID mismatch',
      });
      return;
    }

    // Validate required fields
    if (!data.questionId) {
      socket.emit('error', {
        event: 'void_question',
        error: 'Question ID is required',
      });
      return;
    }

    if (!data.reason || data.reason.trim().length === 0) {
      socket.emit('error', {
        event: 'void_question',
        error: 'Reason for voiding is required',
      });
      return;
    }

    // Get session from MongoDB
    const db = mongodbService.getDb();
    const sessionsCollection = db.collection<Session>('sessions');
    const session = await sessionsCollection.findOne({ sessionId: data.sessionId });

    if (!session) {
      socket.emit('error', {
        event: 'void_question',
        error: 'Session not found',
      });
      return;
    }

    // Get quiz to verify question exists
    const quizzesCollection = db.collection<Quiz>('quizzes');
    const quiz = await quizzesCollection.findOne({ _id: session.quizId });

    if (!quiz) {
      socket.emit('error', {
        event: 'void_question',
        error: 'Quiz not found',
      });
      return;
    }

    // Verify question exists in quiz
    const question = quiz.questions.find((q) => q.questionId === data.questionId);
    if (!question) {
      socket.emit('error', {
        event: 'void_question',
        error: 'Question not found in quiz',
      });
      return;
    }

    // Check if question is already voided
    const currentVoidedQuestions = session.voidedQuestions || [];
    if (currentVoidedQuestions.includes(data.questionId)) {
      socket.emit('error', {
        event: 'void_question',
        error: 'Question is already voided',
      });
      return;
    }

    console.log('[Controller Handler] Voiding question:', {
      sessionId: data.sessionId,
      questionId: data.questionId,
      questionText: question.questionText.substring(0, 50) + '...',
    });

    // Step 1: Mark question as voided in session
    const updatedVoidedQuestions = [...currentVoidedQuestions, data.questionId];

    // Update Redis state
    await redisDataStructuresService.updateSessionState(data.sessionId, {
      voidedQuestions: updatedVoidedQuestions,
    });

    // Update MongoDB
    await sessionsCollection.updateOne(
      { sessionId: data.sessionId },
      {
        $push: { voidedQuestions: data.questionId },
      }
    );

    console.log('[Controller Handler] Question marked as voided in session');

    // Step 2: Recalculate all participant scores excluding voided question
    // Get all answers for the voided question
    const answersCollection = db.collection('answers');
    const voidedAnswers = await answersCollection
      .find({
        sessionId: data.sessionId,
        questionId: data.questionId,
      })
      .toArray();

    console.log('[Controller Handler] Found answers to void:', {
      count: voidedAnswers.length,
    });

    // Get all active participants
    const participantsCollection = db.collection<Participant>('participants');
    const participants = await participantsCollection
      .find({
        sessionId: data.sessionId,
        isActive: true,
      })
      .toArray();

    // Create a map of points to subtract per participant
    const pointsToSubtract = new Map<string, number>();
    for (const answer of voidedAnswers) {
      const currentPoints = pointsToSubtract.get(answer.participantId) || 0;
      pointsToSubtract.set(answer.participantId, currentPoints + (answer.pointsAwarded || 0));
    }

    console.log('[Controller Handler] Points to subtract per participant:', {
      participantsAffected: pointsToSubtract.size,
    });

    // Step 3: Update participant scores in Redis and MongoDB
    const redis = redisService.getClient();
    const leaderboardKey = `session:${data.sessionId}:leaderboard`;

    for (const participant of participants) {
      const pointsToRemove = pointsToSubtract.get(participant.participantId) || 0;

      if (pointsToRemove > 0) {
        // Calculate new score
        const newScore = Math.max(0, participant.totalScore - pointsToRemove);

        // Update participant in MongoDB
        await participantsCollection.updateOne(
          { participantId: participant.participantId },
          {
            $set: { totalScore: newScore },
          }
        );

        // Update participant session in Redis
        const participantKey = `participant:${participant.participantId}:session`;
        await redis.hset(participantKey, 'totalScore', newScore.toString());

        // Update leaderboard in Redis
        // Score includes tie-breaker: totalScore - (totalTimeMs / 1000000000)
        const leaderboardScore = newScore - participant.totalTimeMs / 1000000000;
        await redis.zadd(leaderboardKey, leaderboardScore, participant.participantId);

        console.log('[Controller Handler] Updated participant score:', {
          participantId: participant.participantId,
          oldScore: participant.totalScore,
          newScore,
          pointsRemoved: pointsToRemove,
        });
      }
    }

    // Step 4: Broadcast updated leaderboard
    await broadcastService.broadcastLeaderboardUpdated(data.sessionId);

    console.log('[Controller Handler] Broadcasted updated leaderboard');

    // Step 5: Log void action in audit logs
    const auditLogsCollection = db.collection('auditLogs');
    await auditLogsCollection.insertOne({
      timestamp: new Date(),
      eventType: 'QUESTION_VOIDED' as any,
      sessionId: data.sessionId,
      quizId: session.quizId.toString(),
      details: {
        questionId: data.questionId,
        questionText: question.questionText,
        reason: data.reason,
        participantsAffected: pointsToSubtract.size,
        totalPointsRemoved: Array.from(pointsToSubtract.values()).reduce((a, b) => a + b, 0),
        voidedAt: new Date().toISOString(),
      },
    });

    console.log('[Controller Handler] Logged void action in audit logs');

    // Check if the voided question is the current active question
    // Requirements: 6.3 - If voided question was current active, trigger next question flow
    const redisState = await redisDataStructuresService.getSessionState(data.sessionId);
    const isCurrentActiveQuestion = redisState?.currentQuestionId === data.questionId && 
                                    redisState?.state === 'ACTIVE_QUESTION';

    // Send success response to controller with additional info about whether it was current question
    // Requirements: 6.4 - Controller Panel shall show confirmation that participants have been notified
    socket.emit('void_question_ack', {
      success: true,
      sessionId: data.sessionId,
      questionId: data.questionId,
      participantsAffected: pointsToSubtract.size,
      wasCurrentQuestion: isCurrentActiveQuestion,
      message: `Question voided successfully. ${pointsToSubtract.size} participant(s) affected.${isCurrentActiveQuestion ? ' Participants will be transitioned to the next question.' : ''}`,
    });

    // Broadcast void notification to all clients
    // Requirements: 6.1 - Broadcast question_voided event to all participants
    await pubSubService.broadcastToSession(data.sessionId, 'question_voided', {
      questionId: data.questionId,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    });

    // Requirements: 6.3 - If voided question was current active, trigger next question flow
    if (isCurrentActiveQuestion) {
      console.log('[Controller Handler] Voided question is current active - triggering next question flow');

      // Stop the active timer
      const timer = quizTimerManager.getTimer(data.sessionId, data.questionId);
      if (timer) {
        timer.stop();
        console.log('[Controller Handler] Stopped active timer for voided question');
      }

      // Get the current question index and total questions
      const currentQuestionIndex = redisState?.currentQuestionIndex ?? session.currentQuestionIndex;
      const nextQuestionIndex = currentQuestionIndex + 1;

      // Check if there are more questions
      if (nextQuestionIndex >= quiz.questions.length) {
        // No more questions - transition to ENDED state
        console.log('[Controller Handler] No more questions after voided question, ending quiz');

        // Update Redis state
        await redisDataStructuresService.updateSessionState(data.sessionId, {
          state: 'ENDED',
          currentQuestionIndex: currentQuestionIndex,
        });

        // Update MongoDB
        await sessionsCollection.updateOne(
          { sessionId: data.sessionId },
          {
            $set: {
              state: 'ENDED',
              endedAt: new Date(),
            },
          }
        );

        // Get final leaderboard
        const participantsWithScores = await Promise.all(
          participants.map(async (p) => {
            const participantSession = await redisDataStructuresService.getParticipantSession(p.participantId);
            const totalScore = participantSession?.totalScore ?? p.totalScore ?? 0;
            const totalTimeMs = participantSession?.totalTimeMs ?? p.totalTimeMs ?? 0;
            
            return {
              ...p,
              totalScore,
              totalTimeMs,
            };
          })
        );

        participantsWithScores.sort((a, b) => {
          if (b.totalScore !== a.totalScore) {
            return b.totalScore - a.totalScore;
          }
          return a.totalTimeMs - b.totalTimeMs;
        });

        const finalLeaderboard = participantsWithScores.map((p, index) => ({
          rank: index + 1,
          participantId: p.participantId,
          nickname: p.nickname,
          totalScore: p.totalScore,
          totalTimeMs: p.totalTimeMs,
        }));

        // Broadcast quiz_ended event
        await broadcastService.broadcastQuizEnded(data.sessionId, finalLeaderboard);

        console.log('[Controller Handler] Quiz ended after voiding last question');
      } else {
        // There are more questions - advance to next question
        const nextQuestion = quiz.questions[nextQuestionIndex];

        // Clear scoring caches for new round
        scoringService.clearQuestionCache();

        // Transition session to ACTIVE_QUESTION state with next question
        await redisDataStructuresService.updateSessionState(data.sessionId, {
          state: 'ACTIVE_QUESTION',
          currentQuestionIndex: nextQuestionIndex,
          currentQuestionId: nextQuestion.questionId,
          currentQuestionStartTime: Date.now(),
        });

        // Update MongoDB
        await sessionsCollection.updateOne(
          { sessionId: data.sessionId },
          {
            $set: {
              state: 'ACTIVE_QUESTION',
              currentQuestionIndex: nextQuestionIndex,
              currentQuestionStartTime: new Date(),
            },
          }
        );

        // Broadcast question_started event (this also starts the timer)
        await broadcastService.broadcastQuestionStarted(
          data.sessionId,
          nextQuestionIndex,
          nextQuestion.questionId
        );

        console.log('[Controller Handler] Advanced to next question after voiding:', {
          nextQuestionIndex,
          nextQuestionId: nextQuestion.questionId,
        });
      }
    }

    console.log('[Controller Handler] Successfully voided question:', {
      sessionId: data.sessionId,
      questionId: data.questionId,
      participantsAffected: pointsToSubtract.size,
      wasCurrentQuestion: isCurrentActiveQuestion,
    });
  } catch (error) {
    console.error('[Controller Handler] Error handling void_question:', error);

    socket.emit('error', {
      event: 'void_question',
      error: 'Failed to void question',
    });
  }
}

/**
 * Handle skip_question event from controller
 * 
 * Skips the current question immediately:
 * 1. Verify session is in ACTIVE_QUESTION state
 * 2. Stop the active timer immediately
 * 3. Broadcast question_skipped event to all clients
 * 4. Transition to REVEAL state (or next question if exam mode)
 * 
 * Requirements: 5.1, 5.3, 5.4
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Event data containing sessionId and optional reason
 */
async function handleSkipQuestion(
  socket: Socket,
  data: { sessionId: string; reason?: string }
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId: authenticatedSessionId } = socketData;

  try {
    console.log('[Controller Handler] Handling skip_question event:', {
      socketId: socket.id,
      sessionId: data.sessionId,
      reason: data.reason,
    });

    // Verify sessionId matches authenticated session
    if (data.sessionId !== authenticatedSessionId) {
      socket.emit('error', {
        event: 'skip_question',
        error: 'Session ID mismatch',
      });
      return;
    }

    // Get session state from Redis
    const redisState = await redisDataStructuresService.getSessionState(data.sessionId);

    if (!redisState) {
      socket.emit('error', {
        event: 'skip_question',
        error: 'Session state not found',
      });
      return;
    }

    // Verify session is in ACTIVE_QUESTION state
    if (redisState.state !== 'ACTIVE_QUESTION') {
      socket.emit('error', {
        event: 'skip_question',
        error: `Cannot skip question in ${redisState.state} state. Must be in ACTIVE_QUESTION state.`,
      });
      return;
    }

    // Get the current question ID and index
    const currentQuestionId = redisState.currentQuestionId;
    const currentQuestionIndex = redisState.currentQuestionIndex ?? 0;

    if (!currentQuestionId) {
      socket.emit('error', {
        event: 'skip_question',
        error: 'No active question found',
      });
      return;
    }

    console.log('[Controller Handler] Skipping question:', {
      sessionId: data.sessionId,
      questionId: currentQuestionId,
      questionIndex: currentQuestionIndex,
    });

    // Step 1: Stop the active timer immediately (Requirements: 5.1)
    const timer = quizTimerManager.getTimer(data.sessionId, currentQuestionId);
    if (timer) {
      timer.stop();
      console.log('[Controller Handler] Stopped active timer for skipped question');
    }

    // Get session from MongoDB to check exam mode settings
    const db = mongodbService.getDb();
    const sessionsCollection = db.collection<Session>('sessions');
    const session = await sessionsCollection.findOne({ sessionId: data.sessionId });

    // Check if exam mode with skipRevealPhase is enabled
    // Requirements: 4.2, 4.4 - Skip REVEAL state in exam mode
    const isExamModeSkipReveal = session?.examMode?.skipRevealPhase === true;

    // Step 2: Broadcast question_skipped event to all clients (Requirements: 5.3, 5.4)
    const questionSkippedEvent = {
      questionId: currentQuestionId,
      questionIndex: currentQuestionIndex,
      reason: data.reason || 'Question skipped by controller',
      timestamp: Date.now(),
      // Include exam mode flag so clients know whether to expect REVEAL or next question
      examModeSkipReveal: isExamModeSkipReveal,
    };

    await pubSubService.broadcastToSession(data.sessionId, 'question_skipped', questionSkippedEvent);

    console.log('[Controller Handler] Broadcasted question_skipped event to all clients');

    // Log skip action in audit logs
    const auditLogsCollection = db.collection('auditLogs');
    await auditLogsCollection.insertOne({
      timestamp: new Date(),
      eventType: 'QUESTION_SKIPPED' as any,
      sessionId: data.sessionId,
      details: {
        questionId: currentQuestionId,
        questionIndex: currentQuestionIndex,
        reason: data.reason || 'Question skipped by controller',
        skippedAt: new Date().toISOString(),
        examModeSkipReveal: isExamModeSkipReveal,
      },
    });

    console.log('[Controller Handler] Logged skip action in audit logs');

    // Step 3: Handle state transition based on exam mode
    if (isExamModeSkipReveal) {
      // Exam mode: Skip REVEAL and go directly to next question
      // Requirements: 4.2, 4.4
      console.log('[Controller Handler] Exam mode enabled - skipping REVEAL state');

      // Get quiz to find questions
      const quizzesCollection = db.collection<Quiz>('quizzes');
      const quiz = session ? await quizzesCollection.findOne({ _id: session.quizId }) : null;

      if (!quiz) {
        socket.emit('error', {
          event: 'skip_question',
          error: 'Quiz not found',
        });
        return;
      }

      const nextQuestionIndex = currentQuestionIndex + 1;

      // Check if there are more questions
      if (nextQuestionIndex >= quiz.questions.length) {
        // No more questions - transition to ENDED state
        console.log('[Controller Handler] No more questions after skip, ending quiz');

        await redisDataStructuresService.updateSessionState(data.sessionId, {
          state: 'ENDED',
          currentQuestionIndex: currentQuestionIndex,
          timerEndTime: undefined,
        });

        await sessionsCollection.updateOne(
          { sessionId: data.sessionId },
          { $set: { state: 'ENDED', endedAt: new Date() } }
        );

        // Get final leaderboard
        const participantsCollection = db.collection<Participant>('participants');
        const participants = await participantsCollection
          .find({ sessionId: data.sessionId, isActive: true })
          .toArray();

        const participantsWithScores = await Promise.all(
          participants.map(async (p) => {
            const participantSession = await redisDataStructuresService.getParticipantSession(p.participantId);
            return {
              ...p,
              totalScore: participantSession?.totalScore ?? p.totalScore ?? 0,
              totalTimeMs: participantSession?.totalTimeMs ?? p.totalTimeMs ?? 0,
            };
          })
        );

        participantsWithScores.sort((a, b) => {
          if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
          return a.totalTimeMs - b.totalTimeMs;
        });

        const finalLeaderboard = participantsWithScores.map((p, index) => ({
          rank: index + 1,
          participantId: p.participantId,
          nickname: p.nickname,
          totalScore: p.totalScore,
          totalTimeMs: p.totalTimeMs,
        }));

        await broadcastService.broadcastQuizEnded(data.sessionId, finalLeaderboard);

        socket.emit('skip_question_ack', {
          success: true,
          sessionId: data.sessionId,
          questionId: currentQuestionId,
          questionIndex: currentQuestionIndex,
          message: 'Question skipped - Quiz ended (no more questions)',
          quizEnded: true,
          finalLeaderboard,
        });
      } else {
        // More questions - go directly to next question
        const nextQuestion = quiz.questions[nextQuestionIndex];

        await redisDataStructuresService.updateSessionState(data.sessionId, {
          state: 'ACTIVE_QUESTION',
          currentQuestionIndex: nextQuestionIndex,
          currentQuestionId: nextQuestion.questionId,
          currentQuestionStartTime: Date.now(),
          timerEndTime: undefined,
        });

        await sessionsCollection.updateOne(
          { sessionId: data.sessionId },
          {
            $set: {
              state: 'ACTIVE_QUESTION',
              currentQuestionIndex: nextQuestionIndex,
              currentQuestionStartTime: new Date(),
            },
          }
        );

        console.log('[Controller Handler] Exam mode: Transitioning directly to next question:', {
          sessionId: data.sessionId,
          nextQuestionIndex,
          nextQuestionId: nextQuestion.questionId,
        });

        // Broadcast question_started event (this also starts the timer)
        await broadcastService.broadcastQuestionStarted(
          data.sessionId,
          nextQuestionIndex,
          nextQuestion.questionId
        );

        socket.emit('skip_question_ack', {
          success: true,
          sessionId: data.sessionId,
          questionId: currentQuestionId,
          questionIndex: currentQuestionIndex,
          message: 'Question skipped - Advanced to next question (exam mode)',
          quizEnded: false,
          nextQuestionIndex,
        });
      }

      console.log('[Controller Handler] Successfully skipped question (exam mode):', {
        sessionId: data.sessionId,
        questionId: currentQuestionId,
        questionIndex: currentQuestionIndex,
      });
    } else {
      // Normal mode: Transition to REVEAL state
      await redisDataStructuresService.updateSessionState(data.sessionId, {
        state: 'REVEAL',
        timerEndTime: undefined, // Clear timer end time
      });

      await sessionsCollection.updateOne(
        { sessionId: data.sessionId },
        { $set: { state: 'REVEAL' } }
      );

      console.log('[Controller Handler] Session state transitioned to REVEAL');

      // Send success response to controller
      socket.emit('skip_question_ack', {
        success: true,
        sessionId: data.sessionId,
        questionId: currentQuestionId,
        questionIndex: currentQuestionIndex,
        message: 'Question skipped successfully',
      });

      console.log('[Controller Handler] Successfully skipped question:', {
        sessionId: data.sessionId,
        questionId: currentQuestionId,
        questionIndex: currentQuestionIndex,
      });
    }
  } catch (error) {
    console.error('[Controller Handler] Error handling skip_question:', error);

    socket.emit('error', {
      event: 'skip_question',
      error: 'Failed to skip question',
    });
  }
}

/**
 * Handle pause_timer event from controller
 * 
 * Pauses the countdown timer for the current question.
 * The timer can be resumed later with resume_timer.
 * 
 * Steps:
 * 1. Verify session is in ACTIVE_QUESTION state
 * 2. Get the current timer for the session
 * 3. Pause the timer
 * 4. Update timer state in Redis (store remaining time)
 * 5. Broadcast timer_paused event to all clients
 * 
 * Requirements: 10.6
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Event data containing sessionId
 */
async function handlePauseTimer(
  socket: Socket,
  data: { sessionId: string }
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId: authenticatedSessionId } = socketData;

  try {
    console.log('[Controller Handler] Handling pause_timer event:', {
      socketId: socket.id,
      sessionId: data.sessionId,
    });

    // Verify sessionId matches authenticated session
    if (data.sessionId !== authenticatedSessionId) {
      socket.emit('error', {
        event: 'pause_timer',
        error: 'Session ID mismatch',
      });
      return;
    }

    // Get session state from Redis
    const redisState = await redisDataStructuresService.getSessionState(data.sessionId);

    if (!redisState) {
      socket.emit('error', {
        event: 'pause_timer',
        error: 'Session state not found',
      });
      return;
    }

    // Verify session is in ACTIVE_QUESTION state
    if (redisState.state !== 'ACTIVE_QUESTION') {
      socket.emit('error', {
        event: 'pause_timer',
        error: `Cannot pause timer in ${redisState.state} state. Must be in ACTIVE_QUESTION state.`,
      });
      return;
    }

    // Get the current question ID
    const currentQuestionId = redisState.currentQuestionId;
    if (!currentQuestionId) {
      socket.emit('error', {
        event: 'pause_timer',
        error: 'No active question found',
      });
      return;
    }

    // Get the timer for this question
    const timer = quizTimerManager.getTimer(data.sessionId, currentQuestionId);
    if (!timer) {
      socket.emit('error', {
        event: 'pause_timer',
        error: 'Timer not found for current question',
      });
      return;
    }

    // Check if timer is already paused (not ticking but still running)
    if (!timer.getIsRunning()) {
      socket.emit('error', {
        event: 'pause_timer',
        error: 'Timer is not running',
      });
      return;
    }

    // Get remaining time before pausing
    const remainingSeconds = timer.getRemainingSeconds();

    // Pause the timer
    timer.pause();

    console.log('[Controller Handler] Timer paused:', {
      sessionId: data.sessionId,
      questionId: currentQuestionId,
      remainingSeconds,
    });

    // Update timer state in Redis to store paused state and remaining time
    await redisDataStructuresService.updateSessionState(data.sessionId, {
      timerEndTime: Date.now() + (remainingSeconds * 1000), // Store as if timer will end at this time
    });

    // Store paused state in Redis (using a separate key for timer control state)
    const redis = redisService.getClient();
    await redis.hset(`session:${data.sessionId}:timer`, {
      isPaused: 'true',
      pausedAt: Date.now().toString(),
      remainingSeconds: remainingSeconds.toString(),
    });
    await redis.expire(`session:${data.sessionId}:timer`, 21600); // 6 hours TTL

    // Broadcast timer_paused event to all clients
    await pubSubService.broadcastToSession(data.sessionId, 'timer_paused', {
      questionId: currentQuestionId,
      remainingSeconds,
      pausedAt: Date.now(),
    });

    console.log('[Controller Handler] Broadcasted timer_paused event');

    // Send success response to controller
    socket.emit('pause_timer_ack', {
      success: true,
      sessionId: data.sessionId,
      questionId: currentQuestionId,
      remainingSeconds,
      message: `Timer paused with ${remainingSeconds} seconds remaining`,
    });

    // Log the action in audit logs
    const db = mongodbService.getDb();
    const auditLogsCollection = db.collection('auditLogs');
    await auditLogsCollection.insertOne({
      timestamp: new Date(),
      eventType: 'TIMER_PAUSED' as any,
      sessionId: data.sessionId,
      details: {
        questionId: currentQuestionId,
        remainingSeconds,
        pausedAt: new Date().toISOString(),
      },
    });

    console.log('[Controller Handler] Successfully paused timer:', {
      sessionId: data.sessionId,
      questionId: currentQuestionId,
      remainingSeconds,
    });
  } catch (error) {
    console.error('[Controller Handler] Error handling pause_timer:', error);

    socket.emit('error', {
      event: 'pause_timer',
      error: 'Failed to pause timer',
    });
  }
}

/**
 * Handle resume_timer event from controller
 * 
 * Resumes a paused countdown timer for the current question.
 * 
 * Steps:
 * 1. Verify session is in ACTIVE_QUESTION state
 * 2. Verify timer is currently paused
 * 3. Resume the timer with remaining time
 * 4. Update timer state in Redis
 * 5. Broadcast timer_resumed event to all clients
 * 
 * Requirements: 10.6
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Event data containing sessionId
 */
async function handleResumeTimer(
  socket: Socket,
  data: { sessionId: string }
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId: authenticatedSessionId } = socketData;

  try {
    console.log('[Controller Handler] Handling resume_timer event:', {
      socketId: socket.id,
      sessionId: data.sessionId,
    });

    // Verify sessionId matches authenticated session
    if (data.sessionId !== authenticatedSessionId) {
      socket.emit('error', {
        event: 'resume_timer',
        error: 'Session ID mismatch',
      });
      return;
    }

    // Get session state from Redis
    const redisState = await redisDataStructuresService.getSessionState(data.sessionId);

    if (!redisState) {
      socket.emit('error', {
        event: 'resume_timer',
        error: 'Session state not found',
      });
      return;
    }

    // Verify session is in ACTIVE_QUESTION state
    if (redisState.state !== 'ACTIVE_QUESTION') {
      socket.emit('error', {
        event: 'resume_timer',
        error: `Cannot resume timer in ${redisState.state} state. Must be in ACTIVE_QUESTION state.`,
      });
      return;
    }

    // Get the current question ID
    const currentQuestionId = redisState.currentQuestionId;
    if (!currentQuestionId) {
      socket.emit('error', {
        event: 'resume_timer',
        error: 'No active question found',
      });
      return;
    }

    // Check if timer is paused
    const redis = redisService.getClient();
    const timerState = await redis.hgetall(`session:${data.sessionId}:timer`);

    if (!timerState || timerState.isPaused !== 'true') {
      socket.emit('error', {
        event: 'resume_timer',
        error: 'Timer is not paused',
      });
      return;
    }

    // Get the timer for this question
    const timer = quizTimerManager.getTimer(data.sessionId, currentQuestionId);
    if (!timer) {
      socket.emit('error', {
        event: 'resume_timer',
        error: 'Timer not found for current question',
      });
      return;
    }

    // Get remaining seconds from stored state
    const remainingSeconds = parseInt(timerState.remainingSeconds || '0', 10);

    if (remainingSeconds <= 0) {
      socket.emit('error', {
        event: 'resume_timer',
        error: 'Timer has already expired',
      });
      return;
    }

    // Calculate new end time
    const newEndTime = Date.now() + (remainingSeconds * 1000);

    // Resume the timer
    await timer.resume();

    console.log('[Controller Handler] Timer resumed:', {
      sessionId: data.sessionId,
      questionId: currentQuestionId,
      remainingSeconds,
    });

    // Update timer state in Redis
    await redisDataStructuresService.updateSessionState(data.sessionId, {
      timerEndTime: newEndTime,
    });

    // Clear paused state in Redis
    await redis.hset(`session:${data.sessionId}:timer`, {
      isPaused: 'false',
      resumedAt: Date.now().toString(),
    });

    // Broadcast timer_resumed event to all clients
    await pubSubService.broadcastToSession(data.sessionId, 'timer_resumed', {
      questionId: currentQuestionId,
      remainingSeconds,
      endTime: newEndTime,
      serverTime: Date.now(),
    });

    console.log('[Controller Handler] Broadcasted timer_resumed event');

    // Send success response to controller
    socket.emit('resume_timer_ack', {
      success: true,
      sessionId: data.sessionId,
      questionId: currentQuestionId,
      remainingSeconds,
      endTime: newEndTime,
      message: `Timer resumed with ${remainingSeconds} seconds remaining`,
    });

    // Log the action in audit logs
    const db = mongodbService.getDb();
    const auditLogsCollection = db.collection('auditLogs');
    await auditLogsCollection.insertOne({
      timestamp: new Date(),
      eventType: 'TIMER_RESUMED' as any,
      sessionId: data.sessionId,
      details: {
        questionId: currentQuestionId,
        remainingSeconds,
        resumedAt: new Date().toISOString(),
      },
    });

    console.log('[Controller Handler] Successfully resumed timer:', {
      sessionId: data.sessionId,
      questionId: currentQuestionId,
      remainingSeconds,
    });
  } catch (error) {
    console.error('[Controller Handler] Error handling resume_timer:', error);

    socket.emit('error', {
      event: 'resume_timer',
      error: 'Failed to resume timer',
    });
  }
}

/**
 * Handle reset_timer event from controller
 * 
 * Resets the countdown timer to a new time limit for the current question.
 * This can be used to extend or shorten the remaining time.
 * 
 * Steps:
 * 1. Verify session is in ACTIVE_QUESTION state
 * 2. Validate new time limit (5-120 seconds)
 * 3. Reset the timer with new time limit
 * 4. Update timer state in Redis
 * 5. Broadcast timer_reset event to all clients
 * 
 * Requirements: 10.6
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Event data containing sessionId and newTimeLimit
 */
async function handleResetTimer(
  socket: Socket,
  data: { sessionId: string; newTimeLimit: number }
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId: authenticatedSessionId } = socketData;

  try {
    console.log('[Controller Handler] Handling reset_timer event:', {
      socketId: socket.id,
      sessionId: data.sessionId,
      newTimeLimit: data.newTimeLimit,
    });

    // Verify sessionId matches authenticated session
    if (data.sessionId !== authenticatedSessionId) {
      socket.emit('error', {
        event: 'reset_timer',
        error: 'Session ID mismatch',
      });
      return;
    }

    // Validate new time limit
    if (!data.newTimeLimit || typeof data.newTimeLimit !== 'number') {
      socket.emit('error', {
        event: 'reset_timer',
        error: 'New time limit is required',
      });
      return;
    }

    if (data.newTimeLimit < 5 || data.newTimeLimit > 120) {
      socket.emit('error', {
        event: 'reset_timer',
        error: 'New time limit must be between 5 and 120 seconds',
      });
      return;
    }

    // Get session state from Redis
    const redisState = await redisDataStructuresService.getSessionState(data.sessionId);

    if (!redisState) {
      socket.emit('error', {
        event: 'reset_timer',
        error: 'Session state not found',
      });
      return;
    }

    // Verify session is in ACTIVE_QUESTION state
    if (redisState.state !== 'ACTIVE_QUESTION') {
      socket.emit('error', {
        event: 'reset_timer',
        error: `Cannot reset timer in ${redisState.state} state. Must be in ACTIVE_QUESTION state.`,
      });
      return;
    }

    // Get the current question ID
    const currentQuestionId = redisState.currentQuestionId;
    if (!currentQuestionId) {
      socket.emit('error', {
        event: 'reset_timer',
        error: 'No active question found',
      });
      return;
    }

    // Get the timer for this question
    const timer = quizTimerManager.getTimer(data.sessionId, currentQuestionId);
    if (!timer) {
      socket.emit('error', {
        event: 'reset_timer',
        error: 'Timer not found for current question',
      });
      return;
    }

    // Get old remaining time for logging
    const oldRemainingSeconds = timer.getRemainingSeconds();

    // Reset the timer with new time limit
    await timer.reset(data.newTimeLimit);

    // Calculate new end time
    const newEndTime = Date.now() + (data.newTimeLimit * 1000);

    console.log('[Controller Handler] Timer reset:', {
      sessionId: data.sessionId,
      questionId: currentQuestionId,
      oldRemainingSeconds,
      newTimeLimit: data.newTimeLimit,
    });

    // Update timer state in Redis
    await redisDataStructuresService.updateSessionState(data.sessionId, {
      timerEndTime: newEndTime,
      currentQuestionStartTime: Date.now(),
    });

    // Clear any paused state in Redis
    const redis = redisService.getClient();
    await redis.hset(`session:${data.sessionId}:timer`, {
      isPaused: 'false',
      resetAt: Date.now().toString(),
      newTimeLimit: data.newTimeLimit.toString(),
    });

    // Broadcast timer_reset event to all clients
    await pubSubService.broadcastToSession(data.sessionId, 'timer_reset', {
      questionId: currentQuestionId,
      newTimeLimit: data.newTimeLimit,
      startTime: Date.now(),
      endTime: newEndTime,
      serverTime: Date.now(),
    });

    console.log('[Controller Handler] Broadcasted timer_reset event');

    // Send success response to controller
    socket.emit('reset_timer_ack', {
      success: true,
      sessionId: data.sessionId,
      questionId: currentQuestionId,
      newTimeLimit: data.newTimeLimit,
      endTime: newEndTime,
      message: `Timer reset to ${data.newTimeLimit} seconds`,
    });

    // Log the action in audit logs
    const db = mongodbService.getDb();
    const auditLogsCollection = db.collection('auditLogs');
    await auditLogsCollection.insertOne({
      timestamp: new Date(),
      eventType: 'TIMER_RESET' as any,
      sessionId: data.sessionId,
      details: {
        questionId: currentQuestionId,
        oldRemainingSeconds,
        newTimeLimit: data.newTimeLimit,
        resetAt: new Date().toISOString(),
      },
    });

    console.log('[Controller Handler] Successfully reset timer:', {
      sessionId: data.sessionId,
      questionId: currentQuestionId,
      newTimeLimit: data.newTimeLimit,
    });
  } catch (error) {
    console.error('[Controller Handler] Error handling reset_timer:', error);

    socket.emit('error', {
      event: 'reset_timer',
      error: 'Failed to reset timer',
    });
  }
}

/**
 * Handle kick_participant event from controller
 * 
 * Kicks a participant from the quiz session:
 * 1. Verify session exists and participant is valid
 * 2. Disconnect participant's WebSocket connection
 * 3. Mark participant as inactive in Redis and MongoDB
 * 4. Remove from active participants list
 * 5. Emit kicked event to participant with reason
 * 6. Broadcast participant_left to other clients
 * 7. Log kick action in audit logs
 * 
 * Requirements: 9.6, 10.2, 10.7, 10.8
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Event data containing sessionId, participantId, and reason
 */
async function handleKickParticipant(
  socket: Socket,
  data: { sessionId: string; participantId: string; reason: string }
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId: authenticatedSessionId } = socketData;

  try {
    console.log('[Controller Handler] Handling kick_participant event:', {
      socketId: socket.id,
      sessionId: data.sessionId,
      participantId: data.participantId,
      reason: data.reason,
    });

    // Verify sessionId matches authenticated session
    if (data.sessionId !== authenticatedSessionId) {
      socket.emit('error', {
        event: 'kick_participant',
        error: 'Session ID mismatch',
      });
      return;
    }

    // Validate required fields
    if (!data.participantId) {
      socket.emit('error', {
        event: 'kick_participant',
        error: 'Participant ID is required',
      });
      return;
    }

    if (!data.reason || data.reason.trim().length === 0) {
      socket.emit('error', {
        event: 'kick_participant',
        error: 'Reason for kicking is required',
      });
      return;
    }

    // Get session from MongoDB
    const db = mongodbService.getDb();
    const sessionsCollection = db.collection<Session>('sessions');
    const session = await sessionsCollection.findOne({ sessionId: data.sessionId });

    if (!session) {
      socket.emit('error', {
        event: 'kick_participant',
        error: 'Session not found',
      });
      return;
    }

    // Get participant from MongoDB
    const participantsCollection = db.collection<Participant>('participants');
    const participant = await participantsCollection.findOne({
      participantId: data.participantId,
      sessionId: data.sessionId,
    });

    if (!participant) {
      socket.emit('error', {
        event: 'kick_participant',
        error: 'Participant not found in this session',
      });
      return;
    }

    // Check if participant is already inactive
    if (!participant.isActive) {
      socket.emit('error', {
        event: 'kick_participant',
        error: 'Participant is already inactive',
      });
      return;
    }

    console.log('[Controller Handler] Kicking participant:', {
      sessionId: data.sessionId,
      participantId: data.participantId,
      nickname: participant.nickname,
    });

    // Step 1: Get participant's socket ID from Redis to disconnect them
    const participantSession = await redisDataStructuresService.getParticipantSession(
      data.participantId
    );

    const participantSocketId = participantSession?.socketId;

    // Step 2: Emit kicked event to participant BEFORE disconnecting
    // This ensures the participant receives the reason for being kicked
    if (participantSocketId) {
      // Use pubSubService to send kicked event to the specific participant
      await pubSubService.publishToParticipant(data.participantId, 'kicked', {
        reason: data.reason,
        message: `You have been removed from the quiz: ${data.reason}`,
        timestamp: new Date().toISOString(),
      });

      console.log('[Controller Handler] Sent kicked event to participant:', {
        participantId: data.participantId,
        socketId: participantSocketId,
      });

      // Step 3: Disconnect participant's WebSocket connection
      // Get the Socket.IO server instance and disconnect the socket
      const { socketIOService } = await import('../services/socketio.service');
      const io = socketIOService.getIO();
      
      // Fetch all sockets and find the one matching the participant's socket ID
      const sockets = await io.fetchSockets();
      const participantSocket = sockets.find(s => s.id === participantSocketId);
      
      if (participantSocket) {
        // Disconnect the socket (server-initiated disconnect)
        participantSocket.disconnect(true);
        console.log('[Controller Handler] Disconnected participant socket:', {
          participantId: data.participantId,
          socketId: participantSocketId,
        });
      } else {
        console.log('[Controller Handler] Participant socket not found (may already be disconnected):', {
          participantId: data.participantId,
          socketId: participantSocketId,
        });
      }
    } else {
      console.log('[Controller Handler] Participant has no active socket connection:', {
        participantId: data.participantId,
      });
    }

    // Step 4: Mark participant as inactive in Redis
    await redisDataStructuresService.updateParticipantSession(data.participantId, {
      isActive: false,
      socketId: '', // Clear socket ID
    });

    console.log('[Controller Handler] Updated participant status in Redis');

    // Step 5: Mark participant as inactive in MongoDB
    await participantsCollection.updateOne(
      { participantId: data.participantId },
      {
        $set: {
          isActive: false,
        },
      }
    );

    console.log('[Controller Handler] Updated participant status in MongoDB');

    // Step 6: Remove from active participants list in session
    // Update session's activeParticipants array and participant count
    const updatedActiveParticipants = (session.activeParticipants || []).filter(
      (id: string) => id !== data.participantId
    );

    await sessionsCollection.updateOne(
      { sessionId: data.sessionId },
      {
        $set: {
          activeParticipants: updatedActiveParticipants,
        },
        $inc: {
          participantCount: -1,
        },
      }
    );

    // Update participant count in Redis
    const redisState = await redisDataStructuresService.getSessionState(data.sessionId);
    const newParticipantCount = Math.max(0, (redisState?.participantCount || 1) - 1);
    
    await redisDataStructuresService.updateSessionState(data.sessionId, {
      participantCount: newParticipantCount,
    });

    console.log('[Controller Handler] Removed participant from active list:', {
      sessionId: data.sessionId,
      newParticipantCount,
    });

    // Step 7: Remove participant from leaderboard in Redis
    const redis = redisService.getClient();
    const leaderboardKey = `session:${data.sessionId}:leaderboard`;
    await redis.zrem(leaderboardKey, data.participantId);

    console.log('[Controller Handler] Removed participant from leaderboard');

    // Step 8: Broadcast participant_left to other clients
    await pubSubService.broadcastToSession(data.sessionId, 'participant_left', {
      participantId: data.participantId,
      nickname: participant.nickname,
      participantCount: newParticipantCount,
      reason: 'kicked',
      timestamp: new Date().toISOString(),
    });

    // Also broadcast participant_kicked event for clients that want more detail
    await pubSubService.broadcastToSession(data.sessionId, 'participant_kicked', {
      participantId: data.participantId,
      nickname: participant.nickname,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    });

    console.log('[Controller Handler] Broadcasted participant_left and participant_kicked events');

    // Step 9: Log kick action in audit logs
    // Use security logging service for comprehensive security event tracking
    const { securityLoggingService } = await import('../services/security-logging.service');
    await securityLoggingService.logParticipantKicked({
      sessionId: data.sessionId,
      participantId: data.participantId,
      nickname: participant.nickname,
      ipAddress: participant.ipAddress,
      reason: data.reason,
      kickedBy: 'controller', // Could be enhanced to track which controller
    });

    console.log('[Controller Handler] Logged kick action via security logging service');

    // Send success response to controller
    socket.emit('kick_participant_ack', {
      success: true,
      sessionId: data.sessionId,
      participantId: data.participantId,
      nickname: participant.nickname,
      message: `Participant "${participant.nickname}" has been kicked from the session`,
    });

    console.log('[Controller Handler] Successfully kicked participant:', {
      sessionId: data.sessionId,
      participantId: data.participantId,
      nickname: participant.nickname,
    });
  } catch (error) {
    console.error('[Controller Handler] Error handling kick_participant:', error);

    socket.emit('error', {
      event: 'kick_participant',
      error: 'Failed to kick participant',
    });
  }
}

/**
 * Handle ban_participant event from controller
 * 
 * Bans a participant from the quiz session:
 * 1. Verify session exists and participant is valid
 * 2. Disconnect participant's WebSocket connection
 * 3. Mark participant as banned in Redis and MongoDB
 * 4. Add IP address to ban list for session
 * 5. Emit banned event to participant with reason
 * 6. Prevent rejoining with same IP
 * 7. Broadcast participant_left to other clients
 * 8. Log ban action in audit logs
 * 
 * Requirements: 9.7, 10.3, 10.7, 10.8
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Event data containing sessionId, participantId, and reason
 */
async function handleBanParticipant(
  socket: Socket,
  data: { sessionId: string; participantId: string; reason: string }
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId: authenticatedSessionId } = socketData;

  try {
    console.log('[Controller Handler] Handling ban_participant event:', {
      socketId: socket.id,
      sessionId: data.sessionId,
      participantId: data.participantId,
      reason: data.reason,
    });

    // Verify sessionId matches authenticated session
    if (data.sessionId !== authenticatedSessionId) {
      socket.emit('error', {
        event: 'ban_participant',
        error: 'Session ID mismatch',
      });
      return;
    }

    // Validate required fields
    if (!data.participantId) {
      socket.emit('error', {
        event: 'ban_participant',
        error: 'Participant ID is required',
      });
      return;
    }

    if (!data.reason || data.reason.trim().length === 0) {
      socket.emit('error', {
        event: 'ban_participant',
        error: 'Reason for banning is required',
      });
      return;
    }

    // Get session from MongoDB
    const db = mongodbService.getDb();
    const sessionsCollection = db.collection<Session>('sessions');
    const session = await sessionsCollection.findOne({ sessionId: data.sessionId });

    if (!session) {
      socket.emit('error', {
        event: 'ban_participant',
        error: 'Session not found',
      });
      return;
    }

    // Get participant from MongoDB
    const participantsCollection = db.collection<Participant>('participants');
    const participant = await participantsCollection.findOne({
      participantId: data.participantId,
      sessionId: data.sessionId,
    });

    if (!participant) {
      socket.emit('error', {
        event: 'ban_participant',
        error: 'Participant not found in this session',
      });
      return;
    }

    // Check if participant is already banned
    if (participant.isBanned) {
      socket.emit('error', {
        event: 'ban_participant',
        error: 'Participant is already banned',
      });
      return;
    }

    console.log('[Controller Handler] Banning participant:', {
      sessionId: data.sessionId,
      participantId: data.participantId,
      nickname: participant.nickname,
      ipAddress: participant.ipAddress,
    });

    // Step 1: Get participant's socket ID from Redis to disconnect them
    const participantSession = await redisDataStructuresService.getParticipantSession(
      data.participantId
    );

    const participantSocketId = participantSession?.socketId;

    // Step 2: Emit banned event to participant BEFORE disconnecting
    // This ensures the participant receives the reason for being banned
    if (participantSocketId) {
      // Use pubSubService to send banned event to the specific participant
      await pubSubService.publishToParticipant(data.participantId, 'banned', {
        reason: data.reason,
        message: `You have been banned from the quiz: ${data.reason}`,
        timestamp: new Date().toISOString(),
      });

      console.log('[Controller Handler] Sent banned event to participant:', {
        participantId: data.participantId,
        socketId: participantSocketId,
      });

      // Step 3: Disconnect participant's WebSocket connection
      // Get the Socket.IO server instance and disconnect the socket
      const { socketIOService } = await import('../services/socketio.service');
      const io = socketIOService.getIO();
      
      // Fetch all sockets and find the one matching the participant's socket ID
      const sockets = await io.fetchSockets();
      const participantSocket = sockets.find(s => s.id === participantSocketId);
      
      if (participantSocket) {
        // Disconnect the socket (server-initiated disconnect)
        participantSocket.disconnect(true);
        console.log('[Controller Handler] Disconnected participant socket:', {
          participantId: data.participantId,
          socketId: participantSocketId,
        });
      } else {
        console.log('[Controller Handler] Participant socket not found (may already be disconnected):', {
          participantId: data.participantId,
          socketId: participantSocketId,
        });
      }
    } else {
      console.log('[Controller Handler] Participant has no active socket connection:', {
        participantId: data.participantId,
      });
    }

    // Step 4: Mark participant as banned in Redis
    await redisDataStructuresService.updateParticipantSession(data.participantId, {
      isActive: false,
      socketId: '', // Clear socket ID
    });

    // Also set isBanned flag in Redis participant session
    const redis = redisService.getClient();
    const participantKey = `participant:${data.participantId}:session`;
    await redis.hset(participantKey, 'isBanned', 'true');

    console.log('[Controller Handler] Updated participant status in Redis (banned)');

    // Step 5: Mark participant as banned in MongoDB
    await participantsCollection.updateOne(
      { participantId: data.participantId },
      {
        $set: {
          isActive: false,
          isBanned: true,
        },
      }
    );

    console.log('[Controller Handler] Updated participant status in MongoDB (banned)');

    // Step 6: Add IP address to ban list for session in Redis
    // This prevents rejoining with the same IP
    const banListKey = `session:${data.sessionId}:banned_ips`;
    await redis.sadd(banListKey, participant.ipAddress);
    // Set TTL to match session lifetime (6 hours)
    await redis.expire(banListKey, 21600);

    console.log('[Controller Handler] Added IP to ban list:', {
      sessionId: data.sessionId,
      ipAddress: participant.ipAddress,
    });

    // Step 7: Remove from active participants list in session
    // Update session's activeParticipants array and participant count
    const updatedActiveParticipants = (session.activeParticipants || []).filter(
      (id: string) => id !== data.participantId
    );

    await sessionsCollection.updateOne(
      { sessionId: data.sessionId },
      {
        $set: {
          activeParticipants: updatedActiveParticipants,
        },
        $inc: {
          participantCount: -1,
        },
      }
    );

    // Update participant count in Redis
    const redisState = await redisDataStructuresService.getSessionState(data.sessionId);
    const newParticipantCount = Math.max(0, (redisState?.participantCount || 1) - 1);
    
    await redisDataStructuresService.updateSessionState(data.sessionId, {
      participantCount: newParticipantCount,
    });

    console.log('[Controller Handler] Removed participant from active list:', {
      sessionId: data.sessionId,
      newParticipantCount,
    });

    // Step 8: Remove participant from leaderboard in Redis
    const leaderboardKey = `session:${data.sessionId}:leaderboard`;
    await redis.zrem(leaderboardKey, data.participantId);

    console.log('[Controller Handler] Removed participant from leaderboard');

    // Step 9: Broadcast participant_left to other clients
    await pubSubService.broadcastToSession(data.sessionId, 'participant_left', {
      participantId: data.participantId,
      nickname: participant.nickname,
      participantCount: newParticipantCount,
      reason: 'banned',
      timestamp: new Date().toISOString(),
    });

    // Also broadcast participant_banned event for clients that want more detail
    await pubSubService.broadcastToSession(data.sessionId, 'participant_banned', {
      participantId: data.participantId,
      nickname: participant.nickname,
      reason: data.reason,
      timestamp: new Date().toISOString(),
    });

    console.log('[Controller Handler] Broadcasted participant_left and participant_banned events');

    // Step 10: Log ban action in audit logs
    // Use security logging service for comprehensive security event tracking
    const { securityLoggingService } = await import('../services/security-logging.service');
    await securityLoggingService.logParticipantBanned({
      sessionId: data.sessionId,
      participantId: data.participantId,
      nickname: participant.nickname,
      ipAddress: participant.ipAddress,
      reason: data.reason,
      bannedBy: 'controller', // Could be enhanced to track which controller
    });

    console.log('[Controller Handler] Logged ban action via security logging service');

    // Send success response to controller
    socket.emit('ban_participant_ack', {
      success: true,
      sessionId: data.sessionId,
      participantId: data.participantId,
      nickname: participant.nickname,
      ipAddress: participant.ipAddress,
      message: `Participant "${participant.nickname}" has been banned from the session`,
    });

    console.log('[Controller Handler] Successfully banned participant:', {
      sessionId: data.sessionId,
      participantId: data.participantId,
      nickname: participant.nickname,
      ipAddress: participant.ipAddress,
    });
  } catch (error) {
    console.error('[Controller Handler] Error handling ban_participant:', error);

    socket.emit('error', {
      event: 'ban_participant',
      error: 'Failed to ban participant',
    });
  }
}

/**
 * Handle toggle_late_joiners event from controller
 * 
 * Allows the controller to enable/disable late joining during a quiz.
 * When enabled, participants can join after the quiz has started (as spectators).
 * When disabled, only participants who joined during LOBBY can participate.
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Event data containing sessionId and allowLateJoiners flag
 */
async function handleToggleLateJoiners(
  socket: Socket,
  data: { sessionId: string; allowLateJoiners: boolean }
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId: authenticatedSessionId } = socketData;

  try {
    console.log('[Controller Handler] Handling toggle_late_joiners event:', {
      socketId: socket.id,
      sessionId: data.sessionId,
      allowLateJoiners: data.allowLateJoiners,
    });

    // Verify sessionId matches authenticated session
    if (data.sessionId !== authenticatedSessionId) {
      socket.emit('error', {
        event: 'toggle_late_joiners',
        error: 'Session ID mismatch',
      });
      return;
    }

    // Update MongoDB
    const db = mongodbService.getDb();
    const sessionsCollection = db.collection<Session>('sessions');
    
    const result = await sessionsCollection.updateOne(
      { sessionId: data.sessionId },
      { $set: { allowLateJoiners: data.allowLateJoiners } }
    );

    if (result.matchedCount === 0) {
      socket.emit('error', {
        event: 'toggle_late_joiners',
        error: 'Session not found',
      });
      return;
    }

    // Broadcast the setting change to big screen so it can show/hide join code
    await broadcastService.broadcastToBigScreen(data.sessionId, 'late_joiners_updated', {
      allowLateJoiners: data.allowLateJoiners,
    });

    // Send acknowledgment to controller
    socket.emit('toggle_late_joiners_ack', {
      success: true,
      sessionId: data.sessionId,
      allowLateJoiners: data.allowLateJoiners,
    });

    console.log('[Controller Handler] Successfully toggled late joiners:', {
      sessionId: data.sessionId,
      allowLateJoiners: data.allowLateJoiners,
    });
  } catch (error) {
    console.error('[Controller Handler] Error handling toggle_late_joiners:', error);

    socket.emit('error', {
      event: 'toggle_late_joiners',
      error: 'Failed to toggle late joiners setting',
    });
  }
}

/**
 * Set up event handlers for controller actions
 * 
 * This will be expanded in future tasks to handle:
 * - start_quiz (Task 24.1) ✅
 * - next_question (Task 24.2) ✅
 * - void_question (Task 24.3) ✅
 * - pause_timer / resume_timer / reset_timer (Task 24.4) ✅
 * - kick_participant (Task 25.1) ✅
 * - ban_participant (Task 25.2) ✅
 * 
 * @param socket - Socket.IO socket instance
 */
function setupControllerEventHandlers(socket: Socket): void {
  const socketData = socket.data as SocketData;
  const { sessionId } = socketData;

  // Task 24.1: Handle start_quiz event
  socket.on('start_quiz', async (data: { sessionId: string }) => {
    await handleStartQuiz(socket, data);
  });

  // Task 24.2: Handle next_question event
  socket.on('next_question', async (data: { sessionId: string }) => {
    await handleNextQuestion(socket, data);
  });

  // Task 24.3: Handle void_question event
  socket.on('void_question', async (data: { sessionId: string; questionId: string; reason: string }) => {
    await handleVoidQuestion(socket, data);
  });

  // Task 3.1: Handle skip_question event (Requirements: 5.1, 5.3, 5.4)
  socket.on('skip_question', async (data: { sessionId: string; reason?: string }) => {
    await handleSkipQuestion(socket, data);
  });

  // Task 24.4: Handle timer control events
  socket.on('pause_timer', async (data: { sessionId: string }) => {
    await handlePauseTimer(socket, data);
  });

  socket.on('resume_timer', async (data: { sessionId: string }) => {
    await handleResumeTimer(socket, data);
  });

  socket.on('reset_timer', async (data: { sessionId: string; newTimeLimit: number }) => {
    await handleResetTimer(socket, data);
  });

  // Task 25.1: Handle kick_participant event
  socket.on('kick_participant', async (data: { sessionId: string; participantId: string; reason: string }) => {
    await handleKickParticipant(socket, data);
  });

  // Task 25.2: Handle ban_participant event
  socket.on('ban_participant', async (data: { sessionId: string; participantId: string; reason: string }) => {
    await handleBanParticipant(socket, data);
  });

  // Handle end_quiz event
  socket.on('end_quiz', async (data: { sessionId: string }) => {
    await handleEndQuiz(socket, data);
  });

  // Handle toggle_late_joiners event
  socket.on('toggle_late_joiners', async (data: { sessionId: string; allowLateJoiners: boolean }) => {
    await handleToggleLateJoiners(socket, data);
  });

  console.log('[Controller Handler] Event handlers set up for controller:', {
    socketId: socket.id,
    sessionId,
  });
}
