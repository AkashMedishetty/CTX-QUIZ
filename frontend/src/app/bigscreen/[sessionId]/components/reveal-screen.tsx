/**
 * RevealScreen - Big Screen answer reveal display component
 * 
 * Displays the answer reveal screen for the Big Screen with:
 * - Question number and "ANSWER REVEAL" header
 * - Question text display
 * - Answer options with correct answers highlighted (green with checkmark)
 * - Incorrect options dimmed
 * - Answer statistics (% correct, avg response time)
 * - Explanation text (if available)
 * - Animated reveal effects using Framer Motion
 * 
 * Responsive Design:
 * - Optimized for 16:9 and 4:3 aspect ratios
 * - Supports 1920x1080, 1280x720, 1024x768 resolutions
 * - Uses CSS Grid for layouts
 * 
 * Requirements: 12.5, 12.6, 12.9
 */

'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { getImageUrl } from '@/lib/utils';

/**
 * Question option interface
 */
export interface QuestionOption {
  optionId: string;
  optionText: string;
  optionImageUrl?: string;
}

/**
 * Question data interface
 */
export interface QuestionData {
  questionId: string;
  questionText: string;
  questionType: string;
  questionImageUrl?: string;
  options: QuestionOption[];
  timeLimit: number;
  shuffleOptions: boolean;
}

/**
 * Answer statistics interface
 */
export interface AnswerStats {
  totalAnswers: number;
  correctAnswers: number;
  averageResponseTime: number;
}

/**
 * RevealScreen props
 */
export interface RevealScreenProps {
  /** Current question data */
  question: QuestionData;
  /** Current question index (0-indexed) */
  questionIndex: number;
  /** Total number of questions */
  totalQuestions: number;
  /** Array of correct option IDs */
  correctOptions: string[];
  /** Answer statistics */
  answerStats: AnswerStats | null;
  /** Explanation text for the answer */
  explanationText: string | null;
  /** Whether the socket is connected */
  isConnected: boolean;
}

/**
 * Option labels for display (A, B, C, D, etc.)
 */
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Format response time for display
 */
function formatResponseTime(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 1) {
    return `${Math.round(ms)}ms`;
  }
  return `${seconds.toFixed(1)}s`;
}

/**
 * Calculate percentage of correct answers
 */
function calculateCorrectPercentage(stats: AnswerStats | null): number {
  if (!stats || stats.totalAnswers === 0) return 0;
  return Math.round((stats.correctAnswers / stats.totalAnswers) * 100);
}

/**
 * RevealScreen component
 * 
 * Displays the answer reveal screen optimized for projector display with:
 * - Highlighted correct answers with animations
 * - Dimmed incorrect options
 * - Statistics display
 * - Explanation text
 * - Responsive design for multiple screen sizes
 */
