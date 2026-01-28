/**
 * Resource Monitor Card Component
 * 
 * Displays system resource usage metrics:
 * - CPU usage with gauge/progress bar
 * - Memory usage with gauge/progress bar
 * - Network I/O (connection stats)
 * - Auto-refresh every 2-5 seconds
 * - Color-coded thresholds (green < 60%, yellow < 80%, red >= 80%)
 * 
 * Requirements: 15.5
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * System metrics data structure from the API
 */
export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usagePercentage: number;
  };
  network: {
    activeConnections: number;
    redisConnected: boolean;
    mongodbConnected: boolean;
  };
  uptime: number;
  latency: {
    average: number;
    redis: number | null;
    mongodb: number | null;
  };
  timestamp: string;
}

/**
 * Props for ResourceMonitorCard
 */
interface ResourceMonitorCardProps {
  /** Polling interval in milliseconds (default: 3000) */
  pollInterval?: number;
  /** Whether to auto-start polling */
  autoStart?: boolean;
  /** Callback when metrics are updated */
  onMetricsUpdate?: (metrics: SystemMetrics) => void;
  /** API base URL (default: http://localhost:3001) */
  apiBaseUrl?: string;
}

/**
 * Get color class based on usage percentage
 * Green < 60%, Yellow < 80%, Red >= 80%
 */
function getUsageColor(percentage: number): string {
  if (percentage < 60) return 'text-success';
  if (percentage < 80) return 'text-warning';
  return 'text-error';
}

/**
 * Get background color class based on usage percentage
 */
function getUsageBgColor(percentage: number): string {
  if (percentage < 60) return 'bg-success';
  if (percentage < 80) return 'bg-warning';
  return 'bg-error';
}

/**
 * Get status label based on usage percentage
 */
