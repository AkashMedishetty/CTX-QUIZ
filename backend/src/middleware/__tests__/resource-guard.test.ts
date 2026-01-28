/**
 * Resource Guard Middleware Tests
 * 
 * Tests for the Socket.IO middleware that rejects connections
 * when system resources are exhausted.
 * 
 * Requirements: 17.9
 */

import { Socket } from 'socket.io';
import {
  resourceGuardMiddleware,
  createResourceGuardMiddleware,
  getResourceStatus,
  ResourceExhaustionError,
} from '../resource-guard';
import { resourceMonitorService } from '../../services/resource-monitor.service';

// Mock the resource monitor service
jest.mock('../../services/resource-monitor.service', () => ({
  resourceMonitorService: {
    checkResourceExhaustion: jest.fn(),
    getStatusSummary: jest.fn(),
  },
}));

describe('Resource Guard Middleware', () => {
  let mockSocket: Partial<Socket>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockSocket = {
      id: 'test-socket-id',
      handshake: {
        address: '127.0.0.1',
      } as any,
      emit: jest.fn(),
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('resourceGuardMiddleware', () => {
    it('should allow connection when resources are OK', async () => {
      (resourceMonitorService.checkResourceExhaustion as jest.Mock).mockReturnValue({
        isExhausted: false,
        isWarning: false,
        cpuExhausted: false,
        memoryExhausted: false,
        cpuWarning: false,
        memoryWarning: false,
        cpuUsage: 30,
        memoryUsage: 40,
        message: 'Resources OK',
      });

      await resourceGuardMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should reject connection when resources are exhausted', async () => {
      (resourceMonitorService.checkResourceExhaustion as jest.Mock).mockReturnValue({
        isExhausted: true,
        isWarning: false,
        cpuExhausted: true,
        memoryExhausted: false,
        cpuWarning: false,
        memoryWarning: false,
        cpuUsage: 85,
        memoryUsage: 60,
        message: 'Resource exhaustion: CPU (85.0%) exceeds 80% threshold',
      });

      await resourceGuardMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('resources exhausted');
      expect((error as any).data).toBeDefined();
      expect((error as any).data.retryAfter).toBe(30);
    });

    it('should emit error event to socket before rejecting', async () => {
      (resourceMonitorService.checkResourceExhaustion as jest.Mock).mockReturnValue({
        isExhausted: true,
        isWarning: false,
        cpuExhausted: false,
        memoryExhausted: true,
        cpuWarning: false,
        memoryWarning: false,
        cpuUsage: 50,
        memoryUsage: 90,
        message: 'Resource exhaustion: Memory (90.0%) exceeds 80% threshold',
      });

      await resourceGuardMiddleware(mockSocket as Socket, mockNext);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        code: expect.any(String),
        message: expect.stringContaining('high load'),
      }));
    });

    it('should allow connection but log warning when approaching threshold', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      (resourceMonitorService.checkResourceExhaustion as jest.Mock).mockReturnValue({
        isExhausted: false,
        isWarning: true,
        cpuExhausted: false,
        memoryExhausted: false,
        cpuWarning: true,
        memoryWarning: false,
        cpuUsage: 75,
        memoryUsage: 50,
        message: 'Resource warning: CPU (75.0%) approaching threshold',
      });

      await resourceGuardMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Resource Guard] Resources approaching threshold'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('should allow connection if resource check throws error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      (resourceMonitorService.checkResourceExhaustion as jest.Mock).mockImplementation(() => {
        throw new Error('Resource check failed');
      });

      await resourceGuardMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Resource Guard] Error checking resources'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('createResourceGuardMiddleware', () => {
    it('should create middleware with custom threshold', async () => {
      const customMiddleware = createResourceGuardMiddleware({
        exhaustionThreshold: 90,
      });

      (resourceMonitorService.checkResourceExhaustion as jest.Mock).mockReturnValue({
        isExhausted: false,
        isWarning: false,
        cpuExhausted: false,
        memoryExhausted: false,
        cpuWarning: false,
        memoryWarning: false,
        cpuUsage: 85, // Below custom threshold of 90
        memoryUsage: 85,
        message: 'Resources OK',
      });

      await customMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject when custom threshold is exceeded', async () => {
      const customMiddleware = createResourceGuardMiddleware({
        exhaustionThreshold: 70,
      });

      (resourceMonitorService.checkResourceExhaustion as jest.Mock).mockReturnValue({
        isExhausted: false,
        isWarning: false,
        cpuExhausted: false,
        memoryExhausted: false,
        cpuWarning: false,
        memoryWarning: false,
        cpuUsage: 75, // Above custom threshold of 70
        memoryUsage: 50,
        message: 'Resources OK',
      });

      await customMiddleware(mockSocket as Socket, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(Error);
    });

    it('should use custom error message', async () => {
      const customMessage = 'Custom error message for testing';
      const customMiddleware = createResourceGuardMiddleware({
        exhaustionThreshold: 50,
        errorMessage: customMessage,
      });

      (resourceMonitorService.checkResourceExhaustion as jest.Mock).mockReturnValue({
        isExhausted: false,
        isWarning: false,
        cpuExhausted: false,
        memoryExhausted: false,
        cpuWarning: false,
        memoryWarning: false,
        cpuUsage: 60,
        memoryUsage: 40,
        message: 'Resources OK',
      });

      await customMiddleware(mockSocket as Socket, mockNext);

      const error = mockNext.mock.calls[0][0];
      expect(error.message).toBe(customMessage);
    });

    it('should log all connections when enabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const customMiddleware = createResourceGuardMiddleware({
        logAllConnections: true,
      });

      (resourceMonitorService.checkResourceExhaustion as jest.Mock).mockReturnValue({
        isExhausted: false,
        isWarning: false,
        cpuExhausted: false,
        memoryExhausted: false,
        cpuWarning: false,
        memoryWarning: false,
        cpuUsage: 30,
        memoryUsage: 40,
        message: 'Resources OK',
      });

      await customMiddleware(mockSocket as Socket, mockNext);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Resource Guard] Connection attempt'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getResourceStatus', () => {
    it('should return resource status', () => {
      (resourceMonitorService.checkResourceExhaustion as jest.Mock).mockReturnValue({
        isExhausted: false,
        isWarning: false,
        cpuExhausted: false,
        memoryExhausted: false,
        cpuWarning: false,
        memoryWarning: false,
        cpuUsage: 30,
        memoryUsage: 40,
        message: 'Resources OK',
      });

      (resourceMonitorService.getStatusSummary as jest.Mock).mockReturnValue(
        'CPU: 30.0% (OK) | Memory: 40.0% (OK)'
      );

      const status = getResourceStatus();

      expect(status.canAcceptConnections).toBe(true);
      expect(status.status).toBeDefined();
      expect(status.summary).toBe('CPU: 30.0% (OK) | Memory: 40.0% (OK)');
    });

    it('should indicate cannot accept connections when exhausted', () => {
      (resourceMonitorService.checkResourceExhaustion as jest.Mock).mockReturnValue({
        isExhausted: true,
        isWarning: false,
        cpuExhausted: true,
        memoryExhausted: false,
        cpuWarning: false,
        memoryWarning: false,
        cpuUsage: 90,
        memoryUsage: 40,
        message: 'Resource exhaustion',
      });

      (resourceMonitorService.getStatusSummary as jest.Mock).mockReturnValue(
        'CPU: 90.0% (EXHAUSTED) | Memory: 40.0% (OK)'
      );

      const status = getResourceStatus();

      expect(status.canAcceptConnections).toBe(false);
    });
  });

  describe('ResourceExhaustionError', () => {
    it('should create error with correct properties', () => {
      const status = {
        isExhausted: true,
        isWarning: false,
        cpuExhausted: true,
        memoryExhausted: false,
        cpuWarning: false,
        memoryWarning: false,
        cpuUsage: 85,
        memoryUsage: 60,
        message: 'Resource exhaustion',
      };

      const error = new ResourceExhaustionError(status);

      expect(error.name).toBe('ResourceExhaustionError');
      expect(error.code).toBe('RESOURCE_EXHAUSTION');
      expect(error.status).toBe(status);
      expect(error.message).toContain('resources are currently exhausted');
    });

    it('should be instanceof Error', () => {
      const status = {
        isExhausted: true,
        isWarning: false,
        cpuExhausted: true,
        memoryExhausted: false,
        cpuWarning: false,
        memoryWarning: false,
        cpuUsage: 85,
        memoryUsage: 60,
        message: 'Resource exhaustion',
      };

      const error = new ResourceExhaustionError(status);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ResourceExhaustionError);
    });
  });
});
