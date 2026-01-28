/**
 * FinalResultsScreen - Big Screen final results display component
 * 
 * Displays the final results screen for the Big Screen with:
 * - Podium display for top 3 participants (gold, silver, bronze)
 * - 3D-style podium with 1st place elevated in center
 * - Celebration animations (confetti, sparkles)
 * - Remaining participants list (positions 4-10)
 * - Animated score reveals and trophy effects
 * - Framer Motion layout animations
 * 
 * Responsive Design:
 * - Optimized for 16:9 and 4:3 aspect ratios
 * - Supports 1920x1080, 1280x720, 1024x768 resolutions
 * - Uses CSS Grid for layouts
 * 
 * Requirements: 12.7, 12.9
 */

'use client';

import { useMemo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
 * FinalResultsScreen props
 */
export interface FinalResultsScreenProps {
  /** Array of leaderboard entries */
  leaderboard: LeaderboardEntry[];
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
 * Podium colors for top 3
 */
const PODIUM_COLORS: Record<number, { 
  bg: string; 
  border: string; 
  text: string;
  glow: string;
  gradient: string;
}> = {
  1: {
    bg: 'bg-gradient-to-br from-yellow-400/30 to-yellow-600/20',
    border: 'ring-4 ring-yellow-400/60',
    text: 'text-yellow-500',
    glow: 'rgba(234, 179, 8, 0.4)',
    gradient: 'from-yellow-400 to-yellow-600',
  },
  2: {
    bg: 'bg-gradient-to-br from-gray-300/30 to-gray-400/20',
    border: 'ring-4 ring-gray-400/60',
    text: 'text-gray-400',
    glow: 'rgba(156, 163, 175, 0.4)',
    gradient: 'from-gray-300 to-gray-500',
  },
  3: {
    bg: 'bg-gradient-to-br from-amber-600/30 to-amber-700/20',
    border: 'ring-4 ring-amber-600/60',
    text: 'text-amber-600',
    glow: 'rgba(217, 119, 6, 0.4)',
    gradient: 'from-amber-500 to-amber-700',
  },
};

/**
 * Format score for display with thousands separator
 */
function formatScore(score: number): string {
  return score.toLocaleString();
}

/**
 * Confetti particle component
 */
function ConfettiParticle({ 
  color 
}: { 
  color: string;
}) {
  const randomX = useMemo(() => Math.random() * 100, []);
  const randomDelay = useMemo(() => Math.random() * 2, []);
  const randomDuration = useMemo(() => 3 + Math.random() * 2, []);
  const randomRotation = useMemo(() => Math.random() * 720 - 360, []);
  const randomSize = useMemo(() => 8 + Math.random() * 8, []);

  return (
    <motion.div
      initial={{ 
        y: -20, 
        x: `${randomX}vw`,
        opacity: 1,
        rotate: 0,
        scale: 0
      }}
      animate={{ 
        y: '100vh',
        opacity: [1, 1, 0],
        rotate: randomRotation,
        scale: [0, 1, 1, 0.5]
      }}
      transition={{
        duration: randomDuration,
        delay: randomDelay,
        ease: 'linear',
      }}
      className="absolute pointer-events-none"
      style={{
        width: randomSize,
        height: randomSize,
        backgroundColor: color,
        borderRadius: Math.random() > 0.5 ? '50%' : '2px',
      }}
    />
  );
}

/**
 * Confetti burst component
 */
function ConfettiBurst() {
  const colors = [
    '#FFD700', // Gold
    '#C0C0C0', // Silver
    '#CD7F32', // Bronze
    '#22C55E', // Green
    '#3B82F6', // Blue
    '#EF4444', // Red
    '#A855F7', // Purple
    '#F59E0B', // Amber
  ];

  const particles = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      color: colors[i % colors.length],
    }));
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-50">
      {particles.map((particle) => (
        <ConfettiParticle
          key={particle.id}
          color={particle.color}
        />
      ))}
    </div>
  );
}

/**
 * Sparkle effect component
 */
