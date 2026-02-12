/**
 * useFocusMonitoring Tests
 *
 * Tests for the useFocusMonitoring hook covering:
 * - Visibility change detection
 * - Focus lost/regained event tracking
 * - Total lost time calculation
 * - Callback invocation
 *
 * Requirements: 9.1
 * Property 12: For any visibility change detected by the browser, the Participant_Page
 * SHALL emit either a focus_lost or focus_regained event to the server within 100ms,
 * including the accurate timestamp.
 */

import { renderHook, act } from '@testing-library/react';
import { useFocusMonitoring } from '../useFocusMonitoring';

// Mock document.visibilityState
let mockVisibilityState: DocumentVisibilityState = 'visible';

Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => mockVisibilityState,
});

// Store visibility change listeners
let visibilityChangeListeners: Array<() => void> = [];

// Mock addEventListener and removeEventListener for visibilitychange
const originalAddEventListener = document.addEventListener;
const originalRemoveEventListener = document.removeEventListener;

beforeAll(() => {
  document.addEventListener = jest.fn((event: string, handler: EventListener) => {
    if (event === 'visibilitychange') {
      visibilityChangeListeners.push(handler as () => void);
    } else {
      originalAddEventListener.call(document, event, handler);
    }
  });

  document.removeEventListener = jest.fn((event: string, handler: EventListener) => {
    if (event === 'visibilitychange') {
      visibilityChangeListeners = visibilityChangeListeners.filter((h) => h !== handler);
    } else {
      originalRemoveEventListener.call(document, event, handler);
    }
  });
});

afterAll(() => {
  document.addEventListener = originalAddEventListener;
  document.removeEventListener = originalRemoveEventListener;
});

// Helper to simulate visibility change
function simulateVisibilityChange(state: DocumentVisibilityState) {
  mockVisibilityState = state;
  visibilityChangeListeners.forEach((listener) => listener());
}

