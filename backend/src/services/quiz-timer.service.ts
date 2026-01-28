/**
 * Quiz Timer Service
 * 
 * Manages server-side authoritative timers for quiz questions.
 * 
 * Features:
 * - Server-side timer with millisecond precision
 * - Timer state stored in Redis for sync across servers
 * - Broadcasts timer_tick every second with remainingSeconds and serverTime
 * - Automatically triggers reveal phase when timer expires
 * - Supports pause/resume/reset operations
 * 
 * Requirements: 5.2, 12.4
 */

import { redisDataStructuresService } from './redis-data-structures.service';
import { pubSubService } from './pubsub.service';

export interface QuizTimerOptions {
  sessionId: string;
  questionId: string;
  timeLimit: number; // in seconds
  onTimerExpired: () => void | Promise<void>;
}

export class QuizTimer {
  private sessionId: string;
  private questionId: string;
  private timeLimit: number;
  private endTime: number;
  private intervalId: NodeJS.Timeout | null = null;
  private onTimerExpired: () => void | Promise<void>;
  private isRunning: boolean = false;

  constructor(options: QuizTimerOptions) {
    this.sessionId = options.sessionId;
    this.questionId = options.questionId;
    this.timeLimit = options.timeLimit;
    this.onTimerExpired = options.onTimerExpired;
    this.endTime = 0;
  }

  /**
   * Start the timer
   * 
   * Calculates the end time, stores it in Redis for cross-server sync,
   * and begins broadcasting timer_tick events every second.
   * 
   * @returns Promise that resolves when timer is started
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[QuizTimer] Timer already running for question:', this.questionId);
      return;
    }

    try {
      // Calculate end time
      this.endTime = Date.now() + (this.timeLimit * 1000);
      this.isRunning = true;

      console.log('[QuizTimer] Starting timer:', {
        sessionId: this.sessionId,
        questionId: this.questionId,
        timeLimit: this.timeLimit,
        endTime: this.endTime,
      });

      // Store timer end time in Redis for sync across servers
      await redisDataStructuresService.updateSessionState(this.sessionId, {
        timerEndTime: this.endTime,
        currentQuestionStartTime: Date.now(),
      });

      // Start ticking every second
      this.intervalId = setInterval(() => {
        this.tick();
      }, 1000);

      // Immediate first tick
      await this.tick();
    } catch (error) {
      console.error('[QuizTimer] Error starting timer:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the timer
   * 
   * Clears the interval and marks the timer as not running.
   * Does not trigger the onTimerExpired callback.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;

    console.log('[QuizTimer] Timer stopped:', {
      sessionId: this.sessionId,
      questionId: this.questionId,
    });
  }

  /**
   * Pause the timer
   * 
   * Stops broadcasting ticks but preserves the end time.
   * Can be resumed later.
   */
  pause(): void {
    if (!this.isRunning) {
      console.warn('[QuizTimer] Timer not running, cannot pause');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('[QuizTimer] Timer paused:', {
      sessionId: this.sessionId,
      questionId: this.questionId,
    });
  }

  /**
   * Resume the timer
   * 
   * Resumes broadcasting ticks from where it was paused.
   */
  async resume(): Promise<void> {
    if (!this.isRunning) {
      console.warn('[QuizTimer] Timer not running, cannot resume');
      return;
    }

    if (this.intervalId) {
      console.warn('[QuizTimer] Timer already ticking, cannot resume');
      return;
    }

    console.log('[QuizTimer] Timer resumed:', {
      sessionId: this.sessionId,
      questionId: this.questionId,
    });

    // Start ticking again
    this.intervalId = setInterval(() => {
      this.tick();
    }, 1000);

    // Immediate tick
    await this.tick();
  }

  /**
   * Reset the timer with a new time limit
   * 
   * Stops the current timer and starts a new one with the specified time limit.
   * 
   * @param newTimeLimit - New time limit in seconds
   */
  async reset(newTimeLimit: number): Promise<void> {
    console.log('[QuizTimer] Resetting timer:', {
      sessionId: this.sessionId,
      questionId: this.questionId,
      oldTimeLimit: this.timeLimit,
      newTimeLimit,
    });

    this.stop();
    this.timeLimit = newTimeLimit;
    await this.start();
  }

  /**
   * Get remaining time in seconds
   * 
   * @returns Remaining seconds (0 if expired)
   */
  getRemainingSeconds(): number {
    const remaining = Math.max(0, this.endTime - Date.now());
    return Math.ceil(remaining / 1000);
  }

  /**
   * Check if timer is running
   * 
   * @returns True if timer is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Tick handler - called every second
   * 
   * Calculates remaining time, broadcasts timer_tick event,
   * and triggers expiration callback when time runs out.
   */
  private async tick(): Promise<void> {
    try {
      const remaining = Math.max(0, this.endTime - Date.now());
      const remainingSeconds = Math.ceil(remaining / 1000);
      const serverTime = Date.now();

      console.log('[QuizTimer] Tick:', {
        sessionId: this.sessionId,
        questionId: this.questionId,
        remainingSeconds,
      });

      // Broadcast timer_tick to all participants
      await pubSubService.publishToParticipants(
        this.sessionId,
        'timer_tick',
        {
          questionId: this.questionId,
          remainingSeconds,
          serverTime,
        }
      );

      // Also broadcast to big screen
      await pubSubService.publishToBigScreen(
        this.sessionId,
        'timer_tick',
        {
          questionId: this.questionId,
          remainingSeconds,
          serverTime,
        }
      );

      // Also broadcast to controller
      await pubSubService.publishToController(
        this.sessionId,
        'timer_tick',
        {
          questionId: this.questionId,
          remainingSeconds,
          serverTime,
        }
      );

      // Check if timer expired
      if (remainingSeconds === 0) {
        console.log('[QuizTimer] Timer expired:', {
          sessionId: this.sessionId,
          questionId: this.questionId,
        });

        this.stop();

        // Trigger expiration callback
        try {
          await this.onTimerExpired();
        } catch (error) {
          console.error('[QuizTimer] Error in onTimerExpired callback:', error);
          // Don't rethrow - timer has already stopped
        }
      }
    } catch (error) {
      console.error('[QuizTimer] Error in tick:', error);
      // Don't stop the timer on tick errors - continue ticking
    }
  }
}

/**
 * Quiz Timer Manager Service
 * 
 * Manages active timers for all quiz sessions.
 * Provides a singleton interface for creating and managing timers.
 */
class QuizTimerManager {
  private timers: Map<string, QuizTimer> = new Map();

