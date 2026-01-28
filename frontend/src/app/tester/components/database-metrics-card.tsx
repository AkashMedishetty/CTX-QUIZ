/**
 * Database Metrics Card Component
 * 
 * Displays database metrics for MongoDB and Redis:
 * - MongoDB connection pool stats with visual gauge
 * - MongoDB operations count
 * - MongoDB query performance metrics
 * - Redis memory usage with visual gauge
 * - Redis connected clients
 * - Redis commands processed
 * - Redis hit/miss ratio
 * - Redis keys count
 * - Auto-refresh every 3-5 seconds
 * - Color-coded thresholds for health indicators
 * 
 * Requirements: 15.8
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * MongoDB metrics data structure
 */
export interface MongoDBMetrics {
  connected: boolean;
  connectionPool: {
    available: number;
    inUse: number;
    waiting: number;
    totalCreated: number;
  };
  operations: {
    queries: number;
    inserts: number;
    updates: number;
    deletes: number;
  };
  performance: {
    avgQueryTimeMs: number;
    slowQueries: number;
  };
  circuitBreaker: {
    state: string;
    failureCount: number;
    lastFailureTime: number | null;
  };
}


/**
 * Redis metrics data structure
 */
export interface RedisMetrics {
  connected: boolean;
  memory: {
    usedBytes: number;
    peakBytes: number;
    fragmentationRatio: number;
    usagePercentage: number;
  };
  clients: {
    connected: number;
    blocked: number;
  };
  stats: {
    commandsProcessed: number;
    opsPerSecond: number;
    hitRate: number;
    missRate: number;
    keysCount: number;
  };
  status: {
    client: string;
    subscriber: string;
    publisher: string;
    reconnectAttempts: number;
  };
}

/**
 * Combined database metrics
 */
export interface DatabaseMetrics {
  success: boolean;
  mongodb: MongoDBMetrics;
  redis: RedisMetrics;
  timestamp: string;
}

/**
 * Props for DatabaseMetricsCard
 */
interface DatabaseMetricsCardProps {
  /** Polling interval in milliseconds (default: 3000) */
  pollInterval?: number;
  /** Whether to auto-start polling */
  autoStart?: boolean;
  /** Callback when metrics are updated */
  onMetricsUpdate?: (metrics: DatabaseMetrics) => void;
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
  if (percentage < 60) return 'Healthy';
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
 * Format large numbers with K/M suffix
 */
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}


/**
 * Circular gauge component for displaying usage percentage
 */
function UsageGauge({
  label,
  percentage,
  subtitle,
  icon,
  size = 'normal',
}: {
  label: string;
  percentage: number;
  subtitle?: string;
  icon: React.ReactNode;
  size?: 'small' | 'normal';
}) {
  const colorClass = getUsageColor(percentage);
  const bgColorClass = getUsageBgColor(percentage);
  const status = getUsageStatus(percentage);
  const gaugeSize = size === 'small' ? 'w-20 h-20' : 'w-24 h-24';

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
      <div className={cn('relative mx-auto mb-3', gaugeSize)}>
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8"
            className="text-[var(--neu-surface)]" />
          <motion.circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8"
            strokeLinecap="round" className={bgColorClass}
            strokeDasharray={`${percentage * 2.51} 251`}
            initial={{ strokeDasharray: '0 251' }}
            animate={{ strokeDasharray: `${percentage * 2.51} 251` }}
            transition={{ duration: 0.8, ease: 'easeOut' }} />
        </svg>
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
  status,
}: {
  label: string;
  connected: boolean;
  status?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-body-sm text-[var(--text-secondary)]">{label}</span>
      <div className="flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-full', connected ? 'bg-success' : 'bg-error')} />
        <span className={cn('text-body-sm font-medium', connected ? 'text-success' : 'text-error')}>
          {status || (connected ? 'Connected' : 'Disconnected')}
        </span>
      </div>
    </div>
  );
}


/**
 * Circuit breaker status component
 */
function CircuitBreakerStatus({
  state,
  failureCount,
}: {
  state: string;
  failureCount: number;
}) {
  const getStateColor = () => {
    switch (state) {
      case 'CLOSED': return 'text-success bg-success/10';
      case 'OPEN': return 'text-error bg-error/10';
      case 'HALF_OPEN': return 'text-warning bg-warning/10';
      default: return 'text-[var(--text-muted)] bg-[var(--neu-surface)]';
    }
  };

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-body-sm text-[var(--text-secondary)]">Circuit Breaker</span>
      <div className="flex items-center gap-2">
        <span className={cn('px-2 py-0.5 rounded text-caption font-medium', getStateColor())}>
          {state}
        </span>
        {failureCount > 0 && (
          <span className="text-caption text-error">({failureCount} failures)</span>
        )}
      </div>
    </div>
  );
}

