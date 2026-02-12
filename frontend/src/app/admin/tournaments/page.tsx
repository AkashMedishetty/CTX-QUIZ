/**
 * Tournament Admin Page - List all tournaments
 * 
 * Displays all tournaments with:
 * - Tournament list with status indicators
 * - Quick actions (view details, start tournament)
 * - Create new tournament button
 * 
 * Requirements: 3.1, 3.2
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { get, post, del } from '@/lib/api-client';

/**
 * Tournament state type
 */
type TournamentState = 'DRAFT' | 'LOBBY' | 'IN_PROGRESS' | 'COMPLETED';

/**
 * Tournament data interface
 */
interface Tournament {
  tournamentId: string;
  title: string;
  description?: string;
  state: TournamentState;
  rounds: { roundNumber: number; state: string }[];
  currentRoundIndex: number;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

/**
 * State badge colors
 */
const stateBadgeStyles: Record<TournamentState, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  LOBBY: 'bg-info/10 text-info border-info/20',
  IN_PROGRESS: 'bg-success/10 text-success border-success/20',
  COMPLETED: 'bg-[var(--text-muted)]/10 text-[var(--text-muted)] border-[var(--text-muted)]/20',
};

/**
 * State labels
 */
const stateLabels: Record<TournamentState, string> = {
  DRAFT: 'Draft',
  LOBBY: 'Lobby',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
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
function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
        <TrophyIcon className="w-16 h-16 text-[var(--text-muted)]" />
      </div>
      <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-2">
        No tournaments yet
      </h3>
      <p className="text-body text-[var(--text-secondary)] text-center max-w-md mb-6">
        Create your first multi-round tournament to run competitive quiz events with elimination rounds.
      </p>
      <Link href="/admin/tournaments/new">
        <Button variant="primary" leftIcon={<PlusIcon />}>
          Create Tournament
        </Button>
      </Link>
    </motion.div>
  );
}


/**
 * Tournament card component
 */