describe('useFocusMonitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVisibilityState = 'visible';
    visibilityChangeListeners = [];
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with focused state when page is visible', () => {
      mockVisibilityState = 'visible';

      const { result } = renderHook(() =>
        useFocusMonitoring({
          enabled: true,
          onFocusLost: jest.fn(),
          onFocusRegained: jest.fn(),
        })
      );

      expect(result.current.isFocused).toBe(true);
      expect(result.current.focusEvents).toEqual([]);
      expect(result.current.totalLostTime).toBe(0);
    });

    it('should initialize with unfocused state when page is hidden', () => {
      mockVisibilityState = 'hidden';

      const onFocusLost = jest.fn();
      const { result } = renderHook(() =>
        useFocusMonitoring({
          enabled: true,
          onFocusLost,
          onFocusRegained: jest.fn(),
        })
      );

      // The hook should detect the initial hidden state
      expect(result.current.isFocused).toBe(false);
    });

    it('should not track events when disabled', () => {
      const onFocusLost = jest.fn();
      const onFocusRegained = jest.fn();

      const { result } = renderHook(() =>
        useFocusMonitoring({
          enabled: false,
          onFocusLost,
          onFocusRegained,
        })
      );

      act(() => {
        simulateVisibilityChange('hidden');
      });

      expect(onFocusLost).not.toHaveBeenCalled();
      expect(result.current.focusEvents).toEqual([]);
    });
  });

  describe('focus lost detection', () => {
    it('should detect focus lost when visibility changes to hidden', () => {
      const onFocusLost = jest.fn();
      const timestamp = Date.now();

      const { result } = renderHook(() =>
        useFocusMonitoring({
          enabled: true,
          onFocusLost,
          onFocusRegained: jest.fn(),
        })
      );

      act(() => {
        simulateVisibilityChange('hidden');
      });

      expect(result.current.isFocused).toBe(false);
      expect(onFocusLost).toHaveBeenCalledWith(timestamp);
      expect(result.current.focusEvents).toHaveLength(1);
      expect(result.current.focusEvents[0]).toEqual({
        type: 'focus_lost',
        timestamp,
      });
    });

    it('should include accurate timestamp in focus_lost event', () => {
      const onFocusLost = jest.fn();
      const expectedTimestamp = Date.now();

      renderHook(() =>
        useFocusMonitoring({
          enabled: true,
          onFocusLost,
          onFocusRegained: jest.fn(),
        })
      );

      act(() => {
        simulateVisibilityChange('hidden');
      });

      expect(onFocusLost).toHaveBeenCalledWith(expectedTimestamp);
    });
  });

  describe('focus regained detection', () => {
    it('should detect focus regained when visibility changes to visible', () => {
      const onFocusLost = jest.fn();
      const onFocusRegained = jest.fn();

      const { result } = renderHook(() =>
        useFocusMonitoring({
          enabled: true,
          onFocusLost,
          onFocusRegained,
        })
      );

      // First lose focus
      act(() => {
        simulateVisibilityChange('hidden');
      });

      // Advance time by 5 seconds
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      const regainedTimestamp = Date.now();

      // Then regain focus
      act(() => {
        simulateVisibilityChange('visible');
      });

      expect(result.current.isFocused).toBe(true);
      expect(onFocusRegained).toHaveBeenCalledWith(regainedTimestamp, 5000);
      expect(result.current.focusEvents).toHaveLength(2);
      expect(result.current.focusEvents[1]).toEqual({
        type: 'focus_regained',
        timestamp: regainedTimestamp,
        durationMs: 5000,
      });
    });

    it('should calculate correct duration for focus_regained event', () => {
      const onFocusRegained = jest.fn();

      renderHook(() =>
        useFocusMonitoring({
          enabled: true,
          onFocusLost: jest.fn(),
          onFocusRegained,
        })
      );

      // Lose focus
      act(() => {
        simulateVisibilityChange('hidden');
      });

      // Advance time by 10 seconds
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      // Regain focus
      act(() => {
        simulateVisibilityChange('visible');
      });

      expect(onFocusRegained).toHaveBeenCalledWith(expect.any(Number), 10000);
    });
  });

  describe('total lost time calculation', () => {
    it('should accumulate total lost time across multiple focus events', () => {
      const { result } = renderHook(() =>
        useFocusMonitoring({
          enabled: true,
          onFocusLost: jest.fn(),
          onFocusRegained: jest.fn(),
        })
      );

      // First focus loss - 3 seconds
      act(() => {
        simulateVisibilityChange('hidden');
      });
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      act(() => {
        simulateVisibilityChange('visible');
      });

      expect(result.current.totalLostTime).toBe(3000);

      // Second focus loss - 5 seconds
      act(() => {
        simulateVisibilityChange('hidden');
      });
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      act(() => {
        simulateVisibilityChange('visible');
      });

      expect(result.current.totalLostTime).toBe(8000);

      // Third focus loss - 2 seconds
      act(() => {
        simulateVisibilityChange('hidden');
      });
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      act(() => {
        simulateVisibilityChange('visible');
      });

      expect(result.current.totalLostTime).toBe(10000);
    });

    it('should track all focus events in order', () => {
      const { result } = renderHook(() =>
        useFocusMonitoring({
          enabled: true,
          onFocusLost: jest.fn(),
          onFocusRegained: jest.fn(),
        })
      );

      // Multiple focus changes
      act(() => {
        simulateVisibilityChange('hidden');
      });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      act(() => {
        simulateVisibilityChange('visible');
      });
      act(() => {
        simulateVisibilityChange('hidden');
      });
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      act(() => {
        simulateVisibilityChange('visible');
      });

      expect(result.current.focusEvents).toHaveLength(4);
      expect(result.current.focusEvents[0].type).toBe('focus_lost');
      expect(result.current.focusEvents[1].type).toBe('focus_regained');
      expect(result.current.focusEvents[2].type).toBe('focus_lost');
      expect(result.current.focusEvents[3].type).toBe('focus_regained');
    });
  });

  describe('enabled/disabled toggle', () => {
    it('should reset state when disabled', () => {
      const { result, rerender } = renderHook(
        ({ enabled }) =>
          useFocusMonitoring({
            enabled,
            onFocusLost: jest.fn(),
            onFocusRegained: jest.fn(),
          }),
        { initialProps: { enabled: true } }
      );

      // Generate some events
      act(() => {
        simulateVisibilityChange('hidden');
      });
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      act(() => {
        simulateVisibilityChange('visible');
      });

      expect(result.current.focusEvents).toHaveLength(2);
      expect(result.current.totalLostTime).toBe(5000);

      // Disable monitoring
      rerender({ enabled: false });

      expect(result.current.focusEvents).toEqual([]);
      expect(result.current.totalLostTime).toBe(0);
    });

    it('should start fresh when re-enabled', () => {
      const onFocusLost = jest.fn();

      const { result, rerender } = renderHook(
        ({ enabled }) =>
          useFocusMonitoring({
            enabled,
            onFocusLost,
            onFocusRegained: jest.fn(),
          }),
        { initialProps: { enabled: true } }
      );

      // Generate event
      act(() => {
        simulateVisibilityChange('hidden');
      });

      expect(result.current.focusEvents).toHaveLength(1);

      // Disable
      rerender({ enabled: false });

      // Re-enable
      rerender({ enabled: true });

      expect(result.current.focusEvents).toEqual([]);
      expect(result.current.totalLostTime).toBe(0);
    });
  });

  describe('event listener cleanup', () => {
    it('should add event listener on mount when enabled', () => {
      renderHook(() =>
        useFocusMonitoring({
          enabled: true,
          onFocusLost: jest.fn(),
          onFocusRegained: jest.fn(),
        })
      );

      expect(document.addEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );
    });

    it('should remove event listener on unmount', () => {
      const { unmount } = renderHook(() =>
        useFocusMonitoring({
          enabled: true,
          onFocusLost: jest.fn(),
          onFocusRegained: jest.fn(),
        })
      );

      unmount();

      expect(document.removeEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );
    });

    it('should not add event listener when disabled', () => {
      jest.clearAllMocks();

      renderHook(() =>
        useFocusMonitoring({
          enabled: false,
          onFocusLost: jest.fn(),
          onFocusRegained: jest.fn(),
        })
      );

      expect(document.addEventListener).not.toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );
    });
  });

  describe('duplicate event prevention', () => {
    it('should not emit focus_lost when already unfocused', () => {
      const onFocusLost = jest.fn();

      renderHook(() =>
        useFocusMonitoring({
          enabled: true,
          onFocusLost,
          onFocusRegained: jest.fn(),
        })
      );

      // First focus loss
      act(() => {
        simulateVisibilityChange('hidden');
      });

      // Try to lose focus again (should be ignored)
      act(() => {
        simulateVisibilityChange('hidden');
      });

      expect(onFocusLost).toHaveBeenCalledTimes(1);
    });

    it('should not emit focus_regained when already focused', () => {
      const onFocusRegained = jest.fn();

      renderHook(() =>
        useFocusMonitoring({
          enabled: true,
          onFocusLost: jest.fn(),
          onFocusRegained,
        })
      );

      // Try to regain focus when already focused (should be ignored)
      act(() => {
        simulateVisibilityChange('visible');
      });

      expect(onFocusRegained).not.toHaveBeenCalled();
    });
  });
});
