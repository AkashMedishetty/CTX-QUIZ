/**
 * Quiz Control Card - Main quiz control interface for the controller
 * 
 * Displays:
 * - Current question with speaker notes
 * - Question number and total questions
 * - Question type and time limit
 * - Current session state
 * - Control buttons (Start Quiz, Next Question, Void Question, End Quiz)
 * 
 * Requirements: 2.8, 13.2, 13.3
 */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SessionState, QuestionData } from '@/lib/socket-client';
import { Button } from '@/components/ui/button';
import { VoidQuestionModal } from './void-question-modal';
import { NextQuestionPreview } from './next-question-preview';

/**
 * Extended question data with speaker notes
 */
export interface QuestionWithNotes extends QuestionData {
  speakerNotes?: string;
  explanationText?: string;
}

/**
 * Quiz control card props
 */
interface QuizControlCardProps {
  /** Current session state */
  sessionState: SessionState;
  /** Current question data */
  currentQuestion: QuestionWithNotes | null;
  /** Current question index (0-based) */
  currentQuestionIndex: number;
  /** Total number of questions */
  totalQuestions: number;
  /** All questions for preview */
  questions?: QuestionWithNotes[];
  /** Callback to start the quiz */
  onStartQuiz: () => void;
  /** Callback to advance to next question */
  onNextQuestion: () => void;
  /** Callback to void current question */
  onVoidQuestion: (questionId: string, reason: string) => void;
  /** Callback to end the quiz */
  onEndQuiz: () => void;
  /** Whether actions are disabled (e.g., during loading) */
  isDisabled?: boolean;
}

/**
 * Get question type display name
 */
function getQuestionTypeLabel(type: string): string {
  const typeLabels: Record<string, string> = {
    MULTIPLE_CHOICE: 'Multiple Choice',
    TRUE_FALSE: 'True/False',
    SCALE_1_10: 'Scale (1-10)',
    NUMBER_INPUT: 'Number Input',
    OPEN_ENDED: 'Open Ended',
  };
  return typeLabels[type] || type;
}

/**
 * Quiz Control Card Component
 */
