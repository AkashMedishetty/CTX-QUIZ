/**
 * Input Component - Neumorphic styled input
 * 
 * A tactile, neumorphic input component with inset styling.
 * Supports various input types and states.
 * 
 * Requirements: 14.1, 14.2
 */

'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Input variants using class-variance-authority
 */
const inputVariants = cva(
  // Base styles - inset/pressed appearance
  [
    'w-full rounded-md',
    'bg-[var(--neu-bg)]',
    'shadow-[inset_3px_3px_6px_var(--shadow-dark),inset_-3px_-3px_6px_var(--shadow-light)]',
    'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
    'transition-all duration-fast',
    'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ],
  {
    variants: {
      size: {
        sm: 'h-9 px-3 text-body-sm',
        md: 'h-11 px-4 text-body',
        lg: 'h-14 px-5 text-body-lg',
      },
      hasError: {
        true: 'ring-2 ring-error ring-offset-2 focus:ring-error',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      hasError: false,
    },
  }
);


/**
 * Input component props
 */
export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  /** Label text */
  label?: string;
  /** Helper text below the input */
  helperText?: string;
  /** Error message (also sets hasError state) */
  error?: string;
  /** Icon to display on the left */
  leftIcon?: React.ReactNode;
  /** Icon to display on the right */
  rightIcon?: React.ReactNode;
  /** Container className */
  containerClassName?: string;
}

/**
 * Input component
 * 
 * A neumorphic input with inset styling that appears carved into the surface.
 * 
 * @example
 * ```tsx
 * // Basic input
 * <Input placeholder="Enter your name" />
 * 
 * // With label and helper text
 * <Input 
 *   label="Email" 
 *   placeholder="you@example.com"
 *   helperText="We'll never share your email"
 * />
 * 
 * // With error
 * <Input 
 *   label="Password" 
 *   type="password"
 *   error="Password must be at least 8 characters"
 * />
 * 
 * // With icons
 * <Input 
 *   leftIcon={<SearchIcon />}
 *   placeholder="Search..."
 * />
 * ```
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      size,
      hasError,
      label,
      helperText,
      error,
      leftIcon,
      rightIcon,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const hasErrorState = hasError || !!error;

    return (
      <div className={cn('w-full', containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-body-sm font-medium text-[var(--text-primary)] mb-2"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              inputVariants({ size, hasError: hasErrorState }),
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              className
            )}
            aria-invalid={hasErrorState}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p
            id={`${inputId}-error`}
            className="mt-2 text-body-sm text-error"
            role="alert"
          >
            {error}
          </p>
        )}
        {helperText && !error && (
          <p
            id={`${inputId}-helper`}
            className="mt-2 text-body-sm text-[var(--text-muted)]"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input, inputVariants };
