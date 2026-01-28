/**
 * CountdownTimer - Big Screen countdown timer display component
 * 
 * A prominent circular timer display optimized for projector display with:
 * - Circular progress ring that depletes as time runs out
 * - Large, readable time display in the center
 * - Color transitions based on remaining time
 * - Pulsing animation at low time
 * - Shake animation at very low time
 * - Syncs with server timer_tick events
 * 
 * Responsive Design:
 * - Optimized for 16:9 and 4:3 aspect ratios
 * - Supports 1920x1080, 1280x720, 1024x768 resolutions
 * - Responsive sizing for different screen sizes
 * 
 * Requirements: 12.4, 12.9
 */

'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * CountdownTimer props
 */
export interface CountdownTimerProps {
  /** Remaining seconds on the timer */
  remainingSeconds: number;
  /** Total time limit for the question */
  totalTimeLimit: number;
  /** Size variant of the timer */
  size?: 'small' | 'medium' | 'large';
  /** Whether to show the "sec" label */
  showLabel?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Size configurations for different timer sizes
 * Responsive values for different screen sizes
 */
const SIZE_CONFIG = {
  small: {
    containerSize: 120,
    containerSizeMd: 140,
    containerSizeLg: 160,
    strokeWidth: 8,
    strokeWidthMd: 10,
    strokeWidthLg: 12,
    fontSize: 'text-2xl md:text-3xl lg:text-h1',
    labelSize: 'text-xs md:text-sm lg:text-body-sm',
    padding: 'p-2 md:p-2.5 lg:p-3',
  },
  medium: {
    containerSize: 160,
    containerSizeMd: 180,
    containerSizeLg: 200,
    strokeWidth: 10,
    strokeWidthMd: 11,
    strokeWidthLg: 12,
    fontSize: 'text-3xl md:text-4xl lg:text-display',
    labelSize: 'text-sm md:text-base lg:text-body',
    padding: 'p-3 md:p-3.5 lg:p-4',
  },
  large: {
    containerSize: 200,
    containerSizeMd: 240,
    containerSizeLg: 280,
    strokeWidth: 12,
    strokeWidthMd: 14,
    strokeWidthLg: 16,
    fontSize: 'text-4xl md:text-5xl lg:text-display-xl',
    labelSize: 'text-base md:text-lg lg:text-h3',
    padding: 'p-4 md:p-5 lg:p-6',
  },
} as const;

/**
 * Get color configuration based on remaining time percentage
 */
function getTimerColors(percentage: number): {
  stroke: string;
  text: string;
  bg: string;
  glow: string;
} {
  if (percentage <= 20) {
    return {
      stroke: '#EF4444', // error red
      text: 'text-error',
      bg: 'bg-error/10',
      glow: 'shadow-[0_0_20px_rgba(239,68,68,0.3)] md:shadow-[0_0_25px_rgba(239,68,68,0.35)] lg:shadow-[0_0_30px_rgba(239,68,68,0.4)]',
    };
  } else if (percentage <= 50) {
    return {
      stroke: '#F59E0B', // warning orange
      text: 'text-warning',
      bg: 'bg-warning/10',
      glow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)] md:shadow-[0_0_18px_rgba(245,158,11,0.25)] lg:shadow-[0_0_20px_rgba(245,158,11,0.3)]',
    };
  }
  return {
    stroke: '#275249', // primary teal
    text: 'text-primary',
    bg: 'bg-primary/10',
    glow: '',
  };
}

/**
 * CountdownTimer component
 * 
 * Displays a prominent circular countdown timer with visual effects.
 * Optimized for Big Screen projector display with maximum readability.
 * Responsive design for multiple screen sizes.
 * 
 * @example
 * ```tsx
 * <CountdownTimer
 *   remainingSeconds={25}
 *   totalTimeLimit={30}
 *   size="large"
 *   showLabel
 * />
 * ```
 */
