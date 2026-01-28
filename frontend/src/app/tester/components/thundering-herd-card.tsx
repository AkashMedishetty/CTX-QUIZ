/**
 * Thundering Herd Card Component
 * 
 * Provides controls to simulate thundering herd scenarios:
 * - Button to trigger simultaneous answer submissions from all connected participants
 * - Display burst statistics (total submissions, success rate, avg response time)
 * - Show dropped connections count
 * - Visual indicator during burst (loading state)
 * 
 * Requirements: 15.4
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ThunderingHerdStats } from '@/lib/load-tester';

/**
 * Props for ThunderingHerdCard
 */
interface ThunderingHerdCardProps {
  /** Number of currently connected participants */
  connectedCount: number;
  /** Whether a burst is currently in progress */
  isBursting: boolean;
  /** Last burst statistics */
  lastBurstStats: ThunderingHerdStats | null;
  /** Callback when triggering the burst */
  onTriggerBurst: () => void;
  /** Whether the trigger is disabled */
  isDisabled?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Current question ID (if any) */
  currentQuestionId?: string | null;
}

/**
 * Get color class based on success rate
 */
function getSuccessRateColor(rate: number): string {
  if (rate >= 95) return 'text-success';
  if (rate >= 80) return 'text-warning';
  return 'text-error';
}

/**
 * Get background color class based on success rate
 */
function getSuccessRateBgColor(rate: number): string {
  if (rate >= 95) return 'bg-success/10';
  if (rate >= 80) return 'bg-warning/10';
  return 'bg-error/10';
}

/**
 * Get color class based on response time
 */
function getResponseTimeColor(timeMs: number | null): string {
  if (timeMs === null) return 'text-[var(--text-muted)]';
  if (timeMs < 100) return 'text-success';
  if (timeMs < 200) return 'text-warning';
  return 'text-error';
}

/**
 * Single metric display component
 */
function MetricItem({
  label,
  value,
  unit = '',
  colorClass,
  delay = 0,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  colorClass?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.2 }}
      className="rounded-lg p-3 bg-[var(--neu-surface)] neu-pressed text-center"
    >
      <p className="text-caption text-[var(--text-muted)] mb-1">{label}</p>
      <p className={cn('text-h3 font-display font-bold', colorClass || 'text-[var(--text-primary)]')}>
        {value !== null ? value : '-'}
        {value !== null && unit && (
          <span className="text-body-sm font-normal ml-1">{unit}</span>
        )}
      </p>
    </motion.div>
  );
}

/**
 * Success rate gauge component
 */
