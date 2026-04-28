'use client';

import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--neu-bg)] flex flex-col items-center justify-center px-4 py-8">
      {/* CTX Quiz Branding */}
      <Link
        href="/"
        className="mb-8 flex items-center gap-3 group"
        aria-label="Go to CTX Quiz home"
      >
        <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center shadow-neu-raised-sm transition-all duration-fast group-hover:shadow-neu-raised">
          <span className="text-white font-display font-bold text-body-lg">
            C
          </span>
        </div>
        <span className="font-display font-semibold text-h3 text-[var(--text-primary)]">
          CTX Quiz
        </span>
      </Link>

      {/* Auth Card */}
      <div className="w-full max-w-md neu-raised rounded-lg p-8">
        {children}
      </div>

      {/* Footer */}
      <p className="mt-6 text-caption text-[var(--text-muted)]">
        &copy; {new Date().getFullYear()} CTX Quiz &middot;{' '}
        <a
          href="https://ctx.works"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary transition-colors duration-fast"
        >
          ctx.works
        </a>
      </p>
    </div>
  );
}
