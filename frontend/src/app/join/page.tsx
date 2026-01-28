/**
 * Join Page - Join code entry screen
 * 
 * Mobile-first page for participants to enter a join code or scan QR code
 * to join a quiz session.
 * 
 * Optimized for 320px-428px width with:
 * - Touch-friendly UI (44px min tap targets)
 * - Safe area insets for notched devices
 * - Responsive typography and spacing
 * - Prevents iOS zoom on input focus (16px min font)
 * 
 * Requirements: 3.1, 3.2, 3.8, 14.1, 14.9
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { JoinCodeInput } from './components/join-code-input';
import { QRScanner } from './components/qr-scanner';
import { Button, ThemeToggle } from '@/components/ui';

export default function JoinPage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = React.useState('');
  const [showScanner, setShowScanner] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /**
   * Handle join code submission
   */
  const handleJoin = React.useCallback((codeOverride?: string) => {
    const code = (codeOverride || joinCode).trim().toUpperCase();
    
    if (code.length !== 6) {
      setError('Please enter a 6-character join code');
      return;
    }

    // Clear any existing error and navigate
    setError(null);
    router.push(`/join/${code}`);
  }, [joinCode, router]);

  /**
   * Handle QR code scan result
   */
  const handleQRScan = (scannedCode: string) => {
    setShowScanner(false);
    
    // Extract join code from URL or use directly
    let code = scannedCode;
    
    // If it's a URL, try to extract the code
    if (scannedCode.includes('/join/')) {
      const match = scannedCode.match(/\/join\/([A-Za-z0-9]{6})/);
      if (match) {
        code = match[1];
      }
    }
    
    // Clean and validate the code
    code = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    if (code.length === 6) {
      router.push(`/join/${code}`);
    } else {
      setError('Invalid QR code. Please try again or enter the code manually.');
    }
  };

  /**
   * Handle join code change
   */
  const handleCodeChange = (code: string) => {
    setJoinCode(code);
    // Clear error when user starts typing or when code is complete
    if (error) {
      setError(null);
    }
  };

  return (
    <main className="min-h-screen-mobile flex flex-col items-center justify-center p-4 xs-px-tight bg-[var(--neu-bg)] safe-area-inset-y overscroll-none relative">
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.0, 0.0, 0.2, 1] }}
        className="w-full max-w-md px-2 sm:px-0"
      >
        {/* Logo and Title */}
        <div className="text-center mb-6 sm:mb-8">
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-2">
              CTX Quiz
            </h1>
            <p className="text-sm sm:text-base text-[var(--text-secondary)]">
              Enter your join code to participate
            </p>
          </motion.div>
        </div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="neu-raised-lg rounded-xl p-5 sm:p-6 md:p-8"
        >
          {showScanner ? (
            <QRScanner
              onScan={handleQRScan}
              onClose={() => setShowScanner(false)}
            />
          ) : (
            <>
              {/* Join Code Input */}
              <div className="mb-5 sm:mb-6">
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2 sm:mb-3 text-center">
                  Join Code
                </label>
                <JoinCodeInput
                  value={joinCode}
                  onChange={handleCodeChange}
                  onComplete={(code) => handleJoin(code)}
                  error={error}
                />
              </div>

              {/* Error Message */}
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-error text-xs sm:text-sm text-center mb-3 sm:mb-4"
                  role="alert"
                >
                  {error}
                </motion.p>
              )}

              {/* Join Button - Touch-friendly */}
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => handleJoin()}
                disabled={joinCode.length !== 6}
                className="mb-4 touch-target-48"
              >
                Join Quiz
              </Button>

              {/* Divider */}
              <div className="relative my-5 sm:my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--border)]" />
                </div>
                <div className="relative flex justify-center text-xs sm:text-sm">
                  <span className="px-3 sm:px-4 bg-[var(--neu-bg)] text-[var(--text-muted)]">
                    or
                  </span>
                </div>
              </div>

              {/* QR Scanner Button - Touch-friendly */}
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onClick={() => setShowScanner(true)}
                className="touch-target-48"
                leftIcon={
                  <svg
                    className="w-4 h-4 sm:w-5 sm:h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                    />
                  </svg>
                }
              >
                Scan QR Code
              </Button>
            </>
          )}
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="text-center mt-6 sm:mt-8"
        >
          <p className="text-xs text-[var(--text-muted)]">
            A product of{' '}
            <a
              href="https://ctx.works"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline touch-target-44 inline-block py-1"
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
        </motion.div>
      </motion.div>
    </main>
  );
}
