'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { verifyEmail, resendVerification } from '@/lib/auth-client';

type Status = 'loading' | 'success' | 'error' | 'no-token';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<Status>(token ? 'loading' : 'no-token');
  const [message, setMessage] = useState('');

  // Resend state
  const [resendEmail, setResendEmail] = useState('');
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resendMessage, setResendMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    verifyEmail(token)
      .then((msg) => {
        if (!cancelled) {
          setStatus('success');
          setMessage(msg);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('error');
          setMessage(
            err?.response?.data?.message || err?.message || 'Verification failed',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleResend = useCallback(async () => {
    if (!resendEmail) return;
    setResendStatus('sending');
    setResendMessage('');
    try {
      const msg = await resendVerification(resendEmail);
      setResendStatus('sent');
      setResendMessage(msg);
    } catch (err: any) {
      setResendStatus('error');
      setResendMessage(
        err?.response?.data?.message || err?.message || 'Failed to resend',
      );
    }
  }, [resendEmail]);

  return (
    <div className="text-center">
      {status === 'loading' && (
        <>
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <h1 className="font-display font-semibold text-h2 text-[var(--text-primary)] mb-2">
            Verifying your email…
          </h1>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="font-display font-semibold text-h2 text-[var(--text-primary)] mb-2">
            Email verified
          </h1>
          <p className="text-body-sm text-[var(--text-secondary)] mb-6">
            {message || 'Your email has been verified successfully.'}
          </p>
          <Link
            href="/auth/login"
            className="btn-base px-6 py-3 bg-primary text-white font-semibold rounded-sm shadow-neu-raised-sm hover:bg-primary-light active:shadow-neu-pressed transition-all duration-fast"
          >
            Sign in
          </Link>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="font-display font-semibold text-h2 text-[var(--text-primary)] mb-2">
            Verification failed
          </h1>
          <p className="text-body-sm text-[var(--text-secondary)] mb-6">{message}</p>
        </>
      )}

      {(status === 'error' || status === 'no-token') && (
        <div className="mt-4">
          {status === 'no-token' && (
            <>
              <h1 className="font-display font-semibold text-h2 text-[var(--text-primary)] mb-2">
                Verify your email
              </h1>
              <p className="text-body-sm text-[var(--text-secondary)] mb-4">
                Enter your email to receive a new verification link.
              </p>
            </>
          )}

          <p className="text-body-sm text-[var(--text-secondary)] mb-3">
            Need a new verification link?
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-base flex-1"
            />
            <button
              onClick={handleResend}
              disabled={resendStatus === 'sending' || !resendEmail}
              className="btn-base px-4 py-3 bg-primary text-white font-medium rounded-sm shadow-neu-raised-sm hover:bg-primary-light active:shadow-neu-pressed transition-all duration-fast disabled:opacity-50 whitespace-nowrap"
            >
              {resendStatus === 'sending' ? 'Sending…' : 'Resend'}
            </button>
          </div>
          {resendMessage && (
            <p
              className={`mt-2 text-body-sm ${resendStatus === 'sent' ? 'text-success' : 'text-error'}`}
            >
              {resendMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
