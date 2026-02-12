/**
 * CSV Importer Component
 * 
 * Provides a dialog for importing quiz questions from CSV files.
 * Features:
 * - File upload with .csv filter
 * - Preview table showing parsed questions with validation status
 * - Error display with column and row information
 * - Import Valid and Cancel buttons
 * 
 * Requirements: 1.1, 1.6, 1.7, 1.9
 */

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui';
import { 
  Modal, 
  ModalContent, 
  ModalHeader, 
  ModalTitle 
} from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { parseCSV, downloadTemplate, getValidQuestions, type ParsedQuestion, type ParseResult } from '@/lib/csv-parser';
import type { QuestionFormData } from './question-builder';

/**
 * CSV Importer Props
 */
export interface CSVImporterProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when questions are imported */
  onImport: (questions: QuestionFormData[]) => void;
  /** Number of existing questions in the quiz */
  existingQuestionCount: number;
}

/**
 * Icons
 */
function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/**
 * Question Preview Row Component
 */
function QuestionPreviewRow({ question, index }: { question: ParsedQuestion; index: number }) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <>
      <tr
        className={cn(
          'border-b border-[var(--border)] cursor-pointer transition-colors',
          question.isValid ? 'hover:bg-success/5' : 'hover:bg-error/5',
          !question.isValid && 'bg-error/5'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="px-4 py-3 text-body-sm text-[var(--text-secondary)]">
          {index + 1}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {question.isValid ? (
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-success/20 text-success">
                <CheckIcon />
              </span>
            ) : (
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-error/20 text-error">
                <XIcon />
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-body-sm text-[var(--text-primary)] max-w-[300px] truncate">
          {question.data.questionText || <span className="text-[var(--text-muted)] italic">No text</span>}
        </td>
        <td className="px-4 py-3 text-body-sm text-[var(--text-secondary)]">
          {question.data.questionType}
        </td>
        <td className="px-4 py-3 text-body-sm text-[var(--text-secondary)]">
          {question.data.options?.length || 0}
        </td>
        <td className="px-4 py-3 text-body-sm text-[var(--text-secondary)]">
          {question.data.timeLimit}s
        </td>
      </tr>
      <AnimatePresence>
        {isExpanded && question.errors.length > 0 && (
          <motion.tr
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <td colSpan={6} className="px-4 py-3 bg-error/5">
              <div className="space-y-1">
                {question.errors.map((error, i) => (
                  <p key={i} className="text-body-sm text-error">
                    <span className="font-medium">{error.column}:</span> {error.message}
                  </p>
                ))}
              </div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * CSV Importer Component
 */
export function CSVImporter({
  isOpen,
  onClose,
  onImport,
  existingQuestionCount,
}: CSVImporterProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [parseResult, setParseResult] = React.useState<ParseResult | null>(null);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Reset state when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setParseResult(null);
      setParseError(null);
    }
  }, [isOpen]);

  const handleFileSelect = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      setParseError('Please select a CSV file');
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setParseError('File size must be less than 5MB');
      return;
    }

    setFile(selectedFile);
    setParseError(null);

    try {
      const content = await selectedFile.text();
      const result = parseCSV(content);
      setParseResult(result);

      if (result.totalRows === 0) {
        setParseError('No questions found in the CSV file');
      }
    } catch (error) {
      setParseError('Failed to parse CSV file. Please check the format.');
      console.error('CSV parse error:', error);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleImport = () => {
    if (!parseResult) return;
    const validQuestions = getValidQuestions(parseResult.questions);
    onImport(validQuestions);
    onClose();
  };

  const handleDownloadTemplate = () => {
    downloadTemplate();
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContent size="lg">
        <ModalHeader>
          <ModalTitle>Import Questions from CSV</ModalTitle>
        </ModalHeader>
        <div className="space-y-6">
        {/* Download Template Link */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/10">
          <div className="flex items-center gap-3">
            <FileIcon />
            <div>
              <p className="text-body font-medium text-[var(--text-primary)]">
                Need a template?
              </p>
              <p className="text-body-sm text-[var(--text-secondary)]">
                Download our CSV template with example questions
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2"
          >
            <DownloadIcon />
            Download Template
          </Button>
        </div>

        {/* File Upload Area */}
        {!parseResult && (
          <div
            className={cn(
              'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors',
              isDragging ? 'border-primary bg-primary/5' : 'border-[var(--border)]',
              'hover:border-primary hover:bg-primary/5 cursor-pointer'
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileInputChange}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <UploadIcon />
              </div>
              <div>
                <p className="text-body font-medium text-[var(--text-primary)]">
                  Drop your CSV file here
                </p>
                <p className="text-body-sm text-[var(--text-secondary)] mt-1">
                  or click to browse
                </p>
              </div>
              <p className="text-body-sm text-[var(--text-muted)]">
                Maximum file size: 5MB
              </p>
            </div>
          </div>
        )}

        {/* Parse Error */}
        {parseError && (
          <div className="p-4 rounded-lg bg-error/10 border border-error/20">
            <p className="text-body-sm text-error">{parseError}</p>
          </div>
        )}

        {/* Parse Results */}
        {parseResult && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--neu-surface)]">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-body-sm text-[var(--text-muted)]">File</p>
                  <p className="text-body font-medium text-[var(--text-primary)]">{file?.name}</p>
                </div>
                <div>
                  <p className="text-body-sm text-[var(--text-muted)]">Total Rows</p>
                  <p className="text-body font-medium text-[var(--text-primary)]">{parseResult.totalRows}</p>
                </div>
                <div>
                  <p className="text-body-sm text-[var(--text-muted)]">Valid</p>
                  <p className="text-body font-medium text-success">{parseResult.validRows}</p>
                </div>
                <div>
                  <p className="text-body-sm text-[var(--text-muted)]">Invalid</p>
                  <p className="text-body font-medium text-error">{parseResult.invalidRows}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFile(null);
                  setParseResult(null);
                }}
              >
                Choose Different File
              </Button>
            </div>

            {/* Preview Table */}
            <div className="border border-[var(--border)] rounded-lg overflow-hidden">
              <div className="max-h-[400px] overflow-auto">
                <table className="w-full">
                  <thead className="bg-[var(--neu-surface)] sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-body-sm font-medium text-[var(--text-secondary)]">#</th>
                      <th className="px-4 py-3 text-left text-body-sm font-medium text-[var(--text-secondary)]">Status</th>
                      <th className="px-4 py-3 text-left text-body-sm font-medium text-[var(--text-secondary)]">Question</th>
                      <th className="px-4 py-3 text-left text-body-sm font-medium text-[var(--text-secondary)]">Type</th>
                      <th className="px-4 py-3 text-left text-body-sm font-medium text-[var(--text-secondary)]">Options</th>
                      <th className="px-4 py-3 text-left text-body-sm font-medium text-[var(--text-secondary)]">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.questions.map((question, index) => (
                      <QuestionPreviewRow key={index} question={question} index={index} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Import Info */}
            {parseResult.validRows > 0 && (
              <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                <p className="text-body-sm text-success">
                  {parseResult.validRows} question{parseResult.validRows !== 1 ? 's' : ''} will be imported.
                  {existingQuestionCount > 0 && (
                    <> They will be added after your existing {existingQuestionCount} question{existingQuestionCount !== 1 ? 's' : ''}.</>
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border)]">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={!parseResult || parseResult.validRows === 0}
          >
            Import {parseResult?.validRows || 0} Question{parseResult?.validRows !== 1 ? 's' : ''}
          </Button>
        </div>
        </div>
      </ModalContent>
    </Modal>
  );
}

export default CSVImporter;
