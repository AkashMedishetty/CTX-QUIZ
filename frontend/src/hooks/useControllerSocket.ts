/**
 * useControllerSocket - React hook for Controller Panel WebSocket connection
 * 
 * Provides a controller-specific socket connection with:
 * - Authentication as 'controller' role
 * - Subscription to controller and state channels
 * - Connection status management
 * - Session state synchronization
 * 
 * Requirements: 13.1, 13.9
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createSocketClient,
  TypedSocket,
  SessionState,
  LeaderboardEntry,
  ParticipantInfo,
  QuestionData,
} from '@/lib/socket-client';

/**
 * Controller connection state
 */
export type ControllerConnectionState = 
  | 'disconnected' 
  | 'connecting' 
  | 'authenticating'
  | 'connected' 
  | 'error';

/**
 * System metrics from server
 */
export interface SystemMetrics {
  activeConnections: number;
  averageLatency: number;
  cpuUsage: number;
  memoryUsage: number;
}

/**
 * Participant with connection status
 */
export interface ParticipantWithStatus extends ParticipantInfo {
  status: 'connected' | 'disconnected';
  lastSeen?: number;
}

/**
 * Answer count data
 */
export interface AnswerCount {
  questionId: string;
  answeredCount: number;
  totalParticipants: number;
  percentage: number;
}

/**
 * Timer state types
 */
export type TimerState = 'idle' | 'running' | 'paused' | 'expired';

/**
 * Timer data
 */
export interface TimerData {
  questionId: string;
  remainingSeconds: number;
  totalTimeLimit: number;
  state: TimerState;
  serverTime: number;
}

/**
 * Controller session state
 */
export interface ControllerSessionState {
  sessionId: string;
  joinCode: string;
  state: SessionState;
  participantCount: number;
  participants: ParticipantWithStatus[];
  currentQuestion: QuestionData | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  leaderboard: LeaderboardEntry[];
  answerCount: AnswerCount | null;
  systemMetrics: SystemMetrics | null;
  timer: TimerData | null;
  allowLateJoiners: boolean;
}

/**
 * Hook return type
 */
export interface UseControllerSocketReturn {
  /** Current connection state */
  connectionState: ControllerConnectionState;
  /** Whether the socket is connected and authenticated */
  isConnected: boolean;
  /** Last error that occurred */
  error: string | null;
  /** Current session state */
  sessionState: ControllerSessionState | null;
  /** Connect to the server */
  connect: () => void;
  /** Disconnect from the server */
  disconnect: () => void;
  /** Start the quiz from lobby */
  startQuiz: () => void;
  /** Advance to next question */
  nextQuestion: () => void;
  /** End the quiz immediately */
  endQuiz: () => void;
  /** Void the current question */
  voidQuestion: (questionId: string, reason: string) => void;
  /** Pause the timer */
  pauseTimer: () => void;
  /** Resume the timer */
  resumeTimer: () => void;
  /** Reset the timer */
  resetTimer: (newTimeLimit: number) => void;
  /** Kick a participant */
  kickParticipant: (participantId: string, reason: string) => void;
  /** Ban a participant */
  banParticipant: (participantId: string, reason: string) => void;
  /** Toggle late joiners setting */
  toggleLateJoiners: (allow: boolean) => void;
}

/**
 * Hook options
 */
export interface UseControllerSocketOptions {
  /** Session ID to connect to */
  sessionId: string;
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Callback when connected */
  onConnect?: () => void;
  /** Callback when disconnected */
  onDisconnect?: (reason: string) => void;
  /** Callback when error occurs */
  onError?: (error: string) => void;
  /** Callback when quiz starts */
  onQuizStarted?: () => void;
  /** Callback when quiz ends */
  onQuizEnded?: (leaderboard: LeaderboardEntry[]) => void;
  /** Callback when question starts */
  onQuestionStarted?: (question: QuestionData, index: number) => void;
  /** Callback when answers are revealed */
  onRevealAnswers?: (correctOptions: string[]) => void;
}

/**
 * useControllerSocket hook
 * 
 * React hook for managing Controller Panel WebSocket connections.
 * Authenticates as 'controller' role and subscribes to controller/state channels.
 * 
 * @param options - Hook configuration options
 * @returns Hook return object with connection state and control methods
 * 
 * @example
 * ```tsx
 * const {
 *   connectionState,
 *   isConnected,
 *   sessionState,
 *   startQuiz,
 *   nextQuestion,
 * } = useControllerSocket({
 *   sessionId: 'abc123',
 *   autoConnect: true,
 *   onQuizStarted: () => console.log('Quiz started!'),
 * });
 * ```
 */
