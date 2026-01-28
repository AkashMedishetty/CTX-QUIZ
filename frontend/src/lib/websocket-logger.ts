/**
 * WebSocket Event Logger
 * 
 * Captures and logs all WebSocket events for debugging and analysis.
 * Features:
 * - Circular buffer to limit memory usage (last 1000 events)
 * - Event types: connect, disconnect, emit, receive, error
 * - Timestamp, event name, payload, direction tracking
 * - Export to JSON/CSV functionality
 * 
 * Requirements: 15.7
 */

// ==================== Types ====================

/**
 * WebSocket event types
 */
export type WebSocketEventType = 'connect' | 'disconnect' | 'emit' | 'receive' | 'error';

/**
 * Event direction
 */
export type EventDirection = 'in' | 'out' | 'system';

/**
 * Single logged WebSocket event
 */
export interface WebSocketLogEntry {
  /** Unique event ID */
  id: string;
  /** Timestamp when event occurred */
  timestamp: number;
  /** Type of event */
  type: WebSocketEventType;
  /** Event name (e.g., 'question_started', 'submit_answer') */
  eventName: string;
  /** Event payload (truncated if large) */
  payload: unknown;
  /** Original payload size in bytes */
  payloadSize: number;
  /** Whether payload was truncated */
  payloadTruncated: boolean;
  /** Direction of event */
  direction: EventDirection;
  /** Socket ID if available */
  socketId?: string;
  /** Participant ID if available */
  participantId?: number;
  /** Error message if type is 'error' */
  errorMessage?: string;
}

/**
 * Event statistics
 */
export interface EventStats {
  /** Total events logged */
  totalEvents: number;
  /** Events by type */
  byType: Record<WebSocketEventType, number>;
  /** Events by direction */
  byDirection: Record<EventDirection, number>;
  /** Events per second (last minute) */
  eventsPerSecond: number;
  /** Most common event names */
  topEventNames: Array<{ name: string; count: number }>;
  /** First event timestamp */
  firstEventTime: number | null;
  /** Last event timestamp */
  lastEventTime: number | null;
}

/**
 * Logger configuration
 */
export interface WebSocketLoggerConfig {
  /** Maximum number of events to keep in buffer */
  maxEvents?: number;
  /** Maximum payload size before truncation (bytes) */
  maxPayloadSize?: number;
  /** Whether to log to console */
  logToConsole?: boolean;
}

/**
 * Event callback type
 */
export type LogEventCallback = (entry: WebSocketLogEntry) => void;

// ==================== Constants ====================

const DEFAULT_MAX_EVENTS = 1000;
const DEFAULT_MAX_PAYLOAD_SIZE = 10000; // 10KB

// ==================== Utility Functions ====================

/**
 * Generate a unique ID for log entries
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Calculate approximate size of an object in bytes
 */
function getObjectSize(obj: unknown): number {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch {
    return 0;
  }
}

/**
 * Truncate payload if it exceeds max size
 */
function truncatePayload(payload: unknown, maxSize: number): { payload: unknown; truncated: boolean } {
  const size = getObjectSize(payload);
  
  if (size <= maxSize) {
    return { payload, truncated: false };
  }

  // Try to create a truncated version
  if (typeof payload === 'string') {
    return {
      payload: payload.substring(0, maxSize) + '... [truncated]',
      truncated: true,
    };
  }

  if (Array.isArray(payload)) {
    // Keep first few items
    const truncatedArray = payload.slice(0, 5);
    return {
      payload: [...truncatedArray, `... and ${payload.length - 5} more items [truncated]`],
      truncated: true,
    };
  }

  if (typeof payload === 'object' && payload !== null) {
    // Keep only top-level keys with truncated values
    const truncatedObj: Record<string, unknown> = {};
    const keys = Object.keys(payload);
    
    for (const key of keys.slice(0, 10)) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.length > 100) {
        truncatedObj[key] = value.substring(0, 100) + '... [truncated]';
      } else if (Array.isArray(value)) {
        truncatedObj[key] = `[Array(${value.length})]`;
      } else if (typeof value === 'object' && value !== null) {
        truncatedObj[key] = '[Object]';
      } else {
        truncatedObj[key] = value;
      }
    }

    if (keys.length > 10) {
      truncatedObj['...'] = `${keys.length - 10} more keys [truncated]`;
    }

    return { payload: truncatedObj, truncated: true };
  }

  return { payload, truncated: false };
}

/**
 * Format timestamp for CSV export
 */
