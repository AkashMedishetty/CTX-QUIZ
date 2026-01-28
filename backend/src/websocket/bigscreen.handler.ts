/**
 * Big Screen WebSocket Connection Handler
 * 
 * Handles WebSocket connections for big screens (projector displays):
 * - Verifies session ID on connection (done in middleware)
 * - Subscribes to big screen channel (session:{sessionId}:bigscreen)
 * - Emits authenticated event with lobby state
 * - Handles disconnection and cleanup
 * 
 * Requirements: 5.1
 */

import { Socket } from 'socket.io';
import { SocketData } from '../middleware/socket-auth';
import { redisService } from '../services/redis.service';
import { mongodbService } from '../services/mongodb.service';
import { Session } from '../models/types';

/**
 * Handle big screen connection
 * 
 * Called after authentication middleware has verified the big screen
 * 
 * @param socket - Authenticated Socket.IO socket instance
 */
export async function handleBigScreenConnection(socket: Socket): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId } = socketData;

  try {
    console.log('[BigScreen Handler] Handling big screen connection:', {
      socketId: socket.id,
      sessionId,
    });

    // Verify session exists
    const sessionExists = await verifySessionExists(sessionId);
    if (!sessionExists) {
      throw new Error('Session not found');
    }

    // Update big screen's socket ID in Redis
    await updateBigScreenConnection(sessionId, socket.id);

    // Get current session state
    const sessionState = await getCurrentSessionState(sessionId);

    // Emit authenticated event with current session state
    socket.emit('authenticated', {
      success: true,
      sessionId,
      currentState: sessionState,
    });

    console.log('[BigScreen Handler] Big screen authenticated successfully:', {
      socketId: socket.id,
      sessionId,
      sessionState: sessionState.state,
    });

    // If session is in LOBBY state, broadcast lobby_state
    if (sessionState.state === 'LOBBY') {
      const { broadcastService } = await import('../services/broadcast.service');
      await broadcastService.broadcastLobbyState(sessionId);
    }

  } catch (error) {
    console.error('[BigScreen Handler] Error handling big screen connection:', error);
    
    socket.emit('auth_error', {
      error: 'Failed to authenticate big screen',
    });
    
    socket.disconnect(true);
  }
}

/**
 * Handle big screen disconnection
 * 
 * Called when big screen disconnects
 * 
 * @param socket - Socket.IO socket instance
 * @param reason - Disconnection reason
 */
export async function handleBigScreenDisconnection(
  socket: Socket,
  reason: string
): Promise<void> {
  const socketData = socket.data as SocketData;
  const { sessionId } = socketData;

  console.log('[BigScreen Handler] Handling big screen disconnection:', {
    socketId: socket.id,
    sessionId,
    reason,
  });

  // Update big screen's connection status in Redis
  try {
    await updateBigScreenDisconnection(sessionId);
  } catch (error) {
    console.error('[BigScreen Handler] Error updating big screen disconnection in Redis:', error);
    // Continue with logging even if Redis update fails
  }

  // Log disconnection event
  try {
    await logDisconnectionEvent(sessionId, reason);
  } catch (error) {
    console.error('[BigScreen Handler] Error logging disconnection event:', error);
    // Continue - logging failure shouldn't prevent disconnection
  }

  console.log('[BigScreen Handler] Big screen disconnection handled:', {
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
    console.error('[BigScreen Handler] Error verifying session exists:', error);
    return false;
  }
}

/**
 * Update big screen connection status in Redis
 * 
 * @param sessionId - Session ID
 * @param socketId - Socket ID
 */
async function updateBigScreenConnection(
  sessionId: string,
  socketId: string
): Promise<void> {
  const redis = redisService.getClient();
  const bigScreenKey = `session:${sessionId}:bigscreen`;

  // Store big screen socket ID in Redis
  await redis.hset(bigScreenKey, {
    socketId,
    connectedAt: Date.now().toString(),
  });

  // Set TTL to 6 hours (session lifetime)
  await redis.expire(bigScreenKey, 21600); // 6 hours

  console.log('[BigScreen Handler] Updated big screen connection in Redis:', {
    sessionId,
    socketId,
  });
}

/**
 * Update big screen disconnection status in Redis
 * 
 * @param sessionId - Session ID
 */
async function updateBigScreenDisconnection(sessionId: string): Promise<void> {
  const redis = redisService.getClient();
  const bigScreenKey = `session:${sessionId}:bigscreen`;

  // Clear big screen socket ID
  await redis.hset(bigScreenKey, {
    socketId: '',
    disconnectedAt: Date.now().toString(),
  });

  // Keep TTL at 6 hours
  await redis.expire(bigScreenKey, 21600); // 6 hours

  console.log('[BigScreen Handler] Updated big screen disconnection in Redis:', {
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
      eventType: 'BIGSCREEN_DISCONNECTED' as any, // Not in enum but useful for logging
      sessionId,
      details: {
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[BigScreen Handler] Error logging disconnection event:', error);
    // Don't throw - logging failure shouldn't prevent disconnection
  }
}
