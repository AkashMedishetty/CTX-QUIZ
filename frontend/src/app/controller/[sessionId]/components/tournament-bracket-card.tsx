/**
 * Tournament Bracket Card Component
 * 
 * Displays tournament bracket in the Controller Panel when
 * the session is part of a tournament.
 * 
 * Requirements: 3.6, 3.7
 */

'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { TournamentBracket, type TournamentBracketData } from '@/components/tournament-bracket';
import { get } from '@/lib/api-client';

/**
 * Props for TournamentBracketCard
 */
export interface TournamentBracketCardProps {
  tournamentId: string | null;
  sessionId: string;
}

/**
 * Fetch tournament bracket
 */
async function fetchBracket(tournamentId: string): Promise<TournamentBracketData> {
  const response = await get<{ success: boolean; bracket: TournamentBracketData }>(
    `/tournaments/${tournamentId}/bracket`
  );
  return response.bracket;
}

/**
 * Tournament Bracket Card Component
 */
export function TournamentBracketCard({ tournamentId, sessionId: _sessionId }: TournamentBracketCardProps) {
  // Don't render if not part of a tournament
  if (!tournamentId) {
    return null;
  }

  // Fetch bracket data
  const { data: bracket, isLoading, error } = useQuery({
    queryKey: ['tournament-bracket', tournamentId],
    queryFn: () => fetchBracket(tournamentId),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="neu-raised rounded-lg p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
            Tournament Bracket
          </h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </motion.div>
    );
  }

  if (error || !bracket) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="neu-raised rounded-lg p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
            Tournament Bracket
          </h2>
        </div>
        <div className="neu-pressed rounded-lg p-6 text-center">
          <p className="text-body text-[var(--text-muted)]">
            Unable to load tournament bracket
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised rounded-lg p-6"
    >
      <TournamentBracket
        bracket={bracket}
        compact={true}
        showTitle={true}
        maxParticipantsPerRound={10}
      />
    </motion.div>
  );
}

export default TournamentBracketCard;