function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Escape CSV field
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ==================== WebSocketLogger Class ====================

/**
 * WebSocket Event Logger class
 * 
 * Captures all WebSocket events with a circular buffer to limit memory usage.
 */
export class WebSocketLogger {
  private events: WebSocketLogEntry[] = [];
  private config: Required<WebSocketLoggerConfig>;
  private callbacks: Set<LogEventCallback> = new Set();
  private eventCounts: Map<string, number> = new Map();
  private recentEventTimestamps: number[] = [];

  constructor(config: WebSocketLoggerConfig = {}) {
    this.config = {
      maxEvents: config.maxEvents ?? DEFAULT_MAX_EVENTS,
      maxPayloadSize: config.maxPayloadSize ?? DEFAULT_MAX_PAYLOAD_SIZE,
      logToConsole: config.logToConsole ?? false,
    };
  }

  /**
   * Log a WebSocket event
   */
  log(
    type: WebSocketEventType,
    eventName: string,
    payload: unknown = null,
    options: {
      direction?: EventDirection;
      socketId?: string;
      participantId?: number;
      errorMessage?: string;
    } = {}
  ): WebSocketLogEntry {
    const payloadSize = getObjectSize(payload);
    const { payload: processedPayload, truncated } = truncatePayload(
      payload,
      this.config.maxPayloadSize
    );

    const entry: WebSocketLogEntry = {
      id: generateId(),
      timestamp: Date.now(),
      type,
      eventName,
      payload: processedPayload,
      payloadSize,
      payloadTruncated: truncated,
      direction: options.direction ?? this.getDefaultDirection(type),
      socketId: options.socketId,
      participantId: options.participantId,
      errorMessage: options.errorMessage,
    };

    // Add to circular buffer
    this.events.push(entry);
    if (this.events.length > this.config.maxEvents) {
      this.events.shift();
    }

    // Update event counts
    const currentCount = this.eventCounts.get(eventName) ?? 0;
    this.eventCounts.set(eventName, currentCount + 1);

    // Track recent events for rate calculation
    this.recentEventTimestamps.push(entry.timestamp);
    const oneMinuteAgo = Date.now() - 60000;
    this.recentEventTimestamps = this.recentEventTimestamps.filter(t => t > oneMinuteAgo);

    // Log to console if enabled
    if (this.config.logToConsole) {
      this.logToConsole(entry);
    }

    // Notify callbacks
    this.callbacks.forEach(callback => callback(entry));

    return entry;
  }

  /**
   * Log a connection event
   */
  logConnect(socketId?: string, participantId?: number): WebSocketLogEntry {
    return this.log('connect', 'socket_connect', { socketId, participantId }, {
      direction: 'system',
      socketId,
      participantId,
    });
  }

  /**
   * Log a disconnection event
   */
  logDisconnect(reason?: string, socketId?: string, participantId?: number): WebSocketLogEntry {
    return this.log('disconnect', 'socket_disconnect', { reason }, {
      direction: 'system',
      socketId,
      participantId,
    });
  }

  /**
   * Log an emitted event (outgoing)
   */
  logEmit(eventName: string, payload: unknown, socketId?: string, participantId?: number): WebSocketLogEntry {
    return this.log('emit', eventName, payload, {
      direction: 'out',
      socketId,
      participantId,
    });
  }

  /**
   * Log a received event (incoming)
   */
  logReceive(eventName: string, payload: unknown, socketId?: string, participantId?: number): WebSocketLogEntry {
    return this.log('receive', eventName, payload, {
      direction: 'in',
      socketId,
      participantId,
    });
  }

  /**
   * Log an error event
   */
  logError(errorMessage: string, payload?: unknown, socketId?: string, participantId?: number): WebSocketLogEntry {
    return this.log('error', 'socket_error', payload, {
      direction: 'system',
      socketId,
      participantId,
      errorMessage,
    });
  }

  /**
   * Get all logged events
   */
  getEvents(): WebSocketLogEntry[] {
    return [...this.events];
  }

  /**
   * Get events filtered by criteria
   */
  getFilteredEvents(filters: {
    types?: WebSocketEventType[];
    directions?: EventDirection[];
    eventNameSearch?: string;
    startTime?: number;
    endTime?: number;
    participantId?: number;
  }): WebSocketLogEntry[] {
    return this.events.filter(event => {
      if (filters.types && filters.types.length > 0 && !filters.types.includes(event.type)) {
        return false;
      }
      if (filters.directions && filters.directions.length > 0 && !filters.directions.includes(event.direction)) {
        return false;
      }
      if (filters.eventNameSearch && !event.eventName.toLowerCase().includes(filters.eventNameSearch.toLowerCase())) {
        return false;
      }
      if (filters.startTime && event.timestamp < filters.startTime) {
        return false;
      }
      if (filters.endTime && event.timestamp > filters.endTime) {
        return false;
      }
      if (filters.participantId !== undefined && event.participantId !== filters.participantId) {
        return false;
      }
      return true;
    });
  }

