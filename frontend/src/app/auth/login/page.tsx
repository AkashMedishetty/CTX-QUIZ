'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch {
      // error is set in the store
    }
  }

  return (
    <>
      <h1 className="font-display font-semibold text-h2 text-[var(--text-primary)] text-center mb-2">
        Welcome back
      </h1>
      <p className="text-body-sm text-[var(--text-secondary)] text-center mb-6">
        Sign in to your CTX Quiz account
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-sm bg-error/10 border border-error/20 text-error text-body-sm"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-body-sm font-medium text-[var(--text-secondary)] mb-1.5"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input-base"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-body-sm font-medium text-[var(--text-secondary)] mb-1.5"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="input-base"
          />
        </div>

        <div className="flex justify-end">
          <Link
            href="/auth/forgot-password"
            className="text-body-sm text-primary hover:text-primary-light transition-colors duration-fast"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-base w-full py-3 bg-primary text-white font-semibold rounded-sm shadow-neu-raised-sm hover:bg-primary-light active:shadow-neu-pressed transition-all duration-fast disabled:opacity-50"
        >
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-body-sm text-[var(--text-secondary)]">
        Don&apos;t have an account?{' '}
        <Link
          href="/auth/register"
          className="text-primary font-medium hover:text-primary-light transition-colors duration-fast"
        >
          Create one
        </Link>
      </p>
    </>
  );
}
