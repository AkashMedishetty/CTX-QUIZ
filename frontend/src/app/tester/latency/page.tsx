/**
 * Latency Metrics Page - Tester Panel
 * 
 * Displays comprehensive latency metrics from load testing:
 * - Min, Max, Avg, P50, P95, P99 latency
 * - Real-time latency chart
 * - Color-coded thresholds
 * 
 * Requirements: 15.2
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { LatencyMetricsCard } from '../components';
import { DynamicLatencyChart, DynamicLoadTestingCard } from '@/lib/dynamic-imports';
import { type LoadTestStatus, type LoadTestStats } from '@/lib/load-tester';
import { getLoadTester } from '@/lib/load-tester-singleton';

/**
 * Latency Metrics Page Component
 */
export default function LatencyPage() {
  // Load tester instance (singleton)
  const loadTesterRef = React.useRef(getLoadTester());

  // State
  const [status, setStatus] = React.useState<LoadTestStatus>('idle');
  const [stats, setStats] = React.useState<LoadTestStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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
          Latency Metrics
        </h1>
        <p className="text-body-lg text-[var(--text-secondary)]">
          Monitor WebSocket response times and identify performance bottlenecks.
        </p>
      </motion.div>

      {/* Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="neu-raised rounded-lg p-4 border-l-4 border-info"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-info/10 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-4 h-4 text-info"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-body font-semibold text-[var(--text-primary)] mb-1">
              Understanding Latency Metrics
            </h3>
            <p className="text-body-sm text-[var(--text-secondary)]">
              Latency is measured as the round-trip time for answer submissions. 
              Target: &lt;50ms (excellent), &lt;100ms (good), &gt;100ms (needs attention).
              P95/P99 percentiles show worst-case performance for most users.
            </p>
          </div>
        </div>
      </motion.div>

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

        {/* Latency Metrics Card - Right Column */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="xl:col-span-2"
        >
          <LatencyMetricsCard stats={stats} isRunning={isRunning} />
        </motion.div>
      </div>

      {/* Latency Chart - Full Width */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <DynamicLatencyChart
          latencyHistory={stats?.latencyHistory ?? []}
          isRunning={isRunning}
        />
      </motion.div>

      {/* Performance Tips */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="neu-raised rounded-lg p-6"
      >
        <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-4">
          Performance Guidelines
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
                Optimal performance. Users experience instant feedback.
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
                Acceptable performance. Monitor for degradation.
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
                Noticeable delay. Check server resources and network.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
