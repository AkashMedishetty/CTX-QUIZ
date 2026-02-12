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
import type { Quiz, Session, Participant, QuizExamSettings, ExamModeConfig } from '../models/types';

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
 * Map quiz-level exam settings to session-level exam mode configuration.
 * 
 * Returns undefined when:
 * - Input is undefined
 * - Both negativeMarkingEnabled and focusMonitoringEnabled are false
 * 
 * Sets skipRevealPhase and autoAdvance to false as defaults.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
export function mapExamSettingsToExamMode(
  examSettings?: QuizExamSettings
): ExamModeConfig | undefined {
  if (!examSettings) return undefined;
  // Create exam mode config if any exam feature is enabled
  const hasAnyExamFeature = 
    examSettings.negativeMarkingEnabled || 
    examSettings.focusMonitoringEnabled ||
    examSettings.skipRevealPhase ||
    examSettings.autoAdvance;
  if (!hasAnyExamFeature) {
    return undefined;
  }
  return {
    skipRevealPhase: examSettings.skipRevealPhase ?? false,
    negativeMarkingEnabled: examSettings.negativeMarkingEnabled,
    negativeMarkingPercentage: examSettings.negativeMarkingPercentage,
    focusMonitoringEnabled: examSettings.focusMonitoringEnabled,
    autoAdvance: examSettings.autoAdvance ?? false,
  };
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
      const examMode = mapExamSettingsToExamMode(quiz.examSettings);
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
        examMode,
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
          examMode: session.examMode,
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
          examMode: session.examMode || null,
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

      // 6b. Check tournament elimination enforcement
      // If this session belongs to a tournament round (not round 1), verify participant is qualified
      if (session.tournamentId && session.tournamentRoundNumber && session.tournamentRoundNumber > 1) {
        const { tournamentService } = await import('../services/tournament.service');
        
        // For tournament rounds after the first, we need to check if this participant
        // was qualified from the previous round. Since this is a new join, we check
        // if the nickname matches any qualified participant from the previous round.
        const tournament = await tournamentService.getTournament(session.tournamentId);
        
        if (tournament) {
          const roundIndex = session.tournamentRoundNumber - 1;
          const round = tournament.rounds[roundIndex];
          
          if (round && round.qualifiedParticipants.length > 0) {
            // Get the previous round's session to check participant nicknames
            const prevRound = tournament.rounds[roundIndex - 1];
            if (prevRound?.sessionId) {
              const prevParticipantsCollection = mongodbService.getCollection<Participant>('participants');
              const prevParticipants = await prevParticipantsCollection
                .find({
                  sessionId: prevRound.sessionId,
                  participantId: { $in: round.qualifiedParticipants },
                })
                .toArray();
              
              const qualifiedNicknames = prevParticipants.map(p => p.nickname.toLowerCase());
              
              if (!qualifiedNicknames.includes(nickname.trim().toLowerCase())) {
                console.warn(`[Session] Eliminated participant attempted to join tournament round: ${nickname}`);
                
                await securityLoggingService.logFailedJoinAttempt({
                  reason: 'INVALID_JOIN_CODE', // Use existing reason type
                  joinCode,
                  nickname,
                  ipAddress,
                  sessionId,
                  message: 'Participant was eliminated in previous tournament round',
                });
                
                res.status(403).json({
                  success: false,
                  error: 'Not qualified',
                  message: 'You were eliminated in a previous round and cannot join this tournament round.',
                });
                return;
              }
            }
          }
        }
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
      examMode: session.examMode || null,
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

    // Get audit logs for this session (focus events, disconnections, etc.)
    const auditLogsCollection = mongodbService.getCollection('auditLogs');
    const auditLogs = await mongodbService.withRetry(async () => {
      return await auditLogsCollection
        .find({ sessionId })
        .sort({ timestamp: 1 })
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
    // Compute scores from actual answers as authoritative source
    // (MongoDB participant.totalScore may be stale if Redis wasn't flushed)
    const leaderboard = participants.map((participant: any) => {
      const participantAnswers = answersByParticipant.get(participant.participantId) || [];
      
      // Compute total score from answers (authoritative)
      const computedScore = participantAnswers.reduce(
        (sum: number, a: any) => sum + (a.pointsAwarded || 0), 0
      );
      const computedTimeMs = participantAnswers.reduce(
        (sum: number, a: any) => sum + (a.responseTimeMs || 0), 0
      );

      // Use computed score if MongoDB score is 0 but answers exist
      const totalScore = (participant.totalScore || 0) > 0
        ? participant.totalScore
        : computedScore;
      const totalTimeMs = (participant.totalTimeMs || 0) > 0
        ? participant.totalTimeMs
        : computedTimeMs;

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
        rank: 0, // Will be set after sorting
        participantId: participant.participantId,
        nickname: participant.nickname,
        totalScore,
        totalTimeMs,
        isActive: participant.isActive,
        isEliminated: participant.isEliminated,
        joinedAt: participant.joinedAt,
        answerHistory,
      };
    });

    // Sort by score desc, then time asc, then assign ranks
    leaderboard.sort((a: any, b: any) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return a.totalTimeMs - b.totalTimeMs;
    });
    leaderboard.forEach((entry: any, idx: number) => { entry.rank = idx + 1; });

    // Calculate statistics from the corrected leaderboard
    const activeParticipants = leaderboard.filter((p: any) => p.isActive);
    const totalParticipants = leaderboard.length;
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
        examMode: session.examMode || null,
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
        negativeDeductionApplied: a.negativeDeductionApplied,
      })),
      auditLogs: auditLogs.map((log: any) => ({
        timestamp: log.timestamp,
        eventType: log.eventType,
        participantId: log.participantId || null,
        details: log.details || {},
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
      const csvContent = generateCSV(exportData, quiz, leaderboard, answers, auditLogs);
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
 * GET /api/sessions/:sessionId/participants/:participantId/answers
 * 
 * Get answer history for a specific participant in a session
 * Returns all answers with question details for the answer review screen
 * 
 * Response:
 * - 200: Answer history retrieved successfully
 *   {
 *     success: true,
 *     answers: Array<{
 *       questionId: string,
 *       questionText: string,
 *       options: Array<{ optionId: string, optionText: string, isCorrect: boolean }>,
 *       participantAnswer: string[],
 *       correctAnswer: string[],
 *       pointsEarned: number,
 *       maxPoints: number,
 *       explanationText?: string
 *     }>,
 *     totalScore: number,
 *     totalQuestions: number
 *   }
 * - 404: Session or participant not found
 * - 500: Server error
 * 
 * Requirements: 8.1
 */
router.get(
  '/:sessionId/participants/:participantId/answers',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, participantId } = req.params;

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

      // Verify participant exists in this session
      const participantsCollection = mongodbService.getCollection<Participant>('participants');
      const participant = await mongodbService.withRetry(async () => {
        return await participantsCollection.findOne({ participantId, sessionId });
      });

      if (!participant) {
        res.status(404).json({
          success: false,
          error: 'Participant not found',
          message: `No participant found with ID: ${participantId} in session ${sessionId}`,
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

      // Get all answers for this participant in this session
      const answersCollection = mongodbService.getCollection('answers');
      const answers = await mongodbService.withRetry(async () => {
        return await answersCollection
          .find({ sessionId, participantId })
          .sort({ submittedAt: 1 })
          .toArray();
      });

      // Create a map of answers by questionId for quick lookup
      const answerMap = new Map<string, any>();
      for (const answer of answers) {
        answerMap.set(answer.questionId, answer);
      }

      // Build the answer review data by joining questions with answers
      const answerReviewData = quiz.questions.map((question) => {
        const answer = answerMap.get(question.questionId);
        const correctOptions = question.options
          .filter((opt) => opt.isCorrect)
          .map((opt) => opt.optionId);

        return {
          questionId: question.questionId,
          questionText: question.questionText,
          options: question.options.map((opt) => ({
            optionId: opt.optionId,
            optionText: opt.optionText,
            isCorrect: opt.isCorrect,
          })),
          participantAnswer: answer?.selectedOptions || [],
          correctAnswer: correctOptions,
          pointsEarned: answer?.pointsAwarded || 0,
          maxPoints: question.scoring.basePoints,
          explanationText: question.explanationText,
        };
      });

      // Calculate total score from answers
      const totalScore = answers.reduce((sum: number, a: any) => sum + (a.pointsAwarded || 0), 0);

      console.log(`[Session] Retrieved ${answerReviewData.length} answers for participant ${participantId} in session ${sessionId}`);

      res.status(200).json({
        success: true,
        answers: answerReviewData,
        totalScore,
        totalQuestions: quiz.questions.length,
      });
    } catch (error: any) {
      console.error('[Session] Error retrieving answer history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve answer history',
        message: error.message || 'An unexpected error occurred',
      });
    }
  }
);

/**
 * Generate CSV content from export data
 * Creates a clean, human-readable multi-section CSV with:
 * - Session info, statistics, questions summary
 * - Final leaderboard ranked by score
 * - Per-participant answer breakdown (every response for every participant)
 * - Audit log with nicknames instead of IDs
 * 
 * All UUIDs are resolved to human-readable names (nicknames, option text, question text).
 */
function generateCSV(
  exportData: any,
  quiz: Quiz,
  leaderboard: any[],
  answers: any[],
  auditLogs?: any[]
): string {
  const lines: string[] = [];

  // Helper to escape CSV values
  const esc = (value: any): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Build lookup maps so we never show raw UUIDs
  const participantMap = new Map<string, string>(); // participantId -> nickname
  for (const entry of leaderboard) {
    participantMap.set(entry.participantId, entry.nickname);
  }

  const questionMap = new Map<string, { text: string; type: string; basePoints: number }>();
  const optionMap = new Map<string, string>(); // optionId -> optionText
  for (const q of quiz.questions) {
    questionMap.set(q.questionId, {
      text: q.questionText,
      type: q.questionType,
      basePoints: q.scoring.basePoints,
    });
    for (const o of q.options) {
      optionMap.set(o.optionId, o.optionText);
    }
  }

  const nick = (id: string) => participantMap.get(id) || id;
  const qText = (id: string) => questionMap.get(id)?.text || id;
  const oText = (id: string) => optionMap.get(id) || id;

  // ── Section 1: Session Information ──
  lines.push('=== SESSION INFORMATION ===');
  lines.push('Field,Value');
  lines.push(`Quiz Title,${esc(quiz.title)}`);
  lines.push(`Quiz Type,${esc(quiz.quizType)}`);
  lines.push(`Join Code,${esc(exportData.session.joinCode)}`);
  lines.push(`State,${esc(exportData.session.state)}`);
  if (exportData.session.examMode) {
    lines.push(`Exam Mode,Yes`);
    const em = exportData.session.examMode;
    if (em.negativeMarking) lines.push(`Negative Marking,${em.negativeMarkingPercentage || 25}%`);
    if (em.skipRevealPhase) lines.push(`Skip Reveal Phase,Yes`);
    if (em.autoAdvance) lines.push(`Auto Advance,Yes`);
  }
  lines.push(`Created At,${esc(exportData.session.createdAt)}`);
  lines.push(`Started At,${esc(exportData.session.startedAt || 'N/A')}`);
  lines.push(`Ended At,${esc(exportData.session.endedAt || 'N/A')}`);
  lines.push(`Exported At,${esc(exportData.exportedAt)}`);
  lines.push('');

  // ── Section 2: Statistics ──
  lines.push('=== STATISTICS ===');
  lines.push('Metric,Value');
  lines.push(`Total Participants,${exportData.statistics.totalParticipants}`);
  lines.push(`Active Participants,${exportData.statistics.activeParticipants}`);
  lines.push(`Total Questions,${exportData.statistics.totalQuestions}`);
  lines.push(`Total Answers,${exportData.statistics.totalAnswers}`);
  lines.push(`Average Score,${exportData.statistics.averageScore}`);
  lines.push(`Average Completion Time (ms),${exportData.statistics.averageCompletionTimeMs}`);
  lines.push('');

  // ── Section 3: Questions Summary ──
  lines.push('=== QUESTIONS ===');
  lines.push('Q#,Question Text,Type,Time Limit (s),Base Points,Correct Answer(s)');
  quiz.questions.forEach((question, idx) => {
    const correctOptions = question.options
      .filter((o) => o.isCorrect)
      .map((o) => o.optionText)
      .join('; ');
    lines.push([
      idx + 1,
      esc(question.questionText),
      esc(question.questionType),
      question.timeLimit,
      question.scoring.basePoints,
      esc(correctOptions),
    ].join(','));
  });
  lines.push('');

  // ── Section 4: Final Leaderboard ──
  lines.push('=== FINAL LEADERBOARD ===');
  lines.push('Rank,Nickname,Total Score,Total Time (ms),Questions Answered,Correct Answers,Accuracy %,Status');
  // Group answers by participant for stats
  const answersByParticipant = new Map<string, any[]>();
  for (const a of answers) {
    const list = answersByParticipant.get(a.participantId) || [];
    list.push(a);
    answersByParticipant.set(a.participantId, list);
  }
  for (const entry of leaderboard) {
    const pAnswers = answersByParticipant.get(entry.participantId) || [];
    const correctCount = pAnswers.filter((a: any) => a.isCorrect).length;
    const accuracy = pAnswers.length > 0 ? Math.round((correctCount / pAnswers.length) * 100) : 0;
    const status = entry.isEliminated ? 'Eliminated' : entry.isActive ? 'Active' : 'Inactive';
    lines.push([
      entry.rank,
      esc(entry.nickname),
      entry.totalScore,
      entry.totalTimeMs,
      pAnswers.length,
      correctCount,
      accuracy,
      status,
    ].join(','));
  }
  lines.push('');

  // ── Section 5: Per-Participant Answer Breakdown ──
  // This is the main detailed section: one row per participant per question
  lines.push('=== DETAILED ANSWERS ===');
  lines.push('Nickname,Q#,Question Text,Answer Given,Correct Answer,Is Correct,Points Awarded,Response Time (ms),Speed Bonus,Streak Bonus,Negative Deduction');

  // Build question index map
  const questionIndexMap = new Map<string, number>();
  quiz.questions.forEach((q, idx) => { questionIndexMap.set(q.questionId, idx + 1); });

  // Build correct answers map
  const correctAnswerMap = new Map<string, string>();
  for (const q of quiz.questions) {
    const correct = q.options.filter((o) => o.isCorrect).map((o) => o.optionText).join('; ');
    correctAnswerMap.set(q.questionId, correct);
  }

  for (const entry of leaderboard) {
    const pAnswers = answersByParticipant.get(entry.participantId) || [];
    // Sort by question order
    const sorted = [...pAnswers].sort((a, b) => {
      return (questionIndexMap.get(a.questionId) || 0) - (questionIndexMap.get(b.questionId) || 0);
    });
    for (const answer of sorted) {
      // Resolve selected options to text
      let answerGiven = '';
      if (answer.selectedOptions && answer.selectedOptions.length > 0) {
        answerGiven = answer.selectedOptions.map((id: string) => oText(id)).join('; ');
      } else if (answer.answerText !== undefined && answer.answerText !== null) {
        answerGiven = String(answer.answerText);
      } else if (answer.answerNumber !== undefined && answer.answerNumber !== null) {
        answerGiven = String(answer.answerNumber);
      }

      const qIdx = questionIndexMap.get(answer.questionId) || '?';
      const correctAnswer = correctAnswerMap.get(answer.questionId) || '';

      lines.push([
        esc(entry.nickname),
        qIdx,
        esc(qText(answer.questionId)),
        esc(answerGiven),
        esc(correctAnswer),
        answer.isCorrect ? 'Yes' : 'No',
        answer.pointsAwarded ?? 0,
        answer.responseTimeMs ?? 0,
        answer.speedBonusApplied ?? 0,
        answer.streakBonusApplied ?? 0,
        answer.negativeDeductionApplied ?? 0,
      ].join(','));
    }
  }
  lines.push('');

  // ── Section 6: Audit Logs ──
  if (auditLogs && auditLogs.length > 0) {
    lines.push('=== AUDIT LOGS ===');
    lines.push('Timestamp,Event,Participant,Details');
    for (const log of auditLogs) {
      // Format event type to be readable
      const eventType = String(log.eventType || '').replace(/_/g, ' ');
      const participant = log.participantId ? nick(log.participantId) : '';

      // Extract meaningful details
      let details = '';
      if (log.details) {
        const d = log.details;
        const parts: string[] = [];
        if (d.reason) parts.push(`Reason: ${d.reason}`);
        if (d.currentState) parts.push(`State: ${d.currentState}`);
        if (d.totalScore !== undefined) parts.push(`Score: ${d.totalScore}`);
        if (d.rank !== undefined) parts.push(`Rank: ${d.rank}`);
        if (d.durationMs !== undefined) parts.push(`Duration: ${d.durationMs}ms`);
        if (d.totalFocusLostCount !== undefined) parts.push(`Focus lost count: ${d.totalFocusLostCount}`);
        if (d.totalFocusLostTimeMs !== undefined) parts.push(`Total focus lost: ${d.totalFocusLostTimeMs}ms`);
        details = parts.length > 0 ? parts.join('; ') : JSON.stringify(d);
      }

      lines.push([
        esc(log.timestamp),
        esc(eventType),
        esc(participant),
        esc(details),
      ].join(','));
    }
  }

  return lines.join('\n');
}

/**
 * DELETE /api/sessions/:sessionId
 * 
 * Delete a quiz session and all related data
 * 
 * Only allows deletion of sessions in ENDED state to prevent
 * accidental deletion of active sessions.
 * 
 * Response:
 * - 200: Session deleted successfully
 *   {
 *     success: true,
 *     message: 'Session deleted successfully',
 *     deletedCounts: {
 *       participants: number,
 *       answers: number
 *     }
 *   }
 * - 400: Session is not in ENDED state
 * - 404: Session not found
 * - 500: Server error
 * 
 * Requirements: 6.5, 6.6
 */
router.delete('/:sessionId', async (req: Request, res: Response): Promise<void> => {
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

    // Verify session is in ENDED state
    if (session.state !== 'ENDED') {
      res.status(400).json({
        success: false,
        error: 'Cannot delete active session',
        message: 'Only ended sessions can be deleted. Please end the session first.',
      });
      return;
    }

    // Delete all participants for this session
    const participantsCollection = mongodbService.getCollection('participants');
    const participantsResult = await mongodbService.withRetry(async () => {
      return await participantsCollection.deleteMany({ sessionId });
    });

    console.log(`[Session] Deleted ${participantsResult.deletedCount} participants for session ${sessionId}`);

    // Delete all answers for this session
    const answersCollection = mongodbService.getCollection('answers');
    const answersResult = await mongodbService.withRetry(async () => {
      return await answersCollection.deleteMany({ sessionId });
    });

    console.log(`[Session] Deleted ${answersResult.deletedCount} answers for session ${sessionId}`);

    // Delete the session document
    await mongodbService.withRetry(async () => {
      await sessionsCollection.deleteOne({ sessionId });
    });

    console.log(`[Session] Deleted session ${sessionId}`);

    // Clean up Redis data
    try {
      // Remove session state from Redis
      await redisDataStructuresService.deleteSessionState(sessionId);
      
      // Remove join code mapping if it exists
      if (session.joinCode) {
        await redisDataStructuresService.deleteJoinCodeMapping(session.joinCode);
      }
      
      console.log(`[Session] Cleaned up Redis data for session ${sessionId}`);
    } catch (redisError) {
      // Log but don't fail if Redis cleanup fails
      console.warn(`[Session] Failed to clean up Redis data for session ${sessionId}:`, redisError);
    }

    res.status(200).json({
      success: true,
      message: 'Session deleted successfully',
      deletedCounts: {
        participants: participantsResult.deletedCount,
        answers: answersResult.deletedCount,
      },
    });
  } catch (error: any) {
    console.error('[Session] Error deleting session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete session',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

export default router;
