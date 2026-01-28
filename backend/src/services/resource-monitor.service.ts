/**
 * Resource Monitor Service
 * 
 * Monitors system resources (CPU and memory) to detect resource exhaustion.
 * Provides methods to check if resources are exhausted (>80% threshold)
 * and emits warnings when approaching threshold (>70%).
 * 
 * Features:
 * - CPU usage monitoring using os module
 * - Memory usage monitoring (heap and RSS)
 * - Configurable thresholds for exhaustion and warning
 * - Event emission for resource warnings
 * - Periodic monitoring with configurable interval
 * 
 * Requirements: 17.9, 11.9
 */

import * as os from 'os';
import { EventEmitter } from 'events';

/**
 * Resource usage snapshot
 */
export interface ResourceUsage {
  cpu: {
    usage: number; // Percentage (0-100)
    cores: number;
    loadAverage: number[];
  };
  memory: {
    total: number; // Bytes
    used: number; // Bytes
    free: number; // Bytes
    usagePercentage: number; // Percentage (0-100)
    heap: {
      total: number; // Bytes
      used: number; // Bytes
      usagePercentage: number; // Percentage (0-100)
    };
    rss: number; // Resident Set Size in bytes
  };
  timestamp: string;
}

/**
 * Resource exhaustion status
 */
export interface ResourceExhaustionStatus {
  isExhausted: boolean;
  isWarning: boolean;
  cpuExhausted: boolean;
  memoryExhausted: boolean;
  cpuWarning: boolean;
  memoryWarning: boolean;
  cpuUsage: number;
  memoryUsage: number;
  message: string;
}

/**
 * Resource monitor configuration
 */
export interface ResourceMonitorConfig {
  /** CPU exhaustion threshold (percentage, default: 80) */
  cpuExhaustionThreshold: number;
  /** Memory exhaustion threshold (percentage, default: 80) */
  memoryExhaustionThreshold: number;
  /** CPU warning threshold (percentage, default: 70) */
  cpuWarningThreshold: number;
  /** Memory warning threshold (percentage, default: 70) */
  memoryWarningThreshold: number;
  /** Monitoring interval in milliseconds (default: 5000) */
  monitoringInterval: number;
  /** Enable automatic monitoring (default: true) */
  enableAutoMonitoring: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ResourceMonitorConfig = {
  cpuExhaustionThreshold: 80,
  memoryExhaustionThreshold: 80,
  cpuWarningThreshold: 70,
  memoryWarningThreshold: 70,
  monitoringInterval: 5000,
  enableAutoMonitoring: true,
};

/**
 * Resource Monitor Service
 * 
 * Monitors system resources and provides methods to check for resource exhaustion.
 * Emits events when resources approach or exceed thresholds.
 */
class ResourceMonitorService extends EventEmitter {
  private config: ResourceMonitorConfig;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastCpuInfo: os.CpuInfo[] | null = null;
  private isMonitoring: boolean = false;

  constructor(config: Partial<ResourceMonitorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   * 
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<ResourceMonitorConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[Resource Monitor] Configuration updated:', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): ResourceMonitorConfig {
    return { ...this.config };
  }

  /**
   * Calculate CPU usage percentage
   * 
   * Uses the difference between two CPU measurements to calculate accurate usage.
   */
  private calculateCpuUsage(): number {
    const cpus = os.cpus();
    
    if (!this.lastCpuInfo) {
      // First measurement - store and return estimate based on load average
      this.lastCpuInfo = cpus;
      
      // Use load average as initial estimate
      const loadAvg = os.loadavg()[0];
      const numCpus = cpus.length;
      return Math.min(100, (loadAvg / numCpus) * 100);
    }

    let totalIdleDiff = 0;
    let totalTickDiff = 0;

    for (let i = 0; i < cpus.length; i++) {
      const cpu = cpus[i];
      const lastCpu = this.lastCpuInfo[i];

      if (!lastCpu) continue;

      const idleDiff = cpu.times.idle - lastCpu.times.idle;
      const totalDiff = 
        (cpu.times.user - lastCpu.times.user) +
        (cpu.times.nice - lastCpu.times.nice) +
        (cpu.times.sys - lastCpu.times.sys) +
        (cpu.times.idle - lastCpu.times.idle) +
        (cpu.times.irq - lastCpu.times.irq);

      totalIdleDiff += idleDiff;
      totalTickDiff += totalDiff;
    }

    // Update last measurement
    this.lastCpuInfo = cpus;

    if (totalTickDiff === 0) {
      return 0;
    }

    const usage = 100 - (100 * totalIdleDiff / totalTickDiff);
    return Math.max(0, Math.min(100, Math.round(usage * 100) / 100));
  }

