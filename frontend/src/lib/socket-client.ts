/**
 * Socket.IO Client Wrapper - WebSocket client for CTX Quiz
 * 
 * Provides a configured Socket.IO client with:
 * - Connection management
 * - Event type definitions
 * - Automatic reconnection handling
 * - Event subscription helpers
 * 
 * Requirements: 14.1, 14.2
 */

import { io, Socket, ManagerOptions, SocketOptions } from 'socket.io-client';

// ==================== Event Types ====================

/**
 * Client role types
 */
export type ClientRole = 'participant' | 'controller' | 'bigscreen' | 'tester';

/**
 * Session state types
 */
export type SessionState = 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED';

/**
 * Authentication data sent on connection
 */
export interface AuthData {
  token?: string;
  sessionId?: string;
  role: ClientRole;
}

/**
 * Question option (without correct answer flag)
 */
export interface QuestionOption {
  optionId: string;
  optionText: string;
  optionImageUrl?: string;
}

/**
 * Question data received from server
 */
export interface QuestionData {
  questionId: string;
  questionText: string;
  questionType: string;
  questionImageUrl?: string;
  options: QuestionOption[];
  timeLimit: number;
  shuffleOptions: boolean;
}


/**
 * Leaderboard entry
 */
export interface LeaderboardEntry {
  rank: number;
  participantId: string;
  nickname: string;
  totalScore: number;
  lastQuestionScore?: number;
  streakCount?: number;
  totalTimeMs?: number;
}

/**
 * Participant info
 */
export interface ParticipantInfo {
  participantId: string;
  nickname: string;
}

// ==================== Server -> Client Events ====================

/**
 * Events emitted by the server
 */
export interface ServerToClientEvents {
  // Connection events
  authenticated: (data: { success: boolean; sessionId: string; currentState: SessionState | { state: SessionState; currentQuestionIndex?: number; participantCount?: number } }) => void;
  auth_error: (data: { error: string }) => void;
  error: (data: { code?: string; message?: string; error?: string; event?: string }) => void;
  rate_limit_exceeded: (data: { action: string; retryAfter: number }) => void;

  // Session lifecycle events
  lobby_state: (data: {
    sessionId: string;
    joinCode: string;
    participantCount: number;
    participants: ParticipantInfo[];
    totalQuestions?: number;
    allowLateJoiners?: boolean;
  }) => void;
  quiz_started: (data: { sessionId: string; totalQuestions: number }) => void;
  quiz_ended: (data: { sessionId: string; finalLeaderboard: LeaderboardEntry[] }) => void;

  // Question flow events
  question_started: (data: {
    questionIndex: number;
    question: QuestionData;
    startTime: number;
    endTime: number;
  }) => void;
  timer_tick: (data: {
    questionId: string;
    remainingSeconds: number;
    serverTime: number;
  }) => void;
  reveal_answers: (data: {
    questionId: string;
    correctOptions: string[];
    explanationText?: string;
    statistics: {
      totalAnswers: number;
      correctAnswers: number;
      averageResponseTime: number;
    };
  }) => void;

  // Answer events
  answer_accepted: (data: {
    questionId: string;
    answerId: string;
    responseTimeMs: number;
    serverTimestamp: number;
  }) => void;
  answer_rejected: (data: {
    questionId: string;
    reason: 'TIME_EXPIRED' | 'ALREADY_SUBMITTED' | 'INVALID_QUESTION';
    message: string;
  }) => void;
  answer_result: (data: {
    questionId: string;
    isCorrect: boolean;
    pointsAwarded: number;
    speedBonus: number;
    streakBonus: number;
    correctOptions: string[];
  }) => void;

  // Scoring events
  leaderboard_updated: (data: { leaderboard: LeaderboardEntry[]; topN: number }) => void;
  score_updated: (data: {
    participantId: string;
    totalScore: number;
    rank: number;
    totalParticipants: number;
    streakCount: number;
  }) => void;
  eliminated: (data: {
    participantId: string;
    finalRank: number;
    finalScore: number;
    message: string;
  }) => void;

  // Participant events
  participant_joined: (data: {
    participantId: string;
    nickname: string;
    participantCount: number;
  }) => void;
  participant_left: (data: {
    participantId: string;
    nickname: string;
    participantCount: number;
  }) => void;
  participant_kicked: (data: {
    participantId: string;
    nickname: string;
    reason: string;
  }) => void;
  kicked: (data: { reason: string; message: string }) => void;
  banned: (data: { reason: string; message: string }) => void;

  // Controller-specific events
  answer_count_updated: (data: {
    questionId: string;
    answeredCount: number;
    totalParticipants: number;
    percentage: number;
  }) => void;
  participant_status_changed: (data: {
    participantId: string;
    nickname: string;
    status: 'connected' | 'disconnected';
    timestamp: number;
  }) => void;
  system_metrics: (data: {
    activeConnections: number;
    averageLatency: number;
    cpuUsage: number;
    memoryUsage: number;
  }) => void;