  /**
   * Get event statistics
   */
  getStats(): EventStats {
    const byType: Record<WebSocketEventType, number> = {
      connect: 0,
      disconnect: 0,
      emit: 0,
      receive: 0,
      error: 0,
    };

    const byDirection: Record<EventDirection, number> = {
      in: 0,
      out: 0,
      system: 0,
    };

    for (const event of this.events) {
      byType[event.type]++;
      byDirection[event.direction]++;
    }

    // Calculate events per second (last minute)
    const oneMinuteAgo = Date.now() - 60000;
    const recentEvents = this.recentEventTimestamps.filter(t => t > oneMinuteAgo);
    const eventsPerSecond = recentEvents.length / 60;

    // Get top event names
    const topEventNames = Array.from(this.eventCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return {
      totalEvents: this.events.length,
      byType,
      byDirection,
      eventsPerSecond: Math.round(eventsPerSecond * 100) / 100,
      topEventNames,
      firstEventTime: this.events.length > 0 ? this.events[0].timestamp : null,
      lastEventTime: this.events.length > 0 ? this.events[this.events.length - 1].timestamp : null,
    };
  }

  /**
   * Clear all logged events
   */
  clear(): void {
    this.events = [];
    this.eventCounts.clear();
    this.recentEventTimestamps = [];
  }

  /**
   * Export events to JSON
   */
  exportToJSON(filters?: Parameters<typeof this.getFilteredEvents>[0]): string {
    const events = filters ? this.getFilteredEvents(filters) : this.events;
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      totalEvents: events.length,
      stats: this.getStats(),
      events,
    }, null, 2);
  }

  /**
   * Export events to CSV
   */
  exportToCSV(filters?: Parameters<typeof this.getFilteredEvents>[0]): string {
    const events = filters ? this.getFilteredEvents(filters) : this.events;
    
    const headers = [
      'ID',
      'Timestamp',
      'Type',
      'Event Name',
      'Direction',
      'Payload Size (bytes)',
      'Payload Truncated',
      'Socket ID',
      'Participant ID',
      'Error Message',
      'Payload',
    ];

    const rows = events.map(event => [
      event.id,
      formatTimestamp(event.timestamp),
      event.type,
      event.eventName,
      event.direction,
      event.payloadSize.toString(),
      event.payloadTruncated.toString(),
      event.socketId ?? '',
      event.participantId?.toString() ?? '',
      event.errorMessage ?? '',
      JSON.stringify(event.payload),
    ].map(escapeCSV).join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Subscribe to new events
   */
  subscribe(callback: LogEventCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Get default direction based on event type
   */
  private getDefaultDirection(type: WebSocketEventType): EventDirection {
    switch (type) {
      case 'emit':
        return 'out';
      case 'receive':
        return 'in';
      default:
        return 'system';
    }
  }

  /**
   * Log entry to console
   */
  private logToConsole(entry: WebSocketLogEntry): void {
    const prefix = `[WS ${entry.type.toUpperCase()}]`;
    const direction = entry.direction === 'in' ? '←' : entry.direction === 'out' ? '→' : '●';
    
    const style = this.getConsoleStyle(entry.type);
    
    // eslint-disable-next-line no-console
    console.log(
      `%c${prefix} ${direction} ${entry.eventName}`,
      style,
      entry.payload
    );
  }

  /**
   * Get console style based on event type
   */
  private getConsoleStyle(type: WebSocketEventType): string {
    switch (type) {
      case 'connect':
        return 'color: #22C55E; font-weight: bold;';
      case 'disconnect':
        return 'color: #EF4444; font-weight: bold;';
      case 'emit':
        return 'color: #3B82F6; font-weight: bold;';
      case 'receive':
        return 'color: #8B5CF6; font-weight: bold;';
      case 'error':
        return 'color: #EF4444; font-weight: bold; background: #FEE2E2;';
      default:
        return 'color: #6B7280;';
    }
  }
}

// Export singleton instance for convenience
export const websocketLogger = new WebSocketLogger();

export default WebSocketLogger;
