/**
 * Socket.IO Authentication Middleware
 * 
 * Provides authentication for Socket.IO connections:
 * - Verifies participant tokens using JWT
 * - Verifies session existence for controller and big screen roles
 * - Stores authenticated data in socket.data (participantId, sessionId, role)
 * 
 * Requirements: 9.8
 */

import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { mongodbService } from '../services/mongodb.service';
import { redisService } from '../services/redis.service';

/**
 * Socket data interface for authenticated connections
 */
export interface SocketData {
  participantId?: string;
  sessionId: string;
  role: 'participant' | 'controller' | 'bigscreen';
  nickname?: string;
}

/**
 * JWT payload interface for participant tokens
 */
interface ParticipantTokenPayload {
  participantId: string;
  sessionId: string;
  nickname: string;
}

/**
 * Authentication handshake data from client
 */
interface AuthHandshake {
  token?: string;
  sessionId?: string;
  joinCode?: string;
  role?: string;
}

/**
 * Socket.IO authentication middleware
 * 
 * Validates connections based on role:
 * - participant: Requires valid JWT token
 * - controller: Requires valid sessionId
 * - bigscreen: Requires valid sessionId
 * 
 * @param socket - Socket.IO socket instance
 * @param next - Next middleware function
 * 
 * Requirements: 9.8, 9.9
 */
export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    const handshake = socket.handshake.auth as AuthHandshake;
    const { token, sessionId, joinCode, role } = handshake;

    // Validate role
    if (!role || !['participant', 'controller', 'bigscreen'].includes(role)) {
      // Import security logging service dynamically to avoid circular dependencies
      const { securityLoggingService } = await import('../services/security-logging.service');
      
      // Log authentication failure for invalid role
      await securityLoggingService.logAuthenticationFailure({
        reason: 'INVALID_ROLE',
        role: role || 'undefined',
        socketId: socket.id,
        ipAddress: socket.handshake.address,
        message: 'Invalid or missing role',
      });
      
      return next(new Error('Invalid or missing role'));
    }

    // Authenticate based on role
    switch (role) {
      case 'participant':
        await authenticateParticipant(socket, token, next);
        break;
      
      case 'controller':
      case 'bigscreen':
        await authenticateViewer(socket, sessionId, joinCode, role as 'controller' | 'bigscreen', next);
        break;
      
      default:
        return next(new Error('Invalid role'));
    }
  } catch (error) {
    console.error('[Socket Auth] Authentication error:', error);
    return next(new Error('Authentication failed'));
  }
}

/**
 * Authenticate participant connection using JWT token
 * 
 * Verifies JWT tokens on every WebSocket connection for participants.
 * Uses strong secret key from environment variable with 6-hour expiration.
 * 
 * @param socket - Socket.IO socket instance
 * @param token - JWT token from client
 * @param next - Next middleware function
 * 
 * Requirements: 9.8 - Validate all WebSocket messages for proper format and authorization
 * Requirements: 9.9 - Log authentication failures
 */
