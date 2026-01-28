/**
 * Load Tester - Core load testing logic for CTX Quiz
 * 
 * Provides functionality to:
 * - Simulate multiple concurrent participants
 * - Create WebSocket connections
 * - Simulate join flow with random nicknames
 * - Simulate answer submissions
 * - Track connection and submission statistics
 * - Log WebSocket events for debugging
 * 
 * Requirements: 15.1, 15.7
 */

import { io, Socket } from 'socket.io-client';
import { post } from './api-client';
import { WebSocketLogger, websocketLogger } from './websocket-logger';

// ==================== Types ====================

/**
 * Load test configuration
 */
export interface LoadTestConfig {
  /** Target session join code */
  joinCode: string;
  /** Number of participants to simulate (100-1000) */
  participantCount: number;
  /** Delay between participant joins in ms (default: 50) */
  joinDelayMs?: number;
  /** Whether to simulate answer submissions */
  simulateAnswers?: boolean;
  /** Min delay before answering in ms (default: 500) */
  answerDelayMinMs?: number;
  /** Max delay before answering in ms (default: 5000) */
  answerDelayMaxMs?: number;
}

/**
 * Simulated participant state
 */
export interface SimulatedParticipant {
  id: number;
  participantId: string | null;
  sessionId: string | null;
  nickname: string;
  token: string | null;
  socket: Socket | null;
  status: 'pending' | 'joining' | 'connected' | 'disconnected' | 'error';
  error: string | null;
  joinedAt: number | null;
  answersSubmitted: number;
  lastLatencyMs: number | null;
  /** Last recorded timer drift in ms (server time - client time) */
  lastDriftMs: number | null;
  /** History of drift measurements for this participant */
  driftHistory: TimerDriftEntry[];
}

/**
 * Latency history entry
 */
export interface LatencyHistoryEntry {
  timestamp: number;
  latencyMs: number;
  participantId: number;
}

/**
 * Thundering herd burst result for a single participant
 */
export interface ThunderingHerdParticipantResult {
  participantId: number;
  success: boolean;
  responseTimeMs: number | null;
  error: string | null;
  droppedConnection: boolean;
}

/**
 * Thundering herd simulation statistics
 */
export interface ThunderingHerdStats {
  /** Total number of submissions attempted */
  totalSubmissions: number;
  /** Number of successful submissions */
  successfulSubmissions: number;
  /** Number of failed submissions */
  failedSubmissions: number;
  /** Number of dropped connections during burst */
  droppedConnections: number;
  /** Success rate as percentage */
  successRate: number;
  /** Average response time in ms */
  avgResponseTimeMs: number | null;
  /** Minimum response time in ms */
  minResponseTimeMs: number | null;
  /** Maximum response time in ms */
  maxResponseTimeMs: number | null;
  /** P50 response time */
  p50ResponseTimeMs: number | null;
  /** P95 response time */
  p95ResponseTimeMs: number | null;
  /** P99 response time */
  p99ResponseTimeMs: number | null;
  /** Total burst duration in ms */
  burstDurationMs: number;
  /** Timestamp when burst started */
  burstStartTime: number;
  /** Timestamp when burst completed */
  burstEndTime: number;
  /** Individual participant results */
  participantResults: ThunderingHerdParticipantResult[];
}

/**
 * Timer drift entry for tracking sync accuracy
 */
export interface TimerDriftEntry {
  timestamp: number;
  driftMs: number;
  participantId: number;
  serverTime: number;
  clientTime: number;
}

/**
 * Timer sync statistics
 */
export interface TimerSyncStats {
  /** Average drift across all participants */
  averageDriftMs: number | null;
  /** Minimum drift observed */
  minDriftMs: number | null;
  /** Maximum drift observed */
  maxDriftMs: number | null;
  /** Absolute average drift (ignoring sign) */
  absoluteAverageDriftMs: number | null;
  /** Number of participants within acceptable drift (< 50ms) */
  withinThresholdCount: number;
  /** Total participants with drift data */
  totalWithDriftData: number;
  /** Percentage of participants within acceptable drift */
  withinThresholdPercentage: number;
  /** Drift percentiles */
  percentiles: {
    p50: number | null;
    p95: number | null;
    p99: number | null;
  };
  /** Drift history for charting */
  driftHistory: TimerDriftEntry[];
}

/**
 * Latency percentiles
 */
