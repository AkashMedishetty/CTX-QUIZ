/**
 * Stats Display Component
 * 
 * Displays load testing statistics:
 * - Number of connected participants
 * - Number of successful joins
 * - Number of failed connections
 * - Answers submitted count
 * - Latency metrics
 * 
 * Requirements: 15.1
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { LoadTestStats } from '@/lib/load-tester';

/**
 * Props for StatsDisplay
 */
interface StatsDisplayProps {
  /** Current statistics */
  stats: LoadTestStats | null;
  /** Whether the test is running */
  isRunning: boolean;
}

/**
 * Stat card component
 */
function StatCard({
  label,
  value,
  subValue,
  icon,
  color = 'primary',
  delay = 0,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  icon: React.ReactNode;
  color?: 'primary' | 'success' | 'error' | 'warning' | 'info';
  delay?: number;
}) {
  const colorClasses = {
    primary: 'text-primary bg-primary/10',
    success: 'text-success bg-success/10',
    error: 'text-error bg-error/10',
    warning: 'text-warning bg-warning/10',
    info: 'text-info bg-info/10',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="neu-raised rounded-lg p-4"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-caption text-[var(--text-muted)] mb-1">{label}</p>
          <p className="text-h2 font-display font-bold text-[var(--text-primary)]">
            {value}
          </p>
          {subValue && (
            <p className="text-body-sm text-[var(--text-secondary)] mt-1">
              {subValue}
            </p>
          )}
        </div>
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', colorClasses[color])}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Latency metrics card
 */
function LatencyCard({
  stats,
  delay = 0,
}: {
  stats: LoadTestStats | null;
  delay?: number;
}) {
  const hasLatency = stats?.averageLatencyMs !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="neu-raised rounded-lg p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center">
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
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <p className="text-body-sm font-medium text-[var(--text-primary)]">
          Response Latency
        </p>
      </div>

      {hasLatency ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-caption text-[var(--text-muted)]">Min</p>
            <p className="text-body-lg font-display font-semibold text-success">
              {stats?.minLatencyMs ?? '-'}ms
            </p>
          </div>
          <div className="text-center">
            <p className="text-caption text-[var(--text-muted)]">Avg</p>
            <p className="text-body-lg font-display font-semibold text-primary">
              {stats?.averageLatencyMs ?? '-'}ms
            </p>
          </div>
          <div className="text-center">
            <p className="text-caption text-[var(--text-muted)]">Max</p>
            <p className="text-body-lg font-display font-semibold text-warning">
              {stats?.maxLatencyMs ?? '-'}ms
            </p>
          </div>
        </div>
      ) : (
        <p className="text-body-sm text-[var(--text-muted)] text-center py-2">
          No latency data yet
        </p>
      )}
    </motion.div>
  );
}

/**
 * Elapsed time display
 */
function ElapsedTime({ elapsedMs }: { elapsedMs: number }) {
  const seconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return (
    <span className="font-mono">
      {minutes.toString().padStart(2, '0')}:{remainingSeconds.toString().padStart(2, '0')}
    </span>
  );
}

/**
 * Stats Display Component
 */
export function StatsDisplay({ stats, isRunning }: StatsDisplayProps) {
  // Calculate success rate
  const successRate = stats && stats.totalParticipants > 0
    ? Math.round((stats.successfulJoins / stats.totalParticipants) * 100)
    : 0;

  // Calculate connection rate
  const connectionRate = stats && stats.successfulJoins > 0
    ? Math.round((stats.connectedCount / stats.successfulJoins) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-h3 font-semibold text-[var(--text-primary)]">
          Statistics
        </h3>
        {isRunning && stats && (
          <div className="flex items-center gap-2 text-body-sm text-[var(--text-secondary)]">
            <svg
              className="w-4 h-4 animate-pulse text-success"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="8" />
            </svg>
            <span>Running for </span>
            <ElapsedTime elapsedMs={stats.elapsedTimeMs} />
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Connected"
          value={stats?.connectedCount ?? 0}
          subValue={`${connectionRate}% of joined`}
          color="success"
          delay={0}
          icon={
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
                d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z"
              />
            </svg>
          }
        />

        <StatCard
          label="Successful Joins"
          value={stats?.successfulJoins ?? 0}
          subValue={`${successRate}% success rate`}
          color="primary"
          delay={0.05}
          icon={
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
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />

        <StatCard
          label="Failed Joins"
          value={stats?.failedJoins ?? 0}
          subValue={stats?.failedJoins ? 'Check server logs' : 'No failures'}
          color="error"
          delay={0.1}
          icon={
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
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />

        <StatCard
          label="Answers Submitted"
          value={stats?.totalAnswersSubmitted ?? 0}
          subValue="Total submissions"
          color="info"
          delay={0.15}
          icon={
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
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
          }
        />
      </div>

      {/* Latency Card */}
      <LatencyCard stats={stats} delay={0.2} />

      {/* Additional Info */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="neu-raised rounded-lg p-4"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-caption text-[var(--text-muted)]">Total Target</p>
              <p className="text-body-lg font-semibold text-[var(--text-primary)]">
                {stats.totalParticipants}
              </p>
            </div>
            <div>
              <p className="text-caption text-[var(--text-muted)]">Pending</p>
              <p className="text-body-lg font-semibold text-warning">
                {stats.pendingJoins}
              </p>
            </div>
            <div>
              <p className="text-caption text-[var(--text-muted)]">Disconnected</p>
              <p className="text-body-lg font-semibold text-[var(--text-secondary)]">
                {stats.disconnectedCount}
              </p>
            </div>
            <div>
              <p className="text-caption text-[var(--text-muted)]">Elapsed Time</p>
              <p className="text-body-lg font-semibold font-mono text-[var(--text-primary)]">
                <ElapsedTime elapsedMs={stats.elapsedTimeMs} />
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {!stats && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="neu-pressed rounded-lg p-8 text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--neu-surface)] flex items-center justify-center">
            <svg
              className="w-8 h-8 text-[var(--text-muted)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <p className="text-body text-[var(--text-muted)]">
            Start a load test to see statistics
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

export default StatsDisplay;
