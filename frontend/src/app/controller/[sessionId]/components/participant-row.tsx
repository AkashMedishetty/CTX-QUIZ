/**
 * Participant Row - Individual participant display with moderation actions
 * 
 * Displays participant info and provides kick/ban actions.
 * Shows connection status, nickname, and score.
 * - React.memo for performance optimization (prevents unnecessary re-renders)
 * 
 * Requirements: 10.2, 10.3, 10.4, 10.5, 13.4, 14.1
 */

'use client';

import { useState, memo, useCallback } from 'react';
import { motion } from 'framer-motion';

/**
 * Participant status type
 */
export type ParticipantStatus = 'connected' | 'disconnected';

/**
 * Participant row props
 */
export interface ParticipantRowProps {
  /** Participant ID */
  participantId: string;
  /** Participant nickname */
  nickname: string;
  /** Connection status */
  status: ParticipantStatus;
  /** Participant score (optional, shown during active quiz) */
  score?: number;
  /** Participant rank (optional) */
  rank?: number;
  /** Whether participant is eliminated (for elimination mode) */
  isEliminated?: boolean;
  /** Last seen timestamp */
  lastSeen?: number;
  /** Callback when kick is clicked */
  onKick: (participantId: string, nickname: string) => void;
  /** Callback when ban is clicked */
  onBan: (participantId: string, nickname: string) => void;
  /** Whether actions are disabled */
  isDisabled?: boolean;
}

/**
 * Format time since last seen
 */
function formatLastSeen(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) {
    return 'Just now';
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  } else {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }
}

/**
 * Participant Row Component
 * 
 * Memoized to prevent unnecessary re-renders when parent updates
 * but this row's props haven't changed.
 */
export const ParticipantRow = memo(function ParticipantRow({
  participantId,
  nickname,
  status,
  score,
  rank,
  isEliminated = false,
  lastSeen,
  onKick,
  onBan,
  isDisabled = false,
}: ParticipantRowProps) {
  const [showActions, setShowActions] = useState(false);
  const isConnected = status === 'connected';

  // Memoize event handlers to prevent unnecessary re-renders of child components
  const handleKick = useCallback(() => {
    onKick(participantId, nickname);
  }, [onKick, participantId, nickname]);

  const handleBan = useCallback(() => {
    onBan(participantId, nickname);
  }, [onBan, participantId, nickname]);

  const handleMouseEnter = useCallback(() => setShowActions(true), []);
  const handleMouseLeave = useCallback(() => setShowActions(false), []);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`group flex items-center gap-3 p-3 rounded-lg transition-all ${
        isEliminated 
          ? 'bg-[var(--text-muted)]/5 opacity-60' 
          : 'hover:bg-[var(--neu-surface)]'
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Rank (if available) */}
      {rank !== undefined && (
        <div className="w-8 text-center">
          <span className={`text-body-sm font-semibold ${
            rank <= 3 ? 'text-primary' : 'text-[var(--text-muted)]'
          }`}>
            #{rank}
          </span>
        </div>
      )}

      {/* Connection Status Indicator */}
      <div className="relative flex-shrink-0">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          isEliminated 
            ? 'bg-[var(--text-muted)]/10' 
            : 'bg-primary/10'
        }`}>
          <span className={`text-body font-semibold ${
            isEliminated ? 'text-[var(--text-muted)]' : 'text-primary'
          }`}>
            {nickname.charAt(0).toUpperCase()}
          </span>
        </div>
        
        {/* Status dot */}
        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--neu-bg)] ${
          isConnected ? 'bg-success' : 'bg-[var(--text-muted)]'
        }`}>
          {isConnected && (
            <motion.div
              className="absolute inset-0 rounded-full bg-success"
              animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
        </div>
      </div>

      {/* Participant Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-body font-medium truncate ${
            isEliminated ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'
          }`}>
            {nickname}
          </p>
          
          {/* Eliminated badge */}
          {isEliminated && (
            <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-error/10 text-error text-caption font-medium">
              Eliminated
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2 text-caption text-[var(--text-muted)]">
          <span className={`flex items-center gap-1 ${
            isConnected ? 'text-success' : 'text-[var(--text-muted)]'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? 'bg-success' : 'bg-[var(--text-muted)]'
            }`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          
          {!isConnected && lastSeen && (
            <span>• {formatLastSeen(lastSeen)}</span>
          )}
        </div>
      </div>

      {/* Score (if available) */}
      {score !== undefined && (
        <div className="flex-shrink-0 text-right mr-2">
          <p className={`text-body font-semibold ${
            isEliminated ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'
          }`}>
            {score.toLocaleString()}
          </p>
          <p className="text-caption text-[var(--text-muted)]">points</p>
        </div>
      )}

      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0, width: 0 }}
        animate={{ 
          opacity: showActions ? 1 : 0, 
          width: showActions ? 'auto' : 0 
        }}
        className="flex items-center gap-1 overflow-hidden"
      >
        {/* Kick Button */}
        <button
          onClick={handleKick}
          disabled={isDisabled}
          className="p-2 rounded-md text-warning hover:bg-warning/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Kick participant"
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
              d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"
            />
          </svg>
        </button>

        {/* Ban Button */}
        <button
          onClick={handleBan}
          disabled={isDisabled}
          className="p-2 rounded-md text-error hover:bg-error/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Ban participant"
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
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </button>
      </motion.div>

      {/* Mobile Action Buttons (always visible on touch devices) */}
      <div className="flex items-center gap-1 sm:hidden">
        <button
          onClick={handleKick}
          disabled={isDisabled}
          className="p-2 rounded-md text-warning hover:bg-warning/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Kick participant"
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
              d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"
            />
          </svg>
        </button>

        <button
          onClick={handleBan}
          disabled={isDisabled}
          className="p-2 rounded-md text-error hover:bg-error/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Ban participant"
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
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </button>
      </div>
    </motion.div>
  );
});

export default ParticipantRow;
