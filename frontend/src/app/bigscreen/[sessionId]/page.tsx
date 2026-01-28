/**
 * Big Screen Page - Projector/TV display for quiz sessions
 * 
 * Displays the Big Screen interface optimized for projector display with:
 * - Lobby screen with join code, QR code, and participant list
 * - Question display (future implementation)
 * - Timer display (future implementation)
 * - Leaderboard display (future implementation)
 * - Final results (future implementation)
 * 
 * Requirements: 12.1, 12.8
 */

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useBigScreenSocket } from '@/hooks/useBigScreenSocket';
import { LobbyScreen, QuestionScreen, RevealScreen, FinalResultsScreen, LeaderboardScreen } from './components';
import type { LobbyParticipant } from './components';

/**
 * Screen transition variants for smooth animations between states
 * Uses spring physics for natural feel without causing motion sickness
 */
const screenTransitionVariants = {
  initial: { 
    opacity: 0, 
    scale: 0.98,
    filter: 'blur(4px)',
  },
  animate: { 
    opacity: 1, 
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.5,
      ease: [0.0, 0.0, 0.2, 1], // ease-out
    },
  },
  exit: { 
    opacity: 0, 
    scale: 1.02,
    filter: 'blur(4px)',
    transition: {
      duration: 0.3,
      ease: [0.4, 0.0, 1, 1], // ease-in
    },
  },
};

/**
 * Ambient floating particles for subtle background animation
 * Respects prefers-reduced-motion
 */
