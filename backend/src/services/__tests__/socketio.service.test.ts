/**
 * Socket.IO Service Tests
 * 
 * Tests for Socket.IO server initialization with Redis adapter
 * 
 * Requirements: 5.1, 5.7, 11.8, 18.7
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { socketIOService } from '../socketio.service';
import { redisService } from '../redis.service';

// Mock Redis service
jest.mock('../redis.service', () => ({
  redisService: {
    isConnected: jest.fn(),
    getPublisher: jest.fn(),
    getSubscriber: jest.fn(),
  },
}));

// Mock Socket.IO
jest.mock('socket.io', () => {
  const mockIO = {
    adapter: jest.fn(),
    on: jest.fn(),
    use: jest.fn(), // Add use method for middleware
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
    fetchSockets: jest.fn().mockResolvedValue([]),
    close: jest.fn((callback) => callback && callback()),
    of: jest.fn().mockReturnValue({
      adapter: {
        on: jest.fn(),
      },
    }),
    engine: {
      on: jest.fn(),
    },
  };

  return {
    Server: jest.fn(() => mockIO),
  };
});

// Mock Redis adapter
jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn(() => jest.fn()),
}));

describe('SocketIOService', () => {
  let mockHttpServer: HttpServer;
  let mockRedisPublisher: any;
  let mockRedisSubscriber: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock HTTP server
    mockHttpServer = {
      listen: jest.fn(),
      close: jest.fn(),
    } as any;

    // Create mock Redis clients
    mockRedisPublisher = {
      status: 'ready',
    };

    mockRedisSubscriber = {
      status: 'ready',
    };

    // Configure Redis service mock
    (redisService.isConnected as jest.Mock).mockReturnValue(true);
    (redisService.getPublisher as jest.Mock).mockReturnValue(mockRedisPublisher);
    (redisService.getSubscriber as jest.Mock).mockReturnValue(mockRedisSubscriber);
  });

  describe('initialize', () => {
    it('should initialize Socket.IO server with correct configuration', async () => {
      await socketIOService.initialize(mockHttpServer);

      // Verify Socket.IO server was created with performance settings
      // Requirements: 11.1 (500 concurrent connections), 11.2 (latency < 100ms)
      expect(SocketIOServer).toHaveBeenCalledWith(
        mockHttpServer,
        expect.objectContaining({
          cors: expect.any(Object),
          pingTimeout: expect.any(Number),
          pingInterval: expect.any(Number),
          maxHttpBufferSize: expect.any(Number),
          connectTimeout: 45000, // 45 seconds for slow mobile connections
          connectionStateRecovery: expect.objectContaining({
            maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
            skipMiddlewares: true,
          }),
          transports: ['websocket', 'polling'],
          upgradeTimeout: 10000,
          allowUpgrades: true,
          perMessageDeflate: expect.objectContaining({
            threshold: 1024,
          }),
        })
      );
    });

    it('should configure Redis adapter for horizontal scaling', async () => {
      const { createAdapter } = require('@socket.io/redis-adapter');

      await socketIOService.initialize(mockHttpServer);

      // Verify Redis adapter was created with pub/sub clients
      expect(createAdapter).toHaveBeenCalledWith(
        mockRedisPublisher,
        mockRedisSubscriber,
        expect.objectContaining({
          key: 'socket.io',
          requestsTimeout: 5000,
        })
      );
    });

    it('should throw error if Redis is not connected', async () => {
      (redisService.isConnected as jest.Mock).mockReturnValue(false);

      await expect(socketIOService.initialize(mockHttpServer)).rejects.toThrow(
        'Redis must be connected before initializing Socket.IO'
      );
    });

    it('should set up connection monitoring', async () => {
      await socketIOService.initialize(mockHttpServer);

      const io = socketIOService.getIO();
      
      // Verify connection event handler was registered
      expect(io.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should configure connection state recovery with 2-minute window', async () => {
      await socketIOService.initialize(mockHttpServer);

      expect(SocketIOServer).toHaveBeenCalledWith(
        mockHttpServer,
        expect.objectContaining({
          connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
            skipMiddlewares: true,
          },
        })
      );
    });

    it('should prefer WebSocket over polling transport', async () => {
      await socketIOService.initialize(mockHttpServer);

      expect(SocketIOServer).toHaveBeenCalledWith(
        mockHttpServer,
        expect.objectContaining({
          transports: ['websocket', 'polling'],
        })
      );
    });

    it('should configure performance settings for 500+ concurrent connections', async () => {
      // Requirements: 11.1 (500 concurrent connections on 2GB RAM, 2 vCPU VPS)
      // Requirements: 11.2 (connection latency below 100ms)
      await socketIOService.initialize(mockHttpServer);

      expect(SocketIOServer).toHaveBeenCalledWith(
        mockHttpServer,
        expect.objectContaining({
          // pingTimeout: 60s - generous timeout for network latency spikes
          pingTimeout: expect.any(Number),
          // pingInterval: 25s - balance between health monitoring and bandwidth
          pingInterval: expect.any(Number),
          // maxHttpBufferSize: 1MB - sufficient for quiz data, prevents memory exhaustion
          maxHttpBufferSize: expect.any(Number),
          // connectTimeout: 45s - generous for slow mobile connections
          connectTimeout: 45000,
          // upgradeTimeout: 10s - for switching from polling to WebSocket
          upgradeTimeout: 10000,
          // allowUpgrades: true - essential for clients behind proxies/firewalls
          allowUpgrades: true,
          // perMessageDeflate: compression for larger messages
          perMessageDeflate: expect.objectContaining({
            threshold: 1024, // Only compress messages > 1KB
            zlibDeflateOptions: expect.objectContaining({
              level: 1, // Fastest compression for real-time performance
            }),
          }),
          // httpCompression: true - for polling transport
          httpCompression: true,
          // serveClient: false - we use npm package on frontend
          serveClient: false,
        })
      );
    });
  });

  describe('getIO', () => {
    it('should return Socket.IO instance after initialization', async () => {
      await socketIOService.initialize(mockHttpServer);

      const io = socketIOService.getIO();
      expect(io).toBeDefined();
    });

    it('should throw error if not initialized', async () => {
      // Close the service first to test uninitialized state
      await socketIOService.close();
      
      expect(() => socketIOService.getIO()).toThrow(
        'Socket.IO server not initialized. Call initialize() first.'
      );
      
      // Re-initialize for other tests
      await socketIOService.initialize(mockHttpServer);
    });
  });

  describe('getStatus', () => {
    it('should return correct status after initialization', async () => {
      await socketIOService.initialize(mockHttpServer);

      const status = socketIOService.getStatus();

      expect(status).toEqual({
        initialized: true,
        connectionCount: 0,
        adapterType: expect.any(String),
      });
    });

    it('should return uninitialized status before initialization', async () => {
      // Close the service first to test uninitialized state
      await socketIOService.close();
      
      const status = socketIOService.getStatus();
      expect(status.initialized).toBe(false);
      
      // Re-initialize for other tests
      await socketIOService.initialize(mockHttpServer);
    });
  });

  describe('broadcast', () => {
    it('should broadcast event to all connected clients', async () => {
      await socketIOService.initialize(mockHttpServer);

      const io = socketIOService.getIO();
      socketIOService.broadcast('test_event', { data: 'test' });

      expect(io.emit).toHaveBeenCalledWith('test_event', { data: 'test' });
    });

    it('should throw error if not initialized', async () => {
      // Close the service first to test uninitialized state
      await socketIOService.close();
      
      expect(() => socketIOService.broadcast('test', {})).toThrow(
        'Socket.IO server not initialized'
      );
      
      // Re-initialize for other tests
      await socketIOService.initialize(mockHttpServer);
    });
  });

  describe('broadcastToRoom', () => {
    it('should broadcast event to specific room', async () => {
      await socketIOService.initialize(mockHttpServer);

      const io = socketIOService.getIO();
      socketIOService.broadcastToRoom('room1', 'test_event', { data: 'test' });

      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io.to('room1').emit).toHaveBeenCalledWith('test_event', { data: 'test' });
    });
  });

  describe('healthCheck', () => {
    it('should return true when Socket.IO is operational', async () => {
      await socketIOService.initialize(mockHttpServer);

      const healthy = await socketIOService.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false when not initialized', async () => {
      // Close the service first to test uninitialized state
      await socketIOService.close();
      
      const healthy = await socketIOService.healthCheck();
      expect(healthy).toBe(false);
      
      // Re-initialize for other tests
      await socketIOService.initialize(mockHttpServer);
    });

    it('should return false when fetchSockets fails', async () => {
      await socketIOService.initialize(mockHttpServer);

      const io = socketIOService.getIO();
      (io.fetchSockets as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const healthy = await socketIOService.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('close', () => {
    it('should gracefully close Socket.IO server', async () => {
      await socketIOService.initialize(mockHttpServer);

      const io = socketIOService.getIO();
      await socketIOService.close();

      expect(io.close).toHaveBeenCalled();
    });

    it('should handle close when not initialized', async () => {
      await expect(socketIOService.close()).resolves.not.toThrow();
    });
  });

  describe('connection tracking', () => {
    it('should track connection count', async () => {
      await socketIOService.initialize(mockHttpServer);

      expect(socketIOService.getConnectionCount()).toBe(0);
    });

    it('should get all socket IDs', async () => {
      await socketIOService.initialize(mockHttpServer);

      const io = socketIOService.getIO();
      (io.fetchSockets as jest.Mock).mockResolvedValue([
        { id: 'socket1' },
        { id: 'socket2' },
      ]);

      const socketIds = await socketIOService.getAllSocketIds();
      expect(socketIds).toEqual(['socket1', 'socket2']);
    });

    it('should get global connection count', async () => {
      await socketIOService.initialize(mockHttpServer);

      const io = socketIOService.getIO();
      (io.fetchSockets as jest.Mock).mockResolvedValue([
        { id: 'socket1' },
        { id: 'socket2' },
        { id: 'socket3' },
      ]);

      const count = await socketIOService.getGlobalConnectionCount();
      expect(count).toBe(3);
    });
  });
});
