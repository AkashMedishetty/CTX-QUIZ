/**
 * Quiz Timer Service Tests
 * 
 * Tests for server-side timer with timer_tick broadcasts:
 * - Timer start/stop functionality
 * - Timer tick broadcasts every second
 * - Automatic reveal phase trigger on expiration
 * - Timer state persistence in Redis
 * - Pause/resume/reset operations
 * 
 * Requirements: 5.2, 12.4
 */

import { QuizTimer, quizTimerManager } from '../quiz-timer.service';
import { redisDataStructuresService } from '../redis-data-structures.service';
import { pubSubService } from '../pubsub.service';

// Mock dependencies
jest.mock('../redis-data-structures.service');
jest.mock('../pubsub.service');

describe('QuizTimer', () => {
  const mockSessionId = 'test-session-123';
  const mockQuestionId = 'question-456';
  const mockTimeLimit = 5; // 5 seconds

  let mockOnTimerExpired: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockOnTimerExpired = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start', () => {
    it('should start timer and store end time in Redis', async () => {
      // Arrange
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await timer.start();

      // Assert
      expect(redisDataStructuresService.updateSessionState).toHaveBeenCalledWith(
        mockSessionId,
        expect.objectContaining({
          timerEndTime: expect.any(Number),
          currentQuestionStartTime: expect.any(Number),
        })
      );

      // Verify timer is running
      expect(timer.getIsRunning()).toBe(true);
    });

    it('should broadcast initial timer_tick immediately on start', async () => {
      // Arrange
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await timer.start();

      // Assert - should have immediate tick
      expect(pubSubService.publishToParticipants).toHaveBeenCalledWith(
        mockSessionId,
        'timer_tick',
        expect.objectContaining({
          questionId: mockQuestionId,
          remainingSeconds: mockTimeLimit,
          serverTime: expect.any(Number),
        })
      );

      expect(pubSubService.publishToBigScreen).toHaveBeenCalledWith(
        mockSessionId,
        'timer_tick',
        expect.objectContaining({
          questionId: mockQuestionId,
          remainingSeconds: mockTimeLimit,
          serverTime: expect.any(Number),
        })
      );

      expect(pubSubService.publishToController).toHaveBeenCalledWith(
        mockSessionId,
        'timer_tick',
        expect.objectContaining({
          questionId: mockQuestionId,
          remainingSeconds: mockTimeLimit,
          serverTime: expect.any(Number),
        })
      );

      timer.stop();
    });

    it('should broadcast timer_tick every second', async () => {
      // Arrange
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await timer.start();
      jest.clearAllMocks(); // Clear the immediate tick

      // Advance time by 1 second and run all timers
      await jest.advanceTimersByTimeAsync(1000);

      // Assert - should have ticked once
      expect(pubSubService.publishToParticipants).toHaveBeenCalledTimes(1);
      expect(pubSubService.publishToBigScreen).toHaveBeenCalledTimes(1);
      expect(pubSubService.publishToController).toHaveBeenCalledTimes(1);

      // Advance time by another second
      await jest.advanceTimersByTimeAsync(1000);

      // Assert - should have ticked twice total
      expect(pubSubService.publishToParticipants).toHaveBeenCalledTimes(2);
      expect(pubSubService.publishToBigScreen).toHaveBeenCalledTimes(2);
      expect(pubSubService.publishToController).toHaveBeenCalledTimes(2);

      timer.stop();
    });

    it('should trigger onTimerExpired callback when timer reaches 0', async () => {
      // Arrange
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: 2, // 2 seconds for faster test
        onTimerExpired: mockOnTimerExpired,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await timer.start();

      // Advance time to expiration (2 seconds + 1ms to ensure we're past 0)
      await jest.advanceTimersByTimeAsync(2001);

      // Assert
      expect(mockOnTimerExpired).toHaveBeenCalledTimes(1);
      expect(timer.getIsRunning()).toBe(false);
    });

    it('should not start timer if already running', async () => {
      // Arrange
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await timer.start();
      const firstCallCount = (redisDataStructuresService.updateSessionState as jest.Mock).mock.calls.length;

      await timer.start(); // Try to start again

      // Assert - should not call Redis again
      expect(redisDataStructuresService.updateSessionState).toHaveBeenCalledTimes(firstCallCount);

      timer.stop();
    });
  });

  describe('stop', () => {
    it('should stop timer and clear interval', async () => {
      // Arrange
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      await timer.start();
      jest.clearAllMocks();

      // Act
      timer.stop();

      // Advance time - should not tick anymore
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Assert
      expect(timer.getIsRunning()).toBe(false);
      expect(pubSubService.publishToParticipants).not.toHaveBeenCalled();
    });

    it('should not trigger onTimerExpired when stopped manually', async () => {
      // Arrange
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      await timer.start();

      // Act
      timer.stop();

      // Advance time past expiration
      jest.advanceTimersByTime(10000);
      await Promise.resolve();

      // Assert
      expect(mockOnTimerExpired).not.toHaveBeenCalled();
    });
  });

  describe('pause and resume', () => {
    it('should pause timer and stop broadcasting ticks', async () => {
      // Arrange
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      await timer.start();
      jest.clearAllMocks();

      // Act
      timer.pause();

      // Advance time - should not tick
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Assert
      expect(timer.getIsRunning()).toBe(true); // Still marked as running
      expect(pubSubService.publishToParticipants).not.toHaveBeenCalled();

      timer.stop();
    });

    it('should resume timer and continue broadcasting ticks', async () => {
      // Arrange
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      await timer.start();
      timer.pause();
      jest.clearAllMocks();

      // Act
      await timer.resume();

      // Assert - should have immediate tick on resume
      expect(pubSubService.publishToParticipants).toHaveBeenCalledTimes(1);

      // Advance time - should continue ticking
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(pubSubService.publishToParticipants).toHaveBeenCalledTimes(2);

      timer.stop();
    });
  });

  describe('reset', () => {
    it('should reset timer with new time limit', async () => {
      // Arrange
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      await timer.start();
      jest.clearAllMocks();

      // Act
      const newTimeLimit = 10;
      await timer.reset(newTimeLimit);

      // Assert - should update Redis with new end time
      expect(redisDataStructuresService.updateSessionState).toHaveBeenCalledWith(
        mockSessionId,
        expect.objectContaining({
          timerEndTime: expect.any(Number),
          currentQuestionStartTime: expect.any(Number),
        })
      );

      // Should broadcast with new time limit
      expect(pubSubService.publishToParticipants).toHaveBeenCalledWith(
        mockSessionId,
        'timer_tick',
        expect.objectContaining({
          questionId: mockQuestionId,
          remainingSeconds: newTimeLimit,
          serverTime: expect.any(Number),
        })
      );

      timer.stop();
    });
  });

  describe('getRemainingSeconds', () => {
    it('should return correct remaining seconds', async () => {
      // Arrange
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      await timer.start();

      // Act & Assert
      expect(timer.getRemainingSeconds()).toBe(mockTimeLimit);

      // Advance time by 2 seconds
      jest.advanceTimersByTime(2000);
      expect(timer.getRemainingSeconds()).toBe(mockTimeLimit - 2);

      // Advance past expiration
      jest.advanceTimersByTime(10000);
      expect(timer.getRemainingSeconds()).toBe(0);

      timer.stop();
    });
  });

  describe('error handling', () => {
    it('should handle Redis errors gracefully during start', async () => {
      // Arrange
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockRejectedValue(
        new Error('Redis connection failed')
      );

      // Act & Assert
      await expect(timer.start()).rejects.toThrow('Redis connection failed');
      expect(timer.getIsRunning()).toBe(false);
    });

    it('should continue ticking even if broadcast fails', async () => {
      // Arrange
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockRejectedValue(
        new Error('Broadcast failed')
      );
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await timer.start();
      jest.clearAllMocks();

      // Advance time
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Assert - should still be running despite broadcast error
      expect(timer.getIsRunning()).toBe(true);

      // Should still attempt to broadcast
      expect(pubSubService.publishToParticipants).toHaveBeenCalled();

      timer.stop();
    });

    it('should handle errors in onTimerExpired callback', async () => {
      // Arrange
      const errorCallback = jest.fn().mockRejectedValue(new Error('Callback error'));
      const timer = new QuizTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: 1, // 1 second
        onTimerExpired: errorCallback,
      });

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      await timer.start();

      // Advance to expiration
      await jest.advanceTimersByTimeAsync(1001);

      // Assert - timer should still stop even if callback fails
      expect(errorCallback).toHaveBeenCalled();
      expect(timer.getIsRunning()).toBe(false);
    });
  });
});

