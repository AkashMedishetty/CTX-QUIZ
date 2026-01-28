/**
 * ReconnectionManager - Client-side session recovery and reconnection handling
 * 
 * Handles participant session recovery after disconnection:
 * - Implements exponential backoff (1s, 2s, 4s, 8s, max 30s)
 * - Stores session token in localStorage
 * - Emits reconnect_session event on reconnection
 * - Handles session_recovered and recovery_failed events
 * - Displays connection status indicators
 * 
 * Requirements: 8.2, 8.6, 14.8, 17.1
 */

import { io, Socket } from 'socket.io-client';

/**
 * Connection status types
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'failed';

/**
 * Session data stored in localStorage
 */
export interface StoredSessionData {
  sessionId: string;
  participantId: string;
  sessionToken: string;
  nickname: string;
  timestamp: number;
}

/**
 * Session recovery data received from server
 */
export interface SessionRecoveryData {
  participantId: string;
  currentState: 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED';
  currentQuestion: QuestionForRecovery | null;
  remainingTime: number | null;
  totalScore: number;
  rank: number | null;
  leaderboard: LeaderboardEntry[];
  streakCount: number;
  isEliminated: boolean;
  isSpectator: boolean;
}

/**
 * Question data for recovery (without correct answer flags)
 */
export interface QuestionForRecovery {
  questionId: string;
  questionText: string;
  questionType: string;
  questionImageUrl?: string;
  options: Array<{
    optionId: string;
    optionText: string;
    optionImageUrl?: string;
  }>;
  timeLimit: number;
  shuffleOptions: boolean;
}

/**
 * Leaderboard entry
 */
export interface LeaderboardEntry {
  rank: number;
  participantId: string;
  nickname: string;
  totalScore: number;
  streakCount?: number;
  totalTimeMs?: number;
}

/**
 * Recovery failure data from server
 */
export interface RecoveryFailureData {
  reason: 'SESSION_NOT_FOUND' | 'SESSION_ENDED' | 'PARTICIPANT_NOT_FOUND' | 'PARTICIPANT_BANNED' | 'SESSION_EXPIRED' | 'INVALID_REQUEST' | 'INTERNAL_ERROR';
  message: string;
}

/**
 * Event listener callback types
 */
export type ConnectionStatusListener = (status: ConnectionStatus, attempt?: number) => void;
export type SessionRecoveredListener = (data: SessionRecoveryData) => void;
export type RecoveryFailedListener = (data: RecoveryFailureData) => void;
export type AuthenticatedListener = (data: any) => void;
export type ErrorListener = (error: { code: string; message: string }) => void;

/**
 * ReconnectionManager configuration options
 */
export interface ReconnectionManagerOptions {
  /** WebSocket server URL */
  serverUrl: string;
  /** Initial reconnection delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum reconnection delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Maximum number of reconnection attempts (default: 10) */
  maxAttempts?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** localStorage key for session data (default: 'quiz_session') */
  storageKey?: string;
}

/**
 * Default configuration values
 */
const DEFAULT_OPTIONS: Required<Omit<ReconnectionManagerOptions, 'serverUrl'>> = {
  initialDelay: 1000,
  maxDelay: 30000,
  maxAttempts: 10,
  backoffMultiplier: 2,
  storageKey: 'quiz_session',
};

/**
 * ReconnectionManager class
 * 
 * Manages WebSocket connections with automatic reconnection and session recovery.
 * Implements exponential backoff for reconnection attempts.
 * 
 * Requirements: 8.2, 8.6, 14.8, 17.1
 */
export class ReconnectionManager {
  private socket: Socket | null = null;
  private options: Required<ReconnectionManagerOptions>;
  
  // Connection state
  private _connectionStatus: ConnectionStatus = 'disconnected';
  private reconnectAttempts: number = 0;
  private currentDelay: number;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  
  // Session data
  private sessionId: string | null = null;
  private participantId: string | null = null;
  private sessionToken: string | null = null;
  private nickname: string | null = null;
  private lastKnownQuestionId: string | null = null;
  
