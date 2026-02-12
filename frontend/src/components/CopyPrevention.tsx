/**
 * CopyPrevention Component
 * 
 * A wrapper component that prevents copying of quiz content through various methods:
 * - Disables text selection via CSS (user-select: none)
 * - Prevents copy keyboard shortcuts (Ctrl+C, Cmd+C)
 * - Prevents right-click context menu
 * - Prevents drag-and-drop of text content
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4
 * Property 10: Copy Prevention Enforcement
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Props for the CopyPrevention component
 */
export interface CopyPreventionProps {
  /** Content to protect from copying */
  children: React.ReactNode;
  /** Whether copy prevention is enabled (default: true) */
  enabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * CopyPrevention component
 * 
 * Wraps quiz content and prevents all forms of copying to protect
 * quiz content during exams.
 * 
 * @example
 * ```tsx
 * // Basic usage
 * <CopyPrevention>
 *   <p>This text cannot be copied</p>
 * </CopyPrevention>
 * 
 * // Conditionally enabled
 * <CopyPrevention enabled={isExamMode}>
 *   <QuestionContent />
 * </CopyPrevention>
 * ```
 */
export function CopyPrevention({
  children,
  enabled = true,
  className,
}: CopyPreventionProps): JSX.Element {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    /**
     * Prevent copy keyboard shortcuts (Ctrl+C, Cmd+C)
     * Validates: Requirement 7.2
     */
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+C (Windows/Linux) or Cmd+C (Mac)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        event.stopPropagation();
      }
      
      // Also prevent Ctrl+A (select all) to make copying harder
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    /**
     * Prevent right-click context menu
     * Validates: Requirement 7.3
     */
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    /**
     * Prevent copy event
     * Validates: Requirement 7.2
     */
    const handleCopy = (event: ClipboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      // Clear clipboard data to ensure nothing is copied
      if (event.clipboardData) {
        event.clipboardData.setData('text/plain', '');
      }
    };

    /**
     * Prevent drag start for text content
     * Validates: Requirement 7.4
     */
    const handleDragStart = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    /**
     * Prevent drop events
     * Validates: Requirement 7.4
     */
    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    /**
     * Prevent drag over to disable drop zone
     * Validates: Requirement 7.4
     */
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    /**
     * Prevent selection start
     * Validates: Requirement 7.1
     */
    const handleSelectStart = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    // Add event listeners to the container
    container.addEventListener('keydown', handleKeyDown);
    container.addEventListener('contextmenu', handleContextMenu);
    container.addEventListener('copy', handleCopy);
    container.addEventListener('dragstart', handleDragStart);
    container.addEventListener('drop', handleDrop);
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('selectstart', handleSelectStart);

    // Cleanup event listeners on unmount or when disabled
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('contextmenu', handleContextMenu);
      container.removeEventListener('copy', handleCopy);
      container.removeEventListener('dragstart', handleDragStart);
      container.removeEventListener('drop', handleDrop);
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('selectstart', handleSelectStart);
    };
  }, [enabled]);

  return (
    <div
      ref={containerRef}
      className={cn(
        // Base styles
        'copy-prevention',
        // Disable text selection via CSS (Requirement 7.1)
        enabled && [
          'select-none',
          // Additional CSS properties for broader browser support
          '[user-select:none]',
          '[-webkit-user-select:none]',
          '[-moz-user-select:none]',
          '[-ms-user-select:none]',
          // Disable touch callout on iOS
          '[-webkit-touch-callout:none]',
          // Disable text dragging
          '[user-drag:none]',
          '[-webkit-user-drag:none]',
        ],
        className
      )}
      // Disable dragging at the element level
      draggable={enabled ? false : undefined}
      // Make the container focusable to capture keyboard events
      tabIndex={enabled ? 0 : undefined}
      // Accessibility: indicate that content is protected
      aria-label={enabled ? 'Protected content - copying disabled' : undefined}
    >
      {children}
    </div>
  );
}

export default CopyPrevention;
