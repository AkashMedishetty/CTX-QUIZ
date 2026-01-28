/**
 * Big Screen Preview Card - Embedded preview of the Big Screen display
 * 
 * Shows a scaled-down preview of what the Big Screen shows:
 * - Lobby: Join code and QR code placeholder
 * - Question: Question text and timer
 * - Reveal: Correct answer highlight
 * - Leaderboard: Top 3 preview
 * 
 * Features:
 * - 16:9 aspect ratio display
 * - "TV screen" neumorphic effect
 * - Open Full Screen button
 * - Sync indicator
 * 
 * Requirements: 13.10
 */

'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SessionState, QuestionData, LeaderboardEntry } from '@/lib/socket-client';

/**
 * Big Screen Preview Card Props
 */
export interface BigScreenPreviewCardProps {
  /** Current session ID */
  sessionId: string;
  /** Current session state */
  sessionState: SessionState;
  /** Join code for lobby display */
  joinCode: string;
  /** Participant count */
  participantCount: number;
  /** Current question data */
  currentQuestion: QuestionData | null;
  /** Current question index (0-based) */
  currentQuestionIndex: number;
  /** Total number of questions */
  totalQuestions: number;
  /** Remaining seconds on timer */
  remainingSeconds: number;
  /** Leaderboard entries */
  leaderboard: LeaderboardEntry[];
  /** Correct options (shown during reveal) */
  correctOptions?: string[];
  /** Whether the preview is synced with the server */
  isSynced?: boolean;
}

/**
 * Mini Timer Display for preview
 */
function MiniTimer({ seconds, isExpired }: { seconds: number; isExpired: boolean }) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const isLow = seconds <= 10 && seconds > 0;
  const isCritical = seconds <= 5 && seconds > 0;

  return (
    <div
      className={`
        font-display text-lg font-bold tabular-nums
        ${isExpired ? 'text-[var(--text-muted)]' : ''}
        ${isCritical ? 'text-error animate-pulse' : ''}
        ${isLow && !isCritical ? 'text-warning' : ''}
        ${!isLow && !isCritical && !isExpired ? 'text-primary' : ''}
      `}
    >
      {minutes > 0 ? `${minutes}:${secs.toString().padStart(2, '0')}` : secs}
    </div>
  );
}

/**
 * Lobby Preview Content
 */
