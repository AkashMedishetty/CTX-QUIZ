/**
 * Performance Export Card Component
 * 
 * Provides functionality to export performance metrics as CSV or JSON.
 * Features:
 * - Export metrics in CSV format
 * - Export metrics in JSON format
 * - Include latency, throughput, error rates
 * - Timestamp in filename
 * - Preview of export data
 * 
 * Requirements: 15.9
 */

'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { LoadTester, PerformanceExportData } from '@/lib/load-tester';

/**
 * Props for PerformanceExportCard
 */
interface PerformanceExportCardProps {
  /** LoadTester instance to export data from */
  loadTester: LoadTester;
  /** Whether a test is currently running */
  isRunning: boolean;
  /** Whether there is data available to export */
  hasData: boolean;
}

/**
 * Export format type
 */
type ExportFormat = 'json' | 'csv';

/**
 * Generate filename with timestamp
 */
function generateFilename(format: ExportFormat): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `performance-metrics-${timestamp}.${format}`;
}

/**
 * Trigger file download
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format number with appropriate precision
 */
function formatNumber(value: number | null, decimals: number = 2): string {
  if (value === null) return 'N/A';
  return value.toFixed(decimals);
}

/**
 * Format percentage
 */
function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Metric preview row component
 */
function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[var(--neu-shadow-dark)]/5 last:border-0">
      <span className="text-body-sm text-[var(--text-muted)]">{label}</span>
      <span className="text-body-sm font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

/**
 * Export button component
 */
function ExportButton({
  format,
  onClick,
  disabled,
  isExporting,
}: {
  format: ExportFormat;
  onClick: () => void;
  disabled: boolean;
  isExporting: boolean;
}) {
  const isJSON = format === 'json';
  
  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.02 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      onClick={onClick}
      disabled={disabled || isExporting}
      className={cn(
        'flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg',
        'font-medium text-body transition-all duration-fast',
        disabled
          ? 'bg-[var(--neu-surface)] text-[var(--text-muted)] cursor-not-allowed'
          : isJSON
            ? 'neu-raised bg-info/10 text-info hover:bg-info/20'
            : 'neu-raised bg-success/10 text-success hover:bg-success/20'
      )}
    >
      {isExporting ? (
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      )}
      <span>Export {format.toUpperCase()}</span>
    </motion.button>
  );
}

/**
 * Performance Export Card Component
 */