export interface LatencyPercentiles {
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

/**
 * Load test statistics
 */
export interface LoadTestStats {
  totalParticipants: number;
  pendingJoins: number;
  successfulJoins: number;
  failedJoins: number;
  connectedCount: number;
  disconnectedCount: number;
  totalAnswersSubmitted: number;
  averageLatencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  startTime: number | null;
  elapsedTimeMs: number;
  /** Latency percentiles */
  percentiles: LatencyPercentiles;
  /** Latency history for charting */
  latencyHistory: LatencyHistoryEntry[];
  /** Timer sync statistics */
  timerSync: TimerSyncStats;
}

/**
 * Load test status
 */
export type LoadTestStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

/**
 * Load test event callbacks
 */
export interface LoadTestCallbacks {
  onStatusChange?: (status: LoadTestStatus) => void;
  onStatsUpdate?: (stats: LoadTestStats) => void;
  onParticipantUpdate?: (participant: SimulatedParticipant) => void;
  onError?: (error: string) => void;
  onQuestionReceived?: (questionId: string, questionIndex: number) => void;
  onTimerTick?: (remainingSeconds: number, serverTime: number) => void;
}

/**
 * Join response from API
 */
interface JoinResponse {
  sessionId: string;
  participantId: string;
  sessionToken: string;
}

// ==================== Utility Functions ====================

/**
 * Generate a random nickname for simulated participants
 */
function generateRandomNickname(): string {
  const adjectives = [
    'Swift', 'Clever', 'Brave', 'Quick', 'Smart', 'Bold', 'Keen', 'Sharp',
    'Fast', 'Bright', 'Cool', 'Epic', 'Super', 'Mega', 'Ultra', 'Hyper',
    'Turbo', 'Power', 'Cyber', 'Neon', 'Pixel', 'Retro', 'Cosmic', 'Stellar'
  ];
  const nouns = [
    'Fox', 'Wolf', 'Bear', 'Eagle', 'Hawk', 'Tiger', 'Lion', 'Panda',
    'Dragon', 'Phoenix', 'Knight', 'Ninja', 'Wizard', 'Hero', 'Star', 'Comet',
    'Rocket', 'Blaze', 'Storm', 'Thunder', 'Flash', 'Spark', 'Bolt', 'Wave'
  ];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 1000);
  return `${adjective}${noun}${number}`;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get random delay within range
 */
function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Calculate percentile from sorted array
 */
function calculatePercentile(sortedValues: number[], percentile: number): number | null {
  if (sortedValues.length === 0) return null;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

// ==================== Load Tester Class ====================

/**
 * Load Tester class for simulating concurrent participants
 */
export class LoadTester {
  private config: LoadTestConfig | null = null;
  private participants: Map<number, SimulatedParticipant> = new Map();
  private status: LoadTestStatus = 'idle';
  private callbacks: LoadTestCallbacks = {};
  private statsInterval: NodeJS.Timeout | null = null;
  private startTime: number | null = null;
  private socketServerUrl: string;
  private _currentQuestionId: string | null = null;
  private _currentQuestionOptions: Array<{ optionId: string }> | null = null;
  private isStopRequested: boolean = false;
  /** Latency history for charting - stores last N entries */
  private latencyHistory: LatencyHistoryEntry[] = [];
  /** Drift history for charting - stores last N entries */
  private driftHistory: TimerDriftEntry[] = [];
  /** Maximum number of latency history entries to keep */
  private static readonly MAX_LATENCY_HISTORY = 100;
  /** Maximum number of drift history entries to keep */
  private static readonly MAX_DRIFT_HISTORY = 200;
  /** Acceptable drift threshold in ms */
  private static readonly DRIFT_THRESHOLD_MS = 50;
  /** WebSocket event logger for debugging */
  private logger: WebSocketLogger | null = null;
  /** Whether event logging is enabled */
  private loggingEnabled: boolean = false;

  constructor(socketServerUrl?: string) {
    this.socketServerUrl = socketServerUrl || process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
  }

  /**
   * Enable WebSocket event logging
   * @param logger - Optional custom logger instance (uses singleton if not provided)
   */
  enableLogging(logger?: WebSocketLogger): void {
    this.logger = logger ?? websocketLogger;
    this.loggingEnabled = true;
  }

  /**
   * Disable WebSocket event logging
   */
  disableLogging(): void {
    this.loggingEnabled = false;
  }

  /**
   * Check if logging is enabled
   */
  isLoggingEnabled(): boolean {
    return this.loggingEnabled;
  }

  /**
   * Get the logger instance
   */
  getLogger(): WebSocketLogger | null {
    return this.logger;
  }

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: LoadTestCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Get current status
   */
  getStatus(): LoadTestStatus {
    return this.status;
  }

  /**
   * Get current question ID being answered
   */
  getCurrentQuestionId(): string | null {
    return this._currentQuestionId;
  }

  /**
   * Get current question options
   */
  getCurrentQuestionOptions(): Array<{ optionId: string }> | null {
    return this._currentQuestionOptions;
  }

  /**
   * Get all participants
   */
  getParticipants(): SimulatedParticipant[] {
    return Array.from(this.participants.values());
  }

  /**
   * Get current statistics
   */
  getStats(): LoadTestStats {
    const participants = Array.from(this.participants.values());
    const latencies = participants
      .map(p => p.lastLatencyMs)
      .filter((l): l is number => l !== null);

    // Sort latencies for percentile calculation
    const sortedLatencies = [...latencies].sort((a, b) => a - b);

    // Calculate drift statistics
    const drifts = participants
      .map(p => p.lastDriftMs)
      .filter((d): d is number => d !== null);
    
    const absoluteDrifts = drifts.map(d => Math.abs(d));
    const sortedAbsoluteDrifts = [...absoluteDrifts].sort((a, b) => a - b);
    
    const withinThresholdCount = absoluteDrifts.filter(d => d < LoadTester.DRIFT_THRESHOLD_MS).length;

    const timerSync: TimerSyncStats = {
      averageDriftMs: drifts.length > 0
        ? Math.round(drifts.reduce((a, b) => a + b, 0) / drifts.length)
        : null,
      minDriftMs: drifts.length > 0 ? Math.min(...drifts) : null,
      maxDriftMs: drifts.length > 0 ? Math.max(...drifts) : null,
      absoluteAverageDriftMs: absoluteDrifts.length > 0
        ? Math.round(absoluteDrifts.reduce((a, b) => a + b, 0) / absoluteDrifts.length)
        : null,
      withinThresholdCount,
      totalWithDriftData: drifts.length,
      withinThresholdPercentage: drifts.length > 0
        ? Math.round((withinThresholdCount / drifts.length) * 100)
        : 0,
      percentiles: {
        p50: calculatePercentile(sortedAbsoluteDrifts, 50),
        p95: calculatePercentile(sortedAbsoluteDrifts, 95),
        p99: calculatePercentile(sortedAbsoluteDrifts, 99),
      },
      driftHistory: [...this.driftHistory],
    };

    const stats: LoadTestStats = {
      totalParticipants: this.config?.participantCount || 0,
      pendingJoins: participants.filter(p => p.status === 'pending' || p.status === 'joining').length,
      successfulJoins: participants.filter(p => p.participantId !== null).length,
      failedJoins: participants.filter(p => p.status === 'error').length,
      connectedCount: participants.filter(p => p.status === 'connected').length,
      disconnectedCount: participants.filter(p => p.status === 'disconnected').length,
      totalAnswersSubmitted: participants.reduce((sum, p) => sum + p.answersSubmitted, 0),
      averageLatencyMs: latencies.length > 0 
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) 
        : null,
      minLatencyMs: latencies.length > 0 ? Math.min(...latencies) : null,
      maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : null,
      startTime: this.startTime,
      elapsedTimeMs: this.startTime ? Date.now() - this.startTime : 0,
      percentiles: {
        p50: calculatePercentile(sortedLatencies, 50),
        p95: calculatePercentile(sortedLatencies, 95),
        p99: calculatePercentile(sortedLatencies, 99),
      },
      latencyHistory: [...this.latencyHistory],
      timerSync,
    };

    return stats;
  }

  /**
   * Start the load test
   */
  async start(config: LoadTestConfig): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') {
      throw new Error('Load test is already running');
    }

    // Validate config
    if (config.participantCount < 1 || config.participantCount > 1000) {
      throw new Error('Participant count must be between 1 and 1000');
    }

    if (!config.joinCode || config.joinCode.length !== 6) {
      throw new Error('Invalid join code');
    }

