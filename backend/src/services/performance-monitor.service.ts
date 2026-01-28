/**
 * Performance Monitor Service
 * 
 * Monitors and records latency metrics for all operations in the system.
 * Calculates statistical metrics (min, max, avg, p50, p95, p99) and
 * triggers alerts when thresholds are exceeded.
 * 
 * Features:
 * - Record latency for different operation types (websocket, database, scoring)
 * - Calculate percentiles (p50, p95, p99) for latency distribution
 * - Trigger alerts when latency exceeds thresholds (e.g., >200ms)
 * - Configurable thresholds per operation type
 * - Automatic metric cleanup to prevent memory growth
 * 
 * Requirements: 11.3, 11.9
 */

import { EventEmitter } from 'events';

/**
 * Operation types that can be monitored
 */
export type OperationType = 
  | 'websocket_latency'
  | 'websocket_broadcast'
  | 'database_read'
  | 'database_write'
  | 'redis_read'
  | 'redis_write'
  | 'scoring_calculation'
  | 'answer_submission'
  | 'leaderboard_update'
  | 'session_recovery'
  | 'timer_sync'
  | string; // Allow custom operation types

/**
 * Statistical metrics for an operation
 */
export interface LatencyStats {
  operation: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  timestamp: string;
}

/**
 * Alert information when threshold is exceeded
 */
export interface PerformanceAlert {
  type: 'HIGH_LATENCY' | 'CRITICAL_LATENCY' | 'THRESHOLD_EXCEEDED';
  operation: string;
  message: string;
  currentValue: number;
  threshold: number;
  stats: LatencyStats;
  timestamp: string;
}

/**
 * Threshold configuration for an operation
 */
export interface ThresholdConfig {
  /** Warning threshold in milliseconds */
  warning: number;
  /** Critical threshold in milliseconds */
  critical: number;
}

/**
 * Performance monitor configuration
 */
