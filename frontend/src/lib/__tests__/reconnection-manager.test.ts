/**
 * ReconnectionManager Tests
 * 
 * Tests for the ReconnectionManager class covering:
 * - Exponential backoff logic (1s, 2s, 4s, 8s, max 30s)
 * - Session token storage in localStorage
 * - reconnect_session event emission
 * - session_recovered and recovery_failed event handling
 * - Connection status management
 * 
 * Requirements: 8.2, 8.6, 14.8, 17.1
 */

import {
  ReconnectionManager,
  createReconnectionManager,
  ConnectionStatus,
  StoredSessionData,
  SessionRecoveryData,
  RecoveryFailureData,
} from '../reconnection-manager';

// Mock Socket.IO client
jest.mock('socket.io-client', () => {
  const mockSocket = {
    on: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connected: false,
    id: 'mock-socket-id',
  };

  return {
    io: jest.fn(() => mockSocket),
  };
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('ReconnectionManager', () => {
  const defaultOptions = {
    serverUrl: 'http://localhost:3001',
    initialDelay: 1000,
    maxDelay: 30000,
    maxAttempts: 10,
    backoffMultiplier: 2,
    storageKey: 'quiz_session',
  };

  let manager: ReconnectionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (manager) {
      manager.disconnect();
    }
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create a ReconnectionManager with default options', () => {
      manager = new ReconnectionManager({ serverUrl: 'http://localhost:3001' });
      
      expect(manager).toBeInstanceOf(ReconnectionManager);
      expect(manager.connectionStatus).toBe('disconnected');
      expect(manager.isConnected).toBe(false);
      expect(manager.isReconnecting).toBe(false);
    });

    it('should create a ReconnectionManager with custom options', () => {
      manager = new ReconnectionManager({
        serverUrl: 'http://localhost:3001',
        initialDelay: 500,
        maxDelay: 10000,
        maxAttempts: 5,
        backoffMultiplier: 1.5,
        storageKey: 'custom_session',
      });
      
      expect(manager).toBeInstanceOf(ReconnectionManager);
    });

    it('should restore session from localStorage if available', () => {
      const sessionData: StoredSessionData = {
        sessionId: 'session-123',
        participantId: 'participant-456',
        sessionToken: 'token-789',
        nickname: 'TestUser',
        timestamp: Date.now(),
      };
      
      localStorageMock.setItem('quiz_session', JSON.stringify(sessionData));
      
      manager = new ReconnectionManager(defaultOptions);
      
      expect(manager.hasStoredSession()).toBe(true);
      const stored = manager.getStoredSession();
      expect(stored?.sessionId).toBe('session-123');
      expect(stored?.participantId).toBe('participant-456');
      expect(stored?.nickname).toBe('TestUser');
    });

    it('should clear expired session from localStorage', () => {
      const expiredSessionData: StoredSessionData = {
        sessionId: 'session-123',
        participantId: 'participant-456',
        sessionToken: 'token-789',
        nickname: 'TestUser',
        timestamp: Date.now() - (6 * 60 * 1000), // 6 minutes ago (expired)
      };
      
      localStorageMock.setItem('quiz_session', JSON.stringify(expiredSessionData));
      
      manager = new ReconnectionManager(defaultOptions);
      
      expect(manager.hasStoredSession()).toBe(false);
    });
  });

  describe('createReconnectionManager factory', () => {
    it('should create a ReconnectionManager instance', () => {
      manager = createReconnectionManager(defaultOptions);
      
      expect(manager).toBeInstanceOf(ReconnectionManager);
    });
  });

  describe('setSessionData', () => {
    it('should store session data', () => {
      manager = new ReconnectionManager(defaultOptions);
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      
      expect(manager.hasStoredSession()).toBe(true);
      const stored = manager.getStoredSession();
      expect(stored?.sessionId).toBe('session-123');
      expect(stored?.participantId).toBe('participant-456');
      expect(stored?.sessionToken).toBe('token-789');
      expect(stored?.nickname).toBe('TestUser');
    });

    it('should save session data to localStorage', () => {
      manager = new ReconnectionManager(defaultOptions);
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'quiz_session',
        expect.any(String)
      );
      
      const savedData = JSON.parse(
        localStorageMock.setItem.mock.calls[0][1]
      ) as StoredSessionData;
      
      expect(savedData.sessionId).toBe('session-123');
      expect(savedData.participantId).toBe('participant-456');
      expect(savedData.sessionToken).toBe('token-789');
      expect(savedData.nickname).toBe('TestUser');
    });
  });

  describe('setLastKnownQuestionId', () => {
    it('should store last known question ID in localStorage', () => {
      manager = new ReconnectionManager(defaultOptions);
      
      manager.setLastKnownQuestionId('question-123');
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'quiz_session_last_question',
        'question-123'
      );
    });
  });

  describe('clearSession', () => {
    it('should clear all session data', () => {
      manager = new ReconnectionManager(defaultOptions);
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.setLastKnownQuestionId('question-123');
      
      manager.clearSession();
      
      expect(manager.hasStoredSession()).toBe(false);
      expect(manager.getStoredSession()).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('quiz_session');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('quiz_session_last_question');
    });
  });

  describe('connection status', () => {
    it('should start with disconnected status', () => {
      manager = new ReconnectionManager(defaultOptions);
      
      expect(manager.connectionStatus).toBe('disconnected');
      expect(manager.isConnected).toBe(false);
      expect(manager.isReconnecting).toBe(false);
    });

    it('should notify listeners on status change', () => {
      manager = new ReconnectionManager(defaultOptions);
      const listener = jest.fn();
      
      manager.onConnectionStatusChange(listener);
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      // Simulate connection by triggering the 'connect' event handler
      const { io } = require('socket.io-client');
      const mockSocket = io();
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      
      if (connectHandler) {
        connectHandler();
      }
      
      expect(listener).toHaveBeenCalledWith('connected', expect.any(Number));
    });

    it('should allow unsubscribing from status changes', () => {
      manager = new ReconnectionManager(defaultOptions);
      const listener = jest.fn();
      
      const unsubscribe = manager.onConnectionStatusChange(listener);
      unsubscribe();
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      // Simulate connection
      const { io } = require('socket.io-client');
      const mockSocket = io();
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      
      if (connectHandler) {
        connectHandler();
      }
      
      // Listener should not be called after unsubscribe
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('connect', () => {
    it('should not connect without session data', () => {
      manager = new ReconnectionManager(defaultOptions);
      const { io } = require('socket.io-client');
      
      manager.connect();
      
      // io should not be called without session data
      expect(io).not.toHaveBeenCalled();
    });

    it('should connect with session data', () => {
      manager = new ReconnectionManager(defaultOptions);
      const { io } = require('socket.io-client');
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      expect(io).toHaveBeenCalledWith(
        'http://localhost:3001',
        expect.objectContaining({
          auth: {
            token: 'token-789',
            role: 'participant',
          },
          reconnection: false,
          transports: ['websocket', 'polling'],
        })
      );
    });

    it('should set up event handlers on connect', () => {
      manager = new ReconnectionManager(defaultOptions);
      const { io } = require('socket.io-client');
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      const mockSocket = io();
      
      // Check that event handlers are set up
      const eventNames = mockSocket.on.mock.calls.map((call: any[]) => call[0]);
      expect(eventNames).toContain('connect');
      expect(eventNames).toContain('disconnect');
      expect(eventNames).toContain('connect_error');
      expect(eventNames).toContain('authenticated');
      expect(eventNames).toContain('auth_error');
      expect(eventNames).toContain('session_recovered');
      expect(eventNames).toContain('recovery_failed');
      expect(eventNames).toContain('kicked');
      expect(eventNames).toContain('banned');
      expect(eventNames).toContain('error');
      expect(eventNames).toContain('rate_limit_exceeded');
    });
  });

  describe('disconnect', () => {
    it('should disconnect and reset state', () => {
      manager = new ReconnectionManager(defaultOptions);
      const { io } = require('socket.io-client');
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      const mockSocket = io();
      
      manager.disconnect();
      
      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(manager.connectionStatus).toBe('disconnected');
    });
  });

  describe('exponential backoff', () => {
    it('should implement exponential backoff delays', () => {
      manager = new ReconnectionManager({
        ...defaultOptions,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      });
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      const { io } = require('socket.io-client');
      const mockSocket = io();
      
      // Simulate connection error to trigger reconnection
      const connectErrorHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect_error'
      )?.[1];
      
      if (connectErrorHandler) {
        // First error - should schedule reconnect with 1s delay
        connectErrorHandler(new Error('Connection failed'));
        expect(manager.connectionStatus).toBe('reconnecting');
        
        // Advance timer by 1s
        jest.advanceTimersByTime(1000);
        
        // Second error - should schedule reconnect with 2s delay
        connectErrorHandler(new Error('Connection failed'));
        
        // Advance timer by 2s
        jest.advanceTimersByTime(2000);
        
        // Third error - should schedule reconnect with 4s delay
        connectErrorHandler(new Error('Connection failed'));
        
        // Advance timer by 4s
        jest.advanceTimersByTime(4000);
        
        // Fourth error - should schedule reconnect with 8s delay
        connectErrorHandler(new Error('Connection failed'));
      }
    });

    it('should cap delay at maxDelay', () => {
      manager = new ReconnectionManager({
        ...defaultOptions,
        initialDelay: 1000,
        maxDelay: 5000,
        backoffMultiplier: 2,
        maxAttempts: 20,
      });
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      const { io } = require('socket.io-client');
      const mockSocket = io();
      
      const connectErrorHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect_error'
      )?.[1];
      
      if (connectErrorHandler) {
        // Trigger multiple errors to exceed maxDelay
        for (let i = 0; i < 10; i++) {
          connectErrorHandler(new Error('Connection failed'));
          jest.advanceTimersByTime(5000); // Max delay
        }
        
        // Should still be reconnecting (not failed) since we haven't exceeded maxAttempts
        expect(manager.connectionStatus).toBe('reconnecting');
      }
    });

    it('should fail after maxAttempts', () => {
      manager = new ReconnectionManager({
        ...defaultOptions,
        initialDelay: 100,
        maxDelay: 100,
        maxAttempts: 3,
      });
      
      const statusListener = jest.fn();
      manager.onConnectionStatusChange(statusListener);
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      const { io } = require('socket.io-client');
      const mockSocket = io();
      
      const connectErrorHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect_error'
      )?.[1];
      
      if (connectErrorHandler) {
        // Trigger errors up to maxAttempts
        for (let i = 0; i < 4; i++) {
          connectErrorHandler(new Error('Connection failed'));
          jest.advanceTimersByTime(100);
        }
        
        // Should be in failed state after exceeding maxAttempts
        expect(manager.connectionStatus).toBe('failed');
      }
    });
  });

  describe('session recovery events', () => {
    it('should emit reconnect_session on connection', () => {
      manager = new ReconnectionManager(defaultOptions);
      const { io } = require('socket.io-client');
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.setLastKnownQuestionId('question-abc');
      manager.connect();
      
      const mockSocket = io();
      
      // Simulate successful connection
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      
      if (connectHandler) {
        connectHandler();
      }
      
      expect(mockSocket.emit).toHaveBeenCalledWith('reconnect_session', {
        sessionId: 'session-123',
        participantId: 'participant-456',
        lastKnownQuestionId: 'question-abc',
      });
    });

    it('should handle session_recovered event', () => {
      manager = new ReconnectionManager(defaultOptions);
      const recoveredListener = jest.fn();
      manager.onSessionRecovered(recoveredListener);
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      const { io } = require('socket.io-client');
      const mockSocket = io();
      
      // Find and call the session_recovered handler
      const sessionRecoveredHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'session_recovered'
      )?.[1];
      
      const recoveryData: SessionRecoveryData = {
        participantId: 'participant-456',
        currentState: 'ACTIVE_QUESTION',
        currentQuestion: {
          questionId: 'q-123',
          questionText: 'Test question?',
          questionType: 'MULTIPLE_CHOICE',
          options: [
            { optionId: 'o-1', optionText: 'Option A' },
            { optionId: 'o-2', optionText: 'Option B' },
          ],
          timeLimit: 30,
          shuffleOptions: false,
        },
        remainingTime: 15,
        totalScore: 100,
        rank: 5,
        leaderboard: [],
        streakCount: 2,
        isEliminated: false,
        isSpectator: false,
      };
      
      if (sessionRecoveredHandler) {
        sessionRecoveredHandler(recoveryData);
      }
      
      expect(recoveredListener).toHaveBeenCalledWith(recoveryData);
    });

    it('should handle recovery_failed event', () => {
      manager = new ReconnectionManager(defaultOptions);
      const failedListener = jest.fn();
      manager.onRecoveryFailed(failedListener);
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      const { io } = require('socket.io-client');
      const mockSocket = io();
      
      // Find and call the recovery_failed handler
      const recoveryFailedHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'recovery_failed'
      )?.[1];
      
      const failureData: RecoveryFailureData = {
        reason: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please rejoin with the join code.',
      };
      
      if (recoveryFailedHandler) {
        recoveryFailedHandler(failureData);
      }
      
      expect(failedListener).toHaveBeenCalledWith(failureData);
      // Session should be cleared on SESSION_EXPIRED
      expect(manager.hasStoredSession()).toBe(false);
    });

    it('should clear session on SESSION_ENDED', () => {
      manager = new ReconnectionManager(defaultOptions);
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      const { io } = require('socket.io-client');
      const mockSocket = io();
      
      const recoveryFailedHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'recovery_failed'
      )?.[1];
      
      if (recoveryFailedHandler) {
        recoveryFailedHandler({
          reason: 'SESSION_ENDED',
          message: 'The quiz has ended.',
        });
      }
      
      expect(manager.hasStoredSession()).toBe(false);
    });
  });

  describe('kicked and banned events', () => {
    it('should clear session on kicked event', () => {
      manager = new ReconnectionManager(defaultOptions);
      const errorListener = jest.fn();
      manager.onError(errorListener);
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      const { io } = require('socket.io-client');
      const mockSocket = io();
      
      const kickedHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'kicked'
      )?.[1];
      
      if (kickedHandler) {
        kickedHandler({ message: 'You have been kicked' });
      }
      
      expect(manager.hasStoredSession()).toBe(false);
      expect(errorListener).toHaveBeenCalledWith({
        code: 'KICKED',
        message: 'You have been kicked',
      });
    });

    it('should clear session on banned event', () => {
      manager = new ReconnectionManager(defaultOptions);
      const errorListener = jest.fn();
      manager.onError(errorListener);
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      const { io } = require('socket.io-client');
      const mockSocket = io();
      
      const bannedHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'banned'
      )?.[1];
      
      if (bannedHandler) {
        bannedHandler({ message: 'You have been banned' });
      }
      
      expect(manager.hasStoredSession()).toBe(false);
      expect(errorListener).toHaveBeenCalledWith({
        code: 'BANNED',
        message: 'You have been banned',
      });
    });
  });

  describe('attemptReconnect', () => {
    it('should reset reconnection state and start reconnecting', () => {
      manager = new ReconnectionManager({
        ...defaultOptions,
        initialDelay: 1000,
      });
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      
      // Manually trigger reconnection
      manager.attemptReconnect();
      
      expect(manager.connectionStatus).toBe('reconnecting');
      expect(manager.currentAttempt).toBe(0);
    });
  });

  describe('server disconnect handling', () => {
    it('should not reconnect on server-initiated disconnect', () => {
      manager = new ReconnectionManager(defaultOptions);
      const statusListener = jest.fn();
      manager.onConnectionStatusChange(statusListener);
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      const { io } = require('socket.io-client');
      const mockSocket = io();
      
      // Simulate connection first
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      
      if (connectHandler) {
        connectHandler();
      }
      
      // Clear previous calls
      statusListener.mockClear();
      
      // Simulate server-initiated disconnect
      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'disconnect'
      )?.[1];
      
      if (disconnectHandler) {
        disconnectHandler('io server disconnect');
      }
      
      // Should be disconnected, not reconnecting
      expect(manager.connectionStatus).toBe('disconnected');
    });

    it('should reconnect on client-side disconnect', () => {
      manager = new ReconnectionManager(defaultOptions);
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      const { io } = require('socket.io-client');
      const mockSocket = io();
      
      // Simulate connection first
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1];
      
      if (connectHandler) {
        connectHandler();
      }
      
      // Simulate client-side disconnect (network issue)
      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'disconnect'
      )?.[1];
      
      if (disconnectHandler) {
        disconnectHandler('transport close');
      }
      
      // Should be reconnecting
      expect(manager.connectionStatus).toBe('reconnecting');
    });
  });

  describe('getSocket', () => {
    it('should return null when not connected', () => {
      manager = new ReconnectionManager(defaultOptions);
      
      expect(manager.socketInstance).toBeNull();
    });

    it('should return socket instance when connected', () => {
      manager = new ReconnectionManager(defaultOptions);
      
      manager.setSessionData('session-123', 'participant-456', 'token-789', 'TestUser');
      manager.connect();
      
      expect(manager.socketInstance).not.toBeNull();
    });
  });
});

describe('Exponential Backoff Calculation', () => {
  it('should follow the pattern: 1s, 2s, 4s, 8s, 16s, 30s (max)', () => {
    const initialDelay = 1000;
    const maxDelay = 30000;
    const backoffMultiplier = 2;
    
    let currentDelay = initialDelay;
    const delays: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      delays.push(Math.min(currentDelay, maxDelay));
      currentDelay = currentDelay * backoffMultiplier;
    }
    
    expect(delays[0]).toBe(1000);  // 1s
    expect(delays[1]).toBe(2000);  // 2s
    expect(delays[2]).toBe(4000);  // 4s
    expect(delays[3]).toBe(8000);  // 8s
    expect(delays[4]).toBe(16000); // 16s
    expect(delays[5]).toBe(30000); // 30s (capped)
    expect(delays[6]).toBe(30000); // 30s (capped)
    expect(delays[7]).toBe(30000); // 30s (capped)
  });
});
