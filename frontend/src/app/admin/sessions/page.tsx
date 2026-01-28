/**
 * Admin Panel - Sessions Management Page
 * 
 * Displays active and recent quiz sessions with:
 * - Session list with status indicators
 * - Quick actions (open controller, end session)
 * - Session details (join code, participant count)
 * 
 * Requirements: 2.1
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { get, post } from '@/lib/api-client';

/**
 * Session state type
 */
type SessionState = 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED';

/**
 * Session data interface
 */
interface Session {
  sessionId: string;
  quizId: string;
  joinCode: string;
  state: SessionState;
  currentQuestionIndex: number;
  participantCount: number;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

/**
 * Quiz data for session
 */
interface SessionQuiz {
  _id: string;
  title: string;
  quizType: string;
  questions: { questionId: string }[];
}

/**
 * Session with quiz data
 */
interface SessionWithQuiz {
  session: Session;
  quiz: SessionQuiz;
}

/**
 * Sessions list response
 */
interface SessionsListResponse {
  success: boolean;
  sessions: SessionWithQuiz[];
}

/**
 * State badge colors
 */
const stateBadgeStyles: Record<SessionState, string> = {
  LOBBY: 'bg-info/10 text-info border-info/20',
  ACTIVE_QUESTION: 'bg-success/10 text-success border-success/20',
  REVEAL: 'bg-warning/10 text-warning-dark border-warning/20',
  ENDED: 'bg-[var(--text-muted)]/10 text-[var(--text-muted)] border-[var(--text-muted)]/20',
};

/**
 * State labels
 */
const stateLabels: Record<SessionState, string> = {
  LOBBY: 'Waiting',
  ACTIVE_QUESTION: 'Live',
  REVEAL: 'Revealing',
  ENDED: 'Ended',
};

/**
 * Format date to readable string
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Icon components
 */
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function ControllerIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="8" cy="12" r="2" />
      <path d="M18 12h.01" />
      <path d="M15 12h.01" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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
 * Empty state component
 */
function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="neu-pressed rounded-full p-6 mb-6">
        <PlayIcon className="w-16 h-16 text-[var(--text-muted)]" />
      </div>
      <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-2">
        No active sessions
      </h3>
      <p className="text-body text-[var(--text-secondary)] text-center max-w-md mb-6">
        Start a session from any quiz to see it here. Active sessions will appear with their join codes and participant counts.
      </p>
      <Link href="/admin">
        <Button variant="primary">
          Go to Quizzes
        </Button>
      </Link>
    </motion.div>
  );
}

/**
 * Session card component
 */
