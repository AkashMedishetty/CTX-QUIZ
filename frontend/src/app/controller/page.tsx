/**
 * Controller Page - Session Required
 * 
 * When users navigate to /controller without a session ID,
 * redirect them to the sessions page.
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ControllerPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/sessions');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--neu-bg)]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-body text-[var(--text-secondary)]">
          Redirecting to sessions...
        </p>
      </div>
    </div>
  );
}