  // Event listeners
  private connectionStatusListeners: Set<ConnectionStatusListener> = new Set();
  private sessionRecoveredListeners: Set<SessionRecoveredListener> = new Set();
  private recoveryFailedListeners: Set<RecoveryFailedListener> = new Set();
  private authenticatedListeners: Set<AuthenticatedListener> = new Set();
  private errorListeners: Set<ErrorListener> = new Set();

  /**
   * Create a new ReconnectionManager instance
   * 
   * @param options - Configuration options
   */
  constructor(options: ReconnectionManagerOptions) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.currentDelay = this.options.initialDelay;
    
    // Try to restore session from localStorage
    this.restoreSessionFromStorage();
  }

  /**
   * Get current connection status
   */
  get connectionStatus(): ConnectionStatus {
    return this._connectionStatus;
  }

  /**
   * Check if currently connected
   */
  get isConnected(): boolean {
    return this._connectionStatus === 'connected';
  }

  /**
   * Check if currently reconnecting
   */
  get isReconnecting(): boolean {
    return this._connectionStatus === 'reconnecting';
  }

  /**
   * Get current reconnection attempt number
   */
  get currentAttempt(): number {
    return this.reconnectAttempts;
  }

  /**
   * Get the underlying Socket.IO socket instance
   */
  get socketInstance(): Socket | null {
    return this.socket;
  }

  /**
   * Initialize session data for a new connection
   * 
   * @param sessionId - Quiz session ID
   * @param participantId - Participant ID
   * @param sessionToken - JWT session token
   * @param nickname - Participant nickname
   */
  setSessionData(
    sessionId: string,
    participantId: string,
    sessionToken: string,
    nickname: string
  ): void {
    this.sessionId = sessionId;
    this.participantId = participantId;
    this.sessionToken = sessionToken;
    this.nickname = nickname;
    
    // Save to localStorage for recovery after page refresh
    this.saveSessionToStorage();
    
    console.log('[ReconnectionManager] Session data set:', {
      sessionId,
      participantId,
      nickname,
    });
  }

  /**
   * Update the last known question ID for recovery
   * 
   * @param questionId - Current question ID
   */
  setLastKnownQuestionId(questionId: string): void {
    this.lastKnownQuestionId = questionId;
    
    // Update localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(`${this.options.storageKey}_last_question`, questionId);
    }
  }

  /**
   * Connect to the WebSocket server
   * 
   * Establishes a new connection or reconnects if already connected.
   * 
   * Requirements: 8.2, 17.1
   */
  connect(): void {
    // Don't connect if no session data
    if (!this.sessionId || !this.participantId || !this.sessionToken) {
      console.warn('[ReconnectionManager] Cannot connect without session data');
      return;
    }

    // Disconnect existing socket if any
    if (this.socket) {
      this.socket.disconnect();
    }

    console.log('[ReconnectionManager] Connecting to server:', {
      serverUrl: this.options.serverUrl,
      sessionId: this.sessionId,
      participantId: this.participantId,
    });

    // Create new socket connection
    this.socket = io(this.options.serverUrl, {
      auth: {
        token: this.sessionToken,
        role: 'participant',
      },
      // Disable Socket.IO's built-in reconnection - we handle it ourselves
      reconnection: false,
      // Prefer WebSocket over polling
      transports: ['websocket', 'polling'],
      // Connection timeout
      timeout: 20000,
    });

    this.setupEventHandlers();
  }

  /**
   * Disconnect from the WebSocket server
   * 
   * Cleans up the connection and stops any pending reconnection attempts.
   */
  disconnect(): void {
    console.log('[ReconnectionManager] Disconnecting');

    // Clear any pending reconnection timeout
    this.clearReconnectTimeout();

    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Update status
    this.setConnectionStatus('disconnected');
    
    // Reset reconnection state
    this.reconnectAttempts = 0;
    this.currentDelay = this.options.initialDelay;
  }

  /**
   * Manually trigger a reconnection attempt
   * 
   * Useful when the user wants to retry after a failed connection.
   */
  attemptReconnect(): void {
    console.log('[ReconnectionManager] Manual reconnection attempt');
    
    // Reset reconnection state
    this.reconnectAttempts = 0;
    this.currentDelay = this.options.initialDelay;
    
    // Start reconnection
    this.scheduleReconnect();
  }

  /**
   * Clear stored session data
   * 
   * Call this when the user explicitly logs out or the session is invalid.
   */
  clearSession(): void {
    console.log('[ReconnectionManager] Clearing session data');

    this.sessionId = null;
    this.participantId = null;
    this.sessionToken = null;
    this.nickname = null;
    this.lastKnownQuestionId = null;

    // Clear localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.options.storageKey);
      localStorage.removeItem(`${this.options.storageKey}_last_question`);
    }
  }

  /**
   * Check if there is a stored session that can be recovered
   */
  hasStoredSession(): boolean {
    return !!(this.sessionId && this.participantId && this.sessionToken);
  }

  /**
   * Get stored session data
   */
  getStoredSession(): StoredSessionData | null {
    if (!this.sessionId || !this.participantId || !this.sessionToken || !this.nickname) {
      return null;
    }

    return {
      sessionId: this.sessionId,
      participantId: this.participantId,
      sessionToken: this.sessionToken,
      nickname: this.nickname,
      timestamp: Date.now(),
    };
  }

  // ==================== Event Listener Methods ====================

  /**
   * Add a connection status change listener
   */
  onConnectionStatusChange(listener: ConnectionStatusListener): () => void {
    this.connectionStatusListeners.add(listener);
    return () => this.connectionStatusListeners.delete(listener);
  }

  /**
   * Add a session recovered listener
   */
  onSessionRecovered(listener: SessionRecoveredListener): () => void {
    this.sessionRecoveredListeners.add(listener);
    return () => this.sessionRecoveredListeners.delete(listener);
  }

  /**
   * Add a recovery failed listener
   */
  onRecoveryFailed(listener: RecoveryFailedListener): () => void {
    this.recoveryFailedListeners.add(listener);
    return () => this.recoveryFailedListeners.delete(listener);
  }

  /**
   * Add an authenticated listener
   */
  onAuthenticated(listener: AuthenticatedListener): () => void {
    this.authenticatedListeners.add(listener);
    return () => this.authenticatedListeners.delete(listener);
  }

  /**
   * Add an error listener
   */
  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  // ==================== Private Methods ====================

  /**
   * Set up Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection established
    this.socket.on('connect', () => {
      console.log('[ReconnectionManager] Connected to server');
      
      // Reset reconnection state on successful connection
      this.reconnectAttempts = 0;
      this.currentDelay = this.options.initialDelay;
      
      this.setConnectionStatus('connected');

      // If this is a reconnection (we have session data), attempt session recovery
      if (this.sessionId && this.participantId) {
        this.emitReconnectSession();
      }
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error('[ReconnectionManager] Connection error:', error.message);
      
      // Schedule reconnection
      this.scheduleReconnect();
    });

    // Disconnection
    this.socket.on('disconnect', (reason) => {
      console.log('[ReconnectionManager] Disconnected:', reason);

      // Handle different disconnection reasons
      if (reason === 'io server disconnect') {
        // Server forcibly disconnected (kicked/banned)
        // Don't attempt reconnection
        this.setConnectionStatus('disconnected');
        console.log('[ReconnectionManager] Server disconnected - not attempting reconnection');
      } else {
        // Client-side disconnect or network issue - attempt reconnection
        this.scheduleReconnect();
      }
    });

    // Authentication success
    this.socket.on('authenticated', (data) => {
      console.log('[ReconnectionManager] Authenticated:', data);
      this.notifyAuthenticatedListeners(data);
    });

    // Authentication error
    this.socket.on('auth_error', (data) => {
      console.error('[ReconnectionManager] Authentication error:', data);
      this.notifyErrorListeners({
        code: 'AUTH_ERROR',
        message: data.error || 'Authentication failed',
      });
    });

    // Session recovered successfully
    this.socket.on('session_recovered', (data: SessionRecoveryData) => {
      console.log('[ReconnectionManager] Session recovered:', data);
      this.notifySessionRecoveredListeners(data);
    });

    // Session recovery failed
    this.socket.on('recovery_failed', (data: RecoveryFailureData) => {
      console.log('[ReconnectionManager] Recovery failed:', data);
      this.notifyRecoveryFailedListeners(data);

      // Handle specific failure reasons
      if (data.reason === 'SESSION_EXPIRED' || data.reason === 'SESSION_ENDED') {
        // Clear stored session - user needs to rejoin
        this.clearSession();
      }
    });

    // Kicked from session
    this.socket.on('kicked', (data) => {
      console.log('[ReconnectionManager] Kicked from session:', data);
      this.clearSession();
      this.notifyErrorListeners({
        code: 'KICKED',
        message: data.message || 'You have been kicked from the session',
      });
    });

    // Banned from session
    this.socket.on('banned', (data) => {
      console.log('[ReconnectionManager] Banned from session:', data);
      this.clearSession();
      this.notifyErrorListeners({
        code: 'BANNED',
        message: data.message || 'You have been banned from the session',
      });
    });

    // Generic error
    this.socket.on('error', (data) => {
      console.error('[ReconnectionManager] Error:', data);
      this.notifyErrorListeners(data);
    });

    // Rate limit exceeded
    this.socket.on('rate_limit_exceeded', (data) => {
      console.warn('[ReconnectionManager] Rate limit exceeded:', data);
      this.notifyErrorListeners({
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Retry after ${data.retryAfter} seconds.`,
      });
    });
  }

  /**
   * Emit reconnect_session event to server
   * 
   * Requirement: 8.2
   */
  private emitReconnectSession(): void {
    if (!this.socket || !this.sessionId || !this.participantId) {
      console.warn('[ReconnectionManager] Cannot emit reconnect_session - missing data');
      return;
    }

    console.log('[ReconnectionManager] Emitting reconnect_session:', {
      sessionId: this.sessionId,
      participantId: this.participantId,
      lastKnownQuestionId: this.lastKnownQuestionId,
    });

    this.socket.emit('reconnect_session', {
      sessionId: this.sessionId,
      participantId: this.participantId,
      lastKnownQuestionId: this.lastKnownQuestionId,
    });
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   * 
   * Implements exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
   * 
   * Requirement: 17.1
   */
  private scheduleReconnect(): void {
    // Check if we've exceeded max attempts
    if (this.reconnectAttempts >= this.options.maxAttempts) {
      console.log('[ReconnectionManager] Max reconnection attempts reached');
      this.setConnectionStatus('failed');
      return;
    }

    // Clear any existing timeout
    this.clearReconnectTimeout();

    // Update status
    this.setConnectionStatus('reconnecting');

    // Calculate delay with exponential backoff
    const delay = Math.min(this.currentDelay, this.options.maxDelay);

    console.log('[ReconnectionManager] Scheduling reconnection:', {
      attempt: this.reconnectAttempts + 1,
      delay,
      maxAttempts: this.options.maxAttempts,
    });

    // Schedule reconnection
    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectAttempts++;
      
      // Update delay for next attempt (exponential backoff)
      this.currentDelay = Math.min(
        this.currentDelay * this.options.backoffMultiplier,
        this.options.maxDelay
      );

      // Attempt to connect
      this.connect();
    }, delay);
  }

  /**
   * Clear pending reconnection timeout
   */
  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  /**
   * Update connection status and notify listeners
   */
  private setConnectionStatus(status: ConnectionStatus): void {
    if (this._connectionStatus !== status) {
      this._connectionStatus = status;
      this.notifyConnectionStatusListeners(status);
    }
  }

  /**
   * Save session data to localStorage
   */
  private saveSessionToStorage(): void {
    if (typeof window === 'undefined') return;
    if (!this.sessionId || !this.participantId || !this.sessionToken || !this.nickname) return;

    const sessionData: StoredSessionData = {
      sessionId: this.sessionId,
      participantId: this.participantId,
      sessionToken: this.sessionToken,
      nickname: this.nickname,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem(this.options.storageKey, JSON.stringify(sessionData));
      console.log('[ReconnectionManager] Session saved to localStorage');
    } catch (error) {
      console.error('[ReconnectionManager] Failed to save session to localStorage:', error);
    }
  }

  /**
   * Restore session data from localStorage
   */
  private restoreSessionFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const storedData = localStorage.getItem(this.options.storageKey);
      if (!storedData) return;

      const sessionData: StoredSessionData = JSON.parse(storedData);

      // Check if session data is not too old (5 minutes = 300000ms)
      const maxAge = 5 * 60 * 1000;
      if (Date.now() - sessionData.timestamp > maxAge) {
        console.log('[ReconnectionManager] Stored session expired, clearing');
        this.clearSession();
        return;
      }

      this.sessionId = sessionData.sessionId;
      this.participantId = sessionData.participantId;
      this.sessionToken = sessionData.sessionToken;
      this.nickname = sessionData.nickname;

      // Restore last known question ID
      const lastQuestionId = localStorage.getItem(`${this.options.storageKey}_last_question`);
      if (lastQuestionId) {
        this.lastKnownQuestionId = lastQuestionId;
      }

      console.log('[ReconnectionManager] Session restored from localStorage:', {
        sessionId: this.sessionId,
        participantId: this.participantId,
        nickname: this.nickname,
      });
    } catch (error) {
      console.error('[ReconnectionManager] Failed to restore session from localStorage:', error);
      this.clearSession();
    }
  }

  // ==================== Notification Methods ====================

  private notifyConnectionStatusListeners(status: ConnectionStatus): void {
    this.connectionStatusListeners.forEach((listener) => {
      try {
        listener(status, this.reconnectAttempts);
      } catch (error) {
        console.error('[ReconnectionManager] Error in connection status listener:', error);
      }
    });
  }

  private notifySessionRecoveredListeners(data: SessionRecoveryData): void {
    this.sessionRecoveredListeners.forEach((listener) => {
      try {
        listener(data);
      } catch (error) {
        console.error('[ReconnectionManager] Error in session recovered listener:', error);
      }
    });
  }

  private notifyRecoveryFailedListeners(data: RecoveryFailureData): void {
    this.recoveryFailedListeners.forEach((listener) => {
      try {
        listener(data);
      } catch (error) {
        console.error('[ReconnectionManager] Error in recovery failed listener:', error);
      }
    });
  }

  private notifyAuthenticatedListeners(data: any): void {
    this.authenticatedListeners.forEach((listener) => {
      try {
        listener(data);
      } catch (error) {
        console.error('[ReconnectionManager] Error in authenticated listener:', error);
      }
    });
  }

  private notifyErrorListeners(error: { code: string; message: string }): void {
    this.errorListeners.forEach((listener) => {
      try {
        listener(error);
      } catch (error) {
        console.error('[ReconnectionManager] Error in error listener:', error);
      }
    });
  }
}

/**
 * Create a new ReconnectionManager instance
 * 
 * Factory function for creating ReconnectionManager instances.
 * 
 * @param options - Configuration options
 * @returns New ReconnectionManager instance
 */
export function createReconnectionManager(
  options: ReconnectionManagerOptions
): ReconnectionManager {
  return new ReconnectionManager(options);
}
