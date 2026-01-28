/**
 * Leaderboard Card - Full participant leaderboard display
 * 
 * Displays the complete leaderboard with:
 * - Real-time updates after each question
 * - Rank, nickname, score, streak display
 * - Top 3 highlighting with gold, silver, bronze
 * - Animated rank changes
 * - Search/filter functionality
 * - Sort by rank, score, or streak
 * - Virtual scrolling for 500+ participants (using @tanstack/react-virtual)
 * - Neumorphic design following design-system.md
 * 
 * Requirements: 13.7
 */

'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { LeaderboardRow } from './leaderboard-row';
import type { LeaderboardEntry } from '@/lib/socket-client';

/**
 * Sort options for leaderboard
 */
type SortOption = 'rank' | 'score' | 'streak';

/**
 * Extended leaderboard entry with previous values for animations
 */
interface LeaderboardEntryWithHistory extends LeaderboardEntry {
  previousRank?: number;
  previousScore?: number;
}

/**
 * Leaderboard card props
 */
export interface LeaderboardCardProps {
  /** Leaderboard entries from server */
  leaderboard: LeaderboardEntry[];
  /** Whether the leaderboard is currently updating */
  isUpdating?: boolean;
  /** Total participant count */
  participantCount?: number;
  /** Current session state */
  sessionState?: 'LOBBY' | 'ACTIVE_QUESTION' | 'REVEAL' | 'ENDED';
  /** Maximum height for the list (default: 500px) */
  maxHeight?: number;
}

/** Row height for virtual scrolling (in pixels) */
const ROW_HEIGHT = 64;

/** Overscan count - number of items to render outside visible area */
const OVERSCAN_COUNT = 5;

/**
 * Leaderboard Card Component
 */