function getUsageStatus(percentage: number): string {
  if (percentage < 60) return 'Normal';
  if (percentage < 80) return 'Elevated';
  return 'Critical';
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format uptime to human-readable string
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Circular gauge component for displaying usage percentage
 */
function UsageGauge({
  label,
  percentage,
  subtitle,
  icon,
}: {
  label: string;
  percentage: number;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  const colorClass = getUsageColor(percentage);
  const bgColorClass = getUsageBgColor(percentage);
  const status = getUsageStatus(percentage);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="neu-raised rounded-lg p-4 text-center"
    >
      <div className="flex items-center justify-center gap-2 mb-3">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', 
          percentage < 60 ? 'bg-success/10' : percentage < 80 ? 'bg-warning/10' : 'bg-error/10'
        )}>
          {icon}
        </div>
        <span className="text-body-sm font-medium text-[var(--text-secondary)]">
          {label}
        </span>
      </div>

      {/* Circular gauge */}
      <div className="relative w-24 h-24 mx-auto mb-3">
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
            className={bgColorClass}
            strokeDasharray={`${percentage * 2.51} 251`}
            initial={{ strokeDasharray: '0 251' }}
            animate={{ strokeDasharray: `${percentage * 2.51} 251` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-h3 font-display font-bold', colorClass)}>
            {Math.round(percentage)}%
          </span>
        </div>
      </div>

      <p className={cn('text-caption font-medium', colorClass)}>{status}</p>
      {subtitle && (
        <p className="text-caption text-[var(--text-muted)] mt-1">{subtitle}</p>
      )}
    </motion.div>
  );
}

/**
 * Metric item component for displaying individual metrics
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
      <p className={cn('text-body-lg font-display font-bold', colorClass || 'text-[var(--text-primary)]')}>
        {value !== null ? value : '-'}
        {value !== null && unit && (
          <span className="text-caption font-normal ml-1">{unit}</span>
        )}
      </p>
    </motion.div>
  );
}

/**
 * Connection status indicator
 */
function ConnectionStatus({
  label,
  connected,
}: {
  label: string;
  connected: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-body-sm text-[var(--text-secondary)]">{label}</span>
      <div className="flex items-center gap-2">
        <span className={cn(
          'w-2 h-2 rounded-full',
          connected ? 'bg-success' : 'bg-error'
        )} />
        <span className={cn(
          'text-body-sm font-medium',
          connected ? 'text-success' : 'text-error'
        )}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </div>
  );
}

/**
 * Resource Monitor Card Component
 */
export function ResourceMonitorCard({
  pollInterval = 3000,
  autoStart = true,
  onMetricsUpdate,
  apiBaseUrl = 'http://localhost:3001',
}: ResourceMonitorCardProps) {
  const [metrics, setMetrics] = React.useState<SystemMetrics | null>(null);
  const [isPolling, setIsPolling] = React.useState(autoStart);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);

  /**
   * Fetch system metrics from the API
   */
  const fetchMetrics = React.useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/metrics/system`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setMetrics(data);
        setLastUpdated(new Date());
        setError(null);
        onMetricsUpdate?.(data);
      } else {
        throw new Error(data.error || 'Failed to fetch metrics');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Failed to fetch system metrics:', err);
    }
  }, [apiBaseUrl, onMetricsUpdate]);

  /**
   * Start polling for metrics
   */
  const startPolling = React.useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Fetch immediately
    fetchMetrics();

    // Set up interval
    intervalRef.current = setInterval(fetchMetrics, pollInterval);
    setIsPolling(true);
  }, [fetchMetrics, pollInterval]);

  /**
   * Stop polling for metrics
   */
  const stopPolling = React.useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  /**
   * Toggle polling state
   */
  const togglePolling = React.useCallback(() => {
    if (isPolling) {
      stopPolling();
    } else {
      startPolling();
    }
  }, [isPolling, startPolling, stopPolling]);

  // Start polling on mount if autoStart is true
  React.useEffect(() => {
    if (autoStart) {
      startPolling();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoStart, startPolling]);

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
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
              Resource Monitor
            </h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              System resource usage metrics
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isPolling && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              <span className="text-body-sm text-success">Live</span>
            </div>
          )}
          <button
            onClick={togglePolling}
            className={cn(
              'px-3 py-1.5 rounded-md text-body-sm font-medium transition-all duration-fast',
              isPolling
                ? 'bg-error/10 text-error hover:bg-error/20'
                : 'bg-success/10 text-success hover:bg-success/20'
            )}
          >
            {isPolling ? 'Stop' : 'Start'}
          </button>
        </div>
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

      {metrics ? (
        <>
          {/* CPU and Memory Gauges */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <UsageGauge
              label="CPU Usage"
              percentage={metrics.cpu.usage}
              subtitle={`${metrics.cpu.cores} cores`}
              icon={
                <svg
                  className={cn('w-4 h-4', getUsageColor(metrics.cpu.usage))}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                  />
                </svg>
              }
            />
            <UsageGauge
              label="Memory Usage"
              percentage={metrics.memory.usagePercentage}
              subtitle={`${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}`}
              icon={
                <svg
                  className={cn('w-4 h-4', getUsageColor(metrics.memory.usagePercentage))}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              }
            />
          </div>

          {/* Load Average */}
          <div className="mb-6">
            <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-3">
              Load Average
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <MetricItem
                label="1 min"
                value={metrics.cpu.loadAverage[0]?.toFixed(2) ?? null}
                delay={0}
              />
              <MetricItem
                label="5 min"
                value={metrics.cpu.loadAverage[1]?.toFixed(2) ?? null}
                delay={0.05}
              />
              <MetricItem
                label="15 min"
                value={metrics.cpu.loadAverage[2]?.toFixed(2) ?? null}
                delay={0.1}
              />
            </div>
          </div>

          {/* Memory Details */}
          <div className="mb-6">
            <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-3">
              Memory Details
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <MetricItem
                label="Total"
                value={formatBytes(metrics.memory.total)}
                delay={0.15}
              />
              <MetricItem
                label="Used"
                value={formatBytes(metrics.memory.used)}
                colorClass={getUsageColor(metrics.memory.usagePercentage)}
                delay={0.2}
              />
              <MetricItem
                label="Free"
                value={formatBytes(metrics.memory.free)}
                colorClass="text-success"
                delay={0.25}
              />
            </div>
          </div>

          {/* Network / Connections */}
          <div className="mb-6">
            <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-3">
              Network & Connections
            </h3>
            <div className="rounded-lg p-4 bg-[var(--neu-surface)] neu-pressed">
              <div className="flex items-center justify-between py-2 border-b border-[var(--neu-shadow-dark)]/10">
                <span className="text-body-sm text-[var(--text-secondary)]">Active WebSocket Connections</span>
                <span className="text-body-lg font-display font-bold text-primary">
                  {metrics.network.activeConnections}
                </span>
              </div>
              <ConnectionStatus label="Redis" connected={metrics.network.redisConnected} />
              <ConnectionStatus label="MongoDB" connected={metrics.network.mongodbConnected} />
            </div>
          </div>

          {/* Latency */}
          <div className="mb-6">
            <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-3">
              Latency
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <MetricItem
                label="Average"
                value={metrics.latency.average}
                unit="ms"
                colorClass={metrics.latency.average < 100 ? 'text-success' : metrics.latency.average < 200 ? 'text-warning' : 'text-error'}
                delay={0.3}
              />
              <MetricItem
                label="Redis"
                value={metrics.latency.redis}
                unit="ms"
                colorClass={metrics.latency.redis !== null && metrics.latency.redis < 10 ? 'text-success' : 'text-warning'}
                delay={0.35}
              />
              <MetricItem
                label="MongoDB"
                value={metrics.latency.mongodb}
                unit="ms"
                colorClass={metrics.latency.mongodb !== null && metrics.latency.mongodb < 50 ? 'text-success' : 'text-warning'}
                delay={0.4}
              />
            </div>
          </div>

          {/* Uptime and Last Updated */}
          <div className="flex items-center justify-between text-body-sm p-3 rounded-lg bg-[var(--neu-surface)]">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-[var(--text-muted)]"
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
              <span className="text-[var(--text-muted)]">Uptime:</span>
              <span className="font-medium text-[var(--text-primary)]">
                {formatUptime(metrics.uptime)}
              </span>
            </div>
            {lastUpdated && (
              <span className="text-[var(--text-muted)]">
                Updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>

          {/* Threshold Legend */}
          <div className="mt-4 flex items-center justify-center gap-4 text-caption">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="text-[var(--text-muted)]">&lt; 60%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-warning" />
              <span className="text-[var(--text-muted)]">60-80%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-error" />
              <span className="text-[var(--text-muted)]">&gt;= 80%</span>
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
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <p className="text-body text-[var(--text-muted)] mb-2">
            {isPolling ? 'Loading metrics...' : 'No metrics data'}
          </p>
          <p className="text-body-sm text-[var(--text-muted)]">
            {isPolling
              ? 'Fetching system resource data from the server'
              : 'Click Start to begin monitoring system resources'}
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default ResourceMonitorCard;
