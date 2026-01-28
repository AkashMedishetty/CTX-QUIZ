/**
 * Timer Sync Page - Tester Panel
 * 
 * Displays timer synchronization accuracy metrics:
 * - Client-server time drift analysis
 * - Percentage of participants within acceptable drift
 * - Real-time drift chart
 * - Drift distribution visualization
 * 
 * Requirements: 15.3
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { TimerSyncCard } from '../components';
import { DynamicDriftChart, DynamicLoadTestingCard } from '@/lib/dynamic-imports';
import { type LoadTestStatus, type LoadTestStats } from '@/lib/load-tester';
import { getLoadTester } from '@/lib/load-tester-singleton';

/**
 * Timer Sync Page Component
 */
export default function TimerSyncPage() {
  // Load tester instance (singleton)
  const loadTesterRef = React.useRef(getLoadTester());

  // State
  const [status, setStatus] = React.useState<LoadTestStatus>('idle');
  const [stats, setStats] = React.useState<LoadTestStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lastTimerTick, setLastTimerTick] = React.useState<{
    remainingSeconds: number;
    serverTime: number;
  } | null>(null);

  // Initialize load tester callbacks
  React.useEffect(() => {
    const loadTester = loadTesterRef.current;

    // Set up callbacks
    loadTester.setCallbacks({
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
        if (newStatus === 'idle' || newStatus === 'stopped') {
          setError(null);
        }
      },
      onStatsUpdate: (newStats) => {
        setStats(newStats);
      },
      onError: (errorMessage) => {
        setError(errorMessage);
      },
      onTimerTick: (remainingSeconds, serverTime) => {
        setLastTimerTick({ remainingSeconds, serverTime });
      },
    });

    // Sync initial state from existing load tester
    setStatus(loadTester.getStatus());
    if (loadTester.getStatus() === 'running') {
      setStats(loadTester.getStats());
    }

    // Cleanup callbacks on unmount (but don't stop the load tester)
    return () => {
      // Don't stop - let it continue running for other pages
    };
  }, []);

  /**
   * Handle starting the load test
   */
  const handleStart = React.useCallback(async (config: {
    joinCode: string;
    participantCount: number;
    simulateAnswers: boolean;
  }) => {
    if (!loadTesterRef.current) return;

    setError(null);
    setLastTimerTick(null);

    try {
      await loadTesterRef.current.start({
        joinCode: config.joinCode,
        participantCount: config.participantCount,
        simulateAnswers: config.simulateAnswers,
        joinDelayMs: 50,
        answerDelayMinMs: 500,
        answerDelayMaxMs: 5000,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start load test');
    }
  }, []);

  /**
   * Handle stopping the load test
   */
  const handleStop = React.useCallback(async () => {
    if (!loadTesterRef.current) return;

    try {
      await loadTesterRef.current.stop();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop load test');
    }
  }, []);

  const isRunning = status === 'running' || status === 'starting' || status === 'stopping';

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <h1 className="text-h1 font-bold text-[var(--text-primary)]">
          Timer Sync Accuracy
        </h1>
        <p className="text-body-lg text-[var(--text-secondary)]">
          Measure client-server time synchronization across all participants.
        </p>
      </motion.div>

      {/* Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="neu-raised rounded-lg p-4 border-l-4 border-primary"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-primary"
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
            <h3 className="text-body font-semibold text-[var(--text-primary)] mb-1">
              Understanding Timer Sync
            </h3>
            <p className="text-body-sm text-[var(--text-secondary)]">
              Timer drift is calculated as <code className="font-mono bg-[var(--neu-surface)] px-1 rounded">serverTime - clientTime</code>.
              Positive drift means the client clock is behind the server.
              For fair quiz timing, drift should stay within ±50ms for 95%+ of participants.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Timer Tick Indicator */}
      {lastTimerTick && isRunning && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="neu-raised rounded-lg p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-success animate-pulse"
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
                <p className="text-body font-medium text-[var(--text-primary)]">
                  Receiving Timer Ticks
                </p>
                <p className="text-body-sm text-[var(--text-muted)]">
                  {lastTimerTick.remainingSeconds}s remaining
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-caption text-[var(--text-muted)]">Server Time</p>
              <p className="text-body-sm font-mono text-[var(--text-secondary)]">
                {new Date(lastTimerTick.serverTime).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Load Testing Card - Left Column */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="xl:col-span-1"
        >
          <DynamicLoadTestingCard
            status={status}
            stats={stats}
            onStart={handleStart}
            onStop={handleStop}
            error={error}
          />
        </motion.div>

        {/* Timer Sync Card - Right Column */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="xl:col-span-2"
        >
          <TimerSyncCard
            timerSync={stats?.timerSync ?? null}
            isRunning={isRunning}
          />
        </motion.div>
      </div>

      {/* Drift Chart - Full Width */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <DynamicDriftChart
          driftHistory={stats?.timerSync.driftHistory ?? []}
          isRunning={isRunning}
        />
      </motion.div>

      {/* Sync Guidelines */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="neu-raised rounded-lg p-6"
      >
        <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-4">
          Sync Quality Guidelines
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-4 h-4 text-success"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <p className="text-body-sm font-medium text-[var(--text-primary)]">
                Excellent (&lt;50ms)
              </p>
              <p className="text-caption text-[var(--text-muted)]">
                Perfect sync. All participants see the same timer within human perception limits.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-4 h-4 text-warning"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <p className="text-body-sm font-medium text-[var(--text-primary)]">
                Good (50-100ms)
              </p>
              <p className="text-caption text-[var(--text-muted)]">
                Acceptable for most quiz scenarios. May affect FFI (Fastest Finger First) fairness.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-error/10 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-4 h-4 text-error"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <div>
              <p className="text-body-sm font-medium text-[var(--text-primary)]">
                Poor (&gt;100ms)
              </p>
              <p className="text-caption text-[var(--text-muted)]">
                Noticeable desync. Check network conditions and server load. May cause unfair timing.
              </p>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-6 pt-4 border-t border-[var(--neu-shadow-dark)]/10">
          <h4 className="text-body-sm font-medium text-[var(--text-secondary)] mb-3">
            Troubleshooting High Drift
          </h4>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-body-sm text-[var(--text-muted)]">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Check server CPU and memory usage
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Verify Redis pub/sub latency
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Monitor WebSocket connection quality
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Check for network congestion
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Ensure NTP sync on server
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Consider geographic distribution
            </li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
