/**
 * Performance Logging Service
 * 
 * Integrates performance monitoring with application logging.
 * Provides hooks for logging:
 * - Slow operations (>200ms)
 * - High CPU/memory usage (>80%)
 * - WebSocket latency spikes
 * 
 * Requirements: 11.3, 11.9
 */

import { EventEmitter } from 'events';
import { 
  performanceMonitorService, 
  PerformanceAlert,
  OperationType,
  LatencyStats,
} from './performance-monitor.service';
import { 
  resourceMonitorService, 
  ResourceExhaustionStatus,
  ResourceUsage,
} from './resource-monitor.service';

/**
 * Performance log entry
 */
export interface PerformanceLogEntry {
  timestamp: string;
  type: 'SLOW_OPERATION' | 'HIGH_CPU' | 'HIGH_MEMORY' | 'WEBSOCKET_LATENCY_SPIKE' | 'RESOURCE_WARNING' | 'RESOURCE_EXHAUSTION';
  severity: 'warning' | 'critical';
  message: string;
  details: Record<string, any>;
}

/**
 * Performance logging configuration
 */
export interface PerformanceLoggingConfig {
  /** Threshold for slow operations in ms (default: 200) */
  slowOperationThreshold: number;
  /** CPU usage threshold percentage (default: 80) */
  cpuThreshold: number;
  /** Memory usage threshold percentage (default: 80) */
  memoryThreshold: number;
  /** WebSocket latency spike threshold in ms (default: 200) */
  websocketLatencyThreshold: number;
  /** Enable console logging (default: true) */
  enableConsoleLogging: boolean;
  /** Enable event emission (default: true) */
  enableEventEmission: boolean;
  /** Resource check interval in ms (default: 5000) */
  resourceCheckInterval: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: PerformanceLoggingConfig = {
  slowOperationThreshold: 200,
  cpuThreshold: 80,
  memoryThreshold: 80,
  websocketLatencyThreshold: 200,
  enableConsoleLogging: true,
  enableEventEmission: true,
  resourceCheckInterval: 5000,
};

/**
 * Performance Logging Service
 * 
 * Centralizes performance logging and integrates with existing
 * performance and resource monitoring services.
 */
class PerformanceLoggingService extends EventEmitter {
  private config: PerformanceLoggingConfig;
  private isInitialized: boolean = false;
  private logHistory: PerformanceLogEntry[] = [];
  private maxLogHistory: number = 1000;
  private resourceCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<PerformanceLoggingConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize performance logging
   * 
   * Sets up listeners for performance alerts and resource monitoring events.
   */
  initialize(): void {
    if (this.isInitialized) {
      console.warn('[Performance Logging] Already initialized');
      return;
    }

    console.log('[Performance Logging] Initializing performance logging service...');
    console.log('[Performance Logging] Configuration:', {
      slowOperationThreshold: `${this.config.slowOperationThreshold}ms`,
      cpuThreshold: `${this.config.cpuThreshold}%`,
      memoryThreshold: `${this.config.memoryThreshold}%`,
      websocketLatencyThreshold: `${this.config.websocketLatencyThreshold}ms`,
    });

    // Set up performance monitor alert listeners
    this.setupPerformanceMonitorListeners();

    // Set up resource monitor listeners
    this.setupResourceMonitorListeners();

    // Start periodic resource checking
    this.startResourceChecking();

    // Start performance monitoring if not already started
    if (!performanceMonitorService.isMonitoringActive()) {
      performanceMonitorService.startMonitoring();
    }

    this.isInitialized = true;
    console.log('[Performance Logging] Service initialized successfully');
  }

