/**
 * OfflineIndicator Component
 * 
 * Displays offline status and pending answer queue information.
 * Shows when the participant is disconnected and has pending answers.
 * Uses neumorphic design system with appropriate semantic colors.
 * 
 * Requirements: 14.10
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QueueStatus } from '@/lib/offline-answer-queue';

// ==================== Types ====================

export interface OfflineIndicatorProps {
  /** Whether the socket is connected */
  isConnected: boolean;
  /** Whether the browser is online */
  isOnline: boolean;
  /** Number of pending answers in the queue */
  pendingCount: number;
  /** Current queue status */
  queueStatus: QueueStatus;
  /** Optional className for additional styling */
  className?: string;
}

// ==================== Helper Functions ====================

/**
 * Get status configuration based on connection and queue state
 */
function getStatusConfig(
  isConnected: boolean,
  isOnline: boolean,
  pendingCount: number,
  queueStatus: QueueStatus
): {
  icon: React.ReactNode;
  text: string;
  subtext?: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  animate: boolean;
} {
  // Offline - browser has no network
  if (!isOnline) {
    return {
      icon: <WifiOffIcon />,
      text: 'No Internet',
      subtext: pendingCount > 0 
        ? `${pendingCount} answer${pendingCount > 1 ? 's' : ''} will sync when online`
        : 'Answers will be saved locally',
      bgColor: 'bg-error/10',
      textColor: 'text-error',
      borderColor: 'border-error/20',
      animate: true,
    };
  }

  // Disconnected from server but browser is online
  if (!isConnected) {
    return {
      icon: <DisconnectedIcon />,
      text: 'Reconnecting...',
      subtext: pendingCount > 0 
        ? `${pendingCount} answer${pendingCount > 1 ? 's' : ''} pending`
        : 'Trying to reconnect',
      bgColor: 'bg-warning/10',
      textColor: 'text-warning',
      borderColor: 'border-warning/20',
      animate: true,
    };
  }

  // Connected but flushing queue
  if (queueStatus === 'flushing' && pendingCount > 0) {
    return {
      icon: <SyncingIcon />,
      text: 'Syncing...',
      subtext: `Sending ${pendingCount} answer${pendingCount > 1 ? 's' : ''}`,
      bgColor: 'bg-info/10',
      textColor: 'text-info',
      borderColor: 'border-info/20',
      animate: true,
    };
  }

  // Connected with pending answers (error state)
  if (queueStatus === 'error' && pendingCount > 0) {
    return {
      icon: <ErrorIcon />,
      text: 'Sync Failed',
      subtext: `${pendingCount} answer${pendingCount > 1 ? 's' : ''} couldn't be sent`,
      bgColor: 'bg-error/10',
      textColor: 'text-error',
      borderColor: 'border-error/20',
      animate: false,
    };
  }

  // Connected with pending answers (idle - waiting to sync)
  if (pendingCount > 0) {
    return {
      icon: <PendingIcon />,
      text: 'Pending',
      subtext: `${pendingCount} answer${pendingCount > 1 ? 's' : ''} to sync`,
      bgColor: 'bg-warning/10',
      textColor: 'text-warning',
      borderColor: 'border-warning/20',
      animate: false,
    };
  }

  // All good - connected and no pending answers
  return {
    icon: <ConnectedIcon />,
    text: 'Connected',
    subtext: undefined,
    bgColor: 'bg-success/10',
    textColor: 'text-success',
    borderColor: 'border-success/20',
    animate: false,
  };
}

// ==================== Icon Components ====================

function WifiOffIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3"
      />
    </svg>
  );
}

function DisconnectedIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
      />
    </svg>
  );
}

function SyncingIcon() {
  return (
    <motion.svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </motion.svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function PendingIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ConnectedIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

// ==================== Main Component ====================

/**
 * OfflineIndicator Component
 * 
 * Displays connection status and pending answer queue information.
 * Only shows when there's something to report (offline, disconnected, or pending answers).
 */
export function OfflineIndicator({
  isConnected,
  isOnline,
  pendingCount,
  queueStatus,
  className = '',
}: OfflineIndicatorProps) {
  const config = getStatusConfig(isConnected, isOnline, pendingCount, queueStatus);
  
  // Only show indicator when there's something to report
  const shouldShow = !isOnline || !isConnected || pendingCount > 0;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={`
            fixed top-0 left-0 right-0 z-50
            safe-area-inset-x safe-area-inset-top
            ${className}
          `}
        >
          <div
            className={`
              mx-2 mt-2 sm:mx-4 sm:mt-3
              px-3 py-2 sm:px-4 sm:py-2.5
              rounded-lg border
              ${config.bgColor} ${config.borderColor}
              shadow-sm backdrop-blur-sm
            `}
          >
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Animated pulse indicator */}
              {config.animate && (
                <motion.div
                  className={`w-2 h-2 rounded-full ${config.textColor.replace('text-', 'bg-')}`}
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              
              {/* Icon */}
              <div className={config.textColor}>
                {config.icon}
              </div>
              
              {/* Text content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${config.textColor}`}>
                    {config.text}
                  </span>
                  {pendingCount > 0 && (
                    <span className={`
                      text-xs font-medium px-1.5 py-0.5 rounded-full
                      ${config.bgColor} ${config.textColor}
                    `}>
                      {pendingCount}
                    </span>
                  )}
                </div>
                {config.subtext && (
                  <p className="text-xs text-[var(--text-secondary)] truncate">
                    {config.subtext}
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ==================== Compact Variant ====================

export interface OfflineIndicatorCompactProps {
  /** Whether the socket is connected */
  isConnected: boolean;
  /** Whether the browser is online */
  isOnline: boolean;
  /** Number of pending answers in the queue */
  pendingCount: number;
  /** Optional className for additional styling */
  className?: string;
}

/**
 * Compact offline indicator for inline use
 * Shows a small dot/badge indicating connection status
 */
export function OfflineIndicatorCompact({
  isConnected,
  isOnline,
  pendingCount,
  className = '',
}: OfflineIndicatorCompactProps) {
  // Determine status color
  let statusColor = 'bg-success'; // Connected
  let statusText = 'Connected';
  let animate = false;

  if (!isOnline) {
    statusColor = 'bg-error';
    statusText = 'Offline';
    animate = true;
  } else if (!isConnected) {
    statusColor = 'bg-warning';
    statusText = 'Reconnecting';
    animate = true;
  } else if (pendingCount > 0) {
    statusColor = 'bg-warning';
    statusText = `${pendingCount} pending`;
    animate = false;
  }

  return (
    <div 
      className={`flex items-center gap-1.5 ${className}`}
      title={statusText}
    >
      <motion.div
        className={`w-2 h-2 rounded-full ${statusColor}`}
        animate={animate ? { opacity: [1, 0.4, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      {pendingCount > 0 && (
        <span className="text-xs text-[var(--text-secondary)]">
          {pendingCount}
        </span>
      )}
    </div>
  );
}

export default OfflineIndicator;
