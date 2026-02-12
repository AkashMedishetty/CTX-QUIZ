/**
 * Load Testing Card Component
 * 
 * Provides controls to simulate concurrent participants:
 * - Input for number of participants (100-1000)
 * - Input for target session join code
 * - Rate limit configuration (requests per second, burst limit, base delay)
 * - Start/Stop buttons with "Keep Connections" option
 * - Progress indicator
 * - Status display
 * 
 * Requirements: 1.4, 2.4, 15.1
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { LoadTestStatus, LoadTestStats, RateLimitConfig } from '@/lib/load-tester';
import { DEFAULT_RATE_LIMIT_CONFIG } from '@/lib/load-tester';
import { preserveConnections } from '@/lib/load-tester-singleton';

/**
 * Props for LoadTestingCard
 */
interface LoadTestingCardProps {
  /** Current load test status */
  status: LoadTestStatus;
  /** Current statistics */
  stats: LoadTestStats | null;
  /** Callback when starting the test */
  onStart: (config: { 
    joinCode: string; 
    participantCount: number; 
    simulateAnswers: boolean;
    rateLimitConfig?: RateLimitConfig;
  }) => void;
  /** Callback when stopping the test */
  onStop: (keepConnections?: boolean) => void;
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
  
  // Rate limit configuration state (Requirements: 1.4)
  const [requestsPerSecond, setRequestsPerSecond] = React.useState(DEFAULT_RATE_LIMIT_CONFIG.requestsPerSecond);
  const [burstLimit, setBurstLimit] = React.useState(DEFAULT_RATE_LIMIT_CONFIG.burstLimit);
  const [baseDelayMs, setBaseDelayMs] = React.useState(DEFAULT_RATE_LIMIT_CONFIG.baseDelayMs);
  const [showAdvancedConfig, setShowAdvancedConfig] = React.useState(false);
  
  // Keep connections toggle state (Requirements: 2.4)
  const [keepConnections, setKeepConnections] = React.useState(false);

  // Load saved config from localStorage on mount
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedConfig = localStorage.getItem('loadTestConfig');
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          if (config.joinCode) setJoinCode(config.joinCode);
          if (config.participantCount) setParticipantCount(config.participantCount);
          if (typeof config.simulateAnswers === 'boolean') setSimulateAnswers(config.simulateAnswers);
          // Load rate limit config (Requirements: 1.4)
          if (config.requestsPerSecond) setRequestsPerSecond(config.requestsPerSecond);
          if (config.burstLimit) setBurstLimit(config.burstLimit);
          if (config.baseDelayMs) setBaseDelayMs(config.baseDelayMs);
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, []);

  // Save config to localStorage when it changes
  React.useEffect(() => {
    if (typeof window !== 'undefined' && joinCode) {
      localStorage.setItem('loadTestConfig', JSON.stringify({
        joinCode,
        participantCount,
        simulateAnswers,
        requestsPerSecond,
        burstLimit,
        baseDelayMs,
      }));
    }
  }, [joinCode, participantCount, simulateAnswers, requestsPerSecond, burstLimit, baseDelayMs]);

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
    onStart({ 
      joinCode: joinCode.toUpperCase(), 
      participantCount, 
      simulateAnswers,
      rateLimitConfig: {
        requestsPerSecond,
        burstLimit,
        baseDelayMs,
        maxRetries: DEFAULT_RATE_LIMIT_CONFIG.maxRetries,
        backoffMultiplier: DEFAULT_RATE_LIMIT_CONFIG.backoffMultiplier,
      },
    });
  };

  /**
   * Handle stop with optional connection preservation
   * 
   * Requirements: 2.4
   */
  const handleStop = () => {
    if (keepConnections) {
      // Preserve connections before stopping (Requirements: 2.4)
      preserveConnections();
    }
    onStop(keepConnections);
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

        {/* Rate Limit Configuration Section (Requirements: 1.4) */}
        <div className="mt-4 pt-4 border-t border-[var(--neu-surface)]">
          <button
            type="button"
            onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
            disabled={isRunning || isDisabled}
            className={cn(
              'flex items-center gap-2 text-body-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors',
              (isRunning || isDisabled) && 'opacity-50 cursor-not-allowed'
            )}
          >
            <svg
              className={cn(
                'w-4 h-4 transition-transform duration-fast',
                showAdvancedConfig && 'rotate-90'
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            Rate Limit Configuration
          </button>

          <AnimatePresence>
            {showAdvancedConfig && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  {/* Requests Per Second */}
                  <Input
                    label="Requests/Second"
                    type="number"
                    min={1}
                    max={100}
                    value={requestsPerSecond}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      if (!isNaN(value)) {
                        setRequestsPerSecond(Math.min(100, Math.max(1, value)));
                      }
                    }}
                    disabled={isRunning || isDisabled}
                    helperText="Max requests per second (1-100)"
                  />

                  {/* Burst Limit */}
                  <Input
                    label="Burst Limit"
                    type="number"
                    min={1}
                    max={100}
                    value={burstLimit}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      if (!isNaN(value)) {
                        setBurstLimit(Math.min(100, Math.max(1, value)));
                      }
                    }}
                    disabled={isRunning || isDisabled}
                    helperText="Initial burst limit (1-100)"
                  />

                  {/* Base Delay */}
                  <Input
                    label="Base Delay (ms)"
                    type="number"
                    min={10}
                    max={1000}
                    value={baseDelayMs}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10);
                      if (!isNaN(value)) {
                        setBaseDelayMs(Math.min(1000, Math.max(10, value)));
                      }
                    }}
                    disabled={isRunning || isDisabled}
                    helperText="Delay between requests (10-1000ms)"
                  />
                </div>

                <p className="mt-3 text-caption text-[var(--text-muted)]">
                  These settings control how quickly participants join. Lower values may trigger server rate limits.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
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
      <div className="flex flex-col gap-4">
        {/* Keep Connections Toggle - Only shown when test is running (Requirements: 2.4) */}
        <AnimatePresence>
          {isRunning && status !== 'stopping' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 p-3 rounded-md bg-[var(--neu-surface)] neu-pressed"
            >
              <button
                type="button"
                role="switch"
                aria-checked={keepConnections}
                onClick={() => setKeepConnections(!keepConnections)}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-fast',
                  keepConnections ? 'bg-primary' : 'bg-[var(--neu-background)]'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-fast shadow-sm',
                    keepConnections ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
              <div className="flex-1">
                <label className="text-body-sm font-medium text-[var(--text-primary)]">
                  Keep connections alive
                </label>
                <p className="text-caption text-[var(--text-muted)]">
                  Preserve participant connections for use in other tests
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
              onClick={handleStop}
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
              {status === 'stopping' ? 'Stopping...' : keepConnections ? 'Stop & Keep Connections' : 'Stop Test'}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default LoadTestingCard;
