/**
 * QuizCard Component
 * 
 * Displays a quiz item in a neumorphic card with:
 * - Quiz title and description
 * - Quiz type badge
 * - Question count
 * - Created date
 * - Action buttons (edit, delete, start session)
 * 
 * Requirements: 1.1, 2.1
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button, Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription } from '@/components/ui';
import { post } from '@/lib/api-client';

/**
 * Quiz type definitions
 */
export type QuizType = 'REGULAR' | 'ELIMINATION' | 'FFI';

/**
 * Quiz data interface
 */
export interface Quiz {
  _id: string;
  title: string;
  description?: string;
  quizType: QuizType;
  questions: { questionId: string }[];
  createdAt: string;
  updatedAt: string;
  examSettings?: {
    negativeMarkingEnabled: boolean;
    negativeMarkingPercentage: number;
    focusMonitoringEnabled: boolean;
  };
}

/**
 * QuizCard props
 */
export interface QuizCardProps {
  quiz: Quiz;
  onDelete?: (quizId: string) => void;
  isDeleting?: boolean;
}

/**
 * Session creation response
 */
interface CreateSessionResponse {
  success: boolean;
  session: {
    sessionId: string;
    joinCode: string;
    state: string;
  };
}

/**
 * Quiz type badge colors
 */
const quizTypeBadgeStyles: Record<QuizType, string> = {
  REGULAR: 'bg-primary/10 text-primary border-primary/20',
  ELIMINATION: 'bg-error/10 text-error border-error/20',
  FFI: 'bg-warning/10 text-warning-dark border-warning/20',
};

/**
 * Quiz type labels
 */
const quizTypeLabels: Record<QuizType, string> = {
  REGULAR: 'Regular',
  ELIMINATION: 'Elimination',
  FFI: 'Fastest Finger',
};

/**
 * Format date to readable string
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Edit icon component
 */
function EditIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

/**
 * Trash icon component
 */
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

/**
 * Questions icon component
 */
function QuestionsIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/**
 * Calendar icon component
 */
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

/**
 * Play icon component for starting session
 */
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

/**
 * QuizCard component
 */
