'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { forgotPassword } from '@/lib/auth-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await forgotPassword(email);
      setSubmitted(true);
    } catch (err: any) {
      setError(
        err?.response?.data?.message || err?.message || 'Something went wrong',
      );
    } finally {
      setIsLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="font-display font-semibold text-h2 text-[var(--text-primary)] mb-2">
          Check your email
        </h1>
        <p className="text-body-sm text-[var(--text-secondary)] mb-6">
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link.
        </p>
        <Link
          href="/auth/login"
          className="text-primary font-medium hover:text-primary-light transition-colors duration-fast"
        >
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-display font-semibold text-h2 text-[var(--text-primary)] text-center mb-2">
        Forgot password?
      </h1>
      <p className="text-body-sm text-[var(--text-secondary)] text-center mb-6">
        Enter your email and we&apos;ll send you a reset link.
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

        <button
          type="submit"
          disabled={isLoading}
          className="btn-base w-full py-3 bg-primary text-white font-semibold rounded-sm shadow-neu-raised-sm hover:bg-primary-light active:shadow-neu-pressed transition-all duration-fast disabled:opacity-50"
        >
          {isLoading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-6 text-center text-body-sm text-[var(--text-secondary)]">
        Remember your password?{' '}
        <Link
          href="/auth/login"
          className="text-primary font-medium hover:text-primary-light transition-colors duration-fast"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
