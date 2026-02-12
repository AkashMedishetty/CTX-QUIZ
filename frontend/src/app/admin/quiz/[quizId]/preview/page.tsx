/**
 * Quiz Preview Page
 * 
 * Displays quiz as participants would see it.
 * Features:
 * - Typeform-style one-question-at-a-time flow
 * - Simulated countdown timer
 * - Answer selection with reveal
 * - Navigation controls
 * 
 * Requirements: 1.1
 */

'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api-client';
import { Button } from '@/components/ui';
import { cn, getImageUrl } from '@/lib/utils';

/**
 * Question interface from API
 */
interface Question {
  questionId: string;
  questionText: string;
  questionType: 'MULTIPLE_CHOICE' | 'MULTI_SELECT' | 'TRUE_FALSE';
  questionImageUrl?: string;
  timeLimit: number;
  options: Array<{
    optionId: string;
    optionText: string;
    optionImageUrl?: string;
    isCorrect: boolean;
  }>;
  scoring: {
    basePoints: number;
    speedBonusMultiplier: number;
    partialCreditEnabled: boolean;
  };
  shuffleOptions: boolean;
  speakerNotes?: string;
  explanationText?: string;
}

/**
 * Quiz interface from API
 */
interface Quiz {
  _id: string;
  title: string;
  description: string;
  quizType: 'REGULAR' | 'ELIMINATION' | 'FFI';
  questions: Question[];
}

interface ApiQuizResponse {
  success: boolean;
  quiz: Quiz;
}

// Icons
function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function ResetIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * Timer Display Component
 * Circular timer dial with countdown
 */
function TimerDisplay({
  timeRemaining,
  totalTime,
  isRunning,
  isWarning,
}: {
  timeRemaining: number;
  totalTime: number;
  isRunning: boolean;
  isWarning: boolean;
}) {
  const progress = totalTime > 0 ? (timeRemaining / totalTime) * 100 : 100;
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      {/* Background circle */}
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="var(--shadow-dark)"
          strokeWidth="8"
          className="opacity-30"
        />
        {/* Progress circle */}
        <motion.circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={isWarning ? 'var(--warning)' : 'var(--primary)'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: 0 }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </svg>
      {/* Timer text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className={cn(
            'font-display text-3xl font-bold',
            isWarning ? 'text-warning' : 'text-[var(--text-primary)]'
          )}
          animate={isWarning && isRunning ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.5, repeat: isWarning && isRunning ? Infinity : 0 }}
        >
          {timeRemaining}
        </motion.span>
        <span className="text-caption text-[var(--text-muted)]">seconds</span>
      </div>
    </div>
  );
}

/**
 * Option labels for answer choices
 */
const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Answer Option Component
 */
function AnswerOption({
  option,
  index,
  isSelected,
  isRevealed,
  onSelect,
  disabled,
}: {
  option: { optionId: string; optionText: string; optionImageUrl?: string; isCorrect: boolean };
  index: number;
  isSelected: boolean;
  isRevealed: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const isCorrect = option.isCorrect;
  const showCorrect = isRevealed && isCorrect;
  const showIncorrect = isRevealed && isSelected && !isCorrect;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={disabled || isRevealed}
      className={cn(
        'w-full p-4 rounded-lg text-left transition-all duration-fast',
        'flex items-center gap-4 min-h-[60px]',
        // Base neumorphic style
        !isSelected && !isRevealed && [
          'bg-[var(--neu-bg)]',
          'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]',
          'hover:shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
        ],
        // Selected state (pressed)
        isSelected && !isRevealed && [
          'bg-primary text-white',
          'shadow-[inset_4px_4px_8px_rgba(0,0,0,0.2),inset_-4px_-4px_8px_rgba(255,255,255,0.1)]',
        ],
        // Revealed correct
        showCorrect && [
          'bg-success text-white',
          'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]',
        ],
        // Revealed incorrect (selected wrong answer)
        showIncorrect && [
          'bg-error text-white',
          'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]',
        ],
        // Revealed but not selected and not correct
        isRevealed && !isSelected && !isCorrect && 'opacity-50',
        // Disabled state
        disabled && !isRevealed && 'opacity-50 cursor-not-allowed'
      )}
      whileTap={!disabled && !isRevealed ? { scale: 0.98 } : {}}
    >
      {/* Option label */}
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
          'font-semibold text-body font-display',
          !isSelected && !isRevealed && 'bg-[var(--neu-surface)] text-[var(--text-primary)]',
          isSelected && !isRevealed && 'bg-white/20 text-white',
          showCorrect && 'bg-white/20 text-white',
          showIncorrect && 'bg-white/20 text-white',
          isRevealed && !isSelected && !isCorrect && 'bg-[var(--neu-surface)] text-[var(--text-muted)]'
        )}
      >
        {optionLabels[index]}
      </div>

      {/* Option content */}
      <div className="flex-1 min-w-0">
        {option.optionImageUrl && (
          <img
            src={option.optionImageUrl}
            alt=""
            className="w-full max-h-32 object-contain rounded-md mb-2"
          />
        )}
        <span
          className={cn(
            'text-body',
            !isSelected && !isRevealed && 'text-[var(--text-primary)]',
            (isSelected || showCorrect || showIncorrect) && 'text-white',
            isRevealed && !isSelected && !isCorrect && 'text-[var(--text-muted)]'
          )}
          dangerouslySetInnerHTML={{ __html: option.optionText }}
        />
      </div>

      {/* Status icon */}
      {isRevealed && (
        <div className="flex-shrink-0">
          {showCorrect && <CheckIcon className="w-6 h-6 text-white" />}
          {showIncorrect && <XIcon className="w-6 h-6 text-white" />}
        </div>
      )}
    </motion.button>
  );
}

