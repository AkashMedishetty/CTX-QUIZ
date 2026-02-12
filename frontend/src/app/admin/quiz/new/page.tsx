/**
 * Quiz Creation Page
 * 
 * Page for creating new quizzes in the Admin Panel.
 * Uses the QuizForm component with POST /api/quizzes endpoint.
 * 
 * Requirements: 1.1, 1.7
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { post, type ApiError } from '@/lib/api-client';
import { QuizForm, type QuizFormData } from '../components/quiz-form';

/**
 * API response for quiz creation
 */
interface CreateQuizResponse {
  success: boolean;
  message: string;
  quiz: {
    _id: string;
    title: string;
    description: string;
    quizType: string;
    branding: {
      primaryColor: string;
      secondaryColor: string;
      logoUrl?: string;
    };
    questions: unknown[];
    createdAt: string;
    updatedAt: string;
  };
}

/**
 * API request body for quiz creation
 */
interface CreateQuizRequest {
  title: string;
  description?: string;
  quizType: string;
  branding?: {
    primaryColor: string;
    secondaryColor: string;
    logoUrl?: string;
  };
  eliminationSettings?: {
    eliminationPercentage: number;
    eliminationFrequency: 'EVERY_QUESTION';
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
 * Back arrow icon
 */
function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
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
      className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-lg shadow-lg ${
        type === 'success'
          ? 'bg-success text-white'
          : 'bg-error text-white'
      }`}
    >
      <div className="flex items-center gap-3">
        {type === 'success' ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
        <span className="font-medium">{message}</span>
        <button
          onClick={onClose}
          className="ml-2 hover:opacity-80 transition-opacity"
          aria-label="Close notification"
        >
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
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Create quiz API call
 */
async function createQuiz(data: CreateQuizRequest): Promise<CreateQuizResponse> {
  return post<CreateQuizResponse, CreateQuizRequest>('/quizzes', data);
}

/**
 * Quiz Creation Page
 */
export default function CreateQuizPage() {
  const router = useRouter();
  const [toast, setToast] = React.useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // Create quiz mutation
  const createMutation = useMutation({
    mutationFn: createQuiz,
    onSuccess: (data) => {
      setToast({
        message: 'Quiz created successfully!',
        type: 'success',
      });
      // Navigate to quiz edit page after short delay
      // The response has the quiz inside a 'quiz' property
      const quizId = data?.quiz?._id;
      if (quizId) {
        setTimeout(() => {
          router.push(`/admin/quiz/${quizId}`);
        }, 1000);
      } else {
        // Fallback: go to admin page if no quiz ID
        console.error('Quiz created but no ID returned:', data);
        setTimeout(() => {
          router.push('/admin');
        }, 1000);
      }
    },
    onError: (error: ApiError) => {
      setToast({
        message: error.message || 'Failed to create quiz. Please try again.',
        type: 'error',
      });
    },
  });

  // Handle form submission
  const handleSubmit = async (formData: QuizFormData) => {
    const requestData: CreateQuizRequest = {
      title: formData.title,
      description: formData.description || undefined,
      quizType: formData.quizType,
      branding: {
        primaryColor: formData.branding.primaryColor,
        secondaryColor: formData.branding.secondaryColor,
        logoUrl: formData.branding.logoUrl || undefined,
      },
    };

    // Add type-specific settings
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

    await createMutation.mutateAsync(requestData);
  };

  // Handle cancel
  const handleCancel = () => {
    router.push('/admin');
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <button
          onClick={handleCancel}
          className="flex items-center gap-2 text-body-sm text-[var(--text-secondary)] hover:text-primary transition-colors duration-fast mb-4"
        >
          <ArrowLeftIcon />
          <span>Back to Quizzes</span>
        </button>
        <h1 className="text-h1 font-semibold text-[var(--text-primary)]">
          Create New Quiz
        </h1>
        <p className="text-body text-[var(--text-secondary)] mt-1">
          Set up your quiz details and configuration
        </p>
      </motion.div>

      {/* Quiz Form */}
      <QuizForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={createMutation.isPending}
        submitText="Create Quiz"
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