export function RevealScreen({
  question,
  questionIndex,
  totalQuestions,
  correctOptions,
  answerStats,
  explanationText,
  isConnected,
}: RevealScreenProps) {
  // Determine if question has an image
  const hasQuestionImage = Boolean(question.questionImageUrl);
  
  // Determine if any options have images
  const hasOptionImages = useMemo(() => {
    return question.options.some((opt) => opt.optionImageUrl);
  }, [question.options]);

  // Calculate correct percentage
  const correctPercentage = useMemo(() => {
    return calculateCorrectPercentage(answerStats);
  }, [answerStats]);

  // Check if an option is correct
  const isOptionCorrect = (optionId: string): boolean => {
    return correctOptions.includes(optionId);
  };

  // Determine grid columns based on number of options
  const getGridCols = () => {
    const optionCount = question.options.length;
    if (optionCount <= 2) {
      return 'grid-cols-1 md:grid-cols-2';
    } else if (optionCount <= 4) {
      return 'grid-cols-1 md:grid-cols-2';
    }
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  };

  return (
    <div className="min-h-screen bg-[var(--neu-bg)] flex flex-col">
      {/* Header with Question Number and Reveal Badge - Responsive */}
      <header className="py-3 px-4 md:py-4 md:px-8 lg:py-6 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.0, 0.0, 0.2, 1] }}
          className="flex items-center justify-between"
        >
          {/* Question Number */}
          <div className="flex items-center gap-2 md:gap-3 lg:gap-4">
            <div className="neu-raised-sm rounded-lg px-3 py-1.5 md:px-4 md:py-2 lg:px-6 lg:py-3">
              <span className="text-base md:text-lg lg:text-h2 font-semibold text-[var(--text-primary)]">
                Question {questionIndex + 1}
                <span className="text-[var(--text-muted)]"> of {totalQuestions}</span>
              </span>
            </div>
            
            {/* Connection Status */}
            <div className="flex items-center gap-1.5 md:gap-2">
              <div
                className={`w-2 h-2 md:w-2.5 md:h-2.5 lg:w-3 lg:h-3 rounded-full ${
                  isConnected ? 'bg-success animate-pulse' : 'bg-error'
                }`}
              />
              <span className="text-xs md:text-sm lg:text-body-sm text-[var(--text-muted)]">
                {isConnected ? 'Live' : 'Disconnected'}
              </span>
            </div>
          </div>

          {/* Answer Reveal Badge - Responsive sizing */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ 
              duration: 0.5, 
              delay: 0.2,
              type: 'spring',
              stiffness: 200,
              damping: 15
            }}
            className="neu-raised-sm rounded-lg md:rounded-xl px-4 py-2 md:px-6 md:py-3 lg:px-8 lg:py-4 bg-success/10"
          >
            <div className="flex items-center gap-1.5 md:gap-2 lg:gap-3">
              <motion.svg
                initial={{ rotate: -180, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8 text-success"
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
              </motion.svg>
              <span className="text-base md:text-lg lg:text-h2 font-bold text-success">
                ANSWER REVEAL
              </span>
            </div>
          </motion.div>
        </motion.div>
      </header>

      {/* Main Content - Responsive padding */}
      <main className="flex-1 px-4 pb-4 md:px-8 md:pb-6 lg:px-12 lg:pb-8 flex flex-col overflow-hidden">
        {/* Question Card - Responsive sizing */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.0, 0.0, 0.2, 1] }}
          className="neu-raised-lg rounded-xl p-4 md:p-6 lg:p-8 mb-4 md:mb-5 lg:mb-6"
        >
          {/* Question Text - Responsive font size */}
          <h2 
            className="text-lg md:text-xl lg:text-2xl xl:text-display font-semibold text-[var(--text-primary)] text-center leading-tight [&_p]:m-0 [&_p]:inline"
            dangerouslySetInnerHTML={{ __html: question.questionText }}
          />

          {/* Question Image - Responsive sizing */}
          {hasQuestionImage && (
            <div className="mt-4 md:mt-5 lg:mt-6 flex justify-center">
              <div className="neu-pressed rounded-lg md:rounded-xl p-2 md:p-3 lg:p-4 max-w-lg lg:max-w-xl xl:max-w-2xl w-full">
                <div className="relative w-full aspect-video">
                  <Image
                    src={getImageUrl(question.questionImageUrl!) || ''}
                    alt="Question image"
                    fill
                    className="object-contain rounded-md lg:rounded-lg"
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 70vw, 800px"
                    priority
                  />
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Options Grid - CSS Grid with responsive columns */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className={`grid gap-2 md:gap-3 lg:gap-4 mb-4 md:mb-5 lg:mb-6 ${getGridCols()}`}
        >
          {question.options.map((option, index) => (
            <RevealOptionCard
              key={option.optionId}
              option={option}
              label={OPTION_LABELS[index] || String(index + 1)}
              index={index}
              isCorrect={isOptionCorrect(option.optionId)}
              hasImage={Boolean(option.optionImageUrl)}
              hasAnyImages={hasOptionImages}
            />
          ))}
        </motion.div>

        {/* Statistics and Explanation Row - CSS Grid responsive */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 lg:gap-6 mt-auto">
          {/* Statistics Card - Responsive sizing */}
          {answerStats && (
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.8, ease: [0.0, 0.0, 0.2, 1] }}
              className="neu-raised rounded-xl p-4 md:p-5 lg:p-6"
            >
              <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
                <div className="w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-lg bg-info/10 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-info"
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
                <h3 className="text-lg md:text-xl lg:text-h3 font-semibold text-[var(--text-primary)]">
                  Statistics
                </h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4 md:gap-5 lg:gap-6">
                {/* Correct Percentage */}
                <div className="text-center">
                  <AnimatedNumber
                    value={correctPercentage}
                    suffix="%"
                    className="text-2xl md:text-3xl lg:text-display font-bold text-success font-display"
                    delay={1.0}
                  />
                  <p className="text-xs md:text-sm lg:text-body text-[var(--text-muted)] mt-1">
                    answered correctly
                  </p>
                </div>
                
                {/* Average Response Time */}
                <div className="text-center">
                  <motion.span
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 1.2 }}
                    className="text-2xl md:text-3xl lg:text-display font-bold text-primary font-display"
                  >
                    {formatResponseTime(answerStats.averageResponseTime)}
                  </motion.span>
                  <p className="text-xs md:text-sm lg:text-body text-[var(--text-muted)] mt-1">
                    avg response time
                  </p>
                </div>
              </div>
              
              {/* Response count */}
              <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-[var(--border)]">
                <p className="text-xs md:text-sm lg:text-body-sm text-[var(--text-muted)] text-center">
                  <span className="font-semibold text-[var(--text-secondary)]">
                    {answerStats.correctAnswers}
                  </span>
                  {' '}of{' '}
                  <span className="font-semibold text-[var(--text-secondary)]">
                    {answerStats.totalAnswers}
                  </span>
                  {' '}participants answered correctly
                </p>
              </div>
            </motion.div>
          )}

          {/* Explanation Card - Responsive sizing */}
          {explanationText && (
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 1.0, ease: [0.0, 0.0, 0.2, 1] }}
              className="neu-raised rounded-xl p-4 md:p-5 lg:p-6"
            >
              <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
                <div className="w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-warning"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg md:text-xl lg:text-h3 font-semibold text-[var(--text-primary)]">
                  Explanation
                </h3>
              </div>
              
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 1.2 }}
                className="text-sm md:text-base lg:text-body-lg text-[var(--text-secondary)] leading-relaxed"
              >
                {explanationText}
              </motion.p>
            </motion.div>
          )}

          {/* Placeholder when only stats or only explanation */}
          {answerStats && !explanationText && (
            <div className="hidden lg:block" />
          )}
          {!answerStats && explanationText && (
            <div className="hidden lg:block" />
          )}
        </div>
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
 * RevealOptionCard - Individual option display card for reveal screen
 * Responsive sizing for different screen sizes
 */
