/**
 * Load Testing Card Component
 * 
 * Provides controls to simulate concurrent participants:
 * - Input for number of participants (100-1000)
 * - Input for target session join code
 * - Start/Stop buttons
 * - Progress indicator
 * - Status display
 * 
 * Requirements: 15.1
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { LoadTestStatus, LoadTestStats } from '@/lib/load-tester';

/**
 * Props for LoadTestingCard
 */
interface LoadTestingCardProps {
  /** Current load test status */
  status: LoadTestStatus;
  /** Current statistics */
  stats: LoadTestStats | null;
  /** Callback when starting the test */
  onStart: (config: { joinCode: string; participantCount: number; simulateAnswers: boolean }) => void;
  /** Callback when stopping the test */
  onStop: () => void;
  /** Whether controls are disabled */
  isDisabled?: boolean;
  /** Error message to display */
  error?: string | null;
}

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: LoadTestStatus }) {
  const statusConfig: Record<LoadTestStatus, { label: string; color: string; bgColor: string }> = {
    idle: { label: 'Idle', color: 'text-[var(--text-muted)]', bgColor: 'bg-[var(--neu-surface)]' },
    starting: { label: 'Starting...', color: 'text-warning', bgColor: 'bg-warning/10' },
    running: { label: 'Running', color: 'text-success', bgColor: 'bg-success/10' },
    stopping: { label: 'Stopping...', color: 'text-warning', bgColor: 'bg-warning/10' },
    stopped: { label: 'Stopped', color: 'text-[var(--text-secondary)]', bgColor: 'bg-[var(--neu-surface)]' },
    error: { label: 'Error', color: 'text-error', bgColor: 'bg-error/10' },
  };

  const config = statusConfig[status];

  return (
    <motion.span
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1 rounded-full text-body-sm font-medium',
        config.bgColor,
        config.color
      )}
    >
      {(status === 'running' || status === 'starting' || status === 'stopping') && (
        <span className="relative flex h-2 w-2">
          <span className={cn(
            'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
            status === 'running' ? 'bg-success' : 'bg-warning'
          )} />
          <span className={cn(
            'relative inline-flex rounded-full h-2 w-2',
            status === 'running' ? 'bg-success' : 'bg-warning'
          )} />
        </span>
      )}
      {config.label}
    </motion.span>
  );
}

/**
 * Progress bar component
 */
function ProgressBar({ 
  current, 
  total, 
  label 
}: { 
  current: number; 
  total: number; 
  label: string;
}) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-body-sm">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="font-medium text-[var(--text-primary)]">
          {current} / {total} ({percentage}%)
        </span>
      </div>
      <div className="h-3 rounded-full neu-pressed overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full"
        />
      </div>
    </div>
  );
}

/**
 * Load Testing Card Component
 */
export function LoadTestingCard({
  status,
  stats,
  onStart,
  onStop,
  isDisabled = false,
  error,
}: LoadTestingCardProps) {
  const [joinCode, setJoinCode] = React.useState('');
  const [participantCount, setParticipantCount] = React.useState(100);
  const [simulateAnswers, setSimulateAnswers] = React.useState(true);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const isRunning = status === 'running' || status === 'starting' || status === 'stopping';
  const canStart = status === 'idle' || status === 'stopped' || status === 'error';

  /**
   * Handle form submission
   */
  const handleStart = () => {
    // Validate inputs
    if (!joinCode || joinCode.length !== 6) {
      setValidationError('Join code must be exactly 6 characters');
      return;
    }

    if (participantCount < 1 || participantCount > 1000) {
      setValidationError('Participant count must be between 1 and 1000');
      return;
    }

    setValidationError(null);
    onStart({ joinCode: joinCode.toUpperCase(), participantCount, simulateAnswers });
  };

  /**
   * Handle join code input
   */
  const handleJoinCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setJoinCode(value);
    if (validationError) setValidationError(null);
  };

  /**
   * Handle participant count input
   */
  const handleParticipantCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setParticipantCount(Math.min(1000, Math.max(1, value)));
    }
    if (validationError) setValidationError(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
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
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
              Load Testing
            </h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              Simulate concurrent participants
            </p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Configuration Form */}
      <div className="space-y-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Join Code Input */}
          <Input
            label="Session Join Code"
            placeholder="ABC123"
            value={joinCode}
            onChange={handleJoinCodeChange}
            disabled={isRunning || isDisabled}
            maxLength={6}
            className="font-mono uppercase tracking-wider"
            helperText="6-character code from an active session"
          />

          {/* Participant Count Input */}
          <Input
            label="Number of Participants"
            type="number"
            min={1}
            max={1000}
            value={participantCount}
            onChange={handleParticipantCountChange}
            disabled={isRunning || isDisabled}
            helperText="Between 1 and 1000 participants"
          />
        </div>

        {/* Simulate Answers Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={simulateAnswers}
            onClick={() => setSimulateAnswers(!simulateAnswers)}
            disabled={isRunning || isDisabled}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-fast',
              simulateAnswers ? 'bg-primary' : 'bg-[var(--neu-surface)] neu-pressed',
              (isRunning || isDisabled) && 'opacity-50 cursor-not-allowed'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-fast',
                simulateAnswers ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
          <label className="text-body-sm text-[var(--text-primary)]">
            Simulate answer submissions
          </label>
        </div>
      </div>

      {/* Error Display */}
      <AnimatePresence>
        {(validationError || error) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 p-3 rounded-md bg-error/10 border border-error/20"
          >
            <p className="text-body-sm text-error">
              {validationError || error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Section (when running) */}
      <AnimatePresence>
        {isRunning && stats && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 space-y-4"
          >
            <ProgressBar
              current={stats.successfulJoins}
              total={stats.totalParticipants}
              label="Participants Joined"
            />
            <ProgressBar
              current={stats.connectedCount}
              total={stats.totalParticipants}
              label="WebSocket Connections"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      <div className="flex gap-3">
        {canStart ? (
          <Button
            variant="primary"
            size="lg"
            onClick={handleStart}
            disabled={isDisabled}
            leftIcon={
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
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
            Start Load Test
          </Button>
        ) : (
          <Button
            variant="danger"
            size="lg"
            onClick={onStop}
            disabled={status === 'stopping'}
            isLoading={status === 'stopping'}
            leftIcon={
              status !== 'stopping' ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                  />
                </svg>
              ) : undefined
            }
          >
            {status === 'stopping' ? 'Stopping...' : 'Stop Test'}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

export default LoadTestingCard;
