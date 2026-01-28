/**
 * Thundering Herd Simulation Page
 * 
 * Provides tools to simulate thundering herd scenarios:
 * - Trigger simultaneous answer submissions from all connected participants
 * - Display burst statistics and history
 * - Monitor dropped connections
 * 
 * Requirements: 15.4
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { StatsDisplay } from '../components';
import { DynamicThunderingHerdCard, DynamicLoadTestingCard } from '@/lib/dynamic-imports';
import { getLoadTester } from '@/lib/load-tester-singleton';
import type { LoadTestStatus, LoadTestStats, ThunderingHerdStats } from '@/lib/load-tester';

/**
 * Burst history entry
 */
interface BurstHistoryEntry {
  id: number;
  stats: ThunderingHerdStats;
  timestamp: number;
}

/**
 * Thundering Herd Page Component
 */
export default function ThunderingHerdPage() {
  // Load tester instance - use singleton to share state across tester pages
  const loadTesterRef = React.useRef(getLoadTester());

  // State
  const [status, setStatus] = React.useState<LoadTestStatus>('idle');
  const [stats, setStats] = React.useState<LoadTestStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [burstError, setBurstError] = React.useState<string | null>(null);
  const [isBursting, setIsBursting] = React.useState(false);
  const [lastBurstStats, setLastBurstStats] = React.useState<ThunderingHerdStats | null>(null);
  const [burstHistory, setBurstHistory] = React.useState<BurstHistoryEntry[]>([]);
  const [currentQuestionId, setCurrentQuestionId] = React.useState<string | null>(null);
  const burstIdRef = React.useRef(0);

  // Initialize load tester callbacks and sync state
  React.useEffect(() => {
    const loadTester = loadTesterRef.current;

    // Sync initial state from singleton
    setStatus(loadTester.getStatus());
    setStats(loadTester.getStats());

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
      onQuestionReceived: (questionId) => {
        setCurrentQuestionId(questionId);
      },
    });

    // Don't stop on unmount - singleton persists across pages
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
    setCurrentQuestionId(null);

    try {
      await loadTesterRef.current.start({
        joinCode: config.joinCode,
        participantCount: config.participantCount,
        simulateAnswers: false, // Disable auto-answers for thundering herd testing
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

  /**
   * Handle triggering the thundering herd burst
   */
  const handleTriggerBurst = React.useCallback(async () => {
    if (!loadTesterRef.current) return;

    setIsBursting(true);
    setBurstError(null);

    try {
      const burstStats = await loadTesterRef.current.thunderingHerd(
        currentQuestionId || undefined,
        undefined,
        15000 // 15 second timeout
      );

      setLastBurstStats(burstStats);

      // Add to history
      burstIdRef.current += 1;
      setBurstHistory(prev => [
        { id: burstIdRef.current, stats: burstStats, timestamp: Date.now() },
        ...prev.slice(0, 9), // Keep last 10 bursts
      ]);
    } catch (err) {
      setBurstError(err instanceof Error ? err.message : 'Failed to trigger burst');
    } finally {
      setIsBursting(false);
    }
  }, [currentQuestionId]);

  const isRunning = status === 'running' || status === 'starting' || status === 'stopping';
  const connectedCount = stats?.connectedCount || 0;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <h1 className="text-h1 font-bold text-[var(--text-primary)]">
          Thundering Herd Simulation
        </h1>
        <p className="text-body-lg text-[var(--text-secondary)]">
          Test server performance under extreme concurrent load with 500+ simultaneous submissions.
        </p>
      </motion.div>

      {/* Warning Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="neu-raised rounded-lg p-4 border-l-4 border-warning"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center flex-shrink-0">
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
            <h3 className="text-body font-semibold text-[var(--text-primary)] mb-1">
              High Load Warning
            </h3>
            <p className="text-body-sm text-[var(--text-secondary)]">
              Thundering herd simulation creates extreme server load. Use this tool responsibly
              and ensure your server has adequate resources. Monitor server CPU and memory during tests.
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

        {/* Thundering Herd Card */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <DynamicThunderingHerdCard
            connectedCount={connectedCount}
            isBursting={isBursting}
            lastBurstStats={lastBurstStats}
            onTriggerBurst={handleTriggerBurst}
            isDisabled={!isRunning}
            error={burstError}
            currentQuestionId={currentQuestionId}
          />
        </motion.div>
      </div>

      {/* Connection Stats */}
      {isRunning && stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <StatsDisplay stats={stats} isRunning={isRunning} />
        </motion.div>
      )}

      {/* Burst History */}
      {burstHistory.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="neu-raised-lg rounded-lg p-6"
        >
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
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
                  Burst History
                </h2>
                <p className="text-body-sm text-[var(--text-muted)]">
                  Last {burstHistory.length} burst{burstHistory.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <button
              onClick={() => setBurstHistory([])}
              className="text-body-sm text-[var(--text-muted)] hover:text-error transition-colors duration-fast"
            >
              Clear History
            </button>
          </div>

          <div className="space-y-3">
            {burstHistory.map((entry, index) => (
              <BurstHistoryItem
                key={entry.id}
                stats={entry.stats}
                index={index}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Tips Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
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
                Connect First
              </p>
              <p className="text-caption text-[var(--text-muted)]">
                Start a load test to connect participants before triggering bursts.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-primary font-bold">2</span>
            </div>
            <div>
              <p className="text-body-sm font-medium text-[var(--text-primary)]">
                Active Question
              </p>
              <p className="text-caption text-[var(--text-muted)]">
                Start a quiz question in the Controller Panel for realistic testing.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-primary font-bold">3</span>
            </div>
            <div>
              <p className="text-body-sm font-medium text-[var(--text-primary)]">
                Monitor Server
              </p>
              <p className="text-caption text-[var(--text-muted)]">
                Watch server metrics during bursts to identify bottlenecks.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Burst history item component
 */
function BurstHistoryItem({
  stats,
  index,
}: {
  stats: ThunderingHerdStats;
  index: number;
}) {
  const timestamp = new Date(stats.burstStartTime).toLocaleTimeString();
  
  const getSuccessRateColor = (rate: number): string => {
    if (rate >= 95) return 'text-success';
    if (rate >= 80) return 'text-warning';
    return 'text-error';
  };

  const getResponseTimeColor = (timeMs: number | null): string => {
    if (timeMs === null) return 'text-[var(--text-muted)]';
    if (timeMs < 100) return 'text-success';
    if (timeMs < 200) return 'text-warning';
    return 'text-error';
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center justify-between p-4 rounded-lg bg-[var(--neu-surface)] neu-raised-sm"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-body font-bold text-primary">#{index + 1}</span>
        </div>
        <div>
          <p className="text-body font-medium text-[var(--text-primary)]">
            {stats.totalSubmissions} submissions
          </p>
          <p className="text-caption text-[var(--text-muted)]">{timestamp}</p>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <p className={`text-body font-bold ${getSuccessRateColor(stats.successRate)}`}>
            {stats.successRate}%
          </p>
          <p className="text-caption text-[var(--text-muted)]">success</p>
        </div>
        <div className="text-right">
          <p className={`text-body font-bold ${getResponseTimeColor(stats.avgResponseTimeMs)}`}>
            {stats.avgResponseTimeMs !== null ? `${stats.avgResponseTimeMs}ms` : '-'}
          </p>
          <p className="text-caption text-[var(--text-muted)]">avg time</p>
        </div>
        {stats.droppedConnections > 0 && (
          <div className="text-right">
            <p className="text-body font-bold text-error">
              {stats.droppedConnections}
            </p>
            <p className="text-caption text-[var(--text-muted)]">dropped</p>
          </div>
        )}
        <div className="text-right">
          <p className="text-body font-medium text-[var(--text-primary)]">
            {stats.burstDurationMs}ms
          </p>
          <p className="text-caption text-[var(--text-muted)]">duration</p>
        </div>
      </div>
    </motion.div>
  );
}
