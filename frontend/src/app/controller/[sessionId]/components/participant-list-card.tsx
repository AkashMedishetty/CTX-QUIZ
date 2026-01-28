/**
 * Participant List Card - Real-time participant management interface
 * 
 * Displays a searchable, filterable list of participants with:
 * - Real-time connection status indicators
 * - Participant count display
 * - Search/filter functionality
 * - Kick and ban moderation actions
 * - Virtual scrolling for 500+ participants (using @tanstack/react-virtual)
 * 
 * Requirements: 10.2, 10.3, 10.4, 13.4, 13.5
 */

'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { ParticipantRow, ParticipantStatus } from './participant-row';
import { KickBanModal, KickBanAction } from './kick-ban-modal';

/**
 * Participant data structure
 */
export interface Participant {
  participantId: string;
  nickname: string;
  status: ParticipantStatus;
  score?: number;
  rank?: number;
  isEliminated?: boolean;
  lastSeen?: number;
}

/**
 * Filter options
 */
type FilterOption = 'all' | 'connected' | 'disconnected' | 'eliminated';

/**
 * Participant list card props
 */
interface ParticipantListCardProps {
  /** List of participants */
  participants: Participant[];
  /** Total participant count */
  participantCount: number;
  /** Callback when kick is confirmed */
  onKickParticipant: (participantId: string, reason: string) => void;
  /** Callback when ban is confirmed */
  onBanParticipant: (participantId: string, reason: string) => void;
  /** Whether actions are disabled */
  isDisabled?: boolean;
  /** Whether to show scores (during active quiz) */
  showScores?: boolean;
  /** Whether elimination mode is active */
  isEliminationMode?: boolean;
  /** Maximum height for the list (default: 400px) */
  maxHeight?: number;
}

/** Row height for virtual scrolling (in pixels) */
const ROW_HEIGHT = 72;

/** Overscan count - number of items to render outside visible area */
const OVERSCAN_COUNT = 5;

/**
 * Participant List Card Component
 */
