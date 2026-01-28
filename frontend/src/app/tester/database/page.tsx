/**
 * Database Metrics Page
 * 
 * Displays detailed database metrics for MongoDB and Redis:
 * - Connection pool stats
 * - Memory usage
 * - Query performance metrics
 * - Historical charts for query times
 * - Connection health status
 * 
 * Requirements: 15.8
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { DynamicDatabaseMetricsCard } from '@/lib/dynamic-imports';
import type { DatabaseMetrics } from '../components';
import { cn } from '@/lib/utils';

/**
 * Historical data point for charts
 */
interface HistoryPoint {
  timestamp: Date;
  mongoPoolUsage: number;
  redisMemoryUsage: number;
  mongoQueryTime: number;
  redisOpsPerSec: number;
}

/**
 * Simple line chart component for historical data
 */
function MiniChart({
  data,
  dataKey,
  color,
  label,
}: {
  data: HistoryPoint[];
  dataKey: keyof HistoryPoint;
  color: string;
  label: string;
}) {
  if (data.length < 2) {
    return (
      <div className="h-20 flex items-center justify-center text-caption text-[var(--text-muted)]">
        Collecting data...
      </div>
    );
  }

  const values = data.map(d => d[dataKey] as number);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;


  // Generate SVG path
  const width = 200;
  const height = 60;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(' L ')}`;

  const currentValue = values[values.length - 1];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-caption text-[var(--text-muted)]">{label}</span>
        <span className={cn('text-body-sm font-display font-bold', color)}>
          {typeof currentValue === 'number' ? currentValue.toFixed(1) : currentValue}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-16">
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={color}
        />
      </svg>
    </div>
  );
}

/**
 * Health status badge component
 */
function HealthBadge({ 
  connected, 
  label 
}: { 
  connected: boolean; 
  label: string;
}) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-lg',
      connected ? 'bg-success/10' : 'bg-error/10'
    )}>
      <span className={cn(
        'w-3 h-3 rounded-full',
        connected ? 'bg-success' : 'bg-error'
      )} />
      <span className={cn(
        'text-body-sm font-medium',
        connected ? 'text-success' : 'text-error'
      )}>
        {label}: {connected ? 'Healthy' : 'Unhealthy'}
      </span>
    </div>
  );
}


/**
 * Database Metrics Page Component
 */
export default function DatabaseMetricsPage() {
  const [history, setHistory] = React.useState<HistoryPoint[]>([]);
  const [latestMetrics, setLatestMetrics] = React.useState<DatabaseMetrics | null>(null);
  const MAX_HISTORY = 60; // Keep 60 data points (3 minutes at 3s intervals)

  /**
   * Handle metrics update from the card
   */
  const handleMetricsUpdate = React.useCallback((metrics: DatabaseMetrics) => {
    setLatestMetrics(metrics);
    
    // Calculate pool usage percentage
    const poolTotal = metrics.mongodb.connectionPool.available + 
                      metrics.mongodb.connectionPool.inUse;
    const poolUsage = poolTotal > 0 
      ? (metrics.mongodb.connectionPool.inUse / poolTotal) * 100 
      : 0;

    const newPoint: HistoryPoint = {
      timestamp: new Date(),
      mongoPoolUsage: poolUsage,
      redisMemoryUsage: metrics.redis.memory.usagePercentage,
      mongoQueryTime: metrics.mongodb.performance.avgQueryTimeMs,
      redisOpsPerSec: metrics.redis.stats.opsPerSecond,
    };

    setHistory(prev => {
      const updated = [...prev, newPoint];
      // Keep only the last MAX_HISTORY points
      if (updated.length > MAX_HISTORY) {
        return updated.slice(-MAX_HISTORY);
      }
      return updated;
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-h2 font-semibold text-[var(--text-primary)]">
            Database Metrics
          </h1>
          <p className="text-body-sm text-[var(--text-muted)] mt-1">
            Monitor MongoDB and Redis performance in real-time
          </p>
        </div>
      </motion.div>


      {/* Health Status Overview */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="neu-raised-lg rounded-lg p-4"
      >
        <h2 className="text-body-lg font-semibold text-[var(--text-primary)] mb-4">
          Connection Health
        </h2>
        <div className="flex flex-wrap gap-3">
          <HealthBadge 
            connected={latestMetrics?.mongodb.connected ?? false} 
            label="MongoDB" 
          />
          <HealthBadge 
            connected={latestMetrics?.redis.connected ?? false} 
            label="Redis" 
          />
          {latestMetrics?.mongodb.circuitBreaker && (
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg',
              latestMetrics.mongodb.circuitBreaker.state === 'CLOSED' 
                ? 'bg-success/10' 
                : latestMetrics.mongodb.circuitBreaker.state === 'OPEN'
                  ? 'bg-error/10'
                  : 'bg-warning/10'
            )}>
              <span className={cn(
                'w-3 h-3 rounded-full',
                latestMetrics.mongodb.circuitBreaker.state === 'CLOSED' 
                  ? 'bg-success' 
                  : latestMetrics.mongodb.circuitBreaker.state === 'OPEN'
                    ? 'bg-error'
                    : 'bg-warning'
              )} />
              <span className={cn(
                'text-body-sm font-medium',
                latestMetrics.mongodb.circuitBreaker.state === 'CLOSED' 
                  ? 'text-success' 
                  : latestMetrics.mongodb.circuitBreaker.state === 'OPEN'
                    ? 'text-error'
                    : 'text-warning'
              )}>
                Circuit: {latestMetrics.mongodb.circuitBreaker.state}
              </span>
            </div>
          )}
        </div>
      </motion.div>


      {/* Historical Charts */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="neu-raised-lg rounded-lg p-6"
      >
        <h2 className="text-body-lg font-semibold text-[var(--text-primary)] mb-4">
          Historical Trends
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="neu-raised rounded-lg p-4">
            <MiniChart
              data={history}
              dataKey="mongoPoolUsage"
              color="text-success"
              label="MongoDB Pool %"
            />
          </div>
          <div className="neu-raised rounded-lg p-4">
            <MiniChart
              data={history}
              dataKey="redisMemoryUsage"
              color="text-error"
              label="Redis Memory %"
            />
          </div>
          <div className="neu-raised rounded-lg p-4">
            <MiniChart
              data={history}
              dataKey="mongoQueryTime"
              color="text-warning"
              label="Avg Query (ms)"
            />
          </div>
          <div className="neu-raised rounded-lg p-4">
            <MiniChart
              data={history}
              dataKey="redisOpsPerSec"
              color="text-info"
              label="Redis Ops/sec"
            />
          </div>
        </div>
        <p className="text-caption text-[var(--text-muted)] mt-4 text-center">
          Showing last {history.length} data points ({Math.round(history.length * 3 / 60)} minutes)
        </p>
      </motion.div>

      {/* Main Metrics Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <DynamicDatabaseMetricsCard
          pollInterval={3000}
          autoStart={true}
          onMetricsUpdate={handleMetricsUpdate}
        />
      </motion.div>
    </div>
  );
}