export const QuizCard = React.forwardRef<HTMLDivElement, QuizCardProps>(
  function QuizCard({ quiz, onDelete, isDeleting = false }, ref) {
    const router = useRouter();
    const questionCount = quiz.questions?.length || 0;
    const [isStarting, setIsStarting] = React.useState(false);
    const [showStartModal, setShowStartModal] = React.useState(false);
    const [sessionData, setSessionData] = React.useState<{ sessionId: string; joinCode: string } | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    const handleStartSession = async () => {
      if (questionCount === 0) {
        setError('Cannot start a session with no questions. Please add at least one question first.');
        return;
      }

      setIsStarting(true);
      setError(null);

      try {
        const response = await post<CreateSessionResponse>('/sessions', { quizId: quiz._id });
        if (response.success && response.session) {
          setSessionData({
            sessionId: response.session.sessionId,
            joinCode: response.session.joinCode,
          });
        }
      } catch (err: any) {
        setError(err.message || 'Failed to create session. Please try again.');
      } finally {
        setIsStarting(false);
      }
    };

    const handleGoToController = () => {
      if (sessionData) {
        router.push(`/controller/${sessionData.sessionId}`);
      }
    };

    const handleOpenBigScreen = () => {
      if (sessionData) {
        window.open(`/bigscreen/${sessionData.sessionId}`, '_blank');
      }
    };

    const closeModal = () => {
      setShowStartModal(false);
      setSessionData(null);
      setError(null);
    };

    return (
      <>
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          whileHover={{ y: -4 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="group"
        >
          <div
            className={cn(
              'neu-raised rounded-lg p-6',
              'transition-all duration-fast',
              'hover:shadow-[10px_10px_20px_var(--shadow-dark),-10px_-10px_20px_var(--shadow-light)]'
            )}
          >
            {/* Header with title and type badge */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <h3 className="text-h3 font-semibold text-[var(--text-primary)] line-clamp-2">
                {quiz.title}
              </h3>
              <span
                className={cn(
                  'flex-shrink-0 px-3 py-1 rounded-full text-caption font-medium border',
                  quizTypeBadgeStyles[quiz.quizType]
                )}
              >
                {quizTypeLabels[quiz.quizType]}
              </span>
            </div>

            {/* Description */}
            {quiz.description && (
              <p className="text-body-sm text-[var(--text-secondary)] line-clamp-2 mb-4">
                {quiz.description}
              </p>
            )}

            {/* Meta info */}
            <div className="flex items-center gap-4 text-body-sm text-[var(--text-muted)] mb-5">
              <div className="flex items-center gap-1.5">
                <QuestionsIcon />
                <span>
                  {questionCount} {questionCount === 1 ? 'question' : 'questions'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarIcon />
                <span>{formatDate(quiz.createdAt)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowStartModal(true)}
                leftIcon={<PlayIcon />}
                disabled={questionCount === 0}
                title={questionCount === 0 ? 'Add questions to start a session' : 'Start a live session'}
              >
                Go Live
              </Button>
              <Link href={`/admin/quiz/${quiz._id}`} className="flex-1">
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  leftIcon={<EditIcon />}
                >
                  Edit
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete?.(quiz._id)}
                disabled={isDeleting}
                isLoading={isDeleting}
                className="text-[var(--text-muted)] hover:text-error hover:bg-error/10"
                aria-label="Delete quiz"
              >
                {!isDeleting && <TrashIcon />}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Start Session Modal */}
        <Modal open={showStartModal} onOpenChange={setShowStartModal}>
          <ModalContent size="md" aria-describedby={undefined}>
            <ModalHeader>
              <ModalTitle>Start Live Session</ModalTitle>
              <ModalDescription className="sr-only">
                Create a new live quiz session for participants to join
              </ModalDescription>
            </ModalHeader>
            <div className="space-y-6">
              {!sessionData ? (
                <>
                  <p className="text-body text-[var(--text-secondary)]">
                    You&apos;re about to start a live session for <span className="font-semibold text-[var(--text-primary)]">{quiz.title}</span>.
                  </p>
                  <div className="neu-pressed rounded-lg p-4">
                    <div className="flex items-center justify-between text-body-sm">
                      <span className="text-[var(--text-muted)]">Questions</span>
                      <span className="font-medium text-[var(--text-primary)]">{questionCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-body-sm mt-2">
                      <span className="text-[var(--text-muted)]">Quiz Type</span>
                      <span className="font-medium text-[var(--text-primary)]">{quizTypeLabels[quiz.quizType]}</span>
                    </div>
                  </div>
                  {quiz.examSettings && (quiz.examSettings.negativeMarkingEnabled || quiz.examSettings.focusMonitoringEnabled) && (
                    <div className="neu-pressed rounded-lg p-4">
                      <p className="text-caption text-[var(--text-muted)] mb-2">Exam Settings</p>
                      {quiz.examSettings.negativeMarkingEnabled && (
                        <div className="flex items-center justify-between text-body-sm">
                          <span className="text-[var(--text-muted)]">Negative Marking</span>
                          <span className="font-medium text-warning">{quiz.examSettings.negativeMarkingPercentage}% deduction</span>
                        </div>
                      )}
                      {quiz.examSettings.focusMonitoringEnabled && (
                        <div className="flex items-center justify-between text-body-sm mt-1">
                          <span className="text-[var(--text-muted)]">Focus Monitoring</span>
                          <span className="font-medium text-info">Enabled</span>
                        </div>
                      )}
                    </div>
                  )}
                  {error && (
                    <div className="bg-error/10 border border-error/20 rounded-lg p-4">
                      <p className="text-body-sm text-error">{error}</p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={closeModal} fullWidth>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleStartSession}
                      isLoading={isStarting}
                      fullWidth
                      leftIcon={!isStarting ? <PlayIcon /> : undefined}
                    >
                      Start Session
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-2">
                      Session Created!
                    </h3>
                    <p className="text-body text-[var(--text-secondary)]">
                      Share the join code with participants
                    </p>
                  </div>

                  <div className="neu-pressed rounded-lg p-6 text-center">
                    <p className="text-caption text-[var(--text-muted)] mb-2">Join Code</p>
                    <p className="font-mono text-display font-bold text-primary tracking-wider text-4xl">
                      {sessionData.joinCode}
                    </p>
                    <p className="text-body-sm text-[var(--text-muted)] mt-3">
                      Participants can join at <span className="font-medium">/join</span>
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <Button
                      variant="primary"
                      onClick={handleGoToController}
                      fullWidth
                    >
                      Open Controller Panel
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleOpenBigScreen}
                      fullWidth
                    >
                      Open Big Screen
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={closeModal}
                      fullWidth
                    >
                      Close
                    </Button>
                  </div>
                </>
              )}
            </div>
          </ModalContent>
        </Modal>
      </>
    );
  }
);

export default QuizCard;