export function ParticipantListCard({
  participants,
  participantCount,
  onKickParticipant,
  onBanParticipant,
  isDisabled = false,
  showScores = false,
  isEliminationMode = false,
  maxHeight = 400,
}: ParticipantListCardProps) {
  // Ref for virtual scroll container
  const parentRef = useRef<HTMLDivElement>(null);

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    action: KickBanAction;
    participantId: string;
    participantNickname: string;
  }>({
    isOpen: false,
    action: 'kick',
    participantId: '',
    participantNickname: '',
  });

  // Calculate stats
  const stats = useMemo(() => {
    const connected = participants.filter(p => p.status === 'connected').length;
    const disconnected = participants.filter(p => p.status === 'disconnected').length;
    const eliminated = participants.filter(p => p.isEliminated).length;
    
    return { connected, disconnected, eliminated };
  }, [participants]);

  // Filter and search participants
  const filteredParticipants = useMemo(() => {
    let result = [...participants];

    // Apply filter
    switch (filter) {
      case 'connected':
        result = result.filter(p => p.status === 'connected');
        break;
      case 'disconnected':
        result = result.filter(p => p.status === 'disconnected');
        break;
      case 'eliminated':
        result = result.filter(p => p.isEliminated);
        break;
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(p => 
        p.nickname.toLowerCase().includes(query) ||
        p.participantId.toLowerCase().includes(query)
      );
    }

    // Sort: connected first, then by score (if available), then alphabetically
    result.sort((a, b) => {
      // Connected participants first
      if (a.status !== b.status) {
        return a.status === 'connected' ? -1 : 1;
      }
      // Non-eliminated before eliminated
      if (a.isEliminated !== b.isEliminated) {
        return a.isEliminated ? 1 : -1;
      }
      // By score (descending) if available
      if (showScores && a.score !== undefined && b.score !== undefined) {
        return b.score - a.score;
      }
      // Alphabetically by nickname
      return a.nickname.localeCompare(b.nickname);
    });

    return result;
  }, [participants, filter, searchQuery, showScores]);

  // Virtual scrolling setup - only render visible items for performance with 500+ participants
  const rowVirtualizer = useVirtualizer({
    count: filteredParticipants.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN_COUNT,
  });

  // Handle kick click
  const handleKickClick = useCallback((participantId: string, nickname: string) => {
    setModalState({
      isOpen: true,
      action: 'kick',
      participantId,
      participantNickname: nickname,
    });
  }, []);

  // Handle ban click
  const handleBanClick = useCallback((participantId: string, nickname: string) => {
    setModalState({
      isOpen: true,
      action: 'ban',
      participantId,
      participantNickname: nickname,
    });
  }, []);

  // Handle modal close
  const handleModalClose = useCallback(() => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Handle modal confirm
  const handleModalConfirm = useCallback((reason: string) => {
    if (modalState.action === 'kick') {
      onKickParticipant(modalState.participantId, reason);
    } else {
      onBanParticipant(modalState.participantId, reason);
    }
  }, [modalState.action, modalState.participantId, onKickParticipant, onBanParticipant]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="neu-raised-lg rounded-xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-4">
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
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-h3 font-semibold text-[var(--text-primary)]">
                  Participants
                </h3>
                <p className="text-caption text-[var(--text-muted)]">
                  Manage quiz participants
                </p>
              </div>
            </div>

            {/* Participant Count Badge */}
            <motion.div
              key={participantCount}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10"
            >
              <svg
                className="w-4 h-4 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span className="text-body font-semibold text-primary">
                {participantCount}
              </span>
            </motion.div>
          </div>

          {/* Stats Row */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="text-caption font-medium text-success">
                {stats.connected} connected
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--text-muted)]/10">
              <span className="w-2 h-2 rounded-full bg-[var(--text-muted)]" />
              <span className="text-caption font-medium text-[var(--text-muted)]">
                {stats.disconnected} disconnected
              </span>
            </div>
            {isEliminationMode && stats.eliminated > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-error/10">
                <span className="w-2 h-2 rounded-full bg-error" />
                <span className="text-caption font-medium text-error">
                  {stats.eliminated} eliminated
                </span>
              </div>
            )}
          </div>

          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="flex-1">
              <Input
                placeholder="Search participants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="sm"
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
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                }
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-1 p-1 rounded-lg bg-[var(--neu-surface)]">
              {(['all', 'connected', 'disconnected'] as FilterOption[]).map((option) => (
                <button
                  key={option}
                  onClick={() => setFilter(option)}
                  className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all ${
                    filter === option
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
              {isEliminationMode && (
                <button
                  onClick={() => setFilter('eliminated')}
                  className={`px-3 py-1.5 rounded-md text-caption font-medium transition-all ${
                    filter === 'eliminated'
                      ? 'bg-error text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Eliminated
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Participant List - Virtualized for 500+ participants */}
        <div 
          ref={parentRef}
          className="overflow-y-auto"
          style={{ maxHeight: `${maxHeight}px` }}
        >
          {filteredParticipants.length > 0 ? (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const participant = filteredParticipants[virtualRow.index];
                return (
                  <div
                    key={participant.participantId}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <ParticipantRow
                      participantId={participant.participantId}
                      nickname={participant.nickname}
                      status={participant.status}
                      score={showScores ? participant.score : undefined}
                      rank={showScores ? virtualRow.index + 1 : undefined}
                      isEliminated={participant.isEliminated}
                      lastSeen={participant.lastSeen}
                      onKick={handleKickClick}
                      onBan={handleBanClick}
                      isDisabled={isDisabled}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12 px-6"
            >
              <div className="w-16 h-16 rounded-full bg-[var(--neu-surface)] flex items-center justify-center mb-4">
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
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <p className="text-body text-[var(--text-secondary)] text-center">
                {searchQuery || filter !== 'all'
                  ? 'No participants match your search or filter'
                  : 'No participants have joined yet'}
              </p>
              {(searchQuery || filter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFilter('all');
                  }}
                  className="mt-3 text-body-sm text-primary hover:underline"
                >
                  Clear filters
                </button>
              )}
            </motion.div>
          )}
        </div>

        {/* Footer with count */}
        {filteredParticipants.length > 0 && (
          <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--neu-surface)]">
            <p className="text-caption text-[var(--text-muted)]">
              Showing {filteredParticipants.length} of {participants.length} participants
              {searchQuery && ` matching "${searchQuery}"`}
            </p>
          </div>
        )}
      </motion.div>

      {/* Kick/Ban Modal */}
      <KickBanModal
        isOpen={modalState.isOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        action={modalState.action}
        participantNickname={modalState.participantNickname}
        participantId={modalState.participantId}
      />
    </>
  );
}

export default ParticipantListCard;
