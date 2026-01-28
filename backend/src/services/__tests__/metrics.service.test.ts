/**
 * Metrics Service Tests
 * 
 * Tests for system metrics collection and tracking
 */

import { metricsService } from '../metrics.service';
import { mongodbService } from '../mongodb.service';
import { redisService } from '../redis.service';

// Mock the database services
jest.mock('../mongodb.service');
jest.mock('../redis.service');

describe('MetricsService', () => {
  beforeEach(() => {
    // Reset metrics before each test
    metricsService.reset();
    
    // Setup default mocks
    (mongodbService.isHealthy as jest.Mock).mockReturnValue(true);
    (redisService.isConnected as jest.Mock).mockReturnValue(true);
    (mongodbService.getDb as jest.Mock).mockReturnValue({
      admin: () => ({
        ping: jest.fn().mockResolvedValue({}),
      }),
    });
    (redisService.getClient as jest.Mock).mockReturnValue({
      ping: jest.fn().mockResolvedValue('PONG'),
    });
  });

  describe('Connection Tracking', () => {
    it('should start with zero connections', () => {
      expect(metricsService.getActiveConnections()).toBe(0);
    });

    it('should increment connections', () => {
      metricsService.incrementConnections();
      expect(metricsService.getActiveConnections()).toBe(1);

      metricsService.incrementConnections();
      expect(metricsService.getActiveConnections()).toBe(2);
    });

    it('should decrement connections', () => {
      metricsService.setActiveConnections(5);
      
      metricsService.decrementConnections();
      expect(metricsService.getActiveConnections()).toBe(4);

      metricsService.decrementConnections();
      expect(metricsService.getActiveConnections()).toBe(3);
    });

    it('should not go below zero connections', () => {
      metricsService.setActiveConnections(0);
      metricsService.decrementConnections();
      expect(metricsService.getActiveConnections()).toBe(0);

      metricsService.decrementConnections();
      expect(metricsService.getActiveConnections()).toBe(0);
    });

    it('should set connections to specific value', () => {
      metricsService.setActiveConnections(42);
      expect(metricsService.getActiveConnections()).toBe(42);

      metricsService.setActiveConnections(0);
      expect(metricsService.getActiveConnections()).toBe(0);
    });
  });

  describe('Latency Tracking', () => {
    it('should record latency measurements', () => {
      metricsService.recordLatency(10);
      metricsService.recordLatency(20);
      metricsService.recordLatency(30);

      // We can't directly access the measurements, but we can verify
      // through collectMetrics that they're being tracked
      expect(metricsService.collectMetrics()).resolves.toMatchObject({
        latency: {
          average: 20,
        },
      });
    });

    it('should calculate average latency correctly', async () => {
      metricsService.recordLatency(5);
      metricsService.recordLatency(10);
      metricsService.recordLatency(15);
      metricsService.recordLatency(20);

      const metrics = await metricsService.collectMetrics();
      expect(metrics.latency.average).toBe(12.5);
    });

    it('should return 0 average when no measurements recorded', async () => {
      const metrics = await metricsService.collectMetrics();
      expect(metrics.latency.average).toBe(0);
    });

    it('should limit stored measurements to MAX_LATENCY_SAMPLES', async () => {
      // Record 150 measurements
      for (let i = 1; i <= 150; i++) {
        metricsService.recordLatency(i);
      }

      const metrics = await metricsService.collectMetrics();
      
      // Average should be based on last 100 samples (51-150)
      // Average of 51-150 = (51 + 150) / 2 = 100.5
      expect(metrics.latency.average).toBe(100.5);
    });
  });

  describe('Health Status', () => {
    it('should return ok status when all services are healthy', async () => {
      (mongodbService.isHealthy as jest.Mock).mockReturnValue(true);
      (redisService.isConnected as jest.Mock).mockReturnValue(true);

      const health = await metricsService.getHealthStatus();

      expect(health.status).toBe('ok');
      expect(health.connections.mongodb).toBe(true);
      expect(health.connections.redis).toBe(true);
    });

    it('should return degraded status when Redis is down', async () => {
      (mongodbService.isHealthy as jest.Mock).mockReturnValue(true);
      (redisService.isConnected as jest.Mock).mockReturnValue(false);

      const health = await metricsService.getHealthStatus();

      expect(health.status).toBe('degraded');
      expect(health.connections.mongodb).toBe(true);
      expect(health.connections.redis).toBe(false);
    });

    it('should return degraded status when MongoDB is down', async () => {
      (mongodbService.isHealthy as jest.Mock).mockReturnValue(false);
      (redisService.isConnected as jest.Mock).mockReturnValue(true);

      const health = await metricsService.getHealthStatus();

      expect(health.status).toBe('degraded');
      expect(health.connections.mongodb).toBe(false);
      expect(health.connections.redis).toBe(true);
    });

    it('should return error status when both services are down', async () => {
      (mongodbService.isHealthy as jest.Mock).mockReturnValue(false);
      (redisService.isConnected as jest.Mock).mockReturnValue(false);

      const health = await metricsService.getHealthStatus();

      expect(health.status).toBe('error');
      expect(health.connections.mongodb).toBe(false);
      expect(health.connections.redis).toBe(false);
    });

    it('should include uptime in health status', async () => {
      const health = await metricsService.getHealthStatus();

      expect(health.uptime).toBeGreaterThan(0);
      expect(Number.isInteger(health.uptime)).toBe(true);
    });

    it('should include timestamp in health status', async () => {
      const health = await metricsService.getHealthStatus();

      expect(health.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include active connections in health status', async () => {
      metricsService.setActiveConnections(25);

      const health = await metricsService.getHealthStatus();

      expect(health.connections.active).toBe(25);
    });
  });

  describe('System Metrics Collection', () => {
    it('should collect CPU metrics', async () => {
      const metrics = await metricsService.collectMetrics();

      expect(metrics.cpu.usage).toBeGreaterThanOrEqual(0);
      expect(metrics.cpu.usage).toBeLessThanOrEqual(100);
      expect(metrics.cpu.cores).toBeGreaterThan(0);
      expect(Array.isArray(metrics.cpu.loadAverage)).toBe(true);
      expect(metrics.cpu.loadAverage).toHaveLength(3);
    });

    it('should collect memory metrics', async () => {
      const metrics = await metricsService.collectMetrics();

      expect(metrics.memory).toMatchObject({
        total: expect.any(Number),
        used: expect.any(Number),
        free: expect.any(Number),
        usagePercentage: expect.any(Number),
      });

      expect(metrics.memory.total).toBeGreaterThan(0);
      expect(metrics.memory.used).toBeGreaterThan(0);
      expect(metrics.memory.free).toBeGreaterThanOrEqual(0);
      expect(metrics.memory.usagePercentage).toBeGreaterThanOrEqual(0);
      expect(metrics.memory.usagePercentage).toBeLessThanOrEqual(100);
      
      // Verify that total = used + free
      expect(metrics.memory.total).toBe(metrics.memory.used + metrics.memory.free);
    });

    it('should collect connection metrics', async () => {
      metricsService.setActiveConnections(15);

      const metrics = await metricsService.collectMetrics();

      expect(metrics.connections).toMatchObject({
        active: 15,
        redis: true,
        mongodb: true,
      });
    });

    it('should measure Redis latency', async () => {
      const metrics = await metricsService.collectMetrics();

      expect(metrics.latency.redis).toBeGreaterThanOrEqual(0);
    });

    it('should measure MongoDB latency', async () => {
      const metrics = await metricsService.collectMetrics();

      expect(metrics.latency.mongodb).toBeGreaterThanOrEqual(0);
    });

    it('should return null latency when Redis is unavailable', async () => {
      (redisService.getClient as jest.Mock).mockImplementation(() => {
        throw new Error('Redis not connected');
      });

      const metrics = await metricsService.collectMetrics();

      expect(metrics.latency.redis).toBeNull();
    });

    it('should return null latency when MongoDB is unavailable', async () => {
      (mongodbService.getDb as jest.Mock).mockImplementation(() => {
        throw new Error('MongoDB not connected');
      });

      const metrics = await metricsService.collectMetrics();

      expect(metrics.latency.mongodb).toBeNull();
    });

    it('should include uptime in metrics', async () => {
      const metrics = await metricsService.collectMetrics();

      expect(metrics.uptime).toBeGreaterThan(0);
      expect(Number.isInteger(metrics.uptime)).toBe(true);
    });

    it('should include timestamp in metrics', async () => {
      const metrics = await metricsService.collectMetrics();

      expect(metrics.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Reset', () => {
    it('should reset all metrics', () => {
      metricsService.setActiveConnections(50);
      metricsService.recordLatency(10);
      metricsService.recordLatency(20);

      metricsService.reset();

      expect(metricsService.getActiveConnections()).toBe(0);
    });

    it('should reset latency measurements', async () => {
      metricsService.recordLatency(10);
      metricsService.recordLatency(20);
      metricsService.recordLatency(30);

      metricsService.reset();

      const metrics = await metricsService.collectMetrics();
      expect(metrics.latency.average).toBe(0);
    });
  });
});
