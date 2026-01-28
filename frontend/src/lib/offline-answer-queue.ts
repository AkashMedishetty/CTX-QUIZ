/**
 * OfflineAnswerQueue - Queue answers in localStorage when offline
 * 
 * Handles answer submission when the participant is offline:
 * - Queues answers in localStorage when offline
 * - Flushes queue on reconnection
 * - Submits queued answers in order
 * - Provides queue status and pending count
 * 
 * Requirements: 4.8, 14.10
 */

import { Socket } from 'socket.io-client';

/**
 * Queued answer entry structure
 */
export interface QueuedAnswer {
  /** Unique identifier for the question */
  questionId: string;
  /** Array of selected option IDs */
  selectedOptionIds: string[];
  /** Timestamp when the answer was queued (Unix timestamp in ms) */
  timestamp: number;
  /** Quiz session ID */
  sessionId: string;
  /** Participant ID */
  participantId: string;
  /** Optional answer text for open-ended questions */
  answerText?: string;
  /** Optional answer number for number input questions */
  answerNumber?: number;
}

/**
 * Queue status types
 */
export type QueueStatus = 'idle' | 'flushing' | 'error';

/**
 * Flush result for a single answer
 */
export interface FlushResult {
  /** The queued answer that was processed */
  answer: QueuedAnswer;
  /** Whether the submission was successful */
  success: boolean;
  /** Error message if submission failed */
  error?: string;
}

/**
 * Event listener callback types
 */
export type QueueChangeListener = (queue: QueuedAnswer[]) => void;
export type StatusChangeListener = (status: QueueStatus) => void;
export type FlushCompleteListener = (results: FlushResult[]) => void;
export type AnswerQueuedListener = (answer: QueuedAnswer) => void;

/**
 * OfflineAnswerQueue configuration options
 */
export interface OfflineAnswerQueueOptions {
  /** localStorage key for the queue (default: 'quiz_answer_queue') */
  storageKey?: string;
  /** Maximum number of answers to store in queue (default: 100) */
  maxQueueSize?: number;
  /** Timeout for each answer submission in ms (default: 5000) */
  submissionTimeout?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_OPTIONS: Required<OfflineAnswerQueueOptions> = {
  storageKey: 'quiz_answer_queue',
  maxQueueSize: 100,
  submissionTimeout: 5000,
};

/**
 * OfflineAnswerQueue class
 * 
 * Manages offline answer queueing and synchronization.
 * Stores answers in localStorage when offline and flushes them on reconnection.
 * 
 * Requirements: 4.8, 14.10
 */
export class OfflineAnswerQueue {
  private options: Required<OfflineAnswerQueueOptions>;
  private _queue: QueuedAnswer[] = [];
  private _status: QueueStatus = 'idle';
  private _isOnline: boolean = true;
  
  // Event listeners
  private queueChangeListeners: Set<QueueChangeListener> = new Set();
  private statusChangeListeners: Set<StatusChangeListener> = new Set();
  private flushCompleteListeners: Set<FlushCompleteListener> = new Set();
  private answerQueuedListeners: Set<AnswerQueuedListener> = new Set();
  
  // Browser event handlers (stored for cleanup)
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  /**
   * Create a new OfflineAnswerQueue instance
   * 
   * @param options - Configuration options
   */
  constructor(options: OfflineAnswerQueueOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    
    // Load queue from localStorage
    this.loadQueueFromStorage();
    
    // Set up online/offline detection
    this.setupOnlineDetection();
  }

  /**
   * Get current queue status
   */
  get status(): QueueStatus {
    return this._status;
  }

  /**
   * Check if currently online
   */
  get isOnline(): boolean {
    return this._isOnline;
  }

  /**
   * Get the number of pending answers in the queue
   */
  get pendingCount(): number {
    return this._queue.length;
  }

  /**
   * Check if there are pending answers
   */
  get hasPendingAnswers(): boolean {
    return this._queue.length > 0;
  }

  /**
   * Get a copy of the current queue
   */
  getQueuedAnswers(): QueuedAnswer[] {
    return [...this._queue];
  }

  /**
   * Queue an answer for later submission
   * 
   * Stores the answer in localStorage for submission when back online.
   * If already online, the answer can still be queued for batch submission.
   * 
   * @param answer - The answer to queue
   * @returns true if the answer was queued successfully
   * 
   * Requirements: 4.8, 14.10
   */
  queueAnswer(answer: Omit<QueuedAnswer, 'timestamp'>): boolean {
    // Validate required fields
    if (!answer.questionId || !answer.sessionId || !answer.participantId) {
      console.error('[OfflineAnswerQueue] Invalid answer: missing required fields');
      return false;
    }

    // Check if we already have an answer for this question
    const existingIndex = this._queue.findIndex(
      (a) => a.questionId === answer.questionId && 
             a.sessionId === answer.sessionId &&
             a.participantId === answer.participantId
    );

    if (existingIndex !== -1) {
      console.warn('[OfflineAnswerQueue] Answer already queued for this question, skipping');
      return false;
    }

    // Check queue size limit
    if (this._queue.length >= this.options.maxQueueSize) {
      console.warn('[OfflineAnswerQueue] Queue is full, removing oldest answer');
      this._queue.shift();
    }

    // Create the queued answer with timestamp
    const queuedAnswer: QueuedAnswer = {
      ...answer,
      timestamp: Date.now(),
    };

    // Add to queue
    this._queue.push(queuedAnswer);
    
    // Save to localStorage
    this.saveQueueToStorage();
    
    // Notify listeners
    this.notifyQueueChangeListeners();
    this.notifyAnswerQueuedListeners(queuedAnswer);

    console.log('[OfflineAnswerQueue] Answer queued:', {
      questionId: answer.questionId,
      queueSize: this._queue.length,
    });

    return true;
  }

