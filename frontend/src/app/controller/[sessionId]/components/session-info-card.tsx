/**
 * Session Info Card - Displays session information for the controller
 * 
 * Shows:
 * - Join code (large, copyable)
 * - Participant count
 * - Session state
 * - System metrics (connections, latency)
 * - Neumorphic design
 * 
 * Requirements: 13.4, 13.9
 */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SessionState } from '@/lib/socket-client';
import { SystemMetrics } from '@/hooks/useControllerSocket';

interface SessionInfoCardProps {
  /** Session ID */
  sessionId: string;
  /** Join code for participants */
  joinCode: string;
  /** Number of connected participants */
  participantCount: number;
  /** Current session state */
  sessionState: SessionState;
  /** System metrics */
  systemMetrics: SystemMetrics | null;
  /** Whether late joiners are allowed */
  allowLateJoiners?: boolean;
  /** Callback to toggle late joiners */
  onToggleLateJoiners?: (allow: boolean) => void;
  /** Callback to export session data */
  onExportData?: (format: 'json' | 'csv') => void;
}

/**
 * Get state badge configuration
 */
function getStateBadgeConfig(state: SessionState) {
  switch (state) {
    case 'LOBBY':
      return {
        text: 'Lobby',
        bgColor: 'bg-info/10',
        textColor: 'text-info',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
      };
    case 'ACTIVE_QUESTION':
      return {
        text: 'Active',
        bgColor: 'bg-success/10',
        textColor: 'text-success',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      };
    case 'REVEAL':
      return {
        text: 'Reveal',
        bgColor: 'bg-warning/10',
        textColor: 'text-warning',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        ),
      };
    case 'ENDED':
      return {
        text: 'Ended',
        bgColor: 'bg-[var(--text-muted)]/10',
        textColor: 'text-[var(--text-muted)]',
        icon: (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      };
    default:
      return {
        text: 'Unknown',
        bgColor: 'bg-[var(--text-muted)]/10',
        textColor: 'text-[var(--text-muted)]',
        icon: null,
      };
  }
}

/**
 * Session Info Card Component
 */
