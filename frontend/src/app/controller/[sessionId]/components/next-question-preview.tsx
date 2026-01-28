/**
 * Next Question Preview - Shows preview of the upcoming question
 * 
 * Displays:
 * - Question text preview
 * - Question type
 * - Time limit
 * - Number of options
 * 
 * Helps the controller prepare for the next question.
 * 
 * Requirements: 13.3
 */

'use client';

import { motion } from 'framer-motion';
import { QuestionWithNotes } from './quiz-control-card';

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
 * Next question preview props
 */
interface NextQuestionPreviewProps {
  /** The next question data */
  question: QuestionWithNotes;
  /** Question number (1-based) */
  questionNumber: number;
}

/**
 * Next Question Preview Component
 */
export function NextQuestionPreview({
  question,
  questionNumber,
}: NextQuestionPreviewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-[var(--neu-surface)]"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center">
          <svg
            className="w-4 h-4 text-info"
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
        </div>
        <div>
          <h4 className="text-body-sm font-semibold text-[var(--text-primary)]">
            Up Next: Question {questionNumber}
          </h4>
          <p className="text-caption text-[var(--text-muted)]">
            Preview of the next question
          </p>
        </div>
      </div>

      {/* Question Preview Card */}
      <div className="neu-pressed-sm rounded-lg p-4">
        {/* Question Meta */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="px-2 py-0.5 rounded-full bg-info/10 text-info text-caption font-medium">
            {getQuestionTypeLabel(question.questionType)}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-warning/10 text-warning text-caption font-medium">
            {question.timeLimit}s
          </span>
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-caption font-medium">
            {question.options.length} option{question.options.length !== 1 ? 's' : ''}
          </span>
          {question.questionImageUrl && (
            <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-caption font-medium">
              Has Image
            </span>
          )}
        </div>

        {/* Question Text Preview */}
        <p className="text-body text-[var(--text-primary)] line-clamp-2">
          {question.questionText}
        </p>

        {/* Options Preview */}
        <div className="mt-3 flex flex-wrap gap-2">
          {question.options.slice(0, 4).map((option, index) => (
            <div
              key={option.optionId}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--neu-bg)] text-caption"
            >
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-[10px]">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="text-[var(--text-secondary)] truncate max-w-[100px]">
                {option.optionText}
              </span>
            </div>
          ))}
          {question.options.length > 4 && (
            <span className="px-2 py-1 text-caption text-[var(--text-muted)]">
              +{question.options.length - 4} more
            </span>
          )}
        </div>

        {/* Speaker Notes Indicator */}
        {question.speakerNotes && (
          <div className="mt-3 flex items-center gap-1.5 text-caption text-accent">
            <svg
              className="w-3.5 h-3.5"
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
            <span>Has speaker notes</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default NextQuestionPreview;
