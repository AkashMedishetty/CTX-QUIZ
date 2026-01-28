/**
 * Join Code Input Component
 * 
 * A 6-character input for entering quiz join codes.
 * Features auto-uppercase, character-by-character input boxes,
 * and neumorphic styling.
 * 
 * Mobile-first design optimized for 320px-428px width:
 * - Touch-friendly input boxes (min 44px tap targets)
 * - 16px font size to prevent iOS zoom on focus
 * - Responsive sizing for small screens
 * 
 * Requirements: 3.1, 3.2, 14.1, 14.9
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface JoinCodeInputProps {
  /** Current join code value */
  value: string;
  /** Callback when code changes */
  onChange: (code: string) => void;
  /** Callback when all 6 characters are entered - receives the complete code */
  onComplete?: (code: string) => void;
  /** Error message to display */
  error?: string | null;
  /** Whether the input is disabled */
  disabled?: boolean;
}

const CODE_LENGTH = 6;

/**
 * JoinCodeInput component
 * 
 * Displays 6 individual input boxes for entering a join code.
 * Supports keyboard navigation, paste, and auto-advance.
 */
export function JoinCodeInput({
  value,
  onChange,
  onComplete,
  error,
  disabled = false,
}: JoinCodeInputProps) {
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  // Split value into individual characters
  const chars = value.toUpperCase().split('').slice(0, CODE_LENGTH);
  while (chars.length < CODE_LENGTH) {
    chars.push('');
  }

  /**
   * Handle input change for a specific position
   */
  const handleChange = (index: number, inputValue: string) => {
    // Only allow alphanumeric characters
    const char = inputValue.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
    
    if (char) {
      const newChars = [...chars];
      newChars[index] = char;
      const newCode = newChars.join('');
      onChange(newCode);

      // Auto-advance to next input
      if (index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      } else if (newCode.length === CODE_LENGTH) {
        // All characters entered, trigger complete with the code
        onComplete?.(newCode);
      }
    }
  };

  /**
   * Handle key down events for navigation
   */
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newChars = [...chars];
      
      if (chars[index]) {
        // Clear current character
        newChars[index] = '';
        onChange(newChars.join(''));
      } else if (index > 0) {
        // Move to previous input and clear it
        newChars[index - 1] = '';
        onChange(newChars.join(''));
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter' && value.length === CODE_LENGTH) {
      e.preventDefault();
      onComplete?.(value);
    }
  };

  /**
   * Handle paste event
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const cleanedCode = pastedText.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
    
    if (cleanedCode) {
      onChange(cleanedCode);
      
      // Focus the appropriate input
      const focusIndex = Math.min(cleanedCode.length, CODE_LENGTH - 1);
      inputRefs.current[focusIndex]?.focus();
      
      if (cleanedCode.length === CODE_LENGTH) {
        onComplete?.(cleanedCode);
      }
    }
  };

  /**
   * Handle focus - select all text in the input
   */
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-1.5 xs:gap-2 sm:gap-3">
        {chars.map((char, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={1}
            value={char}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={handleFocus}
            disabled={disabled}
            aria-label={`Join code character ${index + 1}`}
            aria-invalid={!!error}
            className={cn(
              // Base styles - Touch-friendly sizing
              'w-10 h-12 xs:w-11 xs:h-14 sm:w-12 sm:h-16',
              'text-center text-lg xs:text-xl sm:text-2xl font-mono font-bold',
              'rounded-lg',
              'bg-[var(--neu-bg)]',
              'text-[var(--text-primary)]',
              'transition-all duration-fast',
              // Touch-friendly utilities
              'touch-action-manipulation tap-highlight-none',
              // Neumorphic inset style
              'shadow-[inset_3px_3px_6px_var(--shadow-dark),inset_-3px_-3px_6px_var(--shadow-light)]',
              // Focus state
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
              // Error state
              error && 'ring-2 ring-error ring-offset-2',
              // Disabled state
              disabled && 'opacity-50 cursor-not-allowed',
              // Filled state - subtle highlight
              char && 'bg-[var(--neu-surface)]'
            )}
          />
        ))}
      </div>
      
      {/* Helper text */}
      <p className="mt-2 sm:mt-3 text-xs text-[var(--text-muted)] text-center px-2">
        Enter the 6-character code shown on screen
      </p>
    </div>
  );
}