export function SessionInfoCard({
  sessionId,
  joinCode,
  participantCount,
  sessionState,
  systemMetrics,
  allowLateJoiners = true,
  onToggleLateJoiners,
  onExportData,
}: SessionInfoCardProps) {
  const [copied, setCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const stateBadge = getStateBadgeConfig(sessionState);

  // Copy join code to clipboard
  const handleCopyJoinCode = async () => {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy join code:', err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neu-raised-lg rounded-xl p-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        {/* Left Section - Join Code */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-h3 font-semibold text-[var(--text-primary)]">
              Session Info
            </h2>
            
            {/* State Badge */}
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${stateBadge.bgColor}`}>
              {stateBadge.icon}
              <span className={`text-body-sm font-medium ${stateBadge.textColor}`}>
                {stateBadge.text}
              </span>
            </div>
          </div>

          {/* Join Code Display */}
          <div className="flex items-center gap-4">
            <div className="neu-pressed rounded-lg px-6 py-4">
              <p className="text-caption text-[var(--text-muted)] mb-1">Join Code</p>
              <p className="font-mono text-display font-bold text-primary tracking-wider">
                {joinCode}
              </p>
            </div>

            {/* Copy Button */}
            <motion.button
              onClick={handleCopyJoinCode}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-3 rounded-md neu-raised-sm hover:shadow-neu-flat transition-shadow"
            >
              <AnimatePresence mode="wait">
                {copied ? (
                  <motion.svg
                    key="check"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="w-5 h-5 text-success"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </motion.svg>
                ) : (
                  <motion.svg
                    key="copy"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="w-5 h-5 text-[var(--text-secondary)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </motion.svg>
                )}
              </AnimatePresence>
              <span className="text-body-sm font-medium text-[var(--text-secondary)]">
                {copied ? 'Copied!' : 'Copy'}
              </span>
            </motion.button>
          </div>
        </div>

        {/* Right Section - Stats */}
        <div className="flex flex-wrap gap-4">
          {/* Participant Count */}
          <div className="neu-pressed rounded-lg px-5 py-4 min-w-[120px]">
            <div className="flex items-center gap-2 mb-1">
              <svg
                className="w-4 h-4 text-[var(--text-muted)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p className="text-caption text-[var(--text-muted)]">Participants</p>
            </div>
            <motion.p
              key={participantCount}
              initial={{ scale: 1.2, color: 'var(--primary)' }}
              animate={{ scale: 1, color: 'var(--text-primary)' }}
              className="text-h2 font-bold"
            >
              {participantCount}
            </motion.p>
          </div>

          {/* Active Connections */}
          {systemMetrics && (
            <div className="neu-pressed rounded-lg px-5 py-4 min-w-[120px]">
              <div className="flex items-center gap-2 mb-1">
                <svg
                  className="w-4 h-4 text-[var(--text-muted)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
                <p className="text-caption text-[var(--text-muted)]">Connections</p>
              </div>
              <p className="text-h2 font-bold text-[var(--text-primary)]">
                {systemMetrics.activeConnections}
              </p>
            </div>
          )}

          {/* Latency */}
          {systemMetrics && (
            <div className="neu-pressed rounded-lg px-5 py-4 min-w-[120px]">
              <div className="flex items-center gap-2 mb-1">
                <svg
                  className="w-4 h-4 text-[var(--text-muted)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <p className="text-caption text-[var(--text-muted)]">Latency</p>
              </div>
              <p className={`text-h2 font-bold ${
                systemMetrics.averageLatency > 200 
                  ? 'text-error' 
                  : systemMetrics.averageLatency > 100 
                    ? 'text-warning' 
                    : 'text-success'
              }`}>
                {Math.round(systemMetrics.averageLatency)}
                <span className="text-body-sm font-normal text-[var(--text-muted)]">ms</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Late Joiners Toggle and Session ID */}
      <div className="mt-4 pt-4 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-4">
        <p className="text-caption text-[var(--text-muted)]">
          Session ID: <span className="font-mono">{sessionId}</span>
        </p>
        
        <div className="flex items-center gap-4">
          {/* Export Button */}
          {onExportData && (
            <div className="relative">
              <motion.button
                onClick={() => setShowExportMenu(!showExportMenu)}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-3 py-2 rounded-md neu-raised-sm hover:shadow-none transition-shadow text-body-sm font-medium text-[var(--text-secondary)]"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </motion.button>
              
              <AnimatePresence>
                {showExportMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 w-36 rounded-md neu-raised-sm bg-[var(--neu-bg)] z-10 overflow-hidden"
                  >
                    <button
                      onClick={() => {
                        onExportData('json');
                        setShowExportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-body-sm hover:bg-[var(--shadow-light)] transition-colors"
                    >
                      Export as JSON
                    </button>
                    <button
                      onClick={() => {
                        onExportData('csv');
                        setShowExportMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-body-sm hover:bg-[var(--shadow-light)] transition-colors"
                    >
                      Export as CSV
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          
          {/* Late Joiners Toggle */}
          {onToggleLateJoiners && (
            <div className="flex items-center gap-3">
              <span className="text-body-sm text-[var(--text-secondary)]">
                Allow Late Joiners
              </span>
              <motion.button
                onClick={() => onToggleLateJoiners(!allowLateJoiners)}
                whileTap={{ scale: 0.95 }}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  allowLateJoiners 
                    ? 'bg-success' 
                    : 'bg-[var(--text-muted)]/30'
                }`}
              >
                <motion.div
                  animate={{ x: allowLateJoiners ? 24 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md"
                />
              </motion.button>
              <span className={`text-caption ${allowLateJoiners ? 'text-success' : 'text-[var(--text-muted)]'}`}>
                {allowLateJoiners ? 'On' : 'Off'}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default SessionInfoCard;
