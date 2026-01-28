/**
 * Timer Sync Card Component
 * 
 * Displays timer synchronization metrics:
 * - Average drift, min drift, max drift
 * - Percentage of participants within acceptable drift (< 50ms)
 * - Color-coded thresholds
 * - Drift percentiles (P50, P95, P99)
 * 
 * Requirements: 15.3
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { TimerSyncStats } from '@/lib/load-tester';

/**
 * Props for TimerSyncCard
 */
interface TimerSyncCardProps {
  /** Timer sync statistics */
  timerSync: TimerSyncStats | null;
  /** Whether the test is running */
  isRunning: boolean;
}

/**
 * Get color class based on drift threshold
 * Green < 50ms, Yellow < 100ms, Red > 100ms
 */
function getDriftColor(driftMs: number | null): string {
  if (driftMs === null) return 'text-[var(--text-muted)]';
  const absDrift = Math.abs(driftMs);
  if (absDrift < 50) return 'text-success';
  if (absDrift < 100) return 'text-warning';
  return 'text-error';
}

/**
 * Get background color class based on drift threshold
 */
function getDriftBgColor(driftMs: number | null): string {
  if (driftMs === null) return 'bg-[var(--neu-surface)]';
  const absDrift = Math.abs(driftMs);
  if (absDrift < 50) return 'bg-success/10';
  if (absDrift < 100) return 'bg-warning/10';
  return 'bg-error/10';
}

/**
 * Get status label based on drift
 */
function getDriftStatus(driftMs: number | null): string {
  if (driftMs === null) return 'No data';
  const absDrift = Math.abs(driftMs);
  if (absDrift < 50) return 'Excellent';
  if (absDrift < 100) return 'Good';
  if (absDrift < 200) return 'Fair';
  return 'Poor';
}

/**
 * Format drift value with sign
 */
function formatDrift(driftMs: number | null): string {
  if (driftMs === null) return '-';
  const sign = driftMs >= 0 ? '+' : '';
  return `${sign}${driftMs}`;
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
  showSign = false,
}: {
  label: string;
  value: number | null;
  unit?: string;
  delay?: number;
  showStatus?: boolean;
  showSign?: boolean;
}) {
  const colorClass = getDriftColor(value);
  const bgColorClass = getDriftBgColor(value);

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
        {showSign ? formatDrift(value) : (value !== null ? value : '-')}
        {value !== null && (
          <span className="text-body-sm font-normal ml-1">{unit}</span>
        )}
      </p>
      {showStatus && value !== null && (
        <p className={cn('text-caption mt-1', colorClass)}>
          {getDriftStatus(value)}
        </p>
      )}
    </motion.div>
  );
}

/**
 * Sync accuracy gauge component
 */
function SyncAccuracyGauge({
  percentage,
  withinThreshold,
  total,
}: {
  percentage: number;
  withinThreshold: number;
  total: number;
}) {
  const getGaugeColor = () => {
    if (percentage >= 95) return 'text-success';
    if (percentage >= 80) return 'text-warning';
    return 'text-error';
  };

  const getGaugeBgColor = () => {
    if (percentage >= 95) return 'bg-success';
    if (percentage >= 80) return 'bg-warning';
    return 'bg-error';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="neu-raised rounded-lg p-6 text-center"
    >
      <p className="text-body-sm font-medium text-[var(--text-secondary)] mb-4">
        Sync Accuracy
      </p>
      
      {/* Circular gauge */}
      <div className="relative w-32 h-32 mx-auto mb-4">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-[var(--neu-surface)]"
          />
          {/* Progress circle */}
          <motion.circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className={getGaugeBgColor()}
            strokeDasharray={`${percentage * 2.51} 251`}
            initial={{ strokeDasharray: '0 251' }}
            animate={{ strokeDasharray: `${percentage * 2.51} 251` }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-h2 font-display font-bold', getGaugeColor())}>
            {percentage}%
          </span>
        </div>
      </div>

      <p className="text-body-sm text-[var(--text-secondary)]">
        <span className={cn('font-semibold', getGaugeColor())}>{withinThreshold}</span>
        <span className="text-[var(--text-muted)]"> / {total} participants</span>
      </p>
      <p className="text-caption text-[var(--text-muted)] mt-1">
        within 50ms threshold
      </p>
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
 * Timer Sync Card Component
 */
export function TimerSyncCard({ timerSync, isRunning }: TimerSyncCardProps) {
  const hasData = timerSync && timerSync.totalWithDriftData > 0;

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
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
              Timer Sync Accuracy
            </h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              Client-server time drift analysis
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
          {/* Sync Accuracy Gauge */}
          <div className="mb-6">
            <SyncAccuracyGauge
              percentage={timerSync.withinThresholdPercentage}
              withinThreshold={timerSync.withinThresholdCount}
              total={timerSync.totalWithDriftData}
            />
          </div>

          {/* Drift Statistics */}
          <div className="mb-6">
            <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-3">
              Drift Statistics
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <MetricItem
                label="Min Drift"
                value={timerSync.minDriftMs}
                delay={0}
                showSign
              />
              <MetricItem
                label="Avg Drift"
                value={timerSync.averageDriftMs}
                delay={0.05}
                showSign
                showStatus
              />
              <MetricItem
                label="Max Drift"
                value={timerSync.maxDriftMs}
                delay={0.1}
                showSign
              />
            </div>
          </div>

          {/* Absolute Drift Percentiles */}
          <div className="mb-6">
            <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-3">
              Absolute Drift Percentiles
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <MetricItem
                label="P50 (Median)"
                value={timerSync.percentiles.p50}
                delay={0.15}
              />
              <MetricItem
                label="P95"
                value={timerSync.percentiles.p95}
                delay={0.2}
              />
              <MetricItem
                label="P99"
                value={timerSync.percentiles.p99}
                delay={0.25}
              />
            </div>
          </div>

          {/* Threshold Legend */}
          <ThresholdLegend />

          {/* Sample Count */}
          <div className="mt-4 pt-4 border-t border-[var(--neu-shadow-dark)]/10">
            <div className="flex items-center justify-between text-body-sm">
              <span className="text-[var(--text-muted)]">Total Measurements</span>
              <span className="font-medium text-[var(--text-primary)]">
                {timerSync.driftHistory.length}
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
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <p className="text-body text-[var(--text-muted)] mb-2">
            No sync data yet
          </p>
          <p className="text-body-sm text-[var(--text-muted)]">
            Start a load test and wait for timer ticks to measure sync accuracy
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default TimerSyncCard;
