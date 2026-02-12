/**
 * QuizForm Component
 * 
 * Reusable form component for creating and editing quizzes.
 * Features:
 * - Title, description, quiz type fields
 * - Branding configuration (colors, logo)
 * - Conditional fields based on quiz type (elimination %, FFI winner count)
 * - Form validation with Zod
 * - Loading state handling
 * 
 * Requirements: 1.1, 1.7
 */

'use client';

import * as React from 'react';
import type { ControllerRenderProps } from 'react-hook-form';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Quiz type options
 */
export type QuizType = 'REGULAR' | 'ELIMINATION' | 'FFI';

/**
 * Branding configuration
 */
export interface QuizBranding {
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
}

/**
 * Exam settings configuration
 */
export interface ExamSettings {
  negativeMarkingEnabled: boolean;
  negativeMarkingPercentage: number; // 5-100, default 25
  focusMonitoringEnabled: boolean;
  skipRevealPhase: boolean;
  autoAdvance: boolean;
}

/**
 * Quiz form data interface
 */
export interface QuizFormData {
  title: string;
  description: string;
  quizType: QuizType;
  branding: QuizBranding;
  eliminationPercentage?: number;
  ffiWinnerCount?: number;
  examSettings?: ExamSettings;
}

/**
 * QuizForm props
 */
export interface QuizFormProps {
  initialValues?: Partial<QuizFormData>;
  onSubmit: (data: QuizFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  submitText?: string;
}

/**
 * Zod validation schema for quiz form
 */
const quizFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less'),
  quizType: z.enum(['REGULAR', 'ELIMINATION', 'FFI'], { required_error: 'Please select a quiz type' }),
  branding: z.object({
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
    secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
    logoUrl: z.string().optional(),
  }),
  eliminationPercentage: z.number().min(5).max(50).optional(),
  ffiWinnerCount: z.number().min(1).max(10).optional(),
  examSettings: z.object({
    negativeMarkingEnabled: z.boolean(),
    negativeMarkingPercentage: z.number().min(5).max(100),
    focusMonitoringEnabled: z.boolean(),
    skipRevealPhase: z.boolean(),
    autoAdvance: z.boolean(),
  }).optional(),
}).superRefine((data: z.infer<typeof quizFormSchemaBase>, ctx: z.RefinementCtx) => {
  if (data.quizType === 'ELIMINATION' && data.eliminationPercentage === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Elimination percentage is required', path: ['eliminationPercentage'] });
  }
  if (data.quizType === 'FFI' && data.ffiWinnerCount === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Winner count is required', path: ['ffiWinnerCount'] });
  }
});

// Base schema for type inference
const quizFormSchemaBase = z.object({
  title: z.string(),
  description: z.string(),
  quizType: z.enum(['REGULAR', 'ELIMINATION', 'FFI']),
  branding: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string(),
    logoUrl: z.string().optional(),
  }),
  eliminationPercentage: z.number().optional(),
  ffiWinnerCount: z.number().optional(),
  examSettings: z.object({
    negativeMarkingEnabled: z.boolean(),
    negativeMarkingPercentage: z.number(),
    focusMonitoringEnabled: z.boolean(),
    skipRevealPhase: z.boolean(),
    autoAdvance: z.boolean(),
  }).optional(),
});

const defaultValues: QuizFormData = {
  title: '',
  description: '',
  quizType: 'REGULAR',
  branding: { primaryColor: '#275249', secondaryColor: '#6B3093', logoUrl: '' },
  eliminationPercentage: 20,
  ffiWinnerCount: 5,
  examSettings: {
    negativeMarkingEnabled: false,
    negativeMarkingPercentage: 25,
    focusMonitoringEnabled: false,
    skipRevealPhase: false,
    autoAdvance: false,
  },
};

const quizTypeDescriptions: Record<QuizType, string> = {
  REGULAR: 'All participants answer all questions and accumulate points.',
  ELIMINATION: 'Bottom percentage of participants are eliminated after each question.',
  FFI: 'Only the first N participants with correct answers earn points.',
};