  /**
   * Flush the queue by submitting all queued answers
   * 
   * Submits answers in order (oldest first) via the provided socket.
   * Removes successfully submitted answers from the queue.
   * 
   * @param socket - Socket.IO socket instance to use for submission
   * @returns Promise resolving to array of flush results
   * 
   * Requirements: 4.8, 14.10
   */
  async flushQueue(socket: Socket | null): Promise<FlushResult[]> {
    if (!socket) {
      console.warn('[OfflineAnswerQueue] Cannot flush queue: no socket provided');
      return [];
    }

    if (this._queue.length === 0) {
      console.log('[OfflineAnswerQueue] Queue is empty, nothing to flush');
      return [];
    }

    if (this._status === 'flushing') {
      console.warn('[OfflineAnswerQueue] Already flushing queue');
      return [];
    }

    console.log('[OfflineAnswerQueue] Flushing queue:', {
      pendingCount: this._queue.length,
    });

    this.setStatus('flushing');
    const results: FlushResult[] = [];
    const answersToProcess = [...this._queue];

    // Process answers in order (oldest first)
    for (const answer of answersToProcess) {
      try {
        const success = await this.submitAnswer(socket, answer);
        
        if (success) {
          // Remove from queue on success
          this.removeFromQueue(answer.questionId, answer.sessionId, answer.participantId);
          results.push({ answer, success: true });
        } else {
          results.push({ 
            answer, 
            success: false, 
            error: 'Submission rejected by server' 
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[OfflineAnswerQueue] Failed to submit answer:', errorMessage);
        results.push({ answer, success: false, error: errorMessage });
      }
    }

    // Update status based on results
    const hasErrors = results.some((r) => !r.success);
    this.setStatus(hasErrors ? 'error' : 'idle');

    // Notify listeners
    this.notifyFlushCompleteListeners(results);

    console.log('[OfflineAnswerQueue] Flush complete:', {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    });

    return results;
  }

  /**
   * Clear all queued answers
   * 
   * Removes all answers from the queue and localStorage.
   */
  clearQueue(): void {
    console.log('[OfflineAnswerQueue] Clearing queue');
    
    this._queue = [];
    this.saveQueueToStorage();
    this.notifyQueueChangeListeners();
  }

  /**
   * Remove a specific answer from the queue
   * 
   * @param questionId - Question ID to remove
   * @param sessionId - Session ID
   * @param participantId - Participant ID
   * @returns true if an answer was removed
   */
  removeAnswer(questionId: string, sessionId: string, participantId: string): boolean {
    return this.removeFromQueue(questionId, sessionId, participantId);
  }

  /**
   * Clean up resources
   * 
   * Call this when the queue is no longer needed.
   */
  destroy(): void {
    console.log('[OfflineAnswerQueue] Destroying queue');
    
    // Remove browser event listeners
    if (typeof window !== 'undefined') {
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler);
      }
      if (this.offlineHandler) {
        window.removeEventListener('offline', this.offlineHandler);
      }
    }
    
    // Clear all listeners
    this.queueChangeListeners.clear();
    this.statusChangeListeners.clear();
    this.flushCompleteListeners.clear();
    this.answerQueuedListeners.clear();
  }

  // ==================== Event Listener Methods ====================

  /**
   * Add a queue change listener
   */
  onQueueChange(listener: QueueChangeListener): () => void {
    this.queueChangeListeners.add(listener);
    return () => this.queueChangeListeners.delete(listener);
  }

  /**
   * Add a status change listener
   */
  onStatusChange(listener: StatusChangeListener): () => void {
    this.statusChangeListeners.add(listener);
    return () => this.statusChangeListeners.delete(listener);
  }

  /**
   * Add a flush complete listener
   */
  onFlushComplete(listener: FlushCompleteListener): () => void {
    this.flushCompleteListeners.add(listener);
    return () => this.flushCompleteListeners.delete(listener);
  }

  /**
   * Add an answer queued listener
   */
  onAnswerQueued(listener: AnswerQueuedListener): () => void {
    this.answerQueuedListeners.add(listener);
    return () => this.answerQueuedListeners.delete(listener);
  }

  // ==================== Private Methods ====================

  /**
   * Submit a single answer via WebSocket
   */
  private submitAnswer(socket: Socket, answer: QueuedAnswer): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Submission timeout'));
      }, this.options.submissionTimeout);

