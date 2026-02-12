/**
 * Participant WebSocket Connection Handler
 * 
 * Handles WebSocket connections for participants:
 * - Verifies session token on connection (done in middleware)
 * - Stores participant data in socket.data (done in middleware)
 * - Subscribes to participant-specific channels (done in pubSubService)
 * - Emits authenticated event with current session state
 * - Handles disconnection and cleanup
 * 
 * Requirements: 5.1, 9.8
 */

import { Socket } from 'socket.io';
import { SocketData } from '../middleware/socket-auth';
import { redisService } from '../services/redis.service';
import { mongodbService } from '../services/mongodb.service';
import { performanceLoggingService } from '../services/performance-logging.service';
import { Session } from '../models/types';

/**
 * Handle participant connection
 * 
 * Called after authentication middleware has verified the participant
 * 
 * @param socket - Authenticated Socket.IO socket instance
 */
export async function handleParticipantConnection(socket: Socket): Promise<void> {
  const socketData = socket.data as SocketData;
  const { participantId, sessionId, nickname } = socketData;

  try {
    console.log('[Participant Handler] Handling participant connection:', {
      socketId: socket.id,
      participantId,
      sessionId,
      nickname,
    });

    // Update participant's socket ID and connection status in Redis
    await updateParticipantConnection(participantId!, sessionId, socket.id);

    // Get current session state
    const sessionState = await getCurrentSessionState(sessionId);

    // Emit authenticated event with current session state
    socket.emit('authenticated', {
      success: true,
      participantId,
      sessionId,
      nickname,
      currentState: sessionState,
    });

    console.log('[Participant Handler] Participant authenticated successfully:', {
      socketId: socket.id,
      participantId,
      sessionState: sessionState.state,
    });

    // If session is in LOBBY state, broadcast lobby_state
    if (sessionState.state === 'LOBBY') {
      const { broadcastService } = await import('../services/broadcast.service');
      await broadcastService.broadcastLobbyState(sessionId);
    }

    // Broadcast participant_status_changed to controller (connected)
    // Requirements: 8.6, 13.4
    try {
      const { broadcastService } = await import('../services/broadcast.service');
      await broadcastService.broadcastParticipantStatusChanged(
        sessionId,
        participantId!,
        nickname!,
        'connected'
      );
    } catch (error) {
      console.error('[Participant Handler] Error broadcasting participant status change:', error);
      // Don't fail the connection if broadcast fails
    }

    // Set up event handlers for participant actions
    setupParticipantEventHandlers(socket);

  } catch (error) {
    console.error('[Participant Handler] Error handling participant connection:', error);
    
    socket.emit('auth_error', {
      error: 'Failed to authenticate participant',
    });
    
    socket.disconnect(true);
  }
}

/**
 * Handle participant disconnection
 * 
 * Called when participant disconnects
 * 
 * @param socket - Socket.IO socket instance
 * @param reason - Disconnection reason
 */
export async function handleParticipantDisconnection(
  socket: Socket,
  reason: string
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { participantId, sessionId, nickname } = socketData;

  console.log('[Participant Handler] Handling participant disconnection:', {
    socketId: socket.id,
    participantId,
    sessionId,
    nickname,
    reason,
  });

  // Update participant's connection status in Redis
  // Keep session data for 5 minutes to allow reconnection
  try {
    await updateParticipantDisconnection(participantId!, sessionId);
  } catch (error) {
    console.error('[Participant Handler] Error updating participant disconnection in Redis:', error);
    // Continue with logging even if Redis update fails
  }

  // Broadcast participant_status_changed to controller (disconnected)
  // Requirements: 8.6, 13.4
  try {
    const { broadcastService } = await import('../services/broadcast.service');
    await broadcastService.broadcastParticipantStatusChanged(
      sessionId,
      participantId!,
      nickname!,
      'disconnected'
    );
  } catch (error) {
    console.error('[Participant Handler] Error broadcasting participant status change:', error);
    // Don't fail the disconnection if broadcast fails
  }

  // Log disconnection event
  try {
    await logDisconnectionEvent(participantId!, sessionId, reason);
  } catch (error) {
    console.error('[Participant Handler] Error logging disconnection event:', error);
    // Continue - logging failure shouldn't prevent disconnection
  }

  console.log('[Participant Handler] Participant disconnection handled:', {
    socketId: socket.id,
    participantId,
  });
}

