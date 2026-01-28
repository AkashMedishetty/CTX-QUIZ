/**
 * Socket.IO Mock Usage Example
 * 
 * This file demonstrates how to use the centralized Socket.IO mock
 * for testing components and hooks that use Socket.IO.
 * 
 * The mock is located at: src/__mocks__/socket.io-client.ts
 */

import { 
  createMockSocket, 
  getDefaultMockSocket, 
  resetDefaultMockSocket,
  io,
  type MockSocket 
} from '../../__mocks__/socket.io-client';

describe('Socket.IO Mock Usage Examples', () => {
  let mockSocket: MockSocket;

  beforeEach(() => {
    // Option 1: Use the default mock socket (shared across tests)
    resetDefaultMockSocket();
    mockSocket = getDefaultMockSocket();
    
    // Option 2: Create a fresh mock socket for isolation
    // mockSocket = createMockSocket();
  });

  describe('Basic Socket Operations', () => {
    it('should create a mock socket with io()', () => {
      const socket = io('http://localhost:3001');
      
      expect(socket).toBeDefined();
      expect(socket.id).toBeDefined();
      expect(socket.connected).toBe(false);
    });

    it('should register event listeners with on()', () => {
      const callback = jest.fn();
      
      mockSocket.on('test_event', callback);
      
      expect(mockSocket.on).toHaveBeenCalledWith('test_event', callback);
      expect(mockSocket._listeners.has('test_event')).toBe(true);
    });

    it('should emit events with emit()', () => {
      mockSocket.emit('submit_answer', { questionId: 'q-123', selectedOptions: ['opt-1'] });
      
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'submit_answer',
        { questionId: 'q-123', selectedOptions: ['opt-1'] }
      );
    });

    it('should track all emitted events', () => {
      mockSocket.emit('event1', { data: 1 });
      mockSocket.emit('event2', { data: 2 });
      
      const emittedEvents = mockSocket._getEmittedEvents();
      
      expect(emittedEvents).toHaveLength(2);
      expect(emittedEvents[0]).toEqual({ event: 'event1', args: [{ data: 1 }] });
      expect(emittedEvents[1]).toEqual({ event: 'event2', args: [{ data: 2 }] });
    });
  });

  describe('Simulating Server Events', () => {
    it('should simulate server events with _simulateEvent()', () => {
      const callback = jest.fn();
      mockSocket.on('question_started', callback);
      
      // Simulate server sending a question_started event
      mockSocket._simulateEvent('question_started', {
        questionId: 'q-123',
        questionText: 'What is 2 + 2?',
        timeLimit: 30,
      });
      
      expect(callback).toHaveBeenCalledWith({
        questionId: 'q-123',
        questionText: 'What is 2 + 2?',
        timeLimit: 30,
      });
    });

    it('should simulate connection with _simulateConnect()', () => {
      const connectCallback = jest.fn();
      mockSocket.on('connect', connectCallback);
      
      mockSocket._simulateConnect();
      
      expect(mockSocket.connected).toBe(true);
      expect(connectCallback).toHaveBeenCalled();
    });

    it('should simulate disconnection with _simulateDisconnect()', () => {
      const disconnectCallback = jest.fn();
      mockSocket.on('disconnect', disconnectCallback);
      
      mockSocket._simulateConnect();
      mockSocket._simulateDisconnect('io server disconnect');
      
      expect(mockSocket.connected).toBe(false);
      expect(disconnectCallback).toHaveBeenCalledWith('io server disconnect');
    });
  });

  describe('Testing Answer Submission Flow', () => {
    it('should handle answer submission and server response', async () => {
      const answerAcceptedCallback = jest.fn();
      mockSocket.on('answer_accepted', answerAcceptedCallback);
      
      // Client submits answer
      mockSocket.emit('submit_answer', {
        questionId: 'q-123',
        selectedOptions: ['opt-a'],
        clientTimestamp: Date.now(),
      });
      
      // Verify emission
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'submit_answer',
        expect.objectContaining({
          questionId: 'q-123',
          selectedOptions: ['opt-a'],
        })
      );
      
      // Simulate server accepting the answer
      mockSocket._simulateEvent('answer_accepted', {
        questionId: 'q-123',
        answerId: 'ans-456',
        responseTimeMs: 1500,
      });
      
      expect(answerAcceptedCallback).toHaveBeenCalledWith({
        questionId: 'q-123',
        answerId: 'ans-456',
        responseTimeMs: 1500,
      });
    });

    it('should handle answer rejection', () => {
      const answerRejectedCallback = jest.fn();
      mockSocket.on('answer_rejected', answerRejectedCallback);
      
      mockSocket.emit('submit_answer', {
        questionId: 'q-123',
        selectedOptions: ['opt-a'],
      });
      
      // Simulate server rejecting (e.g., time expired)
      mockSocket._simulateEvent('answer_rejected', {
        questionId: 'q-123',
        reason: 'TIME_EXPIRED',
        message: 'Answer submitted after timer expired',
      });
      
      expect(answerRejectedCallback).toHaveBeenCalledWith({
        questionId: 'q-123',
        reason: 'TIME_EXPIRED',
        message: 'Answer submitted after timer expired',
      });
    });
  });

  describe('Testing Quiz Flow', () => {
    it('should handle complete quiz question flow', () => {
      const questionStartedCallback = jest.fn();
      const timerTickCallback = jest.fn();
      const revealAnswersCallback = jest.fn();
      
      mockSocket.on('question_started', questionStartedCallback);
      mockSocket.on('timer_tick', timerTickCallback);
      mockSocket.on('reveal_answers', revealAnswersCallback);
      
      // 1. Question starts
      mockSocket._simulateEvent('question_started', {
        questionIndex: 0,
        question: {
          questionId: 'q-1',
          questionText: 'What is the capital of France?',
          options: [
            { optionId: 'a', optionText: 'London' },
            { optionId: 'b', optionText: 'Paris' },
            { optionId: 'c', optionText: 'Berlin' },
          ],
        },
        timeLimit: 30,
        startTime: Date.now(),
        endTime: Date.now() + 30000,
      });
      
      expect(questionStartedCallback).toHaveBeenCalled();
      
      // 2. Timer ticks
      mockSocket._simulateEvent('timer_tick', {
        questionId: 'q-1',
        remainingSeconds: 25,
        serverTime: Date.now(),
      });
      
      expect(timerTickCallback).toHaveBeenCalled();
      
      // 3. Answers revealed
      mockSocket._simulateEvent('reveal_answers', {
        questionId: 'q-1',
        correctOptions: ['b'],
        explanationText: 'Paris is the capital of France.',
        statistics: {
          totalAnswers: 50,
          correctAnswers: 35,
          averageResponseTime: 8500,
        },
      });
      
      expect(revealAnswersCallback).toHaveBeenCalled();
    });
  });

  describe('Cleanup and Reset', () => {
    it('should reset mock state between tests', () => {
      mockSocket.emit('some_event', { data: 'test' });
      expect(mockSocket._getEmittedEvents()).toHaveLength(1);
      
      mockSocket._reset();
      
      expect(mockSocket._getEmittedEvents()).toHaveLength(0);
      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(mockSocket._listeners.size).toBe(0);
    });
  });
});
