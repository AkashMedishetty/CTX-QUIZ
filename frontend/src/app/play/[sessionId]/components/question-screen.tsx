/**
 * Question Screen Component
 * 
 * Displays the question answering interface for participants.
 * Shows question text, image (if present), answer options, timer, and submit button.
 * Mobile-first design with touch-friendly buttons (min 44px height).
 * Supports spectator mode for late joiners and eliminated participants.
 * 
 * Optimized for 320px-428px width with:
 * - Touch-friendly UI (44px min tap targets)
 * - Safe area insets for notched devices
 * - Responsive typography and spacing
 * - Overscroll prevention
 * 
 * Requirements: 14.1, 14.3, 14.4, 14.5, 14.9, 3.6
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SpectatorBadge } from './spectator-badge';

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

export interface QuestionScreenProps {
  /** Question data to display */
  question: QuestionData;
  /** Current question index (0-based) */
  questionIndex: number;
  /** Total number of questions */
  totalQuestions: number;
  /** Remaining seconds on the timer */
  remainingSeconds: number;
  /** Whether the participant has already submitted an answer */
  hasSubmitted: boolean;
  /** Currently selected option IDs */
  selectedOptions: string[];
  /** Callback when an option is selected/deselected */
  onSelectOption: (optionId: string) => void;
  /** Callback when submit button is clicked */
  onSubmit: () => void;
  /** Whether the socket is connected */
  isConnected: boolean;
  /** Current total score (optional, for score header) */
  currentScore?: number;
  /** Current streak count (optional, for score header) */
  currentStreak?: number;
  /** Whether the participant is in spectator mode (late joiner or eliminated) */
  isSpectator?: boolean;
  /** Whether the participant was eliminated (for spectator badge styling) */
  isEliminated?: boolean;
}

// ==================== Constants ====================

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Time thresholds for visual urgency */
const TIMER_THRESHOLDS = {
  CRITICAL: 3,  // Shake animation
  URGENT: 5,    // Pulsing animation
  WARNING: 10,  // Yellow color
} as const;

// ==================== Helper Functions ====================

/**
 * Get timer color based on remaining time percentage
 */
function getTimerColors(percentage: number): { bg: string; text: string; stroke: string } {
  if (percentage <= 20) {
    return {
      bg: 'bg-error/10',
      text: 'text-error',
      stroke: '#EF4444',
    };
  }
  if (percentage <= 40) {
    return {
      bg: 'bg-warning/10',
      text: 'text-warning',
      stroke: '#F59E0B',
    };
  }
  return {
    bg: 'bg-primary/10',
    text: 'text-primary',
    stroke: '#275249',
  };
}

/**
 * Trigger haptic feedback on mobile devices
 * Uses the Vibration API when available
 */
function triggerHapticFeedback(pattern: 'tick' | 'urgent' | 'critical'): void {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) return;
  
  try {
    switch (pattern) {
      case 'tick':
        // Short subtle vibration for each second
        navigator.vibrate(10);
        break;
      case 'urgent':
        // Double pulse for urgent (≤5 seconds)
        navigator.vibrate([30, 50, 30]);
        break;
      case 'critical':
        // Triple pulse for critical (≤3 seconds)
        navigator.vibrate([50, 30, 50, 30, 50]);
        break;
    }
  } catch {
    // Vibration API may fail silently on some devices
  }
}

// ==================== Sub-Components ====================

/**
 * Animated number display that slides up/down when value changes
 */
function AnimatedNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const displayValue = Math.max(0, value);
  
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={displayValue}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 30,
            mass: 0.8,
          }}
          className="block tabular-nums"
        >
          {displayValue}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/**
 * Compact timer display for mobile with enhanced animations
 * 
 * Features:
 * - Animated number transitions when seconds change
 * - Pulsing animation when time is low (≤5 seconds)
 * - Shake animation at critical time (≤3 seconds)
 * - Optional haptic feedback on mobile devices
 * - Smooth progress bar animation
 * - Touch-friendly sizing (min 44px height)
 * 
 * Requirements: 14.3, 14.9
 */
