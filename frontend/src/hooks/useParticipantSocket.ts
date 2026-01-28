/**
 * useParticipantSocket - React hook for Participant WebSocket connection
 * 
 * Provides a participant-specific socket connection with:
 * - Authentication as 'participant' role using session token
 * - Subscription to participant channel
 * - Connection status management
 * - Session state synchronization
 * - Auto-reconnect with exponential backoff
 * - Answer submission capability
 * 
 * Requirements: 14.8
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createSocketClient,
  TypedSocket,
  SessionState,
  LeaderboardEntry,
  QuestionData,
} from '@/lib/socket-client';

// ==================== Constants ====================

const SESSION_TOKEN_KEY = 'ctx_quiz_session_token';
const SESSION_DATA_KEY = 'ctx_quiz_session_data';

// ==================== Types ====================

/**
 * Participant connection state
 */
export type ParticipantConnectionState = 
  | 'disconnected' 
  | 'connecting' 
  | 'authenticating'
  | 'connected' 
  | 'error';

/**
 * Answer statistics from reveal phase
 */
export interface AnswerStats {
  totalAnswers: number;
  correctAnswers: number;
  averageResponseTime: number;
}

/**
 * Personal result after answer reveal
 */
export interface PersonalResult {
  score: number;
  rank: number;
  totalParticipants: number;
  pointsEarned: number;
  isCorrect: boolean;
  streakCount: number;
}

/**
 * Answer submission result
 */
export interface AnswerSubmissionResult {
  questionId: string;
  success: boolean;
  answerId?: string;
  responseTimeMs?: number;
  error?: string;
}

/**
 * Participant session state
 */
export interface ParticipantSessionState {
  sessionId: string;
  participantId: string;
  nickname: string;
  state: SessionState;
  participantCount: number;
  currentQuestion: QuestionData | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  remainingSeconds: number;
  leaderboard: LeaderboardEntry[];
  correctOptions: string[] | null;
  answerStats: AnswerStats | null;
  explanationText: string | null;
  personalScore: number;
  personalRank: number | null;
  streakCount: number;
  isEliminated: boolean;
  isSpectator: boolean;
  hasAnsweredCurrentQuestion: boolean;
}

/**
 * Stored session data for reconnection
 */
export interface StoredSessionData {
  sessionId: string;
  participantId: string;
  nickname: string;
  token: string;
}

/**
 * Hook return type
 */
export interface UseParticipantSocketReturn {
  /** Current connection state */
  connectionState: ParticipantConnectionState;
  /** Whether the socket is connected and authenticated */
  isConnected: boolean;
  /** Last error that occurred */
  error: string | null;
  /** Current session state */
  sessionState: ParticipantSessionState | null;
  /** Submit an answer for the current question */
  submitAnswer: (questionId: string, selectedOptions: string[]) => void;
  /** Connect to the server */
  connect: () => void;
  /** Disconnect from the server */
  disconnect: () => void;
  /** Clear stored session data (on kick/session end) */
  clearSession: () => void;
}

/**
 * Hook options
 */
export interface UseParticipantSocketOptions {
  /** Session ID to connect to */
  sessionId: string;
  /** Participant ID */
  participantId: string;
  /** Session token for authentication */
  token?: string;
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Callback when connected */
  onConnect?: () => void;
  /** Callback when disconnected */
  onDisconnect?: (reason: string) => void;
  /** Callback when error occurs */
  onError?: (error: string) => void;
  /** Callback when quiz starts */
  onQuizStarted?: (totalQuestions: number) => void;
  /** Callback when question starts */
  onQuestionStarted?: (question: QuestionData, index: number, total: number) => void;
  /** Callback when timer ticks */
  onTimerTick?: (remainingSeconds: number) => void;
  /** Callback when answer is submitted */
  onAnswerSubmitted?: (result: AnswerSubmissionResult) => void;
  /** Callback when answers are revealed */
  onRevealAnswers?: (correctOptions: string[], stats: AnswerStats, explanationText?: string) => void;
  /** Callback when personal result is received */
  onPersonalResult?: (result: PersonalResult) => void;
  /** Callback when quiz ends */
  onQuizEnded?: (finalRank: number, finalScore: number, totalParticipants: number) => void;
  /** Callback when kicked */
  onKicked?: (reason: string) => void;
  /** Callback when session ends */
  onSessionEnded?: (reason: string) => void;
  /** Callback when eliminated (for elimination quizzes) */
  onEliminated?: (finalRank: number, finalScore: number, message: string) => void;
}