      // Set up one-time listeners for response
      const handleAccepted = (data: { questionId: string }) => {
        if (data.questionId === answer.questionId) {
          clearTimeout(timeout);
          socket.off('answer_accepted', handleAccepted);
          socket.off('answer_rejected', handleRejected);
          resolve(true);
        }
      };

      const handleRejected = (data: { questionId: string; reason: string }) => {
        if (data.questionId === answer.questionId) {
          clearTimeout(timeout);
          socket.off('answer_accepted', handleAccepted);
          socket.off('answer_rejected', handleRejected);
          
          // TIME_EXPIRED and ALREADY_SUBMITTED are expected for queued answers
          // We consider these as "successful" in terms of queue processing
          if (data.reason === 'TIME_EXPIRED' || data.reason === 'ALREADY_SUBMITTED') {
            console.log('[OfflineAnswerQueue] Answer rejected (expected):', data.reason);
            resolve(true); // Remove from queue anyway
          } else {
            resolve(false);
          }
        }
      };

      socket.on('answer_accepted', handleAccepted);
      socket.on('answer_rejected', handleRejected);

      // Emit the answer submission
      socket.emit('submit_answer', {
        questionId: answer.questionId,
        selectedOptions: answer.selectedOptionIds,
        answerText: answer.answerText,
        answerNumber: answer.answerNumber,
        clientTimestamp: answer.timestamp,
      });
    });
  }

  /**
   * Remove an answer from the queue
   */
  private removeFromQueue(
    questionId: string, 
    sessionId: string, 
    participantId: string
  ): boolean {
    const initialLength = this._queue.length;
    
    this._queue = this._queue.filter(
      (a) => !(a.questionId === questionId && 
               a.sessionId === sessionId && 
               a.participantId === participantId)
    );
    
    if (this._queue.length !== initialLength) {
      this.saveQueueToStorage();
      this.notifyQueueChangeListeners();
      return true;
    }
    
    return false;
  }

  /**
   * Set up online/offline detection
   */
  private setupOnlineDetection(): void {
    if (typeof window === 'undefined') return;

    // Initialize online status
    this._isOnline = navigator.onLine;

    // Set up event handlers
    this.onlineHandler = () => {
      console.log('[OfflineAnswerQueue] Browser went online');
      this._isOnline = true;
    };

    this.offlineHandler = () => {
      console.log('[OfflineAnswerQueue] Browser went offline');
      this._isOnline = false;
    };

    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  /**
   * Update status and notify listeners
   */
  private setStatus(status: QueueStatus): void {
    if (this._status !== status) {
      this._status = status;
      this.notifyStatusChangeListeners(status);
    }
  }

  /**
   * Save queue to localStorage
   */
  private saveQueueToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.options.storageKey, JSON.stringify(this._queue));
    } catch (error) {
      console.error('[OfflineAnswerQueue] Failed to save queue to localStorage:', error);
    }
  }

  /**
   * Load queue from localStorage
   */
  private loadQueueFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const storedData = localStorage.getItem(this.options.storageKey);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        if (Array.isArray(parsed)) {
          this._queue = parsed;
          console.log('[OfflineAnswerQueue] Loaded queue from localStorage:', {
            count: this._queue.length,
          });
        }
      }
    } catch (error) {
      console.error('[OfflineAnswerQueue] Failed to load queue from localStorage:', error);
      this._queue = [];
    }
  }

  // ==================== Notification Methods ====================

  private notifyQueueChangeListeners(): void {
    const queueCopy = [...this._queue];
    this.queueChangeListeners.forEach((listener) => {
      try {
        listener(queueCopy);
      } catch (error) {
        console.error('[OfflineAnswerQueue] Error in queue change listener:', error);
      }
    });
  }

  private notifyStatusChangeListeners(status: QueueStatus): void {
    this.statusChangeListeners.forEach((listener) => {
      try {
        listener(status);
      } catch (error) {
        console.error('[OfflineAnswerQueue] Error in status change listener:', error);
      }
    });
  }

  private notifyFlushCompleteListeners(results: FlushResult[]): void {
    this.flushCompleteListeners.forEach((listener) => {
      try {
        listener(results);
      } catch (error) {
        console.error('[OfflineAnswerQueue] Error in flush complete listener:', error);
      }
    });
  }

  private notifyAnswerQueuedListeners(answer: QueuedAnswer): void {
    this.answerQueuedListeners.forEach((listener) => {
      try {
        listener(answer);
      } catch (error) {
        console.error('[OfflineAnswerQueue] Error in answer queued listener:', error);
      }
    });
  }
}

/**
 * Create a new OfflineAnswerQueue instance
 * 
 * Factory function for creating OfflineAnswerQueue instances.
 * 
 * @param options - Configuration options
 * @returns New OfflineAnswerQueue instance
 */
export function createOfflineAnswerQueue(
  options: OfflineAnswerQueueOptions = {}
): OfflineAnswerQueue {
  return new OfflineAnswerQueue(options);
}