async function authenticateParticipant(
  socket: Socket,
  token: string | undefined,
  next: (err?: Error) => void
): Promise<void> {
  // Import security logging service dynamically to avoid circular dependencies
  const { securityLoggingService } = await import('../services/security-logging.service');
  
  try {
    // Validate token presence
    if (!token) {
      console.warn('[Socket Auth] Authentication failed: Missing token', {
        socketId: socket.id,
        ip: socket.handshake.address,
      });
      
      // Log authentication failure
      await securityLoggingService.logAuthenticationFailure({
        reason: 'MISSING_TOKEN',
        role: 'participant',
        socketId: socket.id,
        ipAddress: socket.handshake.address,
        message: 'Missing authentication token',
      });
      
      return next(new Error('Missing authentication token'));
    }

    // Verify JWT token using strong secret from environment variable
    // Token expiration is set to 6 hours (configured in config.jwt.expiresIn)
    let payload: ParticipantTokenPayload;
    try {
      payload = jwt.verify(token, config.jwt.secret) as ParticipantTokenPayload;
    } catch (error: unknown) {
      const jwtError = error as { name?: string; message?: string };
      
      if (jwtError.name === 'TokenExpiredError') {
        console.warn('[Socket Auth] Authentication failed: Token expired', {
          socketId: socket.id,
          ip: socket.handshake.address,
        });
        
        // Log authentication failure
        await securityLoggingService.logAuthenticationFailure({
          reason: 'EXPIRED_TOKEN',
          role: 'participant',
          socketId: socket.id,
          ipAddress: socket.handshake.address,
          message: 'Token expired',
        });
        
        return next(new Error('Token expired'));
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        console.warn('[Socket Auth] Authentication failed: Invalid token', {
          socketId: socket.id,
          ip: socket.handshake.address,
          error: jwtError.message,
        });
        
        // Log authentication failure
        await securityLoggingService.logAuthenticationFailure({
          reason: 'INVALID_TOKEN',
          role: 'participant',
          socketId: socket.id,
          ipAddress: socket.handshake.address,
          message: jwtError.message || 'Invalid token',
        });
        
        return next(new Error('Invalid token'));
      }
      
      // Log unexpected JWT errors for security monitoring
      console.error('[Socket Auth] Unexpected JWT verification error', {
        socketId: socket.id,
        ip: socket.handshake.address,
        errorName: jwtError.name,
        errorMessage: jwtError.message,
      });
      
      // Log authentication failure
      await securityLoggingService.logAuthenticationFailure({
        reason: 'INVALID_TOKEN',
        role: 'participant',
        socketId: socket.id,
        ipAddress: socket.handshake.address,
        message: `Unexpected error: ${jwtError.message}`,
      });
      
      throw error;
    }

    // Validate payload structure
    if (!payload.participantId || !payload.sessionId || !payload.nickname) {
      // Log authentication failure
      await securityLoggingService.logAuthenticationFailure({
        reason: 'INVALID_PAYLOAD',
        role: 'participant',
        socketId: socket.id,
        ipAddress: socket.handshake.address,
        message: 'Invalid token payload',
      });
      
      return next(new Error('Invalid token payload'));
    }

    // Verify session exists and is active
    const sessionExists = await verifySessionExists(payload.sessionId);
    if (!sessionExists) {
      // Log authentication failure
      await securityLoggingService.logAuthenticationFailure({
        reason: 'SESSION_NOT_FOUND',
        role: 'participant',
        socketId: socket.id,
        ipAddress: socket.handshake.address,
        sessionId: payload.sessionId,
        participantId: payload.participantId,
        message: 'Session not found or ended',
      });
      
      return next(new Error('Session not found or ended'));
    }

    // Verify participant exists and is not banned
    const participantValid = await verifyParticipant(payload.participantId, payload.sessionId);
    if (!participantValid) {
      // Log authentication failure
      await securityLoggingService.logAuthenticationFailure({
        reason: 'PARTICIPANT_BANNED',
        role: 'participant',
        socketId: socket.id,
        ipAddress: socket.handshake.address,
        sessionId: payload.sessionId,
        participantId: payload.participantId,
        message: 'Participant not found or banned',
      });
      
      return next(new Error('Participant not found or banned'));
    }

    // Store authenticated data in socket.data
    socket.data = {
      participantId: payload.participantId,
      sessionId: payload.sessionId,
      role: 'participant',
      nickname: payload.nickname,
    } as SocketData;

    console.log('[Socket Auth] Participant authenticated:', {
      socketId: socket.id,
      participantId: payload.participantId,
      sessionId: payload.sessionId,
      nickname: payload.nickname,
    });

    next();
  } catch (error) {
    console.error('[Socket Auth] Participant authentication error:', error);
    return next(new Error('Authentication failed'));
  }
}

/**
 * Authenticate controller or big screen connection
 * 
 * Supports authentication via sessionId or joinCode
 * 
 * @param socket - Socket.IO socket instance
 * @param sessionId - Session ID from client (optional if joinCode provided)
 * @param joinCode - Join code from client (optional if sessionId provided)
 * @param role - Role (controller or bigscreen)
 * @param next - Next middleware function
 */
