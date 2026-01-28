/**
 * useReconnection - React hook for WebSocket reconnection management
 * 
 * Provides a React-friendly interface to the ReconnectionManager class.
 * Handles connection status, session recovery, and automatic cleanup.
 * 
 * Requirements: 8.2, 8.6, 14.8, 17.1
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import {
  ReconnectionManager,
  ReconnectionManagerOptions,
  ConnectionStatus,
  SessionRecoveryData,
  RecoveryFailureData,
  StoredSessionData,
} from '../lib/reconnection-manager';

/**
 * Hook return type
 */
export interface UseReconnectionReturn {
  /** Current connection status */
  connectionStatus: ConnectionStatus;
  /** Whether currently connected */
  isConnected: boolean;
  /** Whether currently attempting to reconnect */
  isReconnecting: boolean;
  /** Current reconnection attempt number */
  reconnectAttempt: number;
  /** Last error that occurred */
  lastError: { code: string; message: string } | null;
  /** Session recovery data (if recovered) */
  recoveryData: SessionRecoveryData | null;
  /** Whether there is a stored session that can be recovered */
  hasStoredSession: boolean;
  /** Get stored session data */
  storedSession: StoredSessionData | null;
  
  // Methods
  /** Set session data and optionally connect */
  setSession: (
    sessionId: string,
    participantId: string,
    sessionToken: string,
    nickname: string,
    autoConnect?: boolean
  ) => void;
  /** Connect to the WebSocket server */
  connect: () => void;
  /** Disconnect from the WebSocket server */
  disconnect: () => void;
  /** Manually trigger a reconnection attempt */
  attemptReconnect: () => void;
  /** Clear stored session data */
  clearSession: () => void;
  /** Update the last known question ID */
  setLastKnownQuestionId: (questionId: string) => void;
  /** Get the underlying Socket.IO socket instance */
  getSocket: () => Socket | null;
}

/**
 * Hook options
 */
export interface UseReconnectionOptions extends Omit<ReconnectionManagerOptions, 'serverUrl'> {
  /** WebSocket server URL (required) */
  serverUrl: string;
  /** Auto-connect on mount if session exists (default: false) */
  autoConnect?: boolean;
  /** Callback when connection status changes */
  onConnectionStatusChange?: (status: ConnectionStatus, attempt?: number) => void;
  /** Callback when session is recovered */
  onSessionRecovered?: (data: SessionRecoveryData) => void;
  /** Callback when recovery fails */
  onRecoveryFailed?: (data: RecoveryFailureData) => void;
  /** Callback when authenticated */
  onAuthenticated?: (data: any) => void;
  /** Callback when an error occurs */
  onError?: (error: { code: string; message: string }) => void;
}

/**
 * useReconnection hook
 * 
 * React hook that wraps ReconnectionManager for easy integration.
 * 
 * @param options - Hook configuration options
 * @returns Hook return object with state and methods
 * 
 * @example
 * ```tsx
 * const {
 *   connectionStatus,
 *   isConnected,
 *   isReconnecting,
 *   setSession,
 *   connect,
 *   disconnect,
 * } = useReconnection({
 *   serverUrl: 'http://localhost:3001',
 *   onSessionRecovered: (data) => {
 *     console.log('Session recovered:', data);
 *   },
 * });
 * 
 * // Set session data after joining
 * setSession(sessionId, participantId, token, nickname, true);
 * ```
 */
