/**
 * System Metrics Card - Displays system health metrics for the controller
 * 
 * Shows:
 * - Active connections count
 * - Average WebSocket latency with color coding
 * - CPU usage percentage with gauge
 * - Memory usage percentage with gauge
 * - Updates every 5 seconds (data from WebSocket `system_metrics` event)
 * - Pulse animation when metrics update
 * 
 * Requirements: 13.9
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SystemMetrics } from '@/hooks/useControllerSocket';

/**
 * System metrics card props
 */
export interface SystemMetricsCardProps {
  /** System metrics data from the session state */
  systemMetrics: SystemMetrics | null;
  /** Whether the controller is connected */
  isConnected: boolean;
}

/**
 * Get latency status configuration
 */
function getLatencyStatus(latency: number) {
  if (latency < 50) {
    return {
      label: 'Excellent',
      color: 'text-success',
      bgColor: 'bg-success/10',
      barColor: 'bg-success',
    };
  }
  if (latency < 100) {
    return {
      label: 'Good',
      color: 'text-success',
      bgColor: 'bg-success/10',
      barColor: 'bg-success',
    };
  }
  if (latency < 200) {
    return {
      label: 'Fair',
      color: 'text-warning',
      bgColor: 'bg-warning/10',
      barColor: 'bg-warning',
    };
  }
  return {
    label: 'Poor',
    color: 'text-error',
    bgColor: 'bg-error/10',
    barColor: 'bg-error',
  };
}

/**
 * Get usage status configuration
 */
function getUsageStatus(percentage: number) {
  if (percentage < 50) {
    return {
      label: 'Normal',
      color: 'text-success',
      strokeColor: 'var(--color-success)',
    };
  }
  if (percentage < 80) {
    return {
      label: 'Moderate',
      color: 'text-warning',
      strokeColor: 'var(--color-warning)',
    };
  }
  return {
    label: 'High',
    color: 'text-error',
    strokeColor: 'var(--color-error)',
  };
}

/**
 * Circular gauge component for CPU/Memory usage
 */
