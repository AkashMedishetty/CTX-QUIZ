/**
 * QR Scanner Component
 * 
 * A QR code scanner using the device camera.
 * Falls back to manual entry if camera is not available.
 * 
 * Requirements: 3.8
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui';

interface QRScannerProps {
  /** Callback when a QR code is successfully scanned */
  onScan: (code: string) => void;
  /** Callback to close the scanner */
  onClose: () => void;
}

type ScannerStatus = 'initializing' | 'scanning' | 'error' | 'no-camera';

/**
 * QRScanner component
 * 
 * Uses the html5-qrcode library for QR code scanning.
 * Handles camera permissions and provides fallback UI.
 */
export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const [status, setStatus] = React.useState<ScannerStatus>('initializing');
  const [errorMessage, setErrorMessage] = React.useState<string>('');
  const scannerRef = React.useRef<HTMLDivElement>(null);
  const html5QrCodeRef = React.useRef<unknown>(null);

  React.useEffect(() => {
    let mounted = true;

    const initScanner = async () => {
      try {
        // Dynamically import html5-qrcode to avoid SSR issues
        const { Html5Qrcode } = await import('html5-qrcode');

        if (!mounted) return;

        // Check if camera is available
        const devices = await Html5Qrcode.getCameras();
        
        if (!devices || devices.length === 0) {
          setStatus('no-camera');
          setErrorMessage('No camera found on this device');
          return;
        }

        // Create scanner instance
        const html5QrCode = new Html5Qrcode('qr-reader');
        html5QrCodeRef.current = html5QrCode;

        // Start scanning
        await html5QrCode.start(
          { facingMode: 'environment' }, // Prefer back camera
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText: string) => {
            // Success callback
            if (mounted) {
              // Stop scanner before calling onScan
              html5QrCode.stop().catch(console.error);
              onScan(decodedText);
            }
          },
          () => {
            // Error callback (called for each frame without QR code)
            // We don't need to handle this
          }
        );

        if (mounted) {
          setStatus('scanning');
        }
      } catch (err) {
        if (!mounted) return;
        
        console.error('QR Scanner error:', err);
        
        if (err instanceof Error) {
          if (err.message.includes('Permission')) {
            setErrorMessage('Camera permission denied. Please allow camera access and try again.');
          } else if (err.message.includes('NotFoundError')) {
            setErrorMessage('No camera found on this device.');
            setStatus('no-camera');
            return;
          } else {
            setErrorMessage('Failed to start camera. Please try again or enter the code manually.');
          }
        } else {
          setErrorMessage('An unexpected error occurred.');
        }
        
        setStatus('error');
      }
    };

    initScanner();

    // Cleanup
    return () => {
      mounted = false;
      
      // Stop scanner if running
      if (html5QrCodeRef.current) {
        const scanner = html5QrCodeRef.current as { stop: () => Promise<void>; isScanning?: boolean };
        if (scanner.isScanning !== false) {
          scanner.stop().catch(() => {
            // Ignore errors during cleanup
          });
        }
      }
    };
  }, [onScan]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center"
    >
      {/* Header */}
      <div className="flex items-center justify-between w-full mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Scan QR Code
        </h2>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-[var(--neu-surface)] transition-colors"
          aria-label="Close scanner"
        >
          <svg
            className="w-5 h-5 text-[var(--text-secondary)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Scanner Container */}
      <div className="w-full max-w-[300px] aspect-square relative">
        {/* Scanner viewport */}
        <div
          id="qr-reader"
          ref={scannerRef}
          className="w-full h-full rounded-lg overflow-hidden neu-pressed"
        />

        {/* Overlay for different states */}
        {status === 'initializing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--neu-bg)] rounded-lg">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-[var(--text-secondary)]">
                Starting camera...
              </p>
            </div>
          </div>
        )}

        {status === 'scanning' && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Scanning frame overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[200px] h-[200px] border-2 border-primary rounded-lg">
                {/* Corner accents */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-lg" />
              </div>
            </div>
            
            {/* Scanning line animation */}
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 w-[180px] h-0.5 bg-primary"
              initial={{ top: '30%' }}
              animate={{ top: ['30%', '70%', '30%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        )}

        {(status === 'error' || status === 'no-camera') && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--neu-bg)] rounded-lg p-4">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center mb-3">
                <svg
                  className="w-6 h-6 text-error"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                {errorMessage}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      {status === 'scanning' && (
        <p className="mt-4 text-sm text-[var(--text-muted)] text-center">
          Point your camera at the QR code on the big screen
        </p>
      )}

      {/* Back button */}
      <Button
        variant="ghost"
        size="md"
        onClick={onClose}
        className="mt-6"
      >
        Enter code manually
      </Button>
    </motion.div>
  );
}