export interface PerformanceMonitorConfig {
  /** Maximum number of samples to keep per operation (default: 1000) */
  maxSamplesPerOperation: number;
  /** Default warning threshold in ms (default: 100) */
  defaultWarningThreshold: number;
  /** Default critical threshold in ms (default: 200) */
  defaultCriticalThreshold: number;
  /** Enable automatic threshold checking (default: true) */
  enableAutoCheck: boolean;
  /** Interval for automatic threshold checking in ms (default: 5000) */
  autoCheckInterval: number;
  /** Custom thresholds per operation type */
  thresholds: Map<string, ThresholdConfig>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: PerformanceMonitorConfig = {
  maxSamplesPerOperation: 1000,
  defaultWarningThreshold: 100,
  defaultCriticalThreshold: 200,
  enableAutoCheck: true,
  autoCheckInterval: 5000,
  thresholds: new Map([
    ['websocket_latency', { warning: 100, critical: 200 }],
    ['websocket_broadcast', { warning: 100, critical: 200 }],
    ['database_read', { warning: 50, critical: 100 }],
    ['database_write', { warning: 100, critical: 200 }],
    ['redis_read', { warning: 10, critical: 50 }],
    ['redis_write', { warning: 20, critical: 50 }],
    ['scoring_calculation', { warning: 50, critical: 100 }],
    ['answer_submission', { warning: 100, critical: 200 }],
    ['leaderboard_update', { warning: 100, critical: 200 }],
    ['session_recovery', { warning: 200, critical: 500 }],
    ['timer_sync', { warning: 50, critical: 100 }],
  ]),
};

/**
 * Performance Monitor Service
 * 
 * Records latency metrics for all operations and triggers alerts
 * when thresholds are exceeded.
 */
class PerformanceMonitorService extends EventEmitter {
  private metrics: Map<string, number[]> = new Map();
  private config: PerformanceMonitorConfig;
  private checkInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  constructor(config: Partial<PerformanceMonitorConfig> = {}) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      thresholds: config.thresholds || new Map(DEFAULT_CONFIG.thresholds),
    };
  }

  /**
   * Record a latency measurement for an operation
   * 
   * @param operation - The operation type being measured
   * @param latencyMs - The latency in milliseconds
   */
  recordLatency(operation: OperationType, latencyMs: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }

    const samples = this.metrics.get(operation)!;
    samples.push(latencyMs);

    // Trim to max samples to prevent memory growth
    if (samples.length > this.config.maxSamplesPerOperation) {
      samples.shift();
    }

    // Check threshold immediately for this operation
    this.checkOperationThreshold(operation, latencyMs);
  }

  /**
   * Record latency using a timer helper
   * Returns a function to call when the operation completes
   * 
   * @param operation - The operation type being measured
   * @returns A function to call when the operation completes
   */
  startTimer(operation: OperationType): () => number {
    const startTime = Date.now();
    return () => {
      const latencyMs = Date.now() - startTime;
      this.recordLatency(operation, latencyMs);
      return latencyMs;
    };
  }

  /**
   * Measure an async operation's latency
   * 
   * @param operation - The operation type being measured
   * @param fn - The async function to measure
   * @returns The result of the function
   */
  async measure<T>(operation: OperationType, fn: () => Promise<T>): Promise<T> {
    const endTimer = this.startTimer(operation);
    try {
      const result = await fn();
      endTimer();
      return result;
    } catch (error) {
      endTimer();
      throw error;
    }
  }

  /**
   * Get statistics for a specific operation
   * 
   * @param operation - The operation type to get stats for
   * @returns Statistics or null if no data
   */
  getStats(operation: string): LatencyStats | null {
    const values = this.metrics.get(operation);
    if (!values || values.length === 0) {
      return null;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      operation,
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: Math.round((values.reduce((a, b) => a + b, 0) / count) * 100) / 100,
      p50: this.getPercentile(sorted, 50),
      p95: this.getPercentile(sorted, 95),
      p99: this.getPercentile(sorted, 99),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get statistics for all operations
   * 
   * @returns Map of operation to statistics
   */
  getAllStats(): Map<string, LatencyStats> {
    const allStats = new Map<string, LatencyStats>();
    
    for (const operation of this.metrics.keys()) {
      const stats = this.getStats(operation);
      if (stats) {
        allStats.set(operation, stats);
      }
    }

    return allStats;
  }

  /**
   * Get all stats as an array (useful for serialization)
   */
  getAllStatsArray(): LatencyStats[] {
    return Array.from(this.getAllStats().values());
  }

  /**
   * Calculate percentile value from sorted array
   * 
   * @param sorted - Sorted array of values
   * @param percentile - Percentile to calculate (0-100)
   * @returns The percentile value
   */
  private getPercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];

    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    const clampedIndex = Math.max(0, Math.min(index, sorted.length - 1));
    return sorted[clampedIndex];
  }

  /**
   * Get threshold configuration for an operation
   * 
   * @param operation - The operation type
   * @returns Threshold configuration
   */
  getThreshold(operation: string): ThresholdConfig {
    return this.config.thresholds.get(operation) || {
      warning: this.config.defaultWarningThreshold,
      critical: this.config.defaultCriticalThreshold,
    };
  }

  /**
   * Set threshold for an operation
   * 
   * @param operation - The operation type
   * @param threshold - The threshold configuration
   */
  setThreshold(operation: string, threshold: ThresholdConfig): void {
    this.config.thresholds.set(operation, threshold);
  }

  /**
   * Check if a single latency value exceeds thresholds
   * 
   * @param operation - The operation type
   * @param latencyMs - The latency value to check
   */
  private checkOperationThreshold(operation: string, latencyMs: number): void {
    const threshold = this.getThreshold(operation);

    if (latencyMs >= threshold.critical) {
      this.triggerAlert({
        type: 'CRITICAL_LATENCY',
        operation,
        message: `Critical latency detected for ${operation}: ${latencyMs}ms exceeds ${threshold.critical}ms threshold`,
        currentValue: latencyMs,
        threshold: threshold.critical,
        stats: this.getStats(operation)!,
        timestamp: new Date().toISOString(),
      });
    } else if (latencyMs >= threshold.warning) {
      this.triggerAlert({
        type: 'HIGH_LATENCY',
        operation,
        message: `High latency warning for ${operation}: ${latencyMs}ms exceeds ${threshold.warning}ms threshold`,
        currentValue: latencyMs,
        threshold: threshold.warning,
        stats: this.getStats(operation)!,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Check all operations against their thresholds (using p95)
   */
  checkThresholds(): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];

    for (const operation of this.metrics.keys()) {
      const stats = this.getStats(operation);
      if (!stats) continue;

      const threshold = this.getThreshold(operation);

      // Check p95 against thresholds
      if (stats.p95 >= threshold.critical) {
        const alert: PerformanceAlert = {
          type: 'CRITICAL_LATENCY',
          operation,
          message: `Critical: ${operation} P95 latency ${stats.p95}ms exceeds ${threshold.critical}ms threshold`,
          currentValue: stats.p95,
          threshold: threshold.critical,
          stats,
          timestamp: new Date().toISOString(),
        };
        alerts.push(alert);
        this.triggerAlert(alert);
      } else if (stats.p95 >= threshold.warning) {
        const alert: PerformanceAlert = {
          type: 'HIGH_LATENCY',
          operation,
          message: `Warning: ${operation} P95 latency ${stats.p95}ms exceeds ${threshold.warning}ms threshold`,
          currentValue: stats.p95,
          threshold: threshold.warning,
          stats,
          timestamp: new Date().toISOString(),
        };
        alerts.push(alert);
        this.triggerAlert(alert);
      }
    }

    return alerts;
  }

  /**
   * Trigger an alert
   * 
   * @param alert - The alert to trigger
   */
  private triggerAlert(alert: PerformanceAlert): void {
    // Log the alert
    if (alert.type === 'CRITICAL_LATENCY') {
      console.error(`[Performance Monitor] ALERT [${alert.type}]: ${alert.message}`);
    } else {
      console.warn(`[Performance Monitor] ALERT [${alert.type}]: ${alert.message}`);
    }

    // Emit event for external handlers
    this.emit('alert', alert);

    // Emit specific event type
    this.emit(alert.type.toLowerCase(), alert);
  }

  /**
   * Start automatic threshold monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      console.warn('[Performance Monitor] Already monitoring');
      return;
    }

    console.log('[Performance Monitor] Starting performance monitoring...');
    this.isMonitoring = true;

    if (this.config.enableAutoCheck) {
      this.checkInterval = setInterval(() => {
        this.checkThresholds();
      }, this.config.autoCheckInterval);
    }
  }

  /**
   * Stop automatic threshold monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    console.log('[Performance Monitor] Stopping performance monitoring...');

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.isMonitoring = false;
  }

  /**
   * Check if monitoring is active
   */
  isMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * Clear metrics for a specific operation
   * 
   * @param operation - The operation to clear metrics for
   */
  clearMetrics(operation: string): void {
    this.metrics.delete(operation);
  }

  /**
   * Clear all metrics
   */
  clearAllMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Get a summary of all operations
   */
  getSummary(): string {
    const stats = this.getAllStatsArray();
    if (stats.length === 0) {
      return 'No metrics recorded';
    }

    return stats
      .map(s => `${s.operation}: avg=${s.avg}ms, p95=${s.p95}ms, p99=${s.p99}ms (n=${s.count})`)
      .join('\n');
  }

  /**
   * Get operations that are currently exceeding thresholds
   */
  getExceedingThresholds(): { operation: string; stats: LatencyStats; threshold: ThresholdConfig; severity: 'warning' | 'critical' }[] {
    const exceeding: { operation: string; stats: LatencyStats; threshold: ThresholdConfig; severity: 'warning' | 'critical' }[] = [];

    for (const operation of this.metrics.keys()) {
      const stats = this.getStats(operation);
      if (!stats) continue;

      const threshold = this.getThreshold(operation);

      if (stats.p95 >= threshold.critical) {
        exceeding.push({ operation, stats, threshold, severity: 'critical' });
      } else if (stats.p95 >= threshold.warning) {
        exceeding.push({ operation, stats, threshold, severity: 'warning' });
      }
    }

    return exceeding;
  }

  /**
   * Update configuration
   * 
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<PerformanceMonitorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    // Merge thresholds if provided
    if (config.thresholds) {
      for (const [key, value] of config.thresholds) {
        this.config.thresholds.set(key, value);
      }
    }

    console.log('[Performance Monitor] Configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): PerformanceMonitorConfig {
    return { ...this.config };
  }

  /**
   * Reset the service (for testing)
   */
  reset(): void {
    this.stopMonitoring();
    this.clearAllMetrics();
    this.removeAllListeners();
  }
}

// Export singleton instance
export const performanceMonitorService = new PerformanceMonitorService();

// Export class for testing
export { PerformanceMonitorService };