  /**
   * Set up listeners for performance monitor alerts
   */
  private setupPerformanceMonitorListeners(): void {
    // Listen for all performance alerts
    performanceMonitorService.on('alert', (alert: PerformanceAlert) => {
      this.handlePerformanceAlert(alert);
    });

    // Listen for critical latency alerts specifically
    performanceMonitorService.on('critical_latency', (alert: PerformanceAlert) => {
      this.logSlowOperation(alert.operation, alert.currentValue, alert.stats);
    });

    // Listen for high latency warnings
    performanceMonitorService.on('high_latency', (alert: PerformanceAlert) => {
      // Only log if it exceeds our slow operation threshold
      if (alert.currentValue >= this.config.slowOperationThreshold) {
        this.logSlowOperation(alert.operation, alert.currentValue, alert.stats);
      }
    });

    console.log('[Performance Logging] Performance monitor listeners configured');
  }

  /**
   * Set up listeners for resource monitor events
   */
  private setupResourceMonitorListeners(): void {
    // Listen for resource warnings
    resourceMonitorService.on('warning', (event: { status: ResourceExhaustionStatus }) => {
      this.handleResourceWarning(event.status);
    });

    // Listen for resource exhaustion
    resourceMonitorService.on('exhaustion', (event: { status: ResourceExhaustionStatus }) => {
      this.handleResourceExhaustion(event.status);
    });

    // Listen for metrics updates
    resourceMonitorService.on('metrics', (event: { status: ResourceExhaustionStatus; usage: ResourceUsage }) => {
      // Check if CPU or memory exceeds our thresholds
      if (event.status.cpuUsage >= this.config.cpuThreshold) {
        this.logHighCpuUsage(event.status.cpuUsage, event.usage);
      }
      if (event.status.memoryUsage >= this.config.memoryThreshold) {
        this.logHighMemoryUsage(event.status.memoryUsage, event.usage);
      }
    });

    console.log('[Performance Logging] Resource monitor listeners configured');
  }

  /**
   * Start periodic resource checking
   */
  private startResourceChecking(): void {
    if (this.resourceCheckInterval) {
      return;
    }

    this.resourceCheckInterval = setInterval(() => {
      this.checkResources();
    }, this.config.resourceCheckInterval);

    // Perform initial check
    this.checkResources();
  }

  /**
   * Stop periodic resource checking
   */
  private stopResourceChecking(): void {
    if (this.resourceCheckInterval) {
      clearInterval(this.resourceCheckInterval);
      this.resourceCheckInterval = null;
    }
  }

  /**
   * Check current resource usage and log if thresholds exceeded
   */
  private checkResources(): void {
    const status = resourceMonitorService.checkResourceExhaustion();
    const usage = resourceMonitorService.getResourceUsage();

    // Log high CPU usage
    if (status.cpuUsage >= this.config.cpuThreshold) {
      this.logHighCpuUsage(status.cpuUsage, usage);
    }

    // Log high memory usage
    if (status.memoryUsage >= this.config.memoryThreshold) {
      this.logHighMemoryUsage(status.memoryUsage, usage);
    }
  }

  /**
   * Handle performance alert from performance monitor
   */
  private handlePerformanceAlert(alert: PerformanceAlert): void {
    // Check if this is a WebSocket latency spike
    if (this.isWebSocketOperation(alert.operation)) {
      if (alert.currentValue >= this.config.websocketLatencyThreshold) {
        this.logWebSocketLatencySpike(alert.operation, alert.currentValue, alert.stats);
      }
    }
  }

  /**
   * Handle resource warning event
   */
  private handleResourceWarning(status: ResourceExhaustionStatus): void {
    const entry: PerformanceLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'RESOURCE_WARNING',
      severity: 'warning',
      message: status.message,
      details: {
        cpuUsage: status.cpuUsage,
        memoryUsage: status.memoryUsage,
        cpuWarning: status.cpuWarning,
        memoryWarning: status.memoryWarning,
      },
    };

    this.logEntry(entry);
  }