describe('QuizTimerManager', () => {
  const mockSessionId = 'test-session-123';
  const mockQuestionId = 'question-456';
  const mockTimeLimit = 5;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createTimer', () => {
    it('should create and start a new timer', async () => {
      // Arrange
      const mockOnTimerExpired = jest.fn();

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      const timer = await quizTimerManager.createTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      // Assert
      expect(timer).toBeInstanceOf(QuizTimer);
      expect(timer.getIsRunning()).toBe(true);

      timer.stop();
    });

    it('should stop existing timer before creating new one', async () => {
      // Arrange
      const mockOnTimerExpired = jest.fn();

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      // Act
      const timer1 = await quizTimerManager.createTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      const timer2 = await quizTimerManager.createTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      // Assert
      expect(timer1.getIsRunning()).toBe(false); // First timer stopped
      expect(timer2.getIsRunning()).toBe(true); // Second timer running

      timer2.stop();
    });
  });

  describe('getTimer', () => {
    it('should retrieve an active timer', async () => {
      // Arrange
      const mockOnTimerExpired = jest.fn();

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      const createdTimer = await quizTimerManager.createTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      // Act
      const retrievedTimer = quizTimerManager.getTimer(mockSessionId, mockQuestionId);

      // Assert
      expect(retrievedTimer).toBe(createdTimer);

      createdTimer.stop();
    });

    it('should return undefined for non-existent timer', () => {
      // Act
      const timer = quizTimerManager.getTimer('non-existent', 'non-existent');

      // Assert
      expect(timer).toBeUndefined();
    });
  });

  describe('stopTimer', () => {
    it('should stop and remove a timer', async () => {
      // Arrange
      const mockOnTimerExpired = jest.fn();

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      const timer = await quizTimerManager.createTimer({
        sessionId: mockSessionId,
        questionId: mockQuestionId,
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      // Act
      quizTimerManager.stopTimer(mockSessionId, mockQuestionId);

      // Assert
      expect(timer.getIsRunning()).toBe(false);
      expect(quizTimerManager.getTimer(mockSessionId, mockQuestionId)).toBeUndefined();
    });
  });

  describe('stopAllTimersForSession', () => {
    it('should stop all timers for a session', async () => {
      // Arrange
      const mockOnTimerExpired = jest.fn();

      (redisDataStructuresService.updateSessionState as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToParticipants as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToBigScreen as jest.Mock).mockResolvedValue(undefined);
      (pubSubService.publishToController as jest.Mock).mockResolvedValue(undefined);

      const timer1 = await quizTimerManager.createTimer({
        sessionId: mockSessionId,
        questionId: 'question-1',
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      const timer2 = await quizTimerManager.createTimer({
        sessionId: mockSessionId,
        questionId: 'question-2',
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      const timer3 = await quizTimerManager.createTimer({
        sessionId: 'other-session',
        questionId: 'question-3',
        timeLimit: mockTimeLimit,
        onTimerExpired: mockOnTimerExpired,
      });

      // Act
      quizTimerManager.stopAllTimersForSession(mockSessionId);

      // Assert
      expect(timer1.getIsRunning()).toBe(false);
      expect(timer2.getIsRunning()).toBe(false);
      expect(timer3.getIsRunning()).toBe(true); // Different session, should still be running

      expect(quizTimerManager.getTimer(mockSessionId, 'question-1')).toBeUndefined();
      expect(quizTimerManager.getTimer(mockSessionId, 'question-2')).toBeUndefined();
      expect(quizTimerManager.getTimer('other-session', 'question-3')).toBe(timer3);

      timer3.stop();
    });
  });
});