export function QuizControlCard({
  sessionState,
  currentQuestion,
  currentQuestionIndex,
  totalQuestions,
  questions = [],
  onStartQuiz,
  onNextQuestion,
  onVoidQuestion,
  onEndQuiz,
  isDisabled = false,
}: QuizControlCardProps) {
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [isEndQuizConfirmOpen, setIsEndQuizConfirmOpen] = useState(false);

  // Get next question for preview
  const nextQuestion = questions[currentQuestionIndex + 1] || null;
  const hasMoreQuestions = currentQuestionIndex < totalQuestions - 1;

  // Handle void question submission
  const handleVoidQuestion = (reason: string) => {
    if (currentQuestion) {
      onVoidQuestion(currentQuestion.questionId, reason);
      setIsVoidModalOpen(false);
    }
  };

  // Handle end quiz confirmation
  const handleEndQuiz = () => {
    onEndQuiz();
    setIsEndQuizConfirmOpen(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="bg-primary/5 border-b border-[var(--border)] px-6 py-4">
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
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
                Quiz Controls
              </h2>
              <p className="text-caption text-[var(--text-muted)]">
                Manage quiz flow and questions
              </p>
            </div>
          </div>

          {/* Question Counter */}
          {sessionState !== 'LOBBY' && sessionState !== 'ENDED' && (
            <div className="neu-pressed rounded-lg px-4 py-2">
              <p className="text-caption text-[var(--text-muted)]">Question</p>
              <p className="text-h3 font-bold text-primary">
                {currentQuestionIndex + 1}
                <span className="text-body text-[var(--text-muted)]"> / {totalQuestions}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          {/* LOBBY State - Show Start Quiz */}
          {sessionState === 'LOBBY' && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-8"
            >
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-h2 font-semibold text-[var(--text-primary)] mb-2">
                Ready to Start
              </h3>
              <p className="text-body text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
                Participants are waiting in the lobby. Start the quiz when everyone has joined.
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={onStartQuiz}
                disabled={isDisabled}
                leftIcon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                  </svg>
                }
              >
                Start Quiz
              </Button>
              {totalQuestions > 0 && (
                <p className="text-caption text-[var(--text-muted)] mt-4">
                  {totalQuestions} question{totalQuestions !== 1 ? 's' : ''} ready
                </p>
              )}
            </motion.div>
          )}

          {/* ACTIVE_QUESTION or REVEAL State - Show Current Question */}
          {(sessionState === 'ACTIVE_QUESTION' || sessionState === 'REVEAL') && currentQuestion && (
            <motion.div
              key="question"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Question Info */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-info/10 text-info text-body-sm font-medium">
                  {getQuestionTypeLabel(currentQuestion.questionType)}
                </span>
                <span className="px-3 py-1 rounded-full bg-warning/10 text-warning text-body-sm font-medium">
                  {currentQuestion.timeLimit}s time limit
                </span>
                {sessionState === 'REVEAL' && (
                  <span className="px-3 py-1 rounded-full bg-success/10 text-success text-body-sm font-medium">
                    Revealing Answers
                  </span>
                )}
              </div>

              {/* Question Text */}
              <div className="neu-pressed rounded-lg p-5">
                <p className="text-caption text-[var(--text-muted)] mb-2">Current Question</p>
                <p className="text-body-lg font-medium text-[var(--text-primary)]">
                  {currentQuestion.questionText}
                </p>
                
                {/* Question Image */}
                {currentQuestion.questionImageUrl && (
                  <div className="mt-4">
                    <img
                      src={currentQuestion.questionImageUrl}
                      alt="Question"
                      className="max-w-full h-auto rounded-lg"
                    />
                  </div>
                )}
              </div>

              {/* Answer Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentQuestion.options.map((option, index) => (
                  <div
                    key={option.optionId}
                    className="neu-pressed-sm rounded-lg p-4 flex items-start gap-3"
                  >
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-body-sm">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-body text-[var(--text-primary)]">
                        {option.optionText}
                      </p>
                      {option.optionImageUrl && (
                        <img
                          src={option.optionImageUrl}
                          alt={`Option ${String.fromCharCode(65 + index)}`}
                          className="mt-2 max-w-full h-auto rounded"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Speaker Notes */}
              {currentQuestion.speakerNotes && (
                <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg
                      className="w-4 h-4 text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
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
                    </svg>
                    <p className="text-caption font-medium text-accent">Speaker Notes (Private)</p>
                  </div>
                  <p className="text-body-sm text-[var(--text-secondary)]">
                    {currentQuestion.speakerNotes}
                  </p>
                </div>
              )}

              {/* Explanation Text (shown during reveal) */}
              {sessionState === 'REVEAL' && currentQuestion.explanationText && (
                <div className="bg-success/5 border border-success/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg
                      className="w-4 h-4 text-success"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-caption font-medium text-success">Explanation</p>
                  </div>
                  <p className="text-body-sm text-[var(--text-secondary)]">
                    {currentQuestion.explanationText}
                  </p>
                </div>
              )}

              {/* Control Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[var(--border)]">
                {/* Next Question Button - Only in REVEAL state */}
                {sessionState === 'REVEAL' && hasMoreQuestions && (
                  <Button
                    variant="primary"
                    onClick={onNextQuestion}
                    disabled={isDisabled}
                    leftIcon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 5l7 7-7 7M5 5l7 7-7 7"
                        />
                      </svg>
                    }
                  >
                    Next Question
                  </Button>
                )}

                {/* End Quiz Button - In REVEAL state when no more questions */}
                {sessionState === 'REVEAL' && !hasMoreQuestions && (
                  <Button
                    variant="success"
                    onClick={() => setIsEndQuizConfirmOpen(true)}
                    disabled={isDisabled}
                    leftIcon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    }
                  >
                    Finish Quiz
                  </Button>
                )}

                {/* Void Question Button */}
                <Button
                  variant="outline"
                  onClick={() => setIsVoidModalOpen(true)}
                  disabled={isDisabled}
                  leftIcon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                      />
                    </svg>
                  }
                >
                  Void Question
                </Button>

                {/* End Quiz Button - Always available during active quiz */}
                <Button
                  variant="danger"
                  onClick={() => setIsEndQuizConfirmOpen(true)}
                  disabled={isDisabled}
                  leftIcon={
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                      />
                    </svg>
                  }
                >
                  End Quiz
                </Button>
              </div>
            </motion.div>
          )}

          {/* ENDED State */}
          {sessionState === 'ENDED' && (
            <motion.div
              key="ended"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-8"
            >
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-success/10 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-success"
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
                </svg>
              </div>
              <h3 className="text-h2 font-semibold text-[var(--text-primary)] mb-2">
                Quiz Completed
              </h3>
              <p className="text-body text-[var(--text-secondary)] max-w-md mx-auto">
                The quiz has ended. View the final leaderboard to see the results.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Next Question Preview - Only show in REVEAL state when there are more questions */}
      {sessionState === 'REVEAL' && nextQuestion && (
        <div className="border-t border-[var(--border)]">
          <NextQuestionPreview
            question={nextQuestion}
            questionNumber={currentQuestionIndex + 2}
          />
        </div>
      )}

      {/* Void Question Modal */}
      <VoidQuestionModal
        isOpen={isVoidModalOpen}
        onClose={() => setIsVoidModalOpen(false)}
        onConfirm={handleVoidQuestion}
        questionText={currentQuestion?.questionText || ''}
      />

      {/* End Quiz Confirmation Modal */}
      <EndQuizConfirmModal
        isOpen={isEndQuizConfirmOpen}
        onClose={() => setIsEndQuizConfirmOpen(false)}
        onConfirm={handleEndQuiz}
        isLastQuestion={!hasMoreQuestions}
      />
    </motion.div>
  );
}

/**
 * End Quiz Confirmation Modal
 */
interface EndQuizConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLastQuestion: boolean;
}

function EndQuizConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isLastQuestion,
}: EndQuizConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-10 w-full max-w-md mx-4 neu-raised-lg rounded-xl p-6 bg-[var(--neu-bg)]"
      >
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-warning/10 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-warning"
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
          <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-2">
            {isLastQuestion ? 'Finish Quiz?' : 'End Quiz Early?'}
          </h3>
          <p className="text-body text-[var(--text-secondary)] mb-6">
            {isLastQuestion
              ? 'This will end the quiz and show the final results to all participants.'
              : 'Are you sure you want to end the quiz? There are still questions remaining.'}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant={isLastQuestion ? 'success' : 'danger'}
              onClick={onConfirm}
            >
              {isLastQuestion ? 'Finish Quiz' : 'End Quiz'}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default QuizControlCard;