function LobbyPreview({
  joinCode,
  participantCount,
}: {
  joinCode: string;
  participantCount: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
      {/* Join Code */}
      <div className="text-center mb-3">
        <p className="text-[8px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
          Join Code
        </p>
        <p className="font-mono text-xl font-bold text-primary tracking-widest">
          {joinCode}
        </p>
      </div>

      {/* QR Code Placeholder */}
      <div className="w-16 h-16 rounded-lg bg-white flex items-center justify-center mb-3">
        <div className="w-12 h-12 grid grid-cols-3 gap-0.5">
          {[...Array(9)].map((_, i) => (
            <div
              key={i}
              className={`rounded-sm ${
                [0, 2, 6, 8, 4].includes(i) ? 'bg-gray-800' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Participant Count */}
      <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span className="text-xs font-medium">{participantCount}</span>
      </div>
    </div>
  );
}

/**
 * Question Preview Content
 */
function QuestionPreview({
  question,
  questionIndex,
  totalQuestions,
  remainingSeconds,
  isReveal,
  correctOptions,
}: {
  question: QuestionData;
  questionIndex: number;
  totalQuestions: number;
  remainingSeconds: number;
  isReveal: boolean;
  correctOptions?: string[];
}) {
  // Limit options shown in preview
  const displayOptions = question.options.slice(0, 4);

  return (
    <div className="flex flex-col h-full p-3">
      {/* Header with question number and timer */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[8px] text-[var(--text-muted)] font-medium">
          Q{questionIndex + 1}/{totalQuestions}
        </span>
        <MiniTimer seconds={remainingSeconds} isExpired={isReveal} />
      </div>

      {/* Question Text */}
      <div className="flex-1 flex items-center justify-center mb-2">
        <p className="text-[10px] text-[var(--text-primary)] text-center font-medium line-clamp-2 px-1">
          {question.questionText}
        </p>
      </div>

      {/* Options Grid */}
      <div className="grid grid-cols-2 gap-1">
        {displayOptions.map((option, index) => {
          const isCorrect = correctOptions?.includes(option.optionId);
          const optionLabels = ['A', 'B', 'C', 'D'];

          return (
            <div
              key={option.optionId}
              className={`
                flex items-center gap-1 px-1.5 py-1 rounded text-[8px]
                ${isReveal && isCorrect
                  ? 'bg-success/20 border border-success/50'
                  : 'bg-[var(--neu-surface)]'
                }
              `}
            >
              <span
                className={`
                  w-3 h-3 rounded-sm flex items-center justify-center text-[6px] font-bold
                  ${isReveal && isCorrect
                    ? 'bg-success text-white'
                    : 'bg-primary/20 text-primary'
                  }
                `}
              >
                {optionLabels[index]}
              </span>
              <span className="truncate text-[var(--text-secondary)]">
                {option.optionText}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Leaderboard Preview Content
 */
function LeaderboardPreview({
  leaderboard,
}: {
  leaderboard: LeaderboardEntry[];
}) {
  // Show top 3 only
  const top3 = leaderboard.slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="flex flex-col h-full p-3">
      {/* Header */}
      <div className="text-center mb-2">
        <p className="text-[10px] font-semibold text-[var(--text-primary)]">
          Leaderboard
        </p>
      </div>

      {/* Top 3 */}
      <div className="flex-1 flex flex-col justify-center gap-1.5">
        {top3.length > 0 ? (
          top3.map((entry, index) => (
            <motion.div
              key={entry.participantId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`
                flex items-center gap-2 px-2 py-1 rounded
                ${index === 0 ? 'bg-yellow-500/10' : ''}
                ${index === 1 ? 'bg-gray-400/10' : ''}
                ${index === 2 ? 'bg-amber-600/10' : ''}
              `}
            >
              <span className="text-sm">{medals[index]}</span>
              <span className="flex-1 text-[9px] font-medium text-[var(--text-primary)] truncate">
                {entry.nickname}
              </span>
              <span className="text-[9px] font-bold text-primary">
                {entry.totalScore.toLocaleString()}
              </span>
            </motion.div>
          ))
        ) : (
          <div className="text-center text-[8px] text-[var(--text-muted)]">
            No scores yet
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Ended Preview Content
 */
function EndedPreview({
  leaderboard,
}: {
  leaderboard: LeaderboardEntry[];
}) {
  const winner = leaderboard[0];

  return (
    <div className="flex flex-col items-center justify-center h-full p-3">
      <div className="text-2xl mb-2">🏆</div>
      <p className="text-[10px] font-semibold text-[var(--text-primary)] mb-1">
        Quiz Complete!
      </p>
      {winner && (
        <div className="text-center">
          <p className="text-[8px] text-[var(--text-muted)]">Winner</p>
          <p className="text-xs font-bold text-primary">{winner.nickname}</p>
          <p className="text-[8px] text-[var(--text-secondary)]">
            {winner.totalScore.toLocaleString()} pts
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Big Screen Preview Card Component
 */
export function BigScreenPreviewCard({
  sessionId,
  sessionState,
  joinCode,
  participantCount,
  currentQuestion,
  currentQuestionIndex,
  totalQuestions,
  remainingSeconds,
  leaderboard,
  correctOptions,
  isSynced = true,
}: BigScreenPreviewCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Determine what content to show
  const previewContent = useMemo(() => {
    switch (sessionState) {
      case 'LOBBY':
        return (
          <LobbyPreview
            joinCode={joinCode}
            participantCount={participantCount}
          />
        );
      case 'ACTIVE_QUESTION':
        if (currentQuestion) {
          return (
            <QuestionPreview
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
              remainingSeconds={remainingSeconds}
              isReveal={false}
            />
          );
        }
        return <LobbyPreview joinCode={joinCode} participantCount={participantCount} />;
      case 'REVEAL':
        if (currentQuestion) {
          return (
            <QuestionPreview
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={totalQuestions}
              remainingSeconds={0}
              isReveal={true}
              correctOptions={correctOptions}
            />
          );
        }
        return <LeaderboardPreview leaderboard={leaderboard} />;
      case 'ENDED':
        return <EndedPreview leaderboard={leaderboard} />;
      default:
        return <LobbyPreview joinCode={joinCode} participantCount={participantCount} />;
    }
  }, [
    sessionState,
    joinCode,
    participantCount,
    currentQuestion,
    currentQuestionIndex,
    totalQuestions,
    remainingSeconds,
    leaderboard,
    correctOptions,
  ]);

  // Get state label
  const stateLabel = useMemo(() => {
    switch (sessionState) {
      case 'LOBBY':
        return 'Lobby';
      case 'ACTIVE_QUESTION':
        return 'Question';
      case 'REVEAL':
        return 'Reveal';
      case 'ENDED':
        return 'Ended';
      default:
        return 'Unknown';
    }
  }, [sessionState]);

  // Open Big Screen in new tab
  const handleOpenFullScreen = () => {
    const bigScreenUrl = `/bigscreen/${sessionId}`;
    window.open(bigScreenUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-xl overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-h3 font-semibold text-[var(--text-primary)]">
                Big Screen Preview
              </h3>
              <p className="text-caption text-[var(--text-muted)]">
                Projector display
              </p>
            </div>
          </div>

          {/* Sync Indicator */}
          <div className="flex items-center gap-2">
            <div
              className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption font-medium
                ${isSynced
                  ? 'bg-success/10 text-success'
                  : 'bg-warning/10 text-warning'
                }
              `}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  isSynced ? 'bg-success' : 'bg-warning animate-pulse'
                }`}
              />
              {isSynced ? 'Synced' : 'Syncing...'}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Container */}
      <div className="p-4">
        {/* TV Screen Frame */}
        <div className="relative">
          {/* Outer bezel - neumorphic TV effect */}
          <div className="rounded-xl bg-gradient-to-b from-gray-700 to-gray-900 p-2 shadow-lg">
            {/* Inner bezel */}
            <div className="rounded-lg bg-gradient-to-b from-gray-800 to-gray-950 p-1">
              {/* Screen with 16:9 aspect ratio */}
              <div
                className="relative rounded-md overflow-hidden bg-[var(--neu-bg)]"
                style={{ aspectRatio: '16 / 9' }}
              >
                {/* Screen content */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={sessionState}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0"
                  >
                    {previewContent}
                  </motion.div>
                </AnimatePresence>

                {/* State badge overlay */}
                <div className="absolute top-2 left-2">
                  <span
                    className={`
                      px-2 py-0.5 rounded text-[8px] font-medium
                      ${sessionState === 'LOBBY' ? 'bg-info/80 text-white' : ''}
                      ${sessionState === 'ACTIVE_QUESTION' ? 'bg-success/80 text-white' : ''}
                      ${sessionState === 'REVEAL' ? 'bg-warning/80 text-white' : ''}
                      ${sessionState === 'ENDED' ? 'bg-primary/80 text-white' : ''}
                    `}
                  >
                    {stateLabel}
                  </span>
                </div>

                {/* Hover overlay with Open button */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/40 flex items-center justify-center"
                    >
                      <motion.button
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        onClick={handleOpenFullScreen}
                        className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-gray-900 font-medium text-sm shadow-lg hover:bg-gray-100 transition-colors"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                        Open Full Screen
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Screen glare effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
              </div>
            </div>
          </div>

          {/* TV Stand */}
          <div className="flex justify-center mt-1">
            <div className="w-12 h-2 bg-gradient-to-b from-gray-700 to-gray-800 rounded-b-lg" />
          </div>
        </div>
      </div>

      {/* Footer with Open Full Screen button */}
      <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--neu-surface)]">
        <button
          onClick={handleOpenFullScreen}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg neu-raised-sm hover:shadow-neu-flat transition-shadow text-body-sm font-medium text-[var(--text-primary)]"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          Open Big Screen in New Tab
        </button>
      </div>
    </motion.div>
  );
}

export default BigScreenPreviewCard;
