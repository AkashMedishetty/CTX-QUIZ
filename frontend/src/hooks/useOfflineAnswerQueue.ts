/**
 * useOfflineAnswerQueue - React hook for offline answer queue management
 * 
 * Provides a React-friendly interface to the OfflineAnswerQueue class.
 * Integrates with useReconnection hook for automatic flush on reconnect.
 * 
 * Requirements: 4.8, 14.10
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import {
  OfflineAnswerQueue,
  OfflineAnswerQueueOptions,
  QueuedAnswer,
  QueueStatus,
  FlushResult,
} from '../lib/offline-answer-queue';

/**
 * Hook return type
 */
export interface UseOfflineAnswerQueueReturn {
  /** Current queue status */
  status: QueueStatus;
  /** Whether currently online */
  isOnline: boolean;
  /** Number of pending answers in the queue */
  pendingCount: number;
  /** Whether there are pending answers */
  hasPendingAnswers: boolean;
  /** Get all queued answers */
  queuedAnswers: QueuedAnswer[];
  /** Last flush results */
  lastFlushResults: FlushResult[] | null;
  
  // Methods
  /** Queue an answer for later submission */
  queueAnswer: (answer: Omit<QueuedAnswer, 'timestamp'>) => boolean;
  /** Flush the queue by submitting all queued answers */
  flushQueue: (socket: Socket | null) => Promise<FlushResult[]>;
  /** Clear all queued answers */
  clearQueue: () => void;
  /** Remove a specific answer from the queue */
  removeAnswer: (questionId: string, sessionId: string, participantId: string) => boolean;
}

/**
 * Hook options
 */
export interface UseOfflineAnswerQueueOptions extends OfflineAnswerQueueOptions {
  /** Socket instance to use for flushing (optional, can be provided via flushQueue) */
  socket?: Socket | null;
  /** Auto-flush when coming back online (default: false) */
  autoFlushOnReconnect?: boolean;
  /** Callback when queue changes */
  onQueueChange?: (queue: QueuedAnswer[]) => void;
  /** Callback when status changes */
  onStatusChange?: (status: QueueStatus) => void;
  /** Callback when flush completes */
  onFlushComplete?: (results: FlushResult[]) => void;
  /** Callback when an answer is queued */
  onAnswerQueued?: (answer: QueuedAnswer) => void;
}

/**
 * useOfflineAnswerQueue hook
 * 
 * React hook that wraps OfflineAnswerQueue for easy integration.
 * Can be used standalone or integrated with useReconnection for automatic flush.
 * 
 * @param options - Hook configuration options
 * @returns Hook return object with state and methods
 * 
 * @example
 * ```tsx
 * // Basic usage
 * const {
 *   status,
 *   pendingCount,
 *   queueAnswer,
 *   flushQueue,
 * } = useOfflineAnswerQueue();
 * 
 * // Queue an answer when offline
 * queueAnswer({
 *   questionId: 'q-123',
 *   selectedOptionIds: ['opt-1'],
 *   sessionId: 'session-456',
 *   participantId: 'participant-789',
 * });
 * 
 * // Flush when back online
 * const results = await flushQueue(socket);
 * ```
 * 
 * @example
 * ```tsx
 * // Integration with useReconnection
 * const { getSocket, isConnected } = useReconnection({ serverUrl });
 * const { pendingCount, flushQueue } = useOfflineAnswerQueue({
 *   autoFlushOnReconnect: true,
 *   socket: getSocket(),
 * });
 * 
 * // Auto-flush happens when socket reconnects
 * ```
 */
