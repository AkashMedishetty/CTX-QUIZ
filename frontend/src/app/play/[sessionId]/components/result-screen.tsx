/**
 * Result Screen Component
 * 
 * Displays the answer result after the timer ends and answers are revealed.
 * Shows whether the participant's answer was correct/incorrect, points earned,
 * correct answer(s), and explanation text.
 * Supports spectator mode with leaderboard display.
 * 
 * Mobile-first neumorphic design with Framer Motion animations.
 * Optimized for 320px-428px width with:
 * - Touch-friendly UI (44px min tap targets)
 * - Safe area insets for notched devices
 * - Responsive typography and spacing
 * 
 * Requirements: 14.1, 14.6, 14.9, 3.6
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { SpectatorBadge } from './spectator-badge';
import { CopyPrevention } from '@/components/CopyPrevention';

// ==================== Types ====================

export interface QuestionOption {
  optionId: string;
  optionText: string;
  optionImageUrl?: string;
}

export interface QuestionData {
  questionId: string;
  questionText: string;
  questionType: string;
  questionImageUrl?: string;
  options: QuestionOption[];
  timeLimit: number;
}

export interface ResultScreenProps {
  /** Whether the participant's answer was correct */
  isCorrect: boolean;
  /** The correct option IDs */
  correctOptions: string[];
  /** The participant's selected option IDs */
  selectedOptions: string[];
  /** The question data (for displaying options) */
  question: QuestionData;
  /** Points earned this round */
  pointsEarned: number;
  /** Speed bonus points */
  speedBonus?: number;
  /** Streak bonus points */
  streakBonus?: number;
  /** Current streak count */
  streakCount: number;
  /** Current total score */
  totalScore: number;
  /** Current rank */
  rank: number | null;
  /** Previous rank (for showing improvement) */
  previousRank?: number | null;
  /** Total participants */
  totalParticipants: number;
  /** Explanation text (if available) */
  explanationText?: string | null;
  /** Whether the socket is connected */
  isConnected: boolean;
  /** Whether the participant is in spectator mode */
  isSpectator?: boolean;
  /** Whether the participant was eliminated */
  isEliminated?: boolean;
  /** Leaderboard data for spectators */
  leaderboard?: Array<{
    rank: number;
    participantId: string;
    nickname: string;
    totalScore: number;
    lastQuestionScore?: number;
    streakCount?: number;
  }>;
}

// ==================== Constants ====================

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// ==================== Animation Variants ====================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 24,
    },
  },
};

const correctIconVariants = {
  hidden: { scale: 0, rotate: -180 },
  visible: {
    scale: 1,
    rotate: 0,
    transition: {
      type: 'spring',
      stiffness: 260,
      damping: 20,
      delay: 0.1,
    },
  },
};

const incorrectIconVariants = {
  hidden: { scale: 0 },
  visible: {
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 15,
      delay: 0.1,
    },
  },
};

const pointsVariants = {
  hidden: { scale: 0.5, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
      delay: 0.3,
    },
  },
};

// ==================== Sub-Components ====================

/**
 * Correct answer celebration icon with animation
 */
function CorrectIcon() {
  return (
    <motion.div
      variants={correctIconVariants}
      className="w-20 h-20 mx-auto rounded-full bg-success/20 flex items-center justify-center"
    >
      <motion.svg
        className="w-12 h-12 text-success"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <motion.path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
          d="M5 13l4 4L19 7"
        />
      </motion.svg>
    </motion.div>
  );
}

/**
 * Incorrect answer icon with gentle animation
 */
function IncorrectIcon() {
  return (
    <motion.div
      variants={incorrectIconVariants}
      className="w-20 h-20 mx-auto rounded-full bg-error/10 flex items-center justify-center"
    >
      <svg
        className="w-12 h-12 text-error"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </motion.div>
  );
}

/**
 * Points breakdown display
 */
