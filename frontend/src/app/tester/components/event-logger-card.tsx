/**
 * Event Logger Card Component
 * 
 * Displays WebSocket event timeline with:
 * - Scrollable event list with color-coded types
 * - Filter controls by event type
 * - Search/filter by event name
 * - Expandable payload view
 * - Clear and export functionality
 * 
 * Requirements: 15.7
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  WebSocketLogger,
  websocketLogger,
  type WebSocketLogEntry,
  type WebSocketEventType,
  type EventStats,
} from '@/lib/websocket-logger';

// ==================== Types ====================

interface EventLoggerCardProps {
  /** Custom logger instance (uses singleton if not provided) */
  logger?: WebSocketLogger;
  /** Maximum height of the event list */
  maxHeight?: string;
  /** Whether to auto-scroll to new events */
  autoScroll?: boolean;
  /** Callback when stats update */
  onStatsUpdate?: (stats: EventStats) => void;
}

// ==================== Constants ====================

const EVENT_TYPE_COLORS: Record<WebSocketEventType, { bg: string; text: string; border: string }> = {
  connect: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  disconnect: { bg: 'bg-error/10', text: 'text-error', border: 'border-error/30' },
  emit: { bg: 'bg-info/10', text: 'text-info', border: 'border-info/30' },
  receive: { bg: 'bg-[#8B5CF6]/10', text: 'text-[#8B5CF6]', border: 'border-[#8B5CF6]/30' },
  error: { bg: 'bg-error/10', text: 'text-error', border: 'border-error/30' },
};

const EVENT_TYPE_ICONS: Record<WebSocketEventType, React.ReactNode> = {
  connect: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  disconnect: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
  emit: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  ),
  receive: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
};

// ==================== Utility Functions ====================

/**
 * Format timestamp for display
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
}

/**
 * Format payload for display
 */