  /**
   * Handle resource exhaustion event
   */
  private handleResourceExhaustion(status: ResourceExhaustionStatus): void {
    const entry: PerformanceLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'RESOURCE_EXHAUSTION',
      severity: 'critical',
      message: status.message,
      details: {
        cpuUsage: status.cpuUsage,
        memoryUsage: status.memoryUsage,
        cpuExhausted: status.cpuExhausted,
        memoryExhausted: status.memoryExhausted,
      },
    };

    this.logEntry(entry);
  }

  /**
   * Log a slow operation (>200ms)
   * 
   * Requirements: 11.3
   */
  logSlowOperation(operation: string, latencyMs: number, stats?: LatencyStats): void {
    const entry: PerformanceLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'SLOW_OPERATION',
      severity: latencyMs >= this.config.slowOperationThreshold * 2 ? 'critical' : 'warning',
      message: `Slow operation detected: ${operation} took ${latencyMs}ms (threshold: ${this.config.slowOperationThreshold}ms)`,
      details: {
        operation,
        latencyMs,
        threshold: this.config.slowOperationThreshold,
        stats: stats ? {
          count: stats.count,
          avg: stats.avg,
          p95: stats.p95,
          p99: stats.p99,
          max: stats.max,
        } : undefined,
      },
    };

    this.logEntry(entry);
  }

  /**
   * Log high CPU usage (>80%)
   * 
   * Requirements: 11.9
   */
  logHighCpuUsage(cpuUsage: number, usage?: ResourceUsage): void {
    const entry: PerformanceLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'HIGH_CPU',
      severity: cpuUsage >= 90 ? 'critical' : 'warning',
      message: `High CPU usage: ${cpuUsage.toFixed(1)}% (threshold: ${this.config.cpuThreshold}%)`,
      details: {
        cpuUsage,
        threshold: this.config.cpuThreshold,
        cores: usage?.cpu.cores,
        loadAverage: usage?.cpu.loadAverage,
      },
    };

    this.logEntry(entry);
  }

  /**
   * Log high memory usage (>80%)
   * 
   * Requirements: 11.9
   */
  logHighMemoryUsage(memoryUsage: number, usage?: ResourceUsage): void {
    const entry: PerformanceLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'HIGH_MEMORY',
      severity: memoryUsage >= 90 ? 'critical' : 'warning',
      message: `High memory usage: ${memoryUsage.toFixed(1)}% (threshold: ${this.config.memoryThreshold}%)`,
      details: {
        memoryUsage,
        threshold: this.config.memoryThreshold,
        totalMemory: usage?.memory.total,
        usedMemory: usage?.memory.used,
        freeMemory: usage?.memory.free,
        heapUsage: usage?.memory.heap.usagePercentage,
        rss: usage?.memory.rss,
      },
    };

    this.logEntry(entry);
  }

  /**
   * Log WebSocket latency spike
   * 
   * Requirements: 5.8, 11.3
   */
  logWebSocketLatencySpike(operation: string, latencyMs: number, stats?: LatencyStats): void {
    const entry: PerformanceLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'WEBSOCKET_LATENCY_SPIKE',
      severity: latencyMs >= this.config.websocketLatencyThreshold * 2 ? 'critical' : 'warning',
      message: `WebSocket latency spike: ${operation} - ${latencyMs}ms (threshold: ${this.config.websocketLatencyThreshold}ms)`,
      details: {
        operation,
        latencyMs,
        threshold: this.config.websocketLatencyThreshold,
        stats: stats ? {
          count: stats.count,
          avg: stats.avg,
          p95: stats.p95,
          p99: stats.p99,
          max: stats.max,
        } : undefined,
      },
    };

    this.logEntry(entry);
  }

  /**
   * Check if an operation is WebSocket-related
   */
  private isWebSocketOperation(operation: string): boolean {
    const websocketOperations = [
      'websocket_latency',
      'websocket_broadcast',
      'timer_sync',
      'answer_submission',
      'leaderboard_update',
      'session_recovery',
    ];
    return websocketOperations.includes(operation) || operation.startsWith('websocket_');
  }

  /**
   * Log a performance entry
   */
  private logEntry(entry: PerformanceLogEntry): void {
    // Add to history
    this.logHistory.push(entry);
    
    // Trim history if needed
    if (this.logHistory.length > this.maxLogHistory) {
      this.logHistory.shift();
    }

    // Console logging
    if (this.config.enableConsoleLogging) {
      const logMethod = entry.severity === 'critical' ? console.error : console.warn;
      logMethod(`[Performance Logging] [${entry.type}] ${entry.message}`, entry.details);
    }

    // Event emission
    if (this.config.enableEventEmission) {
      this.emit('log', entry);
      this.emit(entry.type.toLowerCase(), entry);
    }
  }

  /**
   * Record operation latency and log if slow
   * 
   * Convenience method that wraps performanceMonitorService.recordLatency
   * and automatically logs slow operations.
   */
  recordLatency(operation: OperationType, latencyMs: number): void {
    // Record in performance monitor
    performanceMonitorService.recordLatency(operation, latencyMs);

    // Log if slow
    if (latencyMs >= this.config.slowOperationThreshold) {
      const stats = performanceMonitorService.getStats(operation);
      this.logSlowOperation(operation, latencyMs, stats || undefined);
    }

    // Log WebSocket latency spikes
    if (this.isWebSocketOperation(operation) && latencyMs >= this.config.websocketLatencyThreshold) {
      const stats = performanceMonitorService.getStats(operation);
      this.logWebSocketLatencySpike(operation, latencyMs, stats || undefined);
    }
  }

  /**
   * Create a timer for measuring operation latency
   * 
   * Returns a function to call when the operation completes.
   * Automatically records and logs the latency.
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
   * Automatically records and logs the latency.
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
   * Get recent log entries
   */
  getRecentLogs(count: number = 100): PerformanceLogEntry[] {
    return this.logHistory.slice(-count);
  }

  /**
   * Get logs by type
   */
  getLogsByType(type: PerformanceLogEntry['type']): PerformanceLogEntry[] {
    return this.logHistory.filter(entry => entry.type === type);
  }

  /**
   * Get logs by severity
   */
  getLogsBySeverity(severity: 'warning' | 'critical'): PerformanceLogEntry[] {
    return this.logHistory.filter(entry => entry.severity === severity);
  }

  /**
   * Get log summary
   */
  getLogSummary(): {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    recentCritical: number;
  } {
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = { warning: 0, critical: 0 };
    
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    let recentCritical = 0;

    for (const entry of this.logHistory) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      bySeverity[entry.severity]++;
      
      if (entry.severity === 'critical' && new Date(entry.timestamp).getTime() > fiveMinutesAgo) {
        recentCritical++;
      }
    }

    return {
      total: this.logHistory.length,
      byType,
      bySeverity,
      recentCritical,
    };
  }

  /**
   * Clear log history
   */
  clearLogs(): void {
    this.logHistory = [];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PerformanceLoggingConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[Performance Logging] Configuration updated:', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): PerformanceLoggingConfig {
    return { ...this.config };
  }

  /**
   * Check if service is initialized
   */
  isServiceInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    if (!this.isInitialized) {
      return;
    }

    console.log('[Performance Logging] Shutting down...');

    // Stop resource checking
    this.stopResourceChecking();

    // Remove all listeners
    this.removeAllListeners();

    // Clear log history
    this.clearLogs();

    this.isInitialized = false;
    console.log('[Performance Logging] Service shut down');
  }

  /**
   * Reset the service (for testing)
   */
  reset(): void {
    this.shutdown();
    this.config = { ...DEFAULT_CONFIG };
  }
}

// Export singleton instance
export const performanceLoggingService = new PerformanceLoggingService();

// Export class for testing
export { PerformanceLoggingService };
