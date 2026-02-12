/**
 * Tournament Details Page
 * 
 * Displays tournament details with:
 * - Tournament info and status
 * - Round list with status and actions
 * - Tournament bracket visualization
 * - Actions to start rounds, end rounds
 * 
 * Requirements: 3.1, 3.2, 3.5, 3.6, 3.7
 */

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { get, post } from '@/lib/api-client';

/**
 * Tournament state type
 */
type TournamentState = 'DRAFT' | 'LOBBY' | 'IN_PROGRESS' | 'COMPLETED';
type RoundState = 'PENDING' | 'ACTIVE' | 'COMPLETED';

/**
 * Round data
 */
interface TournamentRound {
  roundNumber: number;
  quizId: string;
  sessionId?: string;
  qualifiedParticipants: string[];
  state: RoundState;
  startedAt?: string;
  endedAt?: string;
}

/**
 * Tournament data
 */
interface Tournament {
  tournamentId: string;
  title: string;
  description?: string;
  state: TournamentState;
  rounds: TournamentRound[];
  progressionRules: {
    type: 'TOP_N' | 'TOP_PERCENTAGE';
    value: number;
    scoreCarryOver: boolean;
  };
  currentRoundIndex: number;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

/**
 * Bracket participant
 */
interface BracketParticipant {
  participantId: string;
  nickname: string;
  score: number;
  isQualified: boolean;
  isEliminated: boolean;
}

/**
 * Bracket round
 */
interface BracketRound {
  roundNumber: number;
  state: RoundState;
  participants: BracketParticipant[];
}

/**
 * Tournament bracket
 */
interface TournamentBracket {
  tournamentId: string;
  title: string;
  state: TournamentState;
  currentRoundIndex: number;
  rounds: BracketRound[];
}

/**
 * State badge colors
 */
const stateBadgeStyles: Record<TournamentState | RoundState, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  LOBBY: 'bg-info/10 text-info border-info/20',
  IN_PROGRESS: 'bg-success/10 text-success border-success/20',
  COMPLETED: 'bg-[var(--text-muted)]/10 text-[var(--text-muted)] border-[var(--text-muted)]/20',
  PENDING: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  ACTIVE: 'bg-success/10 text-success border-success/20',
};

const stateLabels: Record<TournamentState | RoundState, string> = {
  DRAFT: 'Draft',
  LOBBY: 'Lobby',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  PENDING: 'Pending',
  ACTIVE: 'Active',
};


/**
 * Icon components
 */
function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
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

function StopIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
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

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

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
 * Round Card Component
 */
function RoundCard({
  round,
  tournamentState,
  currentRoundIndex,
  onStartRound,
  onEndRound,
  isStarting,
  isEnding,
}: {
  round: TournamentRound;
  tournamentState: TournamentState;
  currentRoundIndex: number;
  onStartRound: (roundNumber: number) => void;
  onEndRound: (roundNumber: number) => void;
  isStarting: boolean;
  isEnding: boolean;
}) {
  const isCurrentRound = round.roundNumber === currentRoundIndex + 1;
  const canStart = round.state === 'PENDING' && 
    (tournamentState === 'LOBBY' || tournamentState === 'IN_PROGRESS') &&
    (round.roundNumber === 1 || round.qualifiedParticipants.length > 0);
  const canEnd = round.state === 'ACTIVE';

  return (
    <div className={`neu-raised rounded-lg p-4 ${isCurrentRound ? 'ring-2 ring-primary' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-body-sm font-semibold text-primary">
              {round.roundNumber}
            </span>
          </div>
          <div>
            <h3 className="text-body font-semibold text-[var(--text-primary)]">
              Round {round.roundNumber}
            </h3>
            {round.startedAt && (
              <p className="text-caption text-[var(--text-muted)]">
                Started {formatDate(round.startedAt)}
              </p>
            )}
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-caption font-medium border ${stateBadgeStyles[round.state]}`}>
          {stateLabels[round.state]}
        </span>
      </div>

      {round.qualifiedParticipants.length > 0 && (
        <p className="text-body-sm text-[var(--text-secondary)] mb-3">
          {round.qualifiedParticipants.length} qualified participants
        </p>
      )}

      <div className="flex gap-2">
        {round.sessionId && (
          <Link href={`/controller/${round.sessionId}`} className="flex-1">
            <Button variant="secondary" size="sm" fullWidth>
              Open Controller
            </Button>
          </Link>
        )}
        {canStart && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onStartRound(round.roundNumber)}
            disabled={isStarting}
            isLoading={isStarting}
            leftIcon={!isStarting ? <PlayIcon /> : undefined}
          >
            Start
          </Button>
        )}
        {canEnd && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEndRound(round.roundNumber)}
            disabled={isEnding}
            isLoading={isEnding}
            className="text-error hover:bg-error/10"
            leftIcon={!isEnding ? <StopIcon /> : undefined}
          >
            End
          </Button>
        )}
      </div>
    </div>
  );
}


