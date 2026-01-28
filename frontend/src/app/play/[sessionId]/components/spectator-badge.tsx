/**
 * Spectator Badge Component
 * 
 * Displays a prominent "Spectator Mode" indicator when a participant
 * is in spectator mode (late joiner or eliminated participant).
 * 
 * Uses neumorphic design with CTX Teal (#275249) and Framer Motion animations.
 * Mobile-first responsive design.
 * 
 * Requirements: 3.6
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ==================== Types ====================

export interface SpectatorBadgeProps {
  /** Whether to show the badge */
  isVisible: boolean;
  /** Optional message to display below the badge */
  message?: string;
  /** Whether the participant was eliminated (vs late joiner) */
  isEliminated?: boolean;
  /** Variant: 'banner' for full-width, 'badge' for compact */
  variant?: 'banner' | 'badge';
}

// ==================== Animation Variants ====================

const bannerVariants = {
  hidden: { 
    opacity: 0, 
    y: -20,
    scale: 0.95,
  },
  visible: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25,
    },
  },
  exit: { 
    opacity: 0, 
    y: -10,
    scale: 0.95,
    transition: {
      duration: 0.2,
    },
  },
};

const badgeVariants = {
  hidden: { 
    opacity: 0, 
    scale: 0.8,
  },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 20,
    },
  },
  exit: { 
    opacity: 0, 
    scale: 0.8,
    transition: {
      duration: 0.15,
    },
  },
};

const iconVariants = {
  hidden: { rotate: -180, opacity: 0 },
  visible: { 
    rotate: 0, 
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 15,
      delay: 0.1,
    },
  },
};

const pulseVariants = {
  pulse: {
    scale: [1, 1.05, 1],
    opacity: [0.7, 1, 0.7],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// ==================== Sub-Components ====================

/**
 * Eye icon for spectator mode
 */
function SpectatorIcon({ className }: { className?: string }) {
  return (
    <motion.svg
      variants={iconVariants}
      className={className}
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
    </motion.svg>
  );
}

/**
 * Eliminated icon (for eliminated participants)
 */
function EliminatedIcon({ className }: { className?: string }) {
  return (
    <motion.svg
      variants={iconVariants}
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
      />
    </motion.svg>
  );
}

// ==================== Main Component ====================

/**
 * SpectatorBadge Component
 * 
 * Displays a prominent indicator when a participant is in spectator mode.
 * Can be shown as a full-width banner or a compact badge.
 * 
 * @example
 * ```tsx
 * // Full-width banner (default)
 * <SpectatorBadge 
 *   isVisible={isSpectator} 
 *   message="You're watching as a spectator"
 * />
 * 
 * // Compact badge
 * <SpectatorBadge 
 *   isVisible={isSpectator} 
 *   variant="badge"
 * />
 * 
 * // Eliminated participant
 * <SpectatorBadge 
 *   isVisible={isEliminated} 
 *   isEliminated={true}
 *   message="You've been eliminated"
 * />
 * ```
 */
export function SpectatorBadge({
  isVisible,
  message,
  isEliminated = false,
  variant = 'banner',
}: SpectatorBadgeProps) {
  // Default messages based on state
  const defaultMessage = isEliminated 
    ? "You've been eliminated - watching as spectator"
    : "You're watching as a spectator";
  
  const displayMessage = message || defaultMessage;

  // Colors based on state
  const bgColor = isEliminated 
    ? 'bg-gradient-to-r from-error/10 to-error/5' 
    : 'bg-gradient-to-r from-primary/10 to-primary/5';
  
  const borderColor = isEliminated 
    ? 'border-error/30' 
    : 'border-primary/30';
  
  const textColor = isEliminated 
    ? 'text-error' 
    : 'text-primary';
  
  const iconColor = isEliminated 
    ? 'text-error' 
    : 'text-primary';

  if (variant === 'badge') {
    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            variants={badgeVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`
              inline-flex items-center gap-2 px-3 py-1.5 rounded-full
              ${bgColor} border ${borderColor}
            `}
            role="status"
            aria-live="polite"
          >
            {/* Pulsing indicator dot */}
            <motion.span
              variants={pulseVariants}
              animate="pulse"
              className={`w-2 h-2 rounded-full ${isEliminated ? 'bg-error' : 'bg-primary'}`}
              aria-hidden="true"
            />
            
            {/* Icon */}
            {isEliminated ? (
              <EliminatedIcon className={`w-4 h-4 ${iconColor}`} />
            ) : (
              <SpectatorIcon className={`w-4 h-4 ${iconColor}`} />
            )}
            
            {/* Label */}
            <span className={`text-sm font-semibold ${textColor}`}>
              Spectator
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Banner variant (default)
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          variants={bannerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={`
            w-full px-4 py-3 rounded-xl
            ${bgColor} border ${borderColor}
            neu-raised-sm
          `}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            {/* Icon container with pulse effect */}
            <motion.div
              variants={pulseVariants}
              animate="pulse"
              className={`
                flex-shrink-0 w-10 h-10 rounded-full 
                flex items-center justify-center
                ${isEliminated ? 'bg-error/20' : 'bg-primary/20'}
              `}
            >
              {isEliminated ? (
                <EliminatedIcon className={`w-5 h-5 ${iconColor}`} />
              ) : (
                <SpectatorIcon className={`w-5 h-5 ${iconColor}`} />
              )}
            </motion.div>

            {/* Text content */}
            <div className="flex-1 min-w-0">
              <h3 className={`font-bold ${textColor}`}>
                Spectator Mode
              </h3>
              <p className="text-sm text-[var(--text-secondary)] truncate">
                {displayMessage}
              </p>
            </div>

            {/* Live indicator */}
            <div className="flex-shrink-0 flex items-center gap-1.5">
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
              <span className={`text-xs font-medium ${textColor}`}>
                LIVE
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SpectatorBadge;
