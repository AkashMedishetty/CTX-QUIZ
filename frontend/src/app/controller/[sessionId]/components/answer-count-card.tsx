/**
 * Answer Count Card - Live answer submission counter for the controller
 * 
 * Displays:
 * - Live count of submitted answers (e.g., "45 / 100")
 * - Percentage with animated circular progress bar
 * - Visual indicator when all participants have answered
 * - Animated count changes with number rolling effect
 * - "Waiting for answers..." when no answers yet
 * - Pulse animation when new answers come in
 * 
 * Requirements: 13.5
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';

/**
 * Answer count data interface
 */
export interface AnswerCountData {
  /** Current question ID */
  questionId: string;
  /** Number of participants who have answered */
  answeredCount: number;
  /** Total number of active participants */
  totalParticipants: number;
  /** Percentage of participants who have answered */
  percentage: number;
}

/**
 * Answer count card props
 */
interface AnswerCountCardProps {
  /** Answer count data from the session state */
  answerCount: AnswerCountData | null;
  /** Whether a question is currently active */
  isQuestionActive: boolean;
  /** Total participant count (fallback when answerCount is null) */
  participantCount?: number;
}

/**
 * Animated number component with rolling effect
 */
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const spring = useSpring(value, { stiffness: 100, damping: 20 });
  const display = useTransform(spring, (current) => Math.round(current));
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  useEffect(() => {
    const unsubscribe = display.on('change', (latest) => {
      setDisplayValue(latest);
    });
    return unsubscribe;
  }, [display]);

  return (
    <motion.span
      key={value}
      initial={{ scale: 1.1, color: 'var(--color-primary)' }}
      animate={{ scale: 1, color: 'inherit' }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      {displayValue}
    </motion.span>
  );
}

/**
 * Circular progress indicator for answer percentage
 */
function CircularAnswerProgress({
  percentage,
  answeredCount,
  totalParticipants,
  isComplete,
}: {
  percentage: number;
  answeredCount: number;
  totalParticipants: number;
  isComplete: boolean;
}) {
  const size = 160;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Determine color based on percentage
  const getStrokeColor = () => {
    if (isComplete) return 'var(--color-success)';
    if (percentage >= 80) return 'var(--color-success)';
    if (percentage >= 50) return 'var(--color-primary)';
    if (percentage >= 25) return 'var(--color-warning)';
    return 'var(--color-info)';
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Background circle */}
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--shadow-dark)"
          strokeWidth={strokeWidth}
          className="opacity-20"
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getStrokeColor()}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-baseline gap-1">
          <AnimatedNumber
            value={answeredCount}
            className="font-display text-h1 font-bold text-[var(--text-primary)]"
          />
          <span className="text-h3 text-[var(--text-muted)]">/</span>
          <span className="text-h3 font-semibold text-[var(--text-secondary)]">
            {totalParticipants}
          </span>
        </div>
        <span className="text-caption text-[var(--text-muted)] mt-1">
          {isComplete ? 'All answered!' : 'answered'}
        </span>
      </div>

      {/* Complete indicator pulse */}
      {isComplete && (
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-success"
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{ scale: 1.15, opacity: 0 }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </div>
  );
}

/**
 * Linear progress bar for answer percentage
 */