export function LeaderboardCard({
  leaderboard,
  isUpdating = false,
  participantCount = 0,
  sessionState = 'LOBBY',
  maxHeight = 500,
}: LeaderboardCardProps) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('rank');
  const [previousLeaderboard, setPreviousLeaderboard] = useState<Map<string, LeaderboardEntry>>(new Map());
  
  // Ref for virtual scroll container
  const parentRef = useRef<HTMLDivElement>(null);
  
  // Ref to track previous leaderboard for animations
  const prevLeaderboardRef = useRef<LeaderboardEntry[]>([]);

  // Update previous leaderboard when new data arrives
  useEffect(() => {
    if (leaderboard.length > 0 && prevLeaderboardRef.current.length > 0) {
      const prevMap = new Map<string, LeaderboardEntry>();
      prevLeaderboardRef.current.forEach(entry => {
        prevMap.set(entry.participantId, entry);
      });
      setPreviousLeaderboard(prevMap);
    }
    prevLeaderboardRef.current = leaderboard;
  }, [leaderboard]);

  // Merge current leaderboard with previous values for animations
  const leaderboardWithHistory: LeaderboardEntryWithHistory[] = useMemo(() => {
    return leaderboard.map(entry => {
      const prev = previousLeaderboard.get(entry.participantId);
      return {
        ...entry,
        previousRank: prev?.rank,
        previousScore: prev?.totalScore,
      };
    });
  }, [leaderboard, previousLeaderboard]);

  // Filter and sort leaderboard
  const filteredLeaderboard = useMemo(() => {
    let result = [...leaderboardWithHistory];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(entry =>
        entry.nickname.toLowerCase().includes(query) ||
        entry.participantId.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    switch (sortBy) {
      case 'score':
        result.sort((a, b) => b.totalScore - a.totalScore);
        break;
      case 'streak':
        result.sort((a, b) => (b.streakCount || 0) - (a.streakCount || 0));
        break;
      case 'rank':
      default:
        result.sort((a, b) => a.rank - b.rank);
        break;
    }

    return result;
  }, [leaderboardWithHistory, searchQuery, sortBy]);

  // Calculate stats
  const stats = useMemo(() => {
    if (leaderboard.length === 0) {
      return { topScore: 0, avgScore: 0, totalWithStreak: 0 };
    }

    const topScore = Math.max(...leaderboard.map(e => e.totalScore));
    const avgScore = Math.round(
      leaderboard.reduce((sum, e) => sum + e.totalScore, 0) / leaderboard.length
    );
    const totalWithStreak = leaderboard.filter(e => (e.streakCount || 0) >= 2).length;

    return { topScore, avgScore, totalWithStreak };
  }, [leaderboard]);

  // Virtual scrolling setup - only render visible items for performance with 500+ participants
  const rowVirtualizer = useVirtualizer({
    count: filteredLeaderboard.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN_COUNT,
  });

  // Handle sort change
  const handleSortChange = useCallback((option: SortOption) => {
    setSortBy(option);
  }, []);

  // Check if leaderboard has data
  const hasData = leaderboard.length > 0;
  const showEmptyState = !hasData && sessionState !== 'LOBBY';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
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
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-h3 font-semibold text-[var(--text-primary)]">
                Leaderboard
              </h3>
              <p className="text-caption text-[var(--text-muted)]">
                Real-time rankings
              </p>
            </div>
          </div>

          {/* Updating indicator */}
          <AnimatePresence>
            {isUpdating && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10"
              >
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-caption font-medium text-primary">
                  Updating...
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Stats Row */}
        {hasData && (
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10">
              <svg
                className="w-3.5 h-3.5 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              <span className="text-caption font-medium text-primary">
                Top: {stats.topScore.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--text-muted)]/10">
              <svg
                className="w-3.5 h-3.5 text-[var(--text-muted)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <span className="text-caption font-medium text-[var(--text-muted)]">
                Avg: {stats.avgScore.toLocaleString()}
              </span>
            </div>
            {stats.totalWithStreak > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warning/10">
                <span className="text-sm">🔥</span>
                <span className="text-caption font-medium text-warning">
                  {stats.totalWithStreak} on streak
                </span>
              </div>
            )}
          </div>
        )}

        {/* Search and Sort */}
        {hasData && (
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="flex-1">
              <Input
                placeholder="Search participants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="sm"
                leftIcon={
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                }
              />
            </div>

            {/* Sort Buttons */}
            <div className="flex gap-1 p-1 rounded-lg bg-[var(--neu-surface)]">
              {(['rank', 'score', 'streak'] as SortOption[]).map((option) => (
                <button
                  key={option}
                  onClick={() => handleSortChange(option)}
                  className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all ${
                    sortBy === option
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Leaderboard List - Virtualized for 500+ participants */}
      <div 
        ref={parentRef}
        className="overflow-y-auto"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        {filteredLeaderboard.length > 0 ? (
          <div
            className="p-2"
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const entry = filteredLeaderboard[virtualRow.index];
              return (
                <div
                  key={entry.participantId}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <LeaderboardRow
                    rank={entry.rank}
                    previousRank={entry.previousRank}
                    participantId={entry.participantId}
                    nickname={entry.nickname}
                    totalScore={entry.totalScore}
                    previousScore={entry.previousScore}
                    lastQuestionScore={entry.lastQuestionScore}
                    streakCount={entry.streakCount}
                    animationDelay={0}
                  />
                </div>
              );
            })}
          </div>
        ) : showEmptyState ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-12 px-6"
          >
            <div className="w-16 h-16 rounded-full bg-[var(--neu-surface)] flex items-center justify-center mb-4">
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
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <p className="text-body text-[var(--text-secondary)] text-center">
              {searchQuery
                ? 'No participants match your search'
                : 'No scores yet'}
            </p>
            <p className="text-body-sm text-[var(--text-muted)] text-center mt-1">
              {searchQuery
                ? 'Try a different search term'
                : 'Scores will appear after the first question'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-3 text-body-sm text-primary hover:underline"
              >
                Clear search
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-12 px-6"
          >
            <div className="w-16 h-16 rounded-full bg-[var(--neu-surface)] flex items-center justify-center mb-4">
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
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-body text-[var(--text-secondary)] text-center">
              Waiting for quiz to start
            </p>
            <p className="text-body-sm text-[var(--text-muted)] text-center mt-1">
              {participantCount > 0
                ? `${participantCount} participant${participantCount !== 1 ? 's' : ''} ready`
                : 'Participants will appear here'}
            </p>
          </motion.div>
        )}
      </div>

      {/* Footer with count */}
      {filteredLeaderboard.length > 0 && (
        <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--neu-surface)]">
          <p className="text-caption text-[var(--text-muted)]">
            Showing {filteredLeaderboard.length} of {leaderboard.length} participants
            {searchQuery && ` matching "${searchQuery}"`}
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default LeaderboardCard;
