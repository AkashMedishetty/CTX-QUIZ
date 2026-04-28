'use client';

import { useState, useMemo, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { resetPassword } from '@/lib/auth-client';

const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { key: 'upper', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { key: 'digit', label: 'One digit', test: (p: string) => /\d/.test(p) },
] as const;

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordChecks = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, met: r.test(password) })),
    [password],
  );
  const allMet = passwordChecks.every((c) => c.met);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allMet || !passwordsMatch || !token) return;
    setError('');
    setIsLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err: any) {
      setError(
        err?.response?.data?.message || err?.message || 'Failed to reset password',
      );
    } finally {
      setIsLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="font-display font-semibold text-h2 text-[var(--text-primary)] mb-2">
          Invalid link
        </h1>
        <p className="text-body-sm text-[var(--text-secondary)] mb-6">
          This password reset link is invalid or missing a token.
        </p>
        <Link
          href="/auth/forgot-password"
          className="text-primary font-medium hover:text-primary-light transition-colors duration-fast"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="font-display font-semibold text-h2 text-[var(--text-primary)] mb-2">
          Password reset
        </h1>
        <p className="text-body-sm text-[var(--text-secondary)] mb-6">
          Your password has been updated. You can now sign in with your new password.
        </p>
        <Link
          href="/auth/login"
          className="btn-base px-6 py-3 bg-primary text-white font-semibold rounded-sm shadow-neu-raised-sm hover:bg-primary-light active:shadow-neu-pressed transition-all duration-fast"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-display font-semibold text-h2 text-[var(--text-primary)] text-center mb-2">
        Set new password
      </h1>
      <p className="text-body-sm text-[var(--text-secondary)] text-center mb-6">
        Choose a strong password for your account.
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
            htmlFor="password"
            className="block text-body-sm font-medium text-[var(--text-secondary)] mb-1.5"
          >
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="input-base"
          />

          {/* Password requirements */}
          {password.length > 0 && (
            <ul className="mt-2 space-y-1">
              {passwordChecks.map((c) => (
                <li
                  key={c.key}
                  className={`flex items-center gap-2 text-caption ${c.met ? 'text-success' : 'text-[var(--text-muted)]'}`}
                >
                  {c.met ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  )}
                  {c.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-body-sm font-medium text-[var(--text-secondary)] mb-1.5"
          >
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="input-base"
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="mt-1.5 text-caption text-error">Passwords do not match</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || !allMet || !passwordsMatch}
          className="btn-base w-full py-3 bg-primary text-white font-semibold rounded-sm shadow-neu-raised-sm hover:bg-primary-light active:shadow-neu-pressed transition-all duration-fast disabled:opacity-50"
        >
          {isLoading ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </>
  );
}