    this.config = {
      ...config,
      joinDelayMs: config.joinDelayMs ?? 50,
      simulateAnswers: config.simulateAnswers ?? true,
      answerDelayMinMs: config.answerDelayMinMs ?? 500,
      answerDelayMaxMs: config.answerDelayMaxMs ?? 5000,
    };

    this.isStopRequested = false;
    this.participants.clear();
    this.startTime = Date.now();
    this._currentQuestionId = null;
    this._currentQuestionOptions = null;
    this.latencyHistory = []; // Clear latency history on new test
    this.driftHistory = []; // Clear drift history on new test

    this.setStatus('starting');

    // Initialize participants
    for (let i = 0; i < config.participantCount; i++) {
      const participant: SimulatedParticipant = {
        id: i,
        participantId: null,
        sessionId: null,
        nickname: generateRandomNickname(),
        token: null,
        socket: null,
        status: 'pending',
        error: null,
        joinedAt: null,
        answersSubmitted: 0,
        lastLatencyMs: null,
        lastDriftMs: null,
        driftHistory: [],
      };
      this.participants.set(i, participant);
    }

    // Start stats update interval
    this.statsInterval = setInterval(() => {
      this.callbacks.onStatsUpdate?.(this.getStats());
    }, 500);

    this.setStatus('running');