export function useControllerSocket(
  options: UseControllerSocketOptions
): UseControllerSocketReturn {
  const {
    sessionId,
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
    onQuizStarted,
    onQuizEnded,
    onQuestionStarted,
    onRevealAnswers,
  } = options;

  // State
  const [connectionState, setConnectionState] = useState<ControllerConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<ControllerSessionState | null>(null);

  // Refs
  const socketRef = useRef<TypedSocket | null>(null);
  const callbacksRef = useRef({
    onConnect,
    onDisconnect,
    onError,
    onQuizStarted,
    onQuizEnded,
    onQuestionStarted,
    onRevealAnswers,
  });

  // Update callbacks ref
  useEffect(() => {
    callbacksRef.current = {
      onConnect,
      onDisconnect,
      onError,
      onQuizStarted,
      onQuizEnded,
      onQuestionStarted,
      onRevealAnswers,
    };
  }, [onConnect, onDisconnect, onError, onQuizStarted, onQuizEnded, onQuestionStarted, onRevealAnswers]);

  // Initialize socket and set up event handlers
  useEffect(() => {
    if (!sessionId) return;

    const socket = createSocketClient(
      {
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      },
      {
        sessionId,
        role: 'controller',
      }
    );

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      setConnectionState('authenticating');
      setError(null);
      // Send authentication
      socket.emit('authenticate', {
        sessionId,
        role: 'controller',
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
        joinCode: prev?.joinCode || '',
        state: currentState || 'LOBBY',
        participantCount: prev?.participantCount || 0,
        participants: prev?.participants || [],
        currentQuestion: prev?.currentQuestion || null,
        currentQuestionIndex: prev?.currentQuestionIndex || 0,
        totalQuestions: prev?.totalQuestions || 0,
        leaderboard: prev?.leaderboard || [],
        answerCount: prev?.answerCount || null,
        systemMetrics: prev?.systemMetrics || null,
        timer: prev?.timer || null,
        allowLateJoiners: prev?.allowLateJoiners ?? true,
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
    socket.io.on('reconnect_attempt', () => {
      setConnectionState('connecting');
    });

    socket.io.on('reconnect', () => {
      setConnectionState('authenticating');
    });

    socket.io.on('reconnect_failed', () => {
      setConnectionState('error');
      setError('Reconnection failed');
    });

    // Session lifecycle events
    socket.on('lobby_state', (data) => {
      setSessionState((prev) => ({
        ...prev!,
        sessionId: data.sessionId,
        joinCode: data.joinCode,
        state: 'LOBBY',
        participantCount: data.participantCount,
        totalQuestions: data.totalQuestions || prev?.totalQuestions || 0,
        participants: data.participants.map((p) => ({
          ...p,
          status: 'connected' as const,
        })),
        allowLateJoiners: data.allowLateJoiners ?? prev?.allowLateJoiners ?? true,
      }));
    });

    socket.on('quiz_started', (data) => {
      setSessionState((prev) => ({
        ...prev!,
        state: 'ACTIVE_QUESTION',
        totalQuestions: data.totalQuestions,
      }));
      callbacksRef.current.onQuizStarted?.();
    });

    socket.on('quiz_ended', (data) => {
      setSessionState((prev) => ({
        ...prev!,
        state: 'ENDED',
        leaderboard: data.finalLeaderboard,
      }));
      callbacksRef.current.onQuizEnded?.(data.finalLeaderboard);
    });

    // Question flow events
    socket.on('question_started', (data) => {
      const timeLimit = data.question.timeLimit;
      const remainingSeconds = Math.ceil((data.endTime - Date.now()) / 1000);
      
      setSessionState((prev) => ({
        ...prev!,
        state: 'ACTIVE_QUESTION',
        currentQuestion: data.question,
        currentQuestionIndex: data.questionIndex,
        answerCount: {
          questionId: data.question.questionId,
          answeredCount: 0,
          totalParticipants: prev?.participantCount || 0,
          percentage: 0,
        },
        timer: {
          questionId: data.question.questionId,
          remainingSeconds: Math.max(0, remainingSeconds),
          totalTimeLimit: timeLimit,
          state: 'running',
          serverTime: data.startTime,
        },
      }));
      callbacksRef.current.onQuestionStarted?.(data.question, data.questionIndex);
    });

    // Timer tick event
    socket.on('timer_tick', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        const isExpired = data.remainingSeconds <= 0;
        
        return {
          ...prev,
          timer: {
            questionId: data.questionId,
            remainingSeconds: Math.max(0, data.remainingSeconds),
            totalTimeLimit: prev.timer?.totalTimeLimit || prev.currentQuestion?.timeLimit || 30,
            state: isExpired ? 'expired' : (prev.timer?.state === 'paused' ? 'paused' : 'running'),
            serverTime: data.serverTime,
          },
        };
      });
    });

    socket.on('reveal_answers', (data) => {
      setSessionState((prev) => ({
        ...prev!,
        state: 'REVEAL',
        timer: prev?.timer ? {
          ...prev.timer,
          state: 'expired',
          remainingSeconds: 0,
        } : null,
      }));
      callbacksRef.current.onRevealAnswers?.(data.correctOptions);
    });

    // Controller-specific events
    socket.on('answer_count_updated', (data) => {
      setSessionState((prev) => ({
        ...prev!,
        answerCount: {
          questionId: data.questionId,
          answeredCount: data.answeredCount,
          totalParticipants: data.totalParticipants,
          percentage: data.percentage,
        },
      }));
    });

    socket.on('participant_status_changed', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        const updatedParticipants = prev.participants.map((p) =>
          p.participantId === data.participantId
            ? { ...p, status: data.status, lastSeen: data.timestamp }
            : p
        );

        return {
          ...prev,
          participants: updatedParticipants,
        };
      });
    });

    socket.on('participant_joined', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        return {
          ...prev,
          participantCount: data.participantCount,
          participants: [
            ...prev.participants,
            {
              participantId: data.participantId,
              nickname: data.nickname,
              status: 'connected' as const,
            },
          ],
        };
      });
    });

    socket.on('participant_left', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        return {
          ...prev,
          participantCount: data.participantCount,
          participants: prev.participants.filter(
            (p) => p.participantId !== data.participantId
          ),
        };
      });
    });

    socket.on('participant_kicked', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        return {
          ...prev,
          participants: prev.participants.filter(
            (p) => p.participantId !== data.participantId
          ),
        };
      });
    });

    socket.on('leaderboard_updated', (data) => {
      setSessionState((prev) => ({
        ...prev!,
        leaderboard: data.leaderboard,
      }));
    });

    socket.on('system_metrics', (data) => {
      setSessionState((prev) => ({
        ...prev!,
        systemMetrics: data,
      }));
    });

    // Late joiners toggle acknowledgment
    socket.on('late_joiners_updated', (data: { allowLateJoiners: boolean }) => {
      setSessionState((prev) => ({
        ...prev!,
        allowLateJoiners: data.allowLateJoiners,
      }));
    });

    // Auto-connect if enabled
    if (autoConnect) {
      setConnectionState('connecting');
      socket.connect();
    }

    // Cleanup
    return () => {
      socket.disconnect();
      socket.removeAllListeners();
      socketRef.current = null;
    };
  }, [sessionId]); // Re-create socket if sessionId changes

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

  // Controller action methods
  const startQuiz = useCallback(() => {
    if (socketRef.current && sessionId) {
      socketRef.current.emit('start_quiz', { sessionId });
    }
  }, [sessionId]);

  const nextQuestion = useCallback(() => {
    if (socketRef.current && sessionId) {
      socketRef.current.emit('next_question', { sessionId });
    }
  }, [sessionId]);

  const endQuiz = useCallback(() => {
    if (socketRef.current && sessionId) {
      socketRef.current.emit('end_quiz', { sessionId });
    }
  }, [sessionId]);

  const voidQuestion = useCallback(
    (questionId: string, reason: string) => {
      if (socketRef.current && sessionId) {
        socketRef.current.emit('void_question', { sessionId, questionId, reason });
      }
    },
    [sessionId]
  );

  const pauseTimer = useCallback(() => {
    if (socketRef.current && sessionId) {
      socketRef.current.emit('pause_timer', { sessionId });
    }
  }, [sessionId]);

  const resumeTimer = useCallback(() => {
    if (socketRef.current && sessionId) {
      socketRef.current.emit('resume_timer', { sessionId });
    }
  }, [sessionId]);

  const resetTimer = useCallback(
    (newTimeLimit: number) => {
      if (socketRef.current && sessionId) {
        socketRef.current.emit('reset_timer', { sessionId, newTimeLimit });
      }
    },
    [sessionId]
  );

  const kickParticipant = useCallback(
    (participantId: string, reason: string) => {
      if (socketRef.current && sessionId) {
        socketRef.current.emit('kick_participant', { sessionId, participantId, reason });
      }
    },
    [sessionId]
  );

  const banParticipant = useCallback(
    (participantId: string, reason: string) => {
      if (socketRef.current && sessionId) {
        socketRef.current.emit('ban_participant', { sessionId, participantId, reason });
      }
    },
    [sessionId]
  );

  const toggleLateJoiners = useCallback(
    (allow: boolean) => {
      if (socketRef.current && sessionId) {
        socketRef.current.emit('toggle_late_joiners', { sessionId, allow });
      }
    },
    [sessionId]
  );

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    error,
    sessionState,
    connect,
    disconnect,
    startQuiz,
    nextQuestion,
    endQuiz,
    voidQuestion,
    pauseTimer,
    resumeTimer,
    resetTimer,
    kickParticipant,
    banParticipant,
    toggleLateJoiners,
  };
}

export default useControllerSocket;
