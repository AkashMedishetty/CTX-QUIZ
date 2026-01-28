/**
 * Void Question Modal - Modal for voiding a question with reason input
 * 
 * Allows the controller to void the current question with a reason.
 * Voided questions are excluded from all score calculations.
 * 
 * Requirements: 2.7, 10.1
 */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Void question modal props
 */
interface VoidQuestionModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Callback when void is confirmed */
  onConfirm: (reason: string) => void;
  /** The question text being voided */
  questionText: string;
}

/**
 * Common void reasons for quick selection
 */
const COMMON_REASONS = [
  'Technical issue',
  'Question error',
  'Incorrect answer marked',
  'Time issue',
  'Other',
];

/**
 * Void Question Modal Component
 */
export function VoidQuestionModal({
  isOpen,
  onClose,
  onConfirm,
  questionText,
}: VoidQuestionModalProps) {
  const [reason, setReason] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');

  // Reset state when modal opens/closes
  const handleClose = () => {
    setReason('');
    setSelectedPreset(null);
    setCustomReason('');
    onClose();
  };

  // Handle preset selection
  const handlePresetSelect = (preset: string) => {
    setSelectedPreset(preset);
    if (preset !== 'Other') {
      setReason(preset);
      setCustomReason('');
    } else {
      setReason('');
    }
  };

  // Handle custom reason change
  const handleCustomReasonChange = (value: string) => {
    setCustomReason(value);
    setReason(value);
  };

  // Handle confirm
  const handleConfirm = () => {
    const finalReason = selectedPreset === 'Other' ? customReason : reason;
    if (finalReason.trim()) {
      onConfirm(finalReason.trim());
      handleClose();
    }
  };

  // Check if form is valid
  const isValid = selectedPreset === 'Other' 
    ? customReason.trim().length > 0 
    : reason.trim().length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-lg mx-4 neu-raised-lg rounded-xl bg-[var(--neu-bg)] overflow-hidden"
          >
            {/* Header */}
            <div className="bg-error/5 border-b border-error/20 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-error"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-h3 font-semibold text-[var(--text-primary)]">
                    Void Question
                  </h3>
                  <p className="text-caption text-[var(--text-muted)]">
                    This action cannot be undone
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Warning */}
              <div className="bg-warning/5 border border-warning/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-warning flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div>
                    <p className="text-body-sm font-medium text-warning">
                      Voiding this question will:
                    </p>
                    <ul className="mt-1 text-caption text-[var(--text-secondary)] list-disc list-inside space-y-0.5">
                      <li>Exclude it from all score calculations</li>
                      <li>Recalculate the leaderboard</li>
                      <li>Notify all participants</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Question Preview */}
              <div className="neu-pressed rounded-lg p-4">
                <p className="text-caption text-[var(--text-muted)] mb-1">
                  Question to void:
                </p>
                <p className="text-body text-[var(--text-primary)] line-clamp-3">
                  {questionText || 'No question text available'}
                </p>
              </div>

              {/* Reason Selection */}
              <div>
                <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-3">
                  Select a reason
                </label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_REASONS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => handlePresetSelect(preset)}
                      className={`px-4 py-2 rounded-lg text-body-sm font-medium transition-all ${
                        selectedPreset === preset
                          ? 'bg-primary text-white shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]'
                          : 'neu-raised-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Reason Input */}
              <AnimatePresence>
                {selectedPreset === 'Other' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Input
                      label="Custom reason"
                      placeholder="Enter the reason for voiding this question..."
                      value={customReason}
                      onChange={(e) => handleCustomReasonChange(e.target.value)}
                      autoFocus
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--border)] px-6 py-4 flex justify-end gap-3">
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirm}
                disabled={!isValid}
                leftIcon={
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                }
              >
                Void Question
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default VoidQuestionModal;
