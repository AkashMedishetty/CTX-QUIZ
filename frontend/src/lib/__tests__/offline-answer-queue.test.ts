/**
 * OfflineAnswerQueue Tests
 * 
 * Tests for the OfflineAnswerQueue class covering:
 * - Queue answers in localStorage when offline
 * - Flush queue on reconnection
 * - Submit queued answers in order
 * - Queue status management
 * 
 * Requirements: 4.8, 14.10
 */

import {
  OfflineAnswerQueue,
  createOfflineAnswerQueue,
  QueuedAnswer,
  QueueStatus,
  FlushResult,
} from '../offline-answer-queue';

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

// Mock navigator.onLine
let mockOnlineStatus = true;
Object.defineProperty(navigator, 'onLine', {
  get: () => mockOnlineStatus,
  configurable: true,
});


// Mock Socket.IO socket
const createMockSocket = () => {
  const listeners: Record<string, Function[]> = {};
  
  return {
    on: jest.fn((event: string, callback: Function) => {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(callback);
    }),
    off: jest.fn((event: string, callback: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((cb) => cb !== callback);
      }
    }),
    emit: jest.fn(),
    connected: true,
    // Helper to trigger events
    _trigger: (event: string, data: any) => {
      if (listeners[event]) {
        listeners[event].forEach((cb) => cb(data));
      }
    },
    _getListeners: () => listeners,
  };
};