function SparkleEffect({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ 
        opacity: [0, 1, 0],
        scale: [0, 1, 0],
      }}
      transition={{
        duration: 1.5,
        delay,
        repeat: Infinity,
        repeatDelay: 1,
      }}
      className="absolute w-4 h-4"
      style={{
        background: 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 70%)',
      }}
    />
  );
}

/**
 * Animated score counter component
 */
function AnimatedScoreCounter({ 
  score, 
  delay = 0,
  className = ''
}: { 
  score: number; 
  delay?: number;
  className?: string;
}) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const duration = 1500;
      const steps = 30;
      const stepDuration = duration / steps;
      const stepValue = score / steps;
      
      let currentStep = 0;
      const interval = setInterval(() => {
        currentStep++;
        if (currentStep >= steps) {
          setDisplayScore(score);
          clearInterval(interval);
        } else {
          setDisplayScore(Math.round(stepValue * currentStep));
        }
      }, stepDuration);

      return () => clearInterval(interval);
    }, delay * 1000);

    return () => clearTimeout(timer);
  }, [score, delay]);

  return (
    <span className={className}>
      {formatScore(displayScore)}
    </span>
  );
}

/**
 * Podium card component for top 3
 * Responsive sizing for different screen sizes
 */
interface PodiumCardProps {
  entry: LeaderboardEntry;
  position: 1 | 2 | 3;
  revealDelay: number;
}

function PodiumCard({ entry, position, revealDelay }: PodiumCardProps) {
  const colors = PODIUM_COLORS[position];
  const medal = MEDALS[position];
  
  // Podium heights - Responsive
  const podiumHeights: Record<number, string> = {
    1: 'h-28 md:h-36 lg:h-48',
    2: 'h-20 md:h-28 lg:h-36',
    3: 'h-16 md:h-22 lg:h-28',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 100, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.8,
        delay: revealDelay,
        type: 'spring',
        stiffness: 200,
        damping: 20,
      }}
      className="flex flex-col items-center"
    >
      {/* Winner card - Responsive sizing */}
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ delay: revealDelay + 0.3, type: 'spring', stiffness: 300 }}
        className={`
          relative rounded-lg md:rounded-xl p-3 md:p-4 lg:p-6 mb-2 md:mb-3 lg:mb-4 
          min-w-[120px] md:min-w-[160px] lg:min-w-[200px] 
          max-w-[160px] md:max-w-[220px] lg:max-w-[280px]
          neu-raised-lg ${colors.bg} ${colors.border}
        `}
      >
        {/* Glow effect for winner */}
        {position === 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-lg md:rounded-xl pointer-events-none"
            style={{
              boxShadow: `0 0 40px ${colors.glow}, 0 0 70px ${colors.glow}`,
            }}
          />
        )}

        {/* Sparkles for winner */}
        {position === 1 && (
          <>
            <div className="absolute -top-1 -left-1 md:-top-2 md:-left-2">
              <SparkleEffect delay={0} />
            </div>
            <div className="absolute -top-1 -right-1 md:-top-2 md:-right-2">
              <SparkleEffect delay={0.5} />
            </div>
            <div className="absolute -bottom-1 left-1/2 md:-bottom-2">
              <SparkleEffect delay={1} />
            </div>
          </>
        )}

        {/* Medal - Responsive sizing */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            delay: revealDelay + 0.5,
            type: 'spring',
            stiffness: 300,
            damping: 15,
          }}
          className="text-center mb-1.5 md:mb-2 lg:mb-3"
        >
          <span className="text-3xl md:text-4xl lg:text-display-xl">{medal}</span>
        </motion.div>

        {/* Trophy for winner - Responsive positioning */}
        {position === 1 && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: revealDelay + 0.8,
              type: 'spring',
              stiffness: 200,
            }}
            className="absolute -top-5 md:-top-6 lg:-top-8 left-1/2 transform -translate-x-1/2"
          >
            <motion.span
              animate={{ 
                y: [0, -5, 0],
                rotate: [0, 5, -5, 0],
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="text-2xl md:text-3xl lg:text-display-xl block"
            >
              🏆
            </motion.span>
          </motion.div>
        )}

        {/* Nickname - Responsive sizing */}
        <motion.h3
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: revealDelay + 0.6 }}
          className={`
            text-sm md:text-base lg:text-h2 font-bold text-center truncate mb-1 md:mb-1.5 lg:mb-2
            ${colors.text}
          `}
        >
          {entry.nickname}
        </motion.h3>

        {/* Score - Responsive sizing */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: revealDelay + 0.7 }}
          className="text-center"
        >
          <AnimatedScoreCounter
            score={entry.totalScore}
            delay={revealDelay + 0.8}
            className="text-xl md:text-2xl lg:text-display font-bold text-[var(--text-primary)] font-display"
          />
          <span className="text-xs md:text-sm lg:text-h3 font-normal text-[var(--text-muted)] ml-1 md:ml-1.5 lg:ml-2">
            pts
          </span>
        </motion.div>
      </motion.div>

      {/* Podium base - Responsive sizing */}
      <motion.div
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{
          delay: revealDelay + 0.2,
          duration: 0.5,
          ease: [0.0, 0.0, 0.2, 1],
        }}
        style={{ transformOrigin: 'bottom' }}
        className={`
          w-full ${podiumHeights[position]} rounded-t-md md:rounded-t-lg
          bg-gradient-to-t ${colors.gradient}
          neu-raised flex items-center justify-center
        `}
      >
        <span className="text-xl md:text-2xl lg:text-display font-bold text-white/90 font-display">
          {position}
        </span>
      </motion.div>
    </motion.div>
  );
}