/**
 * Question Card Component
 * Displays a single question with options
 */
function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  selectedOptions,
  isRevealed,
  timeRemaining,
  totalTime,
  isTimerRunning,
  onSelectOption,
  onReveal,
}: {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  selectedOptions: string[];
  isRevealed: boolean;
  timeRemaining: number;
  totalTime: number;
  isTimerRunning: boolean;
  onSelectOption: (optionId: string) => void;
  onReveal: () => void;
}) {
  const isMultiSelect = question.questionType === 'MULTI_SELECT';
  const hasSelection = selectedOptions.length > 0;
  const isWarning = timeRemaining <= 10 && timeRemaining > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="w-full max-w-2xl mx-auto"
    >
      {/* Question header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          {/* Question number badge */}
          <div
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center',
              'font-display font-bold text-xl',
              'bg-primary text-white',
              'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]'
            )}
          >
            {questionNumber}
          </div>
          <div>
            <span className="text-body-sm text-[var(--text-muted)]">
              Question {questionNumber} of {totalQuestions}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-caption px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
                {question.questionType.replace('_', ' ')}
              </span>
              <span className="text-caption text-[var(--text-muted)]">
                {question.scoring.basePoints} pts
              </span>
            </div>
          </div>
        </div>

        {/* Timer */}
        <TimerDisplay
          timeRemaining={timeRemaining}
          totalTime={totalTime}
          isRunning={isTimerRunning}
          isWarning={isWarning}
        />
      </div>

      {/* Question content card */}
      <div className="neu-raised-lg rounded-xl p-6 mb-6">
        {/* Question image */}
        {question.questionImageUrl && (
          <div className="mb-4 rounded-lg overflow-hidden">
            <img
              src={getImageUrl(question.questionImageUrl)}
              alt="Question"
              className="w-full max-h-64 object-contain bg-[var(--neu-surface)]"
            />
          </div>
        )}

        {/* Question text */}
        <div
          className="text-body-lg font-medium text-[var(--text-primary)] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: question.questionText }}
        />

        {isMultiSelect && (
          <p className="text-body-sm text-[var(--text-muted)] mt-2">
            Select all that apply
          </p>
        )}
      </div>

      {/* Answer options */}
      <div className="space-y-3 mb-6">
        {question.options.map((option, index) => (
          <AnswerOption
            key={option.optionId}
            option={option}
            index={index}
            isSelected={selectedOptions.includes(option.optionId)}
            isRevealed={isRevealed}
            onSelect={() => onSelectOption(option.optionId)}
            disabled={!isTimerRunning && !isRevealed}
          />
        ))}
      </div>

      {/* Submit/Reveal button */}
      {!isRevealed && hasSelection && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
        >
          <Button
            variant="primary"
            size="lg"
            onClick={onReveal}
            rightIcon={<EyeIcon />}
          >
            Reveal Answer
          </Button>
        </motion.div>
      )}

      {/* Explanation text */}
      {isRevealed && question.explanationText && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="neu-raised rounded-lg p-4 mt-6 border-l-4 border-info"
        >
          <h4 className="text-body font-semibold text-[var(--text-primary)] mb-2">
            Explanation
          </h4>
          <p
            className="text-body-sm text-[var(--text-secondary)]"
            dangerouslySetInnerHTML={{ __html: question.explanationText }}
          />
        </motion.div>
      )}
    </motion.div>
  );
}

