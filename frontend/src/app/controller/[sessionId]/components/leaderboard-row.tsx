/**
 * Leaderboard Row - Individual participant row in the leaderboard
 * 
 * Displays participant rank, nickname, score, and streak with:
 * - Medal icons for top 3 (gold, silver, bronze)
 * - Animated score changes with +/- indicators
 * - Streak count with fire icon
 * - Neumorphic design following design-system.md
 * - React.memo for performance optimization (prevents unnecessary re-renders)
 * 
 * Requirements: 13.7, 14.1
 */

'use client';

import { useState, useEffect, useRef, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Leaderboard row props
 */
export interface LeaderboardRowProps {
  /** Participant rank (1-indexed) */
  rank: number;
  /** Previous rank for animation */
  previousRank?: number;
  /** Participant ID */
  participantId: string;
  /** Participant nickname */
  nickname: string;
  /** Total score */
  totalScore: number;
  /** Previous score for change indicator */
  previousScore?: number;
  /** Score from last question */
  lastQuestionScore?: number;
  /** Current streak count */
  streakCount?: number;
  /** Whether this row is highlighted (e.g., current user) */
  isHighlighted?: boolean;
  /** Animation delay for staggered entrance */
  animationDelay?: number;
}

/**
 * Medal component for top 3 ranks
 */
function RankMedal({ rank }: { rank: number }) {
  const medals = {
    1: {
      bg: 'bg-gradient-to-br from-yellow-300 to-yellow-500',
      border: 'border-yellow-400',
      shadow: 'shadow-yellow-400/30',
      icon: '🥇',
    },
    2: {
      bg: 'bg-gradient-to-br from-gray-300 to-gray-400',
      border: 'border-gray-400',
      shadow: 'shadow-gray-400/30',
      icon: '🥈',
    },
    3: {
      bg: 'bg-gradient-to-br from-amber-500 to-amber-700',
      border: 'border-amber-600',
      shadow: 'shadow-amber-600/30',
      icon: '🥉',
    },
  };

  const medal = medals[rank as keyof typeof medals];
  if (!medal) return null;

  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`w-8 h-8 rounded-full ${medal.bg} ${medal.shadow} shadow-lg flex items-center justify-center text-lg`}
    >
      {medal.icon}
    </motion.div>
  );
}

/**
 * Score change indicator
 */
function ScoreChangeIndicator({ change }: { change: number }) {
  if (change === 0) return null;

  const isPositive = change > 0;

  return (
    <motion.span
      initial={{ opacity: 0, y: isPositive ? 10 : -10, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: isPositive ? -10 : 10, scale: 0.8 }}
      className={`text-caption font-semibold ${
        isPositive ? 'text-success' : 'text-error'
      }`}
    >
      {isPositive ? '+' : ''}{change.toLocaleString()}
    </motion.span>
  );
}

/**
 * Rank change indicator (arrow up/down)
 */
function RankChangeIndicator({ currentRank, previousRank }: { currentRank: number; previousRank?: number }) {
  if (previousRank === undefined || previousRank === currentRank) return null;

  const improved = currentRank < previousRank;
  const change = Math.abs(previousRank - currentRank);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`flex items-center gap-0.5 text-caption font-medium ${
        improved ? 'text-success' : 'text-error'
      }`}
    >
      <svg
        className={`w-3 h-3 ${improved ? '' : 'rotate-180'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7"
        />
      </svg>
      <span>{change}</span>
    </motion.div>
  );
}

/**
 * Streak indicator with fire icon
 */
function StreakIndicator({ count }: { count: number }) {
  if (count < 2) return null;

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10"
    >
      <motion.span
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
        className="text-sm"
      >
        🔥
      </motion.span>
      <span className="text-caption font-semibold text-warning">
        {count}
      </span>
    </motion.div>
  );
}

/**
 * Leaderboard Row Component
 * 
 * Memoized to prevent unnecessary re-renders when parent updates
 * but this row's props haven't changed.
 */
export const LeaderboardRow = memo(function LeaderboardRow({
  rank,
  previousRank,
  participantId: _participantId,
  nickname,
  totalScore,
  previousScore,
  lastQuestionScore,
  streakCount = 0,
  isHighlighted = false,
  animationDelay = 0,
}: LeaderboardRowProps) {
  const [showScoreChange, setShowScoreChange] = useState(false);
  const prevScoreRef = useRef(previousScore);
  const scoreChange = previousScore !== undefined ? totalScore - previousScore : 0;

  // Show score change animation when score updates
  useEffect(() => {
    if (previousScore !== undefined && previousScore !== prevScoreRef.current) {
      setShowScoreChange(true);
      const timer = setTimeout(() => setShowScoreChange(false), 3000);
      prevScoreRef.current = previousScore;
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [previousScore, totalScore]);

  const isTopThree = rank <= 3;

  // Memoize formatted score to avoid recalculation on every render
  const formattedScore = useMemo(() => totalScore.toLocaleString(), [totalScore]);
  const formattedLastQuestionScore = useMemo(
    () => lastQuestionScore !== undefined && lastQuestionScore > 0 
      ? `+${lastQuestionScore.toLocaleString()} last Q` 
      : null,
    [lastQuestionScore]
  );

  // Memoize avatar initial
  const avatarInitial = useMemo(() => nickname.charAt(0).toUpperCase(), [nickname]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ 
        delay: animationDelay,
        layout: { type: 'spring', stiffness: 300, damping: 30 }
      }}
      className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
        isHighlighted
          ? 'bg-primary/10 border border-primary/20'
          : isTopThree
          ? 'bg-[var(--neu-surface)]'
          : 'hover:bg-[var(--neu-surface)]'
      }`}
    >
      {/* Rank */}
      <div className="flex items-center gap-2 w-16">
        {isTopThree ? (
          <RankMedal rank={rank} />
        ) : (
          <div className="w-8 h-8 rounded-full bg-[var(--neu-surface)] flex items-center justify-center">
            <span className="text-body-sm font-semibold text-[var(--text-secondary)]">
              {rank}
            </span>
          </div>
        )}
        <RankChangeIndicator currentRank={rank} previousRank={previousRank} />
      </div>

      {/* Avatar and Nickname */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          isTopThree
            ? rank === 1
              ? 'bg-yellow-100 text-yellow-700'
              : rank === 2
              ? 'bg-gray-100 text-gray-700'
              : 'bg-amber-100 text-amber-700'
            : 'bg-primary/10 text-primary'
        }`}>
          <span className="text-body font-semibold">
            {avatarInitial}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-[var(--text-primary)] truncate">
            {nickname}
          </p>
          {/* Streak indicator */}
          <div className="flex items-center gap-2 mt-0.5">
            <StreakIndicator count={streakCount} />
          </div>
        </div>
      </div>

      {/* Score */}
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-2">
          <motion.span
            key={totalScore}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            className={`text-body-lg font-bold ${
              isTopThree ? 'text-primary' : 'text-[var(--text-primary)]'
            }`}
          >
            {formattedScore}
          </motion.span>
          <AnimatePresence>
            {showScoreChange && scoreChange !== 0 && (
              <ScoreChangeIndicator change={scoreChange} />
            )}
          </AnimatePresence>
        </div>
        {formattedLastQuestionScore && (
          <span className="text-caption text-[var(--text-muted)]">
            {formattedLastQuestionScore}
          </span>
        )}
      </div>
    </motion.div>
  );
});

export default LeaderboardRow;