    // Start joining participants
    try {
      await this.joinParticipants();
    } catch (error) {
      this.setStatus('error');
      this.callbacks.onError?.(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Stop the load test
   */
  async stop(): Promise<void> {
    if (this.status !== 'running' && this.status !== 'starting') {
      return;
    }

    this.isStopRequested = true;
    this.setStatus('stopping');

    // Clear stats interval
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    // Disconnect all participants
    for (const participant of this.participants.values()) {
      if (participant.socket) {
        participant.socket.disconnect();
        participant.socket = null;
      }
      if (participant.status === 'connected') {
        participant.status = 'disconnected';
        this.callbacks.onParticipantUpdate?.(participant);
      }
    }

    this.setStatus('stopped');
    this.callbacks.onStatsUpdate?.(this.getStats());
  }

  /**
   * Reset the load tester
   */
  reset(): void {
    this.stop();
    this.participants.clear();
    this.config = null;
    this.startTime = null;
    this._currentQuestionId = null;
    this._currentQuestionOptions = null;
    this.setStatus('idle');
  }

  /**
   * Set status and notify callback
   */
  private setStatus(status: LoadTestStatus): void {
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }

  /**
   * Record a latency measurement in history
   */
  private recordLatency(participantId: number, latencyMs: number): void {
    const entry: LatencyHistoryEntry = {
      timestamp: Date.now(),
      latencyMs,
      participantId,
    };

    this.latencyHistory.push(entry);

    // Keep only the last N entries
    if (this.latencyHistory.length > LoadTester.MAX_LATENCY_HISTORY) {
      this.latencyHistory = this.latencyHistory.slice(-LoadTester.MAX_LATENCY_HISTORY);
    }
  }

  /**
   * Record a timer drift measurement
   */
  private recordDrift(participant: SimulatedParticipant, serverTime: number): void {
    const clientTime = Date.now();
    const driftMs = serverTime - clientTime;

    const entry: TimerDriftEntry = {
      timestamp: clientTime,
      driftMs,
      participantId: participant.id,
      serverTime,
      clientTime,
    };

    // Update participant's drift data
    participant.lastDriftMs = driftMs;
    participant.driftHistory.push(entry);

    // Keep participant's drift history limited
    if (participant.driftHistory.length > 20) {
      participant.driftHistory = participant.driftHistory.slice(-20);
    }

    // Add to global drift history
    this.driftHistory.push(entry);

    // Keep only the last N entries globally
    if (this.driftHistory.length > LoadTester.MAX_DRIFT_HISTORY) {
      this.driftHistory = this.driftHistory.slice(-LoadTester.MAX_DRIFT_HISTORY);
    }

    this.callbacks.onParticipantUpdate?.(participant);
  }

  /**
   * Get latency history
   */
  getLatencyHistory(): LatencyHistoryEntry[] {
    return [...this.latencyHistory];
  }

  /**
   * Clear latency history
   */
  clearLatencyHistory(): void {
    this.latencyHistory = [];
  }

  /**
   * Get drift history
   */
  getDriftHistory(): TimerDriftEntry[] {
    return [...this.driftHistory];
  }

  /**
   * Clear drift history
   */
  clearDriftHistory(): void {
    this.driftHistory = [];
    // Also clear participant drift histories
    for (const participant of this.participants.values()) {
      participant.driftHistory = [];
      participant.lastDriftMs = null;
    }
  }

  /**
   * Join all participants sequentially with delay
   */
  private async joinParticipants(): Promise<void> {
    const joinDelay = this.config?.joinDelayMs || 50;

    for (const participant of this.participants.values()) {
      if (this.isStopRequested) {
        break;
      }

      try {
        await this.joinParticipant(participant);
      } catch (error) {
        participant.status = 'error';
        participant.error = error instanceof Error ? error.message : 'Join failed';
        this.callbacks.onParticipantUpdate?.(participant);
      }

      // Delay between joins to avoid overwhelming the server
      await sleep(joinDelay);
    }
  }

  /**
   * Join a single participant
   */
  private async joinParticipant(participant: SimulatedParticipant): Promise<void> {
    participant.status = 'joining';
    this.callbacks.onParticipantUpdate?.(participant);

    // Call join API
    const response = await post<JoinResponse>('/sessions/join', {
      joinCode: this.config!.joinCode,
      nickname: participant.nickname,
    });

    participant.participantId = response.participantId;
    participant.sessionId = response.sessionId;
    participant.token = response.sessionToken;
    participant.joinedAt = Date.now();

    // Create WebSocket connection
    await this.connectParticipant(participant);
  }

  /**
   * Connect participant via WebSocket
   */
  private async connectParticipant(participant: SimulatedParticipant): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = io(this.socketServerUrl, {
        autoConnect: true,
        reconnection: false,
        transports: ['websocket'] as string[],
        auth: {
          token: participant.token,
          sessionId: participant.sessionId,
          role: 'participant',
        },
      } as Parameters<typeof io>[1]);

      participant.socket = socket;

      // Connection timeout
      const timeout = setTimeout(() => {
        socket.disconnect();
        if (this.loggingEnabled && this.logger) {
          this.logger.logError('Connection timeout', { participantId: participant.id }, socket.id, participant.id);
        }
        reject(new Error('Connection timeout'));
      }, 10000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        participant.status = 'connected';
        if (this.loggingEnabled && this.logger) {
          this.logger.logConnect(socket.id, participant.id);
        }
        this.callbacks.onParticipantUpdate?.(participant);
        resolve();
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        participant.status = 'error';
        participant.error = error.message;
        if (this.loggingEnabled && this.logger) {
          this.logger.logError(error.message, { participantId: participant.id }, socket.id, participant.id);
        }
        this.callbacks.onParticipantUpdate?.(participant);
        reject(error);
      });

      socket.on('disconnect', (reason) => {
        if (participant.status === 'connected') {
          participant.status = 'disconnected';
          if (this.loggingEnabled && this.logger) {
            this.logger.logDisconnect(reason, socket.id, participant.id);
          }
          this.callbacks.onParticipantUpdate?.(participant);
        }
      });

      // Handle question started event
      socket.on('question_started', (data: { questionIndex: number; question: { questionId: string; options: Array<{ optionId: string }> }; startTime: number; endTime: number }) => {
        this._currentQuestionId = data.question.questionId;
        this._currentQuestionOptions = data.question.options;
        if (this.loggingEnabled && this.logger) {
          this.logger.logReceive('question_started', data, socket.id, participant.id);
        }
        this.callbacks.onQuestionReceived?.(data.question.questionId, data.questionIndex);

        // Simulate answer submission if enabled
        if (this.config?.simulateAnswers && !this.isStopRequested) {
          this.simulateAnswer(participant, data.question.questionId, data.question.options);
        }
      });

      // Handle timer tick event for sync accuracy measurement
      socket.on('timer_tick', (data: { questionId: string; remainingSeconds: number; serverTime: number }) => {
        // Only log timer ticks occasionally to avoid flooding (every 5 seconds)
        if (this.loggingEnabled && this.logger && data.remainingSeconds % 5 === 0) {
          this.logger.logReceive('timer_tick', data, socket.id, participant.id);
        }
        // Record drift measurement
        this.recordDrift(participant, data.serverTime);
        
        // Notify callback
        this.callbacks.onTimerTick?.(data.remainingSeconds, data.serverTime);
      });

      // Handle answer accepted event for latency tracking
      socket.on('answer_accepted', (data: { responseTimeMs: number }) => {
        if (this.loggingEnabled && this.logger) {
          this.logger.logReceive('answer_accepted', data, socket.id, participant.id);
        }
        participant.lastLatencyMs = data.responseTimeMs;
        participant.answersSubmitted++;
        
        // Record latency in history
        this.recordLatency(participant.id, data.responseTimeMs);
        
        this.callbacks.onParticipantUpdate?.(participant);
      });

      // Handle answer rejected event
      socket.on('answer_rejected', (data: { reason: string; message: string }) => {
        if (this.loggingEnabled && this.logger) {
          this.logger.logReceive('answer_rejected', data, socket.id, participant.id);
        }
      });

      // Handle leaderboard updates
      socket.on('leaderboard_updated', (data: unknown) => {
        if (this.loggingEnabled && this.logger) {
          this.logger.logReceive('leaderboard_updated', data, socket.id, participant.id);
        }
      });

      // Handle score updates
      socket.on('score_updated', (data: unknown) => {
        if (this.loggingEnabled && this.logger) {
          this.logger.logReceive('score_updated', data, socket.id, participant.id);
        }
      });

      // Handle reveal answers
      socket.on('reveal_answers', (data: unknown) => {
        if (this.loggingEnabled && this.logger) {
          this.logger.logReceive('reveal_answers', data, socket.id, participant.id);
        }
      });

      // Handle session recovered
      socket.on('session_recovered', (data: unknown) => {
        if (this.loggingEnabled && this.logger) {
          this.logger.logReceive('session_recovered', data, socket.id, participant.id);
        }
      });

      // Handle errors
      socket.on('error', (data: { message: string }) => {
        if (this.loggingEnabled && this.logger) {
          this.logger.logError(data.message, data, socket.id, participant.id);
        }
        participant.error = data.message;
        this.callbacks.onParticipantUpdate?.(participant);
      });
    });
  }

  /**
   * Simulate answer submission for a participant
   */
  private async simulateAnswer(
    participant: SimulatedParticipant,
    questionId: string,
    options: Array<{ optionId: string }>
  ): Promise<void> {
    if (!participant.socket || participant.status !== 'connected') {
      return;
    }

    // Random delay before answering
    const delay = getRandomDelay(
      this.config?.answerDelayMinMs || 500,
      this.config?.answerDelayMaxMs || 5000
    );

    await sleep(delay);

    if (this.isStopRequested || participant.status !== 'connected') {
      return;
    }

    // Select a random option
    const randomOption = options[Math.floor(Math.random() * options.length)];

    const answerPayload = {
      questionId,
      selectedOptions: [randomOption.optionId],
      clientTimestamp: Date.now(),
    };

    // Log the emitted event
    if (this.loggingEnabled && this.logger) {
      this.logger.logEmit('submit_answer', answerPayload, participant.socket.id, participant.id);
    }

    // Submit answer
    participant.socket.emit('submit_answer', answerPayload);
  }

  /**
   * Simulate a thundering herd scenario where all connected participants
   * submit answers simultaneously.
   * 
   * This tests the server's ability to handle 500+ simultaneous answer submissions.
   * 
   * Requirements: 15.4
   * 
   * @param questionId - The question ID to submit answers for (uses current question if not provided)
   * @param options - The answer options to choose from (uses random option if not provided)
   * @param timeoutMs - Timeout for waiting for responses (default: 10000ms)
   * @returns Statistics about the burst including success rate, response times, and dropped connections
   */
  async thunderingHerd(
    questionId?: string,
    options?: Array<{ optionId: string }>,
    timeoutMs: number = 10000
  ): Promise<ThunderingHerdStats> {
    const targetQuestionId = questionId || this._currentQuestionId;
    
    if (!targetQuestionId) {
      throw new Error('No question ID provided and no current question active');
    }

    // Use provided options, or fall back to stored options from current question
    const targetOptions = options || this._currentQuestionOptions;
    
    if (!targetOptions || targetOptions.length === 0) {
      throw new Error('No answer options available. Make sure a question is active with valid options.');
    }

    // Get all connected participants
    const connectedParticipants = Array.from(this.participants.values())
      .filter(p => p.status === 'connected' && p.socket);

    if (connectedParticipants.length === 0) {
      throw new Error('No connected participants available for thundering herd simulation');
    }

    const burstStartTime = Date.now();
    const participantResults: ThunderingHerdParticipantResult[] = [];
    const responsePromises: Promise<ThunderingHerdParticipantResult>[] = [];

    // Create a promise for each participant's answer submission
    for (const participant of connectedParticipants) {
      const promise = this.submitThunderingHerdAnswer(
        participant,
        targetQuestionId,
        targetOptions,
        timeoutMs
      );
      responsePromises.push(promise);
    }

    // Wait for all submissions to complete (or timeout)
    const results = await Promise.all(responsePromises);
    participantResults.push(...results);

    const burstEndTime = Date.now();

    // Calculate statistics
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    const droppedConnections = results.filter(r => r.droppedConnection).length;

    const responseTimes = successfulResults
      .map(r => r.responseTimeMs)
      .filter((t): t is number => t !== null);

    const sortedResponseTimes = [...responseTimes].sort((a, b) => a - b);

    const stats: ThunderingHerdStats = {
      totalSubmissions: results.length,
      successfulSubmissions: successfulResults.length,
      failedSubmissions: failedResults.length,
      droppedConnections,
      successRate: results.length > 0 
        ? Math.round((successfulResults.length / results.length) * 100) 
        : 0,
      avgResponseTimeMs: responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null,
      minResponseTimeMs: responseTimes.length > 0 ? Math.min(...responseTimes) : null,
      maxResponseTimeMs: responseTimes.length > 0 ? Math.max(...responseTimes) : null,
      p50ResponseTimeMs: calculatePercentile(sortedResponseTimes, 50),
      p95ResponseTimeMs: calculatePercentile(sortedResponseTimes, 95),
      p99ResponseTimeMs: calculatePercentile(sortedResponseTimes, 99),
      burstDurationMs: burstEndTime - burstStartTime,
      burstStartTime,
      burstEndTime,
      participantResults,
    };

    return stats;
  }

  /**
   * Submit a single answer for thundering herd simulation with response tracking
   */
  private submitThunderingHerdAnswer(
    participant: SimulatedParticipant,
    questionId: string,
    options?: Array<{ optionId: string }>,
    timeoutMs: number = 10000
  ): Promise<ThunderingHerdParticipantResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let resolved = false;

      // Check if participant is still connected
      if (!participant.socket || participant.status !== 'connected') {
        resolve({
          participantId: participant.id,
          success: false,
          responseTimeMs: null,
          error: 'Participant not connected',
          droppedConnection: true,
        });
        return;
      }

      const socket = participant.socket;

      // Set up timeout
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            participantId: participant.id,
            success: false,
            responseTimeMs: null,
            error: 'Response timeout',
            droppedConnection: participant.status !== 'connected',
          });
        }
      }, timeoutMs);

      // Handler for successful answer
      const onAnswerAccepted = (data: { responseTimeMs: number }) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          const responseTime = Date.now() - startTime;
          resolve({
            participantId: participant.id,
            success: true,
            responseTimeMs: data.responseTimeMs || responseTime,
            error: null,
            droppedConnection: false,
          });
        }
      };

      // Handler for rejected answer
      const onAnswerRejected = (data: { reason: string; message: string }) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            participantId: participant.id,
            success: false,
            responseTimeMs: null,
            error: data.message || data.reason,
            droppedConnection: false,
          });
        }
      };

      // Handler for disconnect
      const onDisconnect = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            participantId: participant.id,
            success: false,
            responseTimeMs: null,
            error: 'Connection dropped during submission',
            droppedConnection: true,
          });
        }
      };

      // Handler for errors
      const onError = (data: { message: string }) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            participantId: participant.id,
            success: false,
            responseTimeMs: null,
            error: data.message,
            droppedConnection: false,
          });
        }
      };

      // Cleanup function to remove listeners
      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('answer_accepted', onAnswerAccepted);
        socket.off('answer_rejected', onAnswerRejected);
        socket.off('disconnect', onDisconnect);
        socket.off('error', onError);
      };

      // Set up listeners
      socket.on('answer_accepted', onAnswerAccepted);
      socket.on('answer_rejected', onAnswerRejected);
      socket.on('disconnect', onDisconnect);
      socket.on('error', onError);

      // Generate a random option if not provided
      let selectedOptionId: string;
      if (options && options.length > 0) {
        const randomOption = options[Math.floor(Math.random() * options.length)];
        selectedOptionId = randomOption.optionId;
      } else {
        // Generate a random UUID-like option ID as fallback
        selectedOptionId = `opt-${Math.random().toString(36).substring(2, 11)}`;
      }

      // Submit the answer immediately (no delay - this is the thundering herd!)
      socket.emit('submit_answer', {
        questionId,
        selectedOptions: [selectedOptionId],
        clientTimestamp: Date.now(),
      });
    });
  }

  /**
   * Simulate disconnections for a specified number of participants.
   * Optionally attempts reconnection after a configurable delay.
   * 
   * This tests the server's session recovery and reconnection handling.
   * 
   * Requirements: 15.6
   * 
   * @param count - Number of participants to disconnect (will be capped to connected count)
   * @param reconnect - Whether to attempt reconnection after disconnection
   * @param reconnectDelayMs - Delay before attempting reconnection (default: 1000ms)
   * @param timeoutMs - Timeout for reconnection attempts (default: 10000ms)
   * @returns Statistics about the disconnection/reconnection simulation
   */
  async simulateDisconnections(
    count: number,
    reconnect: boolean = true,
    reconnectDelayMs: number = 1000,
    timeoutMs: number = 10000
  ): Promise<DisconnectionSimulationStats> {
    // Get all connected participants
    const connectedParticipants = Array.from(this.participants.values())
      .filter(p => p.status === 'connected' && p.socket);

    if (connectedParticipants.length === 0) {
      throw new Error('No connected participants available for disconnection simulation');
    }

    // Cap count to available participants
    const actualCount = Math.min(count, connectedParticipants.length);
    
    // Randomly select participants to disconnect
    const shuffled = [...connectedParticipants].sort(() => Math.random() - 0.5);
    const selectedParticipants = shuffled.slice(0, actualCount);

    const startTime = Date.now();
    const results: DisconnectionResult[] = [];

    // Disconnect all selected participants
    for (const participant of selectedParticipants) {
      const result: DisconnectionResult = {
        participantId: participant.id,
        nickname: participant.nickname,
        disconnectedAt: Date.now(),
        reconnectedAt: null,
        reconnectionTimeMs: null,
        reconnectionSuccess: false,
        error: null,
      };

      // Store original data for reconnection
      const originalData = {
        participantId: participant.participantId,
        sessionId: participant.sessionId,
        token: participant.token,
      };

      // Disconnect the socket
      if (participant.socket) {
        participant.socket.disconnect();
        participant.socket = null;
      }
      participant.status = 'disconnected';
      this.callbacks.onParticipantUpdate?.(participant);

      results.push(result);

      // If reconnection is requested, attempt it after delay
      if (reconnect && originalData.participantId && originalData.sessionId && originalData.token) {
        // Schedule reconnection
        setTimeout(async () => {
          try {
            const reconnectStartTime = Date.now();
            await this.reconnectParticipant(participant, originalData, timeoutMs);
            
            result.reconnectedAt = Date.now();
            result.reconnectionTimeMs = result.reconnectedAt - reconnectStartTime;
            result.reconnectionSuccess = participant.status === 'connected';
          } catch (error) {
            result.error = error instanceof Error ? error.message : 'Reconnection failed';
            result.reconnectionSuccess = false;
          }
        }, reconnectDelayMs);
      }
    }

    // If reconnecting, wait for all reconnections to complete
    if (reconnect) {
      await sleep(reconnectDelayMs + timeoutMs + 500);
    }

    const endTime = Date.now();

    // Calculate statistics
    const successfulReconnections = results.filter(r => r.reconnectionSuccess).length;
    const failedReconnections = reconnect ? results.filter(r => !r.reconnectionSuccess).length : 0;
    const reconnectionTimes = results
      .map(r => r.reconnectionTimeMs)
      .filter((t): t is number => t !== null);

    const sortedReconnectionTimes = [...reconnectionTimes].sort((a, b) => a - b);

    const stats: DisconnectionSimulationStats = {
      totalDisconnections: actualCount,
      successfulReconnections,
      failedReconnections,
      reconnectionAttempted: reconnect,
      recoverySuccessRate: reconnect && actualCount > 0
        ? Math.round((successfulReconnections / actualCount) * 100)
        : 0,
      avgReconnectionTimeMs: reconnectionTimes.length > 0
        ? Math.round(reconnectionTimes.reduce((a, b) => a + b, 0) / reconnectionTimes.length)
        : null,
      minReconnectionTimeMs: reconnectionTimes.length > 0 ? Math.min(...reconnectionTimes) : null,
      maxReconnectionTimeMs: reconnectionTimes.length > 0 ? Math.max(...reconnectionTimes) : null,
      p50ReconnectionTimeMs: calculatePercentile(sortedReconnectionTimes, 50),
      p95ReconnectionTimeMs: calculatePercentile(sortedReconnectionTimes, 95),
      p99ReconnectionTimeMs: calculatePercentile(sortedReconnectionTimes, 99),
      simulationDurationMs: endTime - startTime,
      startTime,
      endTime,
      results,
    };

    return stats;
  }

  /**
   * Reconnect a previously disconnected participant
   */
  private async reconnectParticipant(
    participant: SimulatedParticipant,
    originalData: { participantId: string | null; sessionId: string | null; token: string | null },
    timeoutMs: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = io(this.socketServerUrl, {
        autoConnect: true,
        reconnection: false,
        transports: ['websocket'] as string[],
        auth: {
          token: originalData.token,
          sessionId: originalData.sessionId,
          role: 'participant',
        },
      } as Parameters<typeof io>[1]);

      participant.socket = socket;

      // Connection timeout
      const timeout = setTimeout(() => {
        socket.disconnect();
        participant.status = 'error';
        participant.error = 'Reconnection timeout';
        this.callbacks.onParticipantUpdate?.(participant);
        reject(new Error('Reconnection timeout'));
      }, timeoutMs);

      socket.on('connect', () => {
        clearTimeout(timeout);
        
        // Emit reconnect_session event to restore state
        socket.emit('reconnect_session', {
          sessionId: originalData.sessionId,
          participantId: originalData.participantId,
        });
      });

      socket.on('session_recovered', () => {
        participant.status = 'connected';
        participant.error = null;
        this.callbacks.onParticipantUpdate?.(participant);
        resolve();
      });

      socket.on('recovery_failed', (data: { reason: string; message: string }) => {
        clearTimeout(timeout);
        participant.status = 'error';
        participant.error = data.message || data.reason;
        this.callbacks.onParticipantUpdate?.(participant);
        reject(new Error(data.message || data.reason));
      });

      socket.on('authenticated', () => {
        // If we get authenticated without explicit session_recovered,
        // consider it a successful reconnection
        participant.status = 'connected';
        participant.error = null;
        this.callbacks.onParticipantUpdate?.(participant);
        resolve();
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        participant.status = 'error';
        participant.error = error.message;
        this.callbacks.onParticipantUpdate?.(participant);
        reject(error);
      });

      socket.on('disconnect', () => {
        if (participant.status === 'connected') {
          participant.status = 'disconnected';
          this.callbacks.onParticipantUpdate?.(participant);
        }
      });

      // Re-attach event handlers for normal operation
      socket.on('question_started', (data: { questionIndex: number; question: { questionId: string; options: Array<{ optionId: string }> }; startTime: number; endTime: number }) => {
        this._currentQuestionId = data.question.questionId;
        this._currentQuestionOptions = data.question.options;
        this.callbacks.onQuestionReceived?.(data.question.questionId, data.questionIndex);

        if (this.config?.simulateAnswers && !this.isStopRequested) {
          this.simulateAnswer(participant, data.question.questionId, data.question.options);
        }
      });

      socket.on('timer_tick', (data: { questionId: string; remainingSeconds: number; serverTime: number }) => {
        this.recordDrift(participant, data.serverTime);
        this.callbacks.onTimerTick?.(data.remainingSeconds, data.serverTime);
      });

      socket.on('answer_accepted', (data: { responseTimeMs: number }) => {
        participant.lastLatencyMs = data.responseTimeMs;
        participant.answersSubmitted++;
        this.recordLatency(participant.id, data.responseTimeMs);
        this.callbacks.onParticipantUpdate?.(participant);
      });

      socket.on('error', (data: { message: string }) => {
        participant.error = data.message;
        this.callbacks.onParticipantUpdate?.(participant);
      });
    });
  }

  /**
   * Export all performance metrics as JSON
   * 
   * Includes latency, throughput, error rates, timer sync, and connection stats.
   * 
   * Requirements: 15.9
   * 
   * @returns JSON string with all performance metrics
   */
  exportMetricsAsJSON(): string {
    const exportData = this.getExportData();
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export performance metrics as CSV
   * 
   * Creates a multi-section CSV with summary, latency, throughput, and error data.
   * 
   * Requirements: 15.9
   * 
   * @returns CSV string with performance metrics
   */
  exportMetricsAsCSV(): string {
    const data = this.getExportData();
    const lines: string[] = [];

    // Section 1: Metadata
    lines.push('# PERFORMANCE EXPORT REPORT');
    lines.push(`# Exported At: ${data.metadata.exportedAt}`);
    lines.push(`# Test Status: ${data.metadata.testStatus}`);
    lines.push('');

    // Section 2: Summary Statistics
    lines.push('## SUMMARY STATISTICS');
    lines.push('Metric,Value');
    lines.push(`Total Participants,${data.summary.totalParticipants}`);
    lines.push(`Successful Joins,${data.summary.successfulJoins}`);
    lines.push(`Failed Joins,${data.summary.failedJoins}`);
    lines.push(`Connected Count,${data.summary.connectedCount}`);
    lines.push(`Disconnected Count,${data.summary.disconnectedCount}`);
    lines.push(`Total Answers Submitted,${data.summary.totalAnswersSubmitted}`);
    lines.push(`Test Duration (ms),${data.metadata.testDurationMs}`);
    lines.push('');

    // Section 3: Latency Metrics
    lines.push('## LATENCY METRICS');
    lines.push('Metric,Value (ms)');
    lines.push(`Average,${data.latency.averageMs ?? 'N/A'}`);
    lines.push(`Minimum,${data.latency.minMs ?? 'N/A'}`);
    lines.push(`Maximum,${data.latency.maxMs ?? 'N/A'}`);
    lines.push(`P50 (Median),${data.latency.p50Ms ?? 'N/A'}`);
    lines.push(`P95,${data.latency.p95Ms ?? 'N/A'}`);
    lines.push(`P99,${data.latency.p99Ms ?? 'N/A'}`);
    lines.push(`Sample Count,${data.latency.sampleCount}`);
    lines.push('');

    // Section 4: Throughput Metrics
    lines.push('## THROUGHPUT METRICS');
    lines.push('Metric,Value');
    lines.push(`Answers Per Second,${data.throughput.answersPerSecond?.toFixed(2) ?? 'N/A'}`);
    lines.push(`Joins Per Second,${data.throughput.joinsPerSecond?.toFixed(2) ?? 'N/A'}`);
    lines.push('');

    // Section 5: Error Rates
    lines.push('## ERROR RATES');
    lines.push('Metric,Value');
    lines.push(`Join Failure Rate (%),${(data.errorRates.joinFailureRate * 100).toFixed(2)}`);
    lines.push(`Disconnection Rate (%),${(data.errorRates.disconnectionRate * 100).toFixed(2)}`);
    lines.push(`Total Errors,${data.errorRates.totalErrors}`);
    lines.push('');

    // Section 6: Timer Sync Metrics
    lines.push('## TIMER SYNC METRICS');
    lines.push('Metric,Value (ms)');
    lines.push(`Average Drift,${data.timerSync.averageDriftMs ?? 'N/A'}`);
    lines.push(`Absolute Average Drift,${data.timerSync.absoluteAverageDriftMs ?? 'N/A'}`);
    lines.push(`Minimum Drift,${data.timerSync.minDriftMs ?? 'N/A'}`);
    lines.push(`Maximum Drift,${data.timerSync.maxDriftMs ?? 'N/A'}`);
    lines.push(`Within Threshold (%),${data.timerSync.withinThresholdPercentage}`);
    lines.push(`P50 Drift,${data.timerSync.p50DriftMs ?? 'N/A'}`);
    lines.push(`P95 Drift,${data.timerSync.p95DriftMs ?? 'N/A'}`);
    lines.push(`P99 Drift,${data.timerSync.p99DriftMs ?? 'N/A'}`);
    lines.push('');

    // Section 7: Latency History
    if (data.latencyHistory.length > 0) {
      lines.push('## LATENCY HISTORY');
      lines.push('Timestamp,Participant ID,Latency (ms)');
      for (const entry of data.latencyHistory) {
        lines.push(`${formatTimestampForExport(entry.timestamp)},${entry.participantId},${entry.latencyMs}`);
      }
      lines.push('');
    }

    // Section 8: Drift History
    if (data.driftHistory.length > 0) {
      lines.push('## DRIFT HISTORY');
      lines.push('Timestamp,Participant ID,Drift (ms),Server Time,Client Time');
      for (const entry of data.driftHistory) {
        lines.push(`${formatTimestampForExport(entry.timestamp)},${entry.participantId},${entry.driftMs},${entry.serverTime},${entry.clientTime}`);
      }
      lines.push('');
    }

    // Section 9: Participant Details
    lines.push('## PARTICIPANT DETAILS');
    lines.push('ID,Nickname,Status,Answers Submitted,Last Latency (ms),Last Drift (ms),Error');
    for (const p of data.participants) {
      lines.push([
        p.id.toString(),
        escapeCSVField(p.nickname),
        p.status,
        p.answersSubmitted.toString(),
        p.lastLatencyMs?.toString() ?? 'N/A',
        p.lastDriftMs?.toString() ?? 'N/A',
        escapeCSVField(p.error ?? ''),
      ].join(','));
    }

    return lines.join('\n');
  }

  /**
   * Get structured export data
   * 
   * @returns PerformanceExportData object with all metrics
   */
  getExportData(): PerformanceExportData {
    const stats = this.getStats();
    const participants = this.getParticipants();
    const elapsedSeconds = stats.elapsedTimeMs / 1000;

    // Calculate throughput
    const answersPerSecond = elapsedSeconds > 0 && stats.totalAnswersSubmitted > 0
      ? stats.totalAnswersSubmitted / elapsedSeconds
      : null;
    
    const joinsPerSecond = elapsedSeconds > 0 && stats.successfulJoins > 0
      ? stats.successfulJoins / elapsedSeconds
      : null;

    // Calculate error rates
    const totalAttempted = stats.totalParticipants;
    const joinFailureRate = totalAttempted > 0
      ? stats.failedJoins / totalAttempted
      : 0;
    
    const successfulConnections = stats.successfulJoins;
    const disconnectionRate = successfulConnections > 0
      ? stats.disconnectedCount / successfulConnections
      : 0;

    const totalErrors = stats.failedJoins + participants.filter(p => p.error !== null).length;

    return {
      metadata: {
        exportedAt: new Date().toISOString(),
        testDurationMs: stats.elapsedTimeMs,
        testStartTime: stats.startTime ? new Date(stats.startTime).toISOString() : null,
        testEndTime: stats.startTime ? new Date(stats.startTime + stats.elapsedTimeMs).toISOString() : null,
        testStatus: this.status,
        config: this.config,
      },
      summary: {
        totalParticipants: stats.totalParticipants,
        successfulJoins: stats.successfulJoins,
        failedJoins: stats.failedJoins,
        connectedCount: stats.connectedCount,
        disconnectedCount: stats.disconnectedCount,
        totalAnswersSubmitted: stats.totalAnswersSubmitted,
      },
      latency: {
        averageMs: stats.averageLatencyMs,
        minMs: stats.minLatencyMs,
        maxMs: stats.maxLatencyMs,
        p50Ms: stats.percentiles.p50,
        p95Ms: stats.percentiles.p95,
        p99Ms: stats.percentiles.p99,
        sampleCount: stats.totalAnswersSubmitted,
      },
      throughput: {
        answersPerSecond,
        joinsPerSecond,
      },
      errorRates: {
        joinFailureRate,
        disconnectionRate,
        totalErrors,
      },
      timerSync: {
        averageDriftMs: stats.timerSync.averageDriftMs,
        absoluteAverageDriftMs: stats.timerSync.absoluteAverageDriftMs,
        minDriftMs: stats.timerSync.minDriftMs,
        maxDriftMs: stats.timerSync.maxDriftMs,
        withinThresholdPercentage: stats.timerSync.withinThresholdPercentage,
        p50DriftMs: stats.timerSync.percentiles.p50,
        p95DriftMs: stats.timerSync.percentiles.p95,
        p99DriftMs: stats.timerSync.percentiles.p99,
      },
      connections: {
        totalAttempted: stats.totalParticipants,
        successful: stats.successfulJoins,
        failed: stats.failedJoins,
        currentlyConnected: stats.connectedCount,
        currentlyDisconnected: stats.disconnectedCount,
      },
      latencyHistory: stats.latencyHistory,
      driftHistory: stats.timerSync.driftHistory,
      participants: participants.map(p => ({
        id: p.id,
        nickname: p.nickname,
        status: p.status,
        answersSubmitted: p.answersSubmitted,
        lastLatencyMs: p.lastLatencyMs,
        lastDriftMs: p.lastDriftMs,
        error: p.error,
      })),
    };
  }
}

