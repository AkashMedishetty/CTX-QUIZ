'use client';

import { useState, useMemo, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { useAuthStore } from '@/store/auth-store';

const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { key: 'upper', label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { key: 'digit', label: 'One digit', test: (p: string) => /\d/.test(p) },
] as const;

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const { register, isLoading, error, clearError } = useAuthStore();

  const preselectedTier = searchParams.get('tier') ?? '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordChecks = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, met: r.test(password) })),
    [password],
  );
  const allMet = passwordChecks.every((c) => c.met);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allMet) return;
    clearError();
    try {
      await register(name, email, password);
      setSuccess(true);
    } catch {
      // error is set in the store
    }
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
          Check your email
        </h1>
        <p className="text-body-sm text-[var(--text-secondary)] mb-6">
          We&apos;ve sent a verification link to <strong>{email}</strong>. Please verify your email to continue.
        </p>
        <Link
          href="/auth/login"
          className="text-primary font-medium hover:text-primary-light transition-colors duration-fast"
        >
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-display font-semibold text-h2 text-[var(--text-primary)] text-center mb-2">
        Create your account
      </h1>
      <p className="text-body-sm text-[var(--text-secondary)] text-center mb-6">
        Get started with CTX Quiz{preselectedTier ? ` — ${preselectedTier} plan` : ''}
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
          <label htmlFor="name" className="block text-body-sm font-medium text-[var(--text-secondary)] mb-1.5">
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="input-base"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-body-sm font-medium text-[var(--text-secondary)] mb-1.5">
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
          <label htmlFor="password" className="block text-body-sm font-medium text-[var(--text-secondary)] mb-1.5">
            Password
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

        {preselectedTier && (
          <input type="hidden" name="tier" value={preselectedTier} />
        )}

        <button
          type="submit"
          disabled={isLoading || !allMet}
          className="btn-base w-full py-3 bg-primary text-white font-semibold rounded-sm shadow-neu-raised-sm hover:bg-primary-light active:shadow-neu-pressed transition-all duration-fast disabled:opacity-50"
        >
          {isLoading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-body-sm text-[var(--text-secondary)]">
        Already have an account?{' '}
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
