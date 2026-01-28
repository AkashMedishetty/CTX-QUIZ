/**
 * Latency Chart Component
 * 
 * Displays real-time latency data using Chart.js:
 * - Line chart showing latency over time
 * - Threshold lines at 50ms and 100ms
 * - Real-time updates as new data comes in
 * 
 * Requirements: 15.2
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
import type { LatencyHistoryEntry } from '@/lib/load-tester';

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
 * Props for LatencyChart
 */
interface LatencyChartProps {
  /** Latency history data */
  latencyHistory: LatencyHistoryEntry[];
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
 * Get point color based on latency value
 */
function getPointColor(latency: number): string {
  if (latency < 50) return '#22C55E'; // Success green
  if (latency < 100) return '#F59E0B'; // Warning yellow
  return '#EF4444'; // Error red
}

/**
 * Latency Chart Component
 */
export function LatencyChart({ latencyHistory, isRunning }: LatencyChartProps) {
  const chartRef = React.useRef<ChartJS<'line'>>(null);

  // Prepare chart data
  const chartData: ChartData<'line'> = React.useMemo(() => {
    const labels = latencyHistory.map((entry) => formatTime(entry.timestamp));
    const data = latencyHistory.map((entry) => entry.latencyMs);
    const pointColors = latencyHistory.map((entry) => getPointColor(entry.latencyMs));

    return {
      labels,
      datasets: [
        {
          label: 'Latency (ms)',
          data,
          borderColor: '#275249', // CTX Teal
          backgroundColor: 'rgba(39, 82, 73, 0.1)',
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }, [latencyHistory]);

  // Chart options
  const chartOptions: ChartOptions<'line'> = React.useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: isRunning ? 300 : 500,
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
              let status = 'Excellent';
              if (value >= 100) status = 'Poor';
              else if (value >= 50) status = 'Good';
              return [`${value}ms`, status];
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
          min: 0,
          suggestedMax: 150,
          grid: {
            color: 'rgba(200, 204, 208, 0.2)',
          },
          ticks: {
            color: '#6B7280',
            callback: (value) => `${value}ms`,
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
  }, [latencyHistory]);

  const hasData = latencyHistory.length > 0;

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
              Latency Over Time
            </h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              Last {latencyHistory.length} measurements
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
      <div className="flex items-center justify-end gap-4 mb-4 text-caption">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-success" />
          <span className="text-[var(--text-muted)]">&lt; 50ms</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-warning" />
          <span className="text-[var(--text-muted)]">50-100ms</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-error" />
          <span className="text-[var(--text-muted)]">&gt; 100ms</span>
        </div>
      </div>

      {/* Chart Container */}
      {hasData ? (
        <div className="h-64 w-full">
          <Line ref={chartRef} data={chartData} options={chartOptions} />
        </div>
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
              No chart data yet
            </p>
            <p className="text-body-sm text-[var(--text-muted)]">
              Latency data will appear here as answers are submitted
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default LatencyChart;
