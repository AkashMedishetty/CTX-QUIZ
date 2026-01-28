'use client';

import Link from 'next/link';
import { ThemeToggle } from '@/components/ui';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[var(--neu-bg)] relative">
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      
      <div className="text-center max-w-md w-full">
        {/* Logo/Title */}
        <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-2">
          CTX Quiz
        </h1>
        <p className="text-lg text-[var(--text-secondary)] mb-8">
          Real-time synchronized quiz platform for live events
        </p>

        {/* Action Cards */}
        <div className="space-y-4">
          {/* Join Quiz - Primary action for participants */}
          <Link
            href="/join"
            className="block w-full neu-raised-lg rounded-xl p-6 hover:shadow-[6px_6px_12px_var(--shadow-dark),-6px_-6px_12px_var(--shadow-light)] transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-6 h-6 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <div className="text-left">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Join Quiz
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Enter a code to participate
                </p>
              </div>
              <svg
                className="w-5 h-5 text-[var(--text-muted)] ml-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </Link>

          {/* Admin Panel */}
          <Link
            href="/admin"
            className="block w-full neu-raised rounded-xl p-6 hover:shadow-[6px_6px_12px_var(--shadow-dark),-6px_-6px_12px_var(--shadow-light)] transition-all duration-200"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[var(--neu-surface)] flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-6 h-6 text-[var(--text-secondary)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <div className="text-left">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Admin Panel
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Create and manage quizzes
                </p>
              </div>
              <svg
                className="w-5 h-5 text-[var(--text-muted)] ml-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-12">
          <p className="text-xs text-[var(--text-muted)]">
            A product of{' '}
            <a
              href="https://ctx.works"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              ctx.works
            </a>
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Powered by{' '}
            <a
              href="https://purplehatevents.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-secondary)] hover:underline"
            >
              PurpleHat Events
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
