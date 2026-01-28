/**
 * Tester Panel Page - Load Testing Interface
 * 
 * Main page for the Tester Panel providing:
 * - Load testing controls to simulate 100-1000 participants
 * - Real-time statistics display
 * - WebSocket connection management
 * - Answer submission simulation
 * 
 * Requirements: 15.1
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { StatsDisplay } from './components';
import { DynamicLoadTestingCard } from '@/lib/dynamic-imports';
import { type LoadTestStatus, type LoadTestStats } from '@/lib/load-tester';
import { getLoadTester } from '@/lib/load-tester-singleton';

/**
 * Tester Panel Page Component
 */
export default function TesterPanelPage() {
  // Load tester instance (singleton)
  const loadTesterRef = React.useRef(getLoadTester());

  // State
  const [status, setStatus] = React.useState<LoadTestStatus>('idle');
  const [stats, setStats] = React.useState<LoadTestStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lastQuestionInfo, setLastQuestionInfo] = React.useState<{
    questionId: string;
    questionIndex: number;
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
      onQuestionReceived: (questionId, questionIndex) => {
        setLastQuestionInfo({ questionId, questionIndex });
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
    setLastQuestionInfo(null);

    try {
      await loadTesterRef.current.start({
        joinCode: config.joinCode,
        participantCount: config.participantCount,
        simulateAnswers: config.simulateAnswers,
        joinDelayMs: 50, // 50ms between joins
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
          Load Testing
        </h1>
        <p className="text-body-lg text-[var(--text-secondary)]">
          Simulate concurrent participants to test system performance and scalability.
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
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-body font-semibold text-[var(--text-primary)] mb-1">
              How it works
            </h3>
            <p className="text-body-sm text-[var(--text-secondary)]">
              This tool creates multiple simulated participants that join a quiz session via WebSocket.
              Each participant will automatically submit random answers when questions are received.
              Use this to test server performance under load.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Load Testing Card */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <DynamicLoadTestingCard
            status={status}
            stats={stats}
            onStart={handleStart}
            onStop={handleStop}
            error={error}
          />
        </motion.div>

        {/* Stats Display */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <StatsDisplay stats={stats} isRunning={isRunning} />
        </motion.div>
      </div>

      {/* Question Activity Indicator */}
      {lastQuestionInfo && isRunning && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="neu-raised rounded-lg p-4"
        >
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
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-body font-medium text-[var(--text-primary)]">
                Question {lastQuestionInfo.questionIndex + 1} Active
              </p>
              <p className="text-body-sm text-[var(--text-muted)]">
                Simulated participants are submitting answers...
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Tips Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="neu-raised rounded-lg p-6"
      >
        <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-4">
          Testing Tips
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-primary font-bold">1</span>
            </div>
            <div>
              <p className="text-body-sm font-medium text-[var(--text-primary)]">
                Start Small
              </p>
              <p className="text-caption text-[var(--text-muted)]">
                Begin with 100 participants and gradually increase to identify bottlenecks.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-primary font-bold">2</span>
            </div>
            <div>
              <p className="text-body-sm font-medium text-[var(--text-primary)]">
                Monitor Server
              </p>
              <p className="text-caption text-[var(--text-muted)]">
                Watch server CPU and memory usage during tests for performance insights.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-primary font-bold">3</span>
            </div>
            <div>
              <p className="text-body-sm font-medium text-[var(--text-primary)]">
                Check Latency
              </p>
              <p className="text-caption text-[var(--text-muted)]">
                Response latency should stay under 100ms for optimal user experience.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
