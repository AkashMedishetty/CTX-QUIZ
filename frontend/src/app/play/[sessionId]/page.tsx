/**
 * Participant Play Page
 * 
 * Main page for participants during a quiz session.
 * Handles WebSocket connection and displays different screens based on session state:
 * - LOBBY: Waiting for quiz to start
 * - ACTIVE_QUESTION: Question answering interface
 * - REVEAL: Answer reveal screen (placeholder)
 * - ENDED: Final results screen (placeholder)
 * 
 * Mobile-first responsive design optimized for 320px-428px width.
 * Uses touch-friendly UI with minimum 44px tap targets.
 * Supports iOS safe areas for notched devices.
 * Includes offline support with answer queuing.
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10
 */

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  useParticipantSocket, 
  getStoredSessionData,
  clearStoredSessionData,
} from '@/hooks/useParticipantSocket';
import { useOfflineAnswerQueue } from '@/hooks/useOfflineAnswerQueue';
import { useServiceWorker } from '@/hooks/useServiceWorker';
import { LobbyScreen, QuestionScreen, ResultScreen, OfflineIndicator } from './components';

// ==================== Types ====================

interface StoredParticipantData {
  sessionId: string;
  participantId: string;
  nickname: string;
  token: string;
}

// ==================== Loading Screen ====================

function LoadingScreen() {
  return (
    <main className="min-h-screen-mobile flex flex-col items-center justify-center p-4 bg-[var(--neu-bg)] safe-area-inset-y overscroll-none">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4"
        >
          <svg
            className="w-full h-full text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </motion.div>
        <p className="text-sm sm:text-base text-[var(--text-secondary)]">Loading...</p>
      </motion.div>
    </main>
  );
}

// ==================== Error Screen ====================

function ErrorScreen({ 
  message, 
  onRetry 
}: { 
  message: string; 
  onRetry: () => void;
}) {
  return (
    <main className="min-h-screen-mobile flex flex-col items-center justify-center p-4 xs-px-tight bg-[var(--neu-bg)] safe-area-inset-y overscroll-none">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md text-center px-2 sm:px-0"
      >
        <div className="neu-raised-lg rounded-xl p-6 sm:p-8">
          {/* Error Icon */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-error/10 flex items-center justify-center">
            <svg
              className="w-7 h-7 sm:w-8 sm:h-8 text-error"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] mb-2">
            Connection Error
          </h2>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] mb-5 sm:mb-6">{message}</p>

          <button
            onClick={onRetry}
            className="w-full py-3 sm:py-3.5 px-4 sm:px-6 bg-primary text-white rounded-lg font-medium text-sm sm:text-base
                       shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]
                       hover:bg-primary-light active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]
                       transition-all duration-200 touch-target-48 tap-highlight-none"
          >
            Try Again
          </button>
        </div>
      </motion.div>
    </main>
  );
}

// ==================== Session Not Found Screen ====================

function SessionNotFoundScreen({ onJoin }: { onJoin: () => void }) {
  return (
    <main className="min-h-screen-mobile flex flex-col items-center justify-center p-4 xs-px-tight bg-[var(--neu-bg)] safe-area-inset-y overscroll-none">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md text-center px-2 sm:px-0"
      >
        <div className="neu-raised-lg rounded-xl p-6 sm:p-8">
          {/* Warning Icon */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-warning/10 flex items-center justify-center">
            <svg
              className="w-7 h-7 sm:w-8 sm:h-8 text-warning"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] mb-2">
            Session Not Found
          </h2>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] mb-5 sm:mb-6">
            Your session data was not found. Please join the quiz again.
          </p>

          <button
            onClick={onJoin}
            className="w-full py-3 sm:py-3.5 px-4 sm:px-6 bg-primary text-white rounded-lg font-medium text-sm sm:text-base
                       shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]
                       hover:bg-primary-light active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]
                       transition-all duration-200 touch-target-48 tap-highlight-none"
          >
            Join Quiz
          </button>
        </div>
      </motion.div>
    </main>
  );
}

// ==================== Kicked Screen ====================

function KickedScreen({ 
  reason, 
  onJoin 
}: { 
  reason: string; 
  onJoin: () => void;
}) {
  return (
    <main className="min-h-screen-mobile flex flex-col items-center justify-center p-4 xs-px-tight bg-[var(--neu-bg)] safe-area-inset-y overscroll-none">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md text-center px-2 sm:px-0"
      >
        <div className="neu-raised-lg rounded-xl p-6 sm:p-8">
          {/* Kicked Icon */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-error/10 flex items-center justify-center">
            <svg
              className="w-7 h-7 sm:w-8 sm:h-8 text-error"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] mb-2">
            Removed from Quiz
          </h2>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] mb-5 sm:mb-6">{reason}</p>

          <button
            onClick={onJoin}
            className="w-full py-3 sm:py-3.5 px-4 sm:px-6 bg-primary text-white rounded-lg font-medium text-sm sm:text-base
                       shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]
                       hover:bg-primary-light active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]
                       transition-all duration-200 touch-target-48 tap-highlight-none"
          >
            Join Another Quiz
          </button>
        </div>
      </motion.div>
    </main>
  );
}