interface RevealOptionCardProps {
  option: QuestionOption;
  label: string;
  index: number;
  isCorrect: boolean;
  hasImage: boolean;
  hasAnyImages: boolean;
}

function RevealOptionCard({ 
  option, 
  label, 
  index, 
  isCorrect, 
  hasImage, 
  hasAnyImages 
}: RevealOptionCardProps) {
  // Animation delay based on index
  const baseDelay = 0.4 + index * 0.1;
  const revealDelay = baseDelay + 0.3;
  
  // State for image loading error
  const [imageError, setImageError] = React.useState(false);
  
  // Get the full image URL using the utility
  const optionImageSrc = hasImage ? getImageUrl(option.optionImageUrl) : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: baseDelay,
        ease: [0.0, 0.0, 0.2, 1],
      }}
      className={`
        relative rounded-lg md:rounded-xl p-3 md:p-4 lg:p-5 flex flex-col overflow-hidden
        transition-all duration-500
        ${isCorrect 
          ? 'neu-raised bg-success/5 ring-2 md:ring-3 lg:ring-4 ring-success/50' 
          : 'neu-raised opacity-50'
        }
      `}
    >
      {/* Correct Answer Glow Effect */}
      {isCorrect && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: revealDelay }}
          className="absolute inset-0 bg-gradient-to-br from-success/10 to-transparent pointer-events-none"
        />
      )}

      {/* Option Header with Label */}
      <div className="flex items-start gap-2 md:gap-3 lg:gap-4 relative z-10">
        {/* Option Label (A, B, C, D) - Responsive sizing */}
        <motion.div
          initial={{ scale: 1 }}
          animate={isCorrect ? { 
            scale: [1, 1.1, 1],
            transition: { duration: 0.5, delay: revealDelay }
          } : {}}
          className={`
            flex-shrink-0 w-9 h-9 md:w-10 md:h-10 lg:w-12 lg:h-12 rounded-md md:rounded-lg flex items-center justify-center neu-raised-sm
            ${isCorrect ? 'bg-success' : 'bg-[var(--text-muted)]/20'}
          `}
        >
          <span className={`
            text-base md:text-lg lg:text-h3 font-bold font-display
            ${isCorrect ? 'text-white' : 'text-[var(--text-muted)]'}
          `}>
            {label}
          </span>
        </motion.div>

        {/* Option Text - Responsive font size */}
        <div className="flex-1 min-w-0">
          <p 
            className={`
              text-sm md:text-base lg:text-lg xl:text-h3 font-medium leading-snug [&_p]:m-0 [&_p]:inline
              ${isCorrect ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}
            `}
            dangerouslySetInnerHTML={{ __html: option.optionText }}
          />
        </div>

        {/* Correct/Incorrect Indicator - Responsive sizing */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ 
            duration: 0.4, 
            delay: revealDelay,
            type: 'spring',
            stiffness: 300,
            damping: 15
          }}
          className={`
            flex-shrink-0 w-7 h-7 md:w-8 md:h-8 lg:w-10 lg:h-10 rounded-full flex items-center justify-center
            ${isCorrect ? 'bg-success' : 'bg-error/20'}
          `}
        >
          {isCorrect ? (
            <motion.svg
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: revealDelay + 0.1 }}
              className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <motion.path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: revealDelay + 0.1 }}
              />
            </motion.svg>
          ) : (
            <svg
              className="w-3 h-3 md:w-4 md:h-4 lg:w-5 lg:h-5 text-error/60"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )}
        </motion.div>
      </div>

      {/* Option Image - Responsive sizing */}
      {hasImage && !imageError && optionImageSrc && (
        <div className={`
          mt-2 md:mt-3 lg:mt-4 flex-1
          ${isCorrect ? '' : 'opacity-50'}
        `}>
          <div className="neu-pressed rounded-md md:rounded-lg p-1.5 md:p-2 h-full">
            <div className="relative w-full aspect-video">
              <Image
                src={optionImageSrc}
                alt={`Option ${label} image`}
                fill
                className="object-contain rounded-sm md:rounded-md"
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                onError={() => setImageError(true)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Image Error Fallback Placeholder */}
      {hasImage && (imageError || !optionImageSrc) && (
        <div className={`
          mt-2 md:mt-3 lg:mt-4 flex-1
          ${isCorrect ? '' : 'opacity-50'}
        `}>
          <div className="neu-pressed rounded-md md:rounded-lg p-1.5 md:p-2 h-full">
            <div className="relative w-full aspect-video flex items-center justify-center bg-[var(--neu-bg)]">
              <div className="flex flex-col items-center gap-2 text-[var(--text-muted)]">
                <svg
                  className="w-8 h-8 md:w-10 md:h-10 lg:w-12 lg:h-12"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-xs md:text-sm">Image unavailable</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Placeholder for consistent height when other options have images */}
      {!hasImage && hasAnyImages && (
        <div className="mt-2 md:mt-3 lg:mt-4 flex-1 min-h-[60px] md:min-h-[80px] lg:min-h-[100px]" />
      )}

      {/* Sparkle effect for correct answer */}
      {isCorrect && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: revealDelay + 0.2 }}
            className="absolute inset-0 pointer-events-none overflow-hidden"
          >
            {/* Sparkle particles */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  opacity: 0, 
                  scale: 0,
                  x: '50%',
                  y: '50%'
                }}
                animate={{ 
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0],
                  x: `${20 + Math.random() * 60}%`,
                  y: `${20 + Math.random() * 60}%`
                }}
                transition={{ 
                  duration: 1,
                  delay: revealDelay + 0.3 + i * 0.1,
                  ease: 'easeOut'
                }}
                className="absolute w-1.5 h-1.5 md:w-2 md:h-2 bg-success rounded-full"
                style={{
                  boxShadow: '0 0 8px rgba(34, 197, 94, 0.8)',
                }}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}

/**
 * AnimatedNumber - Animated number counter component
 */
interface AnimatedNumberProps {
  value: number;
  suffix?: string;
  className?: string;
  delay?: number;
}

function AnimatedNumber({ value, suffix = '', className = '', delay = 0 }: AnimatedNumberProps) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay }}
      className={className}
    >
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay }}
      >
        {value}
      </motion.span>
      {suffix}
    </motion.span>
  );
}

export default RevealScreen;
