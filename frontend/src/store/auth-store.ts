/**
 * Auth Store (Zustand)
 *
 * Manages user session state, tokens, login/logout actions,
 * and auto-refresh logic.
 *
 * Requirements: 5.1, 17.4, 17.5
 */

import { create } from 'zustand';
import {
  type AuthUser,
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  refreshTokens as apiRefreshTokens,
  getMe as apiGetMe,
  getStoredTokens,
  clearTokens,
} from '@/lib/auth-client';

// ============================================================================
// Types
// ============================================================================

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<{ userId: string }>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<boolean>;
  setUser: (user: AuthUser | null) => void;
  initialize: () => Promise<void>;
  clearError: () => void;
}

export interface AuthStore extends AuthState, AuthActions {
  /** Derived: true when user is non-null */
  isAuthenticated: boolean;
}

// ============================================================================
// Auto-refresh timer
// ============================================================================

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Parse JWT exp claim to get ms until expiry */
function getTokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.exp) return null;
    return payload.exp * 1000 - Date.now();
  } catch {
    return null;
  }
}

function scheduleRefresh(accessToken: string, doRefresh: () => Promise<boolean>): void {
  if (refreshTimer) clearTimeout(refreshTimer);

  const expiresInMs = getTokenExpiryMs(accessToken);
  if (!expiresInMs || expiresInMs <= 0) return;

  // Refresh 60 seconds before expiry, minimum 10 seconds from now
  const refreshInMs = Math.max(expiresInMs - 60_000, 10_000);

  refreshTimer = setTimeout(async () => {
    await doRefresh();
  }, refreshInMs);
}

function clearRefreshTimer(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

// ============================================================================
// Store
// ============================================================================

export const useAuthStore = create<AuthStore>((set, get) => ({
  // State
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  // Derived
  get isAuthenticated() {
    return get().user !== null;
  },

  // Actions
  async login(email: string, password: string) {
    set({ isLoading: true, error: null });
    try {
      const tokens = await apiLogin(email, password);
      const user = await apiGetMe();
      set({
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isLoading: false,
      });
      scheduleRefresh(tokens.accessToken, get().refreshTokens);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || err?.message || 'Login failed';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  async register(name: string, email: string, password: string) {
    set({ isLoading: true, error: null });
    try {
      const result = await apiRegister(name, email, password);
      set({ isLoading: false });
      return result;
    } catch (err: any) {
      const message =
        err?.response?.data?.message || err?.message || 'Registration failed';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  async logout() {
    clearRefreshTimer();
    try {
      await apiLogout();
    } finally {
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        error: null,
      });
    }
  },

  async refreshTokens(): Promise<boolean> {
    try {
      const tokens = await apiRefreshTokens();
      if (!tokens) {
        // Refresh failed — clear session
        clearRefreshTimer();
        set({ user: null, accessToken: null, refreshToken: null });
        return false;
      }
      set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      scheduleRefresh(tokens.accessToken, get().refreshTokens);
      return true;
    } catch {
      clearRefreshTimer();
      set({ user: null, accessToken: null, refreshToken: null });
      return false;
    }
  },

  setUser(user: AuthUser | null) {
    set({ user });
  },

  async initialize() {
    const stored = getStoredTokens();
    if (!stored) {
      set({ isInitialized: true });
      return;
    }

    set({
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      isLoading: true,
    });

    try {
      const user = await apiGetMe();
      set({ user, isLoading: false, isInitialized: true });
      scheduleRefresh(stored.accessToken, get().refreshTokens);
    } catch {
      // Token might be expired — try refresh
      const tokens = await apiRefreshTokens();
      if (tokens) {
        try {
          const user = await apiGetMe();
          set({
            user,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            isLoading: false,
            isInitialized: true,
          });
          scheduleRefresh(tokens.accessToken, get().refreshTokens);
          return;
        } catch {
          // Fall through to clear
        }
      }
      clearTokens();
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  clearError() {
    set({ error: null });
  },
}));
