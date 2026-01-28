/**
 * Big Screen Page - Session Required
 * 
 * When users navigate to /bigscreen without a session ID,
 * show a message explaining they need a session ID.
 */

'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';

export default function BigScreenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--neu-bg)] p-4">
      <div className="neu-raised rounded-lg p-8 max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-warning/10 mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-warning"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <h1 className="text-h2 font-semibold text-[var(--text-primary)] mb-3">
          Big Screen Display
        </h1>
        <p className="text-body text-[var(--text-secondary)] mb-6">
          To open the Big Screen display, you need to start a quiz session first. 
          The Big Screen URL will be provided when you create a session from the Admin Panel.
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/admin">
            <Button variant="primary" fullWidth>
              Go to Admin Panel
            </Button>
          </Link>
          <Link href="/admin/sessions">
            <Button variant="secondary" fullWidth>
              View Active Sessions
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