  // Session recovery events
  session_recovered: (data: {
    participantId: string;
    currentState: SessionState | { state: SessionState; currentQuestionIndex?: number; participantCount?: number };
    currentQuestion: QuestionData | null;
    remainingTime: number | null;
    totalScore: number;
    rank: number | null;
    leaderboard: LeaderboardEntry[];
    streakCount: number;
    isEliminated: boolean;
    isSpectator: boolean;
  }) => void;
  recovery_failed: (data: {
    reason: string;
    message: string;
  }) => void;

  // Late joiners events
  late_joiners_updated: (data: { allowLateJoiners: boolean }) => void;

  // Question skip and timer expiry events (exam mode support)
  question_skipped: (data: {
    questionId: string;
    questionIndex: number;
    reason: string;
    timestamp: number;
    examModeSkipReveal?: boolean;
  }) => void;
  timer_expired: (data: {
    questionId: string;
    questionIndex: number;
    examModeSkipReveal?: boolean;
    timestamp: number;
  }) => void;

  // Question voided event - Requirements: 6.1, 6.2
  // Broadcast when a question is voided by the controller
  question_voided: (data: {
    questionId: string;
    reason: string;
    timestamp: string;
  }) => void;

  // Void question acknowledgment - Requirements: 6.4
  // Sent to controller after voiding a question
  void_question_ack: (data: {
    success: boolean;
    sessionId: string;
    questionId: string;
    participantsAffected: number;
    wasCurrentQuestion: boolean;
    message: string;
  }) => void;

  // Focus monitoring events - Requirements: 9.4, 9.5
  // Sent to controller when participant focus changes
  participant_focus_changed: (data: {
    participantId: string;
    nickname: string;
    status: 'lost' | 'regained';
    timestamp: number;
    totalLostCount: number;
    totalLostTimeMs: number;
  }) => void;
}


// ==================== Client -> Server Events ====================

/**
 * Events emitted by the client
 */
export interface ClientToServerEvents {
  // Authentication
  authenticate: (data: AuthData) => void;

  // Answer submission
  submit_answer: (data: {
    questionId: string;
    selectedOptions: string[];
    answerText?: string;
    answerNumber?: number;
    clientTimestamp: number;
  }) => void;

  // Session recovery
  reconnect_session: (data: {
    sessionId: string;
    participantId: string;
    lastKnownQuestionId?: string;
  }) => void;

  // Controller events
  start_quiz: (data: { sessionId: string }) => void;
  next_question: (data: { sessionId: string }) => void;
  end_quiz: (data: { sessionId: string }) => void;
  void_question: (data: { sessionId: string; questionId: string; reason: string }) => void;
  skip_question: (data: { sessionId: string; reason?: string }) => void;
  pause_timer: (data: { sessionId: string }) => void;
  resume_timer: (data: { sessionId: string }) => void;
  reset_timer: (data: { sessionId: string; newTimeLimit: number }) => void;
  kick_participant: (data: { sessionId: string; participantId: string; reason: string }) => void;
  ban_participant: (data: { sessionId: string; participantId: string; reason: string }) => void;
  toggle_late_joiners: (data: { sessionId: string; allowLateJoiners: boolean }) => void;

  // Focus monitoring events - Requirements: 9.2, 9.3
  focus_lost: (data: { sessionId: string; participantId: string; timestamp: number }) => void;
  focus_regained: (data: { sessionId: string; participantId: string; timestamp: number; durationMs: number }) => void;
}

// ==================== Socket Client Class ====================

/**
 * Socket client configuration options
 */
export interface SocketClientOptions {
  serverUrl?: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  timeout?: number;
}

/**
 * Default socket options
 */
const DEFAULT_OPTIONS: Required<SocketClientOptions> = {
  serverUrl: process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001',
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
  timeout: 20000,
};

/**
 * Typed Socket.IO socket
 */
export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Create a configured Socket.IO client
 */
export function createSocketClient(
  options: SocketClientOptions = {},
  auth?: AuthData
): TypedSocket {
  const config = { ...DEFAULT_OPTIONS, ...options };

  const socketOptions: Partial<ManagerOptions & SocketOptions> = {
    autoConnect: config.autoConnect,
    reconnection: config.reconnection,
    reconnectionAttempts: config.reconnectionAttempts,
    reconnectionDelay: config.reconnectionDelay,
    reconnectionDelayMax: config.reconnectionDelayMax,
    timeout: config.timeout,
    transports: ['websocket', 'polling'],
  };

  if (auth) {
    socketOptions.auth = auth;
  }

  const socket = io(config.serverUrl, socketOptions) as TypedSocket;

  return socket;
}

/**
 * Get the WebSocket server URL
 */
export function getSocketServerUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
}

export default {
  createSocketClient,
  getSocketServerUrl,
};
