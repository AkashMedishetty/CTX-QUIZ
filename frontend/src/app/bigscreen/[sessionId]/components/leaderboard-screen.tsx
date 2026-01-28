/**
 * LeaderboardScreen - Big Screen leaderboard display component
 * 
 * Displays the leaderboard for the Big Screen with:
 * - Top 10 participants display
 * - Animated rank changes with smooth transitions
 * - Special styling for top 3 (gold, silver, bronze)
 * - Rank change indicators (up/down arrows)
 * - Score display with points gained this round
 * - Streak indicators for consecutive correct answers
 * - Framer Motion layout animations for reordering
 * - Celebration effects when entering top 3
 * - React.memo for performance optimization
 * 
 * Responsive Design:
 * - Optimized for 16:9 and 4:3 aspect ratios
 * - Supports 1920x1080, 1280x720, 1024x768 resolutions
 * - Uses CSS Grid for layouts
 * 
 * Requirements: 12.7, 12.9, 12.10, 14.1
 */

'use client';

import { useMemo, useRef, useEffect, useState, memo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';

/**
 * Leaderboard entry interface
 */
export interface LeaderboardEntry {
  participantId: string;
  nickname: string;
  totalScore: number;
  rank: number;
  lastQuestionScore?: number;
  streakCount?: number;
}

/**
 * LeaderboardScreen props
 */
export interface LeaderboardScreenProps {
  /** Array of leaderboard entries */
  leaderboard: LeaderboardEntry[];
  /** Maximum number of entries to display (default: 10) */
  maxDisplay?: number;
  /** Whether to show rank change indicators */
  showRankChange?: boolean;
  /** Whether to show last question score */
  showLastScore?: boolean;
  /** Whether the socket is connected */
  isConnected: boolean;
}

/**
 * Medal emojis for top 3
 */
const MEDALS: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
};

/**
 * Medal colors for top 3
 */
const MEDAL_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  1: {
    bg: 'bg-gradient-to-br from-yellow-400/20 to-yellow-600/10',
    border: 'ring-2 ring-yellow-400/50',
    text: 'text-yellow-500',
  },
  2: {
    bg: 'bg-gradient-to-br from-gray-300/20 to-gray-400/10',
    border: 'ring-2 ring-gray-400/50',
    text: 'text-gray-400',
  },
  3: {
    bg: 'bg-gradient-to-br from-amber-600/20 to-amber-700/10',
    border: 'ring-2 ring-amber-600/50',
    text: 'text-amber-600',
  },
};

/**
 * Format score for display with thousands separator
 */
function formatScore(score: number): string {
  return score.toLocaleString();
}

/**
 * Mini confetti burst for top 3 celebration
 */
