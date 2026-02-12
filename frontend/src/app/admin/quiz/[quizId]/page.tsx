/**
 * Quiz Edit Page
 * 
 * Page for editing existing quizzes in the Admin Panel.
 * Features:
 * - Load existing quiz data
 * - Edit quiz metadata
 * - Edit/delete questions
 * - Reorder questions with drag-and-drop
 * - Add new questions
 * 
 * Requirements: 1.1
 */

'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, put, post, del, type ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/components/ui/modal';
import { QuizForm, type QuizFormData } from '../components/quiz-form';
import { QuestionBuilder, type QuestionFormData } from '../components/question-builder';
import { CSVImporter } from '../components/csv-importer';
import { downloadTemplate } from '@/lib/csv-parser';
import { cn } from '@/lib/utils';

/**
 * Question interface from API
 */
interface Question {
  questionId: string;
  questionText: string;
  questionType: 'MULTIPLE_CHOICE' | 'MULTI_SELECT' | 'TRUE_FALSE';
  questionImageUrl?: string;
  timeLimit: number;
  options: Array<{
    optionId: string;
    optionText: string;
    optionImageUrl?: string;
    isCorrect: boolean;
  }>;
  scoring: {
    basePoints: number;
    speedBonusMultiplier: number;
    partialCreditEnabled: boolean;
  };
  shuffleOptions: boolean;
  speakerNotes?: string;
  explanationText?: string;
}

/**
 * Quiz interface from API
 */
interface Quiz {
  _id: string;
  title: string;
  description: string;
  quizType: 'REGULAR' | 'ELIMINATION' | 'FFI';
  branding: {
    primaryColor: string;
    secondaryColor: string;
    logoUrl?: string;
  };
  eliminationSettings?: {
    eliminationPercentage: number;
    eliminationFrequency: string;
  };
  ffiSettings?: {
    winnersPerQuestion: number;
  };
  examSettings?: {
    negativeMarkingEnabled: boolean;
    negativeMarkingPercentage: number;
    focusMonitoringEnabled: boolean;
    skipRevealPhase?: boolean;
    autoAdvance?: boolean;
  };
  questions: Question[];
  createdAt: string;
  updatedAt: string;
}

/**
 * API request for updating quiz
 */
interface UpdateQuizRequest {
  title?: string;
  description?: string;
  quizType?: string;
  branding?: {
    primaryColor: string;
    secondaryColor: string;
    logoUrl?: string;
  };
  eliminationSettings?: {
    eliminationPercentage: number;
    eliminationFrequency: string;
  };
  ffiSettings?: {
    winnersPerQuestion: number;
  };
  examSettings?: {
    negativeMarkingEnabled: boolean;
    negativeMarkingPercentage: number;
    focusMonitoringEnabled: boolean;
    skipRevealPhase?: boolean;
    autoAdvance?: boolean;
  };
}

/**
 * API request for adding/updating question
 */
interface QuestionRequest {
  questionText: string;
  questionType: string;
  questionImageUrl?: string;
  timeLimit: number;
  options: Array<{
    optionId?: string;
    optionText: string;
    optionImageUrl?: string;
    isCorrect: boolean;
  }>;
  scoring: {
    basePoints: number;
    speedBonusMultiplier: number;
    partialCreditEnabled: boolean;
  };
  shuffleOptions: boolean;
  speakerNotes?: string;
  explanationText?: string;
}

/**
 * API request for reordering questions
 */
interface ReorderQuestionsRequest {
  questionIds: string[];
}

// Icons
function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/**
 * Toast notification component
 */
function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  React.useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 50, scale: 0.9 }}
      className={cn(
        'fixed bottom-6 right-6 z-50 px-6 py-4 rounded-lg shadow-lg',
        type === 'success' ? 'bg-success text-white' : 'bg-error text-white'
      )}
    >
      <div className="flex items-center gap-3">
        {type === 'success' ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
        <span className="font-medium">{message}</span>
        <button onClick={onClose} className="ml-2 hover:opacity-80 transition-opacity" aria-label="Close notification">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Loading skeleton for quiz
 */
function QuizSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-[var(--neu-surface)] rounded-md" />
      <div className="h-4 w-96 bg-[var(--neu-surface)] rounded-md" />
      <div className="neu-raised rounded-lg p-6 space-y-4">
        <div className="h-6 w-32 bg-[var(--neu-surface)] rounded-md" />
        <div className="h-10 w-full bg-[var(--neu-surface)] rounded-md" />
        <div className="h-10 w-full bg-[var(--neu-surface)] rounded-md" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="neu-raised rounded-lg p-4 h-24" />
        ))}
      </div>
    </div>
  );
}