function TournamentCard({
  tournament,
  onStart,
  onDelete,
  isStarting,
  isDeleting,
}: {
  tournament: Tournament;
  onStart: (tournamentId: string) => void;
  onDelete: (tournamentId: string) => void;
  isStarting: boolean;
  isDeleting: boolean;
}) {
  const canStart = tournament.state === 'DRAFT' && tournament.rounds.length > 0;
  const canDelete = tournament.state === 'DRAFT' || tournament.state === 'COMPLETED';

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
            {tournament.title}
          </h3>
          <p className="text-body-sm text-[var(--text-muted)] mt-1">
            Created {formatDate(tournament.createdAt)}
          </p>
        </div>
        <span className={`flex-shrink-0 px-3 py-1 rounded-full text-caption font-medium border ${stateBadgeStyles[tournament.state]}`}>
          {stateLabels[tournament.state]}
        </span>
      </div>

      {/* Description */}
      {tournament.description && (
        <p className="text-body-sm text-[var(--text-secondary)] mb-4 line-clamp-2">
          {tournament.description}
        </p>
      )}

      {/* Stats */}
      <div className="neu-pressed rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-caption text-[var(--text-muted)] mb-1">Rounds</p>
            <p className="text-h3 font-bold text-primary">
              {tournament.rounds.length}
            </p>
          </div>
          <div className="text-right">
            <p className="text-caption text-[var(--text-muted)] mb-1">Current Round</p>
            <p className="text-h3 font-bold text-[var(--text-primary)]">
              {tournament.state === 'IN_PROGRESS' ? tournament.currentRoundIndex + 1 : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href={`/admin/tournaments/${tournament.tournamentId}`} className="flex-1">
          <Button variant="primary" size="sm" fullWidth>
            View Details
          </Button>
        </Link>
        {canStart && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onStart(tournament.tournamentId)}
            disabled={isStarting}
            isLoading={isStarting}
            leftIcon={!isStarting ? <PlayIcon /> : undefined}
          >
            Start
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(tournament.tournamentId)}
            disabled={isDeleting}
            isLoading={isDeleting}
            className="text-error hover:bg-error/10"
            leftIcon={!isDeleting ? <TrashIcon /> : undefined}
          >
            Delete
          </Button>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Loading skeleton
 */
function TournamentCardSkeleton() {
  return (
    <div className="neu-raised rounded-lg p-6 animate-pulse">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <div className="h-6 bg-[var(--shadow-dark)] rounded w-3/4 mb-2" />
          <div className="h-4 bg-[var(--shadow-dark)] rounded w-1/2" />
        </div>
        <div className="h-6 bg-[var(--shadow-dark)] rounded-full w-20" />
      </div>
      <div className="h-20 bg-[var(--shadow-dark)] rounded-lg mb-4" />
      <div className="flex gap-3">
        <div className="h-9 bg-[var(--shadow-dark)] rounded flex-1" />
        <div className="h-9 bg-[var(--shadow-dark)] rounded w-20" />
      </div>
    </div>
  );
}


/**
 * Fetch tournaments from API
 */
async function fetchTournaments(): Promise<Tournament[]> {
  try {
    const response = await get<{ success: boolean; tournaments: Tournament[] }>('/tournaments');
    return response.tournaments || [];
  } catch {
    return [];
  }
}

/**
 * Start tournament API call
 */
async function startTournament(tournamentId: string): Promise<void> {
  await post(`/tournaments/${tournamentId}/start`);
}

/**
 * Delete tournament API call
 */
async function deleteTournament(tournamentId: string): Promise<void> {
  await del(`/tournaments/${tournamentId}`);
}

/**
 * Tournaments Page
 */
export default function TournamentsPage() {
  const queryClient = useQueryClient();
  const [startingId, setStartingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // Fetch tournaments
  const { data: tournaments, isLoading, refetch } = useQuery({
    queryKey: ['tournaments'],
    queryFn: fetchTournaments,
  });

  // Start tournament mutation
  const startMutation = useMutation({
    mutationFn: startTournament,
    onMutate: (tournamentId) => {
      setStartingId(tournamentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
    onSettled: () => {
      setStartingId(null);
    },
  });

  // Delete tournament mutation
  const deleteMutation = useMutation({
    mutationFn: deleteTournament,
    onMutate: (tournamentId) => {
      setDeletingId(tournamentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    },
    onSettled: () => {
      setDeletingId(null);
    },
  });

  const handleStart = (tournamentId: string) => {
    startMutation.mutate(tournamentId);
  };

  const handleDelete = (tournamentId: string) => {
    if (window.confirm('Are you sure you want to delete this tournament? This cannot be undone.')) {
      deleteMutation.mutate(tournamentId);
    }
  };

  // Separate tournaments by state
  const activeTournaments = tournaments?.filter(t => t.state === 'IN_PROGRESS' || t.state === 'LOBBY') || [];
  const draftTournaments = tournaments?.filter(t => t.state === 'DRAFT') || [];
  const completedTournaments = tournaments?.filter(t => t.state === 'COMPLETED') || [];

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
              Tournaments
            </h1>
            <p className="text-body text-[var(--text-secondary)] mt-1">
              Create and manage multi-round quiz tournaments
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              leftIcon={<RefreshIcon />}
            >
              Refresh
            </Button>
            <Link href="/admin/tournaments/new">
              <Button variant="primary" leftIcon={<PlusIcon />}>
                New Tournament
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <TournamentCardSkeleton key={i} />
          ))}
        </div>
      ) : !tournaments?.length ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {/* Active Tournaments */}
          {activeTournaments.length > 0 && (
            <section>
              <h2 className="text-h2 font-semibold text-[var(--text-primary)] mb-4">
                Active Tournaments ({activeTournaments.length})
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AnimatePresence mode="popLayout">
                  {activeTournaments.map((tournament) => (
                    <TournamentCard
                      key={tournament.tournamentId}
                      tournament={tournament}
                      onStart={handleStart}
                      onDelete={handleDelete}
                      isStarting={startingId === tournament.tournamentId}
                      isDeleting={deletingId === tournament.tournamentId}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          {/* Draft Tournaments */}
          {draftTournaments.length > 0 && (
            <section>
              <h2 className="text-h2 font-semibold text-[var(--text-primary)] mb-4">
                Draft Tournaments ({draftTournaments.length})
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AnimatePresence mode="popLayout">
                  {draftTournaments.map((tournament) => (
                    <TournamentCard
                      key={tournament.tournamentId}
                      tournament={tournament}
                      onStart={handleStart}
                      onDelete={handleDelete}
                      isStarting={startingId === tournament.tournamentId}
                      isDeleting={deletingId === tournament.tournamentId}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          {/* Completed Tournaments */}
          {completedTournaments.length > 0 && (
            <section>
              <h2 className="text-h2 font-semibold text-[var(--text-muted)] mb-4">
                Completed Tournaments ({completedTournaments.length})
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 opacity-75">
                <AnimatePresence mode="popLayout">
                  {completedTournaments.slice(0, 6).map((tournament) => (
                    <TournamentCard
                      key={tournament.tournamentId}
                      tournament={tournament}
                      onStart={handleStart}
                      onDelete={handleDelete}
                      isStarting={startingId === tournament.tournamentId}
                      isDeleting={deletingId === tournament.tournamentId}
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
