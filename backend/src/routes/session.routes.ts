/**
 * Session Routes
 * 
 * Handles session management endpoints:
 * - POST /api/sessions - Create new quiz session
 * - GET /api/sessions/:sessionId - Get session details
 * - POST /api/sessions/:sessionId/start - Start quiz from lobby
 * - POST /api/sessions/:sessionId/end - End quiz session
 * - GET /api/sessions/:sessionId/results - Get session results
 * 
 * Requirements: 2.1, 2.3, 2.6, 16.6
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import { mongodbService } from '../services/mongodb.service';
import { redisDataStructuresService } from '../services/redis-data-structures.service';
import { createSessionRequestSchema, joinSessionRequestSchema, validateRequest, validateAndSanitizeRequest } from '../models/validation';
import { profanityFilterService } from '../services/profanity-filter.service';
import { rateLimiterService } from '../services/rate-limiter.service';
import { generateParticipantToken } from '../middleware/socket-auth';
import type { Quiz, Session, Participant } from '../models/types';

const router = Router();

/**
 * Generate a unique 6-character alphanumeric join code
 * Format: Uppercase letters and numbers only (e.g., "ABC123")
 */
function generateJoinCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generate a unique join code that doesn't already exist in Redis
 */
async function generateUniqueJoinCode(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const code = generateJoinCode();
    const exists = await redisDataStructuresService.joinCodeExists(code);
    
    if (!exists) {
      return code;
    }
    
    attempts++;
  }

  // If we couldn't generate a unique code after 10 attempts, throw error
  throw new Error('Failed to generate unique join code after multiple attempts');
}

/**
 * POST /api/sessions
 * 
 * Create a new quiz session
 * 
 * Request Body:
 * - quizId: string (MongoDB ObjectId)
 * 
 * Response:
 * - 201: Session created successfully
 *   {
 *     success: true,
 *     session: {
 *       sessionId: string,
 *       quizId: string,
 *       joinCode: string,
 *       state: 'LOBBY',
 *       currentQuestionIndex: 0,
 *       participantCount: 0,
 *       createdAt: Date
 *     },
 *     quiz: Quiz
 *   }
 * - 400: Invalid request body or quiz ID format
 * - 404: Quiz not found
 * - 500: Server error
 * 
 * Requirements: 2.1
 */
router.post(
  '/',
  validateRequest(createSessionRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { quizId } = (req as any).validatedBody;

      // Convert quizId string to ObjectId
      let quizObjectId: ObjectId;
      try {
        quizObjectId = new ObjectId(quizId);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'Invalid quiz ID format',
          message: 'Quiz ID must be a valid MongoDB ObjectId',
        });
        return;
      }

      // Verify quiz exists
      const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
      const quiz = await mongodbService.withRetry(async () => {
        return await quizzesCollection.findOne({ _id: quizObjectId });
      });

      if (!quiz) {
        res.status(404).json({
          success: false,
          error: 'Quiz not found',
          message: `No quiz found with ID: ${quizId}`,
        });
        return;
      }

      // Generate unique session ID and join code
      const sessionId = uuidv4();
      const joinCode = await generateUniqueJoinCode();

      // Create session document
      const now = new Date();
      const session: Session = {
        sessionId,
        quizId: quizObjectId,
        joinCode,
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 0,
        activeParticipants: [],
        eliminatedParticipants: [],
        voidedQuestions: [],
        allowLateJoiners: true, // Default to allowing late joiners
        createdAt: now,
        hostId: 'admin', // TODO: Replace with actual authenticated user ID when auth is implemented
      };

      // Store session in MongoDB
      const sessionsCollection = mongodbService.getCollection<Session>('sessions');
      await mongodbService.withRetry(async () => {
        await sessionsCollection.insertOne(session);
      });

      console.log(`[Session] Created session ${sessionId} with join code ${joinCode} for quiz ${quizId}`);

      // Cache session state in Redis
      await redisDataStructuresService.setSessionState(sessionId, {
        state: 'LOBBY',
        currentQuestionIndex: 0,
        participantCount: 0,
      });

      // Store join code mapping in Redis
      await redisDataStructuresService.setJoinCodeMapping(joinCode, sessionId);

      console.log(`[Session] Cached session state and join code mapping in Redis`);

      // Return session with quiz details
      res.status(201).json({
        success: true,
        session: {
          sessionId: session.sessionId,
          quizId: quizId,
          joinCode: session.joinCode,
          state: session.state,
          currentQuestionIndex: session.currentQuestionIndex,
          participantCount: session.participantCount,
          createdAt: session.createdAt,
        },
        quiz: {
          _id: quiz._id,
          title: quiz.title,
          description: quiz.description,
          quizType: quiz.quizType,
          branding: quiz.branding,
          eliminationSettings: quiz.eliminationSettings,
          ffiSettings: quiz.ffiSettings,
          questions: quiz.questions,
        },
      });
    } catch (error: any) {
      console.error('[Session] Error creating session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create session',
        message: error.message || 'An unexpected error occurred',
      });
    }
  }
);