/**
 * Question type labels
 */
const questionTypeLabels: Record<string, string> = {
  MULTIPLE_CHOICE: 'Multiple Choice',
  MULTI_SELECT: 'Multi-Select',
  TRUE_FALSE: 'True/False',
};

/**
 * Question Item Component for the list
 */
interface QuestionItemProps {
  question: Question;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

function QuestionItem({ question, index, onEdit, onDelete, disabled }: QuestionItemProps) {
  const correctCount = question.options.filter((o) => o.isCorrect).length;
  
  // Strip HTML tags for preview
  const plainText = question.questionText.replace(/<[^>]*>/g, '');
  const previewText = plainText.length > 100 ? plainText.substring(0, 100) + '...' : plainText;

  return (
    <Reorder.Item
      value={question}
      id={question.questionId}
      className={cn(
        'flex items-center gap-4 p-4 rounded-lg',
        'bg-[var(--neu-bg)]',
        'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]',
        'hover:shadow-[6px_6px_12px_var(--shadow-dark),-6px_-6px_12px_var(--shadow-light)]',
        'transition-all duration-fast',
        disabled && 'opacity-50'
      )}
      dragListener={!disabled}
    >
      {/* Drag Handle */}
      <div
        className={cn(
          'flex-shrink-0 cursor-grab active:cursor-grabbing text-[var(--text-muted)]',
          'hover:text-[var(--text-secondary)] transition-colors',
          disabled && 'cursor-not-allowed'
        )}
      >
        <DragHandleIcon />
      </div>

      {/* Question Number */}
      <div
        className={cn(
          'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
          'font-semibold text-body font-display',
          'bg-primary text-white',
          'shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]'
        )}
      >
        {index + 1}
      </div>

      {/* Question Content */}
      <div className="flex-1 min-w-0">
        <p className="text-body font-medium text-[var(--text-primary)] truncate">
          {previewText || 'Untitled Question'}
        </p>
        <div className="flex items-center gap-4 mt-1 text-body-sm text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            {questionTypeLabels[question.questionType] || question.questionType}
          </span>
          <span className="flex items-center gap-1">
            <ClockIcon className="w-3.5 h-3.5" />
            {question.timeLimit}s
          </span>
          <span>{question.options.length} options</span>
          <span className="text-success">{correctCount} correct</span>
          {question.questionImageUrl && (
            <span className="flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" />
              Image
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          title="Edit question"
          className={cn(
            'w-10 h-10 rounded-md flex items-center justify-center',
            'bg-[var(--neu-bg)] text-[var(--text-muted)]',
            'shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
            'hover:text-primary hover:shadow-[1px_1px_2px_var(--shadow-dark),-1px_-1px_2px_var(--shadow-light)]',
            'transition-all duration-fast',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <EditIcon />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          title="Delete question"
          className={cn(
            'w-10 h-10 rounded-md flex items-center justify-center',
            'bg-[var(--neu-bg)] text-[var(--text-muted)]',
            'shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
            'hover:text-error hover:shadow-[1px_1px_2px_var(--shadow-dark),-1px_-1px_2px_var(--shadow-light)]',
            'transition-all duration-fast',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <TrashIcon />
        </button>
      </div>
    </Reorder.Item>
  );
}

/**
 * Delete Confirmation Modal
 */
function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  isLoading: boolean;
}) {
  return (
    <Modal open={isOpen} onOpenChange={onClose}>
      <ModalContent size="sm">
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          <ModalDescription>{description}</ModalDescription>
        </ModalHeader>
        <ModalFooter className="gap-3">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} isLoading={isLoading}>
            Delete
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/**
 * API response wrapper
 */
interface ApiQuizResponse {
  success: boolean;
  quiz: Quiz;
  message?: string;
}

interface ApiQuestionResponse {
  success: boolean;
  question: Question;
  message?: string;
}

/**
 * API functions
 */
async function fetchQuiz(quizId: string): Promise<Quiz> {
  const response = await get<ApiQuizResponse>(`/quizzes/${quizId}`);
  return response.quiz;
}

async function updateQuiz(quizId: string, data: UpdateQuizRequest): Promise<Quiz> {
  const response = await put<ApiQuizResponse, UpdateQuizRequest>(`/quizzes/${quizId}`, data);
  return response.quiz;
}

async function addQuestion(quizId: string, data: QuestionRequest): Promise<Question> {
  const response = await post<ApiQuestionResponse, QuestionRequest>(`/quizzes/${quizId}/questions`, data);
  return response.question;
}

async function updateQuestion(quizId: string, questionId: string, data: QuestionRequest): Promise<Question> {
  const response = await put<ApiQuestionResponse, QuestionRequest>(`/quizzes/${quizId}/questions/${questionId}`, data);
  return response.question;
}

async function deleteQuestion(quizId: string, questionId: string): Promise<void> {
  await del<{ success: boolean }>(`/quizzes/${quizId}/questions/${questionId}`);
}

async function reorderQuestions(quizId: string, data: ReorderQuestionsRequest): Promise<Quiz> {
  const response = await put<ApiQuizResponse, ReorderQuestionsRequest>(`/quizzes/${quizId}/questions/reorder`, data);
  return response.quiz;
}

/**
 * Convert QuestionFormData to API request format
 */
function formDataToRequest(data: QuestionFormData): QuestionRequest {
  return {
    questionText: data.questionText,
    questionType: data.questionType,
    questionImageUrl: data.questionImageUrl,
    timeLimit: data.timeLimit,
    options: data.options.map((opt) => ({
      optionId: opt.id.startsWith('opt_') ? undefined : opt.id,
      optionText: opt.optionText,
      optionImageUrl: opt.optionImageUrl,
      isCorrect: opt.isCorrect,
    })),
    scoring: {
      basePoints: data.scoring.basePoints,
      speedBonusMultiplier: data.scoring.speedBonusEnabled ? data.scoring.speedBonusMultiplier : 0,
      partialCreditEnabled: data.scoring.partialCreditEnabled,
    },
    shuffleOptions: data.shuffleOptions,
    speakerNotes: data.speakerNotes,
    explanationText: data.explanationText,
  };
}

/**
 * Convert API Question to QuestionFormData format
 */
function questionToFormData(question: Question): QuestionFormData {
  return {
    questionText: question.questionText,
    questionType: question.questionType,
    questionImageUrl: question.questionImageUrl,
    timeLimit: question.timeLimit,
    options: question.options.map((opt) => ({
      id: opt.optionId,
      optionText: opt.optionText,
      optionImageUrl: opt.optionImageUrl,
      isCorrect: opt.isCorrect,
    })),
    scoring: {
      basePoints: question.scoring.basePoints,
      speedBonusEnabled: question.scoring.speedBonusMultiplier > 0,
      speedBonusMultiplier: question.scoring.speedBonusMultiplier || 0.5,
      partialCreditEnabled: question.scoring.partialCreditEnabled,
    },
    shuffleOptions: question.shuffleOptions,
    speakerNotes: question.speakerNotes,
    explanationText: question.explanationText,
  };
}

/**
 * Convert Quiz to QuizFormData format
 */
function quizToFormData(quiz: Quiz): QuizFormData {
  return {
    title: quiz.title,
    description: quiz.description || '',
    quizType: quiz.quizType,
    branding: {
      primaryColor: quiz.branding?.primaryColor || '#275249',
      secondaryColor: quiz.branding?.secondaryColor || '#6B3093',
      logoUrl: quiz.branding?.logoUrl,
    },
    eliminationPercentage: quiz.eliminationSettings?.eliminationPercentage,
    ffiWinnerCount: quiz.ffiSettings?.winnersPerQuestion,
    examSettings: quiz.examSettings ? {
      negativeMarkingEnabled: quiz.examSettings.negativeMarkingEnabled ?? false,
      negativeMarkingPercentage: quiz.examSettings.negativeMarkingPercentage ?? 25,
      focusMonitoringEnabled: quiz.examSettings.focusMonitoringEnabled ?? false,
      skipRevealPhase: quiz.examSettings.skipRevealPhase ?? false,
      autoAdvance: quiz.examSettings.autoAdvance ?? false,
    } : undefined,
  };
}

/**
 * Quiz Edit Page Component
 */
export default function QuizEditPage() {
  const router = useRouter();
  const params = useParams();
  const quizId = params.quizId as string;
  const queryClient = useQueryClient();

  // Validate quizId - must be a valid MongoDB ObjectId (24 hex chars)
  const isValidQuizId = Boolean(quizId && quizId !== 'undefined' && /^[0-9a-fA-F]{24}$/.test(quizId));

  // State
  const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showMetadataModal, setShowMetadataModal] = React.useState(false);
  const [showQuestionModal, setShowQuestionModal] = React.useState(false);
  const [showCSVImporter, setShowCSVImporter] = React.useState(false);
  const [editingQuestion, setEditingQuestion] = React.useState<Question | null>(null);
  const [deleteConfirm, setDeleteConfirm] = React.useState<{ questionId: string; questionText: string } | null>(null);

  // Fetch quiz data
  const { data: quiz, isLoading, error } = useQuery({
    queryKey: ['quiz', quizId],
    queryFn: () => fetchQuiz(quizId),
    enabled: isValidQuizId,
  });

  // Update quiz metadata mutation
  const updateQuizMutation = useMutation({
    mutationFn: (data: UpdateQuizRequest) => updateQuiz(quizId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz', quizId] });
      setShowMetadataModal(false);
      setToast({ message: 'Quiz updated successfully!', type: 'success' });
    },
    onError: (error: ApiError) => {
      setToast({ message: error.message || 'Failed to update quiz', type: 'error' });
    },
  });

  // Add question mutation
  const addQuestionMutation = useMutation({
    mutationFn: (data: QuestionRequest) => addQuestion(quizId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz', quizId] });
      setShowQuestionModal(false);
      setToast({ message: 'Question added successfully!', type: 'success' });
    },
    onError: (error: ApiError) => {
      setToast({ message: error.message || 'Failed to add question', type: 'error' });
    },
  });

  // Update question mutation
  const updateQuestionMutation = useMutation({
    mutationFn: ({ questionId, data }: { questionId: string; data: QuestionRequest }) =>
      updateQuestion(quizId, questionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz', quizId] });
      setShowQuestionModal(false);
      setEditingQuestion(null);
      setToast({ message: 'Question updated successfully!', type: 'success' });
    },
    onError: (error: ApiError) => {
      setToast({ message: error.message || 'Failed to update question', type: 'error' });
    },
  });

  // Delete question mutation
  const deleteQuestionMutation = useMutation({
    mutationFn: (questionId: string) => deleteQuestion(quizId, questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz', quizId] });
      setDeleteConfirm(null);
      setToast({ message: 'Question deleted successfully!', type: 'success' });
    },
    onError: (error: ApiError) => {
      setToast({ message: error.message || 'Failed to delete question', type: 'error' });
    },
  });

  // Reorder questions mutation
  const reorderMutation = useMutation({
    mutationFn: (questionIds: string[]) => reorderQuestions(quizId, { questionIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz', quizId] });
    },
    onError: (error: ApiError) => {
      setToast({ message: error.message || 'Failed to reorder questions', type: 'error' });
    },
  });

  // Handle quiz metadata update
  const handleMetadataSubmit = async (formData: QuizFormData) => {
    const requestData: UpdateQuizRequest = {
      title: formData.title,
      description: formData.description || undefined,
      quizType: formData.quizType,
      branding: {
        primaryColor: formData.branding.primaryColor,
        secondaryColor: formData.branding.secondaryColor,
        logoUrl: formData.branding.logoUrl || undefined,
      },
    };

    if (formData.quizType === 'ELIMINATION' && formData.eliminationPercentage) {
      requestData.eliminationSettings = {
        eliminationPercentage: formData.eliminationPercentage,
        eliminationFrequency: 'EVERY_QUESTION',
      };
    }

    if (formData.quizType === 'FFI' && formData.ffiWinnerCount) {
      requestData.ffiSettings = {
        winnersPerQuestion: formData.ffiWinnerCount,
      };
    }

    if (formData.examSettings) {
      requestData.examSettings = formData.examSettings;
    }

    await updateQuizMutation.mutateAsync(requestData);
  };

  // Handle question submit (add or update)
  const handleQuestionSubmit = async (formData: QuestionFormData) => {
    const requestData = formDataToRequest(formData);

    if (editingQuestion) {
      await updateQuestionMutation.mutateAsync({
        questionId: editingQuestion.questionId,
        data: requestData,
      });
    } else {
      await addQuestionMutation.mutateAsync(requestData);
    }
  };

  // Handle question reorder
  const handleReorder = (newOrder: Question[]) => {
    // Optimistically update the UI
    queryClient.setQueryData(['quiz', quizId], (old: Quiz | undefined) => {
      if (!old) return old;
      return { ...old, questions: newOrder };
    });

    // Send reorder request to server
    const questionIds = newOrder.map((q) => q.questionId);
    reorderMutation.mutate(questionIds);
  };

  // Handle edit question click
  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setShowQuestionModal(true);
  };

  // Handle add question click
  const handleAddQuestion = () => {
    setEditingQuestion(null);
    setShowQuestionModal(true);
  };

  // Handle delete question click
  const handleDeleteQuestion = (question: Question) => {
    const plainText = question.questionText.replace(/<[^>]*>/g, '');
    const previewText = plainText.length > 50 ? plainText.substring(0, 50) + '...' : plainText;
    setDeleteConfirm({ questionId: question.questionId, questionText: previewText || 'this question' });
  };

  // Handle confirm delete
  const handleConfirmDelete = () => {
    if (deleteConfirm) {
      deleteQuestionMutation.mutate(deleteConfirm.questionId);
    }
  };

  // Handle back navigation
  const handleBack = () => {
    router.push('/admin');
  };

  // Handle CSV import
  const handleCSVImport = async (importedQuestions: QuestionFormData[]) => {
    // Add each question sequentially
    for (const questionData of importedQuestions) {
      const requestData = formDataToRequest(questionData);
      try {
        await addQuestion(quizId, requestData);
      } catch (error) {
        console.error('Failed to import question:', error);
      }
    }
    // Refresh the quiz data
    queryClient.invalidateQueries({ queryKey: ['quiz', quizId] });
    setToast({ 
      message: `Successfully imported ${importedQuestions.length} question${importedQuestions.length !== 1 ? 's' : ''}!`, 
      type: 'success' 
    });
  };

  // Invalid quizId state
  if (!isValidQuizId) {
    return (
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="neu-raised rounded-lg p-8 text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-error">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-h2 font-semibold text-[var(--text-primary)] mb-2">Invalid Quiz ID</h2>
          <p className="text-body text-[var(--text-secondary)] mb-6">
            The quiz ID in the URL is invalid. Please check the link and try again.
          </p>
          <Button variant="primary" onClick={handleBack}>
            Back to Quizzes
          </Button>
        </motion.div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="neu-raised rounded-lg p-8 text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-error">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-h2 font-semibold text-[var(--text-primary)] mb-2">Quiz Not Found</h2>
          <p className="text-body text-[var(--text-secondary)] mb-6">
            The quiz you&apos;re looking for doesn&apos;t exist or has been deleted.
          </p>
          <Button variant="primary" onClick={handleBack}>
            Back to Quizzes
          </Button>
        </motion.div>
      </div>
    );
  }

  // Loading state
  if (isLoading || !quiz) {
    return (
      <div className="max-w-4xl mx-auto">
        <QuizSkeleton />
      </div>
    );
  }

  const questions = quiz.questions || [];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-body-sm text-[var(--text-secondary)] hover:text-primary transition-colors duration-fast mb-4"
        >
          <ArrowLeftIcon />
          <span>Back to Quizzes</span>
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-h1 font-semibold text-[var(--text-primary)] truncate">
              {quiz.title}
            </h1>
            <p className="text-body text-[var(--text-secondary)] mt-1">
              {quiz.description || 'No description'}
            </p>
            <div className="flex items-center gap-4 mt-2 text-body-sm text-[var(--text-muted)]">
              <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
                {quiz.quizType}
              </span>
              <span>{questions.length} questions</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => router.push(`/admin/quiz/${quizId}/preview`)}
              leftIcon={<EyeIcon />}
              disabled={questions.length === 0}
            >
              Preview Quiz
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowMetadataModal(true)}
              leftIcon={<SettingsIcon />}
            >
              Edit Settings
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Questions Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-h2 font-semibold text-[var(--text-primary)]">Questions</h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              Drag to reorder • Click to edit
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              onClick={() => downloadTemplate()}
              leftIcon={<DownloadIcon />}
              title="Download CSV template"
            >
              Template
            </Button>
            <Button 
              variant="secondary" 
              onClick={() => setShowCSVImporter(true)}
              leftIcon={<UploadIcon />}
            >
              Import CSV
            </Button>
            <Button variant="primary" onClick={handleAddQuestion} leftIcon={<PlusIcon />}>
              Add Question
            </Button>
          </div>
        </div>

        {questions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="neu-raised rounded-lg p-12 text-center"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--neu-surface)] flex items-center justify-center">
              <PlusIcon className="w-8 h-8 text-[var(--text-muted)]" />
            </div>
            <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-2">
              No questions yet
            </h3>
            <p className="text-body text-[var(--text-secondary)] mb-6">
              Add your first question to get started
            </p>
            <Button variant="primary" onClick={handleAddQuestion} leftIcon={<PlusIcon />}>
              Add Question
            </Button>
          </motion.div>
        ) : (
          <Reorder.Group
            axis="y"
            values={questions}
            onReorder={handleReorder}
            className="space-y-3"
          >
            <AnimatePresence initial={false}>
              {questions.map((question, index) => (
                <QuestionItem
                  key={question.questionId}
                  question={question}
                  index={index}
                  onEdit={() => handleEditQuestion(question)}
                  onDelete={() => handleDeleteQuestion(question)}
                  disabled={reorderMutation.isPending}
                />
              ))}
            </AnimatePresence>
          </Reorder.Group>
        )}
      </motion.div>

