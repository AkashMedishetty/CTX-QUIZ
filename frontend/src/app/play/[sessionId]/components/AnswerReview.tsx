/**
 * AnswerReview Component
 * 
 * Displays a summary of all questions and the participant's answers at the end of a quiz.
 * Shows correct/incorrect status, points earned per question, and explanation text.
 * 
 * Mobile-first neumorphic design with Framer Motion animations.
 * Optimized for 320px-428px width with:
 * - Touch-friendly UI (44px min tap targets)
 * - Safe area insets for notched devices
 * - Responsive typography and spacing
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 * Property 11: Answer Review Completeness
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CopyPrevention } from '@/components/CopyPrevention';

// ==================== Types ====================

export interface AnswerReviewOption {
  optionId: string;
  optionText: string;
  isCorrect: boolean;
}

export interface AnswerReviewQuestion {
  questionId: string;
  questionText: string;
  options: AnswerReviewOption[];
  participantAnswer: string[];
  correctAnswer: string[];
  pointsEarned: number;
  maxPoints: number;
  explanationText?: string;
}

export interface AnswerReviewProps {
  /** Array of questions with participant answers and correct answers */
  questions: AnswerReviewQuestion[];
  /** Total score earned across all questions */
  totalScore: number;
  /** Total number of questions in the quiz */
  totalQuestions: number;
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
      delayChildren: 0.1,
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

const expandVariants = {
  collapsed: { 
    height: 0, 
    opacity: 0,
    transition: {
      height: { duration: 0.3, ease: 'easeInOut' },
      opacity: { duration: 0.2 },
    },
  },
  expanded: { 
    height: 'auto', 
    opacity: 1,
    transition: {
      height: { duration: 0.3, ease: 'easeInOut' },
      opacity: { duration: 0.2, delay: 0.1 },
    },
  },
};

// ==================== Helper Functions ====================

/**
 * Determine if the participant's answer was correct for a question
 */
function isAnswerCorrect(
  participantAnswer: string[],
  correctAnswer: string[]
): boolean {
  if (participantAnswer.length !== correctAnswer.length) return false;
  const sortedParticipant = [...participantAnswer].sort();
  const sortedCorrect = [...correctAnswer].sort();
  return sortedParticipant.every((ans, idx) => ans === sortedCorrect[idx]);
}

/**
 * Get the option label (A, B, C, etc.) for an option ID
 */
function getOptionLabel(options: AnswerReviewOption[], optionId: string): string {
  const index = options.findIndex((opt) => opt.optionId === optionId);
  return index >= 0 ? OPTION_LABELS[index] || String(index + 1) : '?';
}

// ==================== Sub-Components ====================

/**
 * Summary header showing overall performance
 * Validates: Requirement 8.1
 */
function SummaryHeader({
  totalScore,
  totalQuestions,
  correctCount,
}: {
  totalScore: number;
  totalQuestions: number;
  correctCount: number;
}) {
  const percentage = totalQuestions > 0 
    ? Math.round((correctCount / totalQuestions) * 100) 
    : 0;

  return (
    <motion.div
      variants={itemVariants}
      className="neu-raised-lg rounded-xl p-4 sm:p-6 mb-4 sm:mb-6"
    >
      <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] mb-4 text-center">
        Quiz Summary
      </h2>
      
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {/* Total Score */}
        <div className="text-center">
          <motion.p
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, delay: 0.2 }}
            className="text-2xl sm:text-3xl font-bold font-display text-primary"
          >
            {totalScore}
          </motion.p>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Total Points
          </p>
        </div>

        {/* Correct Answers */}
        <div className="text-center border-x border-[var(--border)]">
          <motion.p
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, delay: 0.3 }}
            className="text-2xl sm:text-3xl font-bold font-display text-success"
          >
            {correctCount}
            <span className="text-lg sm:text-xl text-[var(--text-secondary)]">
              /{totalQuestions}
            </span>
          </motion.p>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Correct
          </p>
        </div>

        {/* Percentage */}
        <div className="text-center">
          <motion.p
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, delay: 0.4 }}
            className={`text-2xl sm:text-3xl font-bold font-display ${
              percentage >= 70 ? 'text-success' : percentage >= 50 ? 'text-warning' : 'text-error'
            }`}
          >
            {percentage}%
          </motion.p>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Score
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Correct/Incorrect status indicator icon
 * Validates: Requirement 8.2
 */
function StatusIcon({ isCorrect }: { isCorrect: boolean }) {
  if (isCorrect) {
    return (
      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
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
      </div>
    );
  }

  return (
    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-error/20 flex items-center justify-center flex-shrink-0">
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
    </div>
  );
}

/**
 * Points earned badge
 * Validates: Requirement 8.4
 */