describe('OfflineAnswerQueue', () => {
  const defaultOptions = {
    storageKey: 'test_answer_queue',
    maxQueueSize: 100,
    submissionTimeout: 5000,
  };

  let queue: OfflineAnswerQueue;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    mockOnlineStatus = true;
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (queue) {
      queue.destroy();
    }
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create an OfflineAnswerQueue with default options', () => {
      queue = new OfflineAnswerQueue();
      
      expect(queue).toBeInstanceOf(OfflineAnswerQueue);
      expect(queue.status).toBe('idle');
      expect(queue.pendingCount).toBe(0);
      expect(queue.hasPendingAnswers).toBe(false);
    });

    it('should create an OfflineAnswerQueue with custom options', () => {
      queue = new OfflineAnswerQueue({
        storageKey: 'custom_queue',
        maxQueueSize: 50,
        submissionTimeout: 3000,
      });
      
      expect(queue).toBeInstanceOf(OfflineAnswerQueue);
    });

    it('should load existing queue from localStorage', () => {
      const existingQueue: QueuedAnswer[] = [
        {
          questionId: 'q-1',
          selectedOptionIds: ['opt-1'],
          timestamp: Date.now(),
          sessionId: 'session-123',
          participantId: 'participant-456',
        },
      ];
      
      localStorageMock.setItem('test_answer_queue', JSON.stringify(existingQueue));
      
      queue = new OfflineAnswerQueue(defaultOptions);
      
      expect(queue.pendingCount).toBe(1);
      expect(queue.hasPendingAnswers).toBe(true);
    });
  });


  describe('createOfflineAnswerQueue factory', () => {
    it('should create an OfflineAnswerQueue instance', () => {
      queue = createOfflineAnswerQueue(defaultOptions);
      
      expect(queue).toBeInstanceOf(OfflineAnswerQueue);
    });
  });

  describe('queueAnswer', () => {
    it('should queue a valid answer', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      
      const result = queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1', 'opt-2'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      expect(result).toBe(true);
      expect(queue.pendingCount).toBe(1);
      expect(queue.hasPendingAnswers).toBe(true);
    });

    it('should add timestamp to queued answer', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const beforeTime = Date.now();
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      const afterTime = Date.now();
      const queuedAnswers = queue.getQueuedAnswers();
      
      expect(queuedAnswers[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(queuedAnswers[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should save queue to localStorage', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'test_answer_queue',
        expect.any(String)
      );
    });

    it('should reject answer with missing required fields', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      
      const result = queue.queueAnswer({
        questionId: '',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      expect(result).toBe(false);
      expect(queue.pendingCount).toBe(0);
    });

    it('should reject duplicate answer for same question', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      const result = queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-2'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      expect(result).toBe(false);
      expect(queue.pendingCount).toBe(1);
    });

    it('should allow same question for different participants', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-1',
      });
      
      const result = queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-2'],
        sessionId: 'session-456',
        participantId: 'participant-2',
      });
      
      expect(result).toBe(true);
      expect(queue.pendingCount).toBe(2);
    });


    it('should remove oldest answer when queue is full', () => {
      queue = new OfflineAnswerQueue({
        ...defaultOptions,
        maxQueueSize: 2,
      });
      
      queue.queueAnswer({
        questionId: 'q-1',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      queue.queueAnswer({
        questionId: 'q-2',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      queue.queueAnswer({
        questionId: 'q-3',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      expect(queue.pendingCount).toBe(2);
      const answers = queue.getQueuedAnswers();
      expect(answers[0].questionId).toBe('q-2');
      expect(answers[1].questionId).toBe('q-3');
    });

    it('should notify listeners when answer is queued', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const queueChangeListener = jest.fn();
      const answerQueuedListener = jest.fn();
      
      queue.onQueueChange(queueChangeListener);
      queue.onAnswerQueued(answerQueuedListener);
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      expect(queueChangeListener).toHaveBeenCalledWith(expect.any(Array));
      expect(answerQueuedListener).toHaveBeenCalledWith(
        expect.objectContaining({
          questionId: 'q-123',
          selectedOptionIds: ['opt-1'],
        })
      );
    });

    it('should support optional answerText for open-ended questions', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: [],
        sessionId: 'session-456',
        participantId: 'participant-789',
        answerText: 'My open-ended answer',
      });
      
      const answers = queue.getQueuedAnswers();
      expect(answers[0].answerText).toBe('My open-ended answer');
    });

    it('should support optional answerNumber for number input questions', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: [],
        sessionId: 'session-456',
        participantId: 'participant-789',
        answerNumber: 42,
      });
      
      const answers = queue.getQueuedAnswers();
      expect(answers[0].answerNumber).toBe(42);
    });
  });


  describe('getQueuedAnswers', () => {
    it('should return a copy of the queue', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      const answers1 = queue.getQueuedAnswers();
      const answers2 = queue.getQueuedAnswers();
      
      expect(answers1).not.toBe(answers2);
      expect(answers1).toEqual(answers2);
    });
  });

  describe('clearQueue', () => {
    it('should clear all queued answers', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      
      queue.queueAnswer({
        questionId: 'q-1',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      queue.queueAnswer({
        questionId: 'q-2',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      expect(queue.pendingCount).toBe(2);
      
      queue.clearQueue();
      
      expect(queue.pendingCount).toBe(0);
      expect(queue.hasPendingAnswers).toBe(false);
    });

    it('should update localStorage when clearing', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      localStorageMock.setItem.mockClear();
      
      queue.clearQueue();
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'test_answer_queue',
        '[]'
      );
    });

    it('should notify listeners when queue is cleared', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const listener = jest.fn();
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      queue.onQueueChange(listener);
      listener.mockClear();
      
      queue.clearQueue();
      
      expect(listener).toHaveBeenCalledWith([]);
    });
  });


  describe('removeAnswer', () => {
    it('should remove a specific answer from the queue', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      
      queue.queueAnswer({
        questionId: 'q-1',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      queue.queueAnswer({
        questionId: 'q-2',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      const result = queue.removeAnswer('q-1', 'session-456', 'participant-789');
      
      expect(result).toBe(true);
      expect(queue.pendingCount).toBe(1);
      expect(queue.getQueuedAnswers()[0].questionId).toBe('q-2');
    });

    it('should return false if answer not found', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      
      queue.queueAnswer({
        questionId: 'q-1',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      const result = queue.removeAnswer('q-999', 'session-456', 'participant-789');
      
      expect(result).toBe(false);
      expect(queue.pendingCount).toBe(1);
    });
  });

  describe('flushQueue', () => {
    it('should return empty array if no socket provided', async () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      const results = await queue.flushQueue(null);
      
      expect(results).toEqual([]);
      expect(queue.pendingCount).toBe(1);
    });

    it('should return empty array if queue is empty', async () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const mockSocket = createMockSocket();
      
      const results = await queue.flushQueue(mockSocket as any);
      
      expect(results).toEqual([]);
    });

    it('should submit answers in order (oldest first)', async () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const mockSocket = createMockSocket();
      
      queue.queueAnswer({
        questionId: 'q-1',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      jest.advanceTimersByTime(100);
      
      queue.queueAnswer({
        questionId: 'q-2',
        selectedOptionIds: ['opt-2'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      // Start flush
      const flushPromise = queue.flushQueue(mockSocket as any);
      
      // Simulate server accepting first answer
      await jest.advanceTimersByTimeAsync(10);
      mockSocket._trigger('answer_accepted', { questionId: 'q-1' });
      
      // Simulate server accepting second answer
      await jest.advanceTimersByTimeAsync(10);
      mockSocket._trigger('answer_accepted', { questionId: 'q-2' });
      
      const results = await flushPromise;
      
      // Check emit order
      const emitCalls = mockSocket.emit.mock.calls.filter(
        (call: any[]) => call[0] === 'submit_answer'
      );
      expect(emitCalls[0][1].questionId).toBe('q-1');
      expect(emitCalls[1][1].questionId).toBe('q-2');
      
      expect(results.length).toBe(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });


    it('should remove successfully submitted answers from queue', async () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const mockSocket = createMockSocket();
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      expect(queue.pendingCount).toBe(1);
      
      const flushPromise = queue.flushQueue(mockSocket as any);
      
      await jest.advanceTimersByTimeAsync(10);
      mockSocket._trigger('answer_accepted', { questionId: 'q-123' });
      
      await flushPromise;
      
      expect(queue.pendingCount).toBe(0);
    });

    it('should handle TIME_EXPIRED rejection as success', async () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const mockSocket = createMockSocket();
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      const flushPromise = queue.flushQueue(mockSocket as any);
      
      await jest.advanceTimersByTimeAsync(10);
      mockSocket._trigger('answer_rejected', { 
        questionId: 'q-123', 
        reason: 'TIME_EXPIRED' 
      });
      
      const results = await flushPromise;
      
      expect(results[0].success).toBe(true);
      expect(queue.pendingCount).toBe(0);
    });

    it('should handle ALREADY_SUBMITTED rejection as success', async () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const mockSocket = createMockSocket();
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      const flushPromise = queue.flushQueue(mockSocket as any);
      
      await jest.advanceTimersByTimeAsync(10);
      mockSocket._trigger('answer_rejected', { 
        questionId: 'q-123', 
        reason: 'ALREADY_SUBMITTED' 
      });
      
      const results = await flushPromise;
      
      expect(results[0].success).toBe(true);
      expect(queue.pendingCount).toBe(0);
    });

    it('should handle other rejections as failure', async () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const mockSocket = createMockSocket();
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      const flushPromise = queue.flushQueue(mockSocket as any);
      
      await jest.advanceTimersByTimeAsync(10);
      mockSocket._trigger('answer_rejected', { 
        questionId: 'q-123', 
        reason: 'INVALID_QUESTION' 
      });
      
      const results = await flushPromise;
      
      expect(results[0].success).toBe(false);
      expect(queue.pendingCount).toBe(1); // Still in queue
    });


    it('should handle submission timeout', async () => {
      queue = new OfflineAnswerQueue({
        ...defaultOptions,
        submissionTimeout: 1000,
      });
      const mockSocket = createMockSocket();
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      const flushPromise = queue.flushQueue(mockSocket as any);
      
      // Advance past timeout without server response
      await jest.advanceTimersByTimeAsync(1100);
      
      const results = await flushPromise;
      
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Submission timeout');
    });

    it('should update status during flush', async () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const mockSocket = createMockSocket();
      const statusListener = jest.fn();
      
      queue.onStatusChange(statusListener);
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      const flushPromise = queue.flushQueue(mockSocket as any);
      
      expect(queue.status).toBe('flushing');
      expect(statusListener).toHaveBeenCalledWith('flushing');
      
      await jest.advanceTimersByTimeAsync(10);
      mockSocket._trigger('answer_accepted', { questionId: 'q-123' });
      
      await flushPromise;
      
      expect(queue.status).toBe('idle');
      expect(statusListener).toHaveBeenCalledWith('idle');
    });

    it('should set error status if any submission fails', async () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const mockSocket = createMockSocket();
      
      queue.queueAnswer({
        questionId: 'q-1',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      queue.queueAnswer({
        questionId: 'q-2',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      const flushPromise = queue.flushQueue(mockSocket as any);
      
      await jest.advanceTimersByTimeAsync(10);
      mockSocket._trigger('answer_accepted', { questionId: 'q-1' });
      
      await jest.advanceTimersByTimeAsync(10);
      mockSocket._trigger('answer_rejected', { 
        questionId: 'q-2', 
        reason: 'INVALID_QUESTION' 
      });
      
      await flushPromise;
      
      expect(queue.status).toBe('error');
    });

    it('should not allow concurrent flushes', async () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const mockSocket = createMockSocket();
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      // Start first flush
      const flush1 = queue.flushQueue(mockSocket as any);
      
      // Try to start second flush
      const flush2 = queue.flushQueue(mockSocket as any);
      
      // Second flush should return empty immediately
      const results2 = await flush2;
      expect(results2).toEqual([]);
      
      // Complete first flush
      await jest.advanceTimersByTimeAsync(10);
      mockSocket._trigger('answer_accepted', { questionId: 'q-123' });
      
      await flush1;
    });


    it('should notify flush complete listeners', async () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const mockSocket = createMockSocket();
      const flushCompleteListener = jest.fn();
      
      queue.onFlushComplete(flushCompleteListener);
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      const flushPromise = queue.flushQueue(mockSocket as any);
      
      await jest.advanceTimersByTimeAsync(10);
      mockSocket._trigger('answer_accepted', { questionId: 'q-123' });
      
      await flushPromise;
      
      expect(flushCompleteListener).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            success: true,
            answer: expect.objectContaining({ questionId: 'q-123' }),
          }),
        ])
      );
    });

    it('should emit submit_answer with correct payload', async () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const mockSocket = createMockSocket();
      
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1', 'opt-2'],
        sessionId: 'session-456',
        participantId: 'participant-789',
        answerText: 'My answer',
        answerNumber: 42,
      });
      
      const flushPromise = queue.flushQueue(mockSocket as any);
      
      await jest.advanceTimersByTimeAsync(10);
      mockSocket._trigger('answer_accepted', { questionId: 'q-123' });
      
      await flushPromise;
      
      expect(mockSocket.emit).toHaveBeenCalledWith('submit_answer', {
        questionId: 'q-123',
        selectedOptions: ['opt-1', 'opt-2'],
        answerText: 'My answer',
        answerNumber: 42,
        clientTimestamp: expect.any(Number),
      });
    });
  });

  describe('online/offline detection', () => {
    it('should detect initial online status', () => {
      mockOnlineStatus = true;
      queue = new OfflineAnswerQueue(defaultOptions);
      
      expect(queue.isOnline).toBe(true);
    });

    it('should detect initial offline status', () => {
      mockOnlineStatus = false;
      queue = new OfflineAnswerQueue(defaultOptions);
      
      expect(queue.isOnline).toBe(false);
    });
  });

  describe('event listeners', () => {
    it('should allow unsubscribing from queue change events', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const listener = jest.fn();
      
      const unsubscribe = queue.onQueueChange(listener);
      
      queue.queueAnswer({
        questionId: 'q-1',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      expect(listener).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      queue.queueAnswer({
        questionId: 'q-2',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should allow unsubscribing from status change events', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const listener = jest.fn();
      
      const unsubscribe = queue.onStatusChange(listener);
      unsubscribe();
      
      // Status changes won't trigger listener after unsubscribe
    });

    it('should allow unsubscribing from flush complete events', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const listener = jest.fn();
      
      const unsubscribe = queue.onFlushComplete(listener);
      unsubscribe();
      
      // Flush complete won't trigger listener after unsubscribe
    });

    it('should allow unsubscribing from answer queued events', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const listener = jest.fn();
      
      const unsubscribe = queue.onAnswerQueued(listener);
      
      queue.queueAnswer({
        questionId: 'q-1',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      expect(listener).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      queue.queueAnswer({
        questionId: 'q-2',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });


  describe('destroy', () => {
    it('should clean up resources', () => {
      queue = new OfflineAnswerQueue(defaultOptions);
      const listener = jest.fn();
      
      queue.onQueueChange(listener);
      
      queue.destroy();
      
      // After destroy, listeners should be cleared
      queue.queueAnswer({
        questionId: 'q-123',
        selectedOptionIds: ['opt-1'],
        sessionId: 'session-456',
        participantId: 'participant-789',
      });
      
      // Listener should not be called after destroy
      expect(listener).not.toHaveBeenCalled();
    });
  });
});

describe('Queue Order Preservation', () => {
  it('should maintain FIFO order for queued answers', () => {
    const queue = new OfflineAnswerQueue({
      storageKey: 'test_order_queue',
    });
    
    const answers = [
      { questionId: 'q-1', selectedOptionIds: ['a'], sessionId: 's', participantId: 'p' },
      { questionId: 'q-2', selectedOptionIds: ['b'], sessionId: 's', participantId: 'p' },
      { questionId: 'q-3', selectedOptionIds: ['c'], sessionId: 's', participantId: 'p' },
    ];
    
    answers.forEach((a) => queue.queueAnswer(a));
    
    const queued = queue.getQueuedAnswers();
    
    expect(queued[0].questionId).toBe('q-1');
    expect(queued[1].questionId).toBe('q-2');
    expect(queued[2].questionId).toBe('q-3');
    
    queue.destroy();
  });
});

describe('localStorage Persistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should persist queue across instances', () => {
    const queue1 = new OfflineAnswerQueue({
      storageKey: 'persist_test_queue',
    });
    
    queue1.queueAnswer({
      questionId: 'q-persist',
      selectedOptionIds: ['opt-1'],
      sessionId: 'session-456',
      participantId: 'participant-789',
    });
    
    queue1.destroy();
    
    // Create new instance with same storage key
    const queue2 = new OfflineAnswerQueue({
      storageKey: 'persist_test_queue',
    });
    
    expect(queue2.pendingCount).toBe(1);
    expect(queue2.getQueuedAnswers()[0].questionId).toBe('q-persist');
    
    queue2.destroy();
  });

  it('should handle corrupted localStorage data gracefully', () => {
    localStorageMock.setItem('corrupt_queue', 'not valid json');
    
    const queue = new OfflineAnswerQueue({
      storageKey: 'corrupt_queue',
    });
    
    expect(queue.pendingCount).toBe(0);
    
    queue.destroy();
  });

  it('should handle non-array localStorage data gracefully', () => {
    localStorageMock.setItem('non_array_queue', JSON.stringify({ foo: 'bar' }));
    
    const queue = new OfflineAnswerQueue({
      storageKey: 'non_array_queue',
    });
    
    expect(queue.pendingCount).toBe(0);
    
    queue.destroy();
  });
});
