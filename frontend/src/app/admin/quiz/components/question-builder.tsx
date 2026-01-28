/**
 * Question Builder Component
 * 
 * A comprehensive question builder interface for the Admin Panel.
 * Features:
 * - Question text with rich text editor (TipTap)
 * - Question type selection (MULTIPLE_CHOICE, MULTI_SELECT, TRUE_FALSE)
 * - Image upload for questions
 * - Option builder with image upload and correct answer marking
 * - Scoring configuration (base points, speed bonus, partial credit)
 * - Speaker notes and explanation text
 * - Time limit configuration
 * 
 * Requirements: 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9, 1.10
 */

'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import type { ControllerRenderProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { uploadFile } from '@/lib/api-client';
import { RichTextEditor } from './rich-text-editor';
import { OptionBuilder, type OptionData } from './option-builder';

/**
 * Question type options
 */
export type QuestionType = 'MULTIPLE_CHOICE' | 'MULTI_SELECT' | 'TRUE_FALSE';

/**
 * Scoring configuration
 */
export interface ScoringConfig {
  basePoints: number;
  speedBonusEnabled: boolean;
  speedBonusMultiplier: number;
  partialCreditEnabled: boolean;
}


/**
 * Question form data interface
 */
export interface QuestionFormData {
  questionText: string;
  questionType: QuestionType;
  questionImageUrl?: string;
  timeLimit: number;
  options: OptionData[];
  scoring: ScoringConfig;
  speakerNotes?: string;
  explanationText?: string;
  shuffleOptions: boolean;
}

/**
 * Question Builder Props
 */
export interface QuestionBuilderProps {
  /** Initial values for editing */
  initialValues?: Partial<QuestionFormData>;
  /** Callback when form is submitted */
  onSubmit: (data: QuestionFormData) => Promise<void>;
  /** Callback when cancelled */
  onCancel: () => void;
  /** Loading state */
  isLoading?: boolean;
  /** Submit button text */
  submitText?: string;
  /** Quiz ID for API calls */
  quizId?: string;
}

/**
 * Generate unique ID for options
 */
