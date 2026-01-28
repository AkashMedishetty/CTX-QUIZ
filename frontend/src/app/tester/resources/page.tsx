/**
 * Resource Monitoring Page
 * 
 * Displays system resource usage metrics with:
 * - ResourceMonitorCard for real-time metrics
 * - Historical charts for CPU and memory over time
 * - Server uptime display
 * 
 * Requirements: 15.5
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { DynamicResourceMonitorCard } from '@/lib/dynamic-imports';
import type { SystemMetrics } from '../components/resource-monitor-card';

/**
 * Historical data point for charts
 */
interface HistoryDataPoint {
  timestamp: Date;
  cpu: number;
  memory: number;
}

/**
 * Maximum number of history points to keep
 */
const MAX_HISTORY_POINTS = 60;

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
 * Get color based on usage percentage
 */
function getUsageColor(percentage: number): string {
  if (percentage < 60) return '#22C55E'; // success
  if (percentage < 80) return '#F59E0B'; // warning
  return '#EF4444'; // error
}

/**
 * Simple line chart component for historical data
 */
function HistoryChart({
  data,
  dataKey,
  label,
  color,
}: {
  data: HistoryDataPoint[];
  dataKey: 'cpu' | 'memory';
  label: string;
  color: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Set canvas size accounting for device pixel ratio
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background grid
    ctx.strokeStyle = 'rgba(200, 204, 208, 0.3)';
    ctx.lineWidth = 1;

    // Horizontal grid lines (0%, 25%, 50%, 75%, 100%)
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // Y-axis labels
      ctx.fillStyle = 'rgba(100, 100, 100, 0.8)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${100 - i * 25}%`, padding.left - 5, y + 3);
    }

    // Draw data line
    if (data.length > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      data.forEach((point, index) => {
        const x = padding.left + (index / (data.length - 1)) * chartWidth;
        const y = padding.top + ((100 - point[dataKey]) / 100) * chartHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw gradient fill under the line
      const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
      gradient.addColorStop(0, `${color}40`);
      gradient.addColorStop(1, `${color}05`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      data.forEach((point, index) => {
        const x = padding.left + (index / (data.length - 1)) * chartWidth;
        const y = padding.top + ((100 - point[dataKey]) / 100) * chartHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
      ctx.lineTo(padding.left, padding.top + chartHeight);
      ctx.closePath();
      ctx.fill();

      // Draw current value dot
      const lastPoint = data[data.length - 1];
      const lastX = padding.left + chartWidth;
      const lastY = padding.top + ((100 - lastPoint[dataKey]) / 100) * chartHeight;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw current value label
      ctx.fillStyle = color;
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(lastPoint[dataKey])}%`, lastX - 10, lastY - 8);
    }

    // X-axis label
    ctx.fillStyle = 'rgba(100, 100, 100, 0.8)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time →', width / 2, height - 5);
  }, [data, dataKey, color]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised rounded-lg p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-body-sm font-medium text-[var(--text-secondary)]">
          {label}
        </h3>
        {data.length > 0 && (
          <span
            className="text-body-sm font-bold"
            style={{ color }}
          >
            {Math.round(data[data.length - 1][dataKey])}%
          </span>
        )}
      </div>
      <div className="relative h-40 w-full">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ width: '100%', height: '100%' }}
        />
        {data.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-body-sm text-[var(--text-muted)]">
              Waiting for data...
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Uptime display component
 */
function UptimeDisplay({ uptime }: { uptime: number }) {
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised rounded-lg p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-success"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
            />
          </svg>
        </div>
        <div>
          <h3 className="text-h3 font-semibold text-[var(--text-primary)]">
            Server Uptime
          </h3>
          <p className="text-body-sm text-[var(--text-muted)]">
            Time since last restart
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg p-3 bg-[var(--neu-surface)] neu-pressed text-center">
          <p className="text-h2 font-display font-bold text-primary">{days}</p>
          <p className="text-caption text-[var(--text-muted)]">Days</p>
        </div>
        <div className="rounded-lg p-3 bg-[var(--neu-surface)] neu-pressed text-center">
          <p className="text-h2 font-display font-bold text-primary">{hours}</p>
          <p className="text-caption text-[var(--text-muted)]">Hours</p>
        </div>
        <div className="rounded-lg p-3 bg-[var(--neu-surface)] neu-pressed text-center">
          <p className="text-h2 font-display font-bold text-primary">{minutes}</p>
          <p className="text-caption text-[var(--text-muted)]">Minutes</p>
        </div>
        <div className="rounded-lg p-3 bg-[var(--neu-surface)] neu-pressed text-center">
          <p className="text-h2 font-display font-bold text-primary">{seconds}</p>
          <p className="text-caption text-[var(--text-muted)]">Seconds</p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--neu-shadow-dark)]/10">
        <div className="flex items-center justify-between text-body-sm">
          <span className="text-[var(--text-muted)]">Total Uptime</span>
          <span className="font-medium text-[var(--text-primary)]">
            {formatUptime(uptime)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Resource Monitoring Page Component
 */
export default function ResourcesPage() {
  const [history, setHistory] = React.useState<HistoryDataPoint[]>([]);
  const [currentUptime, setCurrentUptime] = React.useState<number>(0);

  /**
   * Handle metrics update from ResourceMonitorCard
   */
  const handleMetricsUpdate = React.useCallback((metrics: SystemMetrics) => {
    setCurrentUptime(metrics.uptime);

    setHistory((prev) => {
      const newPoint: HistoryDataPoint = {
        timestamp: new Date(),
        cpu: metrics.cpu.usage,
        memory: metrics.memory.usagePercentage,
      };

      const updated = [...prev, newPoint];

      // Keep only the last MAX_HISTORY_POINTS
      if (updated.length > MAX_HISTORY_POINTS) {
        return updated.slice(-MAX_HISTORY_POINTS);
      }

      return updated;
    });
  }, []);

  // Get current values for chart colors
  const currentCpu = history.length > 0 ? history[history.length - 1].cpu : 0;
  const currentMemory = history.length > 0 ? history[history.length - 1].memory : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-h1 font-semibold text-[var(--text-primary)] mb-2">
          Resource Monitoring
        </h1>
        <p className="text-body text-[var(--text-muted)]">
          Monitor system resource usage in real-time. Track CPU, memory, and network metrics
          to ensure optimal performance during load testing.
        </p>
      </motion.div>

      {/* Main Resource Monitor Card */}
      <DynamicResourceMonitorCard
        pollInterval={3000}
        autoStart={true}
        onMetricsUpdate={handleMetricsUpdate}
        apiBaseUrl={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}
      />

      {/* Historical Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <HistoryChart
          data={history}
          dataKey="cpu"
          label="CPU Usage History"
          color={getUsageColor(currentCpu)}
        />
        <HistoryChart
          data={history}
          dataKey="memory"
          label="Memory Usage History"
          color={getUsageColor(currentMemory)}
        />
      </div>

      {/* Server Uptime */}
      <UptimeDisplay uptime={currentUptime} />

      {/* Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="neu-raised rounded-lg p-6"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center flex-shrink-0">
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
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-body-lg font-semibold text-[var(--text-primary)] mb-2">
              About Resource Monitoring
            </h3>
            <div className="space-y-2 text-body-sm text-[var(--text-secondary)]">
              <p>
                This page displays real-time system resource metrics from the backend server.
                Use it during load testing to monitor server health and identify performance bottlenecks.
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  <span className="text-success font-medium">Green (&lt;60%)</span> - Normal operation
                </li>
                <li>
                  <span className="text-warning font-medium">Yellow (60-80%)</span> - Elevated usage, monitor closely
                </li>
                <li>
                  <span className="text-error font-medium">Red (&gt;=80%)</span> - Critical, may affect performance
                </li>
              </ul>
              <p className="mt-3">
                Historical charts show the last {MAX_HISTORY_POINTS} data points, updating every 3 seconds.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