      {/* Quiz Metadata Edit Modal */}
      <Modal open={showMetadataModal} onOpenChange={setShowMetadataModal}>
        <ModalContent size="lg">
          <ModalHeader>
            <ModalTitle>Edit Quiz Settings</ModalTitle>
            <ModalDescription>
              Update quiz title, description, type, and branding
            </ModalDescription>
          </ModalHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-2">
            <QuizForm
              initialValues={quizToFormData(quiz)}
              onSubmit={handleMetadataSubmit}
              onCancel={() => setShowMetadataModal(false)}
              isLoading={updateQuizMutation.isPending}
              submitText="Save Changes"
            />
          </div>
        </ModalContent>
      </Modal>

      {/* Question Builder Modal */}
      <Modal open={showQuestionModal} onOpenChange={(open) => {
        setShowQuestionModal(open);
        if (!open) setEditingQuestion(null);
      }}>
        <ModalContent size="xl">
          <ModalHeader>
            <ModalTitle>
              {editingQuestion ? 'Edit Question' : 'Add Question'}
            </ModalTitle>
            <ModalDescription>
              {editingQuestion
                ? 'Update the question details below'
                : 'Create a new question for your quiz'}
            </ModalDescription>
          </ModalHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-2">
            <QuestionBuilder
              initialValues={editingQuestion ? questionToFormData(editingQuestion) : undefined}
              onSubmit={handleQuestionSubmit}
              onCancel={() => {
                setShowQuestionModal(false);
                setEditingQuestion(null);
              }}
              isLoading={addQuestionMutation.isPending || updateQuestionMutation.isPending}
              submitText={editingQuestion ? 'Save Changes' : 'Add Question'}
              quizId={quizId}
            />
          </div>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Question"
        description={`Are you sure you want to delete "${deleteConfirm?.questionText}"? This action cannot be undone.`}
        isLoading={deleteQuestionMutation.isPending}
      />

      {/* CSV Importer Modal */}
      <CSVImporter
        isOpen={showCSVImporter}
        onClose={() => setShowCSVImporter(false)}
        onImport={handleCSVImport}
        existingQuestionCount={questions.length}
      />

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