function MiniConfetti({ show }: { show: boolean }) {
  const colors = ['#FFD700', '#22C55E', '#3B82F6', '#A855F7', '#F59E0B'];
  const particles = useMemo(() => 
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      color: colors[i % colors.length],
      angle: (i / 12) * 360,
      distance: 40 + Math.random() * 30,
      size: 4 + Math.random() * 4,
      delay: Math.random() * 0.2,
    })),
  []);

  if (!show) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
          initial={{ 
            x: 0, 
            y: 0, 
            scale: 0,
            opacity: 1,
          }}
          animate={{ 
            x: Math.cos((p.angle * Math.PI) / 180) * p.distance,
            y: Math.sin((p.angle * Math.PI) / 180) * p.distance,
            scale: [0, 1, 0.5],
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 0.8,
            delay: p.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Sparkle effect for top 3 entries
 */
function TopThreeSparkle({ rank }: { rank: number }) {
  const sparkleColor = rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : '#CD7F32';
  
  return (
    <motion.div
      className="absolute -top-1 -right-1 w-3 h-3 md:w-4 md:h-4"
      animate={{
        scale: [1, 1.3, 1],
        opacity: [0.7, 1, 0.7],
        rotate: [0, 180, 360],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      <svg viewBox="0 0 24 24" fill={sparkleColor}>
        <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
      </svg>
    </motion.div>
  );
}

/**
 * LeaderboardScreen component
 * 
 * Displays an animated leaderboard optimized for projector display.
 * Uses Framer Motion's layout animations for smooth rank changes.
 * Responsive design for multiple screen sizes.
 */
export function LeaderboardScreen({
  leaderboard,
  maxDisplay = 10,
  showRankChange = true,
  showLastScore = true,
  isConnected,
}: LeaderboardScreenProps) {
  // Track previous ranks for change indicators
  const previousRanksRef = useRef<Map<string, number>>(new Map());
  const [rankChanges, setRankChanges] = useState<Map<string, number>>(new Map());
  const [celebratingIds, setCelebratingIds] = useState<Set<string>>(new Set());

  // Get top N entries
  const displayedEntries = useMemo(() => {
    return leaderboard
      .slice(0, maxDisplay)
      .sort((a, b) => a.rank - b.rank);
  }, [leaderboard, maxDisplay]);

  // Calculate rank changes when leaderboard updates
  useEffect(() => {
    const newRankChanges = new Map<string, number>();
    const newCelebrating = new Set<string>();
    
    displayedEntries.forEach((entry) => {
      const previousRank = previousRanksRef.current.get(entry.participantId);
      if (previousRank !== undefined && previousRank !== entry.rank) {
        // Positive = moved up (rank decreased), Negative = moved down (rank increased)
        const change = previousRank - entry.rank;
        newRankChanges.set(entry.participantId, change);
        
        // Trigger celebration if moved into top 3
        if (entry.rank <= 3 && previousRank > 3) {
          newCelebrating.add(entry.participantId);
        }
      }
    });

    setRankChanges(newRankChanges);
    setCelebratingIds(newCelebrating);

    // Update previous ranks
    const newPreviousRanks = new Map<string, number>();
    displayedEntries.forEach((entry) => {
      newPreviousRanks.set(entry.participantId, entry.rank);
    });
    previousRanksRef.current = newPreviousRanks;

    // Clear rank changes after animation
    const timer = setTimeout(() => {
      setRankChanges(new Map());
    }, 3000);
    
    // Clear celebrations after animation
    const celebrationTimer = setTimeout(() => {
      setCelebratingIds(new Set());
    }, 1500);

    return () => {
      clearTimeout(timer);
      clearTimeout(celebrationTimer);
    };
  }, [displayedEntries]);

  return (
    <div className="min-h-screen bg-[var(--neu-bg)] flex flex-col">
      {/* Header - Responsive padding and sizing */}
      <header className="py-4 px-4 md:py-5 md:px-8 lg:py-6 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.0, 0.0, 0.2, 1] }}
          className="flex items-center justify-between"
        >
          {/* Title - Responsive sizing */}
          <div className="flex items-center gap-2 md:gap-3 lg:gap-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-3xl md:text-4xl lg:text-display-xl"
            >
              🏆
            </motion.div>
            <h1 className="text-2xl md:text-3xl lg:text-display font-bold text-[var(--text-primary)]">
              LEADERBOARD
            </h1>
          </div>

          {/* Connection Status - Responsive sizing */}
          <div className="flex items-center gap-1.5 md:gap-2 neu-raised-sm rounded-lg px-2 py-1 md:px-3 md:py-1.5 lg:px-4 lg:py-2">
            <div
              className={`w-2 h-2 md:w-2.5 md:h-2.5 lg:w-3 lg:h-3 rounded-full ${
                isConnected ? 'bg-success animate-pulse' : 'bg-error'
              }`}
            />
            <span className="text-xs md:text-sm lg:text-body-sm text-[var(--text-muted)]">
              {isConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
        </motion.div>
      </header>

      {/* Main Content - Responsive padding */}
      <main className="flex-1 px-4 pb-4 md:px-8 md:pb-6 lg:px-12 lg:pb-8 overflow-hidden">
        {displayedEntries.length === 0 ? (
          <EmptyLeaderboard />
        ) : (
          <LayoutGroup>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="space-y-2 md:space-y-2.5 lg:space-y-3"
            >
              <AnimatePresence mode="popLayout">
                {displayedEntries.map((entry, index) => (
                  <LeaderboardRow
                    key={entry.participantId}
                    entry={entry}
                    index={index}
                    rankChange={rankChanges.get(entry.participantId) || 0}
                    showRankChange={showRankChange}
                    showLastScore={showLastScore}
                    isCelebrating={celebratingIds.has(entry.participantId)}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </LayoutGroup>
        )}
      </main>

      {/* Footer - Responsive padding */}
      <footer className="py-2 px-4 md:py-3 md:px-8 lg:py-4 lg:px-12 border-t border-[var(--border)]">
        <div className="flex items-center justify-between text-xs md:text-sm lg:text-body text-[var(--text-muted)]">
          <span>
            A product of{' '}
            <a
              href="https://ctx.works"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              ctx.works
            </a>
          </span>
          <span>
            Powered by{' '}
            <a
              href="https://purplehatevents.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-secondary)] hover:underline"
            >
              PurpleHat Events
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

/**
 * LeaderboardRow - Individual leaderboard entry row
 * Responsive sizing for different screen sizes
 * Enhanced with dramatic rank change animations
 * Memoized to prevent unnecessary re-renders
 */
interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  index: number;
  rankChange: number;
  showRankChange: boolean;
  showLastScore: boolean;
  isCelebrating: boolean;
}

const LeaderboardRow = memo(function LeaderboardRow({
  entry,
  index,
  rankChange,
  showRankChange,
  showLastScore,
  isCelebrating,
}: LeaderboardRowProps) {
  const isTopThree = entry.rank <= 3;
  const medalColors = isTopThree ? MEDAL_COLORS[entry.rank] : null;
  const medal = MEDALS[entry.rank];
  const hasStreak = (entry.streakCount ?? 0) >= 3;
  const movedUp = rankChange > 0;

  // Memoize formatted score
  const formattedLastScore = useMemo(
    () => entry.lastQuestionScore !== undefined && entry.lastQuestionScore > 0
      ? `+${formatScore(entry.lastQuestionScore)}`
      : null,
    [entry.lastQuestionScore]
  );

  return (
    <motion.div
      layout
      layoutId={entry.participantId}
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ 
        opacity: 1, 
        x: 0, 
        scale: 1,
        // Subtle bounce when moving up
        y: movedUp ? [0, -8, 0] : 0,
      }}
      exit={{ opacity: 0, x: -100, scale: 0.9 }}
      transition={{
        layout: { 
          type: 'spring', 
          stiffness: 350, 
          damping: 30,
          mass: 0.8,
        },
        opacity: { duration: 0.3 },
        x: { duration: 0.4, delay: index * 0.03 },
        y: { duration: 0.4, delay: 0.1 },
      }}
      className={`
        relative rounded-lg md:rounded-xl p-3 md:p-4 lg:p-5 flex items-center gap-3 md:gap-4 lg:gap-6
        neu-raised transition-all duration-300 overflow-hidden
        ${medalColors?.bg || ''}
        ${medalColors?.border || ''}
      `}
    >
      {/* Celebration confetti for entering top 3 */}
      <MiniConfetti show={isCelebrating} />
      
      {/* Sparkle effect for top 3 */}
      {isTopThree && <TopThreeSparkle rank={entry.rank} />}
      
      {/* Moving up glow effect */}
      {movedUp && rankChange >= 2 && (
        <motion.div
          className="absolute inset-0 bg-success/10 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.3, 0] }}
          transition={{ duration: 1 }}
        />
      )}

      {/* Rank - Responsive sizing */}
      <div className="flex items-center gap-2 md:gap-2.5 lg:gap-3 min-w-[60px] md:min-w-[80px] lg:min-w-[100px]">
        {medal ? (
          <motion.span
            initial={{ scale: 0, rotate: -180 }}
            animate={{ 
              scale: 1, 
              rotate: 0,
              // Bounce animation for top 3
              y: isTopThree ? [0, -3, 0] : 0,
            }}
            transition={{ 
              type: 'spring', 
              stiffness: 400, 
              damping: 15, 
              delay: 0.2,
              y: { 
                duration: 2, 
                repeat: Infinity, 
                ease: 'easeInOut',
                delay: entry.rank * 0.3,
              },
            }}
            className="text-2xl md:text-3xl lg:text-display"
          >
            {medal}
          </motion.span>
        ) : (
          <motion.div 
            className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-md md:rounded-lg neu-raised-sm flex items-center justify-center"
            animate={movedUp ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            <AnimatePresence mode="popLayout">
              <motion.span 
                key={entry.rank}
                initial={{ y: movedUp ? 20 : -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: movedUp ? -20 : 20, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="text-lg md:text-xl lg:text-h2 font-bold text-[var(--text-secondary)] font-display"
              >
                {entry.rank}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        )}

        {/* Rank Change Indicator */}
        {showRankChange && rankChange !== 0 && (
          <RankChangeIndicator change={rankChange} />
        )}
      </div>

      {/* Nickname - Responsive sizing */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 md:gap-2.5 lg:gap-3">
          <motion.h3
            layout="position"
            className={`
              text-base md:text-lg lg:text-h2 font-semibold truncate
              ${isTopThree ? medalColors?.text : 'text-[var(--text-primary)]'}
            `}
          >
            {entry.nickname}
          </motion.h3>

          {/* Streak Indicator - Responsive sizing with fire animation */}
          {hasStreak && (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              className="flex items-center gap-0.5 md:gap-1 px-1.5 py-0.5 md:px-2 md:py-1 lg:px-3 lg:py-1 rounded-full bg-warning/10"
            >
              <motion.span 
                className="text-sm md:text-base lg:text-body-lg"
                animate={{ 
                  scale: [1, 1.2, 1],
                  rotate: [0, 5, -5, 0],
                }}
                transition={{ 
                  duration: 0.5, 
                  repeat: Infinity,
                  repeatDelay: 1,
                }}
              >
                🔥
              </motion.span>
              <span className="text-xs md:text-sm lg:text-body-sm font-semibold text-warning">
                {entry.streakCount}
              </span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Score - Responsive sizing */}
      <div className="text-right min-w-[100px] md:min-w-[140px] lg:min-w-[180px]">
        <AnimatedScore score={entry.totalScore} isTopThree={isTopThree} />
        
        {/* Last Question Score with enhanced animation */}
        {showLastScore && formattedLastScore && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ 
              duration: 0.4, 
              delay: 0.5,
              type: 'spring',
              stiffness: 300,
            }}
            className="text-xs md:text-sm lg:text-body-sm text-success font-medium mt-0.5 md:mt-1"
          >
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.3, delay: 0.6 }}
            >
              {formattedLastScore}
            </motion.span>
          </motion.div>
        )}
      </div>

      {/* Highlight glow for top 3 - Enhanced */}
      {isTopThree && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ 
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ 
            duration: 2, 
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute inset-0 rounded-lg md:rounded-xl pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at center, ${
              entry.rank === 1
                ? 'rgba(234, 179, 8, 0.15)'
                : entry.rank === 2
                ? 'rgba(156, 163, 175, 0.15)'
                : 'rgba(217, 119, 6, 0.15)'
            } 0%, transparent 70%)`,
          }}
        />
      )}
    </motion.div>
  );
});

/**
 * RankChangeIndicator - Shows rank movement with animated arrow
 * Enhanced with spring physics and glow effects
 * Responsive sizing for different screen sizes
 */
interface RankChangeIndicatorProps {
  change: number;
}

function RankChangeIndicator({ change }: RankChangeIndicatorProps) {
  const isUp = change > 0;
  const absChange = Math.abs(change);
  const isSignificant = absChange >= 3;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0, x: -10 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0, x: 10 }}
      transition={{ 
        type: 'spring', 
        stiffness: 500, 
        damping: 20,
      }}
      className={`
        relative flex items-center gap-0.5 md:gap-1 px-1 py-0.5 md:px-1.5 md:py-1 lg:px-2 lg:py-1 rounded-md text-xs md:text-sm lg:text-body-sm font-semibold
        ${isUp ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}
      `}
    >
      {/* Glow effect for significant changes */}
      {isSignificant && isUp && (
        <motion.div
          className="absolute inset-0 rounded-md bg-success/20"
          animate={{ opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 1, repeat: 2 }}
        />
      )}
      
      {isUp ? (
        <motion.svg
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ 
            type: 'spring', 
            stiffness: 400, 
            damping: 15,
            delay: 0.1,
          }}
          className="w-3 h-3 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </motion.svg>
      ) : (
        <motion.svg
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ 
            type: 'spring', 
            stiffness: 400, 
            damping: 15,
            delay: 0.1,
          }}
          className="w-3 h-3 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </motion.svg>
      )}
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.15 }}
      >
        {absChange}
      </motion.span>
    </motion.div>
  );
}

/**
 * AnimatedScore - Score display with smooth counting animation
 * Uses easeOut for natural deceleration
 * Responsive sizing for different screen sizes
 */
interface AnimatedScoreProps {
  score: number;
  isTopThree: boolean;
}

function AnimatedScore({ score, isTopThree }: AnimatedScoreProps) {
  const [displayScore, setDisplayScore] = useState(score);
  const previousScoreRef = useRef(score);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const previousScore = previousScoreRef.current;
    const difference = score - previousScore;
    
    if (difference === 0) {
      setDisplayScore(score);
      return;
    }

    setIsAnimating(true);

    // Animate score counting with easeOut curve
    const duration = 1000; // ms
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // EaseOut cubic for natural deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = Math.round(previousScore + difference * easeOut);
      setDisplayScore(currentValue);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayScore(score);
        setIsAnimating(false);
      }
    };
    
    requestAnimationFrame(animate);
    previousScoreRef.current = score;

    return () => {
      setIsAnimating(false);
    };
  }, [score]);

  return (
    <motion.div
      layout="position"
      animate={isAnimating ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 0.3 }}
      className={`
        text-xl md:text-2xl lg:text-display font-bold font-display
        ${isTopThree ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}
      `}
    >
      {formatScore(displayScore)}
      <span className="text-sm md:text-base lg:text-h3 font-normal text-[var(--text-muted)] ml-1 md:ml-1.5 lg:ml-2">
        pts
      </span>
    </motion.div>
  );
}

/**
 * EmptyLeaderboard - Displayed when no entries
 * Responsive sizing for different screen sizes
 */
function EmptyLeaderboard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center h-full py-12 md:py-16 lg:py-20"
    >
      <div className="w-20 h-20 md:w-24 md:h-24 lg:w-32 lg:h-32 rounded-full neu-raised flex items-center justify-center mb-4 md:mb-6 lg:mb-8">
        <span className="text-3xl md:text-4xl lg:text-display-xl">📊</span>
      </div>
      <h2 className="text-xl md:text-2xl lg:text-h1 font-semibold text-[var(--text-secondary)] mb-2 md:mb-3 lg:mb-4">
        No Rankings Yet
      </h2>
      <p className="text-base md:text-lg lg:text-h3 text-[var(--text-muted)]">
        Scores will appear here after the first question
      </p>
    </motion.div>
  );
}

export default LeaderboardScreen;
