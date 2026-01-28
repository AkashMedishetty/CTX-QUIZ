/**
 * Connection Status Indicator - Visual indicator for WebSocket connection state
 * 
 * Displays the current connection status with:
 * - Color-coded status indicator (green/yellow/red)
 * - Status text
 * - Reconnect button when disconnected
 * - Neumorphic design
 * 
 * Requirements: 13.9
 */

'use client';

import { motion } from 'framer-motion';
import { ControllerConnectionState } from '@/hooks/useControllerSocket';

interface ConnectionStatusIndicatorProps {
  /** Current connection state */
  state: ControllerConnectionState;
  /** Callback when reconnect button is clicked */
  onReconnect?: () => void;
}

/**
 * Get status configuration based on connection state
 */
function getStatusConfig(state: ControllerConnectionState) {
  switch (state) {
    case 'connected':
      return {
        color: 'bg-success',
        pulseColor: 'bg-success/50',
        text: 'Connected',
        textColor: 'text-success',
        showReconnect: false,
      };
    case 'connecting':
      return {
        color: 'bg-warning',
        pulseColor: 'bg-warning/50',
        text: 'Connecting...',
        textColor: 'text-warning',
        showReconnect: false,
      };
    case 'authenticating':
      return {
        color: 'bg-info',
        pulseColor: 'bg-info/50',
        text: 'Authenticating...',
        textColor: 'text-info',
        showReconnect: false,
      };
    case 'disconnected':
      return {
        color: 'bg-[var(--text-muted)]',
        pulseColor: 'bg-[var(--text-muted)]/50',
        text: 'Disconnected',
        textColor: 'text-[var(--text-muted)]',
        showReconnect: true,
      };
    case 'error':
      return {
        color: 'bg-error',
        pulseColor: 'bg-error/50',
        text: 'Error',
        textColor: 'text-error',
        showReconnect: true,
      };
    default:
      return {
        color: 'bg-[var(--text-muted)]',
        pulseColor: 'bg-[var(--text-muted)]/50',
        text: 'Unknown',
        textColor: 'text-[var(--text-muted)]',
        showReconnect: true,
      };
  }
}

/**
 * Connection Status Indicator Component
 */
export function ConnectionStatusIndicator({
  state,
  onReconnect,
}: ConnectionStatusIndicatorProps) {
  const config = getStatusConfig(state);
  const isAnimating = state === 'connecting' || state === 'authenticating';

  return (
    <div className="flex items-center gap-3">
      {/* Status Indicator */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-md neu-pressed-sm">
        {/* Animated Dot */}
        <div className="relative">
          {/* Pulse animation for connecting states */}
          {isAnimating && (
            <motion.div
              className={`absolute inset-0 rounded-full ${config.pulseColor}`}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.7, 0, 0.7],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}
          
          {/* Connected pulse */}
          {state === 'connected' && (
            <motion.div
              className={`absolute inset-0 rounded-full ${config.pulseColor}`}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}
          
          {/* Status Dot */}
          <motion.div
            className={`w-2.5 h-2.5 rounded-full ${config.color}`}
            animate={
              isAnimating
                ? {
                    scale: [1, 0.8, 1],
                  }
                : {}
            }
            transition={{
              duration: 0.8,
              repeat: isAnimating ? Infinity : 0,
              ease: 'easeInOut',
            }}
          />
        </div>

        {/* Status Text */}
        <span className={`text-body-sm font-medium ${config.textColor}`}>
          {config.text}
        </span>
      </div>

      {/* Reconnect Button */}
      {config.showReconnect && onReconnect && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          onClick={onReconnect}
          className="flex items-center gap-1.5 px-3 py-2 text-body-sm font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Reconnect
        </motion.button>
      )}
    </div>
  );
}

export default ConnectionStatusIndicator;