/**
 * Result of a single disconnection/reconnection attempt
 */
export interface DisconnectionResult {
  participantId: number;
  nickname: string;
  disconnectedAt: number;
  reconnectedAt: number | null;
  reconnectionTimeMs: number | null;
  reconnectionSuccess: boolean;
  error: string | null;
}

/**
 * Statistics from a disconnection simulation
 */
export interface DisconnectionSimulationStats {
  /** Total number of disconnections triggered */
  totalDisconnections: number;
  /** Number of successful reconnections */
  successfulReconnections: number;
  /** Number of failed reconnections */
  failedReconnections: number;
  /** Whether reconnection was attempted */
  reconnectionAttempted: boolean;
  /** Recovery success rate as percentage */
  recoverySuccessRate: number;
  /** Average reconnection time in ms */
  avgReconnectionTimeMs: number | null;
  /** Minimum reconnection time in ms */
  minReconnectionTimeMs: number | null;
  /** Maximum reconnection time in ms */
  maxReconnectionTimeMs: number | null;
  /** P50 reconnection time */
  p50ReconnectionTimeMs: number | null;
  /** P95 reconnection time */
  p95ReconnectionTimeMs: number | null;
  /** P99 reconnection time */
  p99ReconnectionTimeMs: number | null;
  /** Total simulation duration in ms */
  simulationDurationMs: number;
  /** Timestamp when simulation started */
  startTime: number;
  /** Timestamp when simulation completed */
  endTime: number;
  /** Individual participant results */
  results: DisconnectionResult[];
}

