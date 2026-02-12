/**
 * Tournament Bracket Component
 * 
 * Displays tournament rounds with participant progression:
 * - Visual bracket showing rounds and participants
 * - Current round indicator
 * - Qualified/eliminated status per participant
 * - Score display
 * 
 * Requirements: 3.6, 3.9
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Round state type
 */
type RoundState = 'PENDING' | 'ACTIVE' | 'COMPLETED';

/**
 * Bracket participant
 */
export interface BracketParticipant {
  participantId: string;
  nickname: string;
  score: number;
  isQualified: boolean;
  isEliminated: boolean;
}

/**
 * Bracket round
 */
export interface BracketRound {
  roundNumber: number;
  state: RoundState;
  participants: BracketParticipant[];
}

/**
 * Tournament bracket data
 */
export interface TournamentBracketData {
  tournamentId: string;
  title: string;
  state: 'DRAFT' | 'LOBBY' | 'IN_PROGRESS' | 'COMPLETED';
  currentRoundIndex: number;
  rounds: BracketRound[];
}

/**
 * Component props
 */
export interface TournamentBracketProps {
  bracket: TournamentBracketData;
  className?: string;
  compact?: boolean;
  showTitle?: boolean;
  maxParticipantsPerRound?: number;
}

/**
 * State badge colors
 */
const roundStateStyles: Record<RoundState, string> = {
  PENDING: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  ACTIVE: 'bg-success/10 text-success',
  COMPLETED: 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]',
};

const roundStateLabels: Record<RoundState, string> = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
};

/**
 * Trophy icon for qualified participants
 */
function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

/**
 * X icon for eliminated participants
 */
function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * Participant row component
 */
function ParticipantRow({
  participant,
  rank,
  compact,
}: {
  participant: BracketParticipant;
  rank: number;
  compact?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.02 }}
      className={cn(
        'flex items-center justify-between rounded-md transition-colors',
        compact ? 'px-2 py-1.5' : 'px-3 py-2',
        participant.isEliminated 
          ? 'bg-error/5 opacity-60' 
          : participant.isQualified 
            ? 'bg-success/5' 
            : 'bg-[var(--neu-surface)]'
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn(
          'flex-shrink-0 font-mono',
          compact ? 'text-caption' : 'text-body-sm',
          'text-[var(--text-muted)]'
        )}>
          #{rank}
        </span>
        <span className={cn(
          'truncate',
          compact ? 'text-caption max-w-[80px]' : 'text-body-sm max-w-[120px]',
          participant.isEliminated ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'
        )}>
          {participant.nickname}
        </span>
      </div>
      
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className={cn(
          'font-semibold',
          compact ? 'text-caption' : 'text-body-sm',
          'text-primary'
        )}>
          {participant.score}
        </span>
        {participant.isQualified && (
          <TrophyIcon className="text-success" />
        )}
        {participant.isEliminated && (
          <XIcon className="text-error" />
        )}
      </div>
    </motion.div>
  );
}

/**
 * Round column component
 */
function RoundColumn({
  round,
  isCurrentRound,
  compact,
  maxParticipants,
}: {
  round: BracketRound;
  isCurrentRound: boolean;
  compact?: boolean;
  maxParticipants?: number;
}) {
  const displayParticipants = maxParticipants 
    ? round.participants.slice(0, maxParticipants)
    : round.participants;
  const hiddenCount = maxParticipants 
    ? Math.max(0, round.participants.length - maxParticipants)
    : 0;

  return (
    <div className={cn(
      'flex-shrink-0 rounded-lg',
      compact ? 'w-48' : 'w-56',
      isCurrentRound && 'ring-2 ring-primary'
    )}>
      {/* Round header */}
      <div className={cn(
        'flex items-center justify-between mb-2',
        compact ? 'px-2' : 'px-3'
      )}>
        <h4 className={cn(
          'font-semibold text-[var(--text-primary)]',
          compact ? 'text-caption' : 'text-body-sm'
        )}>
          Round {round.roundNumber}
        </h4>
        <span className={cn(
          'px-1.5 py-0.5 rounded text-caption font-medium',
          roundStateStyles[round.state]
        )}>
          {roundStateLabels[round.state]}
        </span>
      </div>

      {/* Participants */}
      <div className={cn(
        'neu-pressed rounded-lg overflow-hidden',
        compact ? 'p-1.5' : 'p-2'
      )}>
        {round.participants.length === 0 ? (
          <div className={cn(
            'text-center text-[var(--text-muted)]',
            compact ? 'py-4 text-caption' : 'py-6 text-body-sm'
          )}>
            No participants yet
          </div>
        ) : (
          <div className={cn('space-y-1', compact ? 'space-y-0.5' : '')}>
            {displayParticipants.map((participant, idx) => (
              <ParticipantRow
                key={participant.participantId}
                participant={participant}
                rank={idx + 1}
                compact={compact}
              />
            ))}
            {hiddenCount > 0 && (
              <div className={cn(
                'text-center text-[var(--text-muted)]',
                compact ? 'py-1 text-caption' : 'py-2 text-body-sm'
              )}>
                +{hiddenCount} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Tournament Bracket Component
 */
export function TournamentBracket({
  bracket,
  className,
  compact = false,
  showTitle = true,
  maxParticipantsPerRound,
}: TournamentBracketProps) {
  if (bracket.rounds.length === 0) {
    return (
      <div className={cn('neu-pressed rounded-lg p-8 text-center', className)}>
        <p className="text-body text-[var(--text-muted)]">
          No bracket data available. Start the tournament to see participants.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('', className)}>
      {showTitle && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-h3 font-semibold text-[var(--text-primary)]">
            {bracket.title}
          </h3>
          <span className={cn(
            'px-2 py-1 rounded-full text-caption font-medium',
            bracket.state === 'IN_PROGRESS' 
              ? 'bg-success/10 text-success' 
              : bracket.state === 'COMPLETED'
                ? 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                : 'bg-info/10 text-info'
          )}>
            {bracket.state.replace('_', ' ')}
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className={cn(
          'flex min-w-max',
          compact ? 'gap-3 p-2' : 'gap-4 p-3'
        )}>
          {bracket.rounds.map((round) => (
            <RoundColumn
              key={round.roundNumber}
              round={round}
              isCurrentRound={round.roundNumber === bracket.currentRoundIndex + 1}
              compact={compact}
              maxParticipants={maxParticipantsPerRound}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default TournamentBracket;