function formatPayload(payload: unknown): string {
  if (payload === null || payload === undefined) {
    return 'null';
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ==================== Sub-Components ====================

/**
 * Filter checkbox component
 */
function FilterCheckbox({
  label,
  checked,
  onChange,
  color,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  color: { bg: string; text: string };
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        className={cn(
          'w-5 h-5 rounded flex items-center justify-center transition-all duration-fast',
          checked ? `${color.bg} ${color.text}` : 'bg-[var(--neu-surface)] neu-pressed'
        )}
        onClick={() => onChange(!checked)}
      >
        {checked && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className={cn('text-body-sm', checked ? color.text : 'text-[var(--text-muted)]')}>
        {label}
      </span>
    </label>
  );
}

/**
 * Single event entry component
 */
function EventEntry({
  event,
  isExpanded,
  onToggle,
}: {
  event: WebSocketLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const colors = EVENT_TYPE_COLORS[event.type];
  const icon = EVENT_TYPE_ICONS[event.type];

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        'rounded-lg border transition-all duration-fast',
        colors.border,
        isExpanded ? 'bg-[var(--neu-surface)]' : 'hover:bg-[var(--neu-surface)]/50'
      )}
    >
      {/* Event Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        {/* Type Icon */}
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', colors.bg, colors.text)}>
          {icon}
        </div>

        {/* Event Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('font-medium text-body-sm', colors.text)}>
              {event.eventName}
            </span>
            {event.participantId !== undefined && (
              <span className="text-caption text-[var(--text-muted)] bg-[var(--neu-surface)] px-1.5 py-0.5 rounded">
                P{event.participantId}
              </span>
            )}
            {event.payloadTruncated && (
              <span className="text-caption text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                truncated
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-caption text-[var(--text-muted)]">
            <span>{formatTime(event.timestamp)}</span>
            <span>•</span>
            <span>{event.direction === 'in' ? '← received' : event.direction === 'out' ? '→ sent' : '● system'}</span>
            <span>•</span>
            <span>{formatBytes(event.payloadSize)}</span>
          </div>
        </div>

        {/* Expand Icon */}
        <svg
          className={cn(
            'w-5 h-5 text-[var(--text-muted)] transition-transform duration-fast flex-shrink-0',
            isExpanded && 'rotate-180'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Payload */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0">
              {event.errorMessage && (
                <div className="mb-2 p-2 rounded bg-error/10 border border-error/20">
                  <p className="text-body-sm text-error font-medium">Error: {event.errorMessage}</p>
                </div>
              )}
              <div className="rounded-lg bg-[var(--neu-bg)] neu-pressed p-3 overflow-x-auto">
                <pre className="text-caption font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-all">
                  {formatPayload(event.payload)}
                </pre>
              </div>
              <div className="mt-2 flex items-center gap-4 text-caption text-[var(--text-muted)]">
                <span>ID: {event.id}</span>
                {event.socketId && <span>Socket: {event.socketId}</span>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ==================== Main Component ====================

/**
 * Event Logger Card Component
 */
export function EventLoggerCard({
  logger = websocketLogger,
  maxHeight = '500px',
  autoScroll = true,
  onStatsUpdate,
}: EventLoggerCardProps) {
  // State
  const [events, setEvents] = React.useState<WebSocketLogEntry[]>([]);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = React.useState('');
  const [typeFilters, setTypeFilters] = React.useState<Set<WebSocketEventType>>(
    new Set(['connect', 'disconnect', 'emit', 'receive', 'error'])
  );
  const [isPaused, setIsPaused] = React.useState(false);

  // Refs
  const listRef = React.useRef<HTMLDivElement>(null);
  const shouldScrollRef = React.useRef(true);

  // Subscribe to logger events
  React.useEffect(() => {
    // Load initial events
    setEvents(logger.getEvents());

    // Subscribe to new events
    const unsubscribe = logger.subscribe((entry) => {
      if (!isPaused) {
        setEvents(prev => [...prev.slice(-999), entry]);
        onStatsUpdate?.(logger.getStats());
      }
    });

    return unsubscribe;
  }, [logger, isPaused, onStatsUpdate]);

  // Auto-scroll to bottom when new events arrive
  React.useEffect(() => {
    if (autoScroll && shouldScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = React.useCallback(() => {
    if (listRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = listRef.current;
      shouldScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  }, []);

  // Filter events
  const filteredEvents = React.useMemo(() => {
    return events.filter(event => {
      if (!typeFilters.has(event.type)) return false;
      if (searchQuery && !event.eventName.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [events, typeFilters, searchQuery]);

  // Toggle event expansion
  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle type filter
  const toggleTypeFilter = (type: WebSocketEventType) => {
    setTypeFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Clear all events
  const handleClear = () => {
    logger.clear();
    setEvents([]);
    setExpandedIds(new Set());
    onStatsUpdate?.(logger.getStats());
  };

  // Export to JSON
  const handleExportJSON = () => {
    const json = logger.exportToJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `websocket-events-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export to CSV
  const handleExportCSV = () => {
    const csv = logger.exportToCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `websocket-events-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
              WebSocket Event Logger
            </h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              {filteredEvents.length} of {events.length} events
            </p>
          </div>
        </div>

        {/* Pause/Resume Button */}
        <button
          onClick={() => setIsPaused(!isPaused)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-body-sm font-medium transition-all duration-fast',
            isPaused
              ? 'bg-warning/10 text-warning'
              : 'bg-success/10 text-success'
          )}
        >
          {isPaused ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Paused
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              Live
            </>
          )}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search event names..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--neu-surface)] neu-pressed text-body-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Type Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-body-sm text-[var(--text-muted)]">Filter:</span>
          <FilterCheckbox
            label="Connect"
            checked={typeFilters.has('connect')}
            onChange={() => toggleTypeFilter('connect')}
            color={EVENT_TYPE_COLORS.connect}
          />
          <FilterCheckbox
            label="Disconnect"
            checked={typeFilters.has('disconnect')}
            onChange={() => toggleTypeFilter('disconnect')}
            color={EVENT_TYPE_COLORS.disconnect}
          />
          <FilterCheckbox
            label="Emit"
            checked={typeFilters.has('emit')}
            onChange={() => toggleTypeFilter('emit')}
            color={EVENT_TYPE_COLORS.emit}
          />
          <FilterCheckbox
            label="Receive"
            checked={typeFilters.has('receive')}
            onChange={() => toggleTypeFilter('receive')}
            color={EVENT_TYPE_COLORS.receive}
          />
          <FilterCheckbox
            label="Error"
            checked={typeFilters.has('error')}
            onChange={() => toggleTypeFilter('error')}
            color={EVENT_TYPE_COLORS.error}
          />
        </div>
      </div>

      {/* Event List */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="space-y-2 overflow-y-auto pr-2"
        style={{ maxHeight }}
      >
        <AnimatePresence mode="popLayout">
          {filteredEvents.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--neu-surface)] neu-pressed flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-[var(--text-muted)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <p className="text-body text-[var(--text-muted)] mb-2">
                No events logged yet
              </p>
              <p className="text-body-sm text-[var(--text-muted)]">
                Start a load test to capture WebSocket events
              </p>
            </motion.div>
          ) : (
            filteredEvents.map((event) => (
              <EventEntry
                key={event.id}
                event={event}
                isExpanded={expandedIds.has(event.id)}
                onToggle={() => toggleExpanded(event.id)}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="mt-6 pt-4 border-t border-[var(--neu-shadow-dark)]/10 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleClear}
          disabled={events.length === 0}
          leftIcon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          }
        >
          Clear Logs
        </Button>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={handleExportCSV}
          disabled={events.length === 0}
          leftIcon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        >
          Export CSV
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleExportJSON}
          disabled={events.length === 0}
          leftIcon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        >
          Export JSON
        </Button>
      </div>
    </motion.div>
  );
}

export default EventLoggerCard;
