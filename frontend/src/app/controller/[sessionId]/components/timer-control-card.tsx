/**
 * Timer Control Card - Timer display and control interface for the controller
 * 
 * Displays:
 * - Current timer countdown with circular progress indicator
 * - Timer state (running, paused, expired)
 * - Visual warning when time is low (< 10 seconds)
 * - Control buttons (Pause, Resume, Reset)
 * 
 * Requirements: 10.6, 13.6
 */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ResetTimerModal } from './reset-timer-modal';

/**
 * Timer state types
 */
export type TimerState = 'idle' | 'running' | 'paused' | 'expired';

/**
 * Timer control card props
 */
interface TimerControlCardProps {
  /** Current remaining seconds */
  remainingSeconds: number;
  /** Total time limit for the question */
  totalTimeLimit: number;
  /** Current timer state */
  timerState: TimerState;
  /** Whether the quiz is in an active question state */
  isQuestionActive: boolean;
  /** Callback to pause the timer */
  onPauseTimer: () => void;
  /** Callback to resume the timer */
  onResumeTimer: () => void;
  /** Callback to reset the timer with new time */
  onResetTimer: (newTimeLimit: number) => void;
  /** Whether actions are disabled */
  isDisabled?: boolean;
}

/**
 * Circular progress indicator component
 */
function CircularProgress({
  progress,
  remainingSeconds,
  isWarning,
  isExpired,
  isPaused,
}: {
  progress: number;
  remainingSeconds: number;
  isWarning: boolean;
  isExpired: boolean;
  isPaused: boolean;
}) {
  const size = 200;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // Determine color based on state
  const getStrokeColor = () => {
    if (isExpired) return 'var(--color-error)';
    if (isPaused) return 'var(--color-warning)';
    if (isWarning) return 'var(--color-warning)';
    return 'var(--color-primary)';
  };

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return secs.toString();
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Background circle */}
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--shadow-dark)"
          strokeWidth={strokeWidth}
          className="opacity-30"
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getStrokeColor()}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          key={remainingSeconds}
          initial={{ scale: 1.1, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`font-display text-display font-bold ${
            isExpired
              ? 'text-error'
              : isWarning
              ? 'text-warning'
              : isPaused
              ? 'text-warning'
              : 'text-[var(--text-primary)]'
          }`}
        >
          {formatTime(remainingSeconds)}
        </motion.span>
        <span className="text-caption text-[var(--text-muted)] mt-1">
          {isExpired ? 'Time Up' : isPaused ? 'Paused' : 'seconds'}
        </span>
      </div>

      {/* Warning pulse animation */}
      {isWarning && !isExpired && !isPaused && (
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-warning"
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{ scale: 1.1, opacity: 0 }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}

      {/* Paused indicator */}
      {isPaused && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="absolute inset-0 rounded-full bg-warning/10" />
        </motion.div>
      )}
    </div>
  );
}

/**
 * Timer Control Card Component
 */
export function TimerControlCard({
  remainingSeconds,
  totalTimeLimit,
  timerState,
  isQuestionActive,
  onPauseTimer,
  onResumeTimer,
  onResetTimer,
  isDisabled = false,
}: TimerControlCardProps) {
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // Calculate progress percentage
  const progress = totalTimeLimit > 0 
    ? (remainingSeconds / totalTimeLimit) * 100 
    : 0;

  // Determine if we should show warning (< 10 seconds)
  const isWarning = remainingSeconds > 0 && remainingSeconds <= 10;
  const isExpired = timerState === 'expired' || remainingSeconds === 0;
  const isPaused = timerState === 'paused';
  const isRunning = timerState === 'running';

  // Handle reset timer confirmation
  const handleResetTimer = (newTimeLimit: number) => {
    onResetTimer(newTimeLimit);
    setIsResetModalOpen(false);
  };

  // Get status badge content
  const getStatusBadge = () => {
    if (!isQuestionActive) {
      return { text: 'No Active Question', color: 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]' };
    }
    if (isExpired) {
      return { text: 'Time Expired', color: 'bg-error/10 text-error' };
    }
    if (isPaused) {
      return { text: 'Timer Paused', color: 'bg-warning/10 text-warning' };
    }
    if (isWarning) {
      return { text: 'Time Running Low', color: 'bg-warning/10 text-warning' };
    }
    return { text: 'Timer Running', color: 'bg-success/10 text-success' };
  };

  const statusBadge = getStatusBadge();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="bg-primary/5 border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
                Timer Control
              </h2>
              <p className="text-caption text-[var(--text-muted)]">
                Manage question countdown
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <motion.div
            key={statusBadge.text}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`px-3 py-1.5 rounded-full text-body-sm font-medium ${statusBadge.color}`}
          >
            {statusBadge.text}
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          {/* No Active Question State */}
          {!isQuestionActive && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-8"
            >
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[var(--text-muted)]/10 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-[var(--text-muted)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-body text-[var(--text-secondary)]">
                Timer will appear when a question is active
              </p>
            </motion.div>
          )}

          {/* Active Question State */}
          {isQuestionActive && (
            <motion.div
              key="active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              {/* Circular Timer */}
              <div className="mb-6">
                <CircularProgress
                  progress={progress}
                  remainingSeconds={remainingSeconds}
                  isWarning={isWarning}
                  isExpired={isExpired}
                  isPaused={isPaused}
                />
              </div>

              {/* Time Info */}
              <div className="flex items-center gap-4 mb-6">
                <div className="neu-pressed rounded-lg px-4 py-2 text-center">
                  <p className="text-caption text-[var(--text-muted)]">Remaining</p>
                  <p className="text-h3 font-bold text-[var(--text-primary)]">
                    {remainingSeconds}s
                  </p>
                </div>
                <div className="neu-pressed rounded-lg px-4 py-2 text-center">
                  <p className="text-caption text-[var(--text-muted)]">Total</p>
                  <p className="text-h3 font-bold text-[var(--text-primary)]">
                    {totalTimeLimit}s
                  </p>
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                {/* Pause Button - Only show when running */}
                {isRunning && (
                  <Button
                    variant="secondary"
                    onClick={onPauseTimer}
                    disabled={isDisabled || isExpired}
                    leftIcon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    }
                  >
                    Pause Timer
                  </Button>
                )}

                {/* Resume Button - Only show when paused */}
                {isPaused && (
                  <Button
                    variant="primary"
                    onClick={onResumeTimer}
                    disabled={isDisabled}
                    leftIcon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    }
                  >
                    Resume Timer
                  </Button>
                )}

                {/* Reset Button - Always available during active question */}
                <Button
                  variant="outline"
                  onClick={() => setIsResetModalOpen(true)}
                  disabled={isDisabled}
                  leftIcon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  }
                >
                  Reset Timer
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Reset Timer Modal */}
      <ResetTimerModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleResetTimer}
        currentTimeLimit={totalTimeLimit}
      />
    </motion.div>
  );
}

export default TimerControlCard;