async function authenticateViewer(
  socket: Socket,
  sessionId: string | undefined,
  joinCode: string | undefined,
  role: 'controller' | 'bigscreen',
  next: (err?: Error) => void
): Promise<void> {
  try {
    let resolvedSessionId = sessionId;

    // If no sessionId but joinCode provided, look up sessionId from Redis
    if (!resolvedSessionId && joinCode) {
      const redis = redisService.getClient();
      const lookupSessionId = await redis.get(`joincode:${joinCode.toUpperCase()}`);
      
      if (lookupSessionId) {
        resolvedSessionId = lookupSessionId;
        console.log('[Socket Auth] Resolved sessionId from joinCode:', {
          joinCode: joinCode.toUpperCase(),
          sessionId: resolvedSessionId,
        });
      }
    }

    // Validate sessionId presence
    if (!resolvedSessionId) {
      return next(new Error('Missing session ID or invalid join code'));
    }

    // Verify session exists and is active
    const sessionExists = await verifySessionExists(resolvedSessionId);
    if (!sessionExists) {
      return next(new Error('Session not found or ended'));
    }

    // Store authenticated data in socket.data
    socket.data = {
      sessionId: resolvedSessionId,
      role,
    } as SocketData;

    console.log('[Socket Auth] Viewer authenticated:', {
      socketId: socket.id,
      sessionId: resolvedSessionId,
      role,
      usedJoinCode: !!joinCode && !sessionId,
    });

    next();
  } catch (error) {
    console.error('[Socket Auth] Viewer authentication error:', error);
    return next(new Error('Authentication failed'));
  }
}

/**
 * Verify that a session exists and is not ended
 * 
 * Checks Redis first (fast), falls back to MongoDB
 * 
 * @param sessionId - Session ID to verify
 * @returns True if session exists and is active
 */
async function verifySessionExists(sessionId: string): Promise<boolean> {
  try {
    const redis = redisService.getClient();

    // Check Redis first (fast path)
    const sessionState = await redis.hgetall(`session:${sessionId}:state`);
    if (sessionState && Object.keys(sessionState).length > 0) {
      // Session exists in Redis, check if not ended
      return sessionState.state !== 'ENDED';
    }

    // Fallback to MongoDB
    const db = mongodbService.getDb();
    const sessionsCollection = db.collection('sessions');
    
    const session = await sessionsCollection.findOne({
      sessionId,
      state: { $ne: 'ENDED' },
    });

    return session !== null;
  } catch (error) {
    console.error('[Socket Auth] Error verifying session:', error);
    return false;
  }
}

/**
 * Verify that a participant exists and is not banned
 * 
 * Checks Redis first (fast), falls back to MongoDB
 * 
 * @param participantId - Participant ID to verify
 * @param sessionId - Session ID for context
 * @returns True if participant exists and is not banned
 */
async function verifyParticipant(participantId: string, sessionId: string): Promise<boolean> {
  try {
    const redis = redisService.getClient();

    // Check Redis first (fast path)
    const participantData = await redis.hgetall(`participant:${participantId}:session`);
    if (participantData && Object.keys(participantData).length > 0) {
      // Participant exists in Redis, check if not banned
      // Note: isBanned is stored as string 'true' or 'false' in Redis
      return participantData.isBanned !== 'true';
    }

    // Fallback to MongoDB
    const db = mongodbService.getDb();
    const participantsCollection = db.collection('participants');
    
    const participant = await participantsCollection.findOne({
      participantId,
      sessionId,
      isBanned: { $ne: true },
    });

    return participant !== null;
  } catch (error) {
    console.error('[Socket Auth] Error verifying participant:', error);
    return false;
  }
}

/**
 * Generate JWT token for participant
 * 
 * Creates a secure JWT token for participant authentication on WebSocket connections.
 * - Uses strong secret key from JWT_SECRET environment variable
 * - Token expires after 6 hours (configurable via JWT_EXPIRES_IN)
 * - Token is verified on every WebSocket connection
 * 
 * This is a utility function for use in the join endpoint.
 * 
 * @param participantId - Participant ID
 * @param sessionId - Session ID
 * @param nickname - Participant nickname
 * @returns JWT token string
 * 
 * Requirements: 9.8 - Validate all WebSocket messages for proper format and authorization
 */
export function generateParticipantToken(
  participantId: string,
  sessionId: string,
  nickname: string
): string {
  const payload: ParticipantTokenPayload = {
    participantId,
    sessionId,
    nickname,
  };

  // Sign token with strong secret and 6-hour expiration
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });
}
