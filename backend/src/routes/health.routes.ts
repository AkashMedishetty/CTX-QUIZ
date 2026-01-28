/**
 * Health and Metrics Routes
 * 
 * Provides endpoints for:
 * - Health check (GET /api/health)
 * - System metrics (GET /api/metrics) - requires authentication
 * 
 * Requirements: 18.9
 */

import { Router, Request, Response, NextFunction } from 'express';
import { metricsService, mongodbService, redisService } from '../services';

const router = Router();

/**
 * Simple authentication middleware for metrics endpoint
 * In production, this should use proper JWT authentication
 */
const metricsAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: 'Please provide an Authorization header',
    });
    return;
  }

  // Simple bearer token check
  // In production, this should validate JWT tokens
  const token = authHeader.replace('Bearer ', '');
  
  // For now, check against a simple metrics token from env
  const metricsToken = process.env.METRICS_TOKEN || 'dev-metrics-token';
  
  if (token !== metricsToken) {
    res.status(403).json({
      success: false,
      error: 'Invalid credentials',
      message: 'Invalid authentication token',
    });
    return;
  }

  next();
};

/**
 * GET /api/health
 * 
 * Enhanced health check endpoint
 * Returns status, uptime, and connection information
 * 
 * Response:
 * - 200: System is healthy
 * - 503: System is degraded or in error state
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await metricsService.getHealthStatus();
    
    const statusCode = health.status === 'ok' ? 200 : 503;
    
    res.status(statusCode).json({
      success: health.status === 'ok',
      ...health,
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      success: false,
      status: 'error',
      uptime: Math.round(process.uptime()),
      connections: {
        active: 0,
        redis: false,
        mongodb: false,
      },
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

/**
 * GET /api/metrics
 * 
 * System metrics endpoint (requires authentication)
 * Returns detailed system metrics including:
 * - CPU usage and load average
 * - Memory usage
 * - Active WebSocket connections
 * - Database connection status
 * - Latency measurements
 * 
 * Headers:
 * - Authorization: Bearer <token>
 * 
 * Response:
 * - 200: Metrics collected successfully
 * - 401: Authentication required
 * - 403: Invalid credentials
 * - 500: Error collecting metrics
 */
