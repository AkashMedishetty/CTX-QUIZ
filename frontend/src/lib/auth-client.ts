/**
 * Auth API Client
 *
 * Provides methods for all auth-related API calls:
 * register, login, refresh, logout, email verification,
 * password reset, and user profile.
 *
 * Uses axios with auto-attached JWT and token refresh on 401.
 *
 * Requirements: 5.1, 17.4, 17.5
 */

import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';

// ============================================================================
// Types
// ============================================================================

export interface AuthUser {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResponse {
  userId: string;
  message: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  message: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// Token Storage
// ============================================================================

const TOKEN_KEYS = {
  accessToken: 'ctx_access_token',
  refreshToken: 'ctx_refresh_token',
} as const;

export function getStoredTokens(): AuthTokens | null {
  if (typeof window === 'undefined') return null;
  const accessToken = localStorage.getItem(TOKEN_KEYS.accessToken);
  const refreshToken = localStorage.getItem(TOKEN_KEYS.refreshToken);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function storeTokens(tokens: AuthTokens): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEYS.accessToken, tokens.accessToken);
  localStorage.setItem(TOKEN_KEYS.refreshToken, tokens.refreshToken);
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEYS.accessToken);
  localStorage.removeItem(TOKEN_KEYS.refreshToken);
}

// ============================================================================
// Axios Instance with Auth Interceptors
// ============================================================================

function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  }
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
}

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onTokenRefreshed(newToken: string): void {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void): void {
  refreshSubscribers.push(cb);
}

const authApiClient: AxiosInstance = axios.create({
  baseURL: getBaseUrl(),
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach JWT
authApiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const accessToken = localStorage.getItem(TOKEN_KEYS.accessToken);
      if (accessToken && config.headers) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor — auto-refresh on 401
authApiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Only attempt refresh for 401 errors on non-auth endpoints
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/register')
    ) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve) => {
          addRefreshSubscriber((newToken: string) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(authApiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const tokens = await refreshTokens();
        if (tokens) {
          onTokenRefreshed(tokens.accessToken);
          originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
          return authApiClient(originalRequest);
        }
        // No tokens returned — redirect to login
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
      } catch {
        // Refresh failed — clear tokens and redirect to login
        clearTokens();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// ============================================================================
// Auth API Methods
// ============================================================================

export async function register(
  name: string,
  email: string,
  password: string,
): Promise<RegisterResponse> {
  const res = await authApiClient.post<ApiSuccessResponse<RegisterResponse>>(
    '/auth/register',
    { name, email, password },
  );
  return res.data.data;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthTokens> {
  const res = await authApiClient.post<ApiSuccessResponse<AuthTokens>>(
    '/auth/login',
    { email, password },
  );
  const tokens = res.data.data;
  storeTokens(tokens);
  return tokens;
}

export async function refreshTokens(): Promise<AuthTokens | null> {
  const stored = getStoredTokens();
  if (!stored?.refreshToken) return null;

  try {
    const res = await authApiClient.post<ApiSuccessResponse<AuthTokens>>(
      '/auth/refresh',
      { refreshToken: stored.refreshToken },
    );
    const tokens = res.data.data;
    storeTokens(tokens);
    return tokens;
  } catch {
    clearTokens();
    return null;
  }
}

export async function logout(): Promise<void> {
  const stored = getStoredTokens();
  if (!stored?.refreshToken) {
    clearTokens();
    return;
  }

  try {
    await authApiClient.post('/auth/logout', {
      refreshToken: stored.refreshToken,
    });
  } finally {
    clearTokens();
  }
}

export async function verifyEmail(token: string): Promise<string> {
  const res = await authApiClient.get<ApiSuccessResponse<{ message: string }>>(
    `/auth/verify-email/${token}`,
  );
  return res.data.data.message;
}

export async function resendVerification(email: string): Promise<string> {
  const res = await authApiClient.post<ApiSuccessResponse<{ message: string }>>(
    '/auth/resend-verification',
    { email },
  );
  return res.data.data.message;
}

export async function forgotPassword(email: string): Promise<string> {
  const res = await authApiClient.post<ApiSuccessResponse<{ message: string }>>(
    '/auth/forgot-password',
    { email },
  );
  return res.data.data.message;
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<string> {
  const res = await authApiClient.post<ApiSuccessResponse<{ message: string }>>(
    '/auth/reset-password',
    { token, newPassword },
  );
  return res.data.data.message;
}

export async function getMe(): Promise<AuthUser> {
  const res = await authApiClient.get<ApiSuccessResponse<AuthUser>>('/auth/me');
  return res.data.data;
}

// Export the configured axios instance for use by other API clients
export { authApiClient };
