/**
 * useSession - React hook for quiz session management
 * 
 * Provides session state management including:
 * - Join flow (join code + nickname)
 * - Session data persistence
 * - Participant list
 * - Lobby state
 * 
 * Requirements: 14.1, 14.2
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { TypedSocket, ParticipantInfo } from '@/lib/socket-client';
import api, { ApiError } from '@/lib/api-client';

/**
 * Join response from API
 */
export interface JoinResponse {
  sessionId: string;
  participantId: string;
  sessionToken: string;
  quizTitle?: string;
}

/**
 * Session data stored locally
 */
export interface SessionData {
  sessionId: string;
  participantId: string;
  sessionToken: string;
  nickname: string;
  joinCode: string;
  quizTitle?: string;
}

/**
 * Lobby state
 */
export interface LobbyState {
  joinCode: string;
  participantCount: number;
  participants: ParticipantInfo[];
}


/**
 * Join status
 */
export type JoinStatus = 'idle' | 'joining' | 'joined' | 'error';

/**
 * Hook return type
 */
export interface UseSessionReturn {
  /** Current session data */
  session: SessionData | null;
  /** Join status */
  joinStatus: JoinStatus;
  /** Join error message */
  joinError: string | null;
  /** Lobby state */
  lobby: LobbyState | null;
  /** Whether in a session */
  isInSession: boolean;
  /** Join a quiz session */
  joinSession: (joinCode: string, nickname: string) => Promise<boolean>;
  /** Leave the current session */
  leaveSession: () => void;
  /** Clear any join errors */
  clearError: () => void;
}

/**
 * Hook options
 */
export interface UseSessionOptions {
  /** Socket instance */
  socket?: TypedSocket | null;
  /** Storage key for session data */
  storageKey?: string;
  /** Callback when joined successfully */
  onJoined?: (session: SessionData) => void;
  /** Callback when join fails */
  onJoinError?: (error: string) => void;
  /** Callback when participant joins lobby */
  onParticipantJoined?: (participant: ParticipantInfo) => void;
  /** Callback when participant leaves lobby */
  onParticipantLeft?: (participantId: string) => void;
}

const STORAGE_KEY = 'quiz_session';

/**
 * useSession hook
 * 
 * React hook for managing quiz session state.
 * 
 * @param options - Hook configuration options
 * @returns Hook return object with session state and methods
 * 
 * @example
 * ```tsx
 * const {
 *   session,
 *   joinStatus,
 *   joinError,
 *   lobby,
 *   joinSession,
 *   leaveSession,
 * } = useSession({
 *   socket,
 *   onJoined: (s) => console.log('Joined session:', s.sessionId),
 * });
 * 
 * // Join a session
 * const success = await joinSession('ABC123', 'PlayerOne');
 * ```
 */
export function useSession(options: UseSessionOptions = {}): UseSessionReturn {
  const {
    socket,
    storageKey = STORAGE_KEY,
    onJoined,
    onJoinError,
    onParticipantJoined,
    onParticipantLeft,
  } = options;

  // State
  const [session, setSession] = useState<SessionData | null>(null);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>('idle');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyState | null>(null);

  // Load session from storage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const data = JSON.parse(stored) as SessionData;
        setSession(data);
        setJoinStatus('joined');
      }
    } catch (error) {
      console.error('[useSession] Failed to load session from storage:', error);
    }
  }, [storageKey]);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    // Lobby state update
    const handleLobbyState = (data: LobbyState) => {
      setLobby(data);
    };

    // Participant joined
    const handleParticipantJoined = (data: {
      participantId: string;
      nickname: string;
      participantCount: number;
    }) => {
      setLobby((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participantCount: data.participantCount,
          participants: [
            ...prev.participants,
            { participantId: data.participantId, nickname: data.nickname },
          ],
        };
      });
      onParticipantJoined?.({ participantId: data.participantId, nickname: data.nickname });
    };

    // Participant left
    const handleParticipantLeft = (data: {
      participantId: string;
      participantCount: number;
    }) => {
      setLobby((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participantCount: data.participantCount,
          participants: prev.participants.filter((p) => p.participantId !== data.participantId),
        };
      });
      onParticipantLeft?.(data.participantId);
    };

    // Kicked from session
    const handleKicked = () => {
      clearSessionData();
    };

    // Banned from session
    const handleBanned = () => {
      clearSessionData();
    };

    socket.on('lobby_state', handleLobbyState);
    socket.on('participant_joined', handleParticipantJoined);
    socket.on('participant_left', handleParticipantLeft);
    socket.on('kicked', handleKicked);
    socket.on('banned', handleBanned);

    return () => {
      socket.off('lobby_state', handleLobbyState);
      socket.off('participant_joined', handleParticipantJoined);
      socket.off('participant_left', handleParticipantLeft);
      socket.off('kicked', handleKicked);
      socket.off('banned', handleBanned);
    };
  }, [socket, onParticipantJoined, onParticipantLeft]);


  // Clear session data
  const clearSessionData = useCallback(() => {
    setSession(null);
    setJoinStatus('idle');
    setLobby(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(storageKey);
      localStorage.removeItem('quiz_session_token');
    }
  }, [storageKey]);

  // Join session
  const joinSession = useCallback(
    async (joinCode: string, nickname: string): Promise<boolean> => {
      setJoinStatus('joining');
      setJoinError(null);

      try {
        const response = await api.post<JoinResponse>('/sessions/join', {
          joinCode: joinCode.toUpperCase().trim(),
          nickname: nickname.trim(),
        });

        const sessionData: SessionData = {
          sessionId: response.sessionId,
          participantId: response.participantId,
          sessionToken: response.sessionToken,
          nickname: nickname.trim(),
          joinCode: joinCode.toUpperCase().trim(),
          quizTitle: response.quizTitle,
        };

        // Store session data
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, JSON.stringify(sessionData));
          localStorage.setItem('quiz_session_token', response.sessionToken);
        }

        setSession(sessionData);
        setJoinStatus('joined');
        onJoined?.(sessionData);

        return true;
      } catch (error) {
        const apiError = error as ApiError;
        const errorMessage = apiError.message || 'Failed to join session';
        
        setJoinStatus('error');
        setJoinError(errorMessage);
        onJoinError?.(errorMessage);

        return false;
      }
    },
    [storageKey, onJoined, onJoinError]
  );

  // Leave session
  const leaveSession = useCallback(() => {
    clearSessionData();
  }, [clearSessionData]);

  // Clear error
  const clearError = useCallback(() => {
    setJoinError(null);
    if (joinStatus === 'error') {
      setJoinStatus('idle');
    }
  }, [joinStatus]);

  return {
    session,
    joinStatus,
    joinError,
    lobby,
    isInSession: !!session,
    joinSession,
    leaveSession,
    clearError,
  };
}

export default useSession;
