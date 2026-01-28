/**
 * Lobby Waiting Screen Component
 * 
 * Displays the lobby waiting screen for participants after joining a quiz.
 * Shows participant nickname, participant count, and connection status.
 * 
 * Mobile-first responsive design optimized for 320px-428px width.
 * Uses touch-friendly UI with minimum 44px tap targets.
 * Supports iOS safe areas for notched devices.
 * 
 * Requirements: 14.1, 14.2, 14.9
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ParticipantConnectionState } from '@/hooks/useParticipantSocket';

// ==================== Types ====================

export interface LobbyScreenProps {
  /** Participant's nickname */
  nickname: string;
  /** Number of participants in the session */
  participantCount: number;
  /** Current connection state */
  connectionState: ParticipantConnectionState;
  /** Session ID (for display) */
  sessionId: string;
  /** Error message if any */
  error?: string | null;
}

// ==================== Sub-Components ====================

/**
 * Connection status indicator
 */
function ConnectionStatus({ 
  state, 
  error 
}: { 
  state: ParticipantConnectionState; 
  error?: string | null;
}) {
  const getStatusConfig = () => {
    switch (state) {
      case 'connected':
        return {
          color: 'bg-success',
          text: 'Connected',
          pulse: false,
        };
      case 'connecting':
        return {
          color: 'bg-warning',
          text: 'Connecting...',
          pulse: true,
        };
      case 'authenticating':
        return {
          color: 'bg-info',
          text: 'Authenticating...',
          pulse: true,
        };
      case 'error':
        return {
          color: 'bg-error',
          text: error || 'Connection error',
          pulse: false,
        };
      case 'disconnected':
      default:
        return {
          color: 'bg-error',
          text: 'Disconnected',
          pulse: true,
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="flex items-center justify-center gap-2">
      <span className="relative flex h-3 w-3">
        {config.pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.color} opacity-75`}
          />
        )}
        <span
          className={`relative inline-flex rounded-full h-3 w-3 ${config.color}`}
        />
      </span>
      <span className="text-sm text-[var(--text-secondary)]">
        {config.text}
      </span>
    </div>
  );
}

/**
 * Animated waiting dots
 */
function WaitingDots() {
  return (
    <span className="inline-flex">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: 'easeInOut',
          }}
          className="text-primary"
        >
          .
        </motion.span>
      ))}
    </span>
  );
}

/**
 * Participant count display
 */
function ParticipantCountDisplay({ count }: { count: number }) {
  return (
    <motion.div
      key={count}
      initial={{ scale: 1.1, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="flex items-center justify-center gap-2"
    >
      <svg
        className="w-5 h-5 text-primary"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
      <span className="text-lg font-semibold text-[var(--text-primary)]">
        {count} {count === 1 ? 'participant' : 'participants'} joined
      </span>
    </motion.div>
  );
}

// ==================== Main Component ====================

/**
 * Lobby Waiting Screen
 * 
 * Displays the waiting screen for participants in the lobby state.
 * Shows their nickname, participant count, and connection status.
 * 
 * @example
 * ```tsx
 * <LobbyScreen
 *   nickname="Player1"
 *   participantCount={42}
 *   connectionState="connected"
 *   sessionId="abc123"
 * />
 * ```
 */
export function LobbyScreen({
  nickname,
  participantCount,
  connectionState,
  sessionId,
  error,
}: LobbyScreenProps) {
  return (
    <main 
      className="min-h-screen-mobile flex flex-col items-center justify-center p-4 xs-px-tight bg-[var(--neu-bg)] safe-area-inset-y overscroll-none"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md text-center px-2 sm:px-0"
      >
        {/* Main Card */}
        <div className="neu-raised-lg rounded-xl p-6 sm:p-8">
          {/* Success Icon - Touch-friendly size */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 rounded-full bg-success/10 flex items-center justify-center touch-target-48"
          >
            <svg
              className="w-8 h-8 sm:w-10 sm:h-10 text-success"
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
          </motion.div>

          {/* Welcome Message */}
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] mb-2">
            You&apos;re In!
          </h1>

          {/* Nickname Display */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-base sm:text-lg text-[var(--text-secondary)] mb-4 sm:mb-6"
          >
            Welcome,{' '}
            <span className="font-semibold text-primary break-all">{nickname}</span>
          </motion.p>

          {/* Waiting Message Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="p-3 sm:p-4 rounded-lg bg-[var(--neu-surface)] mb-4 sm:mb-6"
          >
            <div className="flex items-center justify-center gap-1 mb-2 sm:mb-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0"
              >
                <svg
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </motion.div>
              <span className="text-sm sm:text-base font-medium text-[var(--text-primary)]">
                Waiting for quiz to start
                <WaitingDots />
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-muted)]">
              The host will start the quiz shortly
            </p>
          </motion.div>

          {/* Participant Count */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mb-4 sm:mb-6"
          >
            <AnimatePresence mode="wait">
              <ParticipantCountDisplay count={participantCount} />
            </AnimatePresence>
          </motion.div>

          {/* Connection Status */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="pt-3 sm:pt-4 border-t border-[var(--border)]"
          >
            <ConnectionStatus state={connectionState} error={error} />
          </motion.div>

          {/* Session Info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-3 sm:mt-4 text-xs text-[var(--text-muted)]"
          >
            <p>Session: {sessionId?.slice(0, 8)}...</p>
          </motion.div>
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 sm:mt-8"
        >
          <p className="text-xs text-[var(--text-muted)]">
            A product of{' '}
            <a
              href="https://ctx.works"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline touch-target-44 inline-block py-1"
            >
              ctx.works
            </a>
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Powered by{' '}
            <a
              href="https://purplehatevents.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-secondary)] hover:underline"
            >
              PurpleHat Events
            </a>
          </p>
        </motion.div>
      </motion.div>
    </main>
  );
}

export default LobbyScreen;