/**
 * Update participant connection status in Redis
 * 
 * @param participantId - Participant ID
 * @param socketId - Socket ID
 */
async function updateParticipantConnection(
  participantId: string,
  _sessionId: string,
  socketId: string
): Promise<void> {
  const redis = redisService.getClient();
  const participantKey = `participant:${participantId}:session`;

  // Update participant data in Redis
  await redis.hset(participantKey, {
    socketId,
    isActive: 'true',
    lastConnectedAt: Date.now().toString(),
  });

  // Refresh TTL to 5 minutes (for reconnection support)
  await redis.expire(participantKey, 300); // 5 minutes

  console.log('[Participant Handler] Updated participant connection in Redis:', {
    participantId,
    socketId,
  });
}

/**
 * Update participant disconnection status in Redis
 * 
 * @param participantId - Participant ID
 */
async function updateParticipantDisconnection(
  participantId: string,
  _sessionId: string
): Promise<void> {
  const redis = redisService.getClient();
  const participantKey = `participant:${participantId}:session`;

  // Mark as inactive but keep data for reconnection
  await redis.hset(participantKey, {
    isActive: 'false',
    socketId: '', // Clear socket ID
  });

  // Keep TTL at 5 minutes for reconnection window
  await redis.expire(participantKey, 300); // 5 minutes

  console.log('[Participant Handler] Updated participant disconnection in Redis:', {
    participantId,
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
  };
}

/**
 * Log disconnection event to audit logs
 * 
 * @param participantId - Participant ID
 * @param sessionId - Session ID
 * @param reason - Disconnection reason
 */
async function logDisconnectionEvent(
  participantId: string,
  sessionId: string,
  reason: string
): Promise<void> {
  try {
    const db = mongodbService.getDb();
    const auditLogsCollection = db.collection('auditLogs');

    await auditLogsCollection.insertOne({
      timestamp: new Date(),
      eventType: 'PARTICIPANT_DISCONNECTED' as any, // Not in enum but useful for logging
      sessionId,
      participantId,
      details: {
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Participant Handler] Error logging disconnection event:', error);
    // Don't throw - logging failure shouldn't prevent disconnection
  }
}

/**
 * Set up event handlers for participant actions
 * 
 * Handles:
 * - submit_answer (Task 17.1) ✓
 * - reconnect_session (Task 28.2) ✓
 * - focus_lost (Task 5.6) ✓
 * - focus_regained (Task 5.6) ✓
 * 
 * @param socket - Socket.IO socket instance
 */
function setupParticipantEventHandlers(socket: Socket): void {
  // Handle answer submission
  socket.on('submit_answer', async (data) => {
    await handleSubmitAnswer(socket, data);
  });

  // Handle session reconnection
  socket.on('reconnect_session', async (data) => {
    await handleReconnectSession(socket, data);
  });

  // Handle focus lost event (Requirements: 9.4, 9.5, 9.6)
  socket.on('focus_lost', async (data) => {
    await handleFocusLost(socket, data);
  });

  // Handle focus regained event (Requirements: 9.4, 9.5, 9.6)
  socket.on('focus_regained', async (data) => {
    await handleFocusRegained(socket, data);
  });

  console.log('[Participant Handler] Event handlers set up for participant:', {
    socketId: socket.id,
  });
}

/**
 * Handle submit_answer event from participant
 * 
 * Validates and processes answer submissions:
 * 1. Validate answer schema (questionId, selectedOptions, clientTimestamp)
 * 2. Verify question is currently active (state === ACTIVE_QUESTION)
 * 3. Verify timer hasn't expired (current time < timerEndTime)
 * 4. Check rate limiting (1 submission per participant per question)
 * 5. Verify participant is active and not eliminated
 * 6. Calculate response time (current time - question start time)
 * 7. Write answer to Redis buffer immediately (write-behind pattern)
 * 8. Emit answer_accepted to participant with answerId and responseTimeMs
 * 9. Publish to scoring worker via Redis pub/sub
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.6
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Answer submission data
 */
async function handleSubmitAnswer(socket: Socket, data: any): Promise<void> {
  const socketData = socket.data as SocketData;
  const { participantId, sessionId } = socketData;

  // Start performance timer for answer submission
  const endTimer = performanceLoggingService.startTimer('answer_submission');

  try {
    console.log('[Participant Handler] Received submit_answer:', {
      socketId: socket.id,
      participantId,
      sessionId,
      data,
    });

    // Import validation schema
    const { z } = await import('zod');
    
    // 1. Validate answer schema
    const submitAnswerSchema = z.object({
      questionId: z.string().uuid(),
      selectedOptions: z.array(z.string().uuid()),
      answerText: z.string().optional(),
      answerNumber: z.number().optional(),
      clientTimestamp: z.number(),
    }).refine(
      (data) => {
        // At least one of: selectedOptions (non-empty), answerText, or answerNumber must be provided
        return data.selectedOptions.length > 0 || 
               data.answerText !== undefined || 
               data.answerNumber !== undefined;
      },
      {
        message: 'At least one answer type must be provided',
      }
    );

    const parseResult = submitAnswerSchema.safeParse(data);

    if (!parseResult.success) {
      console.warn('[Participant Handler] Invalid answer schema:', {
        participantId,
        errors: parseResult.error.errors,
      });

      socket.emit('answer_rejected', {
        questionId: data.questionId,
        reason: 'INVALID_SCHEMA',
        message: 'Invalid answer format',
      });
      return;
    }

    const answerRequest = parseResult.data;

    // 2-6. Validate answer submission using validation service
    const { answerValidationService } = await import('../services/answer-validation.service');
    // Cast to SubmitAnswerRequest since Zod has validated the schema
    const validationResult = await answerValidationService.validateAnswer(
      sessionId,
      participantId!,
      answerRequest as import('../models/types').SubmitAnswerRequest
    );

    if (!validationResult.valid) {
      console.warn('[Participant Handler] Answer validation failed:', {
        participantId,
        questionId: answerRequest.questionId,
        reason: validationResult.reason,
      });

      socket.emit('answer_rejected', {
        questionId: answerRequest.questionId,
        reason: validationResult.reason,
        message: validationResult.message,
      });
      return;
    }

    // Mark answer as submitted (set rate limit) to prevent race conditions
    const marked = await answerValidationService.markAnswerSubmitted(
      participantId!,
      answerRequest.questionId
    );

    if (!marked) {
      // Race condition: another submission came in between validation and marking
      console.warn('[Participant Handler] Race condition detected - answer already submitted:', {
        participantId,
        questionId: answerRequest.questionId,
      });

      socket.emit('answer_rejected', {
        questionId: answerRequest.questionId,
        reason: 'ALREADY_SUBMITTED',
        message: 'You have already submitted an answer for this question',
      });
      return;
    }

    // 6.5. Refresh participant session TTL on activity (Requirement 8.5)
    // This ensures the 5-minute TTL is refreshed on any participant activity
    const { redisDataStructuresService } = await import('../services/redis-data-structures.service');
    await redisDataStructuresService.refreshParticipantSession(participantId!);

    console.log('[Participant Handler] Refreshed participant session TTL on answer submission:', {
      participantId,
    });

    // 7. Calculate response time
    const sessionState = await redisDataStructuresService.getSessionState(sessionId);
    
    if (!sessionState || !sessionState.currentQuestionStartTime) {
      console.error('[Participant Handler] Cannot calculate response time - missing start time:', {
        sessionId,
        questionId: answerRequest.questionId,
      });

      socket.emit('answer_rejected', {
        questionId: answerRequest.questionId,
        reason: 'QUESTION_NOT_ACTIVE',
        message: 'Cannot process answer - question timing error',
      });
      return;
    }

    const currentTime = Date.now();
    const responseTimeMs = currentTime - sessionState.currentQuestionStartTime;

    // Generate answer ID
    const { v4: uuidv4 } = await import('uuid');
    const answerId = uuidv4();

    // 8. Write answer to Redis buffer immediately (write-behind pattern)
    const answer = {
      answerId,
      sessionId,
      participantId: participantId!,
      questionId: answerRequest.questionId,
      selectedOptions: answerRequest.selectedOptions,
      answerText: answerRequest.answerText,
      answerNumber: answerRequest.answerNumber,
      submittedAt: currentTime,
      responseTimeMs,
    };

    await redisDataStructuresService.addAnswerToBuffer(sessionId, answer);

    console.log('[Participant Handler] Answer written to Redis buffer:', {
      answerId,
      participantId,
      questionId: answerRequest.questionId,
      responseTimeMs,
    });

    // 9. Emit answer_accepted to participant
    socket.emit('answer_accepted', {
      questionId: answerRequest.questionId,
      answerId,
      responseTimeMs,
      serverTimestamp: currentTime,
    });

    console.log('[Participant Handler] Answer accepted and acknowledged:', {
      answerId,
      participantId,
      questionId: answerRequest.questionId,
    });

    // 10. Publish to scoring worker via Redis pub/sub
    // This will be implemented in Task 18.1 (background worker for score calculation)
    // For now, we'll publish a message that the worker will process
    const { redisService } = await import('../services/redis.service');
    const redis = redisService.getClient();
    
    await redis.publish(
      `session:${sessionId}:scoring`,
      JSON.stringify({
        answerId,
        participantId: participantId!,
        questionId: answerRequest.questionId,
        sessionId,
        timestamp: currentTime,
      })
    );

    console.log('[Participant Handler] Published to scoring worker:', {
      answerId,
      participantId,
      questionId: answerRequest.questionId,
    });

    // Broadcast answer count update to controller
    // This helps the controller track how many participants have answered
    const answerCount = await getAnswerCountForQuestion(sessionId, answerRequest.questionId);
    const participantCount = sessionState.participantCount;

    const { broadcastService } = await import('../services/broadcast.service');
    await broadcastService.broadcastAnswerCountUpdated(
      sessionId,
      answerRequest.questionId,
      answerCount,
      participantCount
    );

    console.log('[Participant Handler] Answer submission completed successfully:', {
      answerId,
      participantId,
      questionId: answerRequest.questionId,
      responseTimeMs,
    });

    // End performance timer
    endTimer();
  } catch (error) {
    // End performance timer even on error
    endTimer();
    
    console.error('[Participant Handler] Error handling submit_answer:', error);

    socket.emit('error', {
      code: 'ANSWER_SUBMISSION_FAILED',
      message: 'Failed to process answer submission',
    });
  }
}

/**
 * Get answer count for a specific question
 * 
 * Counts how many participants have submitted answers for the given question
 * by checking the rate limit keys in Redis.
 * 
 * @param sessionId - Session ID
 * @param questionId - Question ID
 * @returns Number of participants who have answered
 */
async function getAnswerCountForQuestion(
  sessionId: string,
  questionId: string
): Promise<number> {
  try {
    const { redisService } = await import('../services/redis.service');
    const redis = redisService.getClient();

    // Get all participants for this session
    const { mongodbService } = await import('../services/mongodb.service');
    const db = mongodbService.getDb();
    const participantsCollection = db.collection('participants');

    const participants = await participantsCollection
      .find({
        sessionId,
        isActive: true,
        isEliminated: false,
      })
      .toArray();

    // Count how many have answered by checking rate limit keys
    let count = 0;
    for (const participant of participants) {
      const key = `ratelimit:answer:${participant.participantId}:${questionId}`;
      const exists = await redis.exists(key);
      if (exists) {
        count++;
      }
    }

    return count;
  } catch (error) {
    console.error('[Participant Handler] Error getting answer count:', error);
    return 0;
  }
}


/**
 * Handle reconnect_session event from participant
 * 
 * Processes session reconnection requests:
 * 1. Validate reconnection request schema (sessionId, participantId, lastKnownQuestionId)
 * 2. Call session recovery service to restore session state
 * 3. Update participant's socket ID in Redis
 * 4. Emit session_recovered with restored state on success
 * 5. Emit recovery_failed if recovery fails (expired, not found, ended, banned)
 * 
 * Requirements: 8.2, 8.3, 8.4
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Reconnection request data
 */
async function handleReconnectSession(socket: Socket, data: any): Promise<void> {
  try {
    console.log('[Participant Handler] Received reconnect_session:', {
      socketId: socket.id,
      data,
    });

    // Import validation schema
    const { z } = await import('zod');

    // 1. Validate reconnection request schema
    const reconnectSessionSchema = z.object({
      sessionId: z.string().uuid(),
      participantId: z.string().uuid(),
      lastKnownQuestionId: z.string().uuid().optional(),
    });

    const parseResult = reconnectSessionSchema.safeParse(data);

    if (!parseResult.success) {
      console.warn('[Participant Handler] Invalid reconnect_session schema:', {
        errors: parseResult.error.errors,
      });

      socket.emit('recovery_failed', {
        reason: 'INVALID_REQUEST',
        message: 'Invalid reconnection request format',
      });
      return;
    }

    const { sessionId, participantId, lastKnownQuestionId } = parseResult.data;

    // 2. Call session recovery service to restore session state
    const { sessionRecoveryService } = await import('../services/session-recovery.service');
    const recoveryResult = await sessionRecoveryService.recoverSession(
      participantId,
      sessionId,
      lastKnownQuestionId
    );

    if (!recoveryResult.success) {
      // 5. Emit recovery_failed if recovery fails
      console.log('[Participant Handler] Session recovery failed:', {
        socketId: socket.id,
        participantId,
        sessionId,
        reason: (recoveryResult as { reason: string }).reason,
      });

      const failureResult = recoveryResult as { reason: string; message: string };
      socket.emit('recovery_failed', {
        reason: failureResult.reason,
        message: failureResult.message,
      });

      // Log recovery failure event
      await logRecoveryEvent(participantId, sessionId, 'RECOVERY_FAILED', {
        reason: failureResult.reason,
      });

      return;
    }

    // 3. Update participant's socket ID in Redis
    await sessionRecoveryService.updateSocketId(participantId, socket.id);

    // Update socket.data with recovered participant info
    socket.data = {
      ...socket.data,
      participantId,
      sessionId,
      role: 'participant',
    };

    // Join the session room for broadcasts
    socket.join(`session:${sessionId}:participants`);
    socket.join(`participant:${participantId}`);

    // 4. Emit session_recovered with restored state
    const recoveryData = recoveryResult.data;

    socket.emit('session_recovered', {
      participantId: recoveryData.participantId,
      currentState: recoveryData.currentState,
      currentQuestion: recoveryData.currentQuestion,
      remainingTime: recoveryData.remainingTime,
      totalScore: recoveryData.totalScore,
      rank: recoveryData.rank,
      leaderboard: recoveryData.leaderboard,
      streakCount: recoveryData.streakCount,
      isEliminated: recoveryData.isEliminated,
      isSpectator: recoveryData.isSpectator,
    });

    console.log('[Participant Handler] Session recovered successfully:', {
      socketId: socket.id,
      participantId,
      sessionId,
      currentState: recoveryData.currentState,
      totalScore: recoveryData.totalScore,
      rank: recoveryData.rank,
    });

    // Broadcast participant_status_changed to controller (reconnected)
    // Requirements: 8.6, 13.4
    try {
      const { broadcastService } = await import('../services/broadcast.service');
      const { redisDataStructuresService } = await import('../services/redis-data-structures.service');
      
      const participantSession = await redisDataStructuresService.getParticipantSession(participantId);
      const nickname = participantSession?.nickname || 'Unknown';

      await broadcastService.broadcastParticipantStatusChanged(
        sessionId,
        participantId,
        nickname,
        'connected'
      );
    } catch (error) {
      console.error('[Participant Handler] Error broadcasting participant status change:', error);
      // Don't fail the recovery if broadcast fails
    }

    // Log successful recovery event
    await logRecoveryEvent(participantId, sessionId, 'RECOVERY_SUCCESS', {
      currentState: recoveryData.currentState,
      totalScore: recoveryData.totalScore,
      rank: recoveryData.rank,
    });

  } catch (error) {
    console.error('[Participant Handler] Error handling reconnect_session:', error);

    socket.emit('recovery_failed', {
      reason: 'INTERNAL_ERROR',
      message: 'An error occurred while recovering the session',
    });
  }
}

/**
 * Log session recovery event to audit logs
 * 
 * Requirements: 8.8
 * 
 * @param participantId - Participant ID
 * @param sessionId - Session ID
 * @param eventType - Type of recovery event
 * @param details - Additional event details
 */
async function logRecoveryEvent(
  participantId: string,
  sessionId: string,
  eventType: 'RECOVERY_SUCCESS' | 'RECOVERY_FAILED',
  details: Record<string, any>
): Promise<void> {
  try {
    const db = mongodbService.getDb();
    const auditLogsCollection = db.collection('auditLogs');

    await auditLogsCollection.insertOne({
      timestamp: new Date(),
      eventType: eventType as any,
      sessionId,
      participantId,
      details: {
        ...details,
        timestamp: new Date().toISOString(),
      },
    });

    console.log('[Participant Handler] Logged recovery event:', {
      eventType,
      participantId,
      sessionId,
    });
  } catch (error) {
    console.error('[Participant Handler] Error logging recovery event:', error);
    // Don't throw - logging failure shouldn't prevent recovery
  }
}

/**
 * Focus data stored in Redis
 * Key: participant:{participantId}:focus
 * 
 * Requirements: 9.4, 9.5, 9.6
 */
interface ParticipantFocusData {
  lastFocusLostAt: number | null;
  totalFocusLostCount: number;
  totalFocusLostTimeMs: number;
  currentlyFocused: boolean;
}

/**
 * Handle focus_lost event from participant
 * 
 * Called when a participant's browser tab/window loses focus (visibility hidden).
 * This is used for exam mode monitoring to detect potential cheating.
 * 
 * 1. Validate focus_lost event schema (timestamp)
 * 2. Update focus data in Redis (participant:{id}:focus)
 * 3. Broadcast participant_focus_changed to controller
 * 4. Log event to audit log
 * 
 * Requirements: 9.4, 9.5, 9.6
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Focus lost event data
 */
async function handleFocusLost(socket: Socket, data: any): Promise<void> {
  const socketData = socket.data as SocketData;
  const { participantId, sessionId, nickname } = socketData;

  try {
    console.log('[Participant Handler] Received focus_lost:', {
      socketId: socket.id,
      participantId,
      sessionId,
      data,
    });

    // Import validation schema
    const { z } = await import('zod');

    // 1. Validate focus_lost event schema
    const focusLostSchema = z.object({
      timestamp: z.number().positive(),
    });

    const parseResult = focusLostSchema.safeParse(data);

    if (!parseResult.success) {
      console.warn('[Participant Handler] Invalid focus_lost schema:', {
        participantId,
        errors: parseResult.error.errors,
      });
      return; // Silently ignore invalid events
    }

    const { timestamp } = parseResult.data;

    // 2. Update focus data in Redis
    const redis = redisService.getClient();
    const focusKey = `participant:${participantId}:focus`;

    // Get current focus data
    const existingData = await redis.hgetall(focusKey);
    
    const currentFocusData: ParticipantFocusData = {
      lastFocusLostAt: existingData.lastFocusLostAt ? parseInt(existingData.lastFocusLostAt, 10) : null,
      totalFocusLostCount: existingData.totalFocusLostCount ? parseInt(existingData.totalFocusLostCount, 10) : 0,
      totalFocusLostTimeMs: existingData.totalFocusLostTimeMs ? parseInt(existingData.totalFocusLostTimeMs, 10) : 0,
      currentlyFocused: existingData.currentlyFocused !== 'false',
    };

    // Only process if currently focused (avoid duplicate events)
    if (!currentFocusData.currentlyFocused) {
      console.log('[Participant Handler] Ignoring duplicate focus_lost event:', {
        participantId,
      });
      return;
    }

    // Update focus data
    const updatedFocusData: ParticipantFocusData = {
      lastFocusLostAt: timestamp,
      totalFocusLostCount: currentFocusData.totalFocusLostCount + 1,
      totalFocusLostTimeMs: currentFocusData.totalFocusLostTimeMs,
      currentlyFocused: false,
    };

    // Store updated focus data in Redis
    await redis.hset(focusKey, {
      lastFocusLostAt: updatedFocusData.lastFocusLostAt!.toString(),
      totalFocusLostCount: updatedFocusData.totalFocusLostCount.toString(),
      totalFocusLostTimeMs: updatedFocusData.totalFocusLostTimeMs.toString(),
      currentlyFocused: 'false',
    });

    // Set TTL to match session TTL (6 hours)
    await redis.expire(focusKey, 6 * 60 * 60);

    console.log('[Participant Handler] Updated focus data in Redis:', {
      participantId,
      focusData: updatedFocusData,
    });

    // 3. Broadcast participant_focus_changed to controller
    try {
      const { broadcastService } = await import('../services/broadcast.service');
      await broadcastService.broadcastParticipantFocusChanged(
        sessionId,
        participantId!,
        nickname || 'Unknown',
        'lost',
        timestamp,
        updatedFocusData.totalFocusLostCount,
        updatedFocusData.totalFocusLostTimeMs
      );
    } catch (error) {
      console.error('[Participant Handler] Error broadcasting focus change:', error);
      // Don't fail the event handling if broadcast fails
    }

    // 4. Log event to audit log
    await logFocusEvent(participantId!, sessionId, 'FOCUS_LOST', {
      timestamp,
      totalFocusLostCount: updatedFocusData.totalFocusLostCount,
      totalFocusLostTimeMs: updatedFocusData.totalFocusLostTimeMs,
    });

    console.log('[Participant Handler] Focus lost event processed successfully:', {
      participantId,
      timestamp,
      totalFocusLostCount: updatedFocusData.totalFocusLostCount,
    });

  } catch (error) {
    console.error('[Participant Handler] Error handling focus_lost:', error);
    // Don't emit error to client - focus monitoring should be silent
  }
}

/**
 * Handle focus_regained event from participant
 * 
 * Called when a participant's browser tab/window regains focus (visibility visible).
 * This is used for exam mode monitoring to track how long participants were away.
 * 
 * 1. Validate focus_regained event schema (timestamp, durationMs)
 * 2. Update focus data in Redis (participant:{id}:focus)
 * 3. Broadcast participant_focus_changed to controller
 * 4. Log event to audit log
 * 
 * Requirements: 9.4, 9.5, 9.6
 * 
 * @param socket - Socket.IO socket instance
 * @param data - Focus regained event data
 */
async function handleFocusRegained(socket: Socket, data: any): Promise<void> {
  const socketData = socket.data as SocketData;
  const { participantId, sessionId, nickname } = socketData;

  try {
    console.log('[Participant Handler] Received focus_regained:', {
      socketId: socket.id,
      participantId,
      sessionId,
      data,
    });

    // Import validation schema
    const { z } = await import('zod');

    // 1. Validate focus_regained event schema
    const focusRegainedSchema = z.object({
      timestamp: z.number().positive(),
      durationMs: z.number().nonnegative(),
    });

    const parseResult = focusRegainedSchema.safeParse(data);

    if (!parseResult.success) {
      console.warn('[Participant Handler] Invalid focus_regained schema:', {
        participantId,
        errors: parseResult.error.errors,
      });
      return; // Silently ignore invalid events
    }

    const { timestamp, durationMs } = parseResult.data;

    // 2. Update focus data in Redis
    const redis = redisService.getClient();
    const focusKey = `participant:${participantId}:focus`;

    // Get current focus data
    const existingData = await redis.hgetall(focusKey);
    
    const currentFocusData: ParticipantFocusData = {
      lastFocusLostAt: existingData.lastFocusLostAt ? parseInt(existingData.lastFocusLostAt, 10) : null,
      totalFocusLostCount: existingData.totalFocusLostCount ? parseInt(existingData.totalFocusLostCount, 10) : 0,
      totalFocusLostTimeMs: existingData.totalFocusLostTimeMs ? parseInt(existingData.totalFocusLostTimeMs, 10) : 0,
      currentlyFocused: existingData.currentlyFocused !== 'false',
    };

    // Only process if currently not focused (avoid duplicate events)
    if (currentFocusData.currentlyFocused) {
      console.log('[Participant Handler] Ignoring duplicate focus_regained event:', {
        participantId,
      });
      return;
    }

    // Update focus data with accumulated lost time
    const updatedFocusData: ParticipantFocusData = {
      lastFocusLostAt: null, // Clear since focus is regained
      totalFocusLostCount: currentFocusData.totalFocusLostCount,
      totalFocusLostTimeMs: currentFocusData.totalFocusLostTimeMs + durationMs,
      currentlyFocused: true,
    };

    // Store updated focus data in Redis
    await redis.hset(focusKey, {
      lastFocusLostAt: '', // Clear the value
      totalFocusLostCount: updatedFocusData.totalFocusLostCount.toString(),
      totalFocusLostTimeMs: updatedFocusData.totalFocusLostTimeMs.toString(),
      currentlyFocused: 'true',
    });

    // Set TTL to match session TTL (6 hours)
    await redis.expire(focusKey, 6 * 60 * 60);

    console.log('[Participant Handler] Updated focus data in Redis:', {
      participantId,
      focusData: updatedFocusData,
    });

    // 3. Broadcast participant_focus_changed to controller
    try {
      const { broadcastService } = await import('../services/broadcast.service');
      await broadcastService.broadcastParticipantFocusChanged(
        sessionId,
        participantId!,
        nickname || 'Unknown',
        'regained',
        timestamp,
        updatedFocusData.totalFocusLostCount,
        updatedFocusData.totalFocusLostTimeMs
      );
    } catch (error) {
      console.error('[Participant Handler] Error broadcasting focus change:', error);
      // Don't fail the event handling if broadcast fails
    }

    // 4. Log event to audit log
    await logFocusEvent(participantId!, sessionId, 'FOCUS_REGAINED', {
      timestamp,
      durationMs,
      totalFocusLostCount: updatedFocusData.totalFocusLostCount,
      totalFocusLostTimeMs: updatedFocusData.totalFocusLostTimeMs,
    });

    console.log('[Participant Handler] Focus regained event processed successfully:', {
      participantId,
      timestamp,
      durationMs,
      totalFocusLostTimeMs: updatedFocusData.totalFocusLostTimeMs,
    });

  } catch (error) {
    console.error('[Participant Handler] Error handling focus_regained:', error);
    // Don't emit error to client - focus monitoring should be silent
  }
}

/**
 * Log focus event to audit logs
 * 
 * Requirements: 9.6 - Log all focus events in the audit log for post-quiz review
 * 
 * @param participantId - Participant ID
 * @param sessionId - Session ID
 * @param eventType - Type of focus event
 * @param details - Additional event details
 */
async function logFocusEvent(
  participantId: string,
  sessionId: string,
  eventType: 'FOCUS_LOST' | 'FOCUS_REGAINED',
  details: Record<string, any>
): Promise<void> {
  try {
    const db = mongodbService.getDb();
    const auditLogsCollection = db.collection('auditLogs');

    await auditLogsCollection.insertOne({
      timestamp: new Date(),
      eventType: eventType as any,
      sessionId,
      participantId,
      details: {
        ...details,
        timestamp: new Date().toISOString(),
      },
    });

    console.log('[Participant Handler] Logged focus event:', {
      eventType,
      participantId,
      sessionId,
    });
  } catch (error) {
    console.error('[Participant Handler] Error logging focus event:', error);
    // Don't throw - logging failure shouldn't prevent focus event handling
  }
}