router.get('/metrics', metricsAuth, async (_req: Request, res: Response) => {
  try {
    const metrics = await metricsService.collectMetrics();
    
    res.status(200).json({
      success: true,
      metrics,
    });
  } catch (error) {
    console.error('Metrics collection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to collect metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/metrics/system
 * 
 * Public system metrics endpoint for the Tester Panel
 * Returns system resource usage metrics:
 * - CPU usage percentage
 * - Memory usage (used, total, percentage)
 * - Network stats (if available)
 * - Process uptime
 * 
 * This endpoint is intentionally public for the tester panel
 * to monitor system resources during load testing.
 * 
 * Requirements: 15.5
 * 
 * Response:
 * - 200: Metrics collected successfully
 * - 500: Error collecting metrics
 */
router.get('/metrics/system', async (_req: Request, res: Response) => {
  try {
    const metrics = await metricsService.collectMetrics();
    
    // Return a simplified response for the tester panel
    res.status(200).json({
      success: true,
      cpu: {
        usage: metrics.cpu.usage,
        cores: metrics.cpu.cores,
        loadAverage: metrics.cpu.loadAverage,
      },
      memory: {
        total: metrics.memory.total,
        used: metrics.memory.used,
        free: metrics.memory.free,
        usagePercentage: metrics.memory.usagePercentage,
      },
      network: {
        // Network stats are not directly available in Node.js
        // We provide connection-related metrics instead
        activeConnections: metrics.connections.active,
        redisConnected: metrics.connections.redis,
        mongodbConnected: metrics.connections.mongodb,
      },
      uptime: metrics.uptime,
      latency: {
        average: metrics.latency.average,
        redis: metrics.latency.redis,
        mongodb: metrics.latency.mongodb,
      },
      timestamp: metrics.timestamp,
    });
  } catch (error) {
    console.error('System metrics collection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to collect system metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/metrics/database
 * 
 * Database metrics endpoint for the Tester Panel
 * Returns detailed database metrics:
 * - MongoDB connection pool stats
 * - MongoDB operations count
 * - MongoDB query performance
 * - Redis memory usage
 * - Redis connected clients
 * - Redis commands processed
 * - Redis hit/miss ratio
 * - Redis keys count
 * 
 * This endpoint is intentionally public for the tester panel
 * to monitor database performance during load testing.
 * 
 * Requirements: 15.8
 * 
 * Response:
 * - 200: Metrics collected successfully
 * - 500: Error collecting metrics
 */
router.get('/metrics/database', async (_req: Request, res: Response) => {
  try {
    // Get MongoDB metrics
    const mongodbMetrics = await getMongoDBMetrics();
    
    // Get Redis metrics
    const redisMetrics = await getRedisMetrics();
    
    res.status(200).json({
      success: true,
      mongodb: mongodbMetrics,
      redis: redisMetrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database metrics collection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to collect database metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get MongoDB metrics including connection pool stats and query performance
 */
async function getMongoDBMetrics(): Promise<{
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
}> {
  try {
    const db = mongodbService.getDb();
    
    // Get server status for operation counts
    const serverStatus = await db.admin().serverStatus();
    
    // Get connection pool info from server status
    const connections = serverStatus.connections || {};
    const opcounters = serverStatus.opcounters || {};
    
    // Get circuit breaker status
    const circuitBreakerStatus = mongodbService.getCircuitBreakerStatus();
    
    return {
      connected: mongodbService.isHealthy(),
      connectionPool: {
        available: connections.available || 0,
        inUse: connections.current || 0,
        waiting: connections.totalCreated ? connections.totalCreated - (connections.current || 0) - (connections.available || 0) : 0,
        totalCreated: connections.totalCreated || 0,
      },
      operations: {
        queries: opcounters.query || 0,
        inserts: opcounters.insert || 0,
        updates: opcounters.update || 0,
        deletes: opcounters.delete || 0,
      },
      performance: {
        avgQueryTimeMs: serverStatus.globalLock?.totalTime 
          ? Math.round((serverStatus.globalLock.totalTime / 1000000) / Math.max(1, opcounters.query || 1) * 100) / 100
          : 0,
        slowQueries: serverStatus.metrics?.queryExecutor?.scannedObjects || 0,
      },
      circuitBreaker: circuitBreakerStatus,
    };
  } catch (error) {
    console.error('Error getting MongoDB metrics:', error);
    return {
      connected: false,
      connectionPool: {
        available: 0,
        inUse: 0,
        waiting: 0,
        totalCreated: 0,
      },
      operations: {
        queries: 0,
        inserts: 0,
        updates: 0,
        deletes: 0,
      },
      performance: {
        avgQueryTimeMs: 0,
        slowQueries: 0,
      },
      circuitBreaker: {
        state: 'UNKNOWN',
        failureCount: 0,
        lastFailureTime: null,
      },
    };
  }
}

/**
 * Get Redis metrics including memory usage and performance stats
 */
async function getRedisMetrics(): Promise<{
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
}> {
  try {
    const client = redisService.getClient();
    
    // Get Redis INFO
    const info = await client.info();
    
    // Parse INFO response
    const parseInfo = (infoStr: string): Record<string, string> => {
      const result: Record<string, string> = {};
      infoStr.split('\r\n').forEach(line => {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            result[key] = value;
          }
        }
      });
      return result;
    };
    
    const parsedInfo = parseInfo(info);
    
    // Get memory info
    const usedMemory = parseInt(parsedInfo['used_memory'] || '0', 10);
    const peakMemory = parseInt(parsedInfo['used_memory_peak'] || '0', 10);
    const maxMemory = parseInt(parsedInfo['maxmemory'] || '268435456', 10); // Default 256MB
    const fragRatio = parseFloat(parsedInfo['mem_fragmentation_ratio'] || '1');
    
    // Get client info
    const connectedClients = parseInt(parsedInfo['connected_clients'] || '0', 10);
    const blockedClients = parseInt(parsedInfo['blocked_clients'] || '0', 10);
    
    // Get stats
    const totalCommands = parseInt(parsedInfo['total_commands_processed'] || '0', 10);
    const opsPerSec = parseInt(parsedInfo['instantaneous_ops_per_sec'] || '0', 10);
    const keyspaceHits = parseInt(parsedInfo['keyspace_hits'] || '0', 10);
    const keyspaceMisses = parseInt(parsedInfo['keyspace_misses'] || '0', 10);
    
    // Calculate hit/miss rates
    const totalKeyOps = keyspaceHits + keyspaceMisses;
    const hitRate = totalKeyOps > 0 ? Math.round((keyspaceHits / totalKeyOps) * 10000) / 100 : 0;
    const missRate = totalKeyOps > 0 ? Math.round((keyspaceMisses / totalKeyOps) * 10000) / 100 : 0;
    
    // Get keys count from keyspace info
    let keysCount = 0;
    const keyspaceMatch = info.match(/db\d+:keys=(\d+)/g);
    if (keyspaceMatch) {
      keyspaceMatch.forEach(match => {
        const count = match.match(/keys=(\d+)/);
        if (count) {
          keysCount += parseInt(count[1], 10);
        }
      });
    }
    
    // Get connection status
    const status = redisService.getStatus();
    
    return {
      connected: redisService.isConnected(),
      memory: {
        usedBytes: usedMemory,
        peakBytes: peakMemory,
        fragmentationRatio: Math.round(fragRatio * 100) / 100,
        usagePercentage: maxMemory > 0 ? Math.round((usedMemory / maxMemory) * 10000) / 100 : 0,
      },
      clients: {
        connected: connectedClients,
        blocked: blockedClients,
      },
      stats: {
        commandsProcessed: totalCommands,
        opsPerSecond: opsPerSec,
        hitRate,
        missRate,
        keysCount,
      },
      status,
    };
  } catch (error) {
    console.error('Error getting Redis metrics:', error);
    return {
      connected: false,
      memory: {
        usedBytes: 0,
        peakBytes: 0,
        fragmentationRatio: 0,
        usagePercentage: 0,
      },
      clients: {
        connected: 0,
        blocked: 0,
      },
      stats: {
        commandsProcessed: 0,
        opsPerSecond: 0,
        hitRate: 0,
        missRate: 0,
        keysCount: 0,
      },
      status: {
        client: 'disconnected',
        subscriber: 'disconnected',
        publisher: 'disconnected',
        reconnectAttempts: 0,
      },
    };
  }
}

export default router;