/**
 * Database icon component
 */
function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );
}

/**
 * Redis icon component
 */
function RedisIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}


/**
 * MongoDB Metrics Section
 */
function MongoDBSection({ metrics }: { metrics: MongoDBMetrics }) {
  const poolTotal = metrics.connectionPool.available + metrics.connectionPool.inUse;
  const poolUsage = poolTotal > 0 ? (metrics.connectionPool.inUse / poolTotal) * 100 : 0;
  const totalOps = metrics.operations.queries + metrics.operations.inserts + 
                   metrics.operations.updates + metrics.operations.deletes;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
          <DatabaseIcon className="w-5 h-5 text-success" />
        </div>
        <div>
          <h3 className="text-body-lg font-semibold text-[var(--text-primary)]">MongoDB</h3>
          <p className="text-caption text-[var(--text-muted)]">Connection pool & operations</p>
        </div>
      </div>

      {/* Connection Pool Gauge */}
      <UsageGauge
        label="Connection Pool"
        percentage={poolUsage}
        subtitle={`${metrics.connectionPool.inUse} / ${poolTotal} connections`}
        icon={<DatabaseIcon className={cn('w-4 h-4', getUsageColor(poolUsage))} />}
      />

      {/* Connection Pool Details */}
      <div className="grid grid-cols-3 gap-2">
        <MetricItem label="Available" value={metrics.connectionPool.available} colorClass="text-success" />
        <MetricItem label="In Use" value={metrics.connectionPool.inUse} 
          colorClass={getUsageColor(poolUsage)} delay={0.05} />
        <MetricItem label="Waiting" value={metrics.connectionPool.waiting} 
          colorClass={metrics.connectionPool.waiting > 0 ? 'text-warning' : undefined} delay={0.1} />
      </div>

      {/* Operations */}
      <div className="mt-4">
        <h4 className="text-body-sm font-medium text-[var(--text-secondary)] mb-2">
          Operations ({formatNumber(totalOps)} total)
        </h4>
        <div className="grid grid-cols-4 gap-2">
          <MetricItem label="Queries" value={formatNumber(metrics.operations.queries)} delay={0.15} />
          <MetricItem label="Inserts" value={formatNumber(metrics.operations.inserts)} delay={0.2} />
          <MetricItem label="Updates" value={formatNumber(metrics.operations.updates)} delay={0.25} />
          <MetricItem label="Deletes" value={formatNumber(metrics.operations.deletes)} delay={0.3} />
        </div>
      </div>

      {/* Performance */}
      <div className="mt-4">
        <h4 className="text-body-sm font-medium text-[var(--text-secondary)] mb-2">Performance</h4>
        <div className="grid grid-cols-2 gap-2">
          <MetricItem label="Avg Query Time" value={metrics.performance.avgQueryTimeMs} unit="ms"
            colorClass={metrics.performance.avgQueryTimeMs < 50 ? 'text-success' : 
              metrics.performance.avgQueryTimeMs < 100 ? 'text-warning' : 'text-error'} delay={0.35} />
          <MetricItem label="Slow Queries" value={metrics.performance.slowQueries}
            colorClass={metrics.performance.slowQueries > 0 ? 'text-warning' : 'text-success'} delay={0.4} />
        </div>
      </div>

      {/* Circuit Breaker Status */}
      <div className="mt-4 rounded-lg p-3 bg-[var(--neu-surface)] neu-pressed">
        <CircuitBreakerStatus state={metrics.circuitBreaker.state} 
          failureCount={metrics.circuitBreaker.failureCount} />
      </div>
    </div>
  );
}


/**
 * Redis Metrics Section
 */