function AmbientParticles() {
  const particles = useMemo(() => 
    Array.from({ length: 6 }, (_, i) => ({
      id: i,
      size: 100 + Math.random() * 200,
      x: Math.random() * 100,
      y: Math.random() * 100,
      duration: 20 + Math.random() * 15,
      delay: Math.random() * 5,
    })), 
  []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-primary/5"
          style={{
            width: particle.size,
            height: particle.size,
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            filter: 'blur(40px)',
          }}
          animate={{
            x: [0, 30, -20, 0],
            y: [0, -20, 30, 0],
            scale: [1, 1.1, 0.9, 1],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Big Screen Page Component
 */
export default function BigScreenPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  
  const [isInitialized, setIsInitialized] = useState(false);
  const [recentParticipants, setRecentParticipants] = useState<LobbyParticipant[]>([]);
  const [showGetReady, setShowGetReady] = useState(false);
  const [getReadyCount, setGetReadyCount] = useState(3);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check for reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const {
    connectionState,
    isConnected,
    error,
    sessionState,
    connect,
  } = useBigScreenSocket({
    sessionId,
    autoConnect: true,
    onConnect: () => {
      console.info('[BigScreen] Connected to session:', sessionId);
    },
    onDisconnect: (reason) => {
      console.warn('[BigScreen] Disconnected:', reason);
    },
    onError: (err) => {
      console.error('[BigScreen] Error:', err);
    },
    onQuizStarted: (totalQuestions) => {
      console.info('[BigScreen] Quiz started with', totalQuestions, 'questions');
    },
    onQuestionStarted: (question, index) => {
      console.info('[BigScreen] Question', index + 1, 'started:', question.questionText);
      // Show "Get Ready" countdown before question
      setShowGetReady(true);
      setGetReadyCount(3);
      
      // Countdown animation
      const countdownInterval = setInterval(() => {
        setGetReadyCount((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            setShowGetReady(false);
            return 0;
          }
          return prev - 1;
        });
      }, 800);
    },
    onRevealAnswers: (correctOptions, stats) => {
      console.info('[BigScreen] Answers revealed:', correctOptions, stats);
      // Show leaderboard briefly after reveal
      setShowLeaderboard(true);
      setTimeout(() => setShowLeaderboard(false), 8000);
    },
    onQuizEnded: (leaderboard) => {
      console.info('[BigScreen] Quiz ended, final leaderboard:', leaderboard.length, 'entries');
    },
    onParticipantJoined: (participant, count) => {
      console.info('[BigScreen] Participant joined:', participant.nickname, '- Total:', count);
      // Add to recent participants for animation
      setRecentParticipants((prev) => {
        const exists = prev.some((p) => p.participantId === participant.participantId);
        if (exists) return prev;
        return [...prev, participant];
      });
    },
    onParticipantLeft: (participantId, count) => {
      console.info('[BigScreen] Participant left:', participantId, '- Total:', count);
      setRecentParticipants((prev) => 
        prev.filter((p) => p.participantId !== participantId)
      );
    },
  });

  // Mark as initialized after first render
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Sync participants from session state
  useEffect(() => {
    if (sessionState?.participants) {
      setRecentParticipants(
        sessionState.participants.map((p) => ({
          participantId: p.participantId,
          nickname: p.nickname,
        }))
      );
    }
  }, [sessionState?.participants]);

  // Handle manual reconnection
  const handleReconnect = useCallback(() => {
    if (connectionState === 'disconnected' || connectionState === 'error') {
      connect();
    }
  }, [connectionState, connect]);

  // Render based on session state
  const renderContent = () => {
    // Loading state
    if (!isInitialized) {
      return (
        <motion.div
          key="loading"
          variants={screenTransitionVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="min-h-screen bg-[var(--neu-bg)] flex items-center justify-center"
        >
          <div className="text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="w-24 h-24 mx-auto mb-8 rounded-full neu-raised flex items-center justify-center"
            >
              <div className="w-20 h-20 rounded-full border-4 border-primary border-t-transparent" />
            </motion.div>
            <p className="text-h2 text-[var(--text-secondary)]">
              Initializing Big Screen...
            </p>
          </div>
        </motion.div>
      );
    }

    // Error state
    if (connectionState === 'error') {
      return (
        <motion.div
          key="error"
          variants={screenTransitionVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="min-h-screen bg-[var(--neu-bg)] flex items-center justify-center"
        >
          <div className="text-center max-w-lg">
            <motion.div 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-24 h-24 mx-auto mb-8 rounded-full bg-error/10 flex items-center justify-center"
            >
              <svg
                className="w-12 h-12 text-error"
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
            </motion.div>
            <h2 className="text-display font-bold text-[var(--text-primary)] mb-4">
              Connection Error
            </h2>
            <p className="text-h3 text-[var(--text-secondary)] mb-8">
              {error || 'Unable to connect to the quiz session.'}
            </p>
            <motion.button
              onClick={handleReconnect}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-lg font-semibold text-h3 neu-raised-sm hover:bg-primary-light transition-colors"
            >
              <svg
                className="w-6 h-6"
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
            </motion.button>
          </div>
        </motion.div>
      );
    }

    // Connecting state
    if (connectionState === 'connecting' || connectionState === 'authenticating') {
      return (
        <motion.div
          key="connecting"
          variants={screenTransitionVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="min-h-screen bg-[var(--neu-bg)] flex items-center justify-center"
        >
          <div className="text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="w-24 h-24 mx-auto mb-8 rounded-full neu-raised flex items-center justify-center"
            >
              <div className="w-20 h-20 rounded-full border-4 border-primary border-t-transparent" />
            </motion.div>
            <p className="text-h2 text-[var(--text-secondary)]">
              {connectionState === 'authenticating'
                ? 'Authenticating...'
                : 'Connecting to session...'}
            </p>
          </div>
        </motion.div>
      );
    }

    // Connected - render based on session state
    if (isConnected && sessionState) {
      switch (sessionState.state) {
        case 'LOBBY':
          return (
            <motion.div
              key="lobby"
              variants={screenTransitionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <LobbyScreen
                joinCode={sessionState.joinCode}
                participantCount={sessionState.participantCount}
                participants={recentParticipants}
                isConnected={isConnected}
              />
            </motion.div>
          );

        case 'ACTIVE_QUESTION':
          // Question display screen (Task 40.3)
          if (sessionState.currentQuestion) {
            return (
              <motion.div
                key="question"
                variants={screenTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <QuestionScreen
                  question={sessionState.currentQuestion}
                  questionIndex={sessionState.currentQuestionIndex}
                  totalQuestions={sessionState.totalQuestions}
                  remainingSeconds={sessionState.remainingSeconds}
                  isConnected={isConnected}
                  joinCode={sessionState.joinCode}
                  allowLateJoiners={sessionState.allowLateJoiners}
                />
              </motion.div>
            );
          }
          // Fallback if no question data yet
          return (
            <motion.div
              key="question-loading"
              variants={screenTransitionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="min-h-screen bg-[var(--neu-bg)] flex items-center justify-center"
            >
              <div className="text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-24 h-24 mx-auto mb-8 rounded-full neu-raised flex items-center justify-center"
                >
                  <div className="w-20 h-20 rounded-full border-4 border-primary border-t-transparent" />
                </motion.div>
                <p className="text-h2 text-[var(--text-secondary)]">
                  Loading question...
                </p>
              </div>
            </motion.div>
          );

        case 'REVEAL':
          // Show leaderboard overlay if enabled, otherwise show reveal screen
          if (showLeaderboard && sessionState.leaderboard && sessionState.leaderboard.length > 0) {
            return (
              <motion.div
                key="leaderboard-overlay"
                variants={screenTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <LeaderboardScreen
                  leaderboard={sessionState.leaderboard}
                  isConnected={isConnected}
                  showRankChange={true}
                  showLastScore={true}
                />
              </motion.div>
            );
          }
          // Answer reveal screen (Task 40.5)
          if (sessionState.currentQuestion && sessionState.correctOptions) {
            return (
              <motion.div
                key="reveal"
                variants={screenTransitionVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <RevealScreen
                  question={sessionState.currentQuestion}
                  questionIndex={sessionState.currentQuestionIndex}
                  totalQuestions={sessionState.totalQuestions}
                  correctOptions={sessionState.correctOptions}
                  answerStats={sessionState.answerStats}
                  explanationText={sessionState.explanationText}
                  isConnected={isConnected}
                />
              </motion.div>
            );
          }
          // Fallback if no question data yet
          return (
            <motion.div
              key="reveal-loading"
              variants={screenTransitionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="min-h-screen bg-[var(--neu-bg)] flex items-center justify-center"
            >
              <div className="text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-24 h-24 mx-auto mb-8 rounded-full neu-raised flex items-center justify-center"
                >
                  <div className="w-20 h-20 rounded-full border-4 border-success border-t-transparent" />
                </motion.div>
                <p className="text-h2 text-[var(--text-secondary)]">
                  Revealing answers...
                </p>
              </div>
            </motion.div>
          );

        case 'ENDED':
          // Final results screen (Task 40.7)
          return (
            <motion.div
              key="ended"
              variants={screenTransitionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <FinalResultsScreen
                leaderboard={sessionState.leaderboard}
                isConnected={isConnected}
              />
            </motion.div>
          );

        default:
          return null;
      }
    }

    // Fallback - disconnected state
    return (
      <motion.div
        key="disconnected"
        variants={screenTransitionVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="min-h-screen bg-[var(--neu-bg)] flex items-center justify-center"
      >
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-8 rounded-full neu-raised flex items-center justify-center">
            <svg
              className="w-12 h-12 text-[var(--text-muted)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
              />
            </svg>
          </div>
          <h2 className="text-display font-bold text-[var(--text-primary)] mb-4">
            Disconnected
          </h2>
          <p className="text-h3 text-[var(--text-secondary)] mb-8">
            Connection to the quiz session was lost.
          </p>
          <motion.button
            onClick={handleReconnect}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-lg font-semibold text-h3 neu-raised-sm hover:bg-primary-light transition-colors"
          >
            <svg
              className="w-6 h-6"
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
            Reconnect
          </motion.button>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="relative">
      {/* Ambient background particles (respects reduced motion) */}
      {!prefersReducedMotion && <AmbientParticles />}
      
      {/* "Get Ready" countdown overlay */}
      <AnimatePresence>
        {showGetReady && (
          <motion.div
            key="get-ready-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 bg-[var(--neu-bg)]/95 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="mb-8"
              >
                <span className="text-h2 md:text-display font-semibold text-[var(--text-secondary)]">
                  Get Ready!
                </span>
              </motion.div>
              
              <motion.div
                key={getReadyCount}
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ 
                  type: 'spring', 
                  stiffness: 400, 
                  damping: 25,
                }}
                className="relative"
              >
                {/* Pulsing ring behind number */}
                <motion.div
                  animate={{ 
                    scale: [1, 1.3, 1],
                    opacity: [0.5, 0, 0.5],
                  }}
                  transition={{ 
                    duration: 0.8, 
                    repeat: Infinity,
                    ease: 'easeOut',
                  }}
                  className="absolute inset-0 w-40 h-40 md:w-56 md:h-56 mx-auto rounded-full bg-primary/20"
                  style={{ transform: 'translate(-50%, -50%)', left: '50%', top: '50%' }}
                />
                
                {/* Countdown number */}
                <div className="w-40 h-40 md:w-56 md:h-56 rounded-full neu-raised-lg flex items-center justify-center mx-auto">
                  <span className="text-display-xl md:text-[120px] font-bold text-primary font-display">
                    {getReadyCount}
                  </span>
                </div>
              </motion.div>
              
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-8 text-h3 md:text-h2 text-[var(--text-muted)]"
              >
                Question {(sessionState?.currentQuestionIndex ?? 0) + 1} coming up...
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Main content with screen transitions */}
      <AnimatePresence mode="wait">
        {renderContent()}
      </AnimatePresence>
    </div>
  );
}
