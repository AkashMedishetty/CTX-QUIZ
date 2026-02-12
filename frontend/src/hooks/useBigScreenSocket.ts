/**
 * useBigScreenSocket - React hook for Big Screen WebSocket connection
 * 
 * Provides a bigscreen-specific socket connection with:
 * - Authentication as 'bigscreen' role
 * - Subscription to bigscreen channel
 * - Connection status management
 * - Session state synchronization
 * - Auto-reconnect on disconnect
 * 
 * Requirements: 12.1
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
import { preloadImages } from '@/lib/utils';

/**
 * Big Screen connection state
 */
export type BigScreenConnectionState = 
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
 * Big Screen session state
 */
export interface BigScreenState {
  sessionId: string;
  joinCode: string;
  state: SessionState;
  participantCount: number;
  participants: ParticipantInfo[];
  currentQuestion: QuestionData | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  remainingSeconds: number;
  leaderboard: LeaderboardEntry[];
  correctOptions: string[] | null;
  answerStats: AnswerStats | null;
  explanationText: string | null;
  allowLateJoiners: boolean;
}

/**
 * Hook return type
 */
export interface UseBigScreenSocketReturn {
  /** Current connection state */
  connectionState: BigScreenConnectionState;
  /** Whether the socket is connected and authenticated */
  isConnected: boolean;
  /** Last error that occurred */
  error: string | null;
  /** Current session state */
  sessionState: BigScreenState | null;
  /** Connect to the server */
  connect: () => void;
  /** Disconnect from the server */
  disconnect: () => void;
}

/**
 * Hook options
 */
export interface UseBigScreenSocketOptions {
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
  onQuizStarted?: (totalQuestions: number) => void;
  /** Callback when question starts */
  onQuestionStarted?: (question: QuestionData, index: number) => void;
  /** Callback when answers are revealed */
  onRevealAnswers?: (correctOptions: string[], stats: AnswerStats) => void;
  /** Callback when quiz ends */
  onQuizEnded?: (leaderboard: LeaderboardEntry[]) => void;
  /** Callback when participant joins */
  onParticipantJoined?: (participant: ParticipantInfo, count: number) => void;
  /** Callback when participant leaves */
  onParticipantLeft?: (participantId: string, count: number) => void;
}

/**
 * useBigScreenSocket hook
 * 
 * React hook for managing Big Screen WebSocket connections.
 * Authenticates as 'bigscreen' role and subscribes to bigscreen channel.
 * This is a receive-only connection - Big Screen does not emit events.
 * 
 * @param options - Hook configuration options
 * @returns Hook return object with connection state
 * 
 * @example
 * ```tsx
 * const {
 *   connectionState,
 *   isConnected,
 *   sessionState,
 * } = useBigScreenSocket({
 *   sessionId: 'abc123',
 *   autoConnect: true,
 *   onQuizStarted: (total) => console.log(`Quiz started with ${total} questions`),
 * });
 * ```
 */
