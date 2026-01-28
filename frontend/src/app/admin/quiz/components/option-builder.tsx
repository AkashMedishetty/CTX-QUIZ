/**
 * Option Builder Component
 * 
 * A component for building quiz answer options with:
 * - Option text input
 * - Image upload support
 * - Correct answer marking
 * - Drag-and-drop reordering
 * 
 * Requirements: 1.2, 1.4, 1.5
 */

'use client';

import * as React from 'react';
import { AnimatePresence, Reorder } from 'framer-motion';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Option data interface
 */
export interface OptionData {
  id: string;
  optionText: string;
  optionImageUrl?: string;
  isCorrect: boolean;
}

/**
 * Option Builder Props
 */
export interface OptionBuilderProps {
  /** Array of options */
  options: OptionData[];
  /** Callback when options change */
  onChange: (options: OptionData[]) => void;
  /** Question type - affects correct answer selection */
  questionType: 'MULTIPLE_CHOICE' | 'MULTI_SELECT' | 'TRUE_FALSE';
  /** Error message */
  error?: string;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * Single Option Item Props
 */
interface OptionItemProps {
  option: OptionData;
  index: number;
  onUpdate: (id: string, updates: Partial<OptionData>) => void;
  onRemove: (id: string) => void;
  onToggleCorrect: (id: string) => void;
  canRemove: boolean;
  disabled?: boolean;
}

/**
 * Generate unique ID for options
 */
function generateOptionId(): string {
  return `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Option labels (A, B, C, D, etc.)
 */
const OPTION_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Icons
function DragHandleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="5" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="19" r="1" fill="currentColor" />
      <circle cx="15" cy="5" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="19" r="1" fill="currentColor" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
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

/**
 * Single Option Item Component
 */
function OptionItem({
  option,
  index,
  onUpdate,
  onRemove,
  onToggleCorrect,
  canRemove,
  disabled,
}: OptionItemProps) {
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return;
    }

    setIsUploading(true);
    try {
      // Create FormData and upload
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload/image', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        onUpdate(option.id, { optionImageUrl: data.imageUrl });
      }
    } catch (error) {
      console.error('Image upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = () => {
    onUpdate(option.id, { optionImageUrl: undefined });
  };

  const label = OPTION_LABELS[index] || `${index + 1}`;

  return (
    <Reorder.Item
      value={option}
      id={option.id}
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg',
        'bg-[var(--neu-bg)]',
        'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]',
        'transition-all duration-fast',
        option.isCorrect && 'ring-2 ring-success ring-offset-2',
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

      {/* Option Label */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          'font-semibold text-body-sm',
          option.isCorrect
            ? 'bg-success text-white'
            : 'bg-[var(--neu-surface)] text-[var(--text-secondary)]',
          'shadow-[inset_2px_2px_4px_var(--shadow-dark),inset_-2px_-2px_4px_var(--shadow-light)]'
        )}
      >
        {label}
      </div>

      {/* Option Content */}
      <div className="flex-1 space-y-3">
        {/* Option Text Input */}
        <Input
          value={option.optionText}
          onChange={(e) => onUpdate(option.id, { optionText: e.target.value })}
          placeholder={`Option ${label} text...`}
          disabled={disabled}
          size="sm"
        />

        {/* Option Image */}
        {option.optionImageUrl ? (
          <div className="relative inline-block">
            <img
              src={option.optionImageUrl}
              alt={`Option ${label} image`}
              className="max-h-24 rounded-md object-cover"
            />
            <button
              type="button"
              onClick={handleRemoveImage}
              disabled={disabled}
              className={cn(
                'absolute -top-2 -right-2 w-6 h-6 rounded-full',
                'bg-error text-white flex items-center justify-center',
                'shadow-md hover:bg-error-light transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed'
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
              disabled={disabled || isUploading}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-body-sm',
                'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                'bg-[var(--neu-surface)] hover:bg-[var(--neu-bg)]',
                'transition-all duration-fast',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <ImageIcon />
              {isUploading ? 'Uploading...' : 'Add Image'}
            </button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {/* Mark as Correct Button */}
        <button
          type="button"
          onClick={() => onToggleCorrect(option.id)}
          disabled={disabled}
          title={option.isCorrect ? 'Unmark as correct' : 'Mark as correct'}
          className={cn(
            'w-10 h-10 rounded-md flex items-center justify-center',
            'transition-all duration-fast',
            option.isCorrect
              ? 'bg-success text-white shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]'
              : 'bg-[var(--neu-bg)] text-[var(--text-muted)] hover:text-success',
            !option.isCorrect && 'shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
            !option.isCorrect && 'hover:shadow-[1px_1px_2px_var(--shadow-dark),-1px_-1px_2px_var(--shadow-light)]',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <CheckIcon />
        </button>

        {/* Remove Button */}
        <button
          type="button"
          onClick={() => onRemove(option.id)}
          disabled={disabled || !canRemove}
          title="Remove option"
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
 * Option Builder Component
 * 
 * A component for building quiz answer options with drag-and-drop reordering.
 * 
 * @example
 * ```tsx
 * <OptionBuilder
 *   options={options}
 *   onChange={setOptions}
 *   questionType="MULTIPLE_CHOICE"
 * />
 * ```
 */
export function OptionBuilder({
  options,
  onChange,
  questionType,
  error,
  disabled = false,
}: OptionBuilderProps) {
  // Add new option
  const handleAddOption = () => {
    const newOption: OptionData = {
      id: generateOptionId(),
      optionText: '',
      isCorrect: false,
    };
    onChange([...options, newOption]);
  };

  // Update option
  const handleUpdateOption = (id: string, updates: Partial<OptionData>) => {
    onChange(
      options.map((opt) => (opt.id === id ? { ...opt, ...updates } : opt))
    );
  };

  // Remove option
  const handleRemoveOption = (id: string) => {
    onChange(options.filter((opt) => opt.id !== id));
  };

  // Toggle correct answer
  const handleToggleCorrect = (id: string) => {
    if (questionType === 'MULTIPLE_CHOICE' || questionType === 'TRUE_FALSE') {
      // Single correct answer - unmark others
      onChange(
        options.map((opt) => ({
          ...opt,
          isCorrect: opt.id === id ? !opt.isCorrect : false,
        }))
      );
    } else {
      // Multi-select - toggle individual option
      onChange(
        options.map((opt) =>
          opt.id === id ? { ...opt, isCorrect: !opt.isCorrect } : opt
        )
      );
    }
  };

  // Handle reorder
  const handleReorder = (newOrder: OptionData[]) => {
    onChange(newOrder);
  };

  // Minimum options based on question type
  const minOptions = questionType === 'TRUE_FALSE' ? 2 : 2;
  const maxOptions = questionType === 'TRUE_FALSE' ? 2 : 10;
  const canAddMore = options.length < maxOptions;
  const canRemove = options.length > minOptions;

  // Count correct answers
  const correctCount = options.filter((opt) => opt.isCorrect).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-body font-medium text-[var(--text-primary)]">
            Answer Options
          </h4>
          <p className="text-body-sm text-[var(--text-muted)]">
            {questionType === 'MULTI_SELECT'
              ? 'Select all correct answers'
              : 'Select the correct answer'}
            {' • '}
            {correctCount} correct
          </p>
        </div>
        {canAddMore && questionType !== 'TRUE_FALSE' && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddOption}
            disabled={disabled}
            leftIcon={<PlusIcon />}
          >
            Add Option
          </Button>
        )}
      </div>

      {/* Options List */}
      <Reorder.Group
        axis="y"
        values={options}
        onReorder={handleReorder}
        className="space-y-3"
      >
        <AnimatePresence initial={false}>
          {options.map((option, index) => (
            <OptionItem
              key={option.id}
              option={option}
              index={index}
              onUpdate={handleUpdateOption}
              onRemove={handleRemoveOption}
              onToggleCorrect={handleToggleCorrect}
              canRemove={canRemove}
              disabled={disabled}
            />
          ))}
        </AnimatePresence>
      </Reorder.Group>

      {/* Error Message */}
      {error && (
        <p className="text-body-sm text-error" role="alert">
          {error}
        </p>
      )}

      {/* Helper Text */}
      {!error && (
        <p className="text-body-sm text-[var(--text-muted)]">
          Drag options to reorder. Click the checkmark to mark as correct.
        </p>
      )}
    </div>
  );
}

export default OptionBuilder;