function RedisSection({ metrics }: { metrics: RedisMetrics }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-error/10 flex items-center justify-center">
          <RedisIcon className="w-5 h-5 text-error" />
        </div>
        <div>
          <h3 className="text-body-lg font-semibold text-[var(--text-primary)]">Redis</h3>
          <p className="text-caption text-[var(--text-muted)]">Memory & performance</p>
        </div>
      </div>

      {/* Memory Usage Gauge */}
      <UsageGauge
        label="Memory Usage"
        percentage={metrics.memory.usagePercentage}
        subtitle={`${formatBytes(metrics.memory.usedBytes)} / ${formatBytes(metrics.memory.peakBytes)} peak`}
        icon={<RedisIcon className={cn('w-4 h-4', getUsageColor(metrics.memory.usagePercentage))} />}
      />

      {/* Memory Details */}
      <div className="grid grid-cols-2 gap-2">
        <MetricItem label="Used Memory" value={formatBytes(metrics.memory.usedBytes)} 
          colorClass={getUsageColor(metrics.memory.usagePercentage)} />
        <MetricItem label="Fragmentation" value={metrics.memory.fragmentationRatio}
          colorClass={metrics.memory.fragmentationRatio > 1.5 ? 'text-warning' : 'text-success'} delay={0.05} />
      </div>

      {/* Clients */}
      <div className="mt-4">
        <h4 className="text-body-sm font-medium text-[var(--text-secondary)] mb-2">Clients</h4>
        <div className="grid grid-cols-2 gap-2">
          <MetricItem label="Connected" value={metrics.clients.connected} colorClass="text-primary" delay={0.1} />
          <MetricItem label="Blocked" value={metrics.clients.blocked}
            colorClass={metrics.clients.blocked > 0 ? 'text-warning' : 'text-success'} delay={0.15} />
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4">
        <h4 className="text-body-sm font-medium text-[var(--text-secondary)] mb-2">Performance</h4>
        <div className="grid grid-cols-2 gap-2">
          <MetricItem label="Commands" value={formatNumber(metrics.stats.commandsProcessed)} delay={0.2} />
          <MetricItem label="Ops/sec" value={metrics.stats.opsPerSecond} delay={0.25} />
          <MetricItem label="Hit Rate" value={`${metrics.stats.hitRate}%`}
            colorClass={metrics.stats.hitRate > 80 ? 'text-success' : 
              metrics.stats.hitRate > 50 ? 'text-warning' : 'text-error'} delay={0.3} />
          <MetricItem label="Keys" value={formatNumber(metrics.stats.keysCount)} delay={0.35} />
        </div>
      </div>

      {/* Connection Status */}
      <div className="mt-4 rounded-lg p-3 bg-[var(--neu-surface)] neu-pressed">
        <ConnectionStatus label="Client" connected={metrics.status.client === 'ready'} 
          status={metrics.status.client} />
        <ConnectionStatus label="Subscriber" connected={metrics.status.subscriber === 'ready'} 
          status={metrics.status.subscriber} />
        <ConnectionStatus label="Publisher" connected={metrics.status.publisher === 'ready'} 
          status={metrics.status.publisher} />
      </div>
    </div>
  );
}


/**
 * Database Metrics Card Component
 */
export function DatabaseMetricsCard({
  pollInterval = 3000,
  autoStart = true,
  onMetricsUpdate,
  apiBaseUrl = 'http://localhost:3001',
}: DatabaseMetricsCardProps) {
  const [metrics, setMetrics] = React.useState<DatabaseMetrics | null>(null);
  const [isPolling, setIsPolling] = React.useState(autoStart);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);

  /**
   * Fetch database metrics from the API
   */
  const fetchMetrics = React.useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/metrics/database`);
      
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
      console.error('Failed to fetch database metrics:', err);
    }
  }, [apiBaseUrl, onMetricsUpdate]);

  /**
   * Start polling for metrics
   */
  const startPolling = React.useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    fetchMetrics();
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
            <DatabaseIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
              Database Metrics
            </h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              MongoDB & Redis performance
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* MongoDB Section */}
          <div className="neu-raised rounded-lg p-5">
            <MongoDBSection metrics={metrics.mongodb} />
          </div>

          {/* Redis Section */}
          <div className="neu-raised rounded-lg p-5">
            <RedisSection metrics={metrics.redis} />
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="py-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--neu-surface)] neu-pressed flex items-center justify-center">
            <DatabaseIcon className="w-8 h-8 text-[var(--text-muted)]" />
          </div>
          <p className="text-body text-[var(--text-muted)] mb-2">
            {isPolling ? 'Loading metrics...' : 'No metrics data'}
          </p>
          <p className="text-body-sm text-[var(--text-muted)]">
            {isPolling
              ? 'Fetching database metrics from the server'
              : 'Click Start to begin monitoring database performance'}
          </p>
        </div>
      )}

      {/* Footer with last updated and legend */}
      {metrics && (
        <div className="mt-6 pt-4 border-t border-[var(--neu-shadow-dark)]/10">
          <div className="flex items-center justify-between text-body-sm">
            {lastUpdated && (
              <span className="text-[var(--text-muted)]">
                Updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <div className="flex items-center gap-4 text-caption">
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
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default DatabaseMetricsCard;
