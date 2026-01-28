/**
 * Nickname Entry Page - Join session with nickname
 * 
 * Mobile-first page for participants to enter their nickname
 * after providing a valid join code.
 * 
 * Optimized for 320px-428px width with:
 * - Touch-friendly UI (44px min tap targets)
 * - Safe area insets for notched devices
 * - Responsive typography and spacing
 * - Prevents iOS zoom on input focus (16px min font)
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.8, 14.1, 14.9
 */

'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { NicknameInput, validateNickname } from '../components/nickname-input';
import { Button } from '@/components/ui';
import { post, ApiError } from '@/lib/api-client';

/**
 * Join session response from API
 */
interface JoinSessionResponse {
  sessionId: string;
  participantId: string;
  sessionToken: string;
  nickname: string;
}

/**
 * Error codes from the API
 */
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_JOIN_CODE: 'Invalid join code. Please check and try again.',
  SESSION_NOT_FOUND: 'Session not found or has ended.',
  SESSION_ENDED: 'This quiz session has ended.',
  SESSION_FULL: 'This session is full.',
  PROFANITY_DETECTED: 'Nickname contains inappropriate content.',
  RATE_LIMIT_EXCEEDED: 'Too many attempts. Please wait a moment.',
  NICKNAME_TAKEN: 'This nickname is already taken. Please choose another.',
  PARTICIPANT_BANNED: 'You have been banned from this session.',
  INVALID_NICKNAME: 'Invalid nickname. Please use only letters, numbers, and spaces.',
};

export default function NicknameEntryPage() {
  const router = useRouter();
  const params = useParams();
  const joinCode = (params.code as string)?.toUpperCase() || '';

  const [nickname, setNickname] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isValidCode, setIsValidCode] = React.useState(true);

  // Validate join code format on mount
  React.useEffect(() => {
    if (!joinCode || joinCode.length !== 6 || !/^[A-Z0-9]+$/.test(joinCode)) {
      setIsValidCode(false);
      setError('Invalid join code format');
    }
  }, [joinCode]);

  /**
   * Handle nickname change
   */
  const handleNicknameChange = (value: string) => {
    setNickname(value);
    // Clear error when user starts typing
    if (error) {
      setError(null);
    }
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async () => {
    // Client-side validation
    const validationError = validateNickname(nickname);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Call the join API
      const response = await post<JoinSessionResponse>('/sessions/join', {
        joinCode,
        nickname: nickname.trim(),
      });

      // Store session data in localStorage
      // Use the keys expected by useParticipantSocket hook
      if (typeof window !== 'undefined') {
        // Store in the format expected by getStoredSessionData()
        const sessionData = {
          sessionId: response.sessionId,
          participantId: response.participantId,
          nickname: response.nickname,
          token: response.sessionToken,
        };
        localStorage.setItem('ctx_quiz_session_data', JSON.stringify(sessionData));
        localStorage.setItem('ctx_quiz_session_token', response.sessionToken);
        
        // Also store individual keys for backward compatibility
        localStorage.setItem('quiz_session_token', response.sessionToken);
        localStorage.setItem('quiz_session_id', response.sessionId);
        localStorage.setItem('quiz_participant_id', response.participantId);
        localStorage.setItem('quiz_nickname', response.nickname);
      }

      // Navigate to the participant lobby
      router.push(`/play/${response.sessionId}`);
    } catch (err) {
      const apiError = err as ApiError;
      
      // Map error code to user-friendly message
      const errorMessage = ERROR_MESSAGES[apiError.code] || apiError.message || 'Failed to join. Please try again.';
      setError(errorMessage);

      // If it's a session-related error, redirect back to join page
      if (['INVALID_JOIN_CODE', 'SESSION_NOT_FOUND', 'SESSION_ENDED'].includes(apiError.code)) {
        setTimeout(() => {
          router.push('/join');
        }, 2000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle back button
   */
  const handleBack = () => {
    router.push('/join');
  };

  // Show error state for invalid code
  if (!isValidCode) {
    return (
      <main className="min-h-screen-mobile flex flex-col items-center justify-center p-4 xs-px-tight bg-[var(--neu-bg)] safe-area-inset-y overscroll-none">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md text-center px-2 sm:px-0"
        >
          <div className="neu-raised-lg rounded-xl p-6 sm:p-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-error/10 flex items-center justify-center">
              <svg
                className="w-7 h-7 sm:w-8 sm:h-8 text-error"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-[var(--text-primary)] mb-2">
              Invalid Join Code
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] mb-5 sm:mb-6">
              The join code format is invalid. Please check and try again.
            </p>
            <Button variant="primary" size="lg" fullWidth onClick={handleBack} className="touch-target-48">
              Try Again
            </Button>
          </div>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-screen-mobile flex flex-col items-center justify-center p-4 xs-px-tight bg-[var(--neu-bg)] safe-area-inset-y overscroll-none">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.0, 0.0, 0.2, 1] }}
        className="w-full max-w-md px-2 sm:px-0"
      >
        {/* Back Button - Touch-friendly */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          onClick={handleBack}
          className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-4 sm:mb-6 touch-target-44 tap-highlight-none -ml-2 pl-2"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span className="text-sm sm:text-base">Back</span>
        </motion.button>

        {/* Header */}
        <div className="text-center mb-4 sm:mb-6">
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] mb-2">
              Join Quiz
            </h1>
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm sm:text-base text-[var(--text-secondary)]">Code:</span>
              <span className="font-mono font-bold text-primary text-base sm:text-lg tracking-wider">
                {joinCode}
              </span>
            </div>
          </motion.div>
        </div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="neu-raised-lg rounded-xl p-5 sm:p-6 md:p-8"
        >
          {/* Nickname Input */}
          <div className="mb-5 sm:mb-6">
            <NicknameInput
              value={nickname}
              onChange={handleNicknameChange}
              error={error}
              disabled={isLoading}
              onSubmit={handleSubmit}
            />
          </div>

          {/* Join Button - Touch-friendly */}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={!nickname.trim() || isLoading}
            className="touch-target-48"
          >
            {isLoading ? 'Joining...' : 'Join Quiz'}
          </Button>

          {/* Tips - Compact on mobile */}
          <div className="mt-5 sm:mt-6 p-3 sm:p-4 rounded-lg bg-[var(--neu-surface)]">
            <h3 className="text-xs sm:text-sm font-medium text-[var(--text-primary)] mb-1.5 sm:mb-2">
              Tips for a great nickname:
            </h3>
            <ul className="text-xs text-[var(--text-muted)] space-y-0.5 sm:space-y-1">
              <li>• Keep it fun and memorable</li>
              <li>• Avoid personal information</li>
              <li>• Be respectful to others</li>
            </ul>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="text-center mt-6 sm:mt-8"
        >
          <p className="text-xs text-[var(--text-muted)]">
            A product of{' '}
            <a
              href="https://ctx.works"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline touch-target-44 inline-block py-1"
            >
              ctx.works
            </a>
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Powered by{' '}
            <a
              href="https://purplehatevents.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-secondary)] hover:underline"
            >
              PurpleHat Events
            </a>
          </p>
        </motion.div>
      </motion.div>
    </main>
  );
}
