/**
 * Nickname Input Component
 * 
 * Input field for entering a participant nickname with validation.
 * Includes client-side profanity check and character limits.
 * 
 * Mobile-first design optimized for 320px-428px width:
 * - Touch-friendly input (min 44px height)
 * - 16px font size to prevent iOS zoom on focus
 * - Responsive sizing for small screens
 * 
 * Requirements: 3.3, 14.1, 14.9
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface NicknameInputProps {
  /** Current nickname value */
  value: string;
  /** Callback when nickname changes */
  onChange: (nickname: string) => void;
  /** Error message to display */
  error?: string | null;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Callback when Enter is pressed */
  onSubmit?: () => void;
}

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

/**
 * Basic profanity word list for client-side validation
 * This is a minimal list - the server has a more comprehensive filter
 */
const PROFANITY_WORDS = [
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'crap', 'dick', 'cock',
  'pussy', 'cunt', 'bastard', 'slut', 'whore', 'nigger', 'faggot',
];

/**
 * Normalize text for profanity checking
 * Handles common leetspeak substitutions
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/[^a-z]/g, '');
}

/**
 * Check if text contains profanity (client-side basic check)
 */
function containsProfanity(text: string): boolean {
  const normalized = normalizeText(text);
  return PROFANITY_WORDS.some((word) => normalized.includes(word));
}

/**
 * Validate nickname and return error message if invalid
 */
export function validateNickname(nickname: string): string | null {
  const trimmed = nickname.trim();
  
  if (trimmed.length < MIN_LENGTH) {
    return `Nickname must be at least ${MIN_LENGTH} characters`;
  }
  
  if (trimmed.length > MAX_LENGTH) {
    return `Nickname must be at most ${MAX_LENGTH} characters`;
  }
  
  if (containsProfanity(trimmed)) {
    return 'Nickname contains inappropriate content';
  }
  
  // Check for valid characters (alphanumeric, spaces, underscores, hyphens)
  if (!/^[a-zA-Z0-9\s_-]+$/.test(trimmed)) {
    return 'Nickname can only contain letters, numbers, spaces, underscores, and hyphens';
  }
  
  return null;
}

/**
 * NicknameInput component
 * 
 * A styled input for entering nicknames with real-time validation feedback.
 */
export function NicknameInput({
  value,
  onChange,
  error,
  disabled = false,
  onSubmit,
}: NicknameInputProps) {
  const [isFocused, setIsFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const charCount = value.length;
  const isNearLimit = charCount >= MAX_LENGTH - 3;
  const isAtLimit = charCount >= MAX_LENGTH;

  /**
   * Handle input change
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    
    // Enforce max length
    if (newValue.length <= MAX_LENGTH) {
      onChange(newValue);
    }
  };

  /**
   * Handle key down for Enter submission
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="w-full">
      {/* Label */}
      <label
        htmlFor="nickname-input"
        className="block text-sm font-medium text-[var(--text-primary)] mb-1.5 sm:mb-2"
      >
        Choose your nickname
      </label>

      {/* Input container */}
      <div className="relative">
        <input
          ref={inputRef}
          id="nickname-input"
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          placeholder="Enter your nickname"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={error ? 'nickname-error' : 'nickname-helper'}
          className={cn(
            // Base styles - Touch-friendly with 16px font to prevent iOS zoom
            'w-full h-12 sm:h-14 px-3 sm:px-4',
            'text-base sm:text-lg', // 16px minimum to prevent iOS zoom
            'rounded-lg',
            'bg-[var(--neu-bg)]',
            'text-[var(--text-primary)]',
            'placeholder:text-[var(--text-muted)]',
            'transition-all duration-fast',
            // Touch-friendly utilities
            'touch-action-manipulation tap-highlight-none',
            // Neumorphic inset style
            'shadow-[inset_3px_3px_6px_var(--shadow-dark),inset_-3px_-3px_6px_var(--shadow-light)]',
            // Focus state
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
            // Error state
            error && 'ring-2 ring-error ring-offset-2 focus:ring-error',
            // Disabled state
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />

        {/* Character counter */}
        <div
          className={cn(
            'absolute right-2 sm:right-3 top-1/2 -translate-y-1/2',
            'text-xs font-medium',
            'transition-colors duration-fast',
            isAtLimit
              ? 'text-error'
              : isNearLimit
              ? 'text-warning'
              : 'text-[var(--text-muted)]',
            !isFocused && !value && 'opacity-0'
          )}
        >
          {charCount}/{MAX_LENGTH}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p
          id="nickname-error"
          className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Helper text */}
      {!error && (
        <p
          id="nickname-helper"
          className="mt-1.5 sm:mt-2 text-xs text-[var(--text-muted)]"
        >
          {MIN_LENGTH}-{MAX_LENGTH} characters, letters and numbers only
        </p>
      )}
    </div>
  );
}