function PointsBreakdown({
  pointsEarned,
  speedBonus,
  streakBonus,
  isCorrect,
}: {
  pointsEarned: number;
  speedBonus?: number;
  streakBonus?: number;
  isCorrect: boolean;
}) {
  const hasBonus = (speedBonus && speedBonus > 0) || (streakBonus && streakBonus > 0);
  const basePoints = pointsEarned - (speedBonus || 0) - (streakBonus || 0);

  if (!isCorrect && pointsEarned === 0) {
    return (
      <motion.div
        variants={pointsVariants}
        className="text-center py-4"
      >
        <p className="text-lg text-[var(--text-secondary)]">No points this round</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={pointsVariants}
      className="neu-pressed rounded-xl p-4 space-y-3"
    >
      {/* Total points earned */}
      <div className="text-center">
        <motion.span
          className={`text-4xl font-bold font-display ${
            isCorrect ? 'text-success' : 'text-[var(--text-primary)]'
          }`}
          initial={{ scale: 0.5 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.4 }}
        >
          +{pointsEarned}
        </motion.span>
        <p className="text-sm text-[var(--text-secondary)] mt-1">points earned</p>
      </div>

      {/* Breakdown */}
      {hasBonus && (
        <div className="border-t border-[var(--border)] pt-3 space-y-2">
          {basePoints > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Base points</span>
              <span className="font-medium text-[var(--text-primary)]">+{basePoints}</span>
            </div>
          )}
          {speedBonus && speedBonus > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1">
                  <svg className="w-4 h-4 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Speed bonus
                </span>
              </span>
              <span className="font-medium text-warning">+{speedBonus}</span>
            </div>
          )}
          {streakBonus && streakBonus > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1">
                  <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                  </svg>
                  Streak bonus
                </span>
              </span>
              <span className="font-medium text-primary">+{streakBonus}</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Streak indicator badge with fire animation
 */
function StreakBadge({ streakCount }: { streakCount: number }) {
  if (streakCount < 2) return null;

  // Determine streak intensity for visual feedback
  const isHotStreak = streakCount >= 5;
  const isOnFire = streakCount >= 3;

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0, rotate: -10 }}
      animate={{ 
        scale: 1, 
        opacity: 1, 
        rotate: 0,
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.5 }}
      className={`
        inline-flex items-center gap-2 px-4 py-2 rounded-full
        ${isHotStreak 
          ? 'bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-500' 
          : isOnFire 
            ? 'bg-primary/15 text-primary' 
            : 'bg-primary/10 text-primary'
        }
      `}
    >
      {/* Animated fire icon */}
      <motion.div
        animate={isOnFire ? {
          scale: [1, 1.2, 1],
          rotate: [0, -5, 5, 0],
        } : {}}
        transition={{
          duration: 0.6,
          repeat: isOnFire ? Infinity : 0,
          ease: 'easeInOut',
        }}
      >
        <span className="text-lg" role="img" aria-label="fire">🔥</span>
      </motion.div>
      
      {/* Streak count with emphasis */}
      <div className="flex items-baseline gap-1">
        <motion.span
          className="font-bold text-lg"
          animate={isHotStreak ? {
            scale: [1, 1.1, 1],
          } : {}}
          transition={{
            duration: 0.8,
            repeat: isHotStreak ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          {streakCount}
        </motion.span>
        <span className="font-semibold text-sm">
          {isHotStreak ? 'ON FIRE!' : isOnFire ? 'streak!' : 'in a row!'}
        </span>
      </div>

      {/* Extra fire emojis for hot streaks */}
      {isHotStreak && (
        <motion.span
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.7 }}
          className="text-lg"
          role="img"
          aria-label="fire"
        >
          🔥
        </motion.span>
      )}
    </motion.div>
  );
}

/**
 * Answer option display with correct/incorrect highlighting
 * Touch-friendly with responsive sizing
 */
function AnswerOption({
  option,
  label,
  isCorrect,
  isSelected,
  index,
}: {
  option: QuestionOption;
  label: string;
  isCorrect: boolean;
  isSelected: boolean;
  index: number;
}) {
  // Determine the visual state
  const isCorrectAnswer = isCorrect;
  const wasSelectedCorrectly = isSelected && isCorrect;
  const wasSelectedIncorrectly = isSelected && !isCorrect;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.4 + index * 0.08 }}
      className={`
        w-full p-2.5 sm:p-3 rounded-xl flex items-center gap-2 sm:gap-3
        transition-all duration-200
        touch-target-44
        ${wasSelectedCorrectly 
          ? 'bg-success/15 border-2 border-success' 
          : wasSelectedIncorrectly 
            ? 'bg-error/10 border-2 border-error/50' 
            : isCorrectAnswer 
              ? 'bg-success/10 border-2 border-success/50' 
              : 'neu-raised-sm opacity-60'
        }
      `}
    >
      {/* Option label - Touch-friendly size */}
      <span
        className={`
          flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center
          font-bold text-xs sm:text-sm
          ${wasSelectedCorrectly 
            ? 'bg-success text-white' 
            : wasSelectedIncorrectly 
              ? 'bg-error text-white' 
              : isCorrectAnswer 
                ? 'bg-success/20 text-success' 
                : 'bg-[var(--neu-surface)] text-[var(--text-secondary)]'
          }
        `}
      >
        {label}
      </span>

      {/* Option text - Mobile-optimized font size */}
      <span
        className={`
          flex-1 text-xs sm:text-sm font-medium
          ${wasSelectedCorrectly || isCorrectAnswer 
            ? 'text-[var(--text-primary)]' 
            : wasSelectedIncorrectly 
              ? 'text-error' 
              : 'text-[var(--text-secondary)]'
          }
        `}
      >
        {option.optionText}
      </span>

      {/* Status icon */}
      {(isCorrectAnswer || isSelected) && (
        <span className="flex-shrink-0">
          {isCorrectAnswer ? (
            <svg
              className="w-4 h-4 sm:w-5 sm:h-5 text-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : wasSelectedIncorrectly ? (
            <svg
              className="w-4 h-4 sm:w-5 sm:h-5 text-error"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : null}
        </span>
      )}
    </motion.div>
  );
}

