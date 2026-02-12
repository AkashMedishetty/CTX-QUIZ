/**
 * Audit Logs Page
 * 
 * Admin page for viewing and filtering audit logs.
 * Features:
 * - Paginated table with timestamp, event_type, session_id, details
 * - Expandable row detail view for full event payload
 * - Filters for session ID, event type, and date range
 * 
 * Requirements: 5.1, 5.2, 5.6
 */

'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { get } from '@/lib/api-client';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Audit event types
 */
const EVENT_TYPES = [
  'QUIZ_CREATED',
  'SESSION_STARTED',
  'PARTICIPANT_JOINED',
  'ANSWER_SUBMITTED',
  'QUESTION_VOIDED',
  'PARTICIPANT_KICKED',
  'PARTICIPANT_BANNED',
  'ERROR',
] as const;

type AuditEventType = typeof EVENT_TYPES[number];

/**
 * Audit log entry interface
 */
interface AuditLogEntry {
  _id: string;
  eventType: AuditEventType;
  sessionId?: string;
  joinCode?: string | null;
  participantId?: string;
  quizId?: string;
  userId?: string;
  details: Record<string, unknown>;
  errorMessage?: string;
  timestamp: string;
}

/**
 * API response interface
 */
interface AuditLogsResponse {
  success: boolean;
  data: {
    logs: AuditLogEntry[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  };
}

/**
 * Filter state interface
 */
interface Filters {
  sessionId: string;
  eventType: string;
  startDate: string;
  endDate: string;
}

/**
 * Icons
 */
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

/**
 * Event type badge colors
 */
const eventTypeColors: Record<AuditEventType, string> = {
  QUIZ_CREATED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  SESSION_STARTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  PARTICIPANT_JOINED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  ANSWER_SUBMITTED: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  QUESTION_VOIDED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  PARTICIPANT_KICKED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  PARTICIPANT_BANNED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  ERROR: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

/**
 * Expandable Row Component
 */
function AuditLogRow({ log }: { log: AuditLogEntry }) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getDetailsSummary = (details: Record<string, unknown>) => {
    const keys = Object.keys(details);
    if (keys.length === 0) return 'No details';
    if (keys.length <= 2) {
      return keys.map(k => `${k}: ${JSON.stringify(details[k])}`).join(', ');
    }
    return `${keys.length} fields`;
  };

  return (
    <>
      <tr
        className={cn(
          'border-b border-[var(--border)] cursor-pointer transition-colors',
          'hover:bg-[var(--neu-surface)]',
          isExpanded && 'bg-[var(--neu-surface)]'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="px-4 py-3 text-body-sm text-[var(--text-secondary)]">
          {formatTimestamp(log.timestamp)}
        </td>
        <td className="px-4 py-3">
          <span className={cn('px-2 py-1 rounded-md text-xs font-medium', eventTypeColors[log.eventType])}>
            {log.eventType}
          </span>
        </td>
        <td className="px-4 py-3 text-body-sm text-[var(--text-primary)] font-mono" title={log.sessionId || ''}>
          {log.joinCode || log.sessionId || '-'}
        </td>
        <td className="px-4 py-3 text-body-sm text-[var(--text-muted)] max-w-[200px] truncate">
          {getDetailsSummary(log.details)}
        </td>
        <td className="px-4 py-3">
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDownIcon className="text-[var(--text-muted)]" />
          </motion.div>
        </td>
      </tr>
      <AnimatePresence>
        {isExpanded && (
          <motion.tr
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <td colSpan={5} className="px-4 py-4 bg-[var(--neu-surface)]">
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-body-sm">
                  {log.participantId && (
                    <div>
                      <span className="text-[var(--text-muted)]">Participant ID:</span>
                      <p className="font-mono text-[var(--text-primary)]">{log.participantId}</p>
                    </div>
                  )}
                  {log.quizId && (
                    <div>
                      <span className="text-[var(--text-muted)]">Quiz ID:</span>
                      <p className="font-mono text-[var(--text-primary)]">{log.quizId}</p>
                    </div>
                  )}
                  {log.userId && (
                    <div>
                      <span className="text-[var(--text-muted)]">User ID:</span>
                      <p className="font-mono text-[var(--text-primary)]">{log.userId}</p>
                    </div>
                  )}
                  {log.errorMessage && (
                    <div className="col-span-2">
                      <span className="text-[var(--text-muted)]">Error:</span>
                      <p className="text-error">{log.errorMessage}</p>
                    </div>
                  )}
                </div>
                <div>
                  <span className="text-body-sm text-[var(--text-muted)]">Full Details:</span>
                  <pre className="mt-1 p-3 rounded-md bg-[var(--neu-bg)] text-body-sm font-mono overflow-x-auto">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                </div>
              </div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Pagination Component
 */
function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
      <div className="flex items-center gap-4">
        <span className="text-body-sm text-[var(--text-muted)]">
          Showing {Math.min((page - 1) * limit + 1, total)} - {Math.min(page * limit, total)} of {total}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-body-sm text-[var(--text-muted)]">Per page:</span>
          <Select value={limit.toString()} onValueChange={(v) => onLimitChange(parseInt(v, 10))}>
            <SelectTrigger className="w-20 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <span className="text-body-sm text-[var(--text-primary)]">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/**
 * Audit Logs Page Component
 */
export default function AuditLogsPage() {
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(25);
  const [filters, setFilters] = React.useState<Filters>({
    sessionId: '',
    eventType: '',
    startDate: '',
    endDate: '',
  });
  const [showFilters, setShowFilters] = React.useState(false);

  // Build query params
  const queryParams = new URLSearchParams();
  queryParams.set('page', page.toString());
  queryParams.set('limit', limit.toString());
  if (filters.sessionId) queryParams.set('sessionId', filters.sessionId);
  if (filters.eventType) queryParams.set('eventType', filters.eventType);
  if (filters.startDate) queryParams.set('startDate', filters.startDate);
  if (filters.endDate) queryParams.set('endDate', filters.endDate);

  // Fetch audit logs
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['audit-logs', page, limit, filters],
    queryFn: () => get<AuditLogsResponse>(`/audit-logs?${queryParams.toString()}`),
  });

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page when filters change
  };

  const clearFilters = () => {
    setFilters({
      sessionId: '',
      eventType: '',
      startDate: '',
      endDate: '',
    });
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-h1 font-semibold text-[var(--text-primary)]">Audit Logs</h1>
          <p className="text-body text-[var(--text-secondary)] mt-1">
            View and filter system audit events
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={showFilters ? 'primary' : 'secondary'}
            onClick={() => setShowFilters(!showFilters)}
            leftIcon={<FilterIcon />}
          >
            Filters {hasActiveFilters && `(${Object.values(filters).filter(v => v).length})`}
          </Button>
          <Button
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            leftIcon={<RefreshIcon className={isFetching ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="neu-raised rounded-lg p-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Input
                label="Session / Join Code"
                placeholder="Filter by join code or session ID"
                value={filters.sessionId}
                onChange={(e) => handleFilterChange('sessionId', e.target.value)}
              />
              <div>
                <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">
                  Event Type
                </label>
                <Select
                  value={filters.eventType || '__all__'}
                  onValueChange={(v) => handleFilterChange('eventType', v === '__all__' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All events" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All events</SelectItem>
                    {EVENT_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                label="Start Date"
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
              />
              <Input
                label="End Date"
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
              />
            </div>
            {hasActiveFilters && (
              <div className="mt-4 flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logs Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="neu-raised rounded-lg overflow-hidden"
      >
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-body text-[var(--text-muted)]">Loading audit logs...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <p className="text-body text-error">Failed to load audit logs</p>
            <Button variant="secondary" onClick={() => refetch()} className="mt-4">
              Try Again
            </Button>
          </div>
        ) : data?.data?.logs?.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-body text-[var(--text-muted)]">
              {hasActiveFilters ? 'No logs match your filters' : 'No audit logs found'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--neu-surface)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-body-sm font-medium text-[var(--text-secondary)]">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-body-sm font-medium text-[var(--text-secondary)]">
                      Event Type
                    </th>
                    <th className="px-4 py-3 text-left text-body-sm font-medium text-[var(--text-secondary)]">
                      Session
                    </th>
                    <th className="px-4 py-3 text-left text-body-sm font-medium text-[var(--text-secondary)]">
                      Details
                    </th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {data?.data?.logs?.map((log) => (
                    <AuditLogRow key={log._id} log={log} />
                  ))}
                </tbody>
              </table>
            </div>
            {data?.data?.pagination && (
              <Pagination
                page={data.data.pagination.page}
                totalPages={data.data.pagination.totalPages}
                total={data.data.pagination.total}
                limit={data.data.pagination.limit}
                onPageChange={setPage}
                onLimitChange={(newLimit) => {
                  setLimit(newLimit);
                  setPage(1);
                }}
              />
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