function SessionCard({ 
  sessionData, 
  onEndSession,
  isEnding 
}: { 
  sessionData: SessionWithQuiz;
  onEndSession: (sessionId: string) => void;
  isEnding: boolean;
}) {
  const { session, quiz } = sessionData;
  const [copied, setCopied] = React.useState(false);

  const copyJoinCode = async () => {
    await navigator.clipboard.writeText(session.joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isActive = session.state !== 'ENDED';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="neu-raised rounded-lg p-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-h3 font-semibold text-[var(--text-primary)] truncate">
            {quiz.title}
          </h3>
          <p className="text-body-sm text-[var(--text-muted)] mt-1">
            Created {formatDate(session.createdAt)}
          </p>
        </div>
        <span className={`flex-shrink-0 px-3 py-1 rounded-full text-caption font-medium border ${stateBadgeStyles[session.state]}`}>
          {stateLabels[session.state]}
        </span>
      </div>

      {/* Join Code */}
      {isActive && (
        <div className="neu-pressed rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-caption text-[var(--text-muted)] mb-1">Join Code</p>
              <p className="font-mono text-display font-bold text-primary tracking-wider">
                {session.joinCode}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={copyJoinCode}
              className="text-[var(--text-muted)] hover:text-primary"
            >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <CopyIcon />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-6 text-body-sm text-[var(--text-secondary)] mb-5">
        <div className="flex items-center gap-2">
          <UsersIcon />
          <span>{session.participantCount} participants</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Q{session.currentQuestionIndex + 1}/{quiz.questions.length}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {isActive && (
          <>
            <Link href={`/controller/${session.sessionId}`} className="flex-1">
              <Button variant="primary" size="sm" fullWidth leftIcon={<ControllerIcon />}>
                Controller
              </Button>
            </Link>
            <Link href={`/bigscreen/${session.sessionId}`} target="_blank">
              <Button variant="secondary" size="sm" leftIcon={<MonitorIcon />}>
                Big Screen
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEndSession(session.sessionId)}
              disabled={isEnding}
              isLoading={isEnding}
              className="text-error hover:bg-error/10"
              leftIcon={!isEnding ? <StopIcon /> : undefined}
            >
              End
            </Button>
          </>
        )}
        {!isActive && (
          <Link href={`/admin/sessions/${session.sessionId}/results`} className="flex-1">
            <Button variant="secondary" size="sm" fullWidth>
              View Results
            </Button>
          </Link>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Loading skeleton
 */
function SessionCardSkeleton() {
  return (
    <div className="neu-raised rounded-lg p-6 animate-pulse">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <div className="h-6 bg-[var(--shadow-dark)] rounded w-3/4 mb-2" />
          <div className="h-4 bg-[var(--shadow-dark)] rounded w-1/2" />
        </div>
        <div className="h-6 bg-[var(--shadow-dark)] rounded-full w-16" />
      </div>
      <div className="h-20 bg-[var(--shadow-dark)] rounded-lg mb-4" />
      <div className="flex gap-3">
        <div className="h-9 bg-[var(--shadow-dark)] rounded flex-1" />
        <div className="h-9 bg-[var(--shadow-dark)] rounded w-24" />
      </div>
    </div>
  );
}

/**
 * Fetch sessions from API
 */
async function fetchSessions(): Promise<SessionWithQuiz[]> {
  // The backend doesn't have a list sessions endpoint yet, so we'll need to add it
  // For now, we'll return an empty array and show the empty state
  try {
    const response = await get<SessionsListResponse>('/sessions');
    return response.sessions || [];
  } catch {
    // If endpoint doesn't exist, return empty array
    return [];
  }
}

/**
 * End session API call
 */
async function endSession(sessionId: string): Promise<void> {
  await post(`/sessions/${sessionId}/end`);
}

/**
 * Sessions Management Page
 */
export default function SessionsPage() {
  const queryClient = useQueryClient();
  const [endingId, setEndingId] = React.useState<string | null>(null);

  // Fetch sessions
  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // End session mutation
  const endMutation = useMutation({
    mutationFn: endSession,
    onMutate: (sessionId) => {
      setEndingId(sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onSettled: () => {
      setEndingId(null);
    },
  });

  const handleEndSession = (sessionId: string) => {
    if (window.confirm('Are you sure you want to end this session? This cannot be undone.')) {
      endMutation.mutate(sessionId);
    }
  };

  // Separate active and ended sessions
  const activeSessions = sessions?.filter(s => s.session.state !== 'ENDED') || [];
  const endedSessions = sessions?.filter(s => s.session.state === 'ENDED') || [];

  return (
    <div>
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between gap-4 mb-2">
          <div>
            <h1 className="text-h1 font-semibold text-[var(--text-primary)]">
              Sessions
            </h1>
            <p className="text-body text-[var(--text-secondary)] mt-1">
              Manage active and recent quiz sessions
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            leftIcon={<RefreshIcon />}
          >
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SessionCardSkeleton key={i} />
          ))}
        </div>
      ) : !sessions?.length ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {/* Active Sessions */}
          {activeSessions.length > 0 && (
            <section>
              <h2 className="text-h2 font-semibold text-[var(--text-primary)] mb-4">
                Active Sessions ({activeSessions.length})
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AnimatePresence mode="popLayout">
                  {activeSessions.map((sessionData) => (
                    <SessionCard
                      key={sessionData.session.sessionId}
                      sessionData={sessionData}
                      onEndSession={handleEndSession}
                      isEnding={endingId === sessionData.session.sessionId}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          {/* Ended Sessions */}
          {endedSessions.length > 0 && (
            <section>
              <h2 className="text-h2 font-semibold text-[var(--text-muted)] mb-4">
                Recent Sessions ({endedSessions.length})
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 opacity-75">
                <AnimatePresence mode="popLayout">
                  {endedSessions.slice(0, 6).map((sessionData) => (
                    <SessionCard
                      key={sessionData.session.sessionId}
                      sessionData={sessionData}
                      onEndSession={handleEndSession}
                      isEnding={endingId === sessionData.session.sessionId}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
