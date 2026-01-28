/**
 * Tester Panel Layout
 * 
 * Provides the layout structure for the Tester Panel including:
 * - Header with CTX Quiz branding
 * - Navigation for different testing tools
 * - Main content area
 * - Footer with ctx.works attribution
 * 
 * Requirements: 15.1
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

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
 * Navigation items for the tester panel
 */
const navItems = [
  { href: '/tester', label: 'Load Testing', icon: '⚡' },
  { href: '/tester/latency', label: 'Latency', icon: '📊' },
  { href: '/tester/sync', label: 'Timer Sync', icon: '⏱️' },
  { href: '/tester/herd', label: 'Thundering Herd', icon: '🦬' },
  { href: '/tester/reconnect', label: 'Reconnection', icon: '🔄' },
  { href: '/tester/resources', label: 'Resources', icon: '💻' },
  { href: '/tester/database', label: 'Database', icon: '🗄️' },
  { href: '/tester/logs', label: 'Event Logs', icon: '📝' },
  { href: '/tester/state', label: 'State Tools', icon: '🔧' },
];

/**
 * Header component with CTX Quiz branding
 */
function TesterHeader() {
  const pathname = usePathname();

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
                Tester Panel
              </span>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-md text-body-sm font-medium transition-all duration-fast',
                    isActive
                      ? 'bg-primary text-white neu-raised-sm'
                      : 'text-[var(--text-secondary)] hover:text-primary hover:bg-[var(--neu-surface)]'
                  )}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Mobile menu button */}
          <button className="md:hidden p-2 rounded-md text-[var(--text-secondary)] hover:text-primary">
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </motion.header>
  );
}

/**
 * Footer component with branding
 */
function TesterFooter() {
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
 * Tester Panel Layout
 */
export default function TesterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--neu-bg)]">
      <TesterHeader />
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
      <TesterFooter />
    </div>
  );
}