export function PerformanceExportCard({
  loadTester,
  isRunning,
  hasData,
}: PerformanceExportCardProps) {
  const [isExportingJSON, setIsExportingJSON] = React.useState(false);
  const [isExportingCSV, setIsExportingCSV] = React.useState(false);
  const [lastExport, setLastExport] = React.useState<{ format: ExportFormat; time: Date } | null>(null);
  const [previewData, setPreviewData] = React.useState<PerformanceExportData | null>(null);

  // Update preview data periodically when running
  React.useEffect(() => {
    if (!hasData) {
      setPreviewData(null);
      return undefined;
    }

    const updatePreview = () => {
      try {
        const data = loadTester.getExportData();
        setPreviewData(data);
      } catch {
        // Ignore errors during preview update
      }
    };

    updatePreview();
    
    if (isRunning) {
      const interval = setInterval(updatePreview, 1000);
      return () => clearInterval(interval);
    }
    
    return undefined;
  }, [loadTester, hasData, isRunning]);

  /**
   * Handle JSON export
   */
  const handleExportJSON = React.useCallback(async () => {
    setIsExportingJSON(true);
    try {
      const content = loadTester.exportMetricsAsJSON();
      const filename = generateFilename('json');
      downloadFile(content, filename, 'application/json');
      setLastExport({ format: 'json', time: new Date() });
    } catch (error) {
      console.error('Failed to export JSON:', error);
    } finally {
      setIsExportingJSON(false);
    }
  }, [loadTester]);

  /**
   * Handle CSV export
   */
  const handleExportCSV = React.useCallback(async () => {
    setIsExportingCSV(true);
    try {
      const content = loadTester.exportMetricsAsCSV();
      const filename = generateFilename('csv');
      downloadFile(content, filename, 'text/csv');
      setLastExport({ format: 'csv', time: new Date() });
    } catch (error) {
      console.error('Failed to export CSV:', error);
    } finally {
      setIsExportingCSV(false);
    }
  }, [loadTester]);

  const canExport = hasData && !isExportingJSON && !isExportingCSV;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
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
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
              Performance Export
            </h2>
            <p className="text-body-sm text-[var(--text-muted)]">
              Export metrics for analysis
            </p>
          </div>
        </div>
        {isRunning && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-body-sm text-success">Live</span>
          </div>
        )}
      </div>

      {hasData && previewData ? (
        <>
          {/* Metrics Preview */}
          <div className="mb-6 space-y-4">
            {/* Latency Section */}
            <div className="p-4 rounded-lg bg-[var(--neu-surface)] neu-pressed">
              <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Latency
              </h3>
              <MetricRow label="Average" value={`${formatNumber(previewData.latency.averageMs)} ms`} />
              <MetricRow label="P95" value={`${formatNumber(previewData.latency.p95Ms)} ms`} />
              <MetricRow label="P99" value={`${formatNumber(previewData.latency.p99Ms)} ms`} />
            </div>

            {/* Throughput Section */}
            <div className="p-4 rounded-lg bg-[var(--neu-surface)] neu-pressed">
              <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Throughput
              </h3>
              <MetricRow 
                label="Answers/sec" 
                value={formatNumber(previewData.throughput.answersPerSecond)} 
              />
              <MetricRow 
                label="Joins/sec" 
                value={formatNumber(previewData.throughput.joinsPerSecond)} 
              />
            </div>

            {/* Error Rates Section */}
            <div className="p-4 rounded-lg bg-[var(--neu-surface)] neu-pressed">
              <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Error Rates
              </h3>
              <MetricRow 
                label="Join Failures" 
                value={formatPercentage(previewData.errorRates.joinFailureRate)} 
              />
              <MetricRow 
                label="Disconnections" 
                value={formatPercentage(previewData.errorRates.disconnectionRate)} 
              />
              <MetricRow 
                label="Total Errors" 
                value={previewData.errorRates.totalErrors.toString()} 
              />
            </div>

            {/* Summary Stats */}
            <div className="p-4 rounded-lg bg-[var(--neu-surface)] neu-pressed">
              <h3 className="text-body-sm font-medium text-[var(--text-secondary)] mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Summary
              </h3>
              <MetricRow 
                label="Total Participants" 
                value={previewData.summary.totalParticipants.toString()} 
              />
              <MetricRow 
                label="Connected" 
                value={previewData.summary.connectedCount.toString()} 
              />
              <MetricRow 
                label="Answers Submitted" 
                value={previewData.summary.totalAnswersSubmitted.toString()} 
              />
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex gap-3">
            <ExportButton
              format="json"
              onClick={handleExportJSON}
              disabled={!canExport}
              isExporting={isExportingJSON}
            />
            <ExportButton
              format="csv"
              onClick={handleExportCSV}
              disabled={!canExport}
              isExporting={isExportingCSV}
            />
          </div>

          {/* Last Export Info */}
          {lastExport && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 pt-4 border-t border-[var(--neu-shadow-dark)]/10"
            >
              <p className="text-caption text-[var(--text-muted)] text-center">
                Last exported: {lastExport.format.toUpperCase()} at{' '}
                {lastExport.time.toLocaleTimeString()}
              </p>
            </motion.div>
          )}

          {/* Export Info */}
          <div className="mt-4 pt-4 border-t border-[var(--neu-shadow-dark)]/10">
            <p className="text-caption text-[var(--text-muted)] text-center">
              Export includes {previewData.latencyHistory.length} latency samples and{' '}
              {previewData.driftHistory.length} drift measurements
            </p>
          </div>
        </>
      ) : (
        /* Empty State */
        <div className="py-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--neu-surface)] neu-pressed flex items-center justify-center">
            <svg
              className="w-8 h-8 text-[var(--text-muted)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="text-body text-[var(--text-muted)] mb-2">
            No data to export
          </p>
          <p className="text-body-sm text-[var(--text-muted)]">
            Start a load test to collect performance metrics
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default PerformanceExportCard;