  /**
   * Create and start a new timer for a question
   * 
   * @param options - Timer options
   * @returns The created timer instance
   */
  async createTimer(options: QuizTimerOptions): Promise<QuizTimer> {
    const key = this.getTimerKey(options.sessionId, options.questionId);

    // Stop existing timer if any
    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      console.warn('[QuizTimerManager] Stopping existing timer for:', key);
      existingTimer.stop();
    }

    // Create new timer
    const timer = new QuizTimer(options);
    this.timers.set(key, timer);

    // Start the timer
    await timer.start();

    return timer;
  }

  /**
   * Get an active timer
   * 
   * @param sessionId - Session ID
   * @param questionId - Question ID
   * @returns The timer instance or undefined if not found
   */
  getTimer(sessionId: string, questionId: string): QuizTimer | undefined {
    const key = this.getTimerKey(sessionId, questionId);
    return this.timers.get(key);
  }

  /**
   * Stop and remove a timer
   * 
   * @param sessionId - Session ID
   * @param questionId - Question ID
   */
  stopTimer(sessionId: string, questionId: string): void {
    const key = this.getTimerKey(sessionId, questionId);
    const timer = this.timers.get(key);

    if (timer) {
      timer.stop();
      this.timers.delete(key);
      console.log('[QuizTimerManager] Timer stopped and removed:', key);
    }
  }

  /**
   * Stop all timers for a session
   * 
   * @param sessionId - Session ID
   */
  stopAllTimersForSession(sessionId: string): void {
    const keysToRemove: string[] = [];

    for (const [key, timer] of this.timers.entries()) {
      if (key.startsWith(`${sessionId}:`)) {
        timer.stop();
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => this.timers.delete(key));

    console.log('[QuizTimerManager] Stopped all timers for session:', sessionId, {
      count: keysToRemove.length,
    });
  }

  /**
   * Get timer key for storage
   * 
   * @param sessionId - Session ID
   * @param questionId - Question ID
   * @returns Timer key
   */
  private getTimerKey(sessionId: string, questionId: string): string {
    return `${sessionId}:${questionId}`;
  }
}

// Export singleton instance
export const quizTimerManager = new QuizTimerManager();
