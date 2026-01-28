/**
 * Kick/Ban Modal - Modal for kicking or banning a participant
 * 
 * Allows the controller to kick or ban a participant with a reason.
 * - Kick: Disconnects participant and removes from active list
 * - Ban: Disconnects participant and blocks IP from rejoining
 * 
 * Requirements: 9.6, 9.7, 10.2, 10.3, 10.8
 */

'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Action type for the modal
 */
export type KickBanAction = 'kick' | 'ban';

/**
 * Kick/Ban modal props
 */
interface KickBanModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Callback when action is confirmed */
  onConfirm: (reason: string) => void;
  /** The action type (kick or ban) */
  action: KickBanAction;
  /** The participant's nickname */
  participantNickname: string;
  /** The participant's ID */
  participantId: string;
}

/**
 * Common reasons for kick/ban
 */
const KICK_REASONS = [
  'Cheating',
  'Inappropriate behavior',
  'Technical issues',
  'Requested by participant',
  'Other',
];

const BAN_REASONS = [
  'Cheating',
  'Inappropriate behavior',
  'Harassment',
  'Repeated violations',
  'Other',
];

/**
 * Kick/Ban Modal Component
 */
export function KickBanModal({
  isOpen,
  onClose,
  onConfirm,
  action,
  participantNickname,
  participantId,
}: KickBanModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');

  const reasons = action === 'kick' ? KICK_REASONS : BAN_REASONS;
  const isBan = action === 'ban';

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedPreset(null);
      setCustomReason('');
    }
  }, [isOpen]);

  // Handle close
  const handleClose = () => {
    setSelectedPreset(null);
    setCustomReason('');
    onClose();
  };

  // Handle preset selection
  const handlePresetSelect = (preset: string) => {
    setSelectedPreset(preset);
    if (preset !== 'Other') {
      setCustomReason('');
    }
  };

  // Handle confirm
  const handleConfirm = () => {
    const finalReason = selectedPreset === 'Other' ? customReason : selectedPreset;
    if (finalReason && finalReason.trim()) {
      onConfirm(finalReason.trim());
      handleClose();
    }
  };

  // Check if form is valid
  const isValid = selectedPreset === 'Other' 
    ? customReason.trim().length > 0 
    : selectedPreset !== null;

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
            <div className={`${isBan ? 'bg-error/10 border-error/20' : 'bg-warning/10 border-warning/20'} border-b px-6 py-4`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${isBan ? 'bg-error/10' : 'bg-warning/10'} flex items-center justify-center`}>
                  {isBan ? (
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
                  ) : (
                    <svg
                      className="w-5 h-5 text-warning"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"
                      />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="text-h3 font-semibold text-[var(--text-primary)]">
                    {isBan ? 'Ban Participant' : 'Kick Participant'}
                  </h3>
                  <p className="text-caption text-[var(--text-muted)]">
                    {isBan ? 'This will block them from rejoining' : 'They can rejoin with a new session'}
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Warning for ban */}
              {isBan && (
                <div className="bg-error/5 border border-error/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-error flex-shrink-0 mt-0.5"
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
                      <p className="text-body-sm font-medium text-error">
                        Banning this participant will:
                      </p>
                      <ul className="mt-1 text-caption text-[var(--text-secondary)] list-disc list-inside space-y-0.5">
                        <li>Immediately disconnect them</li>
                        <li>Block their IP from rejoining this session</li>
                        <li>Log the action for audit purposes</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Participant Info */}
              <div className="neu-pressed rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-body font-semibold text-primary">
                      {participantNickname.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-body font-medium text-[var(--text-primary)]">
                      {participantNickname}
                    </p>
                    <p className="text-caption text-[var(--text-muted)] font-mono">
                      ID: {participantId.slice(0, 8)}...
                    </p>
                  </div>
                </div>
              </div>

              {/* Reason Selection */}
              <div>
                <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-3">
                  Select a reason
                </label>
                <div className="flex flex-wrap gap-2">
                  {reasons.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => handlePresetSelect(preset)}
                      className={`px-4 py-2 rounded-lg text-body-sm font-medium transition-all ${
                        selectedPreset === preset
                          ? isBan
                            ? 'bg-error text-white shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]'
                            : 'bg-warning text-white shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]'
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
                      placeholder={`Enter the reason for ${isBan ? 'banning' : 'kicking'} this participant...`}
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
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
                variant={isBan ? 'danger' : 'primary'}
                onClick={handleConfirm}
                disabled={!isValid}
                leftIcon={
                  isBan ? (
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
                  ) : (
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
                        d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"
                      />
                    </svg>
                  )
                }
              >
                {isBan ? 'Ban Participant' : 'Kick Participant'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default KickBanModal;
