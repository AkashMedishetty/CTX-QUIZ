/**
 * Play Page - Redirect to Join
 * 
 * When users navigate to /play without a session ID,
 * redirect them to the join page.
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PlayPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/join');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--neu-bg)]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-body text-[var(--text-secondary)]">
          Redirecting to join page...
        </p>
      </div>
    </div>
  );
}