export function useOfflineAnswerQueue(
  options: UseOfflineAnswerQueueOptions = {}
): UseOfflineAnswerQueueReturn {
  const {
    socket,
    autoFlushOnReconnect = false,
    onQueueChange,
    onStatusChange,
    onFlushComplete,
    onAnswerQueued,
    ...queueOptions
  } = options;

  // State
  const [status, setStatus] = useState<QueueStatus>('idle');
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [queuedAnswers, setQueuedAnswers] = useState<QueuedAnswer[]>([]);
  const [lastFlushResults, setLastFlushResults] = useState<FlushResult[] | null>(null);

  // Refs
  const queueRef = useRef<OfflineAnswerQueue | null>(null);
  const socketRef = useRef<Socket | null>(socket ?? null);
  const callbacksRef = useRef({
    onQueueChange,
    onStatusChange,
    onFlushComplete,
    onAnswerQueued,
  });

  // Update refs when they change
  useEffect(() => {
    socketRef.current = socket ?? null;
  }, [socket]);

  useEffect(() => {
    callbacksRef.current = {
      onQueueChange,
      onStatusChange,
      onFlushComplete,
      onAnswerQueued,
    };
  }, [onQueueChange, onStatusChange, onFlushComplete, onAnswerQueued]);

  // Initialize queue
  useEffect(() => {
    const queue = new OfflineAnswerQueue(queueOptions);
    queueRef.current = queue;

    // Set initial state
    setIsOnline(queue.isOnline);
    setPendingCount(queue.pendingCount);
    setQueuedAnswers(queue.getQueuedAnswers());

    // Set up event listeners
    const unsubscribeQueueChange = queue.onQueueChange((newQueue) => {
      setQueuedAnswers(newQueue);
      setPendingCount(newQueue.length);
      callbacksRef.current.onQueueChange?.(newQueue);
    });

    const unsubscribeStatusChange = queue.onStatusChange((newStatus) => {
      setStatus(newStatus);
      callbacksRef.current.onStatusChange?.(newStatus);
    });

    const unsubscribeFlushComplete = queue.onFlushComplete((results) => {
      setLastFlushResults(results);
      callbacksRef.current.onFlushComplete?.(results);
    });

    const unsubscribeAnswerQueued = queue.onAnswerQueued((answer) => {
      callbacksRef.current.onAnswerQueued?.(answer);
    });

    // Set up online/offline detection
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    // Cleanup
    return () => {
      unsubscribeQueueChange();
      unsubscribeStatusChange();
      unsubscribeFlushComplete();
      unsubscribeAnswerQueued();
      
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
      
      queue.destroy();
    };
  }, []); // Only create queue once

  // Auto-flush on reconnect
  useEffect(() => {
    if (!autoFlushOnReconnect || !socket || !isOnline) return;

    // Check if we have pending answers and socket is connected
    if (queueRef.current?.hasPendingAnswers && socket.connected) {
      console.log('[useOfflineAnswerQueue] Auto-flushing queue on reconnect');
      queueRef.current.flushQueue(socket);
    }
  }, [autoFlushOnReconnect, socket, isOnline]);

  // Methods
  const queueAnswer = useCallback((answer: Omit<QueuedAnswer, 'timestamp'>): boolean => {
    if (!queueRef.current) return false;
    return queueRef.current.queueAnswer(answer);
  }, []);

  const flushQueue = useCallback(async (socketToUse: Socket | null): Promise<FlushResult[]> => {
    if (!queueRef.current) return [];
    const effectiveSocket = socketToUse ?? socketRef.current;
    return queueRef.current.flushQueue(effectiveSocket);
  }, []);

  const clearQueue = useCallback(() => {
    queueRef.current?.clearQueue();
  }, []);

  const removeAnswer = useCallback((
    questionId: string, 
    sessionId: string, 
    participantId: string
  ): boolean => {
    if (!queueRef.current) return false;
    return queueRef.current.removeAnswer(questionId, sessionId, participantId);
  }, []);

  return {
    // State
    status,
    isOnline,
    pendingCount,
    hasPendingAnswers: pendingCount > 0,
    queuedAnswers,
    lastFlushResults,

    // Methods
    queueAnswer,
    flushQueue,
    clearQueue,
    removeAnswer,
  };
}

/**
 * Get queue status display configuration
 * 
 * Helper function to get display properties for queue status.
 * 
 * @param status - Current queue status
 * @param pendingCount - Number of pending answers
 * @returns Display configuration object
 */
export function getQueueStatusConfig(status: QueueStatus, pendingCount: number): {
  icon: string;
  text: string;
  color: string;
  bgColor: string;
} {
  if (pendingCount === 0) {
    return {
      icon: '✓',
      text: 'No pending answers',
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    };
  }

  switch (status) {
    case 'idle':
      return {
        icon: '📋',
        text: `${pendingCount} answer${pendingCount > 1 ? 's' : ''} pending`,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
      };
    case 'flushing':
      return {
        icon: '🔄',
        text: `Syncing ${pendingCount} answer${pendingCount > 1 ? 's' : ''}...`,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
      };
    case 'error':
      return {
        icon: '⚠️',
        text: `Failed to sync ${pendingCount} answer${pendingCount > 1 ? 's' : ''}`,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
      };
    default:
      return {
        icon: '❓',
        text: 'Unknown status',
        color: 'text-gray-400',
        bgColor: 'bg-gray-50',
      };
  }
}

export default useOfflineAnswerQueue;