function MobileTimer({
  remainingSeconds,
  totalTimeLimit,
  enableHaptics = true,
}: {
  remainingSeconds: number;
  totalTimeLimit: number;
  enableHaptics?: boolean;
}) {
  const prevSecondsRef = React.useRef(remainingSeconds);
  
  const percentage = React.useMemo(() => {
    if (totalTimeLimit <= 0) return 0;
    return Math.max(0, Math.min(100, (remainingSeconds / totalTimeLimit) * 100));
  }, [remainingSeconds, totalTimeLimit]);

  const colors = React.useMemo(() => getTimerColors(percentage), [percentage]);
  
  const isCritical = remainingSeconds <= TIMER_THRESHOLDS.CRITICAL && remainingSeconds > 0;
  const isUrgent = remainingSeconds <= TIMER_THRESHOLDS.URGENT && remainingSeconds > TIMER_THRESHOLDS.CRITICAL;
  const isWarning = remainingSeconds <= TIMER_THRESHOLDS.WARNING && remainingSeconds > TIMER_THRESHOLDS.URGENT;

  // Trigger haptic feedback when seconds change
  React.useEffect(() => {
    if (!enableHaptics) return;
    
    // Only trigger on actual countdown (not initial render or increases)
    if (prevSecondsRef.current > remainingSeconds && remainingSeconds > 0) {
      if (isCritical) {
        triggerHapticFeedback('critical');
      } else if (isUrgent) {
        triggerHapticFeedback('urgent');
      } else if (remainingSeconds <= TIMER_THRESHOLDS.WARNING) {
        triggerHapticFeedback('tick');
      }
    }
    
    prevSecondsRef.current = remainingSeconds;
  }, [remainingSeconds, isCritical, isUrgent, enableHaptics]);

  // Define animation variants
  const containerVariants = {
    idle: {},
    warning: {
      scale: [1, 1.02, 1],
      transition: { duration: 1, repeat: Infinity, ease: 'easeInOut' },
    },
    urgent: {
      scale: [1, 1.05, 1],
      transition: { duration: 0.6, repeat: Infinity, ease: 'easeInOut' },
    },
    critical: {
      scale: [1, 1.08, 1],
      x: [0, -2, 2, -2, 2, 0],
      transition: {
        scale: { duration: 0.4, repeat: Infinity, ease: 'easeInOut' },
        x: { duration: 0.4, repeat: Infinity, ease: 'easeInOut' },
      },
    },
  };

  const getAnimationState = () => {
    if (isCritical) return 'critical';
    if (isUrgent) return 'urgent';
    if (isWarning) return 'warning';
    return 'idle';
  };

  return (
    <motion.div
      className={`
        inline-flex items-center gap-1.5 sm:gap-2 
        neu-raised-sm rounded-lg px-2 sm:px-3 py-1.5 sm:py-2
        touch-target-44 touch-action-manipulation
        ${colors.bg}
        ${isCritical ? 'ring-2 ring-error/50' : ''}
        ${isUrgent ? 'ring-1 ring-warning/30' : ''}
      `}
      variants={containerVariants}
      animate={getAnimationState()}
      aria-live="polite"
      aria-label={`${remainingSeconds} seconds remaining`}
    >
      {/* Timer icon with pulse effect */}
      <motion.div
        animate={
          isCritical || isUrgent
            ? {
                scale: [1, 1.2, 1],
                opacity: [1, 0.7, 1],
              }
            : {}
        }
        transition={{
          duration: isCritical ? 0.3 : 0.5,
          repeat: isCritical || isUrgent ? Infinity : 0,
          ease: 'easeInOut',
        }}
        className="flex-shrink-0"
      >
        <svg
          className={`w-4 h-4 sm:w-5 sm:h-5 ${colors.text}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </motion.div>

      {/* Animated time display */}
      <AnimatedNumber
        value={remainingSeconds}
        className={`text-lg sm:text-xl font-bold font-display ${colors.text}`}
      />
      <span className={`text-xs sm:text-sm font-medium ${colors.text}`}>sec</span>

      {/* Progress bar with smooth animation - hidden on very small screens */}
      <div className="hidden xs:block w-12 sm:w-16 h-1.5 sm:h-2 rounded-full bg-[var(--shadow-dark)]/30 overflow-hidden">
        <motion.div
          className="h-full rounded-full origin-left"
          style={{ backgroundColor: colors.stroke }}
          initial={false}
          animate={{ 
            scaleX: percentage / 100,
            opacity: isCritical ? [1, 0.6, 1] : 1,
          }}
          transition={{
            scaleX: { duration: 0.3, ease: 'easeOut' },
            opacity: { duration: 0.3, repeat: isCritical ? Infinity : 0 },
          }}
        />
      </div>

      {/* Critical time indicator dot */}
      <AnimatePresence>
        {isCritical && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ 
              scale: [1, 1.5, 1],
              opacity: [1, 0.5, 1],
            }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{
              duration: 0.4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-error flex-shrink-0"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Question progress indicator
 */
function QuestionProgress({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
      <span className="font-semibold text-primary">{current}</span>
      <span>/</span>
      <span>{total}</span>
    </div>
  );
}

/**
 * Question image display
 */
function QuestionImage({ imageUrl, alt }: { imageUrl: string; alt: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="w-full rounded-lg overflow-hidden neu-pressed mb-4"
    >
      <img
        src={imageUrl}
        alt={alt}
        className="w-full h-auto max-h-48 object-contain bg-[var(--neu-surface)]"
        loading="eager"
      />
    </motion.div>
  );
}

/**
 * Submission confirmation overlay
 */
function SubmissionConfirmation() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-24 left-4 right-4 z-10"
    >
      <div className="neu-raised-lg rounded-xl p-4 bg-success/10 border border-success/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-6 h-6 text-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-success">Answer Submitted!</p>
            <p className="text-sm text-[var(--text-secondary)]">
              Waiting for results...
            </p>
          </div>
        </div>
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

/**
 * Spectator-aware option button with visual disabled state
 * Shows options as grayed out and non-interactive for spectators
 * Touch-friendly with minimum 44px tap target
 */
function SpectatorOptionButton({
  option,
  label,
  isSelected,
  isDisabled,
  isSpectator,
  hasImage,
  onSelect,
}: {
  option: QuestionOption;
  label: string;
  isSelected: boolean;
  isDisabled: boolean;
  isSpectator: boolean;
  hasImage: boolean;
  onSelect: () => void;
}) {
  // Spectator-specific styling: grayed out, no hover effects
  const spectatorStyles = isSpectator
    ? 'opacity-60 cursor-default pointer-events-none'
    : '';

  return (
    <motion.button
      onClick={onSelect}
      disabled={isDisabled}
      whileTap={!isDisabled && !isSpectator ? { scale: 0.98 } : undefined}
      className={`
        w-full min-h-[56px] p-3 sm:p-4 rounded-xl text-left
        flex items-center gap-2 sm:gap-3
        transition-all duration-200
        touch-target-44 touch-action-manipulation tap-highlight-none select-none-touch
        ${spectatorStyles}
        ${
          isSelected && !isSpectator
            ? 'bg-primary text-white shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]'
            : isSpectator
              ? 'neu-raised-sm bg-[var(--neu-surface)]'
              : 'neu-raised hover:shadow-[6px_6px_12px_var(--shadow-dark),-6px_-6px_12px_var(--shadow-light)] active:shadow-[inset_2px_2px_4px_var(--shadow-dark),inset_-2px_-2px_4px_var(--shadow-light)]'
        }
        ${isDisabled && !isSelected && !isSpectator ? 'opacity-60 cursor-not-allowed' : ''}
        ${isDisabled && isSelected && !isSpectator ? 'cursor-not-allowed' : ''}
      `}
      aria-pressed={isSelected}
      aria-disabled={isDisabled || isSpectator}
    >
      {/* Option label (A, B, C, D) - Touch-friendly size */}
      <span
        className={`
          flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center
          font-bold text-base sm:text-lg
          ${
            isSelected && !isSpectator
              ? 'bg-white/20 text-white'
              : isSpectator
                ? 'bg-[var(--shadow-dark)]/10 text-[var(--text-secondary)]'
                : 'bg-[var(--neu-surface)] text-primary'
          }
        `}
      >
        {label}
      </span>

      {/* Option content */}
      <div className="flex-1 min-w-0">
        {/* Option image if present */}
        {hasImage && option.optionImageUrl && (
          <div className="mb-2 rounded-lg overflow-hidden">
            <img
              src={option.optionImageUrl}
              alt={`Option ${label}`}
              className={`w-full h-auto max-h-20 sm:max-h-24 object-contain ${isSpectator ? 'opacity-70' : ''}`}
              loading="lazy"
            />
          </div>
        )}

        {/* Option text - Mobile-optimized font size */}
        <span
          className={`
            text-sm sm:text-base font-medium leading-snug [&_p]:m-0 [&_p]:inline
            ${
              isSelected && !isSpectator 
                ? 'text-white' 
                : isSpectator
                  ? 'text-[var(--text-secondary)]'
                  : 'text-[var(--text-primary)]'
            }
          `}
          dangerouslySetInnerHTML={{ __html: option.optionText }}
        />
      </div>

      {/* Selection indicator (only for non-spectators) */}
      <AnimatePresence>
        {isSelected && !isSpectator && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/20 flex items-center justify-center"
          >
            <svg
              className="w-3 h-3 sm:w-4 sm:h-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/**
 * Footer message for spectators instead of submit button
 */
function SpectatorFooter({ isEliminated }: { isEliminated: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        w-full py-4 px-6 rounded-xl text-center
        ${isEliminated 
          ? 'bg-error/10 border border-error/20' 
          : 'bg-primary/10 border border-primary/20'
        }
      `}
    >
      <div className="flex items-center justify-center gap-3">
        {/* Eye icon */}
        <svg
          className={`w-5 h-5 ${isEliminated ? 'text-error' : 'text-primary'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
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
        
        <span className={`font-medium ${isEliminated ? 'text-error' : 'text-primary'}`}>
          Watching as spectator
        </span>

        {/* Pulsing live indicator */}
        <motion.span
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className={`w-2 h-2 rounded-full ${isEliminated ? 'bg-error' : 'bg-primary'}`}
          aria-hidden="true"
        />
      </div>
    </motion.div>
  );
}

/**
 * Compact score indicator for the header
 * Shows current score and streak during questions
 */
function ScoreHeader({
  score,
  streak,
}: {
  score?: number;
  streak?: number;
}) {
  // Don't render if no score data
  if (score === undefined || score === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2"
    >
      {/* Score badge */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10">
        <svg
          className="w-3.5 h-3.5 text-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
        <span className="text-sm font-bold text-primary tabular-nums">{score}</span>
      </div>

      {/* Streak indicator (only show if streak >= 2) */}
      {streak !== undefined && streak >= 2 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/10"
        >
          <span className="text-sm" role="img" aria-label="fire">🔥</span>
          <span className="text-sm font-bold text-orange-500">{streak}</span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ==================== Main Component ====================

/**
 * Question Screen Component
 * 
 * Displays the question answering interface for participants.
 * Mobile-first design with touch-friendly buttons.
 * Supports spectator mode for late joiners and eliminated participants.
 * 
 * @example
 * ```tsx
 * <QuestionScreen
 *   question={questionData}
 *   questionIndex={0}
 *   totalQuestions={10}
 *   remainingSeconds={30}
 *   hasSubmitted={false}
 *   selectedOptions={['opt1']}
 *   onSelectOption={(id) => handleSelect(id)}
 *   onSubmit={() => handleSubmit()}
 *   isConnected={true}
 *   isSpectator={false}
 * />
 * ```
 */
export function QuestionScreen({
  question,
  questionIndex,
  totalQuestions,
  remainingSeconds,
  hasSubmitted,
  selectedOptions,
  onSelectOption,
  onSubmit,
  isConnected,
  currentScore,
  currentStreak,
  isSpectator = false,
  isEliminated = false,
}: QuestionScreenProps) {
  // Determine if this is a multi-answer question
  const isMultiAnswer = question.questionType === 'MULTI_CORRECT' || 
                        question.questionType === 'MULTIPLE_CHOICE_MULTI';

  // Check if any option has an image
  const hasOptionImages = question.options.some((opt) => opt.optionImageUrl);

  // Check if submit button should be enabled (disabled for spectators)
  const canSubmit = selectedOptions.length > 0 && !hasSubmitted && isConnected && !isSpectator;

  // Options are disabled for spectators or after submission
  const optionsDisabled = hasSubmitted || isSpectator;

  // Handle option selection (no-op for spectators)
  const handleOptionSelect = React.useCallback(
    (optionId: string) => {
      if (hasSubmitted || isSpectator) return;
      onSelectOption(optionId);
    },
    [hasSubmitted, isSpectator, onSelectOption]
  );

  return (
    <main className="min-h-screen-mobile flex flex-col bg-[var(--neu-bg)] overscroll-none">
      {/* Connection indicator */}
      <ConnectionIndicator isConnected={isConnected} />

      {/* Header with timer, progress, and score - Safe area aware */}
      <header className="sticky top-0 z-10 bg-[var(--neu-bg)] border-b border-[var(--border)] px-3 sm:px-4 py-2 sm:py-3 safe-area-inset-top">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <QuestionProgress
            current={questionIndex + 1}
            total={totalQuestions}
          />
          {/* Show spectator badge in header for compact display */}
          {isSpectator ? (
            <SpectatorBadge 
              isVisible={true} 
              variant="badge" 
              isEliminated={isEliminated}
            />
          ) : (
            <ScoreHeader score={currentScore} streak={currentStreak} />
          )}
          <MobileTimer
            remainingSeconds={remainingSeconds}
            totalTimeLimit={question.timeLimit}
          />
        </div>
      </header>

      {/* Main content area - Optimized padding for mobile */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 sm:py-4 pb-24 sm:pb-28 overscroll-contain">
        {/* Spectator mode banner */}
        {isSpectator && (
          <div className="mb-3 sm:mb-4">
            <SpectatorBadge 
              isVisible={true} 
              variant="banner"
              isEliminated={isEliminated}
              message={isEliminated 
                ? "You've been eliminated - watching as spectator" 
                : "You joined late - watching as spectator"
              }
            />
          </div>
        )}

        {/* Question card - Responsive padding */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="neu-raised-lg rounded-xl p-4 sm:p-5 mb-4 sm:mb-6"
        >
          {/* Question image */}
          {question.questionImageUrl && (
            <QuestionImage
              imageUrl={question.questionImageUrl}
              alt={`Question ${questionIndex + 1} image`}
            />
          )}

          {/* Question text - Mobile-optimized font size (min 16px) */}
          <h2 
            className="text-base sm:text-lg font-semibold text-[var(--text-primary)] leading-relaxed [&_p]:m-0 [&_p]:inline"
            dangerouslySetInnerHTML={{ __html: question.questionText }}
          />

          {/* Multi-answer hint */}
          {isMultiAnswer && !isSpectator && (
            <p className="mt-2 text-xs sm:text-sm text-[var(--text-secondary)]">
              Select all that apply
            </p>
          )}
        </motion.div>

        {/* Answer options - Compact spacing on mobile */}
        <div className="space-y-2 sm:space-y-3">
          <AnimatePresence mode="wait">
            {question.options.map((option, index) => (
              <motion.div
                key={option.optionId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
              >
                <SpectatorOptionButton
                  option={option}
                  label={OPTION_LABELS[index] || String(index + 1)}
                  isSelected={selectedOptions.includes(option.optionId)}
                  isDisabled={optionsDisabled}
                  isSpectator={isSpectator}
                  hasImage={hasOptionImages}
                  onSelect={() => handleOptionSelect(option.optionId)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Submission confirmation */}
      <AnimatePresence>
        {hasSubmitted && !isSpectator && <SubmissionConfirmation />}
      </AnimatePresence>

      {/* Submit button - Fixed at bottom with safe area */}
      <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-[var(--neu-bg)] border-t border-[var(--border)] safe-area-inset-bottom safe-area-inset-x">
        {isSpectator ? (
          <SpectatorFooter isEliminated={isEliminated} />
        ) : (
          <motion.button
            onClick={onSubmit}
            disabled={!canSubmit}
            whileTap={canSubmit ? { scale: 0.98 } : undefined}
            className={`
              w-full py-3.5 sm:py-4 px-4 sm:px-6 rounded-xl font-semibold text-base sm:text-lg
              transition-all duration-200
              touch-target-48 touch-action-manipulation tap-highlight-none select-none-touch
              ${
                canSubmit
                  ? 'bg-primary text-white shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)] hover:bg-primary-light active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]'
                  : hasSubmitted
                    ? 'bg-success/20 text-success cursor-not-allowed'
                    : 'bg-[var(--neu-surface)] text-[var(--text-muted)] cursor-not-allowed'
              }
            `}
            aria-disabled={!canSubmit}
          >
            {hasSubmitted ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="w-4 h-4 sm:w-5 sm:h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Submitted
              </span>
            ) : selectedOptions.length === 0 ? (
              'Select an answer'
            ) : (
              'Submit Answer'
            )}
          </motion.button>
        )}
      </div>
    </main>
  );
}

export default QuestionScreen;