// ==================== Helper Functions ====================

/**
 * Get stored session data from localStorage
 */
export function getStoredSessionData(): StoredSessionData | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const data = localStorage.getItem(SESSION_DATA_KEY);
    if (!data) return null;
    return JSON.parse(data) as StoredSessionData;
  } catch {
    return null;
  }
}

/**
 * Store session data in localStorage
 */
export function storeSessionData(data: StoredSessionData): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(SESSION_DATA_KEY, JSON.stringify(data));
    localStorage.setItem(SESSION_TOKEN_KEY, data.token);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear stored session data from localStorage
 */
export function clearStoredSessionData(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(SESSION_DATA_KEY);
    localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get session token from localStorage
 */
export function getStoredSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

// ==================== Hook Implementation ====================

/**
 * useParticipantSocket hook
 * 
 * React hook for managing Participant WebSocket connections.
 * Authenticates as 'participant' role using session token.
 * Handles all participant events including answer submission.
 * Implements auto-reconnect with exponential backoff.
 * 
 * @param options - Hook configuration options
 * @returns Hook return object with connection state and methods
 * 
 * @example
 * ```tsx
 * const {
 *   connectionState,
 *   isConnected,
 *   sessionState,
 *   submitAnswer,
 * } = useParticipantSocket({
 *   sessionId: 'abc123',
 *   participantId: 'p456',
 *   token: 'jwt-token',
 *   autoConnect: true,
 *   onQuestionStarted: (q, idx) => console.log(`Question ${idx + 1}`),
 *   onAnswerSubmitted: (result) => console.log('Answer submitted:', result),
 * });
 * ```
 */
export function useParticipantSocket(
  options: UseParticipantSocketOptions
): UseParticipantSocketReturn {
  const {
    sessionId,
    participantId,
    token,
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
    onQuizStarted,
    onQuestionStarted,
    onTimerTick,
    onAnswerSubmitted,
    onRevealAnswers,
    onPersonalResult,
    onQuizEnded,
    onKicked,
    onSessionEnded,
    onEliminated,
  } = options;

  // State
  const [connectionState, setConnectionState] = useState<ParticipantConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<ParticipantSessionState | null>(null);

  // Refs
  const socketRef = useRef<TypedSocket | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const autoConnectRef = useRef(autoConnect);
  const sessionStateRef = useRef(sessionState);
  const callbacksRef = useRef({
    onConnect,
    onDisconnect,
    onError,
    onQuizStarted,
    onQuestionStarted,
    onTimerTick,
    onAnswerSubmitted,
    onRevealAnswers,
    onPersonalResult,
    onQuizEnded,
    onKicked,
    onSessionEnded,
    onEliminated,
  });

  // Update callbacks ref
  useEffect(() => {
    callbacksRef.current = {
      onConnect,
      onDisconnect,
      onError,
      onQuizStarted,
      onQuestionStarted,
      onTimerTick,
      onAnswerSubmitted,
      onRevealAnswers,
      onPersonalResult,
      onQuizEnded,
      onKicked,
      onSessionEnded,
      onEliminated,
    };
  }, [
    onConnect,
    onDisconnect,
    onError,
    onQuizStarted,
    onQuestionStarted,
    onTimerTick,
    onAnswerSubmitted,
    onRevealAnswers,
    onPersonalResult,
    onQuizEnded,
    onKicked,
    onSessionEnded,
    onEliminated,
  ]);

  // Update refs for values used in socket effect
  useEffect(() => {
    autoConnectRef.current = autoConnect;
  }, [autoConnect]);

  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState]);

  // Get the effective token (from props or localStorage)
  const effectiveToken = token || getStoredSessionToken();

  // Initialize socket and set up event handlers
  useEffect(() => {
    if (!sessionId || !participantId) return;

    const socket = createSocketClient(
      {
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      },
      {
        token: effectiveToken || undefined,
        sessionId,
        role: 'participant',
      }
    );

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      setConnectionState('authenticating');
      setError(null);
      reconnectAttemptRef.current = 0;
      
      // Send authentication
      socket.emit('authenticate', {
        token: effectiveToken || undefined,
        sessionId,
        role: 'participant',
      });
    });

    socket.on('authenticated', (data) => {
      setConnectionState('connected');
      setError(null);
      
      // Handle currentState - it can be either a string or an object with state property
      const currentState = typeof data.currentState === 'object' 
        ? data.currentState.state 
        : data.currentState;
      
      // Initialize session state
      setSessionState((prev) => ({
        sessionId,
        participantId,
        nickname: prev?.nickname || '',
        state: currentState || 'LOBBY',
        participantCount: prev?.participantCount || 0,
        currentQuestion: prev?.currentQuestion || null,
        currentQuestionIndex: prev?.currentQuestionIndex || 0,
        totalQuestions: prev?.totalQuestions || 0,
        remainingSeconds: prev?.remainingSeconds || 0,
        leaderboard: prev?.leaderboard || [],
        correctOptions: prev?.correctOptions || null,
        answerStats: prev?.answerStats || null,
        explanationText: prev?.explanationText || null,
        personalScore: prev?.personalScore || 0,
        personalRank: prev?.personalRank || null,
        streakCount: prev?.streakCount || 0,
        isEliminated: prev?.isEliminated || false,
        isSpectator: prev?.isSpectator || false,
        hasAnsweredCurrentQuestion: prev?.hasAnsweredCurrentQuestion || false,
      }));

      callbacksRef.current.onConnect?.();
    });

    socket.on('auth_error', (data) => {
      setConnectionState('error');
      setError(data.error);
      callbacksRef.current.onError?.(data.error);
    });

    socket.on('disconnect', (reason) => {
      setConnectionState('disconnected');
      callbacksRef.current.onDisconnect?.(reason);
    });

    socket.on('connect_error', (err) => {
      setConnectionState('error');
      setError(err.message);
      callbacksRef.current.onError?.(err.message);
    });

    socket.on('error', (data) => {
      const errorMessage = data.message || data.error || 'Unknown error';
      setError(errorMessage);
      callbacksRef.current.onError?.(errorMessage);
    });

    // Reconnection events
    socket.io.on('reconnect_attempt', (attempt) => {
      reconnectAttemptRef.current = attempt;
      setConnectionState('connecting');
    });

    socket.io.on('reconnect', () => {
      setConnectionState('authenticating');
      reconnectAttemptRef.current = 0;
    });

    socket.io.on('reconnect_failed', () => {
      setConnectionState('error');
      setError('Reconnection failed after multiple attempts');
    });

    // Session recovery events
    socket.on('session_recovered', (data) => {
      setConnectionState('connected');
      setError(null);
      
      // Handle currentState - it can be either a string or an object with state property
      const currentState = typeof data.currentState === 'object' 
        ? data.currentState.state 
        : data.currentState;
      
      setSessionState((prev) => ({
        sessionId,
        participantId: data.participantId,
        nickname: prev?.nickname || '',
        state: currentState || 'LOBBY',
        participantCount: prev?.participantCount || 0,
        currentQuestion: data.currentQuestion,
        currentQuestionIndex: prev?.currentQuestionIndex || 0,
        totalQuestions: prev?.totalQuestions || 0,
        remainingSeconds: data.remainingTime || 0,
        leaderboard: data.leaderboard,
        correctOptions: prev?.correctOptions || null,
        answerStats: prev?.answerStats || null,
        explanationText: prev?.explanationText || null,
        personalScore: data.totalScore,
        personalRank: data.rank,
        streakCount: data.streakCount,
        isEliminated: data.isEliminated,
        isSpectator: data.isSpectator,
        hasAnsweredCurrentQuestion: false,
      }));

      callbacksRef.current.onConnect?.();
    });

    socket.on('recovery_failed', (data) => {
      setConnectionState('error');
      setError(data.message);
      callbacksRef.current.onError?.(data.message);
    });

    // Session lifecycle events
    socket.on('lobby_state', (data) => {
      setSessionState((prev) => ({
        ...prev!,
        sessionId: data.sessionId,
        state: 'LOBBY',
        participantCount: data.participantCount,
        // Reset question-related state when in lobby
        currentQuestion: null,
        currentQuestionIndex: 0,
        remainingSeconds: 0,
        correctOptions: null,
        answerStats: null,
        explanationText: null,
        hasAnsweredCurrentQuestion: false,
      }));
    });

    socket.on('quiz_started', (data) => {
      setSessionState((prev) => ({
        ...prev!,
        state: 'ACTIVE_QUESTION',
        totalQuestions: data.totalQuestions,
        // Reset reveal state
        correctOptions: null,
        answerStats: null,
        explanationText: null,
        hasAnsweredCurrentQuestion: false,
      }));
      callbacksRef.current.onQuizStarted?.(data.totalQuestions);
    });

    socket.on('quiz_ended', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        // Find participant's final position
        const participantEntry = data.finalLeaderboard.find(
          (entry) => entry.participantId === participantId
        );
        
        return {
          ...prev,
          state: 'ENDED',
          leaderboard: data.finalLeaderboard,
          remainingSeconds: 0,
          currentQuestion: null,
          personalRank: participantEntry?.rank || null,
          personalScore: participantEntry?.totalScore || prev.personalScore,
        };
      });
      
      // Find participant's final position for callback
      const participantEntry = data.finalLeaderboard.find(
        (entry) => entry.participantId === participantId
      );
      
      callbacksRef.current.onQuizEnded?.(
        participantEntry?.rank || 0,
        participantEntry?.totalScore || 0,
        data.finalLeaderboard.length
      );
    });

    // Question flow events
    socket.on('question_started', (data) => {
      const remainingSeconds = Math.ceil((data.endTime - Date.now()) / 1000);
      
      setSessionState((prev) => ({
        ...prev!,
        state: 'ACTIVE_QUESTION',
        currentQuestion: data.question,
        currentQuestionIndex: data.questionIndex,
        remainingSeconds: Math.max(0, remainingSeconds),
        // Reset reveal state for new question
        correctOptions: null,
        answerStats: null,
        explanationText: null,
        hasAnsweredCurrentQuestion: false,
      }));
      
      callbacksRef.current.onQuestionStarted?.(
        data.question,
        data.questionIndex,
        sessionStateRef.current?.totalQuestions || 0
      );
    });

    // Timer tick event
    socket.on('timer_tick', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        return {
          ...prev,
          remainingSeconds: Math.max(0, data.remainingSeconds),
        };
      });
      
      callbacksRef.current.onTimerTick?.(data.remainingSeconds);
    });

    // Answer events
    socket.on('answer_accepted', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        return {
          ...prev,
          hasAnsweredCurrentQuestion: true,
        };
      });
      
      callbacksRef.current.onAnswerSubmitted?.({
        questionId: data.questionId,
        success: true,
        answerId: data.answerId,
        responseTimeMs: data.responseTimeMs,
      });
    });

    socket.on('answer_rejected', (data) => {
      callbacksRef.current.onAnswerSubmitted?.({
        questionId: data.questionId,
        success: false,
        error: data.message,
      });
    });

    // Reveal answers event
    socket.on('reveal_answers', (data) => {
      const stats: AnswerStats = {
        totalAnswers: data.statistics.totalAnswers,
        correctAnswers: data.statistics.correctAnswers,
        averageResponseTime: data.statistics.averageResponseTime,
      };
      
      setSessionState((prev) => ({
        ...prev!,
        state: 'REVEAL',
        correctOptions: data.correctOptions,
        answerStats: stats,
        explanationText: data.explanationText || null,
        remainingSeconds: 0,
      }));
      
      callbacksRef.current.onRevealAnswers?.(
        data.correctOptions,
        stats,
        data.explanationText
      );
    });

    // Personal result event (answer_result)
    socket.on('answer_result', (data) => {
      callbacksRef.current.onPersonalResult?.({
        score: 0, // Will be updated by score_updated
        rank: 0,
        totalParticipants: 0,
        pointsEarned: data.pointsAwarded + data.speedBonus + data.streakBonus,
        isCorrect: data.isCorrect,
        streakCount: 0,
      });
    });

    // Score update event
    socket.on('score_updated', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        return {
          ...prev,
          personalScore: data.totalScore,
          personalRank: data.rank,
          streakCount: data.streakCount,
        };
      });
      
      callbacksRef.current.onPersonalResult?.({
        score: data.totalScore,
        rank: data.rank,
        totalParticipants: data.totalParticipants,
        pointsEarned: 0, // Already sent in answer_result
        isCorrect: true, // Assume correct if score updated
        streakCount: data.streakCount,
      });
    });

    // Leaderboard update event
    socket.on('leaderboard_updated', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        // Find participant's position in leaderboard
        const participantEntry = data.leaderboard.find(
          (entry) => entry.participantId === participantId
        );
        
        return {
          ...prev,
          leaderboard: data.leaderboard,
          personalRank: participantEntry?.rank || prev.personalRank,
        };
      });
    });

    // Elimination event
    socket.on('eliminated', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        return {
          ...prev,
          isEliminated: true,
          isSpectator: true,
          personalRank: data.finalRank,
          personalScore: data.finalScore,
        };
      });
      
      callbacksRef.current.onEliminated?.(
        data.finalRank,
        data.finalScore,
        data.message
      );
    });

    // Kicked event
    socket.on('kicked', (data) => {
      setConnectionState('disconnected');
      setError(data.message);
      
      // Clear stored session data
      clearStoredSessionData();
      
      callbacksRef.current.onKicked?.(data.reason);
    });

    // Banned event (similar to kicked)
    socket.on('banned', (data) => {
      setConnectionState('disconnected');
      setError(data.message);
      
      // Clear stored session data
      clearStoredSessionData();
      
      callbacksRef.current.onKicked?.(data.reason);
    });

    // Participant events
    socket.on('participant_joined', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        return {
          ...prev,
          participantCount: data.participantCount,
        };
      });
    });

    socket.on('participant_left', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        return {
          ...prev,
          participantCount: data.participantCount,
        };
      });
    });

    // Rate limit event
    socket.on('rate_limit_exceeded', (data) => {
      setError(`Rate limit exceeded for ${data.action}. Retry after ${data.retryAfter} seconds.`);
      callbacksRef.current.onError?.(`Rate limit exceeded. Please wait ${data.retryAfter} seconds.`);
    });

    // Auto-connect if enabled
    if (autoConnectRef.current && effectiveToken) {
      setConnectionState('connecting');
      socket.connect();
    }

    // Cleanup
    return () => {
      socket.disconnect();
      socket.removeAllListeners();
      socketRef.current = null;
    };
  }, [sessionId, participantId, effectiveToken]); // Re-create socket if these change

  // Submit answer method
  const submitAnswer = useCallback((questionId: string, selectedOptions: string[]) => {
    if (!socketRef.current || !socketRef.current.connected) {
      callbacksRef.current.onError?.('Not connected to server');
      return;
    }

    if (sessionState?.hasAnsweredCurrentQuestion) {
      callbacksRef.current.onError?.('Already answered this question');
      return;
    }

    if (sessionState?.isEliminated || sessionState?.isSpectator) {
      callbacksRef.current.onError?.('Cannot submit answer as spectator');
      return;
    }

    socketRef.current.emit('submit_answer', {
      questionId,
      selectedOptions,
      clientTimestamp: Date.now(),
    });
  }, [sessionState?.hasAnsweredCurrentQuestion, sessionState?.isEliminated, sessionState?.isSpectator]);

  // Connect method
  const connect = useCallback(() => {
    if (socketRef.current && !socketRef.current.connected) {
      setConnectionState('connecting');
      socketRef.current.connect();
    }
  }, []);

  // Disconnect method
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      setConnectionState('disconnected');
    }
  }, []);

  // Clear session method
  const clearSession = useCallback(() => {
    clearStoredSessionData();
    setSessionState(null);
    setError(null);
    disconnect();
  }, [disconnect]);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    error,
    sessionState,
    submitAnswer,
    connect,
    disconnect,
    clearSession,
  };
}

export default useParticipantSocket;
