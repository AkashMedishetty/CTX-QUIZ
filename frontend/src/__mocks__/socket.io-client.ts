/**
 * Socket.IO Client Mock
 * 
 * Centralized mock for socket.io-client used in frontend tests.
 * Provides a configurable mock socket with event handling capabilities.
 * 
 * Usage:
 * - Import this mock automatically via Jest's moduleNameMapper or __mocks__ folder
 * - Use mockSocket.simulateEvent() to trigger server events in tests
 * - Use mockSocket.getEmittedEvents() to verify client emissions
 */

export type MockEventCallback = (...args: unknown[]) => void;

export interface MockSocket {
  id: string;
  connected: boolean;
  on: jest.Mock;
  off: jest.Mock;
  emit: jest.Mock;
  disconnect: jest.Mock;
  connect: jest.Mock;
  // Test helpers
  _listeners: Map<string, Set<MockEventCallback>>;
  _simulateEvent: (event: string, ...args: unknown[]) => void;
  _simulateConnect: () => void;
  _simulateDisconnect: (reason?: string) => void;
  _getEmittedEvents: () => Array<{ event: string; args: unknown[] }>;
  _reset: () => void;
}

/**
 * Creates a mock Socket.IO socket instance
 */
export function createMockSocket(): MockSocket {
  const listeners = new Map<string, Set<MockEventCallback>>();
  const emittedEvents: Array<{ event: string; args: unknown[] }> = [];
  let isConnected = false;

  const mockSocket: MockSocket = {
    id: 'mock-socket-id-' + Math.random().toString(36).substring(7),
    connected: false,

    on: jest.fn((event: string, callback: MockEventCallback) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(callback);
      return mockSocket;
    }),

    off: jest.fn((event: string, callback?: MockEventCallback) => {
      if (callback && listeners.has(event)) {
        listeners.get(event)!.delete(callback);
      } else if (!callback) {
        listeners.delete(event);
      }
      return mockSocket;
    }),

    emit: jest.fn((event: string, ...args: unknown[]) => {
      emittedEvents.push({ event, args });
      return mockSocket;
    }),

    disconnect: jest.fn(() => {
      isConnected = false;
      mockSocket.connected = false;
      return mockSocket;
    }),

    connect: jest.fn(() => {
      isConnected = true;
      mockSocket.connected = true;
      return mockSocket;
    }),

    _listeners: listeners,

    _simulateEvent: (event: string, ...args: unknown[]) => {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        eventListeners.forEach((callback) => callback(...args));
      }
    },

    _simulateConnect: () => {
      isConnected = true;
      mockSocket.connected = true;
      mockSocket._simulateEvent('connect');
    },

    _simulateDisconnect: (reason = 'io client disconnect') => {
      isConnected = false;
      mockSocket.connected = false;
      mockSocket._simulateEvent('disconnect', reason);
    },

    _getEmittedEvents: () => [...emittedEvents],

    _reset: () => {
      listeners.clear();
      emittedEvents.length = 0;
      isConnected = false;
      mockSocket.connected = false;
      mockSocket.on.mockClear();
      mockSocket.off.mockClear();
      mockSocket.emit.mockClear();
      mockSocket.disconnect.mockClear();
      mockSocket.connect.mockClear();
    },
  };

  return mockSocket;
}

// Default mock socket instance
let defaultMockSocket: MockSocket | null = null;

/**
 * Get or create the default mock socket
 */
export function getDefaultMockSocket(): MockSocket {
  if (!defaultMockSocket) {
    defaultMockSocket = createMockSocket();
  }
  return defaultMockSocket;
}

/**
 * Reset the default mock socket
 */
export function resetDefaultMockSocket(): void {
  if (defaultMockSocket) {
    defaultMockSocket._reset();
  }
}

// Mock io function
export const io = jest.fn((_url?: string, _options?: Record<string, unknown>) => {
  return getDefaultMockSocket();
});

// Mock Socket type (for TypeScript compatibility)
export type Socket = MockSocket;

// Mock Manager class
export class Manager {
  constructor(_uri?: string, _opts?: Record<string, unknown>) {}
  
  open(): this {
    return this;
  }
  
  close(): this {
    return this;
  }
  
  socket(_nsp: string): MockSocket {
    return getDefaultMockSocket();
  }
}

// Export default for CommonJS compatibility
export default { io, Manager, createMockSocket, getDefaultMockSocket, resetDefaultMockSocket };