  /**
   * Get current resource usage
   */
  getResourceUsage(): ResourceUsage {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercentage = (usedMemory / totalMemory) * 100;

    // Get heap memory usage
    const heapStats = process.memoryUsage();
    const heapUsagePercentage = (heapStats.heapUsed / heapStats.heapTotal) * 100;

    return {
      cpu: {
        usage: this.calculateCpuUsage(),
        cores: cpus.length,
        loadAverage: os.loadavg().map(avg => Math.round(avg * 100) / 100),
      },
      memory: {
        total: totalMemory,
        used: usedMemory,
        free: freeMemory,
        usagePercentage: Math.round(memoryUsagePercentage * 100) / 100,
        heap: {
          total: heapStats.heapTotal,
          used: heapStats.heapUsed,
          usagePercentage: Math.round(heapUsagePercentage * 100) / 100,
        },
        rss: heapStats.rss,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check if resources are exhausted
   * 
   * Returns detailed status about resource exhaustion including
   * whether CPU or memory individually exceed thresholds.
   */
  checkResourceExhaustion(): ResourceExhaustionStatus {
    const usage = this.getResourceUsage();
    const cpuUsage = usage.cpu.usage;
    const memoryUsage = usage.memory.usagePercentage;

    const cpuExhausted = cpuUsage >= this.config.cpuExhaustionThreshold;
    const memoryExhausted = memoryUsage >= this.config.memoryExhaustionThreshold;
    const cpuWarning = cpuUsage >= this.config.cpuWarningThreshold && !cpuExhausted;
    const memoryWarning = memoryUsage >= this.config.memoryWarningThreshold && !memoryExhausted;

    const isExhausted = cpuExhausted || memoryExhausted;
    const isWarning = cpuWarning || memoryWarning;

    // Build message
    let message = '';
    if (isExhausted) {
      const exhaustedResources: string[] = [];
      if (cpuExhausted) exhaustedResources.push(`CPU (${cpuUsage.toFixed(1)}%)`);
      if (memoryExhausted) exhaustedResources.push(`Memory (${memoryUsage.toFixed(1)}%)`);
      message = `Resource exhaustion: ${exhaustedResources.join(', ')} exceeds ${this.config.cpuExhaustionThreshold}% threshold`;
    } else if (isWarning) {
      const warningResources: string[] = [];
      if (cpuWarning) warningResources.push(`CPU (${cpuUsage.toFixed(1)}%)`);
      if (memoryWarning) warningResources.push(`Memory (${memoryUsage.toFixed(1)}%)`);
      message = `Resource warning: ${warningResources.join(', ')} approaching threshold`;
    } else {
      message = `Resources OK: CPU ${cpuUsage.toFixed(1)}%, Memory ${memoryUsage.toFixed(1)}%`;
    }

    return {
      isExhausted,
      isWarning,
      cpuExhausted,
      memoryExhausted,
      cpuWarning,
      memoryWarning,
      cpuUsage,
      memoryUsage,
      message,
    };
  }

  /**
   * Check if system can accept new connections
   * 
   * Returns true if resources are not exhausted.
   */
  canAcceptConnections(): boolean {
    const status = this.checkResourceExhaustion();
    return !status.isExhausted;
  }

  /**
   * Start automatic resource monitoring
   * 
   * Periodically checks resource usage and emits events when
   * thresholds are approached or exceeded.
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      console.log('[Resource Monitor] Already monitoring');
      return;
    }

    console.log('[Resource Monitor] Starting resource monitoring...');
    console.log('[Resource Monitor] Configuration:', {
      cpuExhaustionThreshold: this.config.cpuExhaustionThreshold,
      memoryExhaustionThreshold: this.config.memoryExhaustionThreshold,
      cpuWarningThreshold: this.config.cpuWarningThreshold,
      memoryWarningThreshold: this.config.memoryWarningThreshold,
      monitoringInterval: this.config.monitoringInterval,
    });

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.performMonitoringCheck();
    }, this.config.monitoringInterval);

    // Perform initial check
    this.performMonitoringCheck();
  }

  /**
   * Perform a single monitoring check
   */
  private performMonitoringCheck(): void {
    const status = this.checkResourceExhaustion();

    // Emit warning event if approaching threshold
    if (status.isWarning) {
      console.warn('[Resource Monitor] Warning:', status.message);
      this.emit('warning', {
        type: 'resource_warning',
        status,
        timestamp: new Date().toISOString(),
      });
    }

    // Emit exhaustion event if threshold exceeded
    if (status.isExhausted) {
      console.error('[Resource Monitor] Exhaustion:', status.message);
      this.emit('exhaustion', {
        type: 'resource_exhaustion',
        status,
        timestamp: new Date().toISOString(),
      });
    }

    // Always emit metrics for monitoring
    this.emit('metrics', {
      type: 'resource_metrics',
      status,
      usage: this.getResourceUsage(),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Stop automatic resource monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    console.log('[Resource Monitor] Stopping resource monitoring...');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
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
   * Get a human-readable status summary
   */
  getStatusSummary(): string {
    const status = this.checkResourceExhaustion();
    const usage = this.getResourceUsage();

    return [
      `CPU: ${status.cpuUsage.toFixed(1)}% (${status.cpuExhausted ? 'EXHAUSTED' : status.cpuWarning ? 'WARNING' : 'OK'})`,
      `Memory: ${status.memoryUsage.toFixed(1)}% (${status.memoryExhausted ? 'EXHAUSTED' : status.memoryWarning ? 'WARNING' : 'OK'})`,
      `Heap: ${usage.memory.heap.usagePercentage.toFixed(1)}%`,
      `RSS: ${(usage.memory.rss / 1024 / 1024).toFixed(1)} MB`,
    ].join(' | ');
  }

  /**
   * Reset the service (for testing)
   */
  reset(): void {
    this.stopMonitoring();
    this.lastCpuInfo = null;
    this.removeAllListeners();
  }
}

// Export singleton instance
export const resourceMonitorService = new ResourceMonitorService();

// Export class for testing
export { ResourceMonitorService };
