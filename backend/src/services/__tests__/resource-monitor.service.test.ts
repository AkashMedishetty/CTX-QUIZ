/**
 * Resource Monitor Service Tests
 * 
 * Tests for the resource monitoring functionality including:
 * - CPU usage monitoring
 * - Memory usage monitoring
 * - Resource exhaustion detection
 * - Warning threshold detection
 * - Event emission
 * 
 * Requirements: 17.9, 11.9
 */

import { ResourceMonitorService } from '../resource-monitor.service';

describe('ResourceMonitorService', () => {
  let service: ResourceMonitorService;

  beforeEach(() => {
    // Create a fresh instance for each test
    service = new ResourceMonitorService({
      cpuExhaustionThreshold: 80,
      memoryExhaustionThreshold: 80,
      cpuWarningThreshold: 70,
      memoryWarningThreshold: 70,
      monitoringInterval: 1000,
      enableAutoMonitoring: false,
    });
  });

  afterEach(() => {
    service.reset();
  });

  describe('Configuration', () => {
    it('should use default configuration when not provided', () => {
      const defaultService = new ResourceMonitorService();
      const config = defaultService.getConfig();

      expect(config.cpuExhaustionThreshold).toBe(80);
      expect(config.memoryExhaustionThreshold).toBe(80);
      expect(config.cpuWarningThreshold).toBe(70);
      expect(config.memoryWarningThreshold).toBe(70);
      expect(config.monitoringInterval).toBe(5000);
      expect(config.enableAutoMonitoring).toBe(true);

      defaultService.reset();
    });

    it('should allow custom configuration', () => {
      const customService = new ResourceMonitorService({
        cpuExhaustionThreshold: 90,
        memoryExhaustionThreshold: 85,
        cpuWarningThreshold: 75,
        memoryWarningThreshold: 80,
        monitoringInterval: 10000,
      });

      const config = customService.getConfig();

      expect(config.cpuExhaustionThreshold).toBe(90);
      expect(config.memoryExhaustionThreshold).toBe(85);
      expect(config.cpuWarningThreshold).toBe(75);
      expect(config.memoryWarningThreshold).toBe(80);
      expect(config.monitoringInterval).toBe(10000);

      customService.reset();
    });

    it('should update configuration', () => {
      service.updateConfig({
        cpuExhaustionThreshold: 95,
        memoryWarningThreshold: 65,
      });

      const config = service.getConfig();

      expect(config.cpuExhaustionThreshold).toBe(95);
      expect(config.memoryWarningThreshold).toBe(65);
      // Other values should remain unchanged
      expect(config.memoryExhaustionThreshold).toBe(80);
      expect(config.cpuWarningThreshold).toBe(70);
    });
  });

  describe('Resource Usage', () => {
    it('should return resource usage with all required fields', () => {
      const usage = service.getResourceUsage();

      // CPU fields
      expect(usage.cpu).toBeDefined();
      expect(typeof usage.cpu.usage).toBe('number');
      expect(usage.cpu.usage).toBeGreaterThanOrEqual(0);
      expect(usage.cpu.usage).toBeLessThanOrEqual(100);
      expect(typeof usage.cpu.cores).toBe('number');
      expect(usage.cpu.cores).toBeGreaterThan(0);
      expect(Array.isArray(usage.cpu.loadAverage)).toBe(true);
      expect(usage.cpu.loadAverage.length).toBe(3);

      // Memory fields
      expect(usage.memory).toBeDefined();
      expect(typeof usage.memory.total).toBe('number');
      expect(usage.memory.total).toBeGreaterThan(0);
      expect(typeof usage.memory.used).toBe('number');
      expect(usage.memory.used).toBeGreaterThanOrEqual(0);
      expect(typeof usage.memory.free).toBe('number');
      expect(usage.memory.free).toBeGreaterThanOrEqual(0);
      expect(typeof usage.memory.usagePercentage).toBe('number');
      expect(usage.memory.usagePercentage).toBeGreaterThanOrEqual(0);
      expect(usage.memory.usagePercentage).toBeLessThanOrEqual(100);

      // Heap fields
      expect(usage.memory.heap).toBeDefined();
      expect(typeof usage.memory.heap.total).toBe('number');
      expect(typeof usage.memory.heap.used).toBe('number');
      expect(typeof usage.memory.heap.usagePercentage).toBe('number');

      // RSS
      expect(typeof usage.memory.rss).toBe('number');
      expect(usage.memory.rss).toBeGreaterThan(0);

      // Timestamp
      expect(typeof usage.timestamp).toBe('string');
      expect(new Date(usage.timestamp).getTime()).not.toBeNaN();
    });

    it('should return consistent memory values', () => {
      const usage = service.getResourceUsage();

      // Total should equal used + free
      expect(usage.memory.total).toBe(usage.memory.used + usage.memory.free);

      // Usage percentage should be calculated correctly
      const expectedPercentage = (usage.memory.used / usage.memory.total) * 100;
      expect(usage.memory.usagePercentage).toBeCloseTo(expectedPercentage, 1);
    });
  });

  describe('Resource Exhaustion Detection', () => {
    it('should return exhaustion status with all required fields', () => {
      const status = service.checkResourceExhaustion();

      expect(typeof status.isExhausted).toBe('boolean');
      expect(typeof status.isWarning).toBe('boolean');
      expect(typeof status.cpuExhausted).toBe('boolean');
      expect(typeof status.memoryExhausted).toBe('boolean');
      expect(typeof status.cpuWarning).toBe('boolean');
      expect(typeof status.memoryWarning).toBe('boolean');
      expect(typeof status.cpuUsage).toBe('number');
      expect(typeof status.memoryUsage).toBe('number');
      expect(typeof status.message).toBe('string');
    });

    it('should detect exhaustion when CPU exceeds threshold', () => {
      // Set a very low threshold to trigger exhaustion
      service.updateConfig({ cpuExhaustionThreshold: 0.001 });

      const status = service.checkResourceExhaustion();

      expect(status.cpuExhausted).toBe(true);
      expect(status.isExhausted).toBe(true);
      expect(status.message).toContain('CPU');
      expect(status.message).toContain('exceeds');
    });

    it('should detect exhaustion when memory exceeds threshold', () => {
      // Set a very low threshold to trigger exhaustion
      service.updateConfig({ memoryExhaustionThreshold: 0.001 });

      const status = service.checkResourceExhaustion();

      expect(status.memoryExhausted).toBe(true);
      expect(status.isExhausted).toBe(true);
      expect(status.message).toContain('Memory');
      expect(status.message).toContain('exceeds');
    });

    it('should detect warning when approaching threshold', () => {
      // Set thresholds to trigger warning but not exhaustion
      service.updateConfig({
        cpuWarningThreshold: 0.001,
        cpuExhaustionThreshold: 99.999,
        memoryWarningThreshold: 0.001,
        memoryExhaustionThreshold: 99.999,
      });

      const status = service.checkResourceExhaustion();

      expect(status.isWarning).toBe(true);
      expect(status.isExhausted).toBe(false);
      expect(status.message).toContain('approaching');
    });

    it('should report OK when resources are below thresholds', () => {
      // Set very high thresholds
      service.updateConfig({
        cpuWarningThreshold: 99.999,
        cpuExhaustionThreshold: 99.999,
        memoryWarningThreshold: 99.999,
        memoryExhaustionThreshold: 99.999,
      });

      const status = service.checkResourceExhaustion();

      expect(status.isExhausted).toBe(false);
      expect(status.isWarning).toBe(false);
      expect(status.message).toContain('OK');
    });
  });

  describe('Connection Acceptance', () => {
    it('should allow connections when resources are OK', () => {
      // Set very high thresholds
      service.updateConfig({
        cpuExhaustionThreshold: 99.999,
        memoryExhaustionThreshold: 99.999,
      });

      expect(service.canAcceptConnections()).toBe(true);
    });

    it('should reject connections when resources are exhausted', () => {
      // Set very low thresholds
      service.updateConfig({
        cpuExhaustionThreshold: 0.001,
        memoryExhaustionThreshold: 0.001,
      });

      expect(service.canAcceptConnections()).toBe(false);
    });
  });

  describe('Monitoring', () => {
    it('should start and stop monitoring', () => {
      expect(service.isMonitoringActive()).toBe(false);

      service.startMonitoring();
      expect(service.isMonitoringActive()).toBe(true);

      service.stopMonitoring();
      expect(service.isMonitoringActive()).toBe(false);
    });

    it('should not start monitoring twice', () => {
      service.startMonitoring();
      service.startMonitoring(); // Should not throw

      expect(service.isMonitoringActive()).toBe(true);

      service.stopMonitoring();
    });

    it('should emit metrics events during monitoring', (done) => {
      let metricsReceived = false;

      service.on('metrics', (data) => {
        expect(data.type).toBe('resource_metrics');
        expect(data.status).toBeDefined();
        expect(data.usage).toBeDefined();
        expect(data.timestamp).toBeDefined();
        metricsReceived = true;
      });

      service.startMonitoring();

      // Wait for at least one metrics event
      setTimeout(() => {
        service.stopMonitoring();
        expect(metricsReceived).toBe(true);
        done();
      }, 100);
    });

    it('should emit warning events when approaching threshold', (done) => {
      // Set low warning threshold
      service.updateConfig({
        cpuWarningThreshold: 0.001,
        cpuExhaustionThreshold: 99.999,
        memoryWarningThreshold: 0.001,
        memoryExhaustionThreshold: 99.999,
      });

      let warningReceived = false;

      service.on('warning', (data) => {
        expect(data.type).toBe('resource_warning');
        expect(data.status.isWarning).toBe(true);
        warningReceived = true;
      });

      service.startMonitoring();

      setTimeout(() => {
        service.stopMonitoring();
        expect(warningReceived).toBe(true);
        done();
      }, 100);
    });

    it('should emit exhaustion events when threshold exceeded', (done) => {
      // Set very low exhaustion threshold
      service.updateConfig({
        cpuExhaustionThreshold: 0.001,
        memoryExhaustionThreshold: 0.001,
      });

      let exhaustionReceived = false;

      service.on('exhaustion', (data) => {
        expect(data.type).toBe('resource_exhaustion');
        expect(data.status.isExhausted).toBe(true);
        exhaustionReceived = true;
      });

      service.startMonitoring();

      setTimeout(() => {
        service.stopMonitoring();
        expect(exhaustionReceived).toBe(true);
        done();
      }, 100);
    });
  });

  describe('Status Summary', () => {
    it('should return a human-readable status summary', () => {
      const summary = service.getStatusSummary();

      expect(typeof summary).toBe('string');
      expect(summary).toContain('CPU:');
      expect(summary).toContain('Memory:');
      expect(summary).toContain('Heap:');
      expect(summary).toContain('RSS:');
    });

    it('should indicate status in summary', () => {
      // Set very high thresholds for OK status
      service.updateConfig({
        cpuWarningThreshold: 99.999,
        cpuExhaustionThreshold: 99.999,
        memoryWarningThreshold: 99.999,
        memoryExhaustionThreshold: 99.999,
      });

      const summary = service.getStatusSummary();
      expect(summary).toContain('OK');
    });
  });

  describe('Reset', () => {
    it('should reset all state', () => {
      service.startMonitoring();
      expect(service.isMonitoringActive()).toBe(true);

      service.reset();

      expect(service.isMonitoringActive()).toBe(false);
    });

    it('should remove all event listeners on reset', () => {
      const listener = jest.fn();
      service.on('metrics', listener);

      service.reset();

      // Manually trigger an event to verify listeners are removed
      service.emit('metrics', {});
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
