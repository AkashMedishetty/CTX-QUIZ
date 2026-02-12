/**
 * CopyPrevention Component Tests
 * 
 * Tests for the CopyPrevention component covering:
 * - Text selection prevention via CSS
 * - Copy keyboard shortcuts prevention (Ctrl+C, Cmd+C)
 * - Right-click context menu prevention
 * - Drag-and-drop prevention
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4
 * Property 10: Copy Prevention Enforcement
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CopyPrevention } from '../CopyPrevention';

// Polyfill ClipboardEvent for JSDOM
class MockClipboardEvent extends Event {
  clipboardData: DataTransfer | null;
  
  constructor(type: string, eventInitDict?: EventInit & { clipboardData?: DataTransfer | null }) {
    super(type, eventInitDict);
    this.clipboardData = eventInitDict?.clipboardData || null;
  }
}

// Polyfill DragEvent for JSDOM
class MockDragEvent extends MouseEvent {
  dataTransfer: DataTransfer | null;
  
  constructor(type: string, eventInitDict?: MouseEventInit & { dataTransfer?: DataTransfer | null }) {
    super(type, eventInitDict);
    this.dataTransfer = eventInitDict?.dataTransfer || null;
  }
}

// Assign to global
(global as unknown as { ClipboardEvent: typeof MockClipboardEvent }).ClipboardEvent = MockClipboardEvent;
(global as unknown as { DragEvent: typeof MockDragEvent }).DragEvent = MockDragEvent;

// Mock the cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | boolean | undefined | null | string[])[]) => {
    return classes
      .flat()
      .filter((c): c is string => typeof c === 'string' && c.length > 0)
      .join(' ');
  },
}));

describe('CopyPrevention', () => {
  describe('rendering', () => {
    it('should render children correctly', () => {
      render(
        <CopyPrevention>
          <p data-testid="content">Protected content</p>
        </CopyPrevention>
      );

      expect(screen.getByTestId('content')).toBeInTheDocument();
      expect(screen.getByText('Protected content')).toBeInTheDocument();
    });

    it('should apply copy prevention classes when enabled', () => {
      const { container } = render(
        <CopyPrevention enabled={true}>
          <p>Protected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('select-none');
      expect(wrapper).toHaveClass('copy-prevention');
    });

    it('should not apply copy prevention classes when disabled', () => {
      const { container } = render(
        <CopyPrevention enabled={false}>
          <p>Unprotected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).not.toHaveClass('select-none');
      expect(wrapper).toHaveClass('copy-prevention');
    });

    it('should apply custom className', () => {
      const { container } = render(
        <CopyPrevention className="custom-class">
          <p>Content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('custom-class');
    });

    it('should set draggable to false when enabled', () => {
      const { container } = render(
        <CopyPrevention enabled={true}>
          <p>Content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveAttribute('draggable', 'false');
    });

    it('should not set draggable when disabled', () => {
      const { container } = render(
        <CopyPrevention enabled={false}>
          <p>Content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).not.toHaveAttribute('draggable');
    });
  });

  describe('keyboard shortcut prevention (Requirement 7.2)', () => {
    it('should prevent Ctrl+C keyboard shortcut', () => {
      const { container } = render(
        <CopyPrevention>
          <p>Protected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      expect(prevented).toBe(true);
    });

    it('should prevent Cmd+C keyboard shortcut (Mac)', () => {
      const { container } = render(
        <CopyPrevention>
          <p>Protected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new KeyboardEvent('keydown', {
        key: 'c',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      expect(prevented).toBe(true);
    });

    it('should prevent Ctrl+A (select all) keyboard shortcut', () => {
      const { container } = render(
        <CopyPrevention>
          <p>Protected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      expect(prevented).toBe(true);
    });

    it('should allow other keyboard shortcuts when enabled', () => {
      const { container } = render(
        <CopyPrevention>
          <p>Protected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new KeyboardEvent('keydown', {
        key: 'b',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      // Other shortcuts should not be prevented
      expect(prevented).toBe(false);
    });

    it('should not prevent keyboard shortcuts when disabled', () => {
      const { container } = render(
        <CopyPrevention enabled={false}>
          <p>Unprotected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      expect(prevented).toBe(false);
    });
  });

  describe('context menu prevention (Requirement 7.3)', () => {
    it('should prevent right-click context menu', () => {
      const { container } = render(
        <CopyPrevention>
          <p>Protected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      expect(prevented).toBe(true);
    });

    it('should not prevent context menu when disabled', () => {
      const { container } = render(
        <CopyPrevention enabled={false}>
          <p>Unprotected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      expect(prevented).toBe(false);
    });
  });

  describe('copy event prevention (Requirement 7.2)', () => {
    it('should prevent copy event', () => {
      const { container } = render(
        <CopyPrevention>
          <p>Protected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new ClipboardEvent('copy', {
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      expect(prevented).toBe(true);
    });

    it('should not prevent copy event when disabled', () => {
      const { container } = render(
        <CopyPrevention enabled={false}>
          <p>Unprotected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new ClipboardEvent('copy', {
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      expect(prevented).toBe(false);
    });
  });

  describe('drag-and-drop prevention (Requirement 7.4)', () => {
    it('should prevent dragstart event', () => {
      const { container } = render(
        <CopyPrevention>
          <p>Protected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      expect(prevented).toBe(true);
    });

    it('should prevent drop event', () => {
      const { container } = render(
        <CopyPrevention>
          <p>Protected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      expect(prevented).toBe(true);
    });

    it('should prevent dragover event', () => {
      const { container } = render(
        <CopyPrevention>
          <p>Protected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      expect(prevented).toBe(true);
    });

    it('should not prevent drag events when disabled', () => {
      const { container } = render(
        <CopyPrevention enabled={false}>
          <p>Unprotected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
      });
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      });

      expect(wrapper.dispatchEvent(dragStartEvent)).toBe(true);
      expect(wrapper.dispatchEvent(dropEvent)).toBe(true);
    });
  });

  describe('text selection prevention (Requirement 7.1)', () => {
    it('should prevent selectstart event', () => {
      const { container } = render(
        <CopyPrevention>
          <p>Protected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new Event('selectstart', {
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      expect(prevented).toBe(true);
    });

    it('should not prevent selectstart when disabled', () => {
      const { container } = render(
        <CopyPrevention enabled={false}>
          <p>Unprotected content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      const event = new Event('selectstart', {
        bubbles: true,
        cancelable: true,
      });

      const prevented = !wrapper.dispatchEvent(event);
      expect(prevented).toBe(false);
    });
  });

  describe('enabled prop toggling', () => {
    it('should add event listeners when enabled changes from false to true', () => {
      const { container, rerender } = render(
        <CopyPrevention enabled={false}>
          <p>Content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;

      // Initially disabled - events should not be prevented
      let event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      });
      expect(wrapper.dispatchEvent(event)).toBe(true);

      // Re-render with enabled=true
      rerender(
        <CopyPrevention enabled={true}>
          <p>Content</p>
        </CopyPrevention>
      );

      // Now events should be prevented
      event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      });
      expect(wrapper.dispatchEvent(event)).toBe(false);
    });

    it('should remove event listeners when enabled changes from true to false', () => {
      const { container, rerender } = render(
        <CopyPrevention enabled={true}>
          <p>Content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;

      // Initially enabled - events should be prevented
      let event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      });
      expect(wrapper.dispatchEvent(event)).toBe(false);

      // Re-render with enabled=false
      rerender(
        <CopyPrevention enabled={false}>
          <p>Content</p>
        </CopyPrevention>
      );

      // Now events should not be prevented
      event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      });
      expect(wrapper.dispatchEvent(event)).toBe(true);
    });
  });

  describe('accessibility', () => {
    it('should have aria-label when enabled', () => {
      const { container } = render(
        <CopyPrevention enabled={true}>
          <p>Content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveAttribute(
        'aria-label',
        'Protected content - copying disabled'
      );
    });

    it('should not have aria-label when disabled', () => {
      const { container } = render(
        <CopyPrevention enabled={false}>
          <p>Content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).not.toHaveAttribute('aria-label');
    });

    it('should be focusable when enabled for keyboard event capture', () => {
      const { container } = render(
        <CopyPrevention enabled={true}>
          <p>Content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('default props', () => {
    it('should default enabled to true', () => {
      const { container } = render(
        <CopyPrevention>
          <p>Content</p>
        </CopyPrevention>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('select-none');

      // Verify events are prevented (default enabled=true)
      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      });
      expect(wrapper.dispatchEvent(event)).toBe(false);
    });
  });
});