function PointsBadge({ 
  pointsEarned, 
  maxPoints 
}: { 
  pointsEarned: number; 
  maxPoints: number;
}) {
  const isFullPoints = pointsEarned === maxPoints && maxPoints > 0;
  const hasPoints = pointsEarned > 0;

  return (
    <div
      className={`
        px-2 py-1 rounded-lg text-xs sm:text-sm font-semibold
        ${isFullPoints 
          ? 'bg-success/15 text-success' 
          : hasPoints 
            ? 'bg-primary/15 text-primary' 
            : 'bg-[var(--neu-surface)] text-[var(--text-secondary)]'
        }
      `}
    >
      +{pointsEarned}
      {maxPoints > 0 && (
        <span className="text-[var(--text-muted)] font-normal">
          /{maxPoints}
        </span>
      )}
    </div>
  );
}

/**
 * Option display showing correct/incorrect/selected status
 * Validates: Requirements 8.2, 8.3
 */
function OptionDisplay({
  option,
  label,
  isCorrectOption,
  wasSelected,
}: {
  option: AnswerReviewOption;
  label: string;
  isCorrectOption: boolean;
  wasSelected: boolean;
}) {
  const wasSelectedCorrectly = wasSelected && isCorrectOption;
  const wasSelectedIncorrectly = wasSelected && !isCorrectOption;

  return (
    <div
      className={`
        flex items-center gap-2 p-2 rounded-lg text-sm
        ${wasSelectedCorrectly 
          ? 'bg-success/15 border border-success/30' 
          : wasSelectedIncorrectly 
            ? 'bg-error/10 border border-error/30' 
            : isCorrectOption 
              ? 'bg-success/10 border border-success/20' 
              : 'bg-[var(--neu-surface)]/50'
        }
      `}
    >
      {/* Option label */}
      <span
        className={`
          flex-shrink-0 w-6 h-6 rounded flex items-center justify-center
          text-xs font-bold
          ${wasSelectedCorrectly 
            ? 'bg-success text-white' 
            : wasSelectedIncorrectly 
              ? 'bg-error text-white' 
              : isCorrectOption 
                ? 'bg-success/20 text-success' 
                : 'bg-[var(--neu-surface)] text-[var(--text-secondary)]'
          }
        `}
      >
        {label}
      </span>

      {/* Option text */}
      <span
        className={`
          flex-1 text-xs sm:text-sm
          ${wasSelectedCorrectly || isCorrectOption 
            ? 'text-[var(--text-primary)]' 
            : wasSelectedIncorrectly 
              ? 'text-error' 
              : 'text-[var(--text-secondary)]'
          }
        `}
        dangerouslySetInnerHTML={{ __html: option.optionText }}
      />

      {/* Status icon */}
      {(isCorrectOption || wasSelected) && (
        <span className="flex-shrink-0">
          {isCorrectOption ? (
            <svg
              className="w-4 h-4 text-success"
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
              className="w-4 h-4 text-error"
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
    </div>
  );
}

/**
 * Explanation text display
 * Validates: Requirement 8.5
 */
function ExplanationText({ text }: { text: string }) {
  return (
    <div className="mt-3 p-3 rounded-lg bg-info/10 border border-info/20">
      <div className="flex items-start gap-2">
        <svg
          className="w-4 h-4 text-info flex-shrink-0 mt-0.5"
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
        <div>
          <p className="text-xs font-semibold text-info mb-1">Explanation</p>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Individual question review card
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */
function QuestionReviewCard({
  question,
  questionNumber,
  isExpanded,
  onToggle,
}: {
  question: AnswerReviewQuestion;
  questionNumber: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isCorrect = isAnswerCorrect(question.participantAnswer, question.correctAnswer);
  const didNotAnswer = question.participantAnswer.length === 0;

  return (
    <motion.div
      variants={itemVariants}
      className={`
        neu-raised rounded-xl overflow-hidden
        ${isCorrect ? 'ring-1 ring-success/20' : didNotAnswer ? 'ring-1 ring-warning/20' : 'ring-1 ring-error/20'}
      `}
    >
      {/* Collapsed header - always visible */}
      <button
        onClick={onToggle}
        className="w-full p-3 sm:p-4 flex items-center gap-3 text-left touch-target-44"
        aria-expanded={isExpanded}
        aria-controls={`question-${question.questionId}-details`}
      >
        {/* Question number */}
        <div
          className={`
            flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center
            font-bold text-sm sm:text-base
            ${isCorrect 
              ? 'bg-success/15 text-success' 
              : didNotAnswer 
                ? 'bg-warning/15 text-warning' 
                : 'bg-error/15 text-error'
            }
          `}
        >
          {questionNumber}
        </div>

        {/* Question text preview */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm sm:text-base font-medium text-[var(--text-primary)] line-clamp-2"
            dangerouslySetInnerHTML={{ __html: question.questionText }}
          />
          {didNotAnswer && (
            <p className="text-xs text-warning mt-1">Not answered</p>
          )}
        </div>

        {/* Status and points */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <PointsBadge 
            pointsEarned={question.pointsEarned} 
            maxPoints={question.maxPoints} 
          />
          <StatusIcon isCorrect={isCorrect} />
        </div>

        {/* Expand/collapse chevron */}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0"
        >
          <svg
            className="w-5 h-5 text-[var(--text-secondary)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </motion.div>
      </button>

      {/* Expanded details */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id={`question-${question.questionId}-details`}
            variants={expandVariants}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            className="overflow-hidden"
          >
            <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-[var(--border)]">
              {/* Full question text */}
              <div className="pt-3 mb-3">
                <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">
                  Question
                </p>
                <p
                  className="text-sm sm:text-base text-[var(--text-primary)]"
                  dangerouslySetInnerHTML={{ __html: question.questionText }}
                />
              </div>

              {/* Answer options */}
              <div className="mb-3">
                <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">
                  {isCorrect ? 'Your Answer' : 'Answers'}
                </p>
                <div className="space-y-1.5">
                  {question.options.map((option, index) => (
                    <OptionDisplay
                      key={option.optionId}
                      option={option}
                      label={OPTION_LABELS[index] || String(index + 1)}
                      isCorrectOption={question.correctAnswer.includes(option.optionId)}
                      wasSelected={question.participantAnswer.includes(option.optionId)}
                    />
                  ))}
                </div>
              </div>

              {/* Your answer summary (if incorrect) */}
              {!isCorrect && question.participantAnswer.length > 0 && (
                <div className="mb-3 p-2 rounded-lg bg-error/5">
                  <p className="text-xs text-[var(--text-secondary)]">
                    <span className="font-semibold">Your answer: </span>
                    {question.participantAnswer
                      .map((id) => getOptionLabel(question.options, id))
                      .join(', ')}
                  </p>
                  <p className="text-xs text-success mt-1">
                    <span className="font-semibold">Correct answer: </span>
                    {question.correctAnswer
                      .map((id) => getOptionLabel(question.options, id))
                      .join(', ')}
                  </p>
                </div>
              )}

              {/* Explanation text (if available) */}
              {question.explanationText && (
                <ExplanationText text={question.explanationText} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ==================== Main Component ====================

/**
 * AnswerReview Component
 * 
 * Displays a comprehensive review of all questions and answers at the end of a quiz.
 * Shows correct/incorrect status, points earned, and explanations.
 * 
 * @example
 * ```tsx
 * <AnswerReview
 *   questions={[
 *     {
 *       questionId: 'q1',
 *       questionText: 'What is 2 + 2?',
 *       options: [
 *         { optionId: 'a', optionText: '3', isCorrect: false },
 *         { optionId: 'b', optionText: '4', isCorrect: true },
 *       ],
 *       participantAnswer: ['b'],
 *       correctAnswer: ['b'],
 *       pointsEarned: 100,
 *       maxPoints: 100,
 *       explanationText: '2 + 2 equals 4',
 *     },
 *   ]}
 *   totalScore={100}
 *   totalQuestions={1}
 * />
 * ```
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
export function AnswerReview({
  questions,
  totalScore,
  totalQuestions,
}: AnswerReviewProps): JSX.Element {
  // Track which questions are expanded
  const [expandedQuestions, setExpandedQuestions] = React.useState<Set<string>>(
    new Set()
  );

  // Calculate correct count
  const correctCount = React.useMemo(() => {
    return questions.filter((q) =>
      isAnswerCorrect(q.participantAnswer, q.correctAnswer)
    ).length;
  }, [questions]);

  // Toggle question expansion
  const toggleQuestion = React.useCallback((questionId: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }, []);

  // Expand/collapse all
  const expandAll = React.useCallback(() => {
    setExpandedQuestions(new Set(questions.map((q) => q.questionId)));
  }, [questions]);

  const collapseAll = React.useCallback(() => {
    setExpandedQuestions(new Set());
  }, []);

  const allExpanded = expandedQuestions.size === questions.length;

  return (
    <CopyPrevention>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full"
      >
        {/* Summary header */}
        <SummaryHeader
          totalScore={totalScore}
          totalQuestions={totalQuestions}
          correctCount={correctCount}
        />

        {/* Expand/Collapse all button */}
        <motion.div
          variants={itemVariants}
          className="flex justify-end mb-3"
        >
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            className="text-xs sm:text-sm font-medium text-primary hover:text-primary-dark transition-colors px-3 py-1.5 rounded-lg hover:bg-primary/5"
          >
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        </motion.div>

        {/* Questions list */}
        <div className="space-y-3">
          {questions.map((question, index) => (
            <QuestionReviewCard
              key={question.questionId}
              question={question}
              questionNumber={index + 1}
              isExpanded={expandedQuestions.has(question.questionId)}
              onToggle={() => toggleQuestion(question.questionId)}
            />
          ))}
        </div>

        {/* Empty state */}
        {questions.length === 0 && (
          <motion.div
            variants={itemVariants}
            className="neu-raised rounded-xl p-6 text-center"
          >
            <svg
              className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-[var(--text-secondary)]">
              No questions to review
            </p>
          </motion.div>
        )}
      </motion.div>
    </CopyPrevention>
  );
}

export default AnswerReview;
