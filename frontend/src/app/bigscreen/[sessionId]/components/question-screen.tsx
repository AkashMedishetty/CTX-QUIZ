/**
 * QuestionScreen - Big Screen question display component
 * 
 * Displays the question screen for the Big Screen with:
 * - Question number and total (e.g., "Question 3 of 10")
 * - Countdown timer display with urgency animations
 * - Large, readable question text
 * - Question image (if present)
 * - Answer options with images (if present)
 * - Responsive layout for projector display
 * - Enhanced Framer Motion animations
 * 
 * Responsive Design:
 * - Optimized for 16:9 and 4:3 aspect ratios
 * - Supports 1920x1080, 1280x720, 1024x768 resolutions
 * - Uses CSS Grid for options layout
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.9, 12.10
 */

'use client';

import { useMemo, useEffect, useState } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import Image from 'next/image';

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
 * QuestionScreen props
 */
export interface QuestionScreenProps {
  /** Current question data */
  question: QuestionData;
  /** Current question index (0-indexed) */
  questionIndex: number;
  /** Total number of questions */
  totalQuestions: number;
  /** Remaining seconds on timer */
  remainingSeconds: number;
  /** Whether the socket is connected */
  isConnected: boolean;
  /** Join code for late joiners */
  joinCode?: string;
  /** Whether late joiners are allowed */
  allowLateJoiners?: boolean;
}

/**
 * Option labels for display (A, B, C, D, etc.)
 */
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Get timer color based on remaining time
 */
function getTimerColor(remainingSeconds: number, timeLimit: number): string {
  const percentage = (remainingSeconds / timeLimit) * 100;
  
  if (percentage <= 20) {
    return 'text-error'; // Red - urgent
  } else if (percentage <= 40) {
    return 'text-warning'; // Orange - warning
  }
  return 'text-primary'; // Default - CTX Teal
}

/**
 * Get timer background color based on remaining time
 */
function getTimerBgColor(remainingSeconds: number, timeLimit: number): string {
  const percentage = (remainingSeconds / timeLimit) * 100;
  
  if (percentage <= 20) {
    return 'bg-error/10';
  } else if (percentage <= 40) {
    return 'bg-warning/10';
  }
  return 'bg-primary/10';
}

/**
 * Timer ring progress component with smooth animation
 */