function CircularGauge({
  value,
  label,
  icon,
}: {
  value: number;
  label: string;
  icon: React.ReactNode;
}) {
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (value / 100) * circumference;
  const status = getUsageStatus(value);

  return (
    <div className="flex flex-col items-center">
      <div className="relative inline-flex items-center justify-center">
        {/* Background circle */}
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--shadow-dark)"
            strokeWidth={strokeWidth}
            className="opacity-20"
          />
          {/* Progress */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={status.strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            key={value}
            initial={{ scale: 1.1, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`font-display text-h2 font-bold ${status.color}`}
          >
            {Math.round(value)}
            <span className="text-body-sm">%</span>
          </motion.span>
        </div>
      </div>

      {/* Label */}
      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-[var(--text-muted)]">{icon}</span>
        <span className="text-body-sm font-medium text-[var(--text-secondary)]">
          {label}
        </span>
      </div>
      <span className={`text-caption ${status.color}`}>{status.label}</span>
    </div>
  );
}

/**
 * Metric stat box component
 */
function MetricStatBox({
  icon,
  label,
  value,
  unit,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  unit?: string;
  status?: { color: string; bgColor: string };
}) {
  return (
    <div className="neu-pressed rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[var(--text-muted)]">{icon}</span>
        <p className="text-caption text-[var(--text-muted)]">{label}</p>
      </div>
      <div className="flex items-baseline gap-1">
        <motion.p
          key={String(value)}
          initial={{ scale: 1.1, color: 'var(--primary)' }}
          animate={{ scale: 1, color: status?.color ? `var(--color-${status.color.replace('text-', '')})` : 'var(--text-primary)' }}
          transition={{ duration: 0.3 }}
          className={`text-h2 font-bold ${status?.color || 'text-[var(--text-primary)]'}`}
        >
          {value}
        </motion.p>
        {unit && (
          <span className="text-body-sm text-[var(--text-muted)]">{unit}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Latency bar indicator
 */
function LatencyBar({ latency }: { latency: number }) {
  const status = getLatencyStatus(latency);
  // Map latency to percentage (0-300ms range)
  const percentage = Math.min(100, (latency / 300) * 100);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-body-sm text-[var(--text-secondary)]">
          Latency Quality
        </span>
        <span className={`text-body-sm font-medium ${status.color}`}>
          {status.label}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--shadow-dark)]/20 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${status.barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${100 - percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-caption text-[var(--text-muted)]">0ms</span>
        <span className="text-caption text-[var(--text-muted)]">300ms+</span>
      </div>
    </div>
  );
}

/**
 * Pulse indicator for metric updates
 */
function UpdatePulse({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 2, opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute top-4 right-4 w-3 h-3 rounded-full bg-primary"
        />
      )}
    </AnimatePresence>
  );
}

/**
 * System Metrics Card Component
 * 
 * Displays system health metrics including connections, latency, CPU, and memory usage.
 */
export function SystemMetricsCard({
  systemMetrics,
  isConnected,
}: SystemMetricsCardProps) {
  const [showPulse, setShowPulse] = useState(false);
  const prevMetricsRef = useRef<SystemMetrics | null>(null);

  // Track metrics changes for pulse animation
  useEffect(() => {
    if (systemMetrics && prevMetricsRef.current) {
      // Check if any metric changed
      const hasChanged =
        systemMetrics.activeConnections !== prevMetricsRef.current.activeConnections ||
        Math.abs(systemMetrics.averageLatency - prevMetricsRef.current.averageLatency) > 5 ||
        Math.abs(systemMetrics.cpuUsage - prevMetricsRef.current.cpuUsage) > 1 ||
        Math.abs(systemMetrics.memoryUsage - prevMetricsRef.current.memoryUsage) > 1;

      if (hasChanged) {
        setShowPulse(true);
        const timer = setTimeout(() => setShowPulse(false), 600);
        return () => clearTimeout(timer);
      }
    }
    prevMetricsRef.current = systemMetrics;
    return undefined;
  }, [systemMetrics]);

  // Get overall system health status
  const getOverallStatus = () => {
    if (!systemMetrics || !isConnected) {
      return { text: 'Offline', color: 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]' };
    }

    // Check for any critical issues
    if (
      systemMetrics.averageLatency >= 200 ||
      systemMetrics.cpuUsage >= 80 ||
      systemMetrics.memoryUsage >= 80
    ) {
      return { text: 'Warning', color: 'bg-warning/10 text-warning' };
    }

    if (
      systemMetrics.averageLatency < 100 &&
      systemMetrics.cpuUsage < 50 &&
      systemMetrics.memoryUsage < 50
    ) {
      return { text: 'Healthy', color: 'bg-success/10 text-success' };
    }

    return { text: 'Normal', color: 'bg-info/10 text-info' };
  };

  const overallStatus = getOverallStatus();
  const latencyStatus = systemMetrics ? getLatencyStatus(systemMetrics.averageLatency) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-xl overflow-hidden relative"
    >
      {/* Pulse indicator for updates */}
      <UpdatePulse show={showPulse} />

      {/* Header */}
      <div className="bg-primary/5 border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center justify-between">
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
                System Metrics
              </h2>
              <p className="text-caption text-[var(--text-muted)]">
                Real-time health monitoring
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <motion.div
            key={overallStatus.text}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`px-3 py-1.5 rounded-full text-body-sm font-medium ${overallStatus.color}`}
          >
            {overallStatus.text}
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          {/* Not Connected State */}
          {!isConnected && (
            <motion.div
              key="offline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-8"
            >
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[var(--text-muted)]/10 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-[var(--text-muted)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
                  />
                </svg>
              </div>
              <p className="text-body text-[var(--text-secondary)]">
                Connect to view system metrics
              </p>
            </motion.div>
          )}

          {/* No Metrics Yet State */}
          {isConnected && !systemMetrics && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-8"
            >
              <div className="relative w-20 h-20 mx-auto mb-4">
                <div className="absolute inset-0 rounded-full bg-info/10 flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-info animate-pulse"
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
                {/* Pulsing ring */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-info"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.3, opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              </div>
              <p className="text-body font-medium text-[var(--text-primary)] mb-1">
                Waiting for metrics...
              </p>
              <p className="text-body-sm text-[var(--text-muted)]">
                Updates every 5 seconds
              </p>
            </motion.div>
          )}

          {/* Metrics Display */}
          {isConnected && systemMetrics && (
            <motion.div
              key="metrics"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Top Stats Row */}
              <div className="grid grid-cols-2 gap-4">
                {/* Active Connections */}
                <MetricStatBox
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                      />
                    </svg>
                  }
                  label="Connections"
                  value={systemMetrics.activeConnections}
                />

                {/* Average Latency */}
                <MetricStatBox
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  }
                  label="Latency"
                  value={Math.round(systemMetrics.averageLatency)}
                  unit="ms"
                  status={latencyStatus ? { color: latencyStatus.color, bgColor: latencyStatus.bgColor } : undefined}
                />
              </div>

              {/* Latency Bar */}
              <LatencyBar latency={systemMetrics.averageLatency} />

              {/* CPU and Memory Gauges */}
              <div className="flex justify-around items-center pt-2">
                <CircularGauge
                  value={systemMetrics.cpuUsage}
                  label="CPU"
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                      />
                    </svg>
                  }
                />
                <CircularGauge
                  value={systemMetrics.memoryUsage}
                  label="Memory"
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

              {/* Last Updated */}
              <div className="text-center pt-2 border-t border-[var(--border)]">
                <p className="text-caption text-[var(--text-muted)]">
                  Updates automatically every 5 seconds
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default SystemMetricsCard;