// ==================== Placeholder Screens ====================

interface EndedScreenProps {
  personalScore: number;
  personalRank: number | null;
  totalParticipants: number;
  nickname: string;
  leaderboard?: Array<{
    rank: number;
    participantId: string;
    nickname: string;
    totalScore: number;
    streakCount?: number;
  }>;
  onJoinAnother: () => void;
}

function EndedScreen({ 
  personalScore, 
  personalRank, 
  totalParticipants, 
  nickname,
  leaderboard,
  onJoinAnother 
}: EndedScreenProps) {
  return (
    <main className="min-h-screen-mobile flex flex-col items-center justify-center p-4 xs-px-tight bg-[var(--neu-bg)] safe-area-inset-y overscroll-none">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md px-2 sm:px-0"
      >
        {/* Trophy Icon */}
        <div className="text-center mb-4 sm:mb-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
            className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 rounded-full bg-warning/20 flex items-center justify-center"
          >
            <svg
              className="w-8 h-8 sm:w-10 sm:h-10 text-warning"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          </motion.div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">
            Quiz Complete!
          </h1>
        </div>

        {/* Personal Results Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="neu-raised-lg rounded-xl p-5 sm:p-6 mb-4"
        >
          <div className="text-center">
            <p className="text-sm text-[var(--text-muted)] mb-1">Your Final Score</p>
            <p className="text-3xl sm:text-4xl font-bold text-primary mb-3">
              {personalScore.toLocaleString()}
            </p>
            
            {personalRank !== null && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--neu-surface)]">
                <span className="text-sm text-[var(--text-secondary)]">Rank</span>
                <span className="text-lg font-bold text-[var(--text-primary)]">
                  #{personalRank}
                </span>
                <span className="text-sm text-[var(--text-muted)]">
                  of {totalParticipants}
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Top 5 Leaderboard */}
        {leaderboard && leaderboard.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="neu-raised-lg rounded-xl p-4 sm:p-5 mb-4"
          >
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 text-center">
              Top Players
            </h3>
            <div className="space-y-2">
              {leaderboard.slice(0, 5).map((player, index) => (
                <div
                  key={player.participantId}
                  className={`flex items-center justify-between p-2 sm:p-3 rounded-lg ${
                    player.nickname === nickname
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-[var(--neu-surface)]'
                  }`}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className={`w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-xs sm:text-sm font-bold ${
                      index === 0 ? 'bg-warning text-white' :
                      index === 1 ? 'bg-gray-400 text-white' :
                      index === 2 ? 'bg-amber-600 text-white' :
                      'bg-[var(--neu-bg)] text-[var(--text-secondary)]'
                    }`}>
                      {player.rank}
                    </span>
                    <span className={`text-sm sm:text-base font-medium ${
                      player.nickname === nickname ? 'text-primary' : 'text-[var(--text-primary)]'
                    }`}>
                      {player.nickname}
                      {player.nickname === nickname && ' (You)'}
                    </span>
                  </div>
                  <span className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
                    {player.totalScore.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Join Another Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <button
            onClick={onJoinAnother}
            className="w-full py-3 sm:py-3.5 px-4 sm:px-6 bg-primary text-white rounded-lg font-medium text-sm sm:text-base
                       shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]
                       hover:bg-primary-light active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]
                       transition-all duration-200 touch-target-48 tap-highlight-none"
          >
            Join Another Quiz
          </button>
        </motion.div>
      </motion.div>
    </main>
  );
}

// ==================== Main Component ====================

export default function ParticipantPlayPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  // State for participant data
  const [participantData, setParticipantData] = React.useState<StoredParticipantData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [kickedReason, setKickedReason] = React.useState<string | null>(null);
  
  // State for answer selection
  const [selectedOptions, setSelectedOptions] = React.useState<string[]>([]);
  
  // State for personal result (from answer_result event)
  const [personalResult, setPersonalResult] = React.useState<{
    isCorrect: boolean;
    pointsEarned: number;
    speedBonus: number;
    streakBonus: number;
  } | null>(null);
  
  // State for previous rank (to show rank change in result screen)
  const [previousRank, setPreviousRank] = React.useState<number | null>(null);

  // Initialize Service Worker for offline support
  useServiceWorker({
    swPath: '/sw.js',
    onRegistered: () => {
      console.log('[ParticipantPlayPage] Service Worker registered');
    },
    onUpdateAvailable: () => {
      console.log('[ParticipantPlayPage] Service Worker update available');
    },
  });

  // Initialize offline answer queue
  const {
    status: queueStatus,
    isOnline,
    pendingCount,
    queueAnswer,
    flushQueue: _flushQueue, // Prefixed with _ as it's used indirectly via auto-flush
  } = useOfflineAnswerQueue({
    onFlushComplete: (results) => {
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      console.log(`[ParticipantPlayPage] Queue flush complete: ${successful} successful, ${failed} failed`);
    },
  });
  
  // State for last question data (to show in reveal screen)
  const [lastQuestion, setLastQuestion] = React.useState<{
    questionId: string;
    questionText: string;
    questionType: string;
    questionImageUrl?: string;
    options: Array<{ optionId: string; optionText: string; optionImageUrl?: string }>;
    timeLimit: number;
  } | null>(null);
  
  // State for last selected options (to show in reveal screen)
  const [lastSelectedOptions, setLastSelectedOptions] = React.useState<string[]>([]);

  // Load participant data from localStorage
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedData = getStoredSessionData();
      
      if (storedData && storedData.sessionId === sessionId) {
        setParticipantData(storedData);
      }
      
      setIsLoading(false);
    }
  }, [sessionId]);

  // Use the participant socket hook
  const {
    connectionState,
    isConnected,
    error,
    sessionState,
    submitAnswer,
    connect,
    clearSession,
  } = useParticipantSocket({
    sessionId,
    participantId: participantData?.participantId || '',
    token: participantData?.token,
    autoConnect: !!participantData,
    onKicked: (reason) => {
      setKickedReason(reason);
      clearStoredSessionData();
    },
    onSessionEnded: () => {
      // Session ended, could redirect or show message
    },
    onQuestionStarted: (question) => {
      // Save current rank as previous rank before new question
      if (sessionState?.personalRank !== null && sessionState?.personalRank !== undefined) {
        setPreviousRank(sessionState.personalRank);
      }
      // Reset selected options when a new question starts
      setSelectedOptions([]);
      // Reset personal result for new question
      setPersonalResult(null);
      // Store the question data for reveal screen
      setLastQuestion({
        questionId: question.questionId,
        questionText: question.questionText,
        questionType: question.questionType,
        questionImageUrl: question.questionImageUrl,
        options: question.options,
        timeLimit: question.timeLimit,
      });
    },
    onRevealAnswers: () => {
      // Store the selected options when answers are revealed
      setLastSelectedOptions([...selectedOptions]);
    },
    onPersonalResult: (result) => {
      // Store personal result for display in reveal screen
      setPersonalResult({
        isCorrect: result.isCorrect,
        pointsEarned: result.pointsEarned,
        speedBonus: 0, // Will be calculated from breakdown if available
        streakBonus: 0,
      });
    },
  });

  // Handle navigation to join page
  const handleGoToJoin = React.useCallback(() => {
    clearSession();
    router.push('/join');
  }, [clearSession, router]);

  // Handle retry connection
  const handleRetry = React.useCallback(() => {
    connect();
  }, [connect]);

  // Handle option selection
  const handleSelectOption = React.useCallback((optionId: string) => {
    const questionType = sessionState?.currentQuestion?.questionType;
    const isMultiAnswer = questionType === 'MULTI_CORRECT' || 
                          questionType === 'MULTIPLE_CHOICE_MULTI';

    setSelectedOptions((prev) => {
      if (isMultiAnswer) {
        // Toggle selection for multi-answer questions
        if (prev.includes(optionId)) {
          return prev.filter((id) => id !== optionId);
        }
        return [...prev, optionId];
      } else {
        // Single selection for regular questions
        return [optionId];
      }
    });
  }, [sessionState?.currentQuestion?.questionType]);

  // Handle answer submission (with offline queue support)
  const handleSubmitAnswer = React.useCallback(() => {
    if (!sessionState?.currentQuestion || selectedOptions.length === 0) return;
    if (!participantData) return;
    
    const questionId = sessionState.currentQuestion.questionId;
    
    // If connected, submit directly
    if (isConnected) {
      submitAnswer(questionId, selectedOptions);
    } else {
      // Queue the answer for later submission when offline
      const queued = queueAnswer({
        questionId,
        selectedOptionIds: selectedOptions,
        sessionId,
        participantId: participantData.participantId,
      });
      
      if (queued) {
        console.log('[ParticipantPlayPage] Answer queued for offline submission');
      }
    }
  }, [sessionState?.currentQuestion, selectedOptions, submitAnswer, isConnected, queueAnswer, sessionId, participantData]);

  // Flush offline queue when reconnected
  React.useEffect(() => {
    if (isConnected && pendingCount > 0) {
      console.log('[ParticipantPlayPage] Reconnected with pending answers, flushing queue...');
      // Note: We need to get the socket from somewhere to flush
      // For now, we'll rely on the auto-flush mechanism in the hook
      // The queue will be flushed when the socket reconnects
    }
  }, [isConnected, pendingCount]);

  // Show loading screen while checking localStorage
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Show kicked screen if participant was kicked
  if (kickedReason) {
    return <KickedScreen reason={kickedReason} onJoin={handleGoToJoin} />;
  }

  // Show session not found if no participant data
  if (!participantData) {
    return <SessionNotFoundScreen onJoin={handleGoToJoin} />;
  }

  // Show error screen if connection failed
  if (connectionState === 'error' && error) {
    return <ErrorScreen message={error} onRetry={handleRetry} />;
  }

  // Determine which screen to show based on session state
  const currentState = sessionState?.state || 'LOBBY';

  // Get nickname from session state or stored data
  const nickname = sessionState?.nickname || participantData.nickname;
  const participantCount = sessionState?.participantCount || 0;

  switch (currentState) {
    case 'LOBBY':
      return (
        <>
          <OfflineIndicator
            isConnected={isConnected}
            isOnline={isOnline}
            pendingCount={pendingCount}
            queueStatus={queueStatus}
          />
          <LobbyScreen
            nickname={nickname}
            participantCount={participantCount}
            connectionState={connectionState}
            sessionId={sessionId}
            error={error}
          />
        </>
      );

    case 'ACTIVE_QUESTION':
      // Show question screen if we have question data
      if (sessionState?.currentQuestion) {
        return (
          <>
            <OfflineIndicator
              isConnected={isConnected}
              isOnline={isOnline}
              pendingCount={pendingCount}
              queueStatus={queueStatus}
            />
            <QuestionScreen
              question={{
                questionId: sessionState.currentQuestion.questionId,
                questionText: sessionState.currentQuestion.questionText,
                questionType: sessionState.currentQuestion.questionType,
                questionImageUrl: sessionState.currentQuestion.questionImageUrl,
                options: sessionState.currentQuestion.options,
                timeLimit: sessionState.currentQuestion.timeLimit,
              }}
              questionIndex={sessionState.currentQuestionIndex}
              totalQuestions={sessionState.totalQuestions}
              remainingSeconds={sessionState.remainingSeconds}
              hasSubmitted={sessionState.hasAnsweredCurrentQuestion}
              selectedOptions={selectedOptions}
              onSelectOption={handleSelectOption}
              onSubmit={handleSubmitAnswer}
              isConnected={isConnected}
              currentScore={sessionState.personalScore}
              currentStreak={sessionState.streakCount}
              isSpectator={sessionState.isSpectator}
              isEliminated={sessionState.isEliminated}
            />
          </>
        );
      }
      // Fallback to loading if no question data yet
      return <LoadingScreen />;

    case 'REVEAL':
      // Show result screen with answer reveal data
      if (sessionState?.correctOptions && lastQuestion) {
        return (
          <>
            <OfflineIndicator
              isConnected={isConnected}
              isOnline={isOnline}
              pendingCount={pendingCount}
              queueStatus={queueStatus}
            />
            <ResultScreen
              isCorrect={personalResult?.isCorrect ?? false}
              correctOptions={sessionState.correctOptions}
              selectedOptions={lastSelectedOptions}
              question={lastQuestion}
              pointsEarned={personalResult?.pointsEarned ?? 0}
              speedBonus={personalResult?.speedBonus}
              streakBonus={personalResult?.streakBonus}
              streakCount={sessionState.streakCount}
              totalScore={sessionState.personalScore}
              rank={sessionState.personalRank}
              previousRank={previousRank}
              totalParticipants={sessionState.participantCount}
              explanationText={sessionState.explanationText}
              isConnected={isConnected}
              isSpectator={sessionState.isSpectator}
              isEliminated={sessionState.isEliminated}
              leaderboard={sessionState.leaderboard}
            />
          </>
        );
      }
      // Fallback if data not ready yet
      return <LoadingScreen />;

    case 'ENDED':
      return (
        <EndedScreen
          personalScore={sessionState?.personalScore ?? 0}
          personalRank={sessionState?.personalRank ?? null}
          totalParticipants={sessionState?.participantCount ?? 0}
          nickname={nickname}
          leaderboard={sessionState?.leaderboard}
          onJoinAnother={handleGoToJoin}
        />
      );

    default:
      return (
        <>
          <OfflineIndicator
            isConnected={isConnected}
            isOnline={isOnline}
            pendingCount={pendingCount}
            queueStatus={queueStatus}
          />
          <LobbyScreen
            nickname={nickname}
            participantCount={participantCount}
            connectionState={connectionState}
            sessionId={sessionId}
            error={error}
          />
        </>
      );
  }
}