/**
 * GET /api/sessions
 * 
 * List all sessions with their quiz details
 * 
 * Query Parameters:
 * - state: string (optional) - Filter by session state (LOBBY, ACTIVE_QUESTION, REVEAL, ENDED)
 * - limit: number (optional, default: 20) - Number of sessions to return
 * 
 * Response:
 * - 200: Sessions retrieved successfully
 *   {
 *     success: true,
 *     sessions: Array<{
 *       session: Session,
 *       quiz: Quiz
 *     }>
 *   }
 * - 500: Server error
 * 
 * Requirements: 2.1
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const stateFilter = req.query.state as string | undefined;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    // Build filter
    const filter: any = {};
    if (stateFilter && ['LOBBY', 'ACTIVE_QUESTION', 'REVEAL', 'ENDED'].includes(stateFilter)) {
      filter.state = stateFilter;
    }

    // Get sessions from MongoDB, sorted by most recent first
    const sessionsCollection = mongodbService.getCollection<Session>('sessions');
    const sessions = await mongodbService.withRetry(async () => {
      return await sessionsCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
    });

    // Get quiz details for each session
    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const quizIds = [...new Set(sessions.map(s => s.quizId.toString()))];
    
    const quizzes = await mongodbService.withRetry(async () => {
      return await quizzesCollection
        .find({ _id: { $in: quizIds.map(id => new ObjectId(id)) } })
        .toArray();
    });

    // Create quiz lookup map
    const quizMap = new Map(quizzes.map(q => [q._id.toString(), q]));

    // Combine sessions with their quiz data
    const sessionsWithQuiz = sessions.map(session => {
      const quiz = quizMap.get(session.quizId.toString());
      return {
        session: {
          sessionId: session.sessionId,
          quizId: session.quizId.toString(),
          joinCode: session.joinCode,
          state: session.state,
          currentQuestionIndex: session.currentQuestionIndex,
          participantCount: session.participantCount,
          createdAt: session.createdAt,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
        },
        quiz: quiz ? {
          _id: quiz._id,
          title: quiz.title,
          quizType: quiz.quizType,
          questions: quiz.questions.map(q => ({ questionId: q.questionId })),
        } : null,
      };
    }).filter(s => s.quiz !== null);

    console.log(`[Session] Retrieved ${sessionsWithQuiz.length} sessions`);

    res.status(200).json({
      success: true,
      sessions: sessionsWithQuiz,
    });
  } catch (error: any) {
    console.error('[Session] Error listing sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list sessions',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/sessions/join
 * 
 * Join a quiz session with a join code and nickname
 * 
 * Request Body:
 * - joinCode: string (6-character alphanumeric code)
 * - nickname: string (2-20 characters, no profanity)
 * 
 * Response:
 * - 200: Successfully joined session
 *   {
 *     success: true,
 *     sessionId: string,
 *     participantId: string,
 *     sessionToken: string (JWT),
 *     session: {
 *       state: SessionState,
 *       currentQuestionIndex: number
 *     }
 *   }
 * - 400: Invalid request body, nickname validation failed, or session not joinable
 * - 404: Join code not found or session not found
 * - 429: Rate limit exceeded (5 attempts per IP per minute)
 * - 500: Server error
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.7
 */
