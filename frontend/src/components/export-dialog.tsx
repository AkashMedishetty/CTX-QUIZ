/**
 * Export Dialog Component
 * 
 * Provides a dialog for exporting quiz session results.
 * Features:
 * - Format selection (CSV/JSON)
 * - Export button with loading state
 * - Download trigger on successful export
 * 
 * Requirements: 4.3, 4.5
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui';
import { 
  Modal, 
  ModalContent, 
  ModalHeader, 
  ModalTitle 
} from '@/components/ui/modal';
import { cn } from '@/lib/utils';

/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'json';

/**
 * Export Dialog Props
 */
export interface ExportDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Session ID to export */
  sessionId: string;
  /** Quiz title for filename */
  quizTitle: string;
  /** Export function */
  onExport: (sessionId: string, format: ExportFormat) => Promise<Blob>;
}

/**
 * Icons
 */
function FileTextIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/**
 * Format Option Component
 */
function FormatOption({
  format,
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  format: ExportFormat;
  selected: boolean;
  onSelect: (format: ExportFormat) => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(format)}
      className={cn(
        'flex items-start gap-4 p-4 rounded-lg text-left transition-all duration-fast w-full',
        selected
          ? 'bg-primary/10 border-2 border-primary shadow-[inset_2px_2px_4px_var(--shadow-dark),inset_-2px_-2px_4px_var(--shadow-light)]'
          : 'bg-[var(--neu-bg)] border-2 border-transparent shadow-[4px_4px_8px_var(--shadow-dark),-4px_-4px_8px_var(--shadow-light)] hover:shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)]'
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center',
          selected ? 'bg-primary text-white' : 'bg-[var(--neu-surface)] text-[var(--text-muted)]'
        )}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('font-semibold', selected ? 'text-primary' : 'text-[var(--text-primary)]')}>
            {title}
          </span>
          {selected && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </motion.span>
          )}
        </div>
        <p className="text-body-sm text-[var(--text-muted)] mt-1">{description}</p>
      </div>
    </button>
  );
}

/**
 * Export Dialog Component
 */
export function ExportDialog({
  isOpen,
  onClose,
  sessionId,
  quizTitle,
  onExport,
}: ExportDialogProps) {
  const [format, setFormat] = React.useState<ExportFormat>('csv');
  const [isExporting, setIsExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setFormat('csv');
      setError(null);
    }
  }, [isOpen]);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const blob = await onExport(sessionId, format);
      
      // Generate filename
      const sanitizedTitle = quizTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
      const date = new Date().toISOString().split('T')[0];
      const filename = `${sanitizedTitle}_results_${date}.${format}`;

      // Trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>Export Results</ModalTitle>
        </ModalHeader>
        <div className="space-y-6">
          {/* Format Selection */}
          <div>
            <label className="block text-body-sm font-medium text-[var(--text-primary)] mb-3">
              Select Export Format
            </label>
            <div className="space-y-3">
              <FormatOption
                format="csv"
                selected={format === 'csv'}
                onSelect={setFormat}
                icon={<FileTextIcon />}
                title="CSV (Spreadsheet)"
                description="Best for Excel, Google Sheets, or data analysis tools"
              />
              <FormatOption
                format="json"
                selected={format === 'json'}
                onSelect={setFormat}
                icon={<CodeIcon />}
                title="JSON (Data)"
                description="Best for developers or importing into other systems"
              />
            </div>
          </div>

          {/* Export Info */}
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-body-sm text-[var(--text-secondary)]">
              The export will include:
            </p>
            <ul className="mt-2 space-y-1 text-body-sm text-[var(--text-muted)]">
              <li>• Final leaderboard with scores, accuracy, and rankings</li>
              <li>• Every answer from every participant (with question text and correct answers)</li>
              <li>• Response times, speed bonuses, streak bonuses, and negative deductions</li>
              <li>• Questions summary with correct answers</li>
              <li>• Audit logs (focus events, disconnections, kicks, bans)</li>
              <li>• Exam mode settings if applicable</li>
            </ul>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-lg bg-error/10 border border-error/20">
              <p className="text-body-sm text-error">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border)]">
            <Button variant="secondary" onClick={onClose} disabled={isExporting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleExport}
              isLoading={isExporting}
              leftIcon={<DownloadIcon />}
            >
              Export {format.toUpperCase()}
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}

export default ExportDialog;