function ColorPicker({ value, onChange, label, error }: { value: string; onChange: (v: string) => void; label: string; error?: string }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="flex-1">
      <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">{label}</label>
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-md cursor-pointer bg-[var(--neu-bg)]',
          'shadow-[inset_3px_3px_6px_var(--shadow-dark),inset_-3px_-3px_6px_var(--shadow-light)]',
          'transition-all duration-fast hover:shadow-[inset_2px_2px_4px_var(--shadow-dark),inset_-2px_-2px_4px_var(--shadow-light)]',
          error && 'ring-2 ring-error ring-offset-2'
        )}
        onClick={() => inputRef.current?.click()}
      >
        <div className="w-8 h-8 rounded-md border-2 border-[var(--border)] flex-shrink-0" style={{ backgroundColor: value }} />
        <input ref={inputRef} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" />
        <span className="text-body-sm text-[var(--text-secondary)] uppercase font-mono">{value}</span>
      </div>
      {error && <p className="mt-2 text-body-sm text-error" role="alert">{error}</p>}
    </div>
  );
}

function FormSection({ title, description, children, accent }: { title: string; description?: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={cn('neu-raised rounded-lg p-6', accent && 'border-l-4 border-l-warning')}>
      <div className="mb-5">
        <h3 className="text-h3 font-semibold text-[var(--text-primary)]">{title}</h3>
        {description && <p className="text-body-sm text-[var(--text-secondary)] mt-1">{description}</p>}
      </div>
      {children}
    </motion.div>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

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


export function QuizForm({ initialValues, onSubmit, onCancel, isLoading = false, submitText = 'Create Quiz' }: QuizFormProps) {
  const { register, handleSubmit, control, watch, formState: { errors } } = useForm<QuizFormData>({
    resolver: zodResolver(quizFormSchema),
    defaultValues: { 
      ...defaultValues, 
      ...initialValues, 
      branding: { ...defaultValues.branding, ...initialValues?.branding },
      examSettings: { ...defaultValues.examSettings, ...initialValues?.examSettings },
    },
  });

  const quizType = watch('quizType') as QuizType;

  const onFormSubmit = async (data: QuizFormData) => {
    const cleanedData: QuizFormData = {
      title: data.title,
      description: data.description || '',
      quizType: data.quizType,
      branding: { primaryColor: data.branding.primaryColor, secondaryColor: data.branding.secondaryColor, logoUrl: data.branding.logoUrl || undefined },
    };
    if (data.quizType === 'ELIMINATION' && data.eliminationPercentage) cleanedData.eliminationPercentage = data.eliminationPercentage;
    if (data.quizType === 'FFI' && data.ffiWinnerCount) cleanedData.ffiWinnerCount = data.ffiWinnerCount;
    if (data.examSettings) cleanedData.examSettings = data.examSettings;
    await onSubmit(cleanedData);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      <FormSection title="Basic Information" description="Enter the quiz title and description">
        <div className="space-y-4">
          <Input label="Quiz Title" placeholder="Enter quiz title" error={errors.title?.message} {...register('title')} />
          <div>
            <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">Description</label>
            <textarea
              placeholder="Enter quiz description (optional)"
              className={cn(
                'w-full rounded-md p-4 min-h-[100px] resize-y bg-[var(--neu-bg)]',
                'shadow-[inset_3px_3px_6px_var(--shadow-dark),inset_-3px_-3px_6px_var(--shadow-light)]',
                'text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all duration-fast',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                errors.description && 'ring-2 ring-error ring-offset-2'
              )}
              {...register('description')}
            />
            {errors.description && <p className="mt-2 text-body-sm text-error" role="alert">{errors.description.message}</p>}
          </div>
        </div>
      </FormSection>

      <FormSection title="Quiz Type" description="Choose how the quiz will be scored">
        <div className="space-y-4">
          <Controller
            name="quizType"
            control={control}
            render={({ field }: { field: ControllerRenderProps<QuizFormData, 'quizType'> }) => (
              <div>
                <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">Type</label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger hasError={!!errors.quizType}><SelectValue placeholder="Select quiz type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REGULAR">Regular</SelectItem>
                    <SelectItem value="ELIMINATION">Elimination</SelectItem>
                    <SelectItem value="FFI">Fastest Finger First (FFI)</SelectItem>
                  </SelectContent>
                </Select>
                {errors.quizType && <p className="mt-2 text-body-sm text-error" role="alert">{errors.quizType.message}</p>}
              </div>
            )}
          />
          <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/10">
            <InfoIcon className="text-primary flex-shrink-0 mt-0.5" />
            <p className="text-body-sm text-[var(--text-secondary)]">{quizTypeDescriptions[quizType]}</p>
          </div>
          <AnimatePresence mode="wait">
            {quizType === 'ELIMINATION' && (
              <motion.div key="elimination" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                <Controller
                  name="eliminationPercentage"
                  control={control}
                  render={({ field }: { field: ControllerRenderProps<QuizFormData, 'eliminationPercentage'> }) => (
                    <div>
                      <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">Elimination Percentage</label>
                      <div className="flex items-center gap-4">
                        <input type="range" min={5} max={50} step={5} value={field.value || 20} onChange={(e) => field.onChange(Number(e.target.value))}
                          className="flex-1 h-2 rounded-full appearance-none cursor-pointer bg-[var(--neu-bg)] shadow-[inset_2px_2px_4px_var(--shadow-dark),inset_-2px_-2px_4px_var(--shadow-light)]"
                          style={{ accentColor: 'var(--primary)' }} />
                        <span className="text-body font-semibold text-primary min-w-[3rem] text-right">{field.value || 20}%</span>
                      </div>
                      <p className="mt-2 text-body-sm text-[var(--text-muted)]">Bottom {field.value || 20}% of participants will be eliminated after each question.</p>
                      {errors.eliminationPercentage && <p className="mt-2 text-body-sm text-error" role="alert">{errors.eliminationPercentage.message}</p>}
                    </div>
                  )}
                />
              </motion.div>
            )}
            {quizType === 'FFI' && (
              <motion.div key="ffi" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                <Controller
                  name="ffiWinnerCount"
                  control={control}
                  render={({ field }: { field: ControllerRenderProps<QuizFormData, 'ffiWinnerCount'> }) => (
                    <div>
                      <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">Winner Count per Question</label>
                      <div className="flex items-center gap-4">
                        <input type="range" min={1} max={10} step={1} value={field.value || 5} onChange={(e) => field.onChange(Number(e.target.value))}
                          className="flex-1 h-2 rounded-full appearance-none cursor-pointer bg-[var(--neu-bg)] shadow-[inset_2px_2px_4px_var(--shadow-dark),inset_-2px_-2px_4px_var(--shadow-light)]"
                          style={{ accentColor: 'var(--primary)' }} />
                        <span className="text-body font-semibold text-primary min-w-[3rem] text-right">{field.value || 5}</span>
                      </div>
                      <p className="mt-2 text-body-sm text-[var(--text-muted)]">Only the first {field.value || 5} participants with correct answers will earn points.</p>
                      {errors.ffiWinnerCount && <p className="mt-2 text-body-sm text-error" role="alert">{errors.ffiWinnerCount.message}</p>}
                    </div>
                  )}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </FormSection>

      <FormSection title="Branding" description="Customize the quiz appearance">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Controller name="branding.primaryColor" control={control} render={({ field }: { field: ControllerRenderProps<QuizFormData, 'branding.primaryColor'> }) => (
              <ColorPicker value={field.value} onChange={field.onChange} label="Primary Color" error={errors.branding?.primaryColor?.message} />
            )} />
            <Controller name="branding.secondaryColor" control={control} render={({ field }: { field: ControllerRenderProps<QuizFormData, 'branding.secondaryColor'> }) => (
              <ColorPicker value={field.value} onChange={field.onChange} label="Secondary Color" error={errors.branding?.secondaryColor?.message} />
            )} />
          </div>
          <Input label="Logo URL (Optional)" placeholder="https://example.com/logo.png" helperText="Enter a URL to your event or company logo" error={errors.branding?.logoUrl?.message} {...register('branding.logoUrl')} />
          <div className="mt-4">
            <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">Preview</label>
            <Controller name="branding" control={control} render={({ field }: { field: ControllerRenderProps<QuizFormData, 'branding'> }) => (
              <div className="h-16 rounded-md flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${field.value.primaryColor} 0%, ${field.value.secondaryColor} 100%)` }}>
                <span className="text-white font-semibold text-body-lg drop-shadow-md">Quiz Preview</span>
              </div>
            )} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Exam Settings" description="Configure exam-specific features like negative marking" accent>
        <div className="space-y-6">
          {/* Negative Marking Toggle */}
          <Controller
            name="examSettings.negativeMarkingEnabled"
            control={control}
            render={({ field }: { field: ControllerRenderProps<QuizFormData, 'examSettings.negativeMarkingEnabled'> }) => (
              <div className="space-y-3">
                <ToggleSwitch
                  checked={field.value ?? false}
                  onChange={field.onChange}
                  label="Negative Marking"
                  description="Deduct points for incorrect answers"
                />
                <AnimatePresence>
                  {field.value && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="pl-14 space-y-4"
                    >
                      <Controller
                        name="examSettings.negativeMarkingPercentage"
                        control={control}
                        render={({ field: percentField }: { field: ControllerRenderProps<QuizFormData, 'examSettings.negativeMarkingPercentage'> }) => (
                          <div>
                            <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-2">
                              Deduction Percentage
                            </label>
                            <div className="flex items-center gap-4">
                              <input
                                type="range"
                                min={5}
                                max={100}
                                step={5}
                                value={percentField.value ?? 25}
                                onChange={(e) => percentField.onChange(Number(e.target.value))}
                                className="flex-1 h-2 rounded-full appearance-none cursor-pointer bg-[var(--neu-bg)] shadow-[inset_2px_2px_4px_var(--shadow-dark),inset_-2px_-2px_4px_var(--shadow-light)]"
                                style={{ accentColor: 'var(--primary)' }}
                              />
                              <span className="text-body font-semibold text-primary min-w-[3rem] text-right">
                                {percentField.value ?? 25}%
                              </span>
                            </div>
                            <p className="mt-2 text-body-sm text-[var(--text-muted)]">
                              {percentField.value ?? 25}% of base points will be deducted for wrong answers.
                            </p>
                            {/* Live Preview */}
                            <div className="mt-3 p-3 rounded-md bg-error/5 border border-error/10">
                              <p className="text-body-sm text-[var(--text-secondary)]">
                                <span className="font-medium">Example:</span> For a 1000-point question, wrong answer deducts{' '}
                                <span className="font-semibold text-error">
                                  {Math.floor(1000 * (percentField.value ?? 25) / 100)} points
                                </span>
                              </p>
                            </div>
                          </div>
                        )}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          />

          {/* Focus Monitoring Toggle */}
          <Controller
            name="examSettings.focusMonitoringEnabled"
            control={control}
            render={({ field }: { field: ControllerRenderProps<QuizFormData, 'examSettings.focusMonitoringEnabled'> }) => (
              <ToggleSwitch
                checked={field.value ?? false}
                onChange={field.onChange}
                label="Focus Monitoring"
                description="Track when participants switch tabs or leave the quiz window"
              />
            )}
          />

          {/* Skip Reveal Phase Toggle */}
          <Controller
            name="examSettings.skipRevealPhase"
            control={control}
            render={({ field }: { field: ControllerRenderProps<QuizFormData, 'examSettings.skipRevealPhase'> }) => (
              <ToggleSwitch
                checked={field.value ?? false}
                onChange={field.onChange}
                label="Skip Reveal Phase"
                description="Skip the answer reveal between questions. Participants see results only after the quiz ends."
              />
            )}
          />

          {/* Auto-Advance Toggle */}
          <Controller
            name="examSettings.autoAdvance"
            control={control}
            render={({ field }: { field: ControllerRenderProps<QuizFormData, 'examSettings.autoAdvance'> }) => (
              <ToggleSwitch
                checked={field.value ?? false}
                onChange={field.onChange}
                label="Auto-Advance Questions"
                description="Automatically advance to the next question when the timer expires. No controller intervention needed."
              />
            )}
          />

          <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/10">
            <InfoIcon className="text-primary flex-shrink-0 mt-0.5" />
            <p className="text-body-sm text-[var(--text-secondary)]">
              Exam settings apply to all questions in this quiz. Individual questions can override negative marking settings.
            </p>
          </div>
        </div>
      </FormSection>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isLoading} className="sm:flex-1">Cancel</Button>
        <Button type="submit" variant="primary" isLoading={isLoading} className="sm:flex-1">{submitText}</Button>
      </motion.div>
    </form>
  );
}

export default QuizForm;