export function useReconnection(options: UseReconnectionOptions): UseReconnectionReturn {
  const {
    serverUrl,
    autoConnect = false,
    onConnectionStatusChange,
    onSessionRecovered,
    onRecoveryFailed,
    onAuthenticated,
    onError,
    ...managerOptions
  } = options;

  // State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [lastError, setLastError] = useState<{ code: string; message: string } | null>(null);
  const [recoveryData, setRecoveryData] = useState<SessionRecoveryData | null>(null);
  const [hasStoredSession, setHasStoredSession] = useState(false);
  const [storedSession, setStoredSession] = useState<StoredSessionData | null>(null);

  // Refs
  const managerRef = useRef<ReconnectionManager | null>(null);
  const callbacksRef = useRef({
    onConnectionStatusChange,
    onSessionRecovered,
    onRecoveryFailed,
    onAuthenticated,
    onError,
  });

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = {
      onConnectionStatusChange,
      onSessionRecovered,
      onRecoveryFailed,
      onAuthenticated,
      onError,
    };
  }, [onConnectionStatusChange, onSessionRecovered, onRecoveryFailed, onAuthenticated, onError]);

  // Initialize manager
  useEffect(() => {
    const manager = new ReconnectionManager({
      serverUrl,
      ...managerOptions,
    });

    managerRef.current = manager;

    // Set up event listeners
    const unsubscribeStatus = manager.onConnectionStatusChange((status, attempt) => {
      setConnectionStatus(status);
      setReconnectAttempt(attempt || 0);
      callbacksRef.current.onConnectionStatusChange?.(status, attempt);
    });

    const unsubscribeRecovered = manager.onSessionRecovered((data) => {
      setRecoveryData(data);
      setLastError(null);
      callbacksRef.current.onSessionRecovered?.(data);
    });

    const unsubscribeFailed = manager.onRecoveryFailed((data) => {
      setLastError({ code: data.reason, message: data.message });
      callbacksRef.current.onRecoveryFailed?.(data);
    });

    const unsubscribeAuth = manager.onAuthenticated((data) => {
      callbacksRef.current.onAuthenticated?.(data);
    });

    const unsubscribeError = manager.onError((error) => {
      setLastError(error);
      callbacksRef.current.onError?.(error);
    });

    // Check for stored session
    setHasStoredSession(manager.hasStoredSession());
    setStoredSession(manager.getStoredSession());

    // Auto-connect if enabled and session exists
    if (autoConnect && manager.hasStoredSession()) {
      manager.connect();
    }

    // Cleanup
    return () => {
      unsubscribeStatus();
      unsubscribeRecovered();
      unsubscribeFailed();
      unsubscribeAuth();
      unsubscribeError();
      manager.disconnect();
    };
  }, [serverUrl]); // Only recreate manager if serverUrl changes

  // Methods
  const setSession = useCallback((
    sessionId: string,
    participantId: string,
    sessionToken: string,
    nickname: string,
    autoConnectAfter = false
  ) => {
    if (!managerRef.current) return;

    managerRef.current.setSessionData(sessionId, participantId, sessionToken, nickname);
    setHasStoredSession(true);
    setStoredSession({
      sessionId,
      participantId,
      sessionToken,
      nickname,
      timestamp: Date.now(),
    });

    if (autoConnectAfter) {
      managerRef.current.connect();
    }
  }, []);

  const connect = useCallback(() => {
    managerRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    managerRef.current?.disconnect();
  }, []);

  const attemptReconnect = useCallback(() => {
    managerRef.current?.attemptReconnect();
  }, []);

  const clearSession = useCallback(() => {
    managerRef.current?.clearSession();
    setHasStoredSession(false);
    setStoredSession(null);
    setRecoveryData(null);
  }, []);

  const setLastKnownQuestionId = useCallback((questionId: string) => {
    managerRef.current?.setLastKnownQuestionId(questionId);
  }, []);

  const getSocket = useCallback(() => {
    return managerRef.current?.socketInstance ?? null;
  }, []);

  return {
    // State
    connectionStatus,
    isConnected: connectionStatus === 'connected',
    isReconnecting: connectionStatus === 'reconnecting',
    reconnectAttempt,
    lastError,
    recoveryData,
    hasStoredSession,
    storedSession,

    // Methods
    setSession,
    connect,
    disconnect,
    attemptReconnect,
    clearSession,
    setLastKnownQuestionId,
    getSocket,
  };
}

/**
 * Connection status indicator component props
 */
export interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
  attempt?: number;
  className?: string;
}

/**
 * Get connection status display configuration
 * 
 * Helper function to get display properties for connection status.
 * 
 * @param status - Current connection status
 * @param attempt - Current reconnection attempt (optional)
 * @returns Display configuration object
 */
export function getConnectionStatusConfig(status: ConnectionStatus, attempt?: number): {
  icon: string;
  text: string;
  color: string;
  bgColor: string;
} {
  switch (status) {
    case 'connected':
      return {
        icon: '🟢',
        text: 'Connected',
        color: 'text-green-600',
        bgColor: 'bg-green-100',
      };
    case 'disconnected':
      return {
        icon: '🔴',
        text: 'Disconnected',
        color: 'text-red-600',
        bgColor: 'bg-red-100',
      };
    case 'reconnecting':
      return {
        icon: '🟡',
        text: attempt ? `Reconnecting (${attempt})...` : 'Reconnecting...',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
      };
    case 'failed':
      return {
        icon: '⚫',
        text: 'Connection Failed',
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
      };
    default:
      return {
        icon: '⚪',
        text: 'Unknown',
        color: 'text-gray-400',
        bgColor: 'bg-gray-50',
      };
  }
}

export default useReconnection;