export function useBigScreenSocket(
  options: UseBigScreenSocketOptions
): UseBigScreenSocketReturn {
  const {
    sessionId,
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
    onQuizStarted,
    onQuestionStarted,
    onRevealAnswers,
    onQuizEnded,
    onParticipantJoined,
    onParticipantLeft,
  } = options;

  // State
  const [connectionState, setConnectionState] = useState<BigScreenConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<BigScreenState | null>(null);

  // Refs
  const socketRef = useRef<TypedSocket | null>(null);
  const callbacksRef = useRef({
    onConnect,
    onDisconnect,
    onError,
    onQuizStarted,
    onQuestionStarted,
    onRevealAnswers,
    onQuizEnded,
    onParticipantJoined,
    onParticipantLeft,
  });

  // Update callbacks ref
  useEffect(() => {
    callbacksRef.current = {
      onConnect,
      onDisconnect,
      onError,
      onQuizStarted,
      onQuestionStarted,
      onRevealAnswers,
      onQuizEnded,
      onParticipantJoined,
      onParticipantLeft,
    };
  }, [
    onConnect,
    onDisconnect,
    onError,
    onQuizStarted,
    onQuestionStarted,
    onRevealAnswers,
    onQuizEnded,
    onParticipantJoined,
    onParticipantLeft,
  ]);

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
        role: 'bigscreen',
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
        role: 'bigscreen',
      });
    });

    socket.on('authenticated', (data) => {
      setConnectionState('connected');
      setError(null);
      
      // Extract state - handle both string and object formats
      const currentState: SessionState = typeof data.currentState === 'object' && data.currentState !== null
        ? (data.currentState as { state: SessionState }).state || 'LOBBY'
        : data.currentState || 'LOBBY';
      
      // Initialize session state
      setSessionState((prev) => ({
        sessionId,
        joinCode: prev?.joinCode || '',
        state: currentState,
        participantCount: prev?.participantCount || 0,
        participants: prev?.participants || [],
        currentQuestion: prev?.currentQuestion || null,
        currentQuestionIndex: prev?.currentQuestionIndex || 0,
        totalQuestions: prev?.totalQuestions || 0,
        remainingSeconds: prev?.remainingSeconds || 0,
        leaderboard: prev?.leaderboard || [],
        correctOptions: prev?.correctOptions || null,
        answerStats: prev?.answerStats || null,
        explanationText: prev?.explanationText || null,
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
      setError(data.message || 'Unknown error');
      callbacksRef.current.onError?.(data.message || 'Unknown error');
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
        participants: data.participants,
        // Reset question-related state when in lobby
        currentQuestion: null,
        currentQuestionIndex: 0,
        remainingSeconds: 0,
        correctOptions: null,
        answerStats: null,
        explanationText: null,
        allowLateJoiners: data.allowLateJoiners ?? prev?.allowLateJoiners ?? true,
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
      }));
      callbacksRef.current.onQuizStarted?.(data.totalQuestions);
    });

    socket.on('quiz_ended', (data) => {
      setSessionState((prev) => ({
        ...prev!,
        state: 'ENDED',
        leaderboard: data.finalLeaderboard,
        remainingSeconds: 0,
        currentQuestion: null,
      }));
      callbacksRef.current.onQuizEnded?.(data.finalLeaderboard);
    });

    // Question flow events
    socket.on('question_started', (data) => {
      const remainingSeconds = Math.ceil((data.endTime - Date.now()) / 1000);
      
      // Preload question and option images for faster display
      const imagesToPreload: (string | undefined)[] = [
        data.question.questionImageUrl,
        ...data.question.options.map((opt: { optionImageUrl?: string }) => opt.optionImageUrl),
      ];
      preloadImages(imagesToPreload).catch(() => {
        // Ignore preload errors - images will load normally
      });
      
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
      }));
      callbacksRef.current.onQuestionStarted?.(data.question, data.questionIndex);
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
      callbacksRef.current.onRevealAnswers?.(data.correctOptions, stats);
    });

    // Question skipped event - handles when controller skips a question
    // In exam mode with skipRevealPhase, this will be followed by question_started
    // In normal mode, this transitions to REVEAL state
    socket.on('question_skipped', (data: {
      questionId: string;
      questionIndex: number;
      reason: string;
      timestamp: number;
      examModeSkipReveal?: boolean;
    }) => {
      console.log('[BigScreen] Question skipped:', data);
      
      // If exam mode skip reveal is enabled, the next question_started event
      // will handle the transition. Otherwise, we stay in current state
      // and wait for reveal_answers or next question_started
      if (!data.examModeSkipReveal) {
        // Normal mode: transition to REVEAL state (reveal_answers will follow)
        setSessionState((prev) => ({
          ...prev!,
          remainingSeconds: 0,
        }));
      }
      // In exam mode, question_started will follow immediately
    });

    // Timer expired event - handles when timer expires in exam mode
    // This is a notification that time is up before transitioning to next question
    socket.on('timer_expired', (data: {
      questionId: string;
      questionIndex: number;
      examModeSkipReveal?: boolean;
      timestamp: number;
    }) => {
      console.log('[BigScreen] Timer expired:', data);
      
      // Set remaining seconds to 0 to show time's up
      setSessionState((prev) => ({
        ...prev!,
        remainingSeconds: 0,
      }));
      
      // In exam mode, question_started or quiz_ended will follow immediately
      // In normal mode, reveal_answers will follow
    });

    // Leaderboard update event
    socket.on('leaderboard_updated', (data) => {
      setSessionState((prev) => ({
        ...prev!,
        leaderboard: data.leaderboard,
      }));
    });

    // Participant events
    socket.on('participant_joined', (data) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        // Check if participant already exists
        const exists = prev.participants.some(
          (p) => p.participantId === data.participantId
        );
        
        const newParticipant: ParticipantInfo = {
          participantId: data.participantId,
          nickname: data.nickname,
        };
        
        return {
          ...prev,
          participantCount: data.participantCount,
          participants: exists
            ? prev.participants
            : [...prev.participants, newParticipant],
        };
      });
      
      callbacksRef.current.onParticipantJoined?.(
        { participantId: data.participantId, nickname: data.nickname },
        data.participantCount
      );
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
      
      callbacksRef.current.onParticipantLeft?.(
        data.participantId,
        data.participantCount
      );
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

    // Late joiners toggle event
    socket.on('late_joiners_updated', (data: { allowLateJoiners: boolean }) => {
      setSessionState((prev) => {
        if (!prev) return prev;
        
        return {
          ...prev,
          allowLateJoiners: data.allowLateJoiners,
        };
      });
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

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    error,
    sessionState,
    connect,
    disconnect,
  };
}

export default useBigScreenSocket;