/**
 * Explanation text display
 */
function ExplanationSection({ text }: { text: string }) {
  return (
    <motion.div
      variants={itemVariants}
      className="neu-raised rounded-xl p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-info"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div>
          <h4 className="font-semibold text-[var(--text-primary)] mb-1">Explanation</h4>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{text}</p>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Animated counter that counts up from 0 to target value
 */
function AnimatedCounter({
  value,
  duration = 1000,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = React.useState(0);
  const prevValueRef = React.useRef(0);

  React.useEffect(() => {
    const startValue = prevValueRef.current;
    const endValue = value;
    const startTime = Date.now();
    
    // If value decreased or is 0, just set it directly
    if (endValue <= startValue || endValue === 0) {
      setDisplayValue(endValue);
      prevValueRef.current = endValue;
      return;
    }

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + (endValue - startValue) * easeOut);
      
      setDisplayValue(current);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        prevValueRef.current = endValue;
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return <span className={className}>{displayValue}</span>;
}

/**
 * Rank change indicator showing improvement or decline
 */
function RankChangeIndicator({ 
  currentRank, 
  previousRank 
}: { 
  currentRank: number | null; 
  previousRank: number | null;
}) {
  if (currentRank === null || previousRank === null || currentRank === previousRank) {
    return null;
  }

  const improved = currentRank < previousRank;
  const change = Math.abs(previousRank - currentRank);

  return (
    <motion.div
      initial={{ opacity: 0, y: improved ? 10 : -10, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20, delay: 0.5 }}
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        improved ? 'text-success' : 'text-error'
      }`}
    >
      {improved ? (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      )}
      <span>{change}</span>
    </motion.div>
  );
}

/**
 * Format rank with ordinal suffix (1st, 2nd, 3rd, etc.)
 */
function formatRankOrdinal(rank: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = rank % 100;
  return rank + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/**
 * Current score and rank display with animations
 */
function ScoreRankDisplay({
  totalScore,
  rank,
  totalParticipants,
  previousRank,
}: {
  totalScore: number;
  rank: number | null;
  totalParticipants: number;
  previousRank?: number | null;
}) {
  return (
    <motion.div
      variants={itemVariants}
      className="flex items-center justify-center gap-6 py-3"
    >
      {/* Total Score with animated counter */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.3 }}
        >
          <AnimatedCounter
            value={totalScore}
            duration={1200}
            className="text-2xl font-bold font-display text-primary"
          />
        </motion.div>
        <p className="text-xs text-[var(--text-secondary)]">Total Score</p>
      </div>

      {/* Divider */}
      <div className="w-px h-10 bg-[var(--border)]" />

      {/* Rank with ordinal format and change indicator */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-1">
          <motion.p
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.4 }}
            className="text-2xl font-bold font-display text-[var(--text-primary)]"
          >
            {rank !== null ? formatRankOrdinal(rank) : '-'}
          </motion.p>
          <RankChangeIndicator currentRank={rank} previousRank={previousRank ?? null} />
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          out of {totalParticipants}
        </p>
      </div>
    </motion.div>
  );
}

/**
 * Connection status indicator
 */
function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
  if (isConnected) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-0 right-0 z-20 bg-warning/90 text-white py-2 px-4 text-center text-sm font-medium"
    >
      <div className="flex items-center justify-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
        </span>
        Reconnecting...
      </div>
    </motion.div>
  );
}

// ==================== Main Component ====================

/**
 * Spectator Leaderboard Component
 * Shows top participants for spectators during reveal phase
 */
function SpectatorLeaderboard({
  leaderboard,
}: {
  leaderboard: Array<{
    rank: number;
    participantId: string;
    nickname: string;
    totalScore: number;
    lastQuestionScore?: number;
    streakCount?: number;
  }>;
}) {
  if (!leaderboard || leaderboard.length === 0) {
    return null;
  }

  // Show top 10
  const topParticipants = leaderboard.slice(0, 10);

  return (
    <motion.div
      variants={itemVariants}
      className="neu-raised-lg rounded-xl p-4"
    >
      <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 uppercase tracking-wide flex items-center gap-2">
        <svg
          className="w-4 h-4 text-primary"
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
        Leaderboard
      </h3>
      
      <div className="space-y-2">
        {topParticipants.map((entry, index) => (
          <motion.div
            key={entry.participantId}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`
              flex items-center gap-3 p-2 rounded-lg
              ${index < 3 ? 'bg-primary/5' : 'bg-[var(--neu-surface)]/50'}
            `}
          >
            {/* Rank */}
            <span
              className={`
                flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                font-bold text-sm
                ${index === 0 
                  ? 'bg-yellow-500/20 text-yellow-600' 
                  : index === 1 
                    ? 'bg-gray-400/20 text-gray-500' 
                    : index === 2 
                      ? 'bg-orange-500/20 text-orange-600' 
                      : 'bg-[var(--neu-surface)] text-[var(--text-secondary)]'
                }
              `}
            >
              {entry.rank}
            </span>

            {/* Nickname */}
            <span className="flex-1 font-medium text-[var(--text-primary)] truncate">
              {entry.nickname}
            </span>

            {/* Score */}
            <span className="flex-shrink-0 font-bold text-primary tabular-nums">
              {entry.totalScore}
            </span>

            {/* Streak indicator */}
            {entry.streakCount && entry.streakCount >= 2 && (
              <span className="flex-shrink-0 text-sm" role="img" aria-label="streak">
                🔥
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/**
 * Result Screen Component
 * 
 * Displays the answer result after the timer ends and answers are revealed.
 * Shows correct/incorrect feedback, points earned, and explanation.
 * Supports spectator mode with leaderboard display.
 * 
 * @example
 * ```tsx
 * <ResultScreen
 *   isCorrect={true}
 *   correctOptions={['opt1']}
 *   selectedOptions={['opt1']}
 *   question={questionData}
 *   pointsEarned={150}
 *   speedBonus={30}
 *   streakBonus={20}
 *   streakCount={3}
 *   totalScore={450}
 *   rank={5}
 *   totalParticipants={50}
 *   explanationText="The answer is A because..."
 *   isConnected={true}
 *   isSpectator={false}
 * />
 * ```
 */
export function ResultScreen({
  isCorrect,
  correctOptions,
  selectedOptions,
  question,
  pointsEarned,
  speedBonus,
  streakBonus,
  streakCount,
  totalScore,
  rank,
  previousRank,
  totalParticipants,
  explanationText,
  isConnected,
  isSpectator = false,
  isEliminated = false,
  leaderboard = [],
}: ResultScreenProps) {
  return (
    <main className="min-h-screen-mobile flex flex-col bg-[var(--neu-bg)] overscroll-none">
      {/* Connection indicator */}
      <ConnectionIndicator isConnected={isConnected} />

      {/* Main content - Safe area aware */}
      <motion.div
        className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-6 safe-area-inset-y safe-area-inset-x overscroll-contain"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Spectator banner */}
        {isSpectator && (
          <motion.div variants={itemVariants} className="mb-4 sm:mb-6">
            <SpectatorBadge 
              isVisible={true} 
              variant="banner"
              isEliminated={isEliminated}
              message={isEliminated 
                ? "You've been eliminated - watching results" 
                : "You're watching as a spectator"
              }
            />
          </motion.div>
        )}

        {/* Result header - different for spectators */}
        {isSpectator ? (
          <motion.div variants={itemVariants} className="text-center mb-4 sm:mb-6">
            {/* Spectator result header */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-3 sm:mb-4"
            >
              <svg
                className="w-7 h-7 sm:w-8 sm:h-8 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </motion.div>
            <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">
              Answer Revealed
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
              See the correct answer below
            </p>
          </motion.div>
        ) : (
          <motion.div variants={itemVariants} className="text-center mb-4 sm:mb-6">
            {/* Correct/Incorrect Icon */}
            {isCorrect ? <CorrectIcon /> : <IncorrectIcon />}

            {/* Result message */}
            <motion.h2
              variants={itemVariants}
              className={`text-xl sm:text-2xl font-bold mt-3 sm:mt-4 ${
                isCorrect ? 'text-success' : 'text-error'
              }`}
            >
              {isCorrect ? 'Correct!' : 'Incorrect'}
            </motion.h2>

            {/* Streak badge */}
            {isCorrect && streakCount >= 2 && (
              <div className="mt-2 sm:mt-3">
                <StreakBadge streakCount={streakCount} />
              </div>
            )}
          </motion.div>
        )}

        {/* Points breakdown - only for non-spectators */}
        {!isSpectator && (
          <motion.div variants={itemVariants} className="mb-4 sm:mb-6">
            <PointsBreakdown
              pointsEarned={pointsEarned}
              speedBonus={speedBonus}
              streakBonus={streakBonus}
              isCorrect={isCorrect}
            />
          </motion.div>
        )}

        {/* Answer options with highlighting */}
        {/* Wrapped with CopyPrevention to prevent copying quiz content (Requirements: 7.1, 7.2, 7.3, 7.4) */}
        <CopyPrevention>
          <motion.div variants={itemVariants} className="mb-4 sm:mb-6">
            <h3 className="text-xs sm:text-sm font-semibold text-[var(--text-secondary)] mb-2 sm:mb-3 uppercase tracking-wide">
              {isSpectator ? 'Correct Answer' : isCorrect ? 'Your Answer' : 'Correct Answer'}
            </h3>
            <div className="space-y-1.5 sm:space-y-2">
              {question.options.map((option, index) => (
                <AnswerOption
                  key={option.optionId}
                  option={option}
                  label={OPTION_LABELS[index] || String(index + 1)}
                  isCorrect={correctOptions.includes(option.optionId)}
                  isSelected={isSpectator ? false : selectedOptions.includes(option.optionId)}
                  index={index}
                />
              ))}
            </div>
          </motion.div>

          {/* Explanation text */}
          {explanationText && (
            <ExplanationSection text={explanationText} />
          )}
        </CopyPrevention>

        {/* Leaderboard for spectators */}
        {isSpectator && leaderboard && leaderboard.length > 0 && (
          <motion.div variants={itemVariants} className="mt-4 sm:mt-6">
            <SpectatorLeaderboard leaderboard={leaderboard} />
          </motion.div>
        )}

        {/* Score and rank display - only for non-spectators */}
        {!isSpectator && (
          <motion.div variants={itemVariants} className="mt-4 sm:mt-6">
            <div className="neu-raised-lg rounded-xl p-3 sm:p-4">
              <ScoreRankDisplay
                totalScore={totalScore}
                rank={rank}
                totalParticipants={totalParticipants}
                previousRank={previousRank}
              />
            </div>
          </motion.div>
        )}

        {/* Waiting message */}
        <motion.div
          variants={itemVariants}
          className="text-center mt-4 sm:mt-6 py-3 sm:py-4"
        >
          <div className="inline-flex items-center gap-2 text-[var(--text-secondary)]">
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary"
            />
            <span className="text-xs sm:text-sm">
              {isSpectator ? 'Watching live...' : 'Waiting for next question...'}
            </span>
          </div>
        </motion.div>
      </motion.div>
    </main>
  );
}

export default ResultScreen;
