/**
 * Controller Panel Page - Live quiz control interface
 * 
 * Provides real-time quiz control with:
 * - WebSocket connection with controller authentication
 * - Session info display (join code, participant count)
 * - Quiz control interface (start, next, void, end)
 * - Connection status indicator
 * - Neumorphic design following design-system.md
 * 
 * Requirements: 2.8, 13.1, 13.2, 13.3, 13.9
 */

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useControllerSocket } from '@/hooks/useControllerSocket';
import { ThemeToggle } from '@/components/ui';
import { ConnectionStatusIndicator, SessionInfoCard, QuizControlCard, TimerControlCard, ParticipantListCard, QuestionWithNotes, AnswerCountCard, LeaderboardCard, BigScreenPreviewCard, SystemMetricsCard, VoidConfirmation, FocusMonitoringCard, TournamentBracketCard } from './components';
import type { TimerState, Participant } from './components';

/**
 * Controller Panel Page Component
 */
export default function ControllerPanelPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  
  const [isInitialized, setIsInitialized] = useState(false);
  // Quiz questions for preview - would be populated from API
  const [quizQuestions] = useState<QuestionWithNotes[]>([]);
  // Void confirmation state - Requirements: 6.4
  const [voidConfirmation, setVoidConfirmation] = useState<VoidConfirmation | null>(null);

  const {
    connectionState,
    isConnected,
    error,
    sessionState,
    connect,
    startQuiz,
    nextQuestion,
    endQuiz,
    voidQuestion,
    skipQuestion,
    pauseTimer,
    resumeTimer,
    resetTimer,
    kickParticipant,
    banParticipant,
    toggleLateJoiners,
  } = useControllerSocket({
    sessionId,
    autoConnect: true,
    onConnect: () => {
      console.info('[Controller] Connected to session:', sessionId);
    },
    onDisconnect: (reason) => {
      console.warn('[Controller] Disconnected:', reason);
    },
    onError: (err) => {
      console.error('[Controller] Error:', err);
    },
    onQuizStarted: () => {
      console.info('[Controller] Quiz started');
    },
    onQuizEnded: (leaderboard) => {
      console.info('[Controller] Quiz ended, final leaderboard:', leaderboard.length, 'entries');
    },
    // Requirements: 6.4 - Show confirmation that participants have been notified
    onQuestionVoided: (data) => {
      console.info('[Controller] Question voided:', data);
      setVoidConfirmation({
        questionId: data.questionId,
        participantsAffected: data.participantsAffected,
        message: data.message,
        timestamp: Date.now(),
      });
    },
  });

  // Mark as initialized after first render
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Fetch quiz questions when connected (for preview functionality)
  useEffect(() => {
    if (isConnected && sessionId) {
      // In a real implementation, this would fetch from the API
      // For now, we'll use the current question from sessionState
      // The questions array would be populated from the session data
    }
  }, [isConnected, sessionId]);

  // Handle manual reconnection
  const handleReconnect = () => {
    if (connectionState === 'disconnected' || connectionState === 'error') {
      connect();
    }
  };

  // Handle start quiz
  const handleStartQuiz = useCallback(() => {
    startQuiz();
  }, [startQuiz]);

  // Handle next question
  const handleNextQuestion = useCallback(() => {
    nextQuestion();
  }, [nextQuestion]);

  // Handle void question
  const handleVoidQuestion = useCallback((questionId: string, reason: string) => {
    voidQuestion(questionId, reason);
  }, [voidQuestion]);

  // Handle skip question - Requirements: 5.2
  const handleSkipQuestion = useCallback((reason?: string) => {
    skipQuestion(reason);
  }, [skipQuestion]);

  // Handle clear void confirmation - Requirements: 6.4
  const handleClearVoidConfirmation = useCallback(() => {
    setVoidConfirmation(null);
  }, []);

  // Handle end quiz
  const handleEndQuiz = useCallback(() => {
    endQuiz();
  }, [endQuiz]);

  // Handle pause timer
  const handlePauseTimer = useCallback(() => {
    pauseTimer();
  }, [pauseTimer]);

  // Handle resume timer
  const handleResumeTimer = useCallback(() => {
    resumeTimer();
  }, [resumeTimer]);

  // Handle reset timer
  const handleResetTimer = useCallback((newTimeLimit: number) => {
    resetTimer(newTimeLimit);
  }, [resetTimer]);

  // Handle kick participant
  const handleKickParticipant = useCallback((participantId: string, reason: string) => {
    kickParticipant(participantId, reason);
  }, [kickParticipant]);

  // Handle ban participant
  const handleBanParticipant = useCallback((participantId: string, reason: string) => {
    banParticipant(participantId, reason);
  }, [banParticipant]);

  // Handle toggle late joiners
  const handleToggleLateJoiners = useCallback((allow: boolean) => {
    toggleLateJoiners(allow);
  }, [toggleLateJoiners]);

  // Handle export data
  const handleExportData = useCallback(async (format: 'json' | 'csv') => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${apiUrl}/sessions/${sessionId}/export?format=${format}`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Export failed');
      }
      
      // Get the blob and create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz-results-${sessionId}-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('[Controller] Export failed:', err);
    }
  }, [sessionId]);

  // Transform participants for the ParticipantListCard
  const participantsForList: Participant[] = useMemo(() => {
    if (!sessionState?.participants) return [];
    
    return sessionState.participants.map((p) => {
      // Find matching leaderboard entry for score
      const leaderboardEntry = sessionState.leaderboard?.find(
        (entry) => entry.participantId === p.participantId
      );
      
      return {
        participantId: p.participantId,
        nickname: p.nickname,
        status: p.status,
        score: leaderboardEntry?.totalScore,
        rank: leaderboardEntry ? sessionState.leaderboard.indexOf(leaderboardEntry) + 1 : undefined,
        isEliminated: false, // Would come from participant data in elimination mode
        lastSeen: p.lastSeen,
      };
    });
  }, [sessionState?.participants, sessionState?.leaderboard]);

  // Get current question with notes (extend the question data)
  const currentQuestionWithNotes: QuestionWithNotes | null = sessionState?.currentQuestion
    ? {
        ...sessionState.currentQuestion,
        // Speaker notes and explanation would come from the full quiz data
        speakerNotes: undefined,
        explanationText: undefined,
      }
    : null;

  return (
    <div className="min-h-screen bg-[var(--neu-bg)]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--neu-bg)] border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Title */}
            <div className="flex items-center gap-4">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center neu-raised-sm">
                  <span className="text-white font-bold text-lg">C</span>
                </div>
                <div>
                  <h1 className="text-h3 font-semibold text-[var(--text-primary)]">
                    Controller Panel
                  </h1>
                  <p className="text-caption text-[var(--text-muted)]">
                    CTX Quiz
                  </p>
                </div>
              </motion.div>
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <ConnectionStatusIndicator
                state={connectionState}
                onReconnect={handleReconnect}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {/* Loading State */}
          {!isInitialized && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center min-h-[400px]"
            >
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full neu-raised flex items-center justify-center">
                  <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-body text-[var(--text-secondary)]">
                  Initializing controller...
                </p>
              </div>
            </motion.div>
          )}

          {/* Error State */}
          {isInitialized && connectionState === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex items-center justify-center min-h-[400px]"
            >
              <div className="text-center max-w-md">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error/10 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-error"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h2 className="text-h2 font-semibold text-[var(--text-primary)] mb-2">
                  Connection Error
                </h2>
                <p className="text-body text-[var(--text-secondary)] mb-6">
                  {error || 'Unable to connect to the quiz session. Please check the session ID and try again.'}
                </p>
                <button
                  onClick={handleReconnect}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-md font-medium neu-raised-sm hover:bg-primary-light transition-colors"
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Try Again
                </button>
              </div>
            </motion.div>
          )}

          {/* Connecting State */}
          {isInitialized && (connectionState === 'connecting' || connectionState === 'authenticating') && (
            <motion.div
              key="connecting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center min-h-[400px]"
            >
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full neu-raised flex items-center justify-center">
                  <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-body text-[var(--text-secondary)]">
                  {connectionState === 'authenticating' 
                    ? 'Authenticating as controller...' 
                    : 'Connecting to session...'}
                </p>
              </div>
            </motion.div>
          )}

          {/* Connected State - Main Dashboard */}
          {isInitialized && isConnected && (
            <motion.div
              key="connected"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Session Info Card */}
              <SessionInfoCard
                sessionId={sessionId}
                joinCode={sessionState?.joinCode || '------'}
                participantCount={sessionState?.participantCount || 0}
                sessionState={sessionState?.state || 'LOBBY'}
                systemMetrics={sessionState?.systemMetrics || null}
                allowLateJoiners={sessionState?.allowLateJoiners ?? true}
                onToggleLateJoiners={handleToggleLateJoiners}
                onExportData={handleExportData}
              />

              {/* Quiz Control and Timer Control Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Quiz Control Card - Takes 2 columns on xl screens */}
                <div className="xl:col-span-2">
                  <QuizControlCard
                    sessionState={sessionState?.state || 'LOBBY'}
                    currentQuestion={currentQuestionWithNotes}
                    currentQuestionIndex={sessionState?.currentQuestionIndex || 0}
                    totalQuestions={sessionState?.totalQuestions || 0}
                    questions={quizQuestions}
                    examMode={sessionState?.examMode ?? null}
                    voidConfirmation={voidConfirmation}
                    onStartQuiz={handleStartQuiz}
                    onNextQuestion={handleNextQuestion}
                    onSkipReveal={handleNextQuestion}
                    onSkipQuestion={handleSkipQuestion}
                    onVoidQuestion={handleVoidQuestion}
                    onEndQuiz={handleEndQuiz}
                    onClearVoidConfirmation={handleClearVoidConfirmation}
                    isDisabled={connectionState !== 'connected'}
                  />
                </div>

                {/* Timer Control Card - Takes 1 column on xl screens */}
                <div className="xl:col-span-1">
                  <TimerControlCard
                    remainingSeconds={sessionState?.timer?.remainingSeconds ?? 0}
                    totalTimeLimit={sessionState?.timer?.totalTimeLimit ?? sessionState?.currentQuestion?.timeLimit ?? 30}
                    timerState={(sessionState?.timer?.state as TimerState) ?? 'idle'}
                    isQuestionActive={sessionState?.state === 'ACTIVE_QUESTION' || sessionState?.state === 'REVEAL'}
                    onPauseTimer={handlePauseTimer}
                    onResumeTimer={handleResumeTimer}
                    onResetTimer={handleResetTimer}
                    isDisabled={connectionState !== 'connected'}
                  />
                </div>
              </div>

              {/* Additional panels grid */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Answer Count Card */}
                <AnswerCountCard
                  answerCount={sessionState?.answerCount || null}
                  isQuestionActive={sessionState?.state === 'ACTIVE_QUESTION'}
                  participantCount={sessionState?.participantCount || 0}
                />

                {/* System Metrics Card */}
                <SystemMetricsCard
                  systemMetrics={sessionState?.systemMetrics || null}
                  isConnected={connectionState === 'connected'}
                />

                {/* Focus Monitoring Card - Requirements: 9.4, 9.5 */}
                <FocusMonitoringCard
                  participants={sessionState?.participants?.map((p) => ({
                    participantId: p.participantId,
                    nickname: p.nickname,
                    focusData: p.focusData,
                  })) || []}
                  isEnabled={true}
                  isQuizActive={sessionState?.state === 'ACTIVE_QUESTION' || sessionState?.state === 'REVEAL'}
                />

                {/* Participants List */}
                <ParticipantListCard
                  participants={participantsForList}
                  participantCount={sessionState?.participantCount || 0}
                  onKickParticipant={handleKickParticipant}
                  onBanParticipant={handleBanParticipant}
                  isDisabled={connectionState !== 'connected'}
                  showScores={sessionState?.state === 'ACTIVE_QUESTION' || sessionState?.state === 'REVEAL' || sessionState?.state === 'ENDED'}
                  isEliminationMode={false} // Would be determined from quiz type
                />
              </div>

              {/* Leaderboard section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Leaderboard Card - Takes 2 columns */}
                <div className="lg:col-span-2">
                  <LeaderboardCard
                    leaderboard={sessionState?.leaderboard || []}
                    isUpdating={false}
                    participantCount={sessionState?.participantCount || 0}
                    sessionState={sessionState?.state || 'LOBBY'}
                    maxHeight={500}
                  />
                </div>

                {/* Big Screen Preview Card - Takes 1 column */}
                <div className="lg:col-span-1">
                  <BigScreenPreviewCard
                    sessionId={sessionId}
                    sessionState={sessionState?.state || 'LOBBY'}
                    joinCode={sessionState?.joinCode || '------'}
                    participantCount={sessionState?.participantCount || 0}
                    currentQuestion={sessionState?.currentQuestion || null}
                    currentQuestionIndex={sessionState?.currentQuestionIndex || 0}
                    totalQuestions={sessionState?.totalQuestions || 0}
                    remainingSeconds={sessionState?.timer?.remainingSeconds ?? 0}
                    leaderboard={sessionState?.leaderboard || []}
                    isSynced={connectionState === 'connected'}
                  />
                </div>
              </div>

              {/* Tournament Bracket - Only shown for tournament sessions */}
              {sessionState?.tournamentId && (
                <TournamentBracketCard
                  tournamentId={sessionState.tournamentId}
                  sessionId={sessionId}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between text-caption text-[var(--text-muted)]">
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
        </div>
      </footer>
    </div>
  );
}
