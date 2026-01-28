/**
 * useServiceWorker - React hook for Service Worker registration and management
 * 
 * Handles Service Worker lifecycle:
 * - Registration on mount
 * - Update detection
 * - Skip waiting for new versions
 * - Cleanup on unmount
 * 
 * Requirements: 14.10
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Service Worker registration state
 */
export interface ServiceWorkerState {
  /** Whether the Service Worker is supported */
  isSupported: boolean;
  /** Whether the Service Worker is registered */
  isRegistered: boolean;
  /** Whether an update is available */
  hasUpdate: boolean;
  /** Whether the Service Worker is installing */
  isInstalling: boolean;
  /** Whether the Service Worker is waiting to activate */
  isWaiting: boolean;
  /** Registration error if any */
  error: string | null;
}

/**
 * Hook return type
 */
export interface UseServiceWorkerReturn extends ServiceWorkerState {
  /** Trigger update to skip waiting and activate new Service Worker */
  update: () => void;
  /** Unregister the Service Worker */
  unregister: () => Promise<boolean>;
  /** Clear all caches */
  clearCache: () => Promise<void>;
}

/**
 * Hook options
 */
export interface UseServiceWorkerOptions {
  /** Path to the Service Worker file (default: '/sw.js') */
  swPath?: string;
  /** Scope for the Service Worker (default: '/') */
  scope?: string;
  /** Whether to auto-register on mount (default: true) */
  autoRegister?: boolean;
  /** Callback when Service Worker is registered */
  onRegistered?: (registration: ServiceWorkerRegistration) => void;
  /** Callback when an update is available */
  onUpdateAvailable?: (registration: ServiceWorkerRegistration) => void;
  /** Callback when Service Worker is activated */
  onActivated?: () => void;
  /** Callback on registration error */
  onError?: (error: Error) => void;
}

/**
 * Check if Service Workers are supported
 */
function isServiceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 
         'serviceWorker' in navigator &&
         window.isSecureContext;
}

/**
 * useServiceWorker hook
 * 
 * Manages Service Worker registration and updates.
 * 
 * @param options - Hook configuration options
 * @returns Hook return object with state and methods
 * 
 * @example
 * ```tsx
 * const { isRegistered, hasUpdate, update } = useServiceWorker({
 *   onUpdateAvailable: () => {
 *     if (confirm('New version available. Update now?')) {
 *       update();
 *     }
 *   },
 * });
 * ```
 */
export function useServiceWorker(
  options: UseServiceWorkerOptions = {}
): UseServiceWorkerReturn {
  const {
    swPath = '/sw.js',
    scope = '/',
    autoRegister = true,
    onRegistered,
    onUpdateAvailable,
    onActivated,
    onError,
  } = options;

  // State
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: isServiceWorkerSupported(),
    isRegistered: false,
    hasUpdate: false,
    isInstalling: false,
    isWaiting: false,
    error: null,
  });

  // Refs
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const callbacksRef = useRef({ onRegistered, onUpdateAvailable, onActivated, onError });

  // Update callbacks ref
  useEffect(() => {
    callbacksRef.current = { onRegistered, onUpdateAvailable, onActivated, onError };
  }, [onRegistered, onUpdateAvailable, onActivated, onError]);

  /**
   * Handle Service Worker state change
   */
  const handleStateChange = useCallback((sw: ServiceWorker) => {
    if (sw.state === 'installed') {
      // New Service Worker installed
      if (navigator.serviceWorker.controller) {
        // There's an existing controller, so this is an update
        setState((prev) => ({ ...prev, hasUpdate: true, isWaiting: true, isInstalling: false }));
        if (registrationRef.current) {
          callbacksRef.current.onUpdateAvailable?.(registrationRef.current);
        }
      } else {
        // First install
        setState((prev) => ({ ...prev, isInstalling: false }));
      }
    } else if (sw.state === 'activating') {
      setState((prev) => ({ ...prev, isWaiting: false }));
    } else if (sw.state === 'activated') {
      setState((prev) => ({ ...prev, hasUpdate: false, isWaiting: false }));
      callbacksRef.current.onActivated?.();
    }
  }, []);

  /**
   * Register the Service Worker
   */
  const register = useCallback(async () => {
    if (!isServiceWorkerSupported()) {
      console.log('[useServiceWorker] Service Workers not supported');
      return;
    }

    try {
      console.log('[useServiceWorker] Registering Service Worker...');
      
      const registration = await navigator.serviceWorker.register(swPath, { scope });
      registrationRef.current = registration;

      console.log('[useServiceWorker] Service Worker registered:', registration.scope);

      setState((prev) => ({
        ...prev,
        isRegistered: true,
        error: null,
      }));

      callbacksRef.current.onRegistered?.(registration);

      // Check for updates
      if (registration.waiting) {
        setState((prev) => ({ ...prev, hasUpdate: true, isWaiting: true }));
        callbacksRef.current.onUpdateAvailable?.(registration);
      }

      if (registration.installing) {
        setState((prev) => ({ ...prev, isInstalling: true }));
        registration.installing.addEventListener('statechange', (e) => {
          handleStateChange(e.target as ServiceWorker);
        });
      }

      // Listen for new Service Workers
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          setState((prev) => ({ ...prev, isInstalling: true }));
          newWorker.addEventListener('statechange', (e) => {
            handleStateChange(e.target as ServiceWorker);
          });
        }
      });

      // Check for updates periodically (every hour)
      setInterval(() => {
        registration.update().catch(console.error);
      }, 60 * 60 * 1000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      console.error('[useServiceWorker] Registration failed:', errorMessage);
      
      setState((prev) => ({
        ...prev,
        isRegistered: false,
        error: errorMessage,
      }));

      callbacksRef.current.onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [swPath, scope, handleStateChange]);

  /**
   * Trigger update to skip waiting
   */
  const update = useCallback(() => {
    const registration = registrationRef.current;
    
    if (registration?.waiting) {
      console.log('[useServiceWorker] Skipping waiting...');
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      
      // Reload the page to use the new Service Worker
      window.location.reload();
    }
  }, []);

  /**
   * Unregister the Service Worker
   */
  const unregister = useCallback(async (): Promise<boolean> => {
    if (!isServiceWorkerSupported()) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const success = await registration.unregister();
      
      if (success) {
        console.log('[useServiceWorker] Service Worker unregistered');
        registrationRef.current = null;
        setState((prev) => ({
          ...prev,
          isRegistered: false,
          hasUpdate: false,
          isWaiting: false,
        }));
      }
      
      return success;
    } catch (error) {
      console.error('[useServiceWorker] Unregister failed:', error);
      return false;
    }
  }, []);

  /**
   * Clear all caches
   */
  const clearCache = useCallback(async (): Promise<void> => {
    if (typeof caches === 'undefined') {
      return;
    }

    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      console.log('[useServiceWorker] All caches cleared');
    } catch (error) {
      console.error('[useServiceWorker] Failed to clear caches:', error);
    }
  }, []);

  // Register on mount
  useEffect(() => {
    if (autoRegister && isServiceWorkerSupported()) {
      register();
    }

    // Listen for controller change (new Service Worker activated)
    const handleControllerChange = () => {
      console.log('[useServiceWorker] Controller changed');
      callbacksRef.current.onActivated?.();
    };

    if (isServiceWorkerSupported()) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }

    return () => {
      if (isServiceWorkerSupported()) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, [autoRegister, register]);

  return {
    ...state,
    update,
    unregister,
    clearCache,
  };
}

export default useServiceWorker;