function LinearAnswerProgress({
  percentage,
  isComplete,
}: {
  percentage: number;
  isComplete: boolean;
}) {
  // Determine color based on percentage
  const getBarColor = () => {
    if (isComplete) return 'bg-success';
    if (percentage >= 80) return 'bg-success';
    if (percentage >= 50) return 'bg-primary';
    if (percentage >= 25) return 'bg-warning';
    return 'bg-info';
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-body-sm text-[var(--text-secondary)]">
          Response Rate
        </span>
        <motion.span
          key={percentage}
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          className={`text-body-sm font-semibold ${
            isComplete ? 'text-success' : 'text-[var(--text-primary)]'
          }`}
        >
          {Math.round(percentage)}%
        </motion.span>
      </div>
      <div className="h-3 rounded-full bg-[var(--shadow-dark)]/20 overflow-hidden neu-pressed">
        <motion.div
          className={`h-full rounded-full ${getBarColor()}`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

/**
 * Pulse indicator for new answers
 */
function NewAnswerPulse({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 2, opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute top-4 right-4 w-3 h-3 rounded-full bg-primary"
        />
      )}
    </AnimatePresence>
  );
}

/**
 * Answer Count Card Component
 * 
 * Displays live count of submitted answers with animated progress indicators.
 */
export function AnswerCountCard({
  answerCount,
  isQuestionActive,
  participantCount = 0,
}: AnswerCountCardProps) {
  const [showPulse, setShowPulse] = useState(false);
  const prevCountRef = useRef<number>(0);

  // Track answer count changes for pulse animation
  useEffect(() => {
    if (answerCount && answerCount.answeredCount > prevCountRef.current) {
      setShowPulse(true);
      const timer = setTimeout(() => setShowPulse(false), 600);
      prevCountRef.current = answerCount.answeredCount;
      return () => clearTimeout(timer);
    }
    if (!answerCount) {
      prevCountRef.current = 0;
    }
    return undefined;
  }, [answerCount?.answeredCount]);

  // Calculate values
  const answeredCount = answerCount?.answeredCount ?? 0;
  const totalParticipants = answerCount?.totalParticipants ?? participantCount;
  const percentage = answerCount?.percentage ?? 0;
  const isComplete = totalParticipants > 0 && answeredCount >= totalParticipants;
  const hasAnswers = answeredCount > 0;

  // Get status badge content
  const getStatusBadge = () => {
    if (!isQuestionActive) {
      return { text: 'No Active Question', color: 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]' };
    }
    if (isComplete) {
      return { text: 'All Answered', color: 'bg-success/10 text-success' };
    }
    if (percentage >= 80) {
      return { text: 'Almost Complete', color: 'bg-success/10 text-success' };
    }
    if (hasAnswers) {
      return { text: 'Collecting Answers', color: 'bg-primary/10 text-primary' };
    }
    return { text: 'Waiting for Answers', color: 'bg-info/10 text-info' };
  };

  const statusBadge = getStatusBadge();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-xl overflow-hidden relative"
    >
      {/* Pulse indicator for new answers */}
      <NewAnswerPulse show={showPulse} />

      {/* Header */}
      <div className="bg-primary/5 border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center justify-between">
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
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
                Answer Submissions
              </h2>
              <p className="text-caption text-[var(--text-muted)]">
                Live response tracking
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <motion.div
            key={statusBadge.text}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`px-3 py-1.5 rounded-full text-body-sm font-medium ${statusBadge.color}`}
          >
            {statusBadge.text}
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          {/* No Active Question State */}
          {!isQuestionActive && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-8"
            >
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-[var(--text-muted)]/10 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-[var(--text-muted)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <p className="text-body text-[var(--text-secondary)]">
                Answer counter will appear when a question is active
              </p>
            </motion.div>
          )}

          {/* Active Question - Waiting for Answers */}
          {isQuestionActive && !hasAnswers && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-6"
            >
              <div className="relative w-20 h-20 mx-auto mb-4">
                <div className="absolute inset-0 rounded-full bg-info/10 flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-info"
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
                {/* Pulsing ring */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-info"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.3, opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              </div>
              <p className="text-body font-medium text-[var(--text-primary)] mb-1">
                Waiting for answers...
              </p>
              <p className="text-body-sm text-[var(--text-muted)]">
                {totalParticipants} participant{totalParticipants !== 1 ? 's' : ''} can respond
              </p>
            </motion.div>
          )}

          {/* Active Question - Has Answers */}
          {isQuestionActive && hasAnswers && (
            <motion.div
              key="active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              {/* Circular Progress */}
              <div className="mb-6">
                <CircularAnswerProgress
                  percentage={percentage}
                  answeredCount={answeredCount}
                  totalParticipants={totalParticipants}
                  isComplete={isComplete}
                />
              </div>

              {/* Linear Progress Bar */}
              <div className="w-full max-w-xs">
                <LinearAnswerProgress
                  percentage={percentage}
                  isComplete={isComplete}
                />
              </div>

              {/* Stats Row */}
              <div className="flex items-center gap-4 mt-6">
                <div className="neu-pressed rounded-lg px-4 py-2 text-center">
                  <p className="text-caption text-[var(--text-muted)]">Answered</p>
                  <p className="text-h3 font-bold text-success">
                    {answeredCount}
                  </p>
                </div>
                <div className="neu-pressed rounded-lg px-4 py-2 text-center">
                  <p className="text-caption text-[var(--text-muted)]">Pending</p>
                  <p className="text-h3 font-bold text-warning">
                    {Math.max(0, totalParticipants - answeredCount)}
                  </p>
                </div>
              </div>

              {/* Complete Message */}
              {isComplete && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 flex items-center gap-2 text-success"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="text-body font-medium">
                    All participants have answered!
                  </span>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default AnswerCountCard;