/**
 * Performance metrics export data structure
 */
export interface PerformanceExportData {
  /** Export metadata */
  metadata: {
    exportedAt: string;
    testDurationMs: number;
    testStartTime: string | null;
    testEndTime: string | null;
    testStatus: LoadTestStatus;
    config: LoadTestConfig | null;
  };
  /** Summary statistics */
  summary: {
    totalParticipants: number;
    successfulJoins: number;
    failedJoins: number;
    connectedCount: number;
    disconnectedCount: number;
    totalAnswersSubmitted: number;
  };
  /** Latency metrics */
  latency: {
    averageMs: number | null;
    minMs: number | null;
    maxMs: number | null;
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
    sampleCount: number;
  };
  /** Throughput metrics */
  throughput: {
    answersPerSecond: number | null;
    joinsPerSecond: number | null;
  };
  /** Error rates */
  errorRates: {
    joinFailureRate: number;
    disconnectionRate: number;
    totalErrors: number;
  };
  /** Timer sync metrics */
  timerSync: {
    averageDriftMs: number | null;
    absoluteAverageDriftMs: number | null;
    minDriftMs: number | null;
    maxDriftMs: number | null;
    withinThresholdPercentage: number;
    p50DriftMs: number | null;
    p95DriftMs: number | null;
    p99DriftMs: number | null;
  };
  /** Connection statistics */
  connections: {
    totalAttempted: number;
    successful: number;
    failed: number;
    currentlyConnected: number;
    currentlyDisconnected: number;
  };
  /** Latency history for detailed analysis */
  latencyHistory: LatencyHistoryEntry[];
  /** Drift history for detailed analysis */
  driftHistory: TimerDriftEntry[];
  /** Per-participant data */
  participants: Array<{
    id: number;
    nickname: string;
    status: string;
    answersSubmitted: number;
    lastLatencyMs: number | null;
    lastDriftMs: number | null;
    error: string | null;
  }>;
}

/**
 * Format timestamp for CSV export
 */
function formatTimestampForExport(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Escape CSV field value
 */
function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Export singleton instance for convenience
export const loadTester = new LoadTester();

export default LoadTester;
