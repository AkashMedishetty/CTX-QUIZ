/**
 * Button Component - Neumorphic styled button
 * 
 * A tactile, neumorphic button component with multiple variants.
 * Supports primary, secondary, ghost, success, and danger styles.
 * 
 * Requirements: 14.1, 14.2
 */

'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Button variants using class-variance-authority
 */
const buttonVariants = cva(
  // Base styles
  [
    'inline-flex items-center justify-center gap-2',
    'font-medium rounded-md',
    'transition-all duration-fast',
    'min-h-[44px] min-w-[44px]', // Touch-friendly
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    'active:scale-[0.98]',
  ],
  {
    variants: {
      variant: {
        // Primary - CTX Teal with neumorphic effect
        primary: [
          'bg-primary text-white',
          'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]',
          'hover:bg-primary-light hover:shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
          'active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2),inset_-2px_-2px_4px_rgba(255,255,255,0.1)]',
          'focus-visible:ring-primary',
        ],
        // Secondary - Neutral neumorphic
        secondary: [
          'bg-[var(--neu-bg)] text-[var(--text-primary)]',
          'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]',
          'hover:shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
          'active:shadow-[inset_2px_2px_4px_var(--shadow-dark),inset_-2px_-2px_4px_var(--shadow-light)]',
          'focus-visible:ring-primary',
        ],
        // Ghost - Flat with subtle hover
        ghost: [
          'bg-transparent text-[var(--text-primary)]',
          'hover:bg-[var(--neu-surface)]',
          'hover:shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
          'active:shadow-[inset_2px_2px_4px_var(--shadow-dark),inset_-2px_-2px_4px_var(--shadow-light)]',
          'focus-visible:ring-primary',
        ],
        // Outline - Border with neumorphic hover
        outline: [
          'bg-transparent text-primary border-2 border-primary',
          'hover:bg-primary hover:text-white',
          'hover:shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
          'active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]',
          'focus-visible:ring-primary',
        ],
        // Success - Green neumorphic
        success: [
          'bg-success text-white',
          'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]',
          'hover:bg-success-light hover:shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
          'active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]',
          'focus-visible:ring-success',
        ],
        // Danger - Red neumorphic
        danger: [
          'bg-error text-white',
          'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]',
          'hover:bg-error-light hover:shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
          'active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]',
          'focus-visible:ring-error',
        ],
        // Warning - Amber/Orange neumorphic
        warning: [
          'bg-warning text-white',
          'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]',
          'hover:brightness-110 hover:shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
          'active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]',
          'focus-visible:ring-warning',
        ],
        // Accent - CTX accent purple (use sparingly)
        accent: [
          'bg-accent text-white',
          'shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)]',
          'hover:bg-accent-light hover:shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]',
          'active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]',
          'focus-visible:ring-accent',
        ],
      },
      size: {
        sm: 'h-9 px-3 text-body-sm',
        md: 'h-11 px-5 text-body',
        lg: 'h-14 px-8 text-body-lg',
        xl: 'h-16 px-10 text-h3',
        icon: 'h-11 w-11 p-0',
        'icon-sm': 'h-9 w-9 p-0',
        'icon-lg': 'h-14 w-14 p-0',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  }
);

/**
 * Button component props
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Loading state - shows spinner and disables button */
  isLoading?: boolean;
  /** Icon to display before the button text */
  leftIcon?: React.ReactNode;
  /** Icon to display after the button text */
  rightIcon?: React.ReactNode;
  /** Render as a different element (for links styled as buttons) */
  asChild?: boolean;
}

/**
 * Loading spinner component
 */
const LoadingSpinner = () => (
  <svg
    className="animate-spin h-4 w-4"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

/**
 * Button component
 * 
 * A neumorphic button with tactile feedback and multiple variants.
 * 
 * @example
 * ```tsx
 * // Primary button
 * <Button>Click me</Button>
 * 
 * // Secondary button with icon
 * <Button variant="secondary" leftIcon={<Icon />}>
 *   With Icon
 * </Button>
 * 
 * // Loading state
 * <Button isLoading>Submitting...</Button>
 * 
 * // Full width
 * <Button fullWidth>Full Width Button</Button>
 * ```
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <LoadingSpinner />
            <span>{children}</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
