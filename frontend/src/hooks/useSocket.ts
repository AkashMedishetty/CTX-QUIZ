/**
 * useSocket - React hook for Socket.IO connection management
 * 
 * Provides a React-friendly interface for WebSocket connections.
 * Handles connection lifecycle, event subscriptions, and cleanup.
 * 
 * Requirements: 14.1, 14.2
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createSocketClient,
  TypedSocket,
  AuthData,
  SocketClientOptions,
  ServerToClientEvents,
  ClientToServerEvents,
} from '@/lib/socket-client';

/**
 * Connection state
 */
export type SocketConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Emit function type
 */
export type EmitFunction = <E extends keyof ClientToServerEvents>(
  event: E,
  ...args: Parameters<ClientToServerEvents[E]>
) => void;

/**
 * Hook return type
 */
export interface UseSocketReturn {
  /** The Socket.IO socket instance */
  socket: TypedSocket | null;
  /** Current connection state */
  connectionState: SocketConnectionState;
  /** Whether the socket is connected */
  isConnected: boolean;
  /** Last error that occurred */
  error: Error | null;
  /** Connect to the server */
  connect: () => void;
  /** Disconnect from the server */
  disconnect: () => void;
  /** Subscribe to a socket event */
  on: <E extends keyof ServerToClientEvents>(
    event: E,
    handler: ServerToClientEvents[E]
  ) => () => void;
  /** Emit an event to the server */
  emit: EmitFunction;
}


/**
 * Hook options
 */
export interface UseSocketOptions extends SocketClientOptions {
  /** Authentication data */
  auth?: AuthData;
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Callback when connected */
  onConnect?: () => void;
  /** Callback when disconnected */
  onDisconnect?: (reason: string) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
  /** Callback when reconnecting */
  onReconnecting?: (attempt: number) => void;
}

/**
 * useSocket hook
 * 
 * React hook for managing Socket.IO connections.
 * 
 * @param options - Hook configuration options
 * @returns Hook return object with socket and methods
 * 
 * @example
 * ```tsx
 * const { socket, isConnected, connect, on } = useSocket({
 *   auth: { token: sessionToken, role: 'participant' },
 *   autoConnect: true,
 *   onConnect: () => console.log('Connected!'),
 * });
 * 
 * // Subscribe to events
 * useEffect(() => {
 *   const unsubscribe = on('question_started', (data) => {
 *     console.log('Question started:', data);
 *   });
 *   return unsubscribe;
 * }, [on]);
 * ```
 */
export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const {
    auth,
    autoConnect = false,
    onConnect,
    onDisconnect,
    onError,
    onReconnecting,
    ...socketOptions
  } = options;

  // State
  const [connectionState, setConnectionState] = useState<SocketConnectionState>('disconnected');
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const socketRef = useRef<TypedSocket | null>(null);
  const callbacksRef = useRef({ onConnect, onDisconnect, onError, onReconnecting });

  // Update callbacks ref
  useEffect(() => {
    callbacksRef.current = { onConnect, onDisconnect, onError, onReconnecting };
  }, [onConnect, onDisconnect, onError, onReconnecting]);

  // Initialize socket
  useEffect(() => {
    const socket = createSocketClient(socketOptions, auth);
    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      setConnectionState('connected');
      setError(null);
      callbacksRef.current.onConnect?.();
    });

    socket.on('disconnect', (reason) => {
      setConnectionState('disconnected');
      callbacksRef.current.onDisconnect?.(reason);
    });

    socket.on('connect_error', (err) => {
      setConnectionState('error');
      setError(err);
      callbacksRef.current.onError?.(err);
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      setConnectionState('connecting');
      callbacksRef.current.onReconnecting?.(attempt);
    });

    socket.io.on('reconnect', () => {
      setConnectionState('connected');
      setError(null);
    });

    socket.io.on('reconnect_failed', () => {
      setConnectionState('error');
      setError(new Error('Reconnection failed'));
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
  }, []); // Only create socket once

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

  // Event subscription method
  const on = useCallback(<E extends keyof ServerToClientEvents>(
    event: E,
    handler: ServerToClientEvents[E]
  ): (() => void) => {
    if (!socketRef.current) {
      return () => {};
    }

    socketRef.current.on(event, handler as never);
    return () => {
      socketRef.current?.off(event, handler as never);
    };
  }, []);

  // Emit method - wrapper that forwards to socket
  const emit = useCallback(
    <E extends keyof ClientToServerEvents>(
      event: E,
      ...args: Parameters<ClientToServerEvents[E]>
    ) => {
      if (socketRef.current) {
        socketRef.current.emit(event, ...args);
      }
    },
    []
  );

  return {
    socket: socketRef.current,
    connectionState,
    isConnected: connectionState === 'connected',
    error,
    connect,
    disconnect,
    on,
    emit,
  };
}

export default useSocket;