function generateOptionId(): string {
  return `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Default Multiple Choice options
 */
const DEFAULT_MC_OPTIONS: OptionData[] = [
  { id: generateOptionId(), optionText: '', isCorrect: false },
  { id: generateOptionId(), optionText: '', isCorrect: false },
  { id: generateOptionId(), optionText: '', isCorrect: false },
  { id: generateOptionId(), optionText: '', isCorrect: false },
];

/**
 * Zod validation schema for question form
 */
const questionFormSchema = z.object({
  questionText: z.string().min(1, 'Question text is required'),
  questionType: z.enum(['MULTIPLE_CHOICE', 'MULTI_SELECT', 'TRUE_FALSE']),
  questionImageUrl: z.string().optional(),
  timeLimit: z.number().min(5, 'Minimum 5 seconds').max(120, 'Maximum 120 seconds'),
  options: z.array(z.object({
    id: z.string(),
    optionText: z.string(),
    optionImageUrl: z.string().optional(),
    isCorrect: z.boolean(),
  })).min(2, 'At least 2 options required'),
  scoring: z.object({
    basePoints: z.number().min(0, 'Points must be positive').max(10000, 'Maximum 10000 points'),
    speedBonusEnabled: z.boolean(),
    speedBonusMultiplier: z.number().min(0.1).max(2.0),
    partialCreditEnabled: z.boolean(),
  }),
  speakerNotes: z.string().optional(),
  explanationText: z.string().optional(),
  shuffleOptions: z.boolean(),
}).refine((data) => {
  // Ensure at least one correct answer
  return data.options.some(opt => opt.isCorrect);
}, {
  message: 'At least one option must be marked as correct',
  path: ['options'],
}).refine((data) => {
  // Ensure all options have text
  return data.options.every(opt => opt.optionText.trim().length > 0);
}, {
  message: 'All options must have text',
  path: ['options'],
});

/**
 * Default form values
 */
const defaultValues: QuestionFormData = {
  questionText: '',
  questionType: 'MULTIPLE_CHOICE',
  questionImageUrl: undefined,
  timeLimit: 30,
  options: DEFAULT_MC_OPTIONS,
  scoring: {
    basePoints: 1000,
    speedBonusEnabled: true,
    speedBonusMultiplier: 0.5,
    partialCreditEnabled: false,
  },
  speakerNotes: '',
  explanationText: '',
  shuffleOptions: true,
};


// Icons
function ImageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

/**
 * Form Section Component
 */
function FormSection({ 
  title, 
  description, 
  children,
  collapsible = false,
  defaultOpen = true,
}: { 
  title: string; 
  description?: string; 
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="neu-raised rounded-lg overflow-hidden"
    >
      <div
        className={cn(
          'p-6',
          collapsible && 'cursor-pointer hover:bg-[var(--neu-surface)] transition-colors'
        )}
        onClick={collapsible ? () => setIsOpen(!isOpen) : undefined}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-h3 font-semibold text-[var(--text-primary)]">{title}</h3>
            {description && (
              <p className="text-body-sm text-[var(--text-secondary)] mt-1">{description}</p>
            )}
          </div>
          {collapsible && (
            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </motion.div>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {(!collapsible || isOpen) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-6 pb-6">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


/**
 * Toggle Switch Component
 */
function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex items-start gap-3 cursor-pointer', disabled && 'opacity-50 cursor-not-allowed')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-fast',
          checked ? 'bg-primary' : 'bg-[var(--neu-surface)]',
          'shadow-[inset_2px_2px_4px_var(--shadow-dark),inset_-2px_-2px_4px_var(--shadow-light)]'
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-fast',
            checked ? 'translate-x-5' : 'translate-x-0.5',
            'mt-0.5'
          )}
        />
      </button>
      <div className="flex-1">
        <span className="text-body font-medium text-[var(--text-primary)]">{label}</span>
        {description && (
          <p className="text-body-sm text-[var(--text-muted)] mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );
}

/**
 * Question type descriptions
 */
const questionTypeDescriptions: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: 'Single correct answer from multiple options',
  MULTI_SELECT: 'Multiple correct answers can be selected',
  TRUE_FALSE: 'Simple true or false question',
};


/**
 * Question Builder Component
 */
export function QuestionBuilder({
  initialValues,
  onSubmit,
  onCancel,
  isLoading = false,
  submitText = 'Add Question',
}: QuestionBuilderProps) {
  const [isUploadingImage, setIsUploadingImage] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<QuestionFormData>({
    resolver: zodResolver(questionFormSchema),
    defaultValues: {
      ...defaultValues,
      ...initialValues,
      scoring: { ...defaultValues.scoring, ...initialValues?.scoring },
      options: initialValues?.options || defaultValues.options,
    },
  });

  const questionType = watch('questionType') as QuestionType;
  const questionImageUrl = watch('questionImageUrl');
  const scoring = watch('scoring');
  const options = watch('options');

  // Handle question type change - reset options appropriately
  const handleQuestionTypeChange = (newType: QuestionType) => {
    setValue('questionType', newType);
    
    if (newType === 'TRUE_FALSE') {
      setValue('options', [
        { id: generateOptionId(), optionText: 'True', isCorrect: false },
        { id: generateOptionId(), optionText: 'False', isCorrect: false },
      ]);
      setValue('scoring.partialCreditEnabled', false);
    } else if (newType === 'MULTIPLE_CHOICE') {
      if (options.length < 2) {
        setValue('options', DEFAULT_MC_OPTIONS);
      }
      setValue('scoring.partialCreditEnabled', false);
    } else if (newType === 'MULTI_SELECT') {
      if (options.length < 2) {
        setValue('options', DEFAULT_MC_OPTIONS);
      }
    }
  };


  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      return;
    }

    setIsUploadingImage(true);
    try {
      // Use the api-client uploadFile function which properly routes to backend
      const response = await uploadFile<{ success: boolean; imageUrl: string }>(
        '/upload/image',
        file,
        'image'
      );

      if (response.success && response.imageUrl) {
        setValue('questionImageUrl', response.imageUrl);
      }
    } catch (error) {
      console.error('Image upload failed:', error);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setValue('questionImageUrl', undefined);
  };

  const onFormSubmit = async (data: QuestionFormData) => {
    await onSubmit(data);
  };


  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* Question Content Section */}
      <FormSection title="Question Content" description="Enter the question text and optional image">
        <div className="space-y-4">
          {/* Question Type */}
          <Controller
            name="questionType"
            control={control}
            render={({ field }: { field: ControllerRenderProps<QuestionFormData, 'questionType'> }) => (
              <div>
                <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">
                  Question Type
                </label>
                <Select value={field.value} onValueChange={handleQuestionTypeChange}>
                  <SelectTrigger hasError={!!errors.questionType}>
                    <SelectValue placeholder="Select question type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MULTIPLE_CHOICE">Multiple Choice</SelectItem>
                    <SelectItem value="MULTI_SELECT">Multi-Select</SelectItem>
                    <SelectItem value="TRUE_FALSE">True / False</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-start gap-2 mt-2 p-3 rounded-md bg-primary/5 border border-primary/10">
                  <InfoIcon className="text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-body-sm text-[var(--text-secondary)]">
                    {questionTypeDescriptions[questionType]}
                  </p>
                </div>
              </div>
            )}
          />

          {/* Question Text (Rich Text Editor) */}
          <Controller
            name="questionText"
            control={control}
            render={({ field }: { field: ControllerRenderProps<QuestionFormData, 'questionText'> }) => (
              <RichTextEditor
                label="Question Text"
                value={field.value}
                onChange={field.onChange}
                placeholder="Enter your question here..."
                error={errors.questionText?.message}
                minHeight="100px"
              />
            )}
          />


          {/* Question Image */}
          <div>
            <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">
              Question Image (Optional)
            </label>
            {questionImageUrl ? (
              <div className="relative inline-block">
                <img
                  src={questionImageUrl}
                  alt="Question image"
                  className="max-h-48 rounded-lg object-cover shadow-md"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className={cn(
                    'absolute -top-2 -right-2 w-8 h-8 rounded-full',
                    'bg-error text-white flex items-center justify-center',
                    'shadow-md hover:bg-error-light transition-colors'
                  )}
                >
                  <XIcon />
                </button>
              </div>
            ) : (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={isUploadingImage}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg',
                    'bg-[var(--neu-bg)] text-[var(--text-secondary)]',
                    'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]',
                    'hover:shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
                    'hover:text-[var(--text-primary)] transition-all duration-fast',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <ImageIcon />
                  {isUploadingImage ? 'Uploading...' : 'Upload Image'}
                </button>
                <p className="mt-2 text-body-sm text-[var(--text-muted)]">
                  Max 5MB. Supported: JPG, PNG, GIF, WebP
                </p>
              </div>
            )}
          </div>
        </div>
      </FormSection>


      {/* Answer Options Section */}
      <FormSection title="Answer Options" description="Add answer options and mark correct answers">
        <Controller
          name="options"
          control={control}
          render={({ field }: { field: ControllerRenderProps<QuestionFormData, 'options'> }) => (
            <OptionBuilder
              options={field.value}
              onChange={field.onChange}
              questionType={questionType}
              error={errors.options?.message || (errors.options as unknown as { root?: { message?: string } })?.root?.message}
            />
          )}
        />
      </FormSection>

      {/* Timing Section */}
      <FormSection title="Timing" description="Set the time limit for this question">
        <div className="space-y-4">
          <Controller
            name="timeLimit"
            control={control}
            render={({ field }: { field: ControllerRenderProps<QuestionFormData, 'timeLimit'> }) => (
              <div>
                <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">
                  Time Limit
                </label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-[var(--text-muted)]">
                    <ClockIcon />
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={120}
                    step={5}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="flex-1 h-2 rounded-full appearance-none cursor-pointer bg-[var(--neu-bg)] shadow-[inset_2px_2px_4px_var(--shadow-dark),inset_-2px_-2px_4px_var(--shadow-light)]"
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  <span className="text-h3 font-semibold text-primary min-w-[4rem] text-right font-display">
                    {field.value}s
                  </span>
                </div>
                <p className="mt-2 text-body-sm text-[var(--text-muted)]">
                  Participants have {field.value} seconds to answer this question.
                </p>
                {errors.timeLimit && (
                  <p className="mt-2 text-body-sm text-error" role="alert">
                    {errors.timeLimit.message}
                  </p>
                )}
              </div>
            )}
          />
        </div>
      </FormSection>


      {/* Scoring Section */}
      <FormSection 
        title="Scoring" 
        description="Configure points and bonuses"
        collapsible
        defaultOpen={false}
      >
        <div className="space-y-6">
          {/* Base Points */}
          <Controller
            name="scoring.basePoints"
            control={control}
            render={({ field }: { field: ControllerRenderProps<QuestionFormData, 'scoring.basePoints'> }) => (
              <div>
                <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">
                  Base Points
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={100}
                    max={5000}
                    step={100}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="flex-1 h-2 rounded-full appearance-none cursor-pointer bg-[var(--neu-bg)] shadow-[inset_2px_2px_4px_var(--shadow-dark),inset_-2px_-2px_4px_var(--shadow-light)]"
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  <span className="text-body-lg font-semibold text-primary min-w-[5rem] text-right">
                    {field.value.toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-body-sm text-[var(--text-muted)]">
                  Points awarded for a correct answer.
                </p>
              </div>
            )}
          />

          {/* Speed Bonus */}
          <div className="space-y-3">
            <Controller
              name="scoring.speedBonusEnabled"
              control={control}
              render={({ field }: { field: ControllerRenderProps<QuestionFormData, 'scoring.speedBonusEnabled'> }) => (
                <ToggleSwitch
                  checked={field.value}
                  onChange={field.onChange}
                  label="Speed Bonus"
                  description="Award extra points for faster answers"
                />
              )}
            />


            <AnimatePresence>
              {scoring.speedBonusEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="pl-14"
                >
                  <Controller
                    name="scoring.speedBonusMultiplier"
                    control={control}
                    render={({ field }: { field: ControllerRenderProps<QuestionFormData, 'scoring.speedBonusMultiplier'> }) => (
                      <div>
                        <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">
                          Speed Bonus Multiplier
                        </label>
                        <div className="flex items-center gap-4">
                          <input
                            type="range"
                            min={0.1}
                            max={2.0}
                            step={0.1}
                            value={field.value}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            className="flex-1 h-2 rounded-full appearance-none cursor-pointer bg-[var(--neu-bg)] shadow-[inset_2px_2px_4px_var(--shadow-dark),inset_-2px_-2px_4px_var(--shadow-light)]"
                            style={{ accentColor: 'var(--primary)' }}
                          />
                          <span className="text-body font-semibold text-primary min-w-[3rem] text-right">
                            {field.value.toFixed(1)}x
                          </span>
                        </div>
                        <p className="mt-2 text-body-sm text-[var(--text-muted)]">
                          Max bonus: {Math.round(scoring.basePoints * field.value).toLocaleString()} points
                        </p>
                      </div>
                    )}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>


          {/* Partial Credit (only for MULTI_SELECT) */}
          {questionType === 'MULTI_SELECT' && (
            <Controller
              name="scoring.partialCreditEnabled"
              control={control}
              render={({ field }: { field: ControllerRenderProps<QuestionFormData, 'scoring.partialCreditEnabled'> }) => (
                <ToggleSwitch
                  checked={field.value}
                  onChange={field.onChange}
                  label="Partial Credit"
                  description="Award proportional points for partially correct answers"
                />
              )}
            />
          )}

          {/* Shuffle Options */}
          <Controller
            name="shuffleOptions"
            control={control}
            render={({ field }: { field: ControllerRenderProps<QuestionFormData, 'shuffleOptions'> }) => (
              <ToggleSwitch
                checked={field.value}
                onChange={field.onChange}
                label="Shuffle Options"
                description="Randomize option order for each participant"
                disabled={questionType === 'TRUE_FALSE'}
              />
            )}
          />
        </div>
      </FormSection>


      {/* Additional Content Section */}
      <FormSection 
        title="Additional Content" 
        description="Speaker notes and explanation text"
        collapsible
        defaultOpen={false}
      >
        <div className="space-y-4">
          {/* Speaker Notes */}
          <div>
            <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">
              Speaker Notes
            </label>
            <textarea
              placeholder="Private notes visible only to the host in Controller Panel..."
              className={cn(
                'w-full rounded-md p-4 min-h-[100px] resize-y bg-[var(--neu-bg)]',
                'shadow-[inset_3px_3px_6px_var(--shadow-dark),inset_-3px_-3px_6px_var(--shadow-light)]',
                'text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all duration-fast',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
              )}
              {...register('speakerNotes')}
            />
            <p className="mt-2 text-body-sm text-[var(--text-muted)]">
              Only visible to the quiz host during the live session.
            </p>
          </div>

          {/* Explanation Text */}
          <div>
            <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">
              Explanation Text
            </label>
            <textarea
              placeholder="Explanation shown after the answer is revealed..."
              className={cn(
                'w-full rounded-md p-4 min-h-[100px] resize-y bg-[var(--neu-bg)]',
                'shadow-[inset_3px_3px_6px_var(--shadow-dark),inset_-3px_-3px_6px_var(--shadow-light)]',
                'text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all duration-fast',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
              )}
              {...register('explanationText')}
            />
            <p className="mt-2 text-body-sm text-[var(--text-muted)]">
              Displayed to all participants during the reveal phase.
            </p>
          </div>
        </div>
      </FormSection>


      {/* Form Actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex flex-col-reverse sm:flex-row gap-3 pt-4"
      >
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isLoading}
          className="sm:flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          isLoading={isLoading}
          className="sm:flex-1"
        >
          {submitText}
        </Button>
      </motion.div>
    </form>
  );
}

export default QuestionBuilder;
