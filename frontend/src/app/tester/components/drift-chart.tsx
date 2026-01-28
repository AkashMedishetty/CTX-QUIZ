/**
 * Drift Chart Component
 * 
 * Displays real-time timer drift data using Chart.js:
 * - Line chart showing drift over time
 * - Threshold lines at ±50ms and ±100ms
 * - Real-time updates as new data comes in
 * - Color-coded points based on drift severity
 * 
 * Requirements: 15.3
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
  type ChartData,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { TimerDriftEntry } from '@/lib/load-tester';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

/**
 * Props for DriftChart
 */
interface DriftChartProps {
  /** Drift history data */
  driftHistory: TimerDriftEntry[];
  /** Whether the test is running */
  isRunning: boolean;
}

/**
 * Format timestamp for chart labels
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Get point color based on drift value (absolute)
 */
function getPointColor(driftMs: number): string {
  const absDrift = Math.abs(driftMs);
  if (absDrift < 50) return '#22C55E'; // Success green
  if (absDrift < 100) return '#F59E0B'; // Warning yellow
  return '#EF4444'; // Error red
}

/**
 * Drift Chart Component
 */
export function DriftChart({ driftHistory, isRunning }: DriftChartProps) {
  const chartRef = React.useRef<ChartJS<'line'>>(null);

  // Prepare chart data
  const chartData: ChartData<'line'> = React.useMemo(() => {
    const labels = driftHistory.map((entry) => formatTime(entry.timestamp));
    const data = driftHistory.map((entry) => entry.driftMs);
    const pointColors = driftHistory.map((entry) => getPointColor(entry.driftMs));

    return {
      labels,
      datasets: [
        {
          label: 'Drift (ms)',
          data,
          borderColor: '#275249', // CTX Teal
          backgroundColor: 'rgba(39, 82, 73, 0.1)',
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: false,
          tension: 0.2,
        },
      ],
    };
  }, [driftHistory]);

  // Chart options
  const chartOptions: ChartOptions<'line'> = React.useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: isRunning ? 200 : 500,
      },
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(26, 29, 33, 0.9)',
          titleColor: '#F0F4F7',
          bodyColor: '#F0F4F7',
          borderColor: 'rgba(39, 82, 73, 0.3)',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (context) => {
              const value = context.parsed.y;
              if (value === null || value === undefined) {
                return ['No data'];
              }
              const absDrift = Math.abs(value);
              let status = 'Excellent';
              if (absDrift >= 100) status = 'Poor';
              else if (absDrift >= 50) status = 'Good';
              
              const sign = value >= 0 ? '+' : '';
              return [`${sign}${value}ms`, status];
            },
          },
        },
      },
      scales: {
        x: {
          display: true,
          grid: {
            color: 'rgba(200, 204, 208, 0.2)',
          },
          ticks: {
            color: '#6B7280',
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
          },
        },
        y: {
          display: true,
          suggestedMin: -150,
          suggestedMax: 150,
          grid: {
            color: (context) => {
              // Highlight threshold lines
              const value = context.tick.value;
              if (value === 0) return 'rgba(39, 82, 73, 0.5)';
              if (value === 50 || value === -50) return 'rgba(34, 197, 94, 0.3)';
              if (value === 100 || value === -100) return 'rgba(245, 158, 11, 0.3)';
              return 'rgba(200, 204, 208, 0.2)';
            },
            lineWidth: (context) => {
              const value = context.tick.value;
              if (value === 0 || value === 50 || value === -50 || value === 100 || value === -100) {
                return 2;
              }
              return 1;
            },
          },
          ticks: {
            color: '#6B7280',
            callback: (value) => {
              const numValue = Number(value);
              const sign = numValue >= 0 ? '+' : '';
              return `${sign}${numValue}ms`;
            },
            stepSize: 50,
          },
        },
      },
    }),
    [isRunning]
  );

  // Update chart when data changes
  React.useEffect(() => {
    if (chartRef.current) {
      chartRef.current.update('none');
    }
  }, [driftHistory]);

  const hasData = driftHistory.length > 0;

  // Calculate drift distribution for histogram
  const driftDistribution = React.useMemo(() => {
    if (driftHistory.length === 0) return { excellent: 0, good: 0, poor: 0 };
    
    let excellent = 0;
    let good = 0;
    let poor = 0;
    
    driftHistory.forEach((entry) => {
      const absDrift = Math.abs(entry.driftMs);
      if (absDrift < 50) excellent++;
      else if (absDrift < 100) good++;
      else poor++;
    });
    
    return {
      excellent: Math.round((excellent / driftHistory.length) * 100),
      good: Math.round((good / driftHistory.length) * 100),
      poor: Math.round((poor / driftHistory.length) * 100),
    };
  }, [driftHistory]);

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
                d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
              Drift Over Time
            </h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              Last {driftHistory.length} measurements
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

      {/* Threshold Legend */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4 text-caption">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-success" />
            <span className="text-[var(--text-muted)]">±50ms (Excellent)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-warning" />
            <span className="text-[var(--text-muted)]">±100ms (Good)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-error" />
            <span className="text-[var(--text-muted)]">&gt;±100ms (Poor)</span>
          </div>
        </div>
      </div>

      {/* Chart Container */}
      {hasData ? (
        <>
          <div className="h-64 w-full mb-6">
            <Line ref={chartRef} data={chartData} options={chartOptions} />
          </div>

          {/* Distribution Bar */}
          <div className="space-y-2">
            <p className="text-body-sm font-medium text-[var(--text-secondary)]">
              Drift Distribution
            </p>
            <div className="h-4 rounded-full overflow-hidden flex neu-pressed">
              {driftDistribution.excellent > 0 && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${driftDistribution.excellent}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="bg-success h-full"
                  title={`Excellent: ${driftDistribution.excellent}%`}
                />
              )}
              {driftDistribution.good > 0 && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${driftDistribution.good}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
                  className="bg-warning h-full"
                  title={`Good: ${driftDistribution.good}%`}
                />
              )}
              {driftDistribution.poor > 0 && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${driftDistribution.poor}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
                  className="bg-error h-full"
                  title={`Poor: ${driftDistribution.poor}%`}
                />
              )}
            </div>
            <div className="flex justify-between text-caption text-[var(--text-muted)]">
              <span>Excellent: {driftDistribution.excellent}%</span>
              <span>Good: {driftDistribution.good}%</span>
              <span>Poor: {driftDistribution.poor}%</span>
            </div>
          </div>
        </>
      ) : (
        /* Empty State */
        <div className="h-64 flex items-center justify-center">
          <div className="text-center">
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
                  d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                />
              </svg>
            </div>
            <p className="text-body text-[var(--text-muted)] mb-2">
              No drift data yet
            </p>
            <p className="text-body-sm text-[var(--text-muted)]">
              Drift measurements will appear here when timer ticks are received
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default DriftChart;