/**
 * Loading skeleton for preview
 */
function PreviewSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--neu-surface)] animate-pulse" />
        <div className="h-6 w-48 mx-auto bg-[var(--neu-surface)] rounded-md animate-pulse" />
      </div>
    </div>
  );
}

/**
 * Empty state when quiz has no questions
 */
function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--neu-surface)] flex items-center justify-center">
          <EyeIcon className="w-10 h-10 text-[var(--text-muted)]" />
        </div>
        <h2 className="text-h2 font-semibold text-[var(--text-primary)] mb-2">
          No Questions Yet
        </h2>
        <p className="text-body text-[var(--text-secondary)] mb-6">
          Add some questions to your quiz before previewing it.
        </p>
        <Button variant="primary" onClick={onBack}>
          Back to Edit
        </Button>
      </div>
    </div>
  );
}

/**
 * Quiz completion screen
 */
function CompletionScreen({
  quiz,
  answeredCorrectly,
  totalQuestions,
  onRestart,
  onBack,
}: {
  quiz: Quiz;
  answeredCorrectly: number;
  totalQuestions: number;
  onRestart: () => void;
  onBack: () => void;
}) {
  const percentage = totalQuestions > 0 ? Math.round((answeredCorrectly / totalQuestions) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center justify-center min-h-[60vh]"
    >
      <div className="text-center max-w-md">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
          className={cn(
            'w-32 h-32 mx-auto mb-6 rounded-full flex items-center justify-center',
            'neu-raised-lg',
            percentage >= 70 ? 'text-success' : percentage >= 40 ? 'text-warning' : 'text-error'
          )}
        >
          <span className="font-display text-5xl font-bold">{percentage}%</span>
        </motion.div>

        <h2 className="text-h2 font-semibold text-[var(--text-primary)] mb-2">
          Preview Complete!
        </h2>
        <p className="text-body text-[var(--text-secondary)] mb-2">
          {quiz.title}
        </p>
        <p className="text-body-sm text-[var(--text-muted)] mb-8">
          You got {answeredCorrectly} out of {totalQuestions} questions correct
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="secondary" onClick={onRestart} leftIcon={<ResetIcon />}>
            Restart Preview
          </Button>
          <Button variant="primary" onClick={onBack}>
            Back to Edit
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Navigation controls component
 */
function NavigationControls({
  currentIndex,
  totalQuestions,
  isRevealed,
  isTimerRunning,
  onPrevious,
  onNext,
  onToggleTimer,
  onResetTimer,
}: {
  currentIndex: number;
  totalQuestions: number;
  isRevealed: boolean;
  isTimerRunning: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToggleTimer: () => void;
  onResetTimer: () => void;
}) {
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalQuestions - 1;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[var(--neu-bg)] border-t border-[var(--border)] p-4 z-40">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
        {/* Previous button */}
        <Button
          variant="secondary"
          onClick={onPrevious}
          disabled={isFirst}
          leftIcon={<ArrowLeftIcon />}
        >
          <span className="hidden sm:inline">Previous</span>
        </Button>

        {/* Timer controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleTimer}
            title={isTimerRunning ? 'Pause timer' : 'Start timer'}
          >
            {isTimerRunning ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onResetTimer}
            title="Reset timer"
          >
            <ResetIcon />
          </Button>
        </div>

        {/* Question indicator dots */}
        <div className="hidden md:flex items-center gap-1.5">
          {Array.from({ length: totalQuestions }).map((_, index) => (
            <div
              key={index}
              className={cn(
                'w-2.5 h-2.5 rounded-full transition-all duration-fast',
                index === currentIndex
                  ? 'bg-primary w-6'
                  : index < currentIndex
                  ? 'bg-primary/50'
                  : 'bg-[var(--shadow-dark)]'
              )}
            />
          ))}
        </div>

        {/* Next button */}
        <Button
          variant={isRevealed ? 'primary' : 'secondary'}
          onClick={onNext}
          disabled={!isRevealed && !isLast}
          rightIcon={<ArrowRightIcon />}
        >
          <span className="hidden sm:inline">
            {isLast ? 'Finish' : 'Next'}
          </span>
        </Button>
      </div>
    </div>
  );
}

/**
 * API function to fetch quiz
 */
async function fetchQuiz(quizId: string): Promise<Quiz> {
  const response = await get<ApiQuizResponse>(`/quizzes/${quizId}`);
  return response.quiz;
}

/**
 * Quiz Preview Page Component
 */
export default function QuizPreviewPage() {
  const router = useRouter();
  const params = useParams();
  const quizId = params.quizId as string;

  // State
  const [currentQuestionIndex, setCurrentQuestionIndex] = React.useState(0);
  const [selectedOptions, setSelectedOptions] = React.useState<Record<number, string[]>>({});
  const [revealedQuestions, setRevealedQuestions] = React.useState<Set<number>>(new Set());
  const [timeRemaining, setTimeRemaining] = React.useState(0);
  const [isTimerRunning, setIsTimerRunning] = React.useState(false);
  const [isComplete, setIsComplete] = React.useState(false);

  // Fetch quiz data
  const { data: quiz, isLoading, error } = useQuery({
    queryKey: ['quiz', quizId],
    queryFn: () => fetchQuiz(quizId),
    enabled: !!quizId,
  });

  const questions = quiz?.questions || [];
  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;

  // Initialize timer when question changes
  React.useEffect(() => {
    if (currentQuestion) {
      setTimeRemaining(currentQuestion.timeLimit);
      setIsTimerRunning(true);
    }
  }, [currentQuestionIndex, currentQuestion?.questionId]);

  // Timer countdown effect
  React.useEffect(() => {
    if (!isTimerRunning || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerRunning, timeRemaining]);

  // Handle option selection
  const handleSelectOption = (optionId: string) => {
    if (!currentQuestion || revealedQuestions.has(currentQuestionIndex)) return;

    const isMultiSelect = currentQuestion.questionType === 'MULTI_SELECT';
    const currentSelections = selectedOptions[currentQuestionIndex] || [];

    if (isMultiSelect) {
      // Toggle selection for multi-select
      const newSelections = currentSelections.includes(optionId)
        ? currentSelections.filter((id) => id !== optionId)
        : [...currentSelections, optionId];
      setSelectedOptions((prev) => ({ ...prev, [currentQuestionIndex]: newSelections }));
    } else {
      // Single selection
      setSelectedOptions((prev) => ({ ...prev, [currentQuestionIndex]: [optionId] }));
    }
  };

  // Handle reveal answer
  const handleReveal = () => {
    setRevealedQuestions((prev) => new Set([...prev, currentQuestionIndex]));
    setIsTimerRunning(false);
  };

  // Handle navigation
  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      // Quiz complete
      setIsComplete(true);
    }
  };

  // Handle timer controls
  const handleToggleTimer = () => {
    setIsTimerRunning((prev) => !prev);
  };

  const handleResetTimer = () => {
    if (currentQuestion) {
      setTimeRemaining(currentQuestion.timeLimit);
      setIsTimerRunning(true);
    }
  };

  // Handle restart
  const handleRestart = () => {
    setCurrentQuestionIndex(0);
    setSelectedOptions({});
    setRevealedQuestions(new Set());
    setIsComplete(false);
    if (questions[0]) {
      setTimeRemaining(questions[0].timeLimit);
      setIsTimerRunning(true);
    }
  };

  // Handle back to edit
  const handleBack = () => {
    router.push(`/admin/quiz/${quizId}`);
  };

  // Calculate score for completion screen
  const calculateScore = () => {
    let correct = 0;
    questions.forEach((question, index) => {
      const selected = selectedOptions[index] || [];
      const correctOptions = question.options.filter((o) => o.isCorrect).map((o) => o.optionId);
      
      if (question.questionType === 'MULTI_SELECT') {
        // All correct options must be selected and no incorrect ones
        const allCorrectSelected = correctOptions.every((id) => selected.includes(id));
        const noIncorrectSelected = selected.every((id) => correctOptions.includes(id));
        if (allCorrectSelected && noIncorrectSelected) correct++;
      } else {
        // Single selection - must match the correct option
        if (selected.length === 1 && correctOptions.includes(selected[0])) correct++;
      }
    });
    return correct;
  };

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[var(--neu-bg)] p-6">
        <div className="max-w-4xl mx-auto">
          <div className="neu-raised rounded-lg p-8 text-center">
            <h2 className="text-h2 font-semibold text-[var(--text-primary)] mb-2">
              Quiz Not Found
            </h2>
            <p className="text-body text-[var(--text-secondary)] mb-6">
              The quiz you&apos;re looking for doesn&apos;t exist.
            </p>
            <Button variant="primary" onClick={handleBack}>
              Back to Quizzes
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading || !quiz) {
    return (
      <div className="min-h-screen bg-[var(--neu-bg)] p-6">
        <PreviewSkeleton />
      </div>
    );
  }

  // Empty state
  if (totalQuestions === 0) {
    return (
      <div className="min-h-screen bg-[var(--neu-bg)] p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-body-sm text-[var(--text-secondary)] hover:text-primary transition-colors"
            >
              <CloseIcon />
              <span>Exit Preview</span>
            </button>
            <h1 className="text-h3 font-semibold text-[var(--text-primary)]">
              {quiz.title}
            </h1>
            <div className="w-24" /> {/* Spacer for centering */}
          </div>
          <EmptyState onBack={handleBack} />
        </div>
      </div>
    );
  }

  // Completion state
  if (isComplete) {
    return (
      <div className="min-h-screen bg-[var(--neu-bg)] p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-body-sm text-[var(--text-secondary)] hover:text-primary transition-colors"
            >
              <CloseIcon />
              <span>Exit Preview</span>
            </button>
            <h1 className="text-h3 font-semibold text-[var(--text-primary)]">
              {quiz.title}
            </h1>
            <div className="w-24" /> {/* Spacer for centering */}
          </div>
          <CompletionScreen
            quiz={quiz}
            answeredCorrectly={calculateScore()}
            totalQuestions={totalQuestions}
            onRestart={handleRestart}
            onBack={handleBack}
          />
        </div>
      </div>
    );
  }

  const isRevealed = revealedQuestions.has(currentQuestionIndex);
  const currentSelections = selectedOptions[currentQuestionIndex] || [];

  return (
    <div className="min-h-screen bg-[var(--neu-bg)] pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[var(--neu-bg)] border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-body-sm text-[var(--text-secondary)] hover:text-primary transition-colors"
          >
            <CloseIcon />
            <span>Exit Preview</span>
          </button>
          <h1 className="text-h3 font-semibold text-[var(--text-primary)] truncate max-w-md">
            {quiz.title}
          </h1>
          <span className="text-body-sm text-[var(--text-muted)] px-3 py-1 rounded-full bg-primary/10">
            Preview Mode
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="p-6 pt-8">
        <AnimatePresence mode="wait">
          <QuestionCard
            key={currentQuestion.questionId}
            question={currentQuestion}
            questionNumber={currentQuestionIndex + 1}
            totalQuestions={totalQuestions}
            selectedOptions={currentSelections}
            isRevealed={isRevealed}
            timeRemaining={timeRemaining}
            totalTime={currentQuestion.timeLimit}
            isTimerRunning={isTimerRunning}
            onSelectOption={handleSelectOption}
            onReveal={handleReveal}
          />
        </AnimatePresence>
      </div>

      {/* Navigation controls */}
      <NavigationControls
        currentIndex={currentQuestionIndex}
        totalQuestions={totalQuestions}
        isRevealed={isRevealed}
        isTimerRunning={isTimerRunning}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onToggleTimer={handleToggleTimer}
        onResetTimer={handleResetTimer}
      />
    </div>
  );
}