router.post(
  '/join',
  validateAndSanitizeRequest(joinSessionRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    // Import security logging service for logging failed join attempts
    const { securityLoggingService } = await import('../services/security-logging.service');
    
    try {
      const { joinCode, nickname } = (req as any).validatedBody;

      // Get client IP address for rate limiting
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                        req.socket.remoteAddress || 
                        '0.0.0.0';

      console.log(`[Session] Join attempt - Code: ${joinCode}, Nickname: ${nickname}, IP: ${ipAddress}`);

      // 1. Check rate limiting (5 attempts per IP per minute)
      const rateLimitResult = await rateLimiterService.checkJoinLimit(ipAddress);
      if (!rateLimitResult.allowed) {
        console.warn(`[Session] Rate limit exceeded for IP: ${ipAddress}`);
        
        // Log failed join attempt due to rate limiting
        await securityLoggingService.logFailedJoinAttempt({
          reason: 'RATE_LIMITED',
          joinCode,
          nickname,
          ipAddress,
          message: 'Too many join attempts',
        });
        
        res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message: 'Too many join attempts. Please try again later.',
          retryAfter: rateLimitResult.retryAfter,
        });
        return;
      }

      // 2. Validate nickname using profanity filter
      const nicknameValidation = profanityFilterService.validateNickname(nickname);
      if (!nicknameValidation.isValid) {
        console.warn(`[Session] Nickname validation failed: ${nicknameValidation.reason}`);
        
        // Log failed join attempt due to profanity
        await securityLoggingService.logFailedJoinAttempt({
          reason: 'PROFANITY_DETECTED',
          joinCode,
          nickname,
          ipAddress,
          message: nicknameValidation.reason,
        });
        
        res.status(400).json({
          success: false,
          error: 'Invalid nickname',
          message: nicknameValidation.reason,
        });
        return;
      }

      // 3. Validate join code exists and get session ID from Redis
      const sessionId = await redisDataStructuresService.getSessionIdFromJoinCode(joinCode);
      if (!sessionId) {
        console.warn(`[Session] Invalid join code: ${joinCode}`);
        
        // Log failed join attempt due to invalid join code
        await securityLoggingService.logFailedJoinAttempt({
          reason: 'INVALID_JOIN_CODE',
          joinCode,
          nickname,
          ipAddress,
          message: 'Join code not found or expired',
        });
        
        res.status(404).json({
          success: false,
          error: 'Invalid join code',
          message: 'The join code you entered is not valid or has expired.',
        });
        return;
      }

      // 4. Get session from MongoDB to verify it exists and is joinable
      const sessionsCollection = mongodbService.getCollection<Session>('sessions');
      const session = await mongodbService.withRetry(async () => {
        return await sessionsCollection.findOne({ sessionId });
      });

      if (!session) {
        console.warn(`[Session] Session not found for join code: ${joinCode}`);
        
        // Log failed join attempt due to session not found
        await securityLoggingService.logFailedJoinAttempt({
          reason: 'SESSION_NOT_FOUND',
          joinCode,
          nickname,
          ipAddress,
          sessionId,
          message: 'Session not found in database',
        });
        
        res.status(404).json({
          success: false,
          error: 'Session not found',
          message: 'The quiz session could not be found.',
        });
        return;
      }

      // 5. Check if session is in a joinable state (LOBBY or ACTIVE_QUESTION)
      // Get most recent state from Redis, fallback to MongoDB
      const redisState = await redisDataStructuresService.getSessionState(sessionId);
      const currentState = redisState?.state || session.state;

      if (currentState === 'ENDED') {
        console.warn(`[Session] Attempted to join ended session: ${sessionId}`);
        
        // Log failed join attempt due to session ended
        await securityLoggingService.logFailedJoinAttempt({
          reason: 'SESSION_ENDED',
          joinCode,
          nickname,
          ipAddress,
          sessionId,
          message: 'Quiz session has already ended',
        });
        
        res.status(400).json({
          success: false,
          error: 'Session ended',
          message: 'This quiz session has already ended.',
        });
        return;
      }

      // 5b. Check if late joining is allowed when session is not in LOBBY
      if (currentState !== 'LOBBY' && !session.allowLateJoiners) {
        console.warn(`[Session] Late joining not allowed for session: ${sessionId}`);
        
        // Log failed join attempt due to late join disabled
        await securityLoggingService.logFailedJoinAttempt({
          reason: 'LATE_JOIN_DISABLED',
          joinCode,
          nickname,
          ipAddress,
          sessionId,
          message: 'Late joining is not allowed for this session',
        });
        
        res.status(400).json({
          success: false,
          error: 'Late joining disabled',
          message: 'This quiz has already started and late joining is not allowed.',
        });
        return;
      }

      // 6. Check if IP address is banned from this session
      // This prevents banned participants from rejoining with a new nickname
      const { redisService } = await import('../services/redis.service');
      const redis = redisService.getClient();
      const banListKey = `session:${sessionId}:banned_ips`;
      const isBanned = await redis.sismember(banListKey, ipAddress);
      
      if (isBanned) {
        console.warn(`[Session] Banned IP attempted to join: ${ipAddress} for session ${sessionId}`);
        
        // Log failed join attempt due to IP ban
        await securityLoggingService.logFailedJoinAttempt({
          reason: 'IP_BANNED',
          joinCode,
          nickname,
          ipAddress,
          sessionId,
          message: 'IP address is banned from this session',
        });
        
        res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'You have been banned from this quiz session.',
        });
        return;
      }

      // 7. Create participant record
      const participantId = uuidv4();
      const now = new Date();

      const participant: Participant = {
        participantId,
        sessionId,
        nickname: nickname.trim(),
        ipAddress,
        isActive: true,
        isEliminated: false,
        isSpectator: currentState !== 'LOBBY', // Late joiners become spectators
        isBanned: false,
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        lastConnectedAt: now,
        joinedAt: now,
      };

      // 8. Store participant in MongoDB
      const participantsCollection = mongodbService.getCollection<Participant>('participants');
      await mongodbService.withRetry(async () => {
        await participantsCollection.insertOne(participant);
      });

      console.log(`[Session] Created participant ${participantId} for session ${sessionId}`);

      // 9. Cache participant data in Redis
      await redisDataStructuresService.setParticipantSession(participantId, {
        sessionId,
        nickname: participant.nickname,
        totalScore: 0,
        totalTimeMs: 0,
        streakCount: 0,
        isActive: true,
        isEliminated: false,
      });

      console.log(`[Session] Cached participant data in Redis`);

      // 10. Update participant count in session
      // Increment in Redis
      const updatedParticipantCount = (redisState?.participantCount || 0) + 1;
      await redisDataStructuresService.updateSessionState(sessionId, {
        participantCount: updatedParticipantCount,
      });

      // Update in MongoDB
      await mongodbService.withRetry(async () => {
        await sessionsCollection.updateOne(
          { sessionId },
          {
            $inc: { participantCount: 1 },
            $push: { activeParticipants: participantId },
          }
        );
      });

      console.log(`[Session] Updated participant count to ${updatedParticipantCount}`);

      // 11. Generate session token (JWT)
      const sessionToken = generateParticipantToken(participantId, sessionId, participant.nickname);

      console.log(`[Session] Generated session token for participant ${participantId}`);

      // 12. Broadcast participant_joined event via Redis pub/sub
      // This will be picked up by WebSocket server to notify all connected clients
      // If session is in LOBBY state, this will also broadcast updated lobby_state
      const { broadcastService } = await import('../services/broadcast.service');
      
      await broadcastService.broadcastParticipantJoined(
        sessionId,
        participantId,
        participant.nickname,
        updatedParticipantCount
      );

      console.log(`[Session] Broadcasted participant_joined event for ${participantId}`);

      // 13. Return success response
      res.status(200).json({
        success: true,
        sessionId,
        participantId,
        sessionToken,
        session: {
          state: currentState,
          currentQuestionIndex: redisState?.currentQuestionIndex ?? session.currentQuestionIndex,
          isSpectator: participant.isSpectator,
        },
        message: participant.isSpectator 
          ? 'Joined as spectator. You can watch but cannot answer questions.'
          : 'Successfully joined the quiz!',
      });
    } catch (error: any) {
      console.error('[Session] Error joining session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to join session',
        message: error.message || 'An unexpected error occurred',
      });
    }
  }
);