/**
 * Tournament Bracket Component
 */
function TournamentBracketView({ bracket }: { bracket: TournamentBracket }) {
  if (bracket.rounds.length === 0) {
    return (
      <div className="neu-pressed rounded-lg p-8 text-center">
        <p className="text-body text-[var(--text-muted)]">
          No bracket data available yet. Start the tournament to see participants.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-6 min-w-max p-4">
        {bracket.rounds.map((round) => (
          <div key={round.roundNumber} className="w-64 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-body font-semibold text-[var(--text-primary)]">
                Round {round.roundNumber}
              </h4>
              <span className={`px-2 py-0.5 rounded text-caption ${stateBadgeStyles[round.state]}`}>
                {stateLabels[round.state]}
              </span>
            </div>
            
            <div className="space-y-2">
              {round.participants.length === 0 ? (
                <div className="neu-pressed rounded-lg p-4 text-center">
                  <p className="text-body-sm text-[var(--text-muted)]">
                    No participants yet
                  </p>
                </div>
              ) : (
                round.participants.map((participant, idx) => (
                  <div
                    key={participant.participantId}
                    className={`neu-pressed rounded-lg p-3 flex items-center justify-between ${
                      participant.isEliminated ? 'opacity-50' : ''
                    } ${participant.isQualified ? 'ring-1 ring-success' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-[var(--text-muted)]">
                        #{idx + 1}
                      </span>
                      <span className="text-body-sm text-[var(--text-primary)] truncate max-w-[120px]">
                        {participant.nickname}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-body-sm font-semibold text-primary">
                        {participant.score}
                      </span>
                      {participant.isQualified && (
                        <TrophyIcon className="text-success" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Fetch tournament details
 */
async function fetchTournament(tournamentId: string): Promise<Tournament> {
  const response = await get<{ success: boolean; tournament: Tournament }>(`/tournaments/${tournamentId}`);
  return response.tournament;
}

/**
 * Fetch tournament bracket
 */
async function fetchBracket(tournamentId: string): Promise<TournamentBracket> {
  const response = await get<{ success: boolean; bracket: TournamentBracket }>(`/tournaments/${tournamentId}/bracket`);
  return response.bracket;
}

/**
 * Tournament Details Page
 */
export default function TournamentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tournamentId = params.tournamentId as string;

  const [startingRound, setStartingRound] = React.useState<number | null>(null);
  const [endingRound, setEndingRound] = React.useState<number | null>(null);

  // Fetch tournament
  const { data: tournament, isLoading, error, refetch } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => fetchTournament(tournamentId),
  });

  // Fetch bracket
  const { data: bracket } = useQuery({
    queryKey: ['tournament-bracket', tournamentId],
    queryFn: () => fetchBracket(tournamentId),
    enabled: !!tournament && tournament.state !== 'DRAFT',
  });

  // Start round mutation
  const startRoundMutation = useMutation({
    mutationFn: (roundNumber: number) => post(`/tournaments/${tournamentId}/rounds/${roundNumber}/start`),
    onMutate: (roundNumber) => setStartingRound(roundNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournament-bracket', tournamentId] });
    },
    onSettled: () => setStartingRound(null),
  });

  // End round mutation
  const endRoundMutation = useMutation({
    mutationFn: (roundNumber: number) => post(`/tournaments/${tournamentId}/rounds/${roundNumber}/end`),
    onMutate: (roundNumber) => setEndingRound(roundNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournament-bracket', tournamentId] });
    },
    onSettled: () => setEndingRound(null),
  });

  // Start tournament mutation
  const startTournamentMutation = useMutation({
    mutationFn: () => post(`/tournaments/${tournamentId}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-body text-error mb-4">Failed to load tournament</p>
        <Button variant="secondary" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <button
          onClick={() => router.push('/admin/tournaments')}
          className="flex items-center gap-2 text-body-sm text-[var(--text-secondary)] hover:text-primary mb-4 transition-colors"
        >
          <ArrowLeftIcon />
          Back to Tournaments
        </button>
        
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-h1 font-semibold text-[var(--text-primary)]">
                {tournament.title}
              </h1>
              <span className={`px-3 py-1 rounded-full text-caption font-medium border ${stateBadgeStyles[tournament.state]}`}>
                {stateLabels[tournament.state]}
              </span>
            </div>
            {tournament.description && (
              <p className="text-body text-[var(--text-secondary)]">
                {tournament.description}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              leftIcon={<RefreshIcon />}
            >
              Refresh
            </Button>
            {tournament.state === 'DRAFT' && tournament.rounds.length > 0 && (
              <Button
                variant="primary"
                onClick={() => startTournamentMutation.mutate()}
                disabled={startTournamentMutation.isPending}
                isLoading={startTournamentMutation.isPending}
                leftIcon={!startTournamentMutation.isPending ? <PlayIcon /> : undefined}
              >
                Start Tournament
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Tournament Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8"
      >
        <div className="neu-raised rounded-lg p-6">
          <h3 className="text-body-sm text-[var(--text-muted)] mb-1">Rounds</h3>
          <p className="text-h2 font-bold text-primary">{tournament.rounds.length}</p>
        </div>
        <div className="neu-raised rounded-lg p-6">
          <h3 className="text-body-sm text-[var(--text-muted)] mb-1">Progression</h3>
          <p className="text-h2 font-bold text-[var(--text-primary)]">
            {tournament.progressionRules.type === 'TOP_N' 
              ? `Top ${tournament.progressionRules.value}` 
              : `Top ${tournament.progressionRules.value}%`}
          </p>
        </div>
        <div className="neu-raised rounded-lg p-6">
          <h3 className="text-body-sm text-[var(--text-muted)] mb-1">Score Carry-Over</h3>
          <p className="text-h2 font-bold text-[var(--text-primary)]">
            {tournament.progressionRules.scoreCarryOver ? 'Yes' : 'No'}
          </p>
        </div>
      </motion.div>

      {/* Rounds */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8"
      >
        <h2 className="text-h2 font-semibold text-[var(--text-primary)] mb-4">
          Rounds
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournament.rounds.map((round) => (
            <RoundCard
              key={round.roundNumber}
              round={round}
              tournamentState={tournament.state}
              currentRoundIndex={tournament.currentRoundIndex}
              onStartRound={(rn) => startRoundMutation.mutate(rn)}
              onEndRound={(rn) => endRoundMutation.mutate(rn)}
              isStarting={startingRound === round.roundNumber}
              isEnding={endingRound === round.roundNumber}
            />
          ))}
        </div>
      </motion.div>

      {/* Bracket */}
      {bracket && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-h2 font-semibold text-[var(--text-primary)] mb-4">
            Tournament Bracket
          </h2>
          <div className="neu-raised rounded-lg p-4">
            <TournamentBracketView bracket={bracket} />
          </div>
        </motion.div>
      )}
    </div>
  );
}
