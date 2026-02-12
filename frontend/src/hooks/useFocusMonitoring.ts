/**
 * useFocusMonitoring - React hook for tracking browser visibility/focus changes
 *
 * Detects when participants switch to another app or browser tab using the
 * Page Visibility API. Tracks focus lost/regained events with timestamps
 * and calculates total time spent away.
 *
 * Requirements: 9.1
 * Property 12: For any visibility change detected by the browser, the Participant_Page
 * SHALL emit either a focus_lost or focus_regained event to the server within 100ms,
 * including the accurate timestamp.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Focus event types
 */
export type FocusEventType = 'focus_lost' | 'focus_regained';

/**
 * Focus event data structure
 */
export interface FocusEvent {
  /** Type of focus event */
  type: FocusEventType;
  /** Timestamp when the event occurred (ms since epoch) */
  timestamp: number;
  /** Duration in ms (only for focus_regained events) */
  durationMs?: number;
}

/**
 * Options for the useFocusMonitoring hook
 */
export interface FocusMonitoringOptions {
  /** Whether focus monitoring is enabled */
  enabled: boolean;
  /** Callback when focus is lost */
  onFocusLost: (timestamp: number) => void;
  /** Callback when focus is regained */
  onFocusRegained: (timestamp: number, durationMs: number) => void;
}

/**
 * Return type for the useFocusMonitoring hook
 */
export interface UseFocusMonitoringReturn {
  /** Whether the page currently has focus */
  isFocused: boolean;
  /** Array of all focus events that have occurred */
  focusEvents: FocusEvent[];
  /** Total time in ms that focus has been lost */
  totalLostTime: number;
}

/**
 * Check if the Page Visibility API is supported
 */
function isVisibilityApiSupported(): boolean {
  return typeof document !== 'undefined' && typeof document.visibilityState !== 'undefined';
}

/**
 * Get the current visibility state
 */
function getVisibilityState(): boolean {
  if (!isVisibilityApiSupported()) {
    return true; // Assume focused if API not supported
  }
  return document.visibilityState === 'visible';
}

/**
 * useFocusMonitoring hook
 *
 * Tracks browser visibility changes to detect when participants switch apps or tabs.
 * Uses the Page Visibility API (document.visibilityState and visibilitychange event).
 *
 * @param options - Hook configuration options
 * @returns Hook return object with focus state and event history
 *
 * @example
 * ```tsx
 * const { isFocused, focusEvents, totalLostTime } = useFocusMonitoring({
 *   enabled: true,
 *   onFocusLost: (timestamp) => {
 *     socket.emit('focus_lost', { timestamp });
 *   },
 *   onFocusRegained: (timestamp, durationMs) => {
 *     socket.emit('focus_regained', { timestamp, durationMs });
 *   },
 * });
 * ```
 */
export function useFocusMonitoring(options: FocusMonitoringOptions): UseFocusMonitoringReturn {
  const { enabled, onFocusLost, onFocusRegained } = options;

  // State
  const [isFocused, setIsFocused] = useState<boolean>(() => getVisibilityState());
  const [focusEvents, setFocusEvents] = useState<FocusEvent[]>([]);
  const [totalLostTime, setTotalLostTime] = useState<number>(0);

  // Refs to track focus lost timestamp and avoid stale closures
  const focusLostTimestampRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onFocusLost, onFocusRegained });

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = { onFocusLost, onFocusRegained };
  }, [onFocusLost, onFocusRegained]);

  // Handle visibility change
  const handleVisibilityChange = useCallback(() => {
    if (!enabled) return;

    const timestamp = Date.now();
    const isVisible = getVisibilityState();

    if (!isVisible && isFocused) {
      // Focus lost - page became hidden
      focusLostTimestampRef.current = timestamp;
      setIsFocused(false);

      const focusLostEvent: FocusEvent = {
        type: 'focus_lost',
        timestamp,
      };

      setFocusEvents((prev) => [...prev, focusLostEvent]);

      // Call the callback
      callbacksRef.current.onFocusLost(timestamp);
    } else if (isVisible && !isFocused) {
      // Focus regained - page became visible
      const lostTimestamp = focusLostTimestampRef.current;
      const durationMs = lostTimestamp !== null ? timestamp - lostTimestamp : 0;

      focusLostTimestampRef.current = null;
      setIsFocused(true);

      const focusRegainedEvent: FocusEvent = {
        type: 'focus_regained',
        timestamp,
        durationMs,
      };

      setFocusEvents((prev) => [...prev, focusRegainedEvent]);
      setTotalLostTime((prev) => prev + durationMs);

      // Call the callback
      callbacksRef.current.onFocusRegained(timestamp, durationMs);
    }
  }, [enabled, isFocused]);

  // Set up visibility change listener
  useEffect(() => {
    if (!enabled || !isVisibilityApiSupported()) {
      return;
    }

    // Add event listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Check initial state - if page is already hidden when hook mounts
    if (!getVisibilityState() && isFocused) {
      handleVisibilityChange();
    }

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, handleVisibilityChange, isFocused]);

  // Reset state when disabled
  useEffect(() => {
    if (!enabled) {
      setIsFocused(getVisibilityState());
      setFocusEvents([]);
      setTotalLostTime(0);
      focusLostTimestampRef.current = null;
    }
  }, [enabled]);

  return {
    isFocused,
    focusEvents,
    totalLostTime,
  };
}

export default useFocusMonitoring;