export function CountdownTimer({
  remainingSeconds,
  totalTimeLimit,
  size = 'large',
  showLabel = true,
  className = '',
}: CountdownTimerProps) {
  // Get size configuration
  const config = SIZE_CONFIG[size];
  
  // Calculate percentage remaining
  const percentage = useMemo(() => {
    if (totalTimeLimit <= 0) return 0;
    return Math.max(0, Math.min(100, (remainingSeconds / totalTimeLimit) * 100));
  }, [remainingSeconds, totalTimeLimit]);

  // Get colors based on percentage
  const colors = useMemo(() => getTimerColors(percentage), [percentage]);

  // Calculate SVG circle properties for different screen sizes
  // Using the large size as base for calculations
  const radiusLg = (config.containerSizeLg - config.strokeWidthLg) / 2;
  const circumferenceLg = 2 * Math.PI * radiusLg;
  const strokeDashoffsetLg = circumferenceLg * (1 - percentage / 100);

  const radiusMd = (config.containerSizeMd - config.strokeWidthMd) / 2;
  const circumferenceMd = 2 * Math.PI * radiusMd;
  const strokeDashoffsetMd = circumferenceMd * (1 - percentage / 100);

  const radiusSm = (config.containerSize - config.strokeWidth) / 2;
  const circumferenceSm = 2 * Math.PI * radiusSm;
  const strokeDashoffsetSm = circumferenceSm * (1 - percentage / 100);

  // Determine animation states
  const isUrgent = remainingSeconds <= 5 && remainingSeconds > 0;
  const isWarning = remainingSeconds <= 10 && remainingSeconds > 5;
  const isExpired = remainingSeconds <= 0;

  // Animation variants
  const containerVariants = {
    idle: { scale: 1, rotate: 0 },
    warning: {
      scale: [1, 1.02, 1],
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
    urgent: {
      scale: [1, 1.05, 1],
      transition: {
        duration: 0.5,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
    shake: {
      x: [0, -3, 3, -3, 3, 0],
      transition: {
        duration: 0.4,
        repeat: Infinity,
        repeatDelay: 0.6,
      },
    },
  };

  // Determine which animation to use
  const getAnimationState = () => {
    if (isExpired) return 'idle';
    if (isUrgent) return 'shake';
    if (isWarning) return 'warning';
    return 'idle';
  };

  return (
    <motion.div
      className={`relative inline-flex items-center justify-center ${className}`}
      variants={containerVariants}
      animate={getAnimationState()}
      initial="idle"
    >
      {/* Outer neumorphic container - Responsive sizing */}
      <div
        className={`
          relative rounded-full neu-raised-lg
          ${config.padding}
          ${colors.glow}
          transition-shadow duration-300
        `}
      >
        {/* Small screen SVG */}
        <div
          className="relative rounded-full neu-pressed flex items-center justify-center md:hidden"
          style={{
            width: config.containerSize,
            height: config.containerSize,
          }}
        >
          <svg
            className="absolute inset-0 -rotate-90"
            width={config.containerSize}
            height={config.containerSize}
          >
            <circle
              cx={config.containerSize / 2}
              cy={config.containerSize / 2}
              r={radiusSm}
              fill="none"
              stroke="var(--shadow-dark)"
              strokeWidth={config.strokeWidth}
              opacity={0.3}
            />
            <motion.circle
              cx={config.containerSize / 2}
              cy={config.containerSize / 2}
              r={radiusSm}
              fill="none"
              stroke={colors.stroke}
              strokeWidth={config.strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumferenceSm}
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: strokeDashoffsetSm }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </svg>
          <TimerContent
            remainingSeconds={remainingSeconds}
            showLabel={showLabel}
            fontSize={config.fontSize}
            labelSize={config.labelSize}
            colors={colors}
            isUrgent={isUrgent}
            isWarning={isWarning}
            isExpired={isExpired}
          />
        </div>

        {/* Medium screen SVG */}
        <div
          className="relative rounded-full neu-pressed items-center justify-center hidden md:flex lg:hidden"
          style={{
            width: config.containerSizeMd,
            height: config.containerSizeMd,
          }}
        >
          <svg
            className="absolute inset-0 -rotate-90"
            width={config.containerSizeMd}
            height={config.containerSizeMd}
          >
            <circle
              cx={config.containerSizeMd / 2}
              cy={config.containerSizeMd / 2}
              r={radiusMd}
              fill="none"
              stroke="var(--shadow-dark)"
              strokeWidth={config.strokeWidthMd}
              opacity={0.3}
            />
            <motion.circle
              cx={config.containerSizeMd / 2}
              cy={config.containerSizeMd / 2}
              r={radiusMd}
              fill="none"
              stroke={colors.stroke}
              strokeWidth={config.strokeWidthMd}
              strokeLinecap="round"
              strokeDasharray={circumferenceMd}
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: strokeDashoffsetMd }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </svg>
          <TimerContent
            remainingSeconds={remainingSeconds}
            showLabel={showLabel}
            fontSize={config.fontSize}
            labelSize={config.labelSize}
            colors={colors}
            isUrgent={isUrgent}
            isWarning={isWarning}
            isExpired={isExpired}
          />
        </div>

        {/* Large screen SVG */}
        <div
          className="relative rounded-full neu-pressed items-center justify-center hidden lg:flex"
          style={{
            width: config.containerSizeLg,
            height: config.containerSizeLg,
          }}
        >
          <svg
            className="absolute inset-0 -rotate-90"
            width={config.containerSizeLg}
            height={config.containerSizeLg}
          >
            <circle
              cx={config.containerSizeLg / 2}
              cy={config.containerSizeLg / 2}
              r={radiusLg}
              fill="none"
              stroke="var(--shadow-dark)"
              strokeWidth={config.strokeWidthLg}
              opacity={0.3}
            />
            <motion.circle
              cx={config.containerSizeLg / 2}
              cy={config.containerSizeLg / 2}
              r={radiusLg}
              fill="none"
              stroke={colors.stroke}
              strokeWidth={config.strokeWidthLg}
              strokeLinecap="round"
              strokeDasharray={circumferenceLg}
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: strokeDashoffsetLg }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </svg>
          <TimerContent
            remainingSeconds={remainingSeconds}
            showLabel={showLabel}
            fontSize={config.fontSize}
            labelSize={config.labelSize}
            colors={colors}
            isUrgent={isUrgent}
            isWarning={isWarning}
            isExpired={isExpired}
          />
        </div>
      </div>

      {/* Outer glow ring for urgent state - Responsive sizing */}
      {isUrgent && !isExpired && (
        <>
          <motion.div
            className="absolute inset-0 rounded-full border-2 md:border-3 lg:border-4 border-error/30 md:hidden"
            style={{
              width: config.containerSize + 40,
              height: config.containerSize + 40,
              left: -6,
              top: -6,
            }}
            animate={{
              opacity: [0.3, 0.7, 0.3],
              scale: [1, 1.02, 1],
            }}
            transition={{
              duration: 0.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border-3 border-error/30 hidden md:block lg:hidden"
            style={{
              width: config.containerSizeMd + 44,
              height: config.containerSizeMd + 44,
              left: -7,
              top: -7,
            }}
            animate={{
              opacity: [0.3, 0.7, 0.3],
              scale: [1, 1.02, 1],
            }}
            transition={{
              duration: 0.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-error/30 hidden lg:block"
            style={{
              width: config.containerSizeLg + 48,
              height: config.containerSizeLg + 48,
              left: -8,
              top: -8,
            }}
            animate={{
              opacity: [0.3, 0.7, 0.3],
              scale: [1, 1.02, 1],
            }}
            transition={{
              duration: 0.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </>
      )}
    </motion.div>
  );
}

/**
 * TimerContent - Inner content of the timer (number and label)
 */
interface TimerContentProps {
  remainingSeconds: number;
  showLabel: boolean;
  fontSize: string;
  labelSize: string;
  colors: ReturnType<typeof getTimerColors>;
  isUrgent: boolean;
  isWarning: boolean;
  isExpired: boolean;
}

function TimerContent({
  remainingSeconds,
  showLabel,
  fontSize,
  labelSize,
  colors,
  isUrgent,
  isWarning,
  isExpired,
}: TimerContentProps) {
  return (
    <>
      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* Time display */}
        <AnimatePresence mode="wait">
          <motion.div
            key={remainingSeconds}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.2 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center"
          >
            <span
              className={`
                ${fontSize} font-bold font-display
                ${colors.text}
                transition-colors duration-300
                leading-none
              `}
            >
              {Math.max(0, remainingSeconds)}
            </span>
            
            {showLabel && (
              <span
                className={`
                  ${labelSize} font-medium
                  ${colors.text}
                  transition-colors duration-300
                  mt-0.5 md:mt-1
                `}
              >
                sec
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Pulsing glow effect for urgent state */}
      {isUrgent && !isExpired && (
        <motion.div
          className="absolute inset-0 rounded-full bg-error/20"
          animate={{
            opacity: [0.2, 0.5, 0.2],
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}

      {/* Warning pulse effect */}
      {isWarning && (
        <motion.div
          className="absolute inset-0 rounded-full bg-warning/10"
          animate={{
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
    </>
  );
}

/**
 * Compact timer variant for inline use
 * 
 * A smaller, inline timer display suitable for headers or compact layouts.
 * Responsive design for different screen sizes.
 */
export interface CompactTimerProps {
  /** Remaining seconds on the timer */
  remainingSeconds: number;
  /** Total time limit for the question */
  totalTimeLimit: number;
  /** Additional CSS classes */
  className?: string;
}

export function CompactTimer({
  remainingSeconds,
  totalTimeLimit,
  className = '',
}: CompactTimerProps) {
  // Calculate percentage remaining
  const percentage = useMemo(() => {
    if (totalTimeLimit <= 0) return 0;
    return Math.max(0, Math.min(100, (remainingSeconds / totalTimeLimit) * 100));
  }, [remainingSeconds, totalTimeLimit]);

  // Get colors based on percentage
  const colors = useMemo(() => getTimerColors(percentage), [percentage]);

  // Determine animation states
  const isUrgent = remainingSeconds <= 5 && remainingSeconds > 0;
  const isWarning = remainingSeconds <= 10 && remainingSeconds > 5;

  return (
    <motion.div
      className={`
        inline-flex items-center gap-1.5 md:gap-2 lg:gap-3 
        neu-raised-sm rounded-lg md:rounded-xl px-3 py-1.5 md:px-4 md:py-2 lg:px-6 lg:py-3
        ${colors.bg}
        ${className}
      `}
      animate={
        isUrgent
          ? {
              scale: [1, 1.05, 1],
              transition: { duration: 0.5, repeat: Infinity },
            }
          : isWarning
          ? {
              scale: [1, 1.02, 1],
              transition: { duration: 1, repeat: Infinity },
            }
          : {}
      }
    >
      {/* Timer icon - Responsive sizing */}
      <svg
        className={`w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 ${colors.text}`}
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

      {/* Time display - Responsive font size */}
      <span className={`text-lg md:text-xl lg:text-h2 font-bold font-display ${colors.text}`}>
        {Math.max(0, remainingSeconds)}
      </span>
      
      <span className={`text-xs md:text-sm lg:text-body font-medium ${colors.text}`}>sec</span>

      {/* Progress bar - Responsive width */}
      <div className="w-12 md:w-16 lg:w-24 h-1.5 md:h-2 rounded-full bg-[var(--shadow-dark)]/30 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: colors.stroke }}
          initial={{ width: '100%' }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </motion.div>
  );
}

export default CountdownTimer;
