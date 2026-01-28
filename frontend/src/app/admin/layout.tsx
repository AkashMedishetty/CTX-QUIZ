/**
 * Admin Panel Layout
 * 
 * Provides the layout structure for the Admin Panel including:
 * - Header with CTX Quiz branding
 * - Main content area
 * - Footer with ctx.works attribution
 * 
 * Requirements: 1.1
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

/**
 * CTX Quiz Logo component
 */
function CTXLogo() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
    >
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path
        d="M8 16C8 11.5817 11.5817 8 16 8C18.2091 8 20.2091 8.89543 21.6569 10.3431"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M24 16C24 20.4183 20.4183 24 16 24C13.7909 24 11.7909 23.1046 10.3431 21.6569"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="3" fill="white" />
    </svg>
  );
}

/**
 * Header component with CTX Quiz branding
 */
function AdminHeader() {
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="sticky top-0 z-50 w-full"
    >
      <div className="neu-raised-sm mx-4 mt-4 rounded-lg">
        <div className="flex h-16 items-center justify-between px-6">
          {/* Logo and Brand */}
          <Link
            href="https://ctx.works"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 text-primary hover:text-primary-light transition-colors duration-fast"
          >
            <CTXLogo />
            <div className="flex flex-col">
              <span className="font-display font-semibold text-body-lg leading-tight">
                CTX Quiz
              </span>
              <span className="text-caption text-[var(--text-muted)] leading-tight">
                Admin Panel
              </span>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/admin"
              className="text-body-sm font-medium text-[var(--text-secondary)] hover:text-primary transition-colors duration-fast"
            >
              Quizzes
            </Link>
            <Link
              href="/admin/sessions"
              className="text-body-sm font-medium text-[var(--text-secondary)] hover:text-primary transition-colors duration-fast"
            >
              Sessions
            </Link>
          </nav>
        </div>
      </div>
    </motion.header>
  );
}

/**
 * Footer component with branding
 */
function AdminFooter() {
  return (
    <footer className="mt-auto py-6 px-4">
      <div className="flex flex-col items-center justify-center gap-2 text-center">
        <p className="text-body-sm text-[var(--text-muted)]">
          A product of{' '}
          <Link
            href="https://ctx.works"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:text-primary-light transition-colors duration-fast"
          >
            ctx.works
          </Link>
        </p>
        <p className="text-caption text-[var(--text-muted)]">
          Powered by{' '}
          <Link
            href="https://purplehatevents.in"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--text-secondary)] hover:underline"
          >
            PurpleHat Events
          </Link>
        </p>
      </div>
    </footer>
  );
}

/**
 * Admin Panel Layout
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--neu-bg)]">
      <AdminHeader />
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
      <AdminFooter />
    </div>
  );
}
