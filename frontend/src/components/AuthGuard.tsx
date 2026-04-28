'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';

interface AuthGuardProps {
  children: React.ReactNode;
  /** If true, redirect to /auth/login when not authenticated. Default: true */
  requireAuth?: boolean;
  /** If true, redirect to /dashboard when already authenticated (for auth pages). Default: false */
  redirectIfAuth?: boolean;
}

export function AuthGuard({
  children,
  requireAuth = true,
  redirectIfAuth = false,
}: AuthGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isInitialized, isLoading, initialize } =
    useAuthStore();

  // Restore session from localStorage on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  // Handle redirects once initialization is complete
  useEffect(() => {
    if (!isInitialized) return;

    if (requireAuth && !isAuthenticated) {
      router.replace('/auth/login');
    } else if (redirectIfAuth && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isInitialized, isAuthenticated, requireAuth, redirectIfAuth, router]);

  // Show loading spinner while checking auth state
  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen bg-[var(--neu-bg)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-3 border-[var(--shadow-dark)] border-t-primary animate-spin" />
          <p className="text-body-sm text-[var(--text-muted)]">Loading…</p>
        </div>
      </div>
    );
  }

  // If requireAuth and not authenticated, don't render children (redirect is in progress)
  if (requireAuth && !isAuthenticated) {
    return null;
  }

  // If redirectIfAuth and authenticated, don't render children (redirect is in progress)
  if (redirectIfAuth && isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