function TimerRing({ 
  remainingSeconds, 
  timeLimit, 
  isUrgent 
}: { 
  remainingSeconds: number; 
  timeLimit: number; 
  isUrgent: boolean;
}) {
  const progress = (remainingSeconds / timeLimit) * 100;
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  
  const getStrokeColor = () => {
    if (remainingSeconds <= 5) return '#EF4444'; // error
    if (remainingSeconds <= 10) return '#F59E0B'; // warning
    return '#275249'; // primary
  };

  return (
    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
      {/* Background ring */}
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        className="text-[var(--text-muted)]/20"
      />
      {/* Progress ring */}
      <motion.circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke={getStrokeColor()}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        animate={{ 
          strokeDashoffset,
          stroke: getStrokeColor(),
        }}
        transition={{ 
          strokeDashoffset: { duration: 0.5, ease: 'linear' },
          stroke: { duration: 0.3 },
        }}
      />
      {/* Urgent pulse effect */}
      {isUrgent && (
        <motion.circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="#EF4444"
          strokeWidth="2"
          animate={{
            r: [45, 48, 45],
            opacity: [0.5, 0, 0.5],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      )}
    </svg>
  );
}

/**
 * QuestionScreen component
 * 
 * Displays the question screen optimized for projector display with:
 * - Large, readable text
 * - Question and option images
 * - Countdown timer
 * - Responsive layout for multiple screen sizes
 */
export function QuestionScreen({
  question,
  questionIndex,
  totalQuestions,
  remainingSeconds,
  isConnected,
  joinCode,
  allowLateJoiners = false,
}: QuestionScreenProps) {
  // Determine if question has an image
  const hasQuestionImage = Boolean(question.questionImageUrl);
  
  // Determine if any options have images
  const hasOptionImages = useMemo(() => {
    return question.options.some((opt) => opt.optionImageUrl);
  }, [question.options]);

  // Get timer styling
  const timerColor = getTimerColor(remainingSeconds, question.timeLimit);
  const timerBgColor = getTimerBgColor(remainingSeconds, question.timeLimit);
  
  // Determine if timer is urgent (for animations)
  const isUrgent = remainingSeconds <= 5;
  const isWarning = remainingSeconds <= 10 && remainingSeconds > 5;
  
  // Track previous seconds for tick animation
  const [prevSeconds, setPrevSeconds] = useState(remainingSeconds);
  const timerControls = useAnimation();
  
  // Animate on each second tick
  useEffect(() => {
    if (remainingSeconds !== prevSeconds) {
      setPrevSeconds(remainingSeconds);
      
      // Tick animation - subtle bounce
      timerControls.start({
        scale: [1, 1.05, 1],
        transition: { duration: 0.2, ease: [0.34, 1.56, 0.64, 1] },
      });
      
      // Urgent shake at 5 seconds
      if (remainingSeconds === 5) {
        timerControls.start({
          x: [0, -3, 3, -3, 3, 0],
          transition: { duration: 0.4 },
        });
      }
    }
  }, [remainingSeconds, prevSeconds, timerControls]);

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
      {/* Header with Question Number and Timer - Responsive */}
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

          {/* Timer Display - Enhanced with ring progress and urgency animations */}
          <motion.div
            animate={timerControls}
            className={`relative neu-raised-sm rounded-lg md:rounded-xl px-4 py-2 md:px-6 md:py-3 lg:px-8 lg:py-4 ${timerBgColor} overflow-hidden`}
          >
            {/* Urgency background pulse */}
            {isUrgent && (
              <motion.div
                className="absolute inset-0 bg-error/20"
                animate={{ opacity: [0, 0.3, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              />
            )}
            
            {/* Warning background pulse */}
            {isWarning && (
              <motion.div
                className="absolute inset-0 bg-warning/10"
                animate={{ opacity: [0, 0.2, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
            
            <div className="flex items-center gap-1.5 md:gap-2 lg:gap-3 relative z-10">
              {/* Timer icon with ring progress */}
              <div className="relative w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8">
                <TimerRing 
                  remainingSeconds={remainingSeconds} 
                  timeLimit={question.timeLimit}
                  isUrgent={isUrgent}
                />
                <svg
                  className={`absolute inset-0 w-full h-full p-1 ${timerColor}`}
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
              
              {/* Animated seconds counter */}
              <AnimatePresence mode="popLayout">
                <motion.span 
                  key={remainingSeconds}
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  transition={{ 
                    type: 'spring', 
                    stiffness: 500, 
                    damping: 30,
                  }}
                  className={`text-2xl md:text-3xl lg:text-display font-bold font-display ${timerColor}`}
                >
                  {remainingSeconds}
                </motion.span>
              </AnimatePresence>
              <span className={`text-sm md:text-base lg:text-h3 font-medium ${timerColor}`}>sec</span>
            </div>
          </motion.div>
        </motion.div>
      </header>

      {/* Main Content - Responsive padding */}
      <main className="flex-1 px-4 pb-4 md:px-8 md:pb-6 lg:px-12 lg:pb-8 flex flex-col">
        {/* Question Card - Responsive sizing */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.0, 0.0, 0.2, 1] }}
          className="neu-raised-lg rounded-xl p-4 md:p-6 lg:p-8 mb-4 md:mb-6 lg:mb-8"
        >
          {/* Question Text - Enhanced slide animation */}
          <AnimatePresence mode="wait">
            <motion.h2
              key={question.questionId}
              initial={{ opacity: 0, x: 40, filter: 'blur(4px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: -40, filter: 'blur(4px)' }}
              transition={{ 
                duration: 0.5, 
                ease: [0.0, 0.0, 0.2, 1],
                filter: { duration: 0.3 },
              }}
              className="text-xl md:text-2xl lg:text-3xl xl:text-display font-semibold text-[var(--text-primary)] text-center leading-tight [&_p]:m-0 [&_p]:inline"
              dangerouslySetInnerHTML={{ __html: question.questionText }}
            />
          </AnimatePresence>

          {/* Question Image - Responsive sizing */}
          {hasQuestionImage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-4 md:mt-6 lg:mt-8 flex justify-center"
            >
              <div className="neu-pressed rounded-lg md:rounded-xl p-2 md:p-3 lg:p-4 max-w-xl lg:max-w-2xl xl:max-w-3xl w-full">
                <div className="relative w-full aspect-video">
                  <Image
                    src={question.questionImageUrl!}
                    alt="Question image"
                    fill
                    className="object-contain rounded-md lg:rounded-lg"
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 80vw, 1024px"
                    priority
                  />
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Options Grid - CSS Grid with responsive columns */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className={`grid gap-3 md:gap-4 lg:gap-6 flex-1 ${getGridCols()}`}
        >
          {question.options.map((option, index) => (
            <OptionCard
              key={option.optionId}
              option={option}
              label={OPTION_LABELS[index] || String(index + 1)}
              index={index}
              hasImage={Boolean(option.optionImageUrl)}
              hasAnyImages={hasOptionImages}
            />
          ))}
        </motion.div>
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
          
          {/* Join Code for Late Joiners */}
          {allowLateJoiners && joinCode && (
            <div className="flex items-center gap-2 neu-raised-sm rounded-md px-3 py-1.5">
              <span className="text-[var(--text-secondary)]">Join:</span>
              <span className="font-mono font-bold text-primary text-base md:text-lg">
                {joinCode}
              </span>
            </div>
          )}
          
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
 * OptionCard - Individual option display card
 * Responsive sizing for different screen sizes
 */
interface OptionCardProps {
  option: QuestionOption;
  label: string;
  index: number;
  hasImage: boolean;
  hasAnyImages: boolean;
}

function OptionCard({ option, label, index, hasImage, hasAnyImages }: OptionCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: 0.4 + index * 0.1,
        ease: [0.0, 0.0, 0.2, 1],
        scale: { type: 'spring', stiffness: 300, damping: 25 },
      }}
      whileHover={{ 
        scale: 1.02,
        transition: { duration: 0.2 },
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="neu-raised rounded-lg md:rounded-xl p-3 md:p-4 lg:p-6 flex flex-col relative overflow-hidden"
    >
      {/* Subtle hover glow effect */}
      <motion.div
        className="absolute inset-0 bg-primary/5 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      />
      
      {/* Option Header with Label */}
      <div className="flex items-start gap-2 md:gap-3 lg:gap-4 relative z-10">
        {/* Option Label (A, B, C, D) - Enhanced with spring animation */}
        <motion.div 
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            delay: 0.5 + index * 0.1,
            type: 'spring',
            stiffness: 400,
            damping: 20,
          }}
          className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-md md:rounded-lg bg-primary flex items-center justify-center neu-raised-sm"
        >
          <span className="text-lg md:text-xl lg:text-h2 font-bold text-white font-display">
            {label}
          </span>
        </motion.div>

        {/* Option Text - Responsive font size */}
        <motion.div 
          className="flex-1 min-w-0"
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.55 + index * 0.1, duration: 0.3 }}
        >
          <p 
            className="text-base md:text-lg lg:text-xl xl:text-h2 font-medium text-[var(--text-primary)] leading-snug [&_p]:m-0 [&_p]:inline"
            dangerouslySetInnerHTML={{ __html: option.optionText }}
          />
        </motion.div>
      </div>

      {/* Option Image - Responsive sizing */}
      {hasImage && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.5 + index * 0.1 }}
          className="mt-2 md:mt-3 lg:mt-4 flex-1"
        >
          <div className="neu-pressed rounded-md md:rounded-lg p-1.5 md:p-2 lg:p-3 h-full">
            <div className="relative w-full aspect-video">
              <Image
                src={option.optionImageUrl!}
                alt={`Option ${label} image`}
                fill
                className="object-contain rounded-sm md:rounded-md"
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
              />
            </div>
          </div>
        </motion.div>
      )}

      {/* Placeholder for consistent height when other options have images */}
      {!hasImage && hasAnyImages && (
        <div className="mt-2 md:mt-3 lg:mt-4 flex-1 min-h-[80px] md:min-h-[100px] lg:min-h-[120px]" />
      )}
    </motion.div>
  );
}

export default QuestionScreen;
