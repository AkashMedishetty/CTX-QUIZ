/**
 * AuthGuard Component Tests
 *
 * Tests for the AuthGuard component covering:
 * - Redirect to login when not authenticated (requireAuth)
 * - Redirect to dashboard when authenticated (redirectIfAuth)
 * - Loading spinner while checking auth state
 * - Rendering children when auth conditions are met
 *
 * Requirements: 19.1, 19.2
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { AuthGuard } from '../AuthGuard';

// Mock next/navigation
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

// Mock auth store state
let mockStoreState = {
  isAuthenticated: false,
  isInitialized: false,
  isLoading: false,
  initialize: jest.fn(),
};

jest.mock('@/store/auth-store', () => ({
  useAuthStore: () => mockStoreState,
}));

describe('AuthGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreState = {
      isAuthenticated: false,
      isInitialized: false,
      isLoading: false,
      initialize: jest.fn(),
    };
  });

  it('calls initialize on mount when not initialized', () => {
    render(
      <AuthGuard>
        <div>Protected</div>
      </AuthGuard>,
    );
    expect(mockStoreState.initialize).toHaveBeenCalledTimes(1);
  });

  it('shows loading spinner while not initialized', () => {
    render(
      <AuthGuard>
        <div>Protected</div>
      </AuthGuard>,
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('shows loading spinner while isLoading is true', () => {
    mockStoreState.isInitialized = true;
    mockStoreState.isLoading = true;

    render(
      <AuthGuard>
        <div>Protected</div>
      </AuthGuard>,
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('redirects to /auth/login when requireAuth=true and not authenticated', () => {
    mockStoreState.isInitialized = true;

    render(
      <AuthGuard requireAuth>
        <div>Protected</div>
      </AuthGuard>,
    );
    expect(mockReplace).toHaveBeenCalledWith('/auth/login');
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('renders children when requireAuth=true and authenticated', () => {
    mockStoreState.isInitialized = true;
    mockStoreState.isAuthenticated = true;

    render(
      <AuthGuard requireAuth>
        <div>Protected</div>
      </AuthGuard>,
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });

  it('redirects to /dashboard when redirectIfAuth=true and authenticated', () => {
    mockStoreState.isInitialized = true;
    mockStoreState.isAuthenticated = true;

    render(
      <AuthGuard requireAuth={false} redirectIfAuth>
        <div>Login Form</div>
      </AuthGuard>,
    );
    expect(mockReplace).toHaveBeenCalledWith('/dashboard');
    expect(screen.queryByText('Login Form')).not.toBeInTheDocument();
  });

  it('renders children when redirectIfAuth=true and not authenticated', () => {
    mockStoreState.isInitialized = true;
    mockStoreState.isAuthenticated = false;

    render(
      <AuthGuard requireAuth={false} redirectIfAuth>
        <div>Login Form</div>
      </AuthGuard>,
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('Login Form')).toBeInTheDocument();
  });

  it('defaults requireAuth to true', () => {
    mockStoreState.isInitialized = true;
    mockStoreState.isAuthenticated = false;

    render(
      <AuthGuard>
        <div>Protected</div>
      </AuthGuard>,
    );
    expect(mockReplace).toHaveBeenCalledWith('/auth/login');
  });
});