/**
 * GET /api/sessions/:sessionId
 * 
 * Get session details with participant list and quiz information
 * 
 * Response:
 * - 200: Session retrieved successfully
 *   {
 *     success: true,
 *     session: {
 *       sessionId: string,
 *       quizId: string,
 *       joinCode: string,
 *       state: SessionState,
 *       currentQuestionIndex: number,
 *       participantCount: number,
 *       activeParticipants: string[],
 *       eliminatedParticipants: string[],
 *       voidedQuestions: string[],
 *       createdAt: Date,
 *       startedAt?: Date,
 *       endedAt?: Date
 *     },
 *     quiz: Quiz,
 *     participants: Array<{
 *       participantId: string,
 *       nickname: string,
 *       totalScore: number,
 *       isActive: boolean,
 *       isEliminated: boolean,
 *       joinedAt: Date
 *     }>
 *   }
 * - 404: Session not found
 * - 500: Server error
 * 
 * Requirements: 2.1
 */
router.get('/:sessionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;

    // Try to get session from Redis first (fast path)
    const redisState = await redisDataStructuresService.getSessionState(sessionId);
    
    // Get session from MongoDB (authoritative source)
    const sessionsCollection = mongodbService.getCollection<Session>('sessions');
    const session = await mongodbService.withRetry(async () => {
      return await sessionsCollection.findOne({ sessionId });
    });

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
        message: `No session found with ID: ${sessionId}`,
      });
      return;
    }

    // Get quiz details
    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const quiz = await mongodbService.withRetry(async () => {
      return await quizzesCollection.findOne({ _id: session.quizId });
    });

    if (!quiz) {
      res.status(404).json({
        success: false,
        error: 'Quiz not found',
        message: `Quiz not found for session ${sessionId}`,
      });
      return;
    }

    // Get participants for this session
    const participantsCollection = mongodbService.getCollection('participants');
    const participants = await mongodbService.withRetry(async () => {
      return await participantsCollection
        .find({ sessionId })
        .sort({ totalScore: -1, totalTimeMs: 1 }) // Sort by score desc, time asc
        .toArray();
    });

    // Format participant data
    const formattedParticipants = participants.map((p: any) => ({
      participantId: p.participantId,
      nickname: p.nickname,
      totalScore: p.totalScore,
      isActive: p.isActive,
      isEliminated: p.isEliminated,
      joinedAt: p.joinedAt,
    }));

    // Merge Redis state with MongoDB session if Redis has more recent data
    const sessionData = {
      sessionId: session.sessionId,
      quizId: session.quizId.toString(),
      joinCode: session.joinCode,
      state: redisState?.state || session.state,
      currentQuestionIndex: redisState?.currentQuestionIndex ?? session.currentQuestionIndex,
      participantCount: redisState?.participantCount ?? session.participantCount,
      activeParticipants: session.activeParticipants,
      eliminatedParticipants: session.eliminatedParticipants,
      voidedQuestions: session.voidedQuestions,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    };

    console.log(`[Session] Retrieved session ${sessionId} with ${formattedParticipants.length} participants`);

    res.status(200).json({
      success: true,
      session: sessionData,
      quiz: {
        _id: quiz._id,
        title: quiz.title,
        description: quiz.description,
        quizType: quiz.quizType,
        branding: quiz.branding,
        eliminationSettings: quiz.eliminationSettings,
        ffiSettings: quiz.ffiSettings,
        questions: quiz.questions,
      },
      participants: formattedParticipants,
    });
  } catch (error: any) {
    console.error('[Session] Error retrieving session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/sessions/:sessionId/start
 * 
 * Start quiz from lobby state
 * 
 * Transitions session from LOBBY to ACTIVE_QUESTION state and broadcasts
 * quiz_started event to all connected clients via Redis pub/sub.
 * 
 * Response:
 * - 200: Quiz started successfully
 *   {
 *     success: true,
 *     message: 'Quiz started successfully',
 *     session: {
 *       sessionId: string,
 *       state: 'ACTIVE_QUESTION',
 *       currentQuestionIndex: 0,
 *       startedAt: Date
 *     }
 *   }
 * - 400: Invalid state (not in LOBBY)
 * - 404: Session not found
 * - 500: Server error
 * 
 * Requirements: 2.3
 */
router.post('/:sessionId/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;

    // Get session from MongoDB
    const sessionsCollection = mongodbService.getCollection<Session>('sessions');
    const session = await mongodbService.withRetry(async () => {
      return await sessionsCollection.findOne({ sessionId });
    });

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
        message: `No session found with ID: ${sessionId}`,
      });
      return;
    }

    // Verify session is in LOBBY state
    // Check Redis first for most recent state, fallback to MongoDB
    const redisState = await redisDataStructuresService.getSessionState(sessionId);
    const currentState = redisState?.state || session.state;

    if (currentState !== 'LOBBY') {
      res.status(400).json({
        success: false,
        error: 'Invalid state',
        message: `Cannot start quiz from ${currentState} state. Quiz must be in LOBBY state.`,
      });
      return;
    }

    // Transition to ACTIVE_QUESTION state
    const now = new Date();

    // Update MongoDB
    await mongodbService.withRetry(async () => {
      await sessionsCollection.updateOne(
        { sessionId },
        {
          $set: {
            state: 'ACTIVE_QUESTION',
            currentQuestionIndex: 0,
            startedAt: now,
          },
        }
      );
    });

    console.log(`[Session] Started quiz for session ${sessionId}`);

    // Update Redis
    await redisDataStructuresService.updateSessionState(sessionId, {
      state: 'ACTIVE_QUESTION',
      currentQuestionIndex: 0,
    });

    console.log(`[Session] Updated session state in Redis`);

    // Broadcast quiz_started event via Redis pub/sub
    // This will be picked up by WebSocket server to notify all connected clients
    const { broadcastService } = await import('../services/broadcast.service');
    
    // Get quiz details for the broadcast
    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const quiz = await mongodbService.withRetry(async () => {
      return await quizzesCollection.findOne({ _id: session.quizId });
    });

    if (quiz) {
      await broadcastService.broadcastQuizStarted(sessionId, quiz.questions.length);
      console.log(`[Session] Broadcasted quiz_started event for session ${sessionId}`);
    }

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Quiz started successfully',
      session: {
        sessionId,
        state: 'ACTIVE_QUESTION',
        currentQuestionIndex: 0,
        startedAt: now,
      },
    });
  } catch (error: any) {
    console.error('[Session] Error starting quiz:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start quiz',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/sessions/:sessionId/end
 * 
 * End quiz session and calculate final leaderboard
 * 
 * Transitions session to ENDED state, calculates final leaderboard from MongoDB,
 * persists final results, and broadcasts quiz_ended event to all connected clients.
 * 
 * Response:
 * - 200: Quiz ended successfully
 *   {
 *     success: true,
 *     message: 'Quiz ended successfully',
 *     session: {
 *       sessionId: string,
 *       state: 'ENDED',
 *       endedAt: Date
 *     },
 *     finalLeaderboard: Array<{
 *       rank: number,
 *       participantId: string,
 *       nickname: string,
 *       totalScore: number,
 *       totalTimeMs: number
 *     }>
 *   }
 * - 400: Invalid state (already ended)
 * - 404: Session not found
 * - 500: Server error
 * 
 * Requirements: 2.6, 16.6
 */
router.post('/:sessionId/end', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;

    // Get session from MongoDB
    const sessionsCollection = mongodbService.getCollection<Session>('sessions');
    const session = await mongodbService.withRetry(async () => {
      return await sessionsCollection.findOne({ sessionId });
    });

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
        message: `No session found with ID: ${sessionId}`,
      });
      return;
    }

    // Verify session is not already ended
    // Check Redis first for most recent state, fallback to MongoDB
    const redisState = await redisDataStructuresService.getSessionState(sessionId);
    const currentState = redisState?.state || session.state;

    if (currentState === 'ENDED') {
      res.status(400).json({
        success: false,
        error: 'Invalid state',
        message: 'Quiz has already ended.',
      });
      return;
    }

    // Calculate final leaderboard from MongoDB (authoritative source)
    const participantsCollection = mongodbService.getCollection('participants');
    const participants = await mongodbService.withRetry(async () => {
      return await participantsCollection
        .find({ 
          sessionId,
          isActive: true, // Only include active participants
        })
        .sort({ 
          totalScore: -1,  // Sort by score descending
          totalTimeMs: 1,  // Then by time ascending (lower time ranks higher)
        })
        .toArray();
    });

    // Format final leaderboard with ranks
    const finalLeaderboard = participants.map((p: any, index: number) => ({
      rank: index + 1,
      participantId: p.participantId,
      nickname: p.nickname,
      totalScore: p.totalScore,
      totalTimeMs: p.totalTimeMs,
    }));

    console.log(`[Session] Calculated final leaderboard for session ${sessionId} with ${finalLeaderboard.length} participants`);

    // Transition to ENDED state
    const now = new Date();

    // Update MongoDB with final state
    await mongodbService.withRetry(async () => {
      await sessionsCollection.updateOne(
        { sessionId },
        {
          $set: {
            state: 'ENDED',
            endedAt: now,
          },
        }
      );
    });

    console.log(`[Session] Ended quiz for session ${sessionId}`);

    // Update Redis
    await redisDataStructuresService.updateSessionState(sessionId, {
      state: 'ENDED',
    });

    console.log(`[Session] Updated session state in Redis`);

    // Broadcast quiz_ended event via broadcast service
    const { broadcastService } = await import('../services/broadcast.service');
    
    await broadcastService.broadcastQuizEnded(sessionId, finalLeaderboard);

    console.log(`[Session] Broadcasted quiz_ended event for session ${sessionId}`);

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Quiz ended successfully',
      session: {
        sessionId,
        state: 'ENDED',
        endedAt: now,
      },
      finalLeaderboard,
    });
  } catch (error: any) {
    console.error('[Session] Error ending quiz:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end quiz',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/sessions/:sessionId/results
 * 
 * Get session results with final leaderboard and detailed answer history
 * 
 * Retrieves comprehensive results for a completed quiz session including:
 * - Final leaderboard with all participant rankings
 * - Detailed answer history for each participant showing which questions they answered correctly/incorrectly
 * - Per-question statistics
 * 
 * Response:
 * - 200: Results retrieved successfully
 *   {
 *     success: true,
 *     session: {
 *       sessionId: string,
 *       quizId: string,
 *       state: SessionState,
 *       createdAt: Date,
 *       startedAt?: Date,
 *       endedAt?: Date
 *     },
 *     leaderboard: Array<{
 *       rank: number,
 *       participantId: string,
 *       nickname: string,
 *       totalScore: number,
 *       totalTimeMs: number,
 *       answerHistory: Array<{
 *         questionId: string,
 *         questionText: string,
 *         selectedOptions: string[],
 *         isCorrect: boolean,
 *         pointsAwarded: number,
 *         responseTimeMs: number,
 *         speedBonusApplied: number,
 *         streakBonusApplied: number
 *       }>
 *     }>,
 *     statistics: {
 *       totalParticipants: number,
 *       totalQuestions: number,
 *       averageScore: number,
 *       averageCompletionTime: number
 *     }
 *   }
 * - 404: Session not found
 * - 500: Server error
 * 
 * Requirements: 16.6
 */
router.get('/:sessionId/results', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;

    // Get session from MongoDB
    const sessionsCollection = mongodbService.getCollection<Session>('sessions');
    const session = await mongodbService.withRetry(async () => {
      return await sessionsCollection.findOne({ sessionId });
    });

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
        message: `No session found with ID: ${sessionId}`,
      });
      return;
    }

    // Get quiz details for question information
    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const quiz = await mongodbService.withRetry(async () => {
      return await quizzesCollection.findOne({ _id: session.quizId });
    });

    if (!quiz) {
      res.status(404).json({
        success: false,
        error: 'Quiz not found',
        message: `Quiz not found for session ${sessionId}`,
      });
      return;
    }

    // Create a map of questionId to question details for quick lookup
    const questionMap = new Map(
      quiz.questions.map((q) => [q.questionId, q])
    );

    // Get all participants for this session (sorted by score and time)
    const participantsCollection = mongodbService.getCollection('participants');
    const participants = await mongodbService.withRetry(async () => {
      return await participantsCollection
        .find({ 
          sessionId,
          isActive: true, // Only include active participants in results
        })
        .sort({ 
          totalScore: -1,  // Sort by score descending
          totalTimeMs: 1,  // Then by time ascending (lower time ranks higher)
        })
        .toArray();
    });

    // Get all answers for this session
    const answersCollection = mongodbService.getCollection('answers');
    const answers = await mongodbService.withRetry(async () => {
      return await answersCollection
        .find({ sessionId })
        .sort({ submittedAt: 1 }) // Sort by submission time
        .toArray();
    });

    // Group answers by participantId for efficient lookup
    const answersByParticipant = new Map<string, any[]>();
    for (const answer of answers) {
      const participantAnswers = answersByParticipant.get(answer.participantId) || [];
      participantAnswers.push(answer);
      answersByParticipant.set(answer.participantId, participantAnswers);
    }

    // Build leaderboard with detailed answer history
    const leaderboard = participants.map((participant: any, index: number) => {
      const participantAnswers = answersByParticipant.get(participant.participantId) || [];
      
      // Build answer history with question details
      const answerHistory = participantAnswers.map((answer: any) => {
        const question = questionMap.get(answer.questionId);
        
        return {
          questionId: answer.questionId,
          questionText: question?.questionText || 'Unknown Question',
          selectedOptions: answer.selectedOptions,
          isCorrect: answer.isCorrect,
          pointsAwarded: answer.pointsAwarded,
          responseTimeMs: answer.responseTimeMs,
          speedBonusApplied: answer.speedBonusApplied,
          streakBonusApplied: answer.streakBonusApplied,
        };
      });

      return {
        rank: index + 1,
        participantId: participant.participantId,
        nickname: participant.nickname,
        totalScore: participant.totalScore,
        totalTimeMs: participant.totalTimeMs,
        answerHistory,
      };
    });

    // Calculate statistics
    const totalParticipants = participants.length;
    const totalQuestions = quiz.questions.length;
    const averageScore = totalParticipants > 0
      ? participants.reduce((sum: number, p: any) => sum + p.totalScore, 0) / totalParticipants
      : 0;
    const averageCompletionTime = totalParticipants > 0
      ? participants.reduce((sum: number, p: any) => sum + p.totalTimeMs, 0) / totalParticipants
      : 0;

    console.log(`[Session] Retrieved results for session ${sessionId} with ${totalParticipants} participants and ${answers.length} answers`);

    // Return results
    res.status(200).json({
      success: true,
      session: {
        sessionId: session.sessionId,
        quizId: session.quizId.toString(),
        state: session.state,
        createdAt: session.createdAt,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      },
      leaderboard,
      statistics: {
        totalParticipants,
        totalQuestions,
        averageScore: Math.round(averageScore * 100) / 100, // Round to 2 decimal places
        averageCompletionTime: Math.round(averageCompletionTime),
      },
    });
  } catch (error: any) {
    console.error('[Session] Error retrieving results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve results',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/sessions/:sessionId/export
 * 
 * Export session results as CSV or JSON file
 * 
 * Query Parameters:
 * - format: 'csv' | 'json' (default: 'json')
 * 
 * Response:
 * - 200: File download with appropriate Content-Type and Content-Disposition headers
 *   - CSV: text/csv with .csv file extension
 *   - JSON: application/json with .json file extension
 * - 404: Session not found
 * - 500: Server error
 * 
 * Export includes:
 * - Session metadata (sessionId, quizId, state, timestamps)
 * - Quiz information (title, type)
 * - All participants with scores and rankings
 * - All answers with scoring details
 * - Final leaderboard
 * - Statistics (total participants, questions, average score)
 * 
 * Requirements: 16.8
 */
router.post('/:sessionId/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const format = (req.query.format as string)?.toLowerCase() || 'json';

    // Validate format
    if (format !== 'csv' && format !== 'json') {
      res.status(400).json({
        success: false,
        error: 'Invalid format',
        message: 'Format must be either "csv" or "json"',
      });
      return;
    }

    // Get session from MongoDB
    const sessionsCollection = mongodbService.getCollection<Session>('sessions');
    const session = await mongodbService.withRetry(async () => {
      return await sessionsCollection.findOne({ sessionId });
    });

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
        message: `No session found with ID: ${sessionId}`,
      });
      return;
    }

    // Get quiz details
    const quizzesCollection = mongodbService.getCollection<Quiz>('quizzes');
    const quiz = await mongodbService.withRetry(async () => {
      return await quizzesCollection.findOne({ _id: session.quizId });
    });

    if (!quiz) {
      res.status(404).json({
        success: false,
        error: 'Quiz not found',
        message: `Quiz not found for session ${sessionId}`,
      });
      return;
    }

    // Create a map of questionId to question details
    const questionMap = new Map(
      quiz.questions.map((q) => [q.questionId, q])
    );

    // Get all participants for this session (sorted by score and time)
    const participantsCollection = mongodbService.getCollection('participants');
    const participants = await mongodbService.withRetry(async () => {
      return await participantsCollection
        .find({ sessionId })
        .sort({ 
          totalScore: -1,
          totalTimeMs: 1,
        })
        .toArray();
    });

    // Get all answers for this session
    const answersCollection = mongodbService.getCollection('answers');
    const answers = await mongodbService.withRetry(async () => {
      return await answersCollection
        .find({ sessionId })
        .sort({ submittedAt: 1 })
        .toArray();
    });

    // Group answers by participantId
    const answersByParticipant = new Map<string, any[]>();
    for (const answer of answers) {
      const participantAnswers = answersByParticipant.get(answer.participantId) || [];
      participantAnswers.push(answer);
      answersByParticipant.set(answer.participantId, participantAnswers);
    }

    // Build leaderboard with answer history
    const leaderboard = participants.map((participant: any, index: number) => {
      const participantAnswers = answersByParticipant.get(participant.participantId) || [];
      
      const answerHistory = participantAnswers.map((answer: any) => {
        const question = questionMap.get(answer.questionId);
        return {
          questionId: answer.questionId,
          questionText: question?.questionText || 'Unknown Question',
          selectedOptions: answer.selectedOptions,
          isCorrect: answer.isCorrect,
          pointsAwarded: answer.pointsAwarded,
          responseTimeMs: answer.responseTimeMs,
          speedBonusApplied: answer.speedBonusApplied,
          streakBonusApplied: answer.streakBonusApplied,
          partialCreditApplied: answer.partialCreditApplied,
        };
      });

      return {
        rank: index + 1,
        participantId: participant.participantId,
        nickname: participant.nickname,
        totalScore: participant.totalScore,
        totalTimeMs: participant.totalTimeMs,
        isActive: participant.isActive,
        isEliminated: participant.isEliminated,
        joinedAt: participant.joinedAt,
        answerHistory,
      };
    });

    // Calculate statistics
    const activeParticipants = participants.filter((p: any) => p.isActive);
    const totalParticipants = participants.length;
    const totalQuestions = quiz.questions.length;
    const averageScore = activeParticipants.length > 0
      ? activeParticipants.reduce((sum: number, p: any) => sum + p.totalScore, 0) / activeParticipants.length
      : 0;
    const averageCompletionTime = activeParticipants.length > 0
      ? activeParticipants.reduce((sum: number, p: any) => sum + p.totalTimeMs, 0) / activeParticipants.length
      : 0;

    // Build export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      session: {
        sessionId: session.sessionId,
        quizId: session.quizId.toString(),
        joinCode: session.joinCode,
        state: session.state,
        createdAt: session.createdAt,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      },
      quiz: {
        title: quiz.title,
        description: quiz.description,
        quizType: quiz.quizType,
        totalQuestions: quiz.questions.length,
        questions: quiz.questions.map((q) => ({
          questionId: q.questionId,
          questionText: q.questionText,
          questionType: q.questionType,
          timeLimit: q.timeLimit,
          basePoints: q.scoring.basePoints,
          options: q.options.map((o) => ({
            optionId: o.optionId,
            optionText: o.optionText,
            isCorrect: o.isCorrect,
          })),
        })),
      },
      statistics: {
        totalParticipants,
        activeParticipants: activeParticipants.length,
        totalQuestions,
        totalAnswers: answers.length,
        averageScore: Math.round(averageScore * 100) / 100,
        averageCompletionTimeMs: Math.round(averageCompletionTime),
      },
      leaderboard,
      answers: answers.map((a: any) => ({
        answerId: a.answerId,
        participantId: a.participantId,
        questionId: a.questionId,
        selectedOptions: a.selectedOptions,
        answerText: a.answerText,
        answerNumber: a.answerNumber,
        submittedAt: a.submittedAt,
        responseTimeMs: a.responseTimeMs,
        isCorrect: a.isCorrect,
        pointsAwarded: a.pointsAwarded,
        speedBonusApplied: a.speedBonusApplied,
        streakBonusApplied: a.streakBonusApplied,
        partialCreditApplied: a.partialCreditApplied,
      })),
    };

    const filename = `quiz-results-${sessionId}-${new Date().toISOString().split('T')[0]}`;

    if (format === 'json') {
      // Return JSON file
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.status(200).send(JSON.stringify(exportData, null, 2));
    } else {
      // Generate CSV
      const csvContent = generateCSV(exportData, quiz, leaderboard, answers);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.status(200).send(csvContent);
    }

    console.log(`[Session] Exported results for session ${sessionId} in ${format} format`);
  } catch (error: any) {
    console.error('[Session] Error exporting results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export results',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * Generate CSV content from export data
 * Creates a multi-section CSV with session info, leaderboard, and detailed answers
 */
function generateCSV(
  exportData: any,
  quiz: Quiz,
  leaderboard: any[],
  answers: any[]
): string {
  const lines: string[] = [];

  // Helper to escape CSV values
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Section 1: Session Information
  lines.push('=== SESSION INFORMATION ===');
  lines.push('Field,Value');
  lines.push(`Session ID,${escapeCSV(exportData.session.sessionId)}`);
  lines.push(`Quiz Title,${escapeCSV(quiz.title)}`);
  lines.push(`Quiz Type,${escapeCSV(quiz.quizType)}`);
  lines.push(`Join Code,${escapeCSV(exportData.session.joinCode)}`);
  lines.push(`State,${escapeCSV(exportData.session.state)}`);
  lines.push(`Created At,${escapeCSV(exportData.session.createdAt)}`);
  lines.push(`Started At,${escapeCSV(exportData.session.startedAt || 'N/A')}`);
  lines.push(`Ended At,${escapeCSV(exportData.session.endedAt || 'N/A')}`);
  lines.push(`Exported At,${escapeCSV(exportData.exportedAt)}`);
  lines.push('');

  // Section 2: Statistics
  lines.push('=== STATISTICS ===');
  lines.push('Metric,Value');
  lines.push(`Total Participants,${exportData.statistics.totalParticipants}`);
  lines.push(`Active Participants,${exportData.statistics.activeParticipants}`);
  lines.push(`Total Questions,${exportData.statistics.totalQuestions}`);
  lines.push(`Total Answers,${exportData.statistics.totalAnswers}`);
  lines.push(`Average Score,${exportData.statistics.averageScore}`);
  lines.push(`Average Completion Time (ms),${exportData.statistics.averageCompletionTimeMs}`);
  lines.push('');

  // Section 3: Leaderboard
  lines.push('=== LEADERBOARD ===');
  lines.push('Rank,Participant ID,Nickname,Total Score,Total Time (ms),Is Active,Is Eliminated,Joined At');
  for (const entry of leaderboard) {
    lines.push([
      entry.rank,
      escapeCSV(entry.participantId),
      escapeCSV(entry.nickname),
      entry.totalScore,
      entry.totalTimeMs,
      entry.isActive,
      entry.isEliminated,
      escapeCSV(entry.joinedAt),
    ].join(','));
  }
  lines.push('');

  // Section 4: Questions
  lines.push('=== QUESTIONS ===');
  lines.push('Question ID,Question Text,Question Type,Time Limit (s),Base Points,Correct Options');
  for (const question of quiz.questions) {
    const correctOptions = question.options
      .filter((o) => o.isCorrect)
      .map((o) => o.optionText)
      .join('; ');
    lines.push([
      escapeCSV(question.questionId),
      escapeCSV(question.questionText),
      escapeCSV(question.questionType),
      question.timeLimit,
      question.scoring.basePoints,
      escapeCSV(correctOptions),
    ].join(','));
  }
  lines.push('');

  // Section 5: All Answers
  lines.push('=== ANSWERS ===');
  lines.push('Answer ID,Participant ID,Question ID,Selected Options,Is Correct,Points Awarded,Response Time (ms),Speed Bonus,Streak Bonus,Submitted At');
  for (const answer of answers) {
    lines.push([
      escapeCSV(answer.answerId),
      escapeCSV(answer.participantId),
      escapeCSV(answer.questionId),
      escapeCSV(answer.selectedOptions?.join('; ') || ''),
      answer.isCorrect,
      answer.pointsAwarded,
      answer.responseTimeMs,
      answer.speedBonusApplied,
      answer.streakBonusApplied,
      escapeCSV(answer.submittedAt),
    ].join(','));
  }

  return lines.join('\n');
}

export default router;