/**
 * Remaining participants list component
 * Responsive sizing for different screen sizes
 */
interface RemainingParticipantsProps {
  entries: LeaderboardEntry[];
  revealDelay: number;
}

function RemainingParticipants({ entries, revealDelay }: RemainingParticipantsProps) {
  if (entries.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: revealDelay, duration: 0.5 }}
      className="neu-raised rounded-lg md:rounded-xl p-3 md:p-4 lg:p-6 max-w-3xl lg:max-w-4xl mx-auto"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-2.5 lg:gap-3">
        {entries.map((entry, index) => (
          <motion.div
            key={entry.participantId}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: revealDelay + 0.1 * index }}
            className="flex items-center gap-2 md:gap-3 lg:gap-4 p-2 md:p-2.5 lg:p-3 rounded-md md:rounded-lg neu-raised-sm"
          >
            {/* Rank - Responsive sizing */}
            <div className="w-7 h-7 md:w-8 md:h-8 lg:w-10 lg:h-10 rounded-md md:rounded-lg bg-[var(--text-muted)]/10 flex items-center justify-center">
              <span className="text-sm md:text-base lg:text-h3 font-bold text-[var(--text-muted)] font-display">
                {entry.rank}
              </span>
            </div>

            {/* Nickname - Responsive sizing */}
            <div className="flex-1 min-w-0">
              <p className="text-sm md:text-base lg:text-body-lg font-medium text-[var(--text-secondary)] truncate">
                {entry.nickname}
              </p>
            </div>

            {/* Score - Responsive sizing */}
            <div className="text-right">
              <span className="text-sm md:text-base lg:text-h3 font-semibold text-[var(--text-primary)] font-display">
                {formatScore(entry.totalScore)}
              </span>
              <span className="text-xs md:text-sm lg:text-body-sm text-[var(--text-muted)] ml-0.5 md:ml-1">
                pts
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/**
 * FinalResultsScreen component
 * 
 * Displays the final results with podium for top 3 and celebration animations.
 * Optimized for projector display with dramatic reveal effects.
 * Responsive design for multiple screen sizes.
 */
export function FinalResultsScreen({
  leaderboard,
  isConnected,
}: FinalResultsScreenProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  // Sort and separate top 3 from rest
  const sortedLeaderboard = useMemo(() => {
    return [...leaderboard].sort((a, b) => a.rank - b.rank);
  }, [leaderboard]);

  const topThree = useMemo(() => {
    return sortedLeaderboard.slice(0, 3);
  }, [sortedLeaderboard]);

  const remaining = useMemo(() => {
    return sortedLeaderboard.slice(3, 10);
  }, [sortedLeaderboard]);

  // Get entries by position
  const first = topThree.find((e) => e.rank === 1);
  const second = topThree.find((e) => e.rank === 2);
  const third = topThree.find((e) => e.rank === 3);

  // Trigger confetti after winner reveal
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowConfetti(true);
    }, 2500); // After winner is revealed

    return () => clearTimeout(timer);
  }, []);

  // Hide confetti after animation
  useEffect(() => {
    if (showConfetti) {
      const timer = setTimeout(() => {
        setShowConfetti(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [showConfetti]);

  return (
    <div className="min-h-screen bg-[var(--neu-bg)] flex flex-col overflow-hidden">
      {/* Confetti */}
      <AnimatePresence>
        {showConfetti && <ConfettiBurst />}
      </AnimatePresence>

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
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ 
                delay: 0.2, 
                type: 'spring', 
                stiffness: 300,
                damping: 15 
              }}
              className="text-2xl md:text-3xl lg:text-display-xl"
            >
              🎉
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-xl md:text-2xl lg:text-display font-bold text-[var(--text-primary)]"
            >
              FINAL RESULTS
            </motion.h1>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ 
                delay: 0.4, 
                type: 'spring', 
                stiffness: 300,
                damping: 15 
              }}
              className="text-2xl md:text-3xl lg:text-display-xl"
            >
              🎉
            </motion.div>
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
      <main className="flex-1 px-4 pb-4 md:px-8 md:pb-6 lg:px-12 lg:pb-8 flex flex-col">
        {sortedLeaderboard.length === 0 ? (
          <EmptyResults />
        ) : (
          <>
            {/* Podium Section - Responsive gap */}
            <div className="flex-1 flex items-end justify-center pb-4 md:pb-6 lg:pb-8">
              <div className="flex items-end justify-center gap-3 md:gap-5 lg:gap-8">
                {/* 2nd Place (Left) */}
                {second && (
                  <PodiumCard
                    entry={second}
                    position={2}
                    revealDelay={0.8}
                  />
                )}

                {/* 1st Place (Center) */}
                {first && (
                  <PodiumCard
                    entry={first}
                    position={1}
                    revealDelay={1.6}
                  />
                )}

                {/* 3rd Place (Right) */}
                {third && (
                  <PodiumCard
                    entry={third}
                    position={3}
                    revealDelay={0}
                  />
                )}
              </div>
            </div>

            {/* Remaining Participants */}
            {remaining.length > 0 && (
              <RemainingParticipants
                entries={remaining}
                revealDelay={2.5}
              />
            )}

            {/* Thanks Message - Responsive sizing */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 3.5, duration: 0.5 }}
              className="text-center mt-4 md:mt-6 lg:mt-8"
            >
              <p className="text-lg md:text-xl lg:text-h2 text-[var(--text-secondary)]">
                Thanks for playing! 🙏
              </p>
            </motion.div>
          </>
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
 * EmptyResults - Displayed when no leaderboard entries
 * Responsive sizing for different screen sizes
 */
function EmptyResults() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center flex-1 py-12 md:py-16 lg:py-20"
    >
      <div className="w-20 h-20 md:w-24 md:h-24 lg:w-32 lg:h-32 rounded-full neu-raised flex items-center justify-center mb-4 md:mb-6 lg:mb-8">
        <span className="text-3xl md:text-4xl lg:text-display-xl">🏆</span>
      </div>
      <h2 className="text-xl md:text-2xl lg:text-h1 font-semibold text-[var(--text-secondary)] mb-2 md:mb-3 lg:mb-4">
        No Results Yet
      </h2>
      <p className="text-base md:text-lg lg:text-h3 text-[var(--text-muted)]">
        Final results will appear here when the quiz ends
      </p>
    </motion.div>
  );
}

export default FinalResultsScreen;
