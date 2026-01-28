/**
 * Reset Timer Modal - Modal for resetting the timer with a new time limit
 * 
 * Allows the controller to reset the current question timer with:
 * - Preset time options (15s, 30s, 45s, 60s, 90s, 120s)
 * - Custom time input
 * - Validation for time limits (5-120 seconds)
 * 
 * Requirements: 10.6, 13.6
 */

'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Reset timer modal props
 */
interface ResetTimerModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Callback when reset is confirmed */
  onConfirm: (newTimeLimit: number) => void;
  /** Current time limit for reference */
  currentTimeLimit: number;
}

/**
 * Preset time options in seconds
 */
const PRESET_TIMES = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 45, label: '45s' },
  { value: 60, label: '1 min' },
  { value: 90, label: '1:30' },
  { value: 120, label: '2 min' },
];

/**
 * Min and max time limits
 */
const MIN_TIME = 5;
const MAX_TIME = 120;

/**
 * Reset Timer Modal Component
 */
export function ResetTimerModal({
  isOpen,
  onClose,
  onConfirm,
  currentTimeLimit,
}: ResetTimerModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customTime, setCustomTime] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      // Try to match current time limit to a preset
      const matchingPreset = PRESET_TIMES.find(p => p.value === currentTimeLimit);
      if (matchingPreset) {
        setSelectedPreset(matchingPreset.value);
        setUseCustom(false);
      } else {
        setSelectedPreset(null);
        setCustomTime(currentTimeLimit.toString());
        setUseCustom(true);
      }
      setError(null);
    }
  }, [isOpen, currentTimeLimit]);

  // Handle preset selection
  const handlePresetSelect = (value: number) => {
    setSelectedPreset(value);
    setUseCustom(false);
    setError(null);
  };

  // Handle custom time toggle
  const handleCustomToggle = () => {
    setUseCustom(true);
    setSelectedPreset(null);
    setCustomTime('');
    setError(null);
  };

  // Handle custom time change
  const handleCustomTimeChange = (value: string) => {
    // Only allow numbers
    const numericValue = value.replace(/[^0-9]/g, '');
    setCustomTime(numericValue);
    setError(null);
  };

  // Validate and get final time value
  const getTimeValue = (): number | null => {
    if (useCustom) {
      const time = parseInt(customTime, 10);
      if (isNaN(time)) {
        setError('Please enter a valid number');
        return null;
      }
      if (time < MIN_TIME) {
        setError(`Minimum time is ${MIN_TIME} seconds`);
        return null;
      }
      if (time > MAX_TIME) {
        setError(`Maximum time is ${MAX_TIME} seconds`);
        return null;
      }
      return time;
    }
    return selectedPreset;
  };

  // Handle confirm
  const handleConfirm = () => {
    const timeValue = getTimeValue();
    if (timeValue !== null) {
      onConfirm(timeValue);
      handleClose();
    }
  };

  // Handle close
  const handleClose = () => {
    setSelectedPreset(null);
    setCustomTime('');
    setUseCustom(false);
    setError(null);
    onClose();
  };

  // Check if form is valid
  const isValid = useCustom 
    ? customTime.length > 0 && !error 
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
            className="relative z-10 w-full max-w-md mx-4 neu-raised-lg rounded-xl bg-[var(--neu-bg)] overflow-hidden"
          >
            {/* Header */}
            <div className="bg-primary/5 border-b border-[var(--border)] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-h3 font-semibold text-[var(--text-primary)]">
                    Reset Timer
                  </h3>
                  <p className="text-caption text-[var(--text-muted)]">
                    Set a new time limit for this question
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Current Time Info */}
              <div className="neu-pressed rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="text-caption text-[var(--text-muted)]">Current Time Limit</p>
                  <p className="text-h3 font-bold text-[var(--text-primary)]">
                    {currentTimeLimit} seconds
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>

              {/* Preset Time Options */}
              <div>
                <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-3">
                  Select new time limit
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_TIMES.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => handlePresetSelect(preset.value)}
                      className={`px-4 py-3 rounded-lg text-body font-medium transition-all ${
                        selectedPreset === preset.value && !useCustom
                          ? 'bg-primary text-white shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]'
                          : 'neu-raised-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Time Option */}
              <div>
                <button
                  onClick={handleCustomToggle}
                  className={`w-full px-4 py-3 rounded-lg text-body font-medium transition-all text-left flex items-center justify-between ${
                    useCustom
                      ? 'bg-primary/10 text-primary border-2 border-primary'
                      : 'neu-raised-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span>Custom time</span>
                  <svg
                    className={`w-5 h-5 transition-transform ${useCustom ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {/* Custom Time Input */}
                <AnimatePresence>
                  {useCustom && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mt-3"
                    >
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Enter time in seconds (5-120)"
                        value={customTime}
                        onChange={(e) => handleCustomTimeChange(e.target.value)}
                        error={error || undefined}
                        helperText={`Enter a value between ${MIN_TIME} and ${MAX_TIME} seconds`}
                        autoFocus
                        rightIcon={
                          <span className="text-body-sm text-[var(--text-muted)]">sec</span>
                        }
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Info Note */}
              <div className="bg-info/5 border border-info/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-info flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <p className="text-body-sm text-[var(--text-secondary)]">
                      Resetting the timer will restart the countdown from the new time limit. 
                      All participants will see the updated timer.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--border)] px-6 py-4 flex justify-end gap-3">
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                }
              >
                Reset Timer
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default ResetTimerModal;