function SuccessRateGauge({ rate }: { rate: number }) {
  const colorClass = getSuccessRateColor(rate);
  const bgColorClass = getSuccessRateBgColor(rate);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn('rounded-lg p-4 text-center', bgColorClass)}
    >
      <p className="text-body-sm font-medium text-[var(--text-secondary)] mb-2">
        Success Rate
      </p>
      <div className="relative w-24 h-24 mx-auto mb-2">
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
            className={colorClass.replace('text-', 'text-')}
            style={{ stroke: rate >= 95 ? '#22C55E' : rate >= 80 ? '#F59E0B' : '#EF4444' }}
            strokeDasharray={`${rate * 2.51} 251`}
            initial={{ strokeDasharray: '0 251' }}
            animate={{ strokeDasharray: `${rate * 2.51} 251` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-h2 font-display font-bold', colorClass)}>
            {rate}%
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Thundering Herd Card Component
 */
export function ThunderingHerdCard({
  connectedCount,
  isBursting,
  lastBurstStats,
  onTriggerBurst,
  isDisabled = false,
  error,
  currentQuestionId,
}: ThunderingHerdCardProps) {
  const canTrigger = connectedCount > 0 && !isBursting && !isDisabled;
  const hasQuestionActive = !!currentQuestionId;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-error/10 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-error"
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
              Thundering Herd
            </h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              Simulate 500+ simultaneous submissions
            </p>
          </div>
        </div>
        {isBursting && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-error" />
            </span>
            <span className="text-body-sm font-medium text-error">Bursting...</span>
          </div>
        )}
      </div>

      {/* Connection Status */}
      <div className="mb-6 p-4 rounded-lg bg-[var(--neu-surface)] neu-pressed">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-3 h-3 rounded-full',
              connectedCount > 0 ? 'bg-success' : 'bg-[var(--text-muted)]'
            )} />
            <span className="text-body-sm text-[var(--text-secondary)]">
              Connected Participants
            </span>
          </div>
          <span className={cn(
            'text-h3 font-display font-bold',
            connectedCount > 0 ? 'text-success' : 'text-[var(--text-muted)]'
          )}>
            {connectedCount}
          </span>
        </div>
        {hasQuestionActive && (
          <div className="mt-3 pt-3 border-t border-[var(--neu-shadow-dark)]/10">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              <span className="text-caption text-success">Question active - ready for burst</span>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 p-3 rounded-md bg-error/10 border border-error/20"
          >
            <p className="text-body-sm text-error">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trigger Button */}
      <div className="mb-6">
        <Button
          variant="danger"
          size="lg"
          onClick={onTriggerBurst}
          disabled={!canTrigger}
          isLoading={isBursting}
          className="w-full"
          leftIcon={
            !isBursting ? (
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
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            ) : undefined
          }
        >
          {isBursting ? 'Burst in Progress...' : `Trigger Burst (${connectedCount} participants)`}
        </Button>
        {!hasQuestionActive && connectedCount > 0 && (
          <p className="mt-2 text-caption text-warning text-center">
            ⚠️ No active question detected. Start a quiz question first for best results.
          </p>
        )}
        {connectedCount === 0 && (
          <p className="mt-2 text-caption text-[var(--text-muted)] text-center">
            Start a load test first to connect participants
          </p>
        )}
      </div>

      {/* Last Burst Statistics */}
      <AnimatePresence>
        {lastBurstStats && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="border-t border-[var(--neu-shadow-dark)]/10 pt-6">
              <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-4">
                Last Burst Results
              </h3>

              {/* Success Rate Gauge */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <SuccessRateGauge rate={lastBurstStats.successRate} />
                
                {/* Key Metrics */}
                <div className="md:col-span-2 grid grid-cols-2 gap-3">
                  <MetricItem
                    label="Total Submissions"
                    value={lastBurstStats.totalSubmissions}
                    delay={0}
                  />
                  <MetricItem
                    label="Successful"
                    value={lastBurstStats.successfulSubmissions}
                    colorClass="text-success"
                    delay={0.05}
                  />
                  <MetricItem
                    label="Failed"
                    value={lastBurstStats.failedSubmissions}
                    colorClass={lastBurstStats.failedSubmissions > 0 ? 'text-error' : 'text-[var(--text-primary)]'}
                    delay={0.1}
                  />
                  <MetricItem
                    label="Dropped Connections"
                    value={lastBurstStats.droppedConnections}
                    colorClass={lastBurstStats.droppedConnections > 0 ? 'text-error' : 'text-[var(--text-primary)]'}
                    delay={0.15}
                  />
                </div>
              </div>

              {/* Response Time Metrics */}
              <h4 className="text-caption font-medium text-[var(--text-muted)] mb-3">
                Response Times
              </h4>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                <MetricItem
                  label="Min"
                  value={lastBurstStats.minResponseTimeMs}
                  unit="ms"
                  colorClass={getResponseTimeColor(lastBurstStats.minResponseTimeMs)}
                  delay={0.2}
                />
                <MetricItem
                  label="Avg"
                  value={lastBurstStats.avgResponseTimeMs}
                  unit="ms"
                  colorClass={getResponseTimeColor(lastBurstStats.avgResponseTimeMs)}
                  delay={0.25}
                />
                <MetricItem
                  label="Max"
                  value={lastBurstStats.maxResponseTimeMs}
                  unit="ms"
                  colorClass={getResponseTimeColor(lastBurstStats.maxResponseTimeMs)}
                  delay={0.3}
                />
                <MetricItem
                  label="P50"
                  value={lastBurstStats.p50ResponseTimeMs}
                  unit="ms"
                  colorClass={getResponseTimeColor(lastBurstStats.p50ResponseTimeMs)}
                  delay={0.35}
                />
                <MetricItem
                  label="P95"
                  value={lastBurstStats.p95ResponseTimeMs}
                  unit="ms"
                  colorClass={getResponseTimeColor(lastBurstStats.p95ResponseTimeMs)}
                  delay={0.4}
                />
                <MetricItem
                  label="P99"
                  value={lastBurstStats.p99ResponseTimeMs}
                  unit="ms"
                  colorClass={getResponseTimeColor(lastBurstStats.p99ResponseTimeMs)}
                  delay={0.45}
                />
              </div>

              {/* Burst Duration */}
              <div className="flex items-center justify-between text-body-sm p-3 rounded-lg bg-[var(--neu-surface)]">
                <span className="text-[var(--text-muted)]">Burst Duration</span>
                <span className="font-medium text-[var(--text-primary)]">
                  {lastBurstStats.burstDurationMs}ms
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {!lastBurstStats && !isBursting && (
        <div className="py-8 text-center border-t border-[var(--neu-shadow-dark)]/10">
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
            No burst data yet
          </p>
          <p className="text-body-sm text-[var(--text-muted)]">
            Trigger a thundering herd burst to see performance metrics
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default ThunderingHerdCard;
