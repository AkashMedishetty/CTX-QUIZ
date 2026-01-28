/**
 * Metrics Service
 * 
 * Collects and provides system metrics for monitoring:
 * - CPU usage
 * - Memory usage
 * - Active WebSocket connections
 * - Average latency
 * 
 * Requirements: 18.9
 */

import * as os from 'os';
import { redisService } from './redis.service';
import { mongodbService } from './mongodb.service';
import { socketIOService } from './socketio.service';

interface SystemMetrics {
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
  };
  connections: {
    active: number;
    redis: boolean;
    mongodb: boolean;
    socketio: boolean;
  };
  latency: {
    average: number; // Milliseconds
    redis: number | null; // Milliseconds
    mongodb: number | null; // Milliseconds
  };
  uptime: number; // Seconds
  timestamp: string;
}

class MetricsService {
  private activeConnections: number = 0;
  private latencyMeasurements: number[] = [];
  private readonly MAX_LATENCY_SAMPLES = 100;

  /**
   * Get current CPU usage percentage
   */
  private getCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);

    return Math.max(0, Math.min(100, usage));
  }

  /**
   * Get memory usage information
   */
  private getMemoryUsage(): SystemMetrics['memory'] {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usagePercentage = (usedMemory / totalMemory) * 100;

    return {
      total: totalMemory,
      used: usedMemory,
      free: freeMemory,
      usagePercentage: Math.round(usagePercentage * 100) / 100,
    };
  }

  /**
   * Measure Redis latency
   */
  private async measureRedisLatency(): Promise<number | null> {
    try {
      const start = Date.now();
      await redisService.getClient().ping();
      const end = Date.now();
      return end - start;
    } catch (error) {
      return null;
    }
  }

  /**
   * Measure MongoDB latency
   */
  private async measureMongoDbLatency(): Promise<number | null> {
    try {
      const start = Date.now();
      await mongodbService.getDb().admin().ping();
      const end = Date.now();
      return end - start;
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate average latency from recent measurements
   */
  private getAverageLatency(): number {
    if (this.latencyMeasurements.length === 0) {
      return 0;
    }

    const sum = this.latencyMeasurements.reduce((acc, val) => acc + val, 0);
    return Math.round((sum / this.latencyMeasurements.length) * 100) / 100;
  }

  /**
   * Record a latency measurement
   */
  recordLatency(latencyMs: number): void {
    this.latencyMeasurements.push(latencyMs);

    // Keep only the most recent samples
    if (this.latencyMeasurements.length > this.MAX_LATENCY_SAMPLES) {
      this.latencyMeasurements.shift();
    }
  }

  /**
   * Set the number of active WebSocket connections
   */
  setActiveConnections(count: number): void {
    this.activeConnections = count;
  }

  /**
   * Increment active connections counter
   */
  incrementConnections(): void {
    this.activeConnections++;
  }

  /**
   * Decrement active connections counter
   */
  decrementConnections(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  /**
   * Get current active connections count
   */
  getActiveConnections(): number {
    return this.activeConnections;
  }

  /**
   * Collect all system metrics
   */
  async collectMetrics(): Promise<SystemMetrics> {
    const cpus = os.cpus();
    const loadAverage = os.loadavg();

    // Measure database latencies
    const [redisLatency, mongodbLatency] = await Promise.all([
      this.measureRedisLatency(),
      this.measureMongoDbLatency(),
    ]);

    // Get Socket.IO connection count
    const socketIOConnections = socketIOService.getConnectionCount();

    return {
      cpu: {
        usage: this.getCpuUsage(),
        cores: cpus.length,
        loadAverage: loadAverage.map(avg => Math.round(avg * 100) / 100),
      },
      memory: this.getMemoryUsage(),
      connections: {
        active: socketIOConnections,
        redis: redisService.isConnected(),
        mongodb: mongodbService.isHealthy(),
        socketio: socketIOService.getStatus().initialized,
      },
      latency: {
        average: this.getAverageLatency(),
        redis: redisLatency,
        mongodb: mongodbLatency,
      },
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get a simplified health status
   */
  async getHealthStatus(): Promise<{
    status: 'ok' | 'degraded' | 'error';
    uptime: number;
    connections: {
      active: number;
      redis: boolean;
      mongodb: boolean;
      socketio: boolean;
    };
    timestamp: string;
  }> {
    const redisHealthy = redisService.isConnected();
    const mongodbHealthy = mongodbService.isHealthy();
    const socketIOHealthy = await socketIOService.healthCheck();

    let status: 'ok' | 'degraded' | 'error' = 'ok';
    
    if (!redisHealthy || !mongodbHealthy || !socketIOHealthy) {
      status = 'degraded';
    }
    
    if (!redisHealthy && !mongodbHealthy) {
      status = 'error';
    }

    return {
      status,
      uptime: Math.round(process.uptime()),
      connections: {
        active: socketIOService.getConnectionCount(),
        redis: redisHealthy,
        mongodb: mongodbHealthy,
        socketio: socketIOHealthy,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.activeConnections = 0;
    this.latencyMeasurements = [];
  }
}

// Export singleton instance
export const metricsService = new MetricsService();
