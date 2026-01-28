/**
 * Latency Metrics Card Component
 * 
 * Displays comprehensive latency metrics:
 * - Min, Max, Avg latency
 * - P50, P95, P99 percentiles
 * - Color-coded thresholds (green < 50ms, yellow < 100ms, red > 100ms)
 * 
 * Requirements: 15.2
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { LoadTestStats } from '@/lib/load-tester';

/**
 * Props for LatencyMetricsCard
 */
interface LatencyMetricsCardProps {
  /** Current statistics */
  stats: LoadTestStats | null;
  /** Whether the test is running */
  isRunning: boolean;
}

/**
 * Get color class based on latency threshold
 * Green < 50ms, Yellow < 100ms, Red > 100ms
 */
function getLatencyColor(latencyMs: number | null): string {
  if (latencyMs === null) return 'text-[var(--text-muted)]';
  if (latencyMs < 50) return 'text-success';
  if (latencyMs < 100) return 'text-warning';
  return 'text-error';
}

/**
 * Get background color class based on latency threshold
 */
function getLatencyBgColor(latencyMs: number | null): string {
  if (latencyMs === null) return 'bg-[var(--neu-surface)]';
  if (latencyMs < 50) return 'bg-success/10';
  if (latencyMs < 100) return 'bg-warning/10';
  return 'bg-error/10';
}

/**
 * Get status label based on latency
 */
function getLatencyStatus(latencyMs: number | null): string {
  if (latencyMs === null) return 'No data';
  if (latencyMs < 50) return 'Excellent';
  if (latencyMs < 100) return 'Good';
  if (latencyMs < 200) return 'Fair';
  return 'Poor';
}

/**
 * Single metric display component
 */
function MetricItem({
  label,
  value,
  unit = 'ms',
  delay = 0,
  showStatus = false,
}: {
  label: string;
  value: number | null;
  unit?: string;
  delay?: number;
  showStatus?: boolean;
}) {
  const colorClass = getLatencyColor(value);
  const bgColorClass = getLatencyBgColor(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.2 }}
      className={cn(
        'rounded-lg p-4 text-center transition-colors duration-fast',
        bgColorClass
      )}
    >
      <p className="text-caption text-[var(--text-muted)] mb-1">{label}</p>
      <p className={cn('text-h2 font-display font-bold', colorClass)}>
        {value !== null ? value : '-'}
        {value !== null && (
          <span className="text-body-sm font-normal ml-1">{unit}</span>
        )}
      </p>
      {showStatus && value !== null && (
        <p className={cn('text-caption mt-1', colorClass)}>
          {getLatencyStatus(value)}
        </p>
      )}
    </motion.div>
  );
}

/**
 * Threshold legend component
 */
function ThresholdLegend() {
  return (
    <div className="flex items-center justify-center gap-4 text-caption">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-success" />
        <span className="text-[var(--text-muted)]">&lt; 50ms</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-warning" />
        <span className="text-[var(--text-muted)]">50-100ms</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-error" />
        <span className="text-[var(--text-muted)]">&gt; 100ms</span>
      </div>
    </div>
  );
}

/**
 * Latency Metrics Card Component
 */
export function LatencyMetricsCard({ stats, isRunning }: LatencyMetricsCardProps) {
  const hasData = stats?.averageLatencyMs !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-info"
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
              Latency Metrics
            </h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              Response time analysis
            </p>
          </div>
        </div>
        {isRunning && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-body-sm text-success">Live</span>
          </div>
        )}
      </div>

      {hasData ? (
        <>
          {/* Basic Metrics */}
          <div className="mb-6">
            <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-3">
              Basic Statistics
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <MetricItem
                label="Minimum"
                value={stats?.minLatencyMs ?? null}
                delay={0}
              />
              <MetricItem
                label="Average"
                value={stats?.averageLatencyMs ?? null}
                delay={0.05}
                showStatus
              />
              <MetricItem
                label="Maximum"
                value={stats?.maxLatencyMs ?? null}
                delay={0.1}
              />
            </div>
          </div>

          {/* Percentiles */}
          <div className="mb-6">
            <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-3">
              Percentiles
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <MetricItem
                label="P50 (Median)"
                value={stats?.percentiles.p50 ?? null}
                delay={0.15}
              />
              <MetricItem
                label="P95"
                value={stats?.percentiles.p95 ?? null}
                delay={0.2}
              />
              <MetricItem
                label="P99"
                value={stats?.percentiles.p99 ?? null}
                delay={0.25}
              />
            </div>
          </div>

          {/* Threshold Legend */}
          <ThresholdLegend />

          {/* Sample Count */}
          <div className="mt-4 pt-4 border-t border-[var(--neu-shadow-dark)]/10">
            <div className="flex items-center justify-between text-body-sm">
              <span className="text-[var(--text-muted)]">Total Samples</span>
              <span className="font-medium text-[var(--text-primary)]">
                {stats?.totalAnswersSubmitted ?? 0}
              </span>
            </div>
          </div>
        </>
      ) : (
        /* Empty State */
        <div className="py-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--neu-surface)] neu-pressed flex items-center justify-center">
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
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <p className="text-body text-[var(--text-muted)] mb-2">
            No latency data yet
          </p>
          <p className="text-body-sm text-[var(--text-muted)]">
            Start a load test and submit answers to see latency metrics
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default LatencyMetricsCard;
