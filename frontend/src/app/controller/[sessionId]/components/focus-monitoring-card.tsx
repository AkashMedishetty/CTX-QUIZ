/**
 * FocusMonitoringCard Component
 * 
 * Displays participants who have lost focus during the quiz.
 * Shows warning indicators for multiple focus losses and total lost time.
 * 
 * Requirements: 9.4, 9.5
 * - Display list of participants with focus warnings
 * - Show warning indicator for multiple focus losses
 * - Display timestamps and total lost time
 */

'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Focus data for a participant
 */
export interface ParticipantFocusData {
  participantId: string;
  nickname: string;
  focusData?: {
    isFocused: boolean;
    totalLostCount: number;
    totalLostTimeMs: number;
    lastFocusLostAt?: number;
  };
}

/**
 * Props for FocusMonitoringCard
 */
export interface FocusMonitoringCardProps {
  /** List of participants with focus data */
  participants: ParticipantFocusData[];
  /** Whether focus monitoring is enabled for this session */
  isEnabled?: boolean;
  /** Whether the quiz is currently active */
  isQuizActive: boolean;
}

/**
 * Format milliseconds to human-readable duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format timestamp to time string
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Get severity level based on focus loss count
 */
function getSeverity(lostCount: number): 'low' | 'medium' | 'high' {
  if (lostCount >= 5) return 'high';
  if (lostCount >= 3) return 'medium';
  return 'low';
}

/**
 * FocusMonitoringCard Component
 */
export function FocusMonitoringCard({
  participants,
  isEnabled = true,
  isQuizActive,
}: FocusMonitoringCardProps) {
  // Filter participants who have lost focus at least once
  const participantsWithFocusIssues = useMemo(() => {
    return participants
      .filter((p) => p.focusData && p.focusData.totalLostCount > 0)
      .sort((a, b) => {
        // Sort by: currently unfocused first, then by total lost count
        const aFocused = a.focusData?.isFocused ?? true;
        const bFocused = b.focusData?.isFocused ?? true;
        if (aFocused !== bFocused) return aFocused ? 1 : -1;
        return (b.focusData?.totalLostCount ?? 0) - (a.focusData?.totalLostCount ?? 0);
      });
  }, [participants]);

  // Count currently unfocused participants
  const currentlyUnfocusedCount = useMemo(() => {
    return participantsWithFocusIssues.filter((p) => !p.focusData?.isFocused).length;
  }, [participantsWithFocusIssues]);

  if (!isEnabled) {
    return (
      <div className="neu-raised rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <svg
            className="w-5 h-5 text-[var(--text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Focus Monitoring
          </h3>
        </div>
        <p className="text-sm text-[var(--text-muted)] text-center py-4">
          Focus monitoring is disabled for this session
        </p>
      </div>
    );
  }

  return (
    <div className="neu-raised rounded-xl p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg
            className={`w-5 h-5 ${currentlyUnfocusedCount > 0 ? 'text-warning' : 'text-[var(--text-secondary)]'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Focus Monitoring
          </h3>
        </div>
        
        {/* Status badge */}
        {isQuizActive && (
          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
            currentlyUnfocusedCount > 0
              ? 'bg-warning/15 text-warning'
              : 'bg-success/15 text-success'
          }`}>
            {currentlyUnfocusedCount > 0
              ? `${currentlyUnfocusedCount} unfocused`
              : 'All focused'}
          </div>
        )}
      </div>

      {/* Content */}
      {!isQuizActive ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-4">
          Focus monitoring active during quiz
        </p>
      ) : participantsWithFocusIssues.length === 0 ? (
        <div className="text-center py-4">
          <svg
            className="w-8 h-8 mx-auto text-success/50 mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-[var(--text-muted)]">
            No focus issues detected
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {participantsWithFocusIssues.map((participant) => {
              const focusData = participant.focusData!;
              const severity = getSeverity(focusData.totalLostCount);
              const isCurrentlyUnfocused = !focusData.isFocused;

              return (
                <motion.div
                  key={participant.participantId}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={`p-3 rounded-lg ${
                    isCurrentlyUnfocused
                      ? 'bg-warning/10 border border-warning/30'
                      : 'bg-[var(--neu-surface)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {/* Status indicator */}
                      <div className={`w-2 h-2 rounded-full ${
                        isCurrentlyUnfocused
                          ? 'bg-warning animate-pulse'
                          : 'bg-success'
                      }`} />
                      
                      {/* Nickname */}
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {participant.nickname}
                      </span>
                      
                      {/* Severity badge */}
                      {severity !== 'low' && (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          severity === 'high'
                            ? 'bg-error/15 text-error'
                            : 'bg-warning/15 text-warning'
                        }`}>
                          {severity === 'high' ? '⚠️ High' : '⚠ Medium'}
                        </span>
                      )}
                    </div>
                    
                    {/* Lost count */}
                    <span className={`text-xs font-semibold ${
                      severity === 'high'
                        ? 'text-error'
                        : severity === 'medium'
                          ? 'text-warning'
                          : 'text-[var(--text-secondary)]'
                    }`}>
                      {focusData.totalLostCount}x
                    </span>
                  </div>
                  
                  {/* Details row */}
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>
                      Total lost: {formatDuration(focusData.totalLostTimeMs)}
                    </span>
                    {focusData.lastFocusLostAt && (
                      <span>
                        Last: {formatTime(focusData.lastFocusLostAt)}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Summary footer */}
      {participantsWithFocusIssues.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>
              {participantsWithFocusIssues.length} participant{participantsWithFocusIssues.length !== 1 ? 's' : ''} with focus issues
            </span>
            <span>
              Total events: {participantsWithFocusIssues.reduce((sum, p) => sum + (p.focusData?.totalLostCount ?? 0), 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default FocusMonitoringCard;
